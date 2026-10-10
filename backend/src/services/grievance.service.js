const { randomBytes } = require('node:crypto');
const { pool } = require('../config/database');
const { recordAudit } = require('./audit.service');
const httpError = require('../utils/httpError');
const { classify } = require('./classification.service');
const { transitionStatus } = require('./status.service');
const env = require('../config/env');

function makeTrackingId() {
  return `CPG-${new Date().getUTCFullYear()}-${randomBytes(18).toString('hex').toUpperCase()}`;
}

async function createGrievance(input, user, requestId, attachments = []) {
  const departmentResult = await pool.query(
    'SELECT id, code, name FROM departments WHERE is_active = TRUE ORDER BY name'
  );
  const classification = await classify(input, departmentResult.rows);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO grievances
        (tracking_id, citizen_id, subject, description, citizen_category, location, due_at,
         affected_people_estimate, ongoing_incident)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, now() + ($7 * interval '1 hour'), $8, $9)
       RETURNING id, tracking_id, subject, description, citizen_category, location,
                 status, priority, created_at`,
      [
        makeTrackingId(),
        user.id,
        input.subject,
        input.description,
        input.category || null,
        input.location ? JSON.stringify(input.location) : null,
        env.GRIEVANCE_DUE_HOURS,
        input.affectedPeople || 1,
        input.ongoingIncident || false
      ]
    );
    const grievance = result.rows[0];
    const attachmentResults = [];
    for (const attachment of attachments) {
      const saved = await client.query(
        `INSERT INTO grievance_attachments
          (grievance_id, original_name, storage_name, storage_path, mime_type, size_bytes, sha256)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, original_name, mime_type, size_bytes, created_at`,
        [
          grievance.id,
          attachment.originalName,
          attachment.storageName,
          attachment.storagePath,
          attachment.mimeType,
          attachment.sizeBytes,
          attachment.sha256
        ]
      );
      attachmentResults.push(saved.rows[0]);
    }
    const systemActor = { id: null, role: 'system', departmentIds: [] };
    await client.query(
      `INSERT INTO grievance_status_history
        (grievance_id, previous_status, new_status, actor_user_id, explanation)
       VALUES ($1, NULL, 'submitted', $2, 'Grievance submitted')`,
      [grievance.id, user.id]
    );
    await recordAudit(client, {
      actorUserId: user.id,
      action: 'grievance.submitted',
      entityType: 'grievance',
      entityId: grievance.id,
      changes: { status: 'submitted' },
      requestId
    });
    const status = { ...grievance, citizen_id: user.id, status: 'submitted' };
    await transitionStatus(client, status, 'under_review', systemActor, 'Automatic classification started.', requestId);
    status.status = 'under_review';
    await transitionStatus(client, status, 'classified', systemActor, classification.explanation, requestId);
    status.status = 'classified';
    const classificationResult = await client.query(
      `INSERT INTO grievance_classifications
        (grievance_id, primary_department_id, secondary_department_ids, predicted_category,
         urgency, confidence, explanation, suggested_keywords, requires_human_review, method, provider)
       VALUES ($1, $2, $3::uuid[], $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        grievance.id,
        classification.primaryDepartmentId,
        classification.secondaryDepartmentIds,
        classification.predictedCategory,
        classification.urgency,
        classification.confidence,
        classification.explanation,
        classification.suggestedKeywords,
        classification.requiresHumanReview,
        classification.method,
        classification.provider
      ]
    );
    await recordAudit(client, {
      action: 'grievance.classified',
      entityType: 'grievance',
      entityId: grievance.id,
      changes: {
        method: classification.method,
        confidence: classification.confidence,
        requiresHumanReview: classification.requiresHumanReview
      },
      requestId
    });

    let routing = null;
    if (classification.primaryDepartmentId && !classification.requiresHumanReview) {
      const targets = [
        { id: classification.primaryDepartmentId, reason: `Primary department selected by classification: ${classification.explanation}` },
        ...classification.secondaryDepartmentIds.map((id) => ({
          id,
          reason: classification.secondaryDepartmentReasons.find((entry) => entry.departmentId === id)?.reason
            || `Secondary department selected by classification: ${classification.explanation}`
        }))
      ];
      for (const target of targets) {
        await client.query(
          `INSERT INTO grievance_department_assignments
             (grievance_id, department_id, assigned_by, reason, status)
           VALUES ($1, $2, NULL, $3, 'active')`,
          [grievance.id, target.id, target.reason]
        );
      }
      await client.query(
        `INSERT INTO grievance_routes
          (grievance_id, classification_id, routing_method, confidence, explanation, selected_department_ids)
         VALUES ($1, $2, $3, $4, $5, $6::uuid[])`,
        [
          grievance.id,
          classificationResult.rows[0].id,
          classification.method,
          classification.confidence,
          targets.map((target) => target.reason).join(' '),
          targets.map((target) => target.id)
        ]
      );
      await transitionStatus(client, status, 'assigned', systemActor, 'Automatically routed with sufficient classification confidence.', requestId);
      status.status = 'assigned';
      routing = targets;
      await recordAudit(client, {
        action: 'grievance.routed',
        entityType: 'grievance',
        entityId: grievance.id,
        changes: { departments: targets.map(({ id, reason }) => ({ id, reason })) },
        requestId
      });
    }
    await client.query('COMMIT');
    return {
      ...grievance,
      status: status.status,
      attachments: attachmentResults,
      classification: {
        ...classificationResult.rows[0],
        fallback: classification.method === 'rules'
      },
      routing
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function accessClause(user, values) {
  if (user.role === 'administrator') {
    return '';
  }
  values.push(user.id);
  if (user.role === 'citizen') {
    return ` AND g.citizen_id = $${values.length}`;
  }
  values.push(user.departmentIds);
  return ` AND EXISTS (
    SELECT 1 FROM grievance_department_assignments a
    WHERE a.grievance_id = g.id AND a.status = 'active'
      AND a.department_id = ANY($${values.length}::uuid[])
  )`;
}

async function listGrievances(user, filters) {
  const values = [];
  const conditions = [];
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`g.status = $${values.length}`);
  }
  if (filters.priority) {
    values.push(filters.priority);
    conditions.push(`g.priority = $${values.length}`);
  }
  if (filters.search) {
    values.push(`%${filters.search}%`);
    conditions.push(`(g.subject ILIKE $${values.length} OR g.description ILIKE $${values.length})`);
  }
  const access = accessClause(user, values);
  const where = [...conditions.map((condition) => `(${condition})`), access.slice(5)]
    .filter(Boolean).join(' AND ');
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const offset = (page - 1) * limit;
  const sortColumn = {
    created_at: 'g.created_at',
    updated_at: 'g.updated_at',
    priority: "CASE g.priority WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END"
  }[filters.sortBy || 'created_at'];
  const sortOrder = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';
  values.push(limit, offset);
  const result = await pool.query(
    `SELECT g.id, g.tracking_id, g.subject, g.status, g.priority, g.created_at, g.updated_at
     FROM grievances g ${where ? `WHERE ${where}` : ''}
     ORDER BY ${sortColumn} ${sortOrder}, g.created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  return { data: result.rows, page, limit };
}

async function findAccessibleGrievance(id, user) {
  const values = [id];
  const access = accessClause(user, values);
  const result = await pool.query(
    `SELECT g.id, g.tracking_id, g.citizen_id, g.subject, g.description, g.citizen_category,
            g.location, g.status, g.priority, g.priority_reason, g.created_at, g.updated_at
     FROM grievances g WHERE g.id = $1${access}`,
    values
  );
  if (!result.rows[0]) {
    throw httpError(404, 'GRIEVANCE_NOT_FOUND', 'Grievance not found.');
  }
  return result.rows[0];
}

async function updateGrievance(id, input, user, requestId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const owned = await client.query(
      `SELECT id, status FROM grievances WHERE id = $1 AND citizen_id = $2 FOR UPDATE`,
      [id, user.id]
    );
    if (!owned.rows[0]) {
      throw httpError(404, 'GRIEVANCE_NOT_FOUND', 'Grievance not found.');
    }
    if (owned.rows[0].status !== 'submitted') {
      throw httpError(409, 'GRIEVANCE_LOCKED', 'Only submitted grievances can be edited.');
    }
    const result = await client.query(
      `UPDATE grievances SET
         subject = COALESCE($2, subject),
         description = COALESCE($3, description),
         citizen_category = COALESCE($4, citizen_category),
         location = CASE WHEN $5::boolean THEN $6::jsonb ELSE location END,
         updated_at = now()
       WHERE id = $1
       RETURNING id, tracking_id, subject, description, citizen_category, location, status, priority, updated_at`,
      [
        id,
        input.subject || null,
        input.description || null,
        input.category || null,
        Object.hasOwn(input, 'location'),
        Object.hasOwn(input, 'location') ? JSON.stringify(input.location) : null
      ]
    );
    await recordAudit(client, {
      actorUserId: user.id,
      action: 'grievance.updated',
      entityType: 'grievance',
      entityId: id,
      changes: { fields: Object.keys(input) },
      requestId
    });
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getHistory(id, user) {
  await findAccessibleGrievance(id, user);
  const result = await pool.query(
    `SELECT previous_status, new_status, explanation, created_at
     FROM grievance_status_history
     WHERE grievance_id = $1 ORDER BY created_at ASC`,
    [id]
  );
  return result.rows;
}

async function trackGrievance(trackingId) {
  const result = await pool.query(
    `SELECT id, tracking_id, status, priority, created_at, updated_at
     FROM grievances WHERE tracking_id = $1`,
    [trackingId]
  );
  if (!result.rows[0]) {
    throw httpError(404, 'GRIEVANCE_NOT_FOUND', 'Tracking ID not found.');
  }
  const grievance = result.rows[0];
  const history = await pool.query(
    `SELECT new_status, created_at FROM grievance_status_history
     WHERE grievance_id = $1 ORDER BY created_at ASC`,
    [grievance.id]
  );
  return {
    trackingId: grievance.tracking_id,
    status: grievance.status,
    priority: grievance.priority,
    submittedAt: grievance.created_at,
    updatedAt: grievance.updated_at,
    progress: history.rows
  };
}

module.exports = {
  createGrievance,
  listGrievances,
  findAccessibleGrievance,
  updateGrievance,
  getHistory,
  trackGrievance
};
