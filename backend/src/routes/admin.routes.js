const express = require('express');
const { z } = require('zod');
const controller = require('../controllers/admin.controller');
const validate = require('../middleware/validate');
const { authenticate, requireRoles } = require('../middleware/auth');

const router = express.Router();
const idParams = z.object({ id: z.string().uuid() });
const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});
router.use(authenticate, requireRoles('administrator'));
router.get('/dashboard', controller.dashboard);
router.get('/statistics', controller.statistics);
router.get('/audit-logs', validate({ query: pagination }), controller.auditLogs);
router.post('/users/officers', validate({
  body: z.object({
    fullName: z.string().trim().min(1).max(160),
    email: z.string().email().max(254),
    password: z.string().min(12).max(128),
    departmentIds: z.array(z.string().uuid()).min(1).max(50)
  })
}), controller.createOfficer);
router.post('/departments', validate({
  body: z.object({
    code: z.string().trim().regex(/^[a-zA-Z0-9_-]{2,32}$/),
    name: z.string().trim().min(2).max(160),
    description: z.string().trim().max(1000).optional()
  })
}), controller.createDepartment);
router.patch('/departments/:id', validate({
  params: idParams,
  body: z.object({
    name: z.string().trim().min(2).max(160).optional(),
    description: z.string().trim().max(1000).optional(),
    isActive: z.boolean().optional()
  }).refine((body) => Object.keys(body).length > 0, { message: 'At least one field must be provided.' })
}), controller.updateDepartment);
router.patch('/grievances/:id/priority', validate({
  params: idParams,
  body: z.object({
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    reason: z.string().trim().min(10).max(1000)
  })
}), controller.setPriority);
router.post('/grievances/:id/priority/calculate', validate({ params: idParams }), controller.calculatePriority);
router.patch('/grievances/:id/status', validate({
  params: idParams,
  body: z.object({
    status: z.enum([
      'submitted', 'under_review', 'classified', 'assigned', 'in_progress',
      'awaiting_information', 'resolved', 'rejected', 'reopened'
    ]),
    explanation: z.string().trim().max(1000).optional()
  })
}), controller.setStatus);
router.patch('/users/:id/departments', validate({
  params: idParams,
  body: z.object({ departmentIds: z.array(z.string().uuid()).max(50) })
}), controller.assignDepartments);

module.exports = router;
