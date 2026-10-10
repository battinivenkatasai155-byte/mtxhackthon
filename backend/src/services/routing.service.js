const { pool } = require('../config/database');
const { classify } = require('./classification.service');
const { recordAudit } = require('./audit.service');
const { transitionStatus } = require('./status.service');
const httpError = require('../utils/httpError');

async function classifyGrievance(grievanceId, actor, requestId) {
  const grievanceResult = await pool.query(
    `SELECT id, citizen_id, subject, description, status FROM grievances WHERE id = $1`,
    [grievanceId]
  );
  const grievance = grievanceResult.rows[0];
  if (!grievance) throw httpError(404, 'GRIEVANCE_NOT_FOUND', 'Grievance not found.');

  const departmentResult = await pool.query(
    'SELECT id, code, name FROM departments WHERE is_active = TRUE ORDER BY name'
  );
  const classification = await classify(grievance, departmentResult.rows);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      'SELECT id, citizen_id, status FROM grievances WHERE id = $1 FOR UPDATE',
      [grievanceId]
    );
    if (!locked.rows[0]) throw httpError(404, 'GRIEVANCE_NOT_FOUND', 'Grievance not found.');
    if (locked.rows[0].status === 'submitted') {
      await transitionStatus(client, locked.rows[0], 'under_review', actor, 'Classification started', requestId);
      locked.rows[0].status = 'under_review';
    }
    if (locked.rows[0].status === 'under_review') {
      await transitionStatus(client, locked.rows[0], 'classified', actor, classification.explanation, requestId);
    } else if (locked.rows[0].status !== 'classified') {
      throw httpError(409, 'INVALID_STATUS', 'Only submitted or under-review grievances can be classified.');
    }
    const inserted = await client.query(
      `INSERT INTO grievance_classifications
        (grievance_id, primary_department_id, secondary_department_ids, predicted_category,
         urgency, confidence, explanation, suggested_keywords, requires_human_review, method, provider)
       VALUES ($1, $2, $3::uuid[], $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        grievanceId,
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
      actorUserId: actor.id,
      action: 'grievance.classified',
      entityType: 'grievance',
      entityId: grievanceId,
      changes: {
        classificationId: inserted.rows[0].id,
        method: classification.method,
        confidence: classification.confidence,
        requiresHumanReview: classification.requiresHumanReview
      },
      requestId
    });
    await client.query('COMMIT');
    return { ...inserted.rows[0], fallback: classification.method === 'rules' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function routeGrievance(grievanceId, actor, requestId, reviewReason) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const grievanceResult = await client.query(
      `SELECT id, citizen_id, status FROM grievances WHERE id = $1 FOR UPDATE`,
      [grievanceId]
    );
    const grievance = grievanceResult.rows[0];
    if (!grievance) throw httpError(404, 'GRIEVANCE_NOT_FOUND', 'Grievance not found.');
    if (grievance.status !== 'classified') {
      throw httpError(409, 'INVALID_STATUS', 'Only classified grievances can be routed. Use reassignment to change an existing route.');
    }
    const classificationResult = await client.query(
      `SELECT * FROM grievance_classifications WHERE grievance_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [grievanceId]
    );
    const classification = classificationResult.rows[0];
    if (!classification?.primary_department_id) {
      throw httpError(409, 'CLASSIFICATION_REQUIRED', 'A classification with a primary department is required before routing.');
    }
    if (classification.requires_human_review && !reviewReason) {
      throw httpError(400, 'HUMAN_REVIEW_REQUIRED', 'Provide a review reason before routing a classification that requires human review.');
    }
    const targets = [
      { departmentId: classification.primary_department_id, reason: `Primary department selected by classification: ${classification.explanation}` },
      ...classification.secondary_department_ids.map((departmentId) => ({
        departmentId,
        reason: `Secondary department selected by classification: ${classification.explanation}`
      }))
    ];
    for (const target of targets) {
      await client.query(
        `INSERT INTO grievance_department_assignments
           (grievance_id, department_id, assigned_by, reason, status)
         VALUES ($1, $2, $3, $4, 'active')
         ON CONFLICT (grievance_id, department_id)
         DO UPDATE SET assigned_by = EXCLUDED.assigned_by, reason = EXCLUDED.reason,
                       status = 'active', updated_at = now()`,
        [grievanceId, target.departmentId, actor.id, target.reason]
      );
    }
    await client.query(
      `INSERT INTO grievance_routes
        (grievance_id, classification_id, routing_method, confidence, explanation, actor_user_id, selected_department_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7::uuid[])`,
      [
        grievanceId,
        classification.id,
        classification.method,
        classification.confidence,
        targets.map((target) => target.reason).join(' '),
        actor.id,
        targets.map((target) => target.departmentId)
      ]
    );
    await transitionStatus(
      client,
      grievance,
      'assigned',
      actor,
      reviewReason || 'Departments assigned by administrator after classification review.',
      requestId
    );
    await recordAudit(client, {
      actorUserId: actor.id,
      action: 'grievance.routed',
      entityType: 'grievance',
      entityId: grievanceId,
      changes: { departments: targets, humanReviewed: Boolean(reviewReason) },
      requestId
    });
    await client.query('COMMIT');
    return { grievanceId, assignments: targets, method: classification.method, confidence: classification.confidence };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getRouting(grievanceId, user) {
  const { findAccessibleGrievance } = require('./grievance.service');
  await findAccessibleGrievance(grievanceId, user);
  const result = await pool.query(
    `SELECT r.id, r.routing_method, r.confidence, r.explanation, r.created_at,
            COALESCE(json_agg(json_build_object('id', d.id, 'name', d.name))
              FILTER (WHERE d.id IS NOT NULL), '[]'::json) AS departments
     FROM grievance_routes r
     LEFT JOIN LATERAL unnest(r.selected_department_ids) selected(department_id) ON TRUE
     LEFT JOIN departments d ON d.id = selected.department_id
     WHERE r.grievance_id = $1
     GROUP BY r.id ORDER BY r.created_at DESC`,
    [grievanceId]
  );
  return result.rows;
}

