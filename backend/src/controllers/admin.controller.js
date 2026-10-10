const { pool } = require('../config/database');
const priorityService = require('../services/priority.service');
const { transitionStatus } = require('../services/status.service');
const { recordAudit } = require('../services/audit.service');
const bcrypt = require('bcrypt');
const httpError = require('../utils/httpError');
const logger = require('../config/logger');

async function rollback(client) {
  try {
    await client.query('ROLLBACK');
  } catch (error) {
    logger.error({ errorCode: error.code || error.name }, 'database transaction rollback failed');
  }
}

async function dashboard(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE g.status = 'submitted')::int AS new,
              count(*) FILTER (WHERE g.status IN ('submitted', 'under_review', 'classified', 'assigned', 'in_progress', 'awaiting_information', 'reopened'))::int AS pending,
              count(*) FILTER (WHERE g.created_at >= date_trunc('day', now()))::int AS submitted_today,
              count(*) FILTER (WHERE g.due_at < now() AND g.status NOT IN ('resolved', 'rejected'))::int AS overdue
       FROM grievances g`
    );
    return res.json({ dashboard: result.rows[0] });
  } catch (error) {
    return next(error);
  }
}

async function statistics(req, res, next) {
  try {
    const [totals, departments, categories, priorities, clusters, crossDepartment, confidence] = await Promise.all([
      pool.query(
        `SELECT count(*)::int AS total,
          count(*) FILTER (WHERE g.status = 'submitted')::int AS new,
          count(*) FILTER (WHERE g.status IN ('submitted', 'under_review', 'classified', 'assigned', 'in_progress', 'awaiting_information', 'reopened'))::int AS pending,
          count(*) FILTER (WHERE g.due_at < now() AND g.status NOT IN ('resolved', 'rejected'))::int AS overdue,
          count(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM cluster_members m WHERE m.grievance_id = g.id
          ))::int AS repeated_grievances,
          round((avg(extract(epoch FROM (g.resolved_at - g.created_at)) / 3600)
            FILTER (WHERE g.resolved_at IS NOT NULL))::numeric, 2) AS average_resolution_hours
         FROM grievances g`
      ),
      pool.query(
        `SELECT d.id, d.name, count(DISTINCT a.grievance_id)::int AS grievance_count
         FROM departments d LEFT JOIN grievance_department_assignments a
           ON a.department_id = d.id AND a.status = 'active'
         GROUP BY d.id ORDER BY grievance_count DESC, d.name`
      ),
      pool.query(
        `SELECT COALESCE(citizen_category, 'unclassified') AS category, count(*)::int AS count
         FROM grievances GROUP BY citizen_category ORDER BY count DESC`
      ),
      pool.query('SELECT priority, count(*)::int AS count FROM grievances GROUP BY priority ORDER BY priority'),
      pool.query(
        `SELECT state, count(*)::int AS count FROM root_cause_clusters GROUP BY state ORDER BY state`
      ),
      pool.query(
        `SELECT count(*)::int AS count FROM (
           SELECT grievance_id FROM grievance_department_assignments
           WHERE status = 'active' GROUP BY grievance_id HAVING count(*) > 1
         ) cross_assigned`
      ),
      pool.query(
        `SELECT CASE WHEN confidence < 0.5 THEN 'below_0_50'
                     WHEN confidence < 0.75 THEN '0_50_to_0_74'
                     ELSE '0_75_and_above' END AS band,
                count(*)::int AS count
         FROM grievance_classifications GROUP BY band ORDER BY band`
      )
    ]);
    return res.json({
      statistics: {
        ...totals.rows[0],
        byDepartment: departments.rows,
        byCategory: categories.rows,
        byPriority: priorities.rows,
        clustersByState: clusters.rows,
        crossDepartmentAssignments: crossDepartment.rows[0].count,
        classificationConfidence: confidence.rows
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function auditLogs(req, res, next) {
  try {
    const limit = req.validatedQuery.limit;
    const offset = (req.validatedQuery.page - 1) * limit;
    const result = await pool.query(
      `SELECT id, actor_user_id, action, entity_type, entity_id, changes, request_id, created_at
       FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return res.json({ auditLogs: result.rows, page: req.validatedQuery.page, limit });
  } catch (error) {
    return next(error);
  }
}

async function setPriority(req, res, next) {
  try {
    const result = await priorityService.setPriority(
      req.params.id,
      req.body.priority,
      req.body.reason,
      req.user,
      req.id
    );
    return res.json({ grievance: result });
  } catch (error) {
    return next(error);
  }
}

async function calculatePriority(req, res, next) {
  try {
    return res.json({
      priority: await priorityService.calculateForGrievance(req.params.id, req.user, req.id)
    });
  } catch (error) {
    return next(error);
  }
}

async function setStatus(req, res, next) {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const result = await client.query(
      'SELECT id, citizen_id, status FROM grievances WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (!result.rows[0]) throw httpError(404, 'GRIEVANCE_NOT_FOUND', 'Grievance not found.');
    await transitionStatus(
      client,
      result.rows[0],
      req.body.status,
      req.user,
      req.body.explanation,
      req.id
    );
    await client.query('COMMIT');
    return res.json({ status: req.body.status });
  } catch (error) {
    if (client) await rollback(client);
    return next(error);
  } finally {
    client?.release();
  }
}

