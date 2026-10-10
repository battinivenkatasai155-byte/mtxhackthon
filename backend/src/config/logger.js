const pino = require('pino');
const env = require('./env');

const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: ['authorization', 'password', 'token', 'req.headers.authorization'],
    censor: '[REDACTED]'
  }
});

module.exports = logger;
