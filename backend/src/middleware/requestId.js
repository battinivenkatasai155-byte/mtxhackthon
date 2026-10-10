const { randomUUID } = require('node:crypto');

function requestId(req, res, next) {
  const suppliedId = req.get('x-request-id');
  req.id = suppliedId && /^[A-Za-z0-9._-]{1,128}$/.test(suppliedId)
    ? suppliedId
    : randomUUID();
  res.set('x-request-id', req.id);
  next();
}

module.exports = requestId;