async function assignDepartments(req, res, next) {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const userResult = await client.query('SELECT id, role FROM users WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!userResult.rows[0]) throw httpError(404, 'USER_NOT_FOUND', 'User not found.');
    if (userResult.rows[0].role !== 'department_officer') {
      throw httpError(409, 'INVALID_USER_ROLE', 'Only department officers can be assigned to departments.');
    }
    const validDepartments = await client.query(
      'SELECT id FROM departments WHERE id = ANY($1::uuid[]) AND is_active = TRUE',
      [req.body.departmentIds]
    );
    if (validDepartments.rowCount !== req.body.departmentIds.length) {
      throw httpError(400, 'INVALID_DEPARTMENT', 'Every department ID must reference an active department.');
    }
    await client.query('DELETE FROM user_departments WHERE user_id = $1', [req.params.id]);
    for (const departmentId of req.body.departmentIds) {
      await client.query(
        'INSERT INTO user_departments (user_id, department_id) VALUES ($1, $2)',
        [req.params.id, departmentId]
      );
    }
    await recordAudit(client, {
      actorUserId: req.user.id,
      action: 'user.departments_changed',
      entityType: 'user',
      entityId: req.params.id,
      changes: { departmentIds: req.body.departmentIds },
      requestId: req.id
    });
    await client.query('COMMIT');
    return res.json({ userId: req.params.id, departmentIds: req.body.departmentIds });
  } catch (error) {
    if (client) await rollback(client);
    return next(error);
  } finally {
    client?.release();
  }
}

async function createOfficer(req, res, next) {
  let client;
  try {
    client = await pool.connect();
    const passwordHash = await bcrypt.hash(req.body.password, 12);
    await client.query('BEGIN');
    const userResult = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, 'department_officer')
       RETURNING id, full_name, email, role`,
      [req.body.fullName, req.body.email.toLowerCase(), passwordHash]
    );
    const ids = [...new Set(req.body.departmentIds)];
    const departments = await client.query(
      'SELECT id FROM departments WHERE id = ANY($1::uuid[]) AND is_active = TRUE',
      [ids]
    );
    if (departments.rowCount !== ids.length) {
      throw httpError(400, 'INVALID_DEPARTMENT', 'Every department ID must reference an active department.');
    }
    for (const departmentId of ids) {
      await client.query('INSERT INTO user_departments (user_id, department_id) VALUES ($1, $2)', [
        userResult.rows[0].id,
        departmentId
      ]);
    }
    await recordAudit(client, {
      actorUserId: req.user.id,
      action: 'user.department_officer_created',
      entityType: 'user',
      entityId: userResult.rows[0].id,
      changes: { departmentIds: ids },
      requestId: req.id
    });
    await client.query('COMMIT');
    return res.status(201).json({ user: userResult.rows[0], departmentIds: ids });
  } catch (error) {
    if (client) await rollback(client);
    if (error.code === '23505') {
      return next(httpError(409, 'EMAIL_EXISTS', 'An account with this email already exists.'));
    }
    return next(error);
  } finally {
    client?.release();
  }
}

async function createDepartment(req, res, next) {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO departments (code, name, description)
       VALUES ($1, $2, $3) RETURNING id, code, name, description, is_active`,
      [req.body.code.toUpperCase(), req.body.name, req.body.description || '']
    );
    await recordAudit(client, {
      actorUserId: req.user.id,
      action: 'department.created',
      entityType: 'department',
      entityId: result.rows[0].id,
      changes: { code: result.rows[0].code, name: result.rows[0].name },
      requestId: req.id
    });
    await client.query('COMMIT');
    return res.status(201).json({ department: result.rows[0] });
  } catch (error) {
    if (client) await rollback(client);
    if (error.code === '23505') {
      return next(httpError(409, 'DEPARTMENT_EXISTS', 'A department with this code or name already exists.'));
    }
    return next(error);
  } finally {
    client?.release();
  }
}

async function updateDepartment(req, res, next) {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE departments SET
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        is_active = COALESCE($4, is_active),
        updated_at = now()
       WHERE id = $1 RETURNING id, code, name, description, is_active`,
      [
        req.params.id,
        req.body.name || null,
        Object.hasOwn(req.body, 'description') ? req.body.description : null,
        Object.hasOwn(req.body, 'isActive') ? req.body.isActive : null
      ]
    );
    if (!result.rows[0]) throw httpError(404, 'DEPARTMENT_NOT_FOUND', 'Department not found.');
    await recordAudit(client, {
      actorUserId: req.user.id,
      action: 'department.updated',
      entityType: 'department',
      entityId: req.params.id,
      changes: Object.keys(req.body),
      requestId: req.id
    });
    await client.query('COMMIT');
    return res.json({ department: result.rows[0] });
  } catch (error) {
    if (client) await rollback(client);
    return next(error);
  } finally {
    client?.release();
  }
}

module.exports = {
  dashboard,
  statistics,
  auditLogs,
  setPriority,
  setStatus,
  calculatePriority,
  assignDepartments,
  createOfficer,
  createDepartment,
  updateDepartment
};
