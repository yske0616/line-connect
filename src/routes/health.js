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

  // Conversation Provider 設定確認
  health.conversationProvider = process.env.GHL_CONVERSATION_PROVIDER_ID
    ? 'configured'
    : 'NOT SET ⚠️';

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

module.exports = router;