async function reassign(grievanceId, departmentId, reason, actor, requestId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const grievanceResult = await client.query(
      'SELECT id, citizen_id, status FROM grievances WHERE id = $1 FOR UPDATE',
      [grievanceId]
    );
    if (!grievanceResult.rows[0]) throw httpError(404, 'GRIEVANCE_NOT_FOUND', 'Grievance not found.');
    if (!['classified', 'assigned'].includes(grievanceResult.rows[0].status)) {
      throw httpError(409, 'INVALID_STATUS', 'Only classified or assigned grievances can be reassigned.');
    }
    const department = await client.query(
      'SELECT id FROM departments WHERE id = $1 AND is_active = TRUE',
      [departmentId]
    );
    if (!department.rows[0]) throw httpError(404, 'DEPARTMENT_NOT_FOUND', 'Department not found.');
    await client.query(
      `UPDATE grievance_department_assignments SET status = 'cancelled', updated_at = now()
       WHERE grievance_id = $1 AND status = 'active'`,
      [grievanceId]
    );
    await client.query(
      `INSERT INTO grievance_department_assignments (grievance_id, department_id, assigned_by, reason)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (grievance_id, department_id)
       DO UPDATE SET status = 'active', assigned_by = EXCLUDED.assigned_by,
                     reason = EXCLUDED.reason, updated_at = now()`,
      [grievanceId, departmentId, actor.id, reason]
    );
    if (grievanceResult.rows[0].status === 'classified') {
      await transitionStatus(client, grievanceResult.rows[0], 'assigned', actor, reason, requestId);
    }
    await client.query(
      `INSERT INTO grievance_routes
        (grievance_id, routing_method, explanation, actor_user_id, selected_department_ids)
       VALUES ($1, 'manual', $2, $3, $4::uuid[])`,
      [grievanceId, reason, actor.id, [departmentId]]
    );
    await recordAudit(client, {
      actorUserId: actor.id,
      action: 'grievance.reassigned',
      entityType: 'grievance',
      entityId: grievanceId,
      changes: { departmentId, reason },
      requestId
    });
    await client.query('COMMIT');
    return { grievanceId, departmentId, reason };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { classifyGrievance, routeGrievance, getRouting, reassign };
