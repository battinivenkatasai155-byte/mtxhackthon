const { Pool } = require('pg');
const env = require('./env');
const logger = require('./logger');

const poolOptions = {
  max: env.PG_POOL_MAX,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
};

function databaseNotConfiguredError() {
  const error = new Error('Database connection is not configured.');
  error.status = 503;
  error.code = 'DATABASE_NOT_CONFIGURED';
  return error;
}

if (env.DATABASE_URL) {
  poolOptions.connectionString = env.DATABASE_URL;
} else if (env.databaseConfigured) {
  poolOptions.host = env.PGHOST;
  poolOptions.port = env.PGPORT;
  poolOptions.user = env.PGUSER;
  poolOptions.password = env.PGPASSWORD;
  poolOptions.database = env.PGDATABASE;
}

const pool = env.databaseConfigured
  ? new Pool(poolOptions)
  : {
      query() {
        return Promise.reject(databaseNotConfiguredError());
      },
      connect() {
        return Promise.reject(databaseNotConfiguredError());
      },
      end() {
        return Promise.resolve();
      }
    };

if (env.databaseConfigured) {
  pool.on('error', (error) => {
    logger.error({ errorCode: error.code || error.name }, 'unexpected idle PostgreSQL client error');
  });
}

async function checkDatabase() {
  if (!env.databaseConfigured) {
    throw databaseNotConfiguredError();
  }

  await pool.query('SELECT 1');
}

async function closeDatabase() {
  await pool.end();
}

module.exports = { pool, checkDatabase, closeDatabase };
