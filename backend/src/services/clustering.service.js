const { pool } = require('../config/database');
const { recordAudit } = require('./audit.service');
const env = require('../config/env');
const httpError = require('../utils/httpError');

const stopWords = new Set([
  'about', 'after', 'again', 'also', 'and', 'are', 'been', 'being', 'but', 'can', 'could',
  'from', 'have', 'into', 'near', 'our', 'please', 'same', 'that', 'the', 'their', 'there',
  'this', 'through', 'was', 'were', 'which', 'with', 'would', 'you', 'your'
]);

function terms(text) {
  return new Set(
    text.toLowerCase().match(/[a-z0-9]{3,}/g)?.filter((word) => !stopWords.has(word)) || []
  );
}

function similarity(a, b) {
  const first = terms(`${a.subject} ${a.description}`);
  const second = terms(`${b.subject} ${b.description}`);
  const intersection = [...first].filter((term) => second.has(term));
  const union = new Set([...first, ...second]);
  const textScore = union.size ? intersection.length / union.size : 0;
  const categoryScore = a.citizen_category && a.citizen_category === b.citizen_category ? 1 : 0;
  const locationScore = a.district && b.district && a.district.toLowerCase() === b.district.toLowerCase() ? 1 : 0;
  const withinTimeWindow = Math.abs(new Date(a.created_at) - new Date(b.created_at)) <= 30 * 86400000;
  const score = textScore * 0.65 + categoryScore * 0.2 + locationScore * 0.1 + (withinTimeWindow ? 0.05 : 0);
  return {
    score: Math.round(score * 10000) / 10000,
    evidence: {
      sharedKeywords: intersection.slice(0, 10),
      sameCategory: Boolean(categoryScore),
      sameDistrict: Boolean(locationScore),
      withinThirtyDays: withinTimeWindow
    }
  };
}

