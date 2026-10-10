const { pool } = require('../config/database');
const httpError = require('../utils/httpError');

async function list(req, res, next) {
  try {
    const result = await pool.query(
      'SELECT id, code, name, description FROM departments WHERE is_active = TRUE ORDER BY name'
    );
    return res.json({ departments: result.rows });
  } catch (error) {
    return next(error);
  }
}

async function get(req, res, next) {
  try {
    const result = await pool.query(
      'SELECT id, code, name, description FROM departments WHERE id = $1 AND is_active = TRUE',
      [req.params.id]
    );
    if (!result.rows[0]) throw httpError(404, 'DEPARTMENT_NOT_FOUND', 'Department not found.');
    return res.json({ department: result.rows[0] });
  } catch (error) {
    return next(error);
  }
}

async function grievances(req, res, next) {
  try {
    if (req.user.role === 'department_officer' && !req.user.departmentIds.includes(req.params.id)) {
      throw httpError(403, 'FORBIDDEN', 'You are not assigned to this department.');
    }
    if (!['department_officer', 'administrator'].includes(req.user.role)) {
      throw httpError(403, 'FORBIDDEN', 'Only department officers and administrators can view department grievances.');
    }
    const result = await pool.query(
      `SELECT g.id, g.tracking_id, g.subject, g.status, g.priority, g.created_at
       FROM grievance_department_assignments a
       JOIN grievances g ON g.id = a.grievance_id
       WHERE a.department_id = $1 AND a.status = 'active'
       ORDER BY g.created_at DESC LIMIT $2 OFFSET $3`,
      [req.params.id, req.validatedQuery.limit, (req.validatedQuery.page - 1) * req.validatedQuery.limit]
    );
    return res.json({ grievances: result.rows, page: req.validatedQuery.page, limit: req.validatedQuery.limit });
  } catch (error) {
    return next(error);
  }
}

async function statistics(req, res, next) {
  try {
    if (req.user.role === 'department_officer' && !req.user.departmentIds.includes(req.params.id)) {
      throw httpError(403, 'FORBIDDEN', 'You are not assigned to this department.');
    }
    if (!['department_officer', 'administrator'].includes(req.user.role)) {
      throw httpError(403, 'FORBIDDEN', 'Only department officers and administrators can view department statistics.');
    }
    const result = await pool.query(
      `SELECT count(DISTINCT g.id)::int AS total,
              count(DISTINCT g.id) FILTER (WHERE g.status NOT IN ('resolved', 'rejected'))::int AS open,
              count(DISTINCT g.id) FILTER (WHERE g.priority IN ('high', 'critical'))::int AS high_priority
       FROM grievance_department_assignments a
       JOIN grievances g ON g.id = a.grievance_id
       WHERE a.department_id = $1 AND a.status = 'active'`,
      [req.params.id]
    );
    return res.json({ statistics: result.rows[0] });
  } catch (error) {
    return next(error);
  }
}

module.exports = { list, get, grievances, statistics };
