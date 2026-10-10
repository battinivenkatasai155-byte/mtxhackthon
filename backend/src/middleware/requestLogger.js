const logger = require('../config/logger');

function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    logger.info({
      requestId: req.id,
      method: req.method,
      statusCode: res.statusCode,
      durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6
    }, 'request completed');
  });
  next();
}

module.exports = requestLogger;
