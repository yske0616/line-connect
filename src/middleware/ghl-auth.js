const CryptoJS = require('crypto-js');
const ghlConnectionModel = require('../models/ghl-connection');

/**
 * Decrypt GHL SSO userData parameter
 * GHL encrypts user context with the app's client secret using AES
 * Used to identify the locationId when loading the settings page inside GHL
 */
function decryptSsoData(encryptedData) {
  if (!encryptedData) throw new Error('No userData provided');
  const secret = process.env.GHL_APP_CLIENT_SECRET;
  if (!secret) throw new Error('GHL_APP_CLIENT_SECRET not configured');

  const decrypted = CryptoJS.AES.decrypt(encryptedData, secret).toString(CryptoJS.enc.Utf8);
  if (!decrypted) throw new Error('Failed to decrypt userData');

  return JSON.parse(decrypted);
  // Returns: { locationId, companyId, userId, ... }
}

/**
 * Middleware to verify GHL SSO and attach locationId to req
 * Used for the settings page API endpoints
 */
async function requireGhlSso(req, res, next) {
  const userData = req.query.userData || req.headers['x-ghl-userdata'];

  if (!userData) {
    return res.status(401).json({ error: 'Unauthorized: missing userData' });
  }

  try {
    const ssoData = decryptSsoData(userData);
    req.ghlLocationId = ssoData.locationId;
    req.ghlUserId = ssoData.userId;
    req.ghlCompanyId = ssoData.companyId;
    next();
  } catch (err) {
    console.error('[GhlAuth] SSO decryption failed:', err.message);
    res.status(401).json({ error: 'Unauthorized: invalid userData' });
  }
}

/**
 * Middleware to verify GHL custom action/trigger webhook
 * GHL actions include a basic auth or API key in headers
 * For now, we verify that the locationId in the payload matches a known connection
 */
async function requireGhlWebhook(req, res, next) {
  const { extras } = req.body || {};
  const locationId = extras?.locationId;

  if (!locationId) {
    return res.status(400).json({ error: 'Missing locationId in request' });
  }

  try {
    const conn = await ghlConnectionModel.findByLocationId(locationId);
    if (!conn) {
      return res.status(404).json({ error: 'Unknown location' });
    }
    req.ghlLocationId = locationId;
    next();
  } catch (err) {
    console.error('[GhlAuth] Webhook auth error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
}

module.exports = { decryptSsoData, requireGhlSso, requireGhlWebhook };
