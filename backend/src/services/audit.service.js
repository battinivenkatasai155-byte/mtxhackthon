async function recordAudit(client, {
  actorUserId,
  action,
  entityType,
  entityId,
  changes = {},
  requestId
}) {
  await client.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, changes, request_id)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [actorUserId || null, action, entityType, entityId || null, JSON.stringify(changes), requestId || null]
  );
}

module.exports = { recordAudit };
