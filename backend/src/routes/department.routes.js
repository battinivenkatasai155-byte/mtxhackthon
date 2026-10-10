const express = require('express');
const { z } = require('zod');
const controller = require('../controllers/department.controller');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const idParams = z.object({ id: z.string().uuid() });
const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

router.get('/', controller.list);
router.get('/:id', validate({ params: idParams }), controller.get);
router.get('/:id/grievances', authenticate, validate({ params: idParams, query: pagination }), controller.grievances);
router.get('/:id/statistics', authenticate, validate({ params: idParams }), controller.statistics);

module.exports = router;
