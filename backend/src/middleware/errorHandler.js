const logger = require('../config/logger');
const databaseUnavailableCodes = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', '08001', '08006', '57P01', '28P01'
]);

function notFoundHandler(req, res, next) {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.status = 404;
  next(error);
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const databaseUnavailable = databaseUnavailableCodes.has(error.code);
  const status = Number.isInteger(error.status) ? error.status : databaseUnavailable ? 503 : 500;
  const message = status >= 500 ? 'Internal server error' : error.message;

  if (status >= 500) {
    logger.error({
      requestId: req.id,
      method: req.method,
      errorCode: error.code || error.name || 'INTERNAL_ERROR'
    }, 'request failed');
  }

  return res.status(status).json({
    error: {
      code: error.code || (databaseUnavailable ? 'DATABASE_UNAVAILABLE' : status === 404 ? 'NOT_FOUND' : status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'),
      message,
      requestId: req.id
    }
  });
}

module.exports = { notFoundHandler, errorHandler };
