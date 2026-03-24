const express = require('express');
const router = express.Router();
const { requireGhlSso, decryptSsoData } = require('../middleware/ghl-auth');
const lineConnectionModel = require('../models/line-connection');
const ghlConnectionModel = require('../models/ghl-connection');
const lineService = require('../services/line');
const logModel = require('../models/log');

/**
 * GET /settings
 * Serves the settings page HTML (loaded inside GHL as a custom page/iframe)
 */
router.get('/', (req, res) => {
  res.sendFile('index.html', { root: 'ui' });
});

/**
 * POST /api/settings/decrypt-sso
 * Decrypt the GHL SSO userData to get locationId
 * Called from the settings page frontend on load
 */
router.post('/api/settings/decrypt-sso', (req, res) => {
  const { userData } = req.body;
  try {
    const data = decryptSsoData(userData);
    res.json({ locationId: data.locationId, userId: data.userId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/settings/status
 * Returns the current LINE connection status for a location
 * Query param: ?locationId=... (passed directly when inside GHL iframe)
 */
router.get('/api/settings/status', async (req, res) => {
  const locationId = req.query.locationId;
  if (!locationId) {
    return res.status(400).json({ error: 'Missing locationId' });
  }

  try {
    const ghlConn = await ghlConnectionModel.findByLocationId(locationId);
    if (!ghlConn) {
      return res.json({
        ghlConnected: false,
        lineConnected: false,
        webhookUrl: buildWebhookUrl(locationId, req),
      });
    }

    const lineConn = await lineConnectionModel.findByLocationId(locationId);

    const status = {
      ghlConnected: true,
      lineConnected: !!lineConn,
      webhookUrl: buildWebhookUrl(locationId, req),
      lastWebhookAt: lineConn?.last_webhook_at || null,
      friendsCount: lineConn?.friends_count || 0,
      channelId: lineConn?.line_channel_id || null,
    };

    res.json(status);
  } catch (err) {
    console.error('[Settings] Status error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * POST /api/settings/line-connect
 * Save LINE channel credentials for a location
 * Body: { locationId, channelId, channelSecret, accessToken }
 */
router.post('/api/settings/line-connect', async (req, res) => {
  const { locationId, channelId, channelSecret, accessToken } = req.body;

  if (!locationId || !channelId || !channelSecret || !accessToken) {
    return res.status(400).json({ error: 'Missing required fields: locationId, channelId, channelSecret, accessToken' });
  }

  try {
    // Verify the token is valid before saving
    const verification = await lineService.verifyToken(accessToken, channelId);
    if (!verification.valid) {
      return res.status(400).json({
        error: `LINE token verification failed: ${verification.error}. Please check your Channel Access Token.`,
      });
    }

    await lineConnectionModel.upsert({ locationId, channelId, channelSecret, accessToken });

    // Try to get friend count
    const friendsCount = await lineService.getFriendCount(accessToken);
    if (friendsCount > 0) {
      await lineConnectionModel.updateFriendsCount(locationId, friendsCount);
    }

    console.log(`[Settings] LINE connection saved for location: ${locationId}`);
    res.json({
      status: 'connected',
      webhookUrl: buildWebhookUrl(locationId, req),
      friendsCount,
    });
  } catch (err) {
    console.error('[Settings] Failed to save LINE connection:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/settings/line-test
 * Test the LINE connection by verifying the token
 * Body: { locationId } or { accessToken }
 */
router.post('/api/settings/line-test', async (req, res) => {
  const { locationId, accessToken: directToken, channelId, channelSecret } = req.body;

  try {
    let token = directToken;

    if (!token && locationId) {
      const lineConn = await lineConnectionModel.findByLocationId(locationId);
      if (!lineConn) {
        return res.json({ valid: false, error: 'LINE not configured for this location' });
      }
      token = lineConn.access_token;
    }

    if (!token) {
      return res.status(400).json({ error: 'No access token provided' });
    }

    const result = await lineService.verifyToken(token, channelId);
    const friendsCount = result.valid ? await lineService.getFriendCount(token) : 0;

    res.json({
      valid: result.valid,
      error: result.error,
      friendsCount,
      webhookEndpoint: result.webhookEndpoint,
    });
  } catch (err) {
    res.json({ valid: false, error: err.message });
  }
});

/**
 * DELETE /api/settings/line-connect
 * Remove LINE connection for a location
 * Body: { locationId }
 */
router.delete('/api/settings/line-connect', async (req, res) => {
  const { locationId } = req.body;
  if (!locationId) {
    return res.status(400).json({ error: 'Missing locationId' });
  }

  try {
    await lineConnectionModel.deleteByLocationId(locationId);
    res.json({ status: 'disconnected' });
  } catch (err) {
    console.error('[Settings] Failed to delete LINE connection:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/settings/logs
 * Get recent message logs for a location
 */
router.get('/api/settings/logs', async (req, res) => {
  const { locationId, limit } = req.query;
  if (!locationId) return res.status(400).json({ error: 'Missing locationId' });

  try {
    const logs = await logModel.getRecent(locationId, parseInt(limit) || 20);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Build the Webhook URL for a location
 */
function buildWebhookUrl(locationId, req) {
  const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
  return `${baseUrl}/webhook/${locationId}`;
}

module.exports = router;
