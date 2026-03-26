const crypto = require('crypto');
const lineConnectionModel = require('../models/line-connection');

/**
 * Middleware to verify LINE Webhook signature
 * LINE signs requests with HMAC-SHA256 using the channel secret
 *
 * Must be used AFTER express.raw() body parsing (not express.json())
 * The raw body is needed for signature verification
 */
function verifyLineSignature(req, res, next) {
  const signature = req.headers['x-line-signature'];

  if (!signature) {
    console.warn('[LineSignature] Missing x-line-signature header');
    return res.status(400).json({ error: 'Missing signature' });
  }

  const channelSecret = req.lineChannelSecret;
  if (!channelSecret) {
    // channelSecret should be attached by the route handler after DB lookup
    console.error('[LineSignature] Channel secret not available in request');
    return res.status(500).json({ error: 'Configuration error' });
  }

  const body = req.rawBody || req.body;
  const bodyString = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));

  const expected = crypto
    .createHmac('sha256', channelSecret)
    .update(bodyString)
    .digest('base64');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    console.warn('[LineSignature] Invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  next();
}

/**
 * Middleware to load LINE connection for a given locationId URL param
 * Attaches lineConnection and lineChannelSecret to req
 */
async function loadLineConnection(req, res, next) {
  const locationId = req.params.locationId;
  if (!locationId) {
    return res.status(400).json({ error: 'Missing locationId' });
  }

  try {
    const conn = await lineConnectionModel.findByLocationId(locationId);
    if (!conn) {
      console.warn(`[LineSignature] No LINE connection found for location: ${locationId}`);
      // LINE の Webhook Verify リクエストは認証情報未設定でも 200 を返す
      // （LINE は 200 が返れば Verify 成功と判断する）
      return res.status(200).json({ status: 'ok', message: 'LINE not configured yet' });
    }

    req.lineConnection = conn;
    req.lineChannelSecret = conn.channel_secret;
    next();
  } catch (err) {
    console.error('[LineSignature] DB error loading connection:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
}

module.exports = { verifyLineSignature, loadLineConnection };
