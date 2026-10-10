const env = require('../config/env');
const { pool } = require('../config/database');
const { recordAudit } = require('./audit.service');
const httpError = require('../utils/httpError');

function calculatePriority(factors) {
  const severityPoints = { low: 5, medium: 15, high: 30, critical: 45 };
  const severity = severityPoints[factors.severity] || severityPoints.medium;
  const safety = factors.publicSafety ? 30 : 0;
  const affected = Math.min(15, Math.ceil(Math.log2(Math.max(1, factors.affectedPeople || 1))) * 3);
  const repeat = Math.min(20, Math.max(0, factors.repeatComplaints || 0) * 5);
  const waiting = Math.min(20, Math.max(0, factors.hoursWaiting || 0) / 12);
  const ongoing = factors.ongoingIncident ? 15 : 0;
  const score = Math.min(100, Math.round(severity + safety + affected + repeat + waiting + ongoing));
  const priority = score >= env.CRITICAL_PRIORITY_THRESHOLD
    ? 'critical'
    : score >= env.HIGH_PRIORITY_THRESHOLD
      ? 'high'
      : score >= 25 ? 'medium' : 'low';
  return {
    priority,
    score,
    factors: { severity, publicSafety: safety, affectedPeople: affected, repeatComplaints: repeat, timeWaiting: waiting, ongoingIncident: ongoing }
  };
}

function factorsFromGrievance(grievance, repeatComplaints, hoursWaiting) {
  const text = `${grievance.subject} ${grievance.description}`.toLowerCase();
  const publicSafety = /\b(fire|electric shock|live wire|exposed wire|electrical hazard|collapse|contaminated|unsafe|injury|accident|threat|outbreak)\b/.test(text);
  const ongoingIncident = grievance.ongoing_incident === true
    || /\b(ongoing|currently|still|continuous|every day|no water|power cut)\b/.test(text);
  const severity = /\b(death|fatal|life threatening|emergency)\b/.test(text)
    ? 'critical'
    : publicSafety ? 'high' : 'medium';
  return calculatePriority({
    severity,
    publicSafety,
    affectedPeople: grievance.affected_people_estimate || 1,
    repeatComplaints,
    hoursWaiting,
    ongoingIncident
  });
}

async function setPriority(grievanceId, priority, reason, actor, requestId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE grievances SET priority = $2, priority_reason = $3,
       priority_updated_at = now(), updated_at = now()
       WHERE id = $1 RETURNING id, priority, priority_reason, priority_updated_at`,
      [grievanceId, priority, reason]
    );
    if (!result.rows[0]) throw httpError(404, 'GRIEVANCE_NOT_FOUND', 'Grievance not found.');
    await recordAudit(client, {
      actorUserId: actor.id,
      action: 'grievance.priority_changed',
      entityType: 'grievance',
      entityId: grievanceId,
      changes: { priority, reason },
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

async function calculateForGrievance(grievanceId, actor, requestId) {
  const result = await pool.query(
    `SELECT g.id, g.subject, g.description, g.created_at,
       g.affected_people_estimate, g.ongoing_incident,
       (SELECT count(DISTINCT other.grievance_id)
        FROM cluster_members own
        JOIN cluster_members other ON other.cluster_id = own.cluster_id
        JOIN root_cause_clusters c ON c.id = own.cluster_id
        WHERE own.grievance_id = g.id AND other.grievance_id <> g.id
          AND c.state IN ('suspected', 'confirmed'))::int AS repeats
     FROM grievances g WHERE g.id = $1`,
    [grievanceId]
  );
  const grievance = result.rows[0];
  if (!grievance) throw httpError(404, 'GRIEVANCE_NOT_FOUND', 'Grievance not found.');
  const hoursWaiting = (Date.now() - new Date(grievance.created_at).getTime()) / 3600000;
  const calculation = factorsFromGrievance(grievance, grievance.repeats, hoursWaiting);
  const updated = await setPriority(
    grievanceId,
    calculation.priority,
    `Rule-based score ${calculation.score}/100; factors=${JSON.stringify(calculation.factors)}`,
    actor,
    requestId
  );
  return { ...updated, score: calculation.score, factors: calculation.factors };
}

async function escalateOverdue() {
  const result = await pool.query(
    `SELECT id, priority FROM grievances
     WHERE due_at <= now() AND status NOT IN ('resolved', 'rejected')
       AND priority <> 'critical'
     ORDER BY due_at LIMIT 200`
  );
  const nextPriority = { low: 'medium', medium: 'high', high: 'critical' };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const grievance of result.rows) {
      const priority = nextPriority[grievance.priority];
      if (!priority) continue;
      await client.query(
        `UPDATE grievances SET priority = $2, priority_reason = 'Escalated because the resolution deadline was exceeded.',
         priority_updated_at = now(), updated_at = now() WHERE id = $1`,
        [grievance.id, priority]
      );
      await recordAudit(client, {
        action: 'grievance.escalated',
        entityType: 'grievance',
        entityId: grievance.id,
        changes: { from: grievance.priority, to: priority, reason: 'resolution deadline exceeded' }
      });
    }
    await client.query('COMMIT');
    return result.rows.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  calculatePriority,
  factorsFromGrievance,
  calculateForGrievance,
  setPriority,
  escalateOverdue
};
