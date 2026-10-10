const bcrypt = require('bcrypt');
const { z } = require('zod');
const { pool, closeDatabase, checkDatabase } = require('../src/config/database');
const { recordAudit } = require('../src/services/audit.service');

const inputSchema = z.object({
  fullName: z.string().trim().min(1).max(160),
  email: z.string().email().max(254),
  password: z.string().min(12).max(128)
});

async function createInitialAdministrator(input) {
  const values = inputSchema.parse(input);
  const passwordHash = await bcrypt.hash(values.password, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(741852963)');
    const existing = await client.query(
      `SELECT 1 FROM users WHERE role = 'administrator' LIMIT 1`
    );
    if (existing.rowCount > 0) {
      throw new Error('An administrator already exists; use an authorized administrative workflow.');
    }
    const result = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, 'administrator')
       RETURNING id, full_name, email`,
      [values.fullName, values.email.toLowerCase(), passwordHash]
    );
    await recordAudit(client, {
      actorUserId: result.rows[0].id,
      action: 'user.initial_administrator_created',
      entityType: 'user',
      entityId: result.rows[0].id,
      changes: { role: 'administrator' }
    });
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      error.rollbackErrorCode = rollbackError.code || rollbackError.name;
    }
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const input = {
    fullName: process.env.ADMIN_FULL_NAME,
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD
  };
  await checkDatabase();
  await createInitialAdministrator(input);
  console.log('Initial administrator created.');
}

main()
  .catch((error) => {
    console.error(`Initial administrator creation failed (${error.code || error.name}).`);
    process.exitCode = 1;
  })
  .finally(async () => {
    process.env.ADMIN_PASSWORD = '';
    await closeDatabase();
  });
