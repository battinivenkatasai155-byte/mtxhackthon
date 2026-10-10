const app = require('./app');
const env = require('./config/env');
const { closeDatabase } = require('./config/database');
const { startEscalationJob } = require('./jobs/escalation.job');
const logger = require('./config/logger');

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, environment: env.NODE_ENV }, 'API listening');
});
const stopEscalationJob = env.databaseConfigured
  ? startEscalationJob(env.ESCALATION_INTERVAL_MS)
  : () => {};

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info({ signal }, 'graceful shutdown started');
  stopEscalationJob();

  server.close(async (error) => {
    try {
      await closeDatabase();
      if (error) {
        logger.error({ errorCode: error.code || error.name }, 'HTTP server shutdown failed');
        process.exitCode = 1;
      }
    } catch (databaseError) {
      logger.error({ errorCode: databaseError.code || databaseError.name }, 'database shutdown failed');
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
