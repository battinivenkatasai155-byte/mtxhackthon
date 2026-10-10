const { recordAudit } = require('./audit.service');
const { pool } = require('../config/database');
const env = require('../config/env');
const httpError = require('../utils/httpError');

const transitions = {
  submitted: ['under_review', 'rejected'],
  under_review: ['classified', 'awaiting_information', 'rejected'],
  classified: ['under_review', 'assigned', 'rejected'],
  assigned: ['in_progress', 'awaiting_information', 'resolved'],
  in_progress: ['awaiting_information', 'resolved'],
  awaiting_information: ['under_review', 'in_progress', 'rejected'],
  resolved: ['reopened'],
  rejected: ['reopened'],
  reopened: ['under_review', 'rejected']
};

async function transitionStatus(client, grievance, newStatus, actor, explanation, requestId) {
  if (!transitions[grievance.status]?.includes(newStatus)) {
    throw httpError(409, 'INVALID_STATUS_TRANSITION', `Cannot transition from ${grievance.status} to ${newStatus}.`);
  }
  if (['rejected', 'awaiting_information'].includes(newStatus) && !explanation) {
    throw httpError(400, 'STATUS_EXPLANATION_REQUIRED', 'Provide an explanation for rejection or an information request.');
  }

  if (actor.role === 'citizen') {
    const canReopen = newStatus === 'reopened' && grievance.citizen_id === actor.id;
    if (!canReopen) {
      throw httpError(403, 'FORBIDDEN', 'Citizens may only reopen their own resolved or rejected grievances.');
    }
  } else if (actor.role === 'system') {
    if (!['under_review', 'classified', 'assigned'].includes(newStatus)) {
      throw httpError(403, 'FORBIDDEN', 'The system cannot make this status transition.');
    }
  } else if (actor.role === 'department_officer') {
    const permittedStatus = ['under_review', 'in_progress', 'awaiting_information', 'resolved'].includes(newStatus);
    const assignment = await client.query(
      `SELECT 1 FROM grievance_department_assignments
       WHERE grievance_id = $1 AND department_id = ANY($2::uuid[]) AND status = 'active'
       LIMIT 1`,
      [grievance.id, actor.departmentIds]
    );
    if (!permittedStatus || assignment.rowCount === 0) {
      throw httpError(403, 'FORBIDDEN', 'An officer can only update grievances assigned to an authorized department.');
    }
  } else if (actor.role !== 'administrator') {
    throw httpError(403, 'FORBIDDEN', 'You are not authorized to change grievance status.');
  }

  await client.query(
    `UPDATE grievances SET status = $2, updated_at = now(),
       resolved_at = CASE WHEN $2 = 'resolved' THEN now()
                          WHEN $2 = 'reopened' THEN NULL ELSE resolved_at END,
       due_at = CASE WHEN $2 = 'reopened' THEN now() + ($3 * interval '1 hour') ELSE due_at END
     WHERE id = $1`,
    [grievance.id, newStatus, env.GRIEVANCE_DUE_HOURS]
  );
  await client.query(
    `INSERT INTO grievance_status_history
      (grievance_id, previous_status, new_status, actor_user_id, explanation)
     VALUES ($1, $2, $3, $4, $5)`,
    [grievance.id, grievance.status, newStatus, actor.id, explanation || null]
  );
  await recordAudit(client, {
    actorUserId: actor.id,
    action: 'grievance.status_changed',
    entityType: 'grievance',
    entityId: grievance.id,
    changes: { from: grievance.status, to: newStatus },
    requestId
  });
}

async function transitionGrievance(grievanceId, newStatus, actor, explanation, requestId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const values = [grievanceId];
    const ownership = actor.role === 'citizen' ? ' AND citizen_id = $2' : '';
    if (ownership) values.push(actor.id);
    const result = await client.query(
      `SELECT id, citizen_id, status FROM grievances WHERE id = $1${ownership} FOR UPDATE`,
      values
    );
    if (!result.rows[0]) {
      throw httpError(404, 'GRIEVANCE_NOT_FOUND', 'Grievance not found.');
    }
    await transitionStatus(client, result.rows[0], newStatus, actor, explanation, requestId);
    await client.query('COMMIT');
    return { id: grievanceId, status: newStatus };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { transitionStatus, transitionGrievance, transitions };
