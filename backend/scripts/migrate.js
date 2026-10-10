const fs = require('node:fs/promises');
const path = require('node:path');
const { pool, closeDatabase, checkDatabase } = require('../src/config/database');

async function migrate() {
  await checkDatabase();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const directory = path.join(__dirname, '..', 'database', 'migrations');
  const files = (await fs.readdir(directory))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const name of files) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rowCount } = await client.query(
        'SELECT name FROM schema_migrations WHERE name = $1',
        [name]
      );
      if (rowCount === 0) {
        const sql = await fs.readFile(path.join(directory, name), 'utf8');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        console.log(`Applied migration ${name}`);
      } else {
        console.log(`Skipping migration ${name}`);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

migrate()
  .catch((error) => {
    console.error('Database migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
