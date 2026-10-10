const { escalateOverdue } = require('../services/priority.service');
const logger = require('../config/logger');

function startEscalationJob(intervalMs = 15 * 60 * 1000) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const count = await escalateOverdue();
      if (count > 0) {
        logger.info({ event: 'overdue_grievances_escalated', count });
      }
    } catch (error) {
      logger.error({
        event: 'escalation_job_failed',
        code: error.code || error.name
      });
    } finally {
      running = false;
    }
  };
  const initial = setTimeout(run, 1000);
  const interval = setInterval(run, intervalMs);
  return () => {
    clearTimeout(initial);
    clearInterval(interval);
  };
}

module.exports = { startEscalationJob };