async function analyze(grievanceIds, actor, requestId) {
  const uniqueIds = [...new Set(grievanceIds)];
  if (uniqueIds.length < 2) {
    throw httpError(400, 'INSUFFICIENT_GRIEVANCES', 'At least two distinct grievances are required.');
  }
  const result = await pool.query(
    `SELECT id, tracking_id, subject, description, citizen_category,
            location->>'district' AS district, created_at
     FROM grievances WHERE id = ANY($1::uuid[])`,
    [uniqueIds]
  );
  if (result.rows.length !== uniqueIds.length) {
    throw httpError(404, 'GRIEVANCE_NOT_FOUND', 'One or more grievances were not found.');
  }

  const anchor = result.rows[0];
  const members = result.rows
    .slice(1)
    .map((grievance) => ({ grievance, ...similarity(anchor, grievance) }))
    .filter((member) => member.score >= env.CLUSTER_SIMILARITY_THRESHOLD);
  if (members.length === 0) {
    throw httpError(422, 'NO_CLUSTER_EVIDENCE', 'No candidate met the configured similarity threshold.');
  }

  const accepted = [{ grievance: anchor, score: 1, evidence: { reference: true } }, ...members];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const clusterResult = await client.query(
      `INSERT INTO root_cause_clusters (title, description, evidence, created_by)
       VALUES ($1, $2, $3::jsonb, $4) RETURNING *`,
      [
        `Suspected issue: ${anchor.subject.slice(0, 120)}`,
        'Automatically suggested by explainable text, category, location, and time similarity. Similarity alone does not establish a shared root cause.',
        JSON.stringify({
          method: 'weighted_jaccard_and_metadata',
          threshold: env.CLUSTER_SIMILARITY_THRESHOLD,
          comparisons: accepted.slice(1).map(({ grievance, score, evidence }) => ({
            trackingId: grievance.tracking_id,
            similarity: score,
            evidence
          }))
        }),
        actor.id
      ]
    );
    const cluster = clusterResult.rows[0];
    for (const member of accepted) {
      await client.query(
        `INSERT INTO cluster_members (cluster_id, grievance_id, similarity, evidence)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [cluster.id, member.grievance.id, member.score, JSON.stringify(member.evidence)]
      );
    }
    await recordAudit(client, {
      actorUserId: actor.id,
      action: 'cluster.suggested',
      entityType: 'root_cause_cluster',
      entityId: cluster.id,
      changes: { memberCount: accepted.length, threshold: env.CLUSTER_SIMILARITY_THRESHOLD },
      requestId
    });
    await client.query('COMMIT');
    return { ...cluster, memberCount: accepted.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function list() {
  const result = await pool.query(
    `SELECT c.id, c.title, c.state, c.created_at, count(m.grievance_id)::int AS grievance_count
     FROM root_cause_clusters c LEFT JOIN cluster_members m ON m.cluster_id = c.id
     GROUP BY c.id ORDER BY c.created_at DESC LIMIT 100`
  );
  return result.rows;
}

async function get(clusterId) {
  const result = await pool.query(
    `SELECT c.*, count(m.grievance_id)::int AS grievance_count
     FROM root_cause_clusters c LEFT JOIN cluster_members m ON m.cluster_id = c.id
     WHERE c.id = $1 GROUP BY c.id`,
    [clusterId]
  );
  if (!result.rows[0]) throw httpError(404, 'CLUSTER_NOT_FOUND', 'Cluster not found.');
  return result.rows[0];
}

async function getGrievances(clusterId) {
  await get(clusterId);
  const result = await pool.query(
    `SELECT g.id, g.tracking_id, g.subject, g.status, g.priority, m.similarity, m.evidence
     FROM cluster_members m JOIN grievances g ON g.id = m.grievance_id
     WHERE m.cluster_id = $1 ORDER BY m.similarity DESC`,
    [clusterId]
  );
  return result.rows;
}

async function review(clusterId, state, reason, actor, requestId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE root_cause_clusters SET state = $2, reviewed_by = $3,
       reviewed_at = now(), updated_at = now()
       WHERE id = $1 AND state = 'suspected' RETURNING id`,
      [clusterId, state, actor.id]
    );
    if (!result.rows[0]) {
      throw httpError(404, 'SUSPECTED_CLUSTER_NOT_FOUND', 'Suspected cluster not found.');
    }
    await recordAudit(client, {
      actorUserId: actor.id,
      action: 'cluster.reviewed',
      entityType: 'root_cause_cluster',
      entityId: clusterId,
      changes: { state, reason },
      requestId
    });
    await client.query('COMMIT');
    return { id: clusterId, state, reason };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function addMember(clusterId, grievanceId, actor, requestId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const clusterResult = await client.query(
      'SELECT id, state FROM root_cause_clusters WHERE id = $1 FOR UPDATE',
      [clusterId]
    );
    const cluster = clusterResult.rows[0];
    if (!cluster || cluster.state === 'rejected') {
      throw httpError(404, 'CLUSTER_NOT_FOUND', 'An active cluster was not found.');
    }
    const existing = await client.query(
      `SELECT g.id, g.subject, g.description, g.citizen_category,
              g.location->>'district' AS district, g.created_at
       FROM cluster_members m JOIN grievances g ON g.id = m.grievance_id
       WHERE m.cluster_id = $1`,
      [clusterId]
    );
    if (existing.rows.some((member) => member.id === grievanceId)) {
      throw httpError(409, 'ALREADY_CLUSTER_MEMBER', 'Grievance is already a member of this cluster.');
    }
    const candidateResult = await client.query(
      `SELECT id, tracking_id, subject, description, citizen_category,
              location->>'district' AS district, created_at
       FROM grievances WHERE id = $1`,
      [grievanceId]
    );
    const candidate = candidateResult.rows[0];
    if (!candidate) throw httpError(404, 'GRIEVANCE_NOT_FOUND', 'Grievance not found.');
    const matches = existing.rows.map((member) => ({ member, ...similarity(member, candidate) }))
      .sort((a, b) => b.score - a.score);
    const match = matches[0];
    if (!match || match.score < env.CLUSTER_SIMILARITY_THRESHOLD) {
      throw httpError(422, 'NO_CLUSTER_EVIDENCE', 'The grievance does not meet the configured similarity threshold.');
    }
    await client.query(
      `INSERT INTO cluster_members (cluster_id, grievance_id, similarity, evidence)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [
        clusterId,
        grievanceId,
        match.score,
        JSON.stringify({ ...match.evidence, matchedTrackingId: match.member.tracking_id })
      ]
    );
    if (cluster.state === 'confirmed') {
      await client.query(
        `UPDATE root_cause_clusters SET state = 'suspected', reviewed_by = NULL,
         reviewed_at = NULL, updated_at = now() WHERE id = $1`,
        [clusterId]
      );
    }
    await recordAudit(client, {
      actorUserId: actor.id,
      action: 'cluster.member_added',
      entityType: 'root_cause_cluster',
      entityId: clusterId,
      changes: { grievanceId, similarity: match.score },
      requestId
    });
    await client.query('COMMIT');
    return { clusterId, grievanceId, similarity: match.score, state: cluster.state === 'confirmed' ? 'suspected' : cluster.state };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function removeMember(clusterId, grievanceId, actor, requestId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const clusterResult = await client.query(
      'SELECT id, state FROM root_cause_clusters WHERE id = $1 FOR UPDATE',
      [clusterId]
    );
    const cluster = clusterResult.rows[0];
    if (!cluster || cluster.state === 'rejected') {
      throw httpError(404, 'CLUSTER_NOT_FOUND', 'An active cluster was not found.');
    }
    const members = await client.query(
      'SELECT grievance_id FROM cluster_members WHERE cluster_id = $1',
      [clusterId]
    );
    if (!members.rows.some((member) => member.grievance_id === grievanceId)) {
      throw httpError(404, 'CLUSTER_MEMBER_NOT_FOUND', 'Grievance is not a member of this cluster.');
    }
    if (members.rowCount <= 2) {
      throw httpError(409, 'MINIMUM_CLUSTER_SIZE', 'A cluster must retain at least two grievances; reject the cluster if the suspected relationship is invalid.');
    }
    await client.query(
      'DELETE FROM cluster_members WHERE cluster_id = $1 AND grievance_id = $2',
      [clusterId, grievanceId]
    );
    if (cluster.state === 'confirmed') {
      await client.query(
        `UPDATE root_cause_clusters SET state = 'suspected', reviewed_by = NULL,
         reviewed_at = NULL, updated_at = now() WHERE id = $1`,
        [clusterId]
      );
    }
    await recordAudit(client, {
      actorUserId: actor.id,
      action: 'cluster.member_removed',
      entityType: 'root_cause_cluster',
      entityId: clusterId,
      changes: { grievanceId },
      requestId
    });
    await client.query('COMMIT');
    return { clusterId, grievanceId, state: cluster.state === 'confirmed' ? 'suspected' : cluster.state };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { analyze, list, get, getGrievances, review, addMember, removeMember, similarity };
