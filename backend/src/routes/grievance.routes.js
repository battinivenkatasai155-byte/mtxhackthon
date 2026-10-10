const express = require('express');
const { z } = require('zod');
const controller = require('../controllers/grievance.controller');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { requireRoles } = require('../middleware/auth');
const { receiveAttachments, validateAttachmentContents, parseMultipartFields } = require('../middleware/upload');
const { publicLimiter } = require('../middleware/rateLimit');

const router = express.Router();
const grievanceBody = z.object({
  subject: z.string().trim().min(5).max(200),
  description: z.string().trim().min(10).max(10000),
  category: z.string().trim().min(1).max(100).optional(),
  affectedPeople: z.number().int().min(1).max(1000000).optional(),
  ongoingIncident: z.boolean().optional(),
  location: z.object({
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    district: z.string().trim().max(120).optional(),
    region: z.string().trim().max(120).optional(),
    description: z.string().trim().max(300).optional()
  }).strict().optional()
});
const patchBody = grievanceBody.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field must be provided.'
});
const idParams = z.object({ id: z.string().uuid() });
const reassignBody = z.object({
  departmentId: z.string().uuid(),
  reason: z.string().trim().min(10).max(1000)
});
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['created_at', 'updated_at', 'priority']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  status: z.enum([
    'submitted', 'under_review', 'classified', 'assigned', 'in_progress',
    'awaiting_information', 'resolved', 'rejected', 'reopened'
  ]).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  search: z.string().trim().min(1).max(100).optional()
});

router.get('/track/:trackingId', publicLimiter, validate({
  params: z.object({ trackingId: z.string().regex(/^CPG-\d{4}-[A-F0-9]{36}$/) })
}), controller.track);
router.use(authenticate);
router.post('/', requireRoles('citizen'), receiveAttachments, validateAttachmentContents, parseMultipartFields, validate({ body: grievanceBody }), controller.create);
router.get('/', validate({ query: listQuery }), controller.list);
router.get('/:id/history', validate({ params: idParams }), controller.history);
router.get('/:id/attachments/:attachmentId', validate({
  params: idParams.extend({ attachmentId: z.string().uuid() })
}), controller.downloadAttachment);
router.post('/:id/classify', requireRoles('administrator'), validate({ params: idParams }), controller.classify);
router.post('/:id/route', requireRoles('administrator'), validate({
  params: idParams,
  body: z.object({
    reviewReason: z.string().trim().min(10).max(1000).optional()
  }).default({})
}), controller.route);
router.get('/:id/routing', validate({ params: idParams }), controller.routing);
router.post('/:id/reassign', requireRoles('administrator'), validate({
  params: idParams,
  body: reassignBody
}), controller.reassign);
router.patch('/:id/status', validate({
  params: idParams,
  body: z.object({
    status: z.enum([
      'submitted', 'under_review', 'classified', 'assigned', 'in_progress',
      'awaiting_information', 'resolved', 'rejected', 'reopened'
    ]),
    explanation: z.string().trim().max(1000).optional()
  })
}), controller.updateStatus);
router.get('/:id', validate({ params: idParams }), controller.get);
router.patch('/:id', requireRoles('citizen'), validate({ params: idParams, body: patchBody }), controller.update);

module.exports = router;
