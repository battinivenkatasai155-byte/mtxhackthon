const fs = require('node:fs/promises');
const path = require('node:path');
const { pool, closeDatabase, checkDatabase } = require('../src/config/database');

async function seed() {
  await checkDatabase();
  const seedPath = path.join(__dirname, '..', 'database', 'seeds', '001_departments.sql');
  const sql = await fs.readFile(seedPath, 'utf8');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Fictional department seed data applied.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

seed()
  .catch((error) => {
    console.error('Database seed failed:', error.message);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
