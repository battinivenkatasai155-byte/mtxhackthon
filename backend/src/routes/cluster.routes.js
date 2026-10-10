const express = require('express');
const { z } = require('zod');
const controller = require('../controllers/cluster.controller');
const validate = require('../middleware/validate');
const { authenticate, requireRoles } = require('../middleware/auth');

const router = express.Router();
const idParams = z.object({ id: z.string().uuid() });
router.use(authenticate, requireRoles('administrator'));
router.get('/', controller.list);
router.post('/analyze', validate({
  body: z.object({ grievanceIds: z.array(z.string().uuid()).min(2).max(20) })
}), controller.analyze);
router.get('/:id/grievances', validate({ params: idParams }), controller.grievances);
router.post('/:id/grievances', validate({
  params: idParams,
  body: z.object({ grievanceId: z.string().uuid() })
}), controller.addMember);
router.delete('/:id/grievances/:grievanceId', validate({
  params: idParams.extend({ grievanceId: z.string().uuid() })
}), controller.removeMember);
router.post('/:id/review', validate({
  params: idParams,
  body: z.object({
    state: z.enum(['confirmed', 'rejected']),
    reason: z.string().trim().min(10).max(1000)
  })
}), controller.review);
router.get('/:id', validate({ params: idParams }), controller.get);

module.exports = router;
