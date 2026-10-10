const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { pool } = require('../config/database');
const httpError = require('../utils/httpError');
const { recordAudit } = require('./audit.service');

function requireJwtSecret() {
  if (!env.JWT_SECRET) {
    throw httpError(503, 'AUTH_NOT_CONFIGURED', 'Set JWT_SECRET to enable authentication.');
  }
}

async function register({ fullName, email, password }, requestId) {
  requireJwtSecret();
  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  let result;
  try {
    await client.query('BEGIN');
    result = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, 'citizen')
       RETURNING id, full_name, email, role`,
      [fullName, email.toLowerCase(), passwordHash]
    );
    await recordAudit(client, {
      actorUserId: result.rows[0].id,
      action: 'user.registered',
      entityType: 'user',
      entityId: result.rows[0].id,
      changes: { role: 'citizen' },
      requestId
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      throw httpError(409, 'EMAIL_EXISTS', 'An account with this email already exists.');
    }
    throw error;
  } finally {
    client.release();
  }
  return issueToken(result.rows[0]);
}

async function login({ email, password }) {
  requireJwtSecret();
  const result = await pool.query(
    `SELECT id, full_name, email, password_hash, role, is_active
     FROM users WHERE email = $1`,
    [email.toLowerCase()]
  );
  const user = result.rows[0];
  if (!user || !user.is_active || !(await bcrypt.compare(password, user.password_hash))) {
    throw httpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }
  return issueToken(user);
}

function issueToken(user) {
  const token = jwt.sign({ sub: user.id }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
  return {
    token,
    user: {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: user.role
    }
  };
}

module.exports = { register, login };
