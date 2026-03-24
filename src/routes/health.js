const express = require('express');
const router = express.Router();
const db = require('../config/database');

/**
 * GET /health
 * Returns server health status
 */
router.get('/', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
  };

  try {
    await db.query('SELECT 1');
    health.database = 'connected';
  } catch {
    health.database = 'error';
    health.status = 'degraded';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

module.exports = router;
