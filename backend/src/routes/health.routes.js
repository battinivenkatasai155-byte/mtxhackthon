const express = require('express');
const { checkDatabase } = require('../config/database');

const router = express.Router();

router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    requestId: req.id
  });
});

router.get('/ready', async (req, res) => {
  try {
    await checkDatabase();
    return res.status(200).json({
      status: 'ready',
      dependencies: { database: 'ok' },
      requestId: req.id
    });
  } catch (error) {
    return res.status(503).json({
      status: 'not_ready',
      dependencies: { database: 'unavailable' },
      requestId: req.id
    });
  }
});

module.exports = router;
