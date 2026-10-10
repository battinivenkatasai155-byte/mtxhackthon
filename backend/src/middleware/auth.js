const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { pool } = require('../config/database');
const httpError = require('../utils/httpError');

async function authenticate(req, res, next) {
  const authorization = req.get('authorization') || '';
  const [scheme, token] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(httpError(401, 'AUTH_REQUIRED', 'A valid bearer token is required.'));
  }
  if (!env.JWT_SECRET) {
    return next(httpError(503, 'AUTH_NOT_CONFIGURED', 'Authentication is not configured.'));
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (!payload || typeof payload.sub !== 'string') {
      throw new Error('Invalid token subject.');
    }
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.role, u.is_active,
              COALESCE(array_agg(ud.department_id) FILTER (WHERE ud.department_id IS NOT NULL), '{}') AS department_ids
       FROM users u
       LEFT JOIN user_departments ud ON ud.user_id = u.id
       WHERE u.id = $1
       GROUP BY u.id`,
      [payload.sub]
    );
    const user = result.rows[0];
    if (!user || !user.is_active) {
      return next(httpError(401, 'INVALID_TOKEN', 'The authenticated account is unavailable.'));
    }
    req.user = {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: user.role,
      departmentIds: user.department_ids
    };
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(httpError(401, 'INVALID_TOKEN', 'The bearer token is invalid or expired.'));
    }
    return next(error);
  }
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(httpError(403, 'FORBIDDEN', 'You are not authorized to perform this action.'));
    }
    return next();
  };
}

module.exports = { authenticate, requireRoles };
