const express = require('express');
const { z } = require('zod');
const controller = require('../controllers/auth.controller');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { authenticationLimiter } = require('../middleware/rateLimit');

const router = express.Router();
const credentials = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(128)
});

router.post('/register', authenticationLimiter, validate({
  body: credentials.extend({ fullName: z.string().trim().min(1).max(160) })
}), controller.register);
router.post('/login', authenticationLimiter, validate({ body: credentials }), controller.login);
router.get('/me', authenticate, controller.me);

module.exports = router;
