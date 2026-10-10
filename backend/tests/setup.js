process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = require('node:crypto').randomBytes(32).toString('hex');
