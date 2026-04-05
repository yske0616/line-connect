const express = require('express');
const router = express.Router();
const ghlService = require('../services/ghl');
const ghlConnectionModel = require('../models/ghl-connection');
const ghlHelper = require('../services/ghl');

/**
 * GET /oauth/authorize
 * Initiates the GHL OAuth flow
 * GHL Marketplace redirects users here when installing the app
 */
router.get('/authorize', (req, res) => {
  const { locationId, companyId } = req.query;

  // GHL app version ID = app client ID の最初の部分（ハイフン以前）
  const appVersionId = (process.env.GHL_APP_CLIENT_ID || '').split('-')[0];

  const params = new URLSearchParams({
    response_type: 'code',
    redirect_uri: process.env.GHL_APP_REDIRECT_URI,
    client_id: process.env.GHL_APP_CLIENT_ID,
    scope: [
      'contacts.readonly',
      'contacts.write',
      'workflows.readonly',
      'opportunities.readonly',
      'locations.readonly',
      'locations/customFields.readonly',
      'locations/customFields.write',
    ].join(' '),
    ...(appVersionId && { appVersionId }),
  });

  const authUrl = `https://marketplace.gohighlevel.com/oauth/chooselocation?${params.toString()}`;
  console.log(`[OAuth] Redirecting to GHL OAuth: ${authUrl}`);
  res.redirect(authUrl);
});

/**
 * GET /oauth/callback
 * GHL redirects here after user grants OAuth consent
 * Exchanges the code for tokens and saves them
 */
router.get('/callback', async (req, res) => {
  const { code, locationId } = req.query;

  if (!code) {
    console.error('[OAuth] Missing authorization code');
    return res.status(400).send(`
      <html><body>
        <h2>Authorization Failed</h2>
        <p>Missing authorization code. Please try installing the app again.</p>
      </body></html>
    `);
  }

  try {
    console.log(`[OAuth] Exchanging code for tokens, locationId=${locationId}`);

    const tokenData = await ghlService.exchangeCodeForTokens(code, process.env.GHL_APP_REDIRECT_URI);
    const { access_token, refresh_token, expires_in, locationId: tokenLocationId, companyId } = tokenData;

    const resolvedLocationId = locationId || tokenLocationId;
    if (!resolvedLocationId) {
      throw new Error('Could not determine locationId from OAuth response');
    }

    await ghlConnectionModel.upsert({
      locationId: resolvedLocationId,
      companyId,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: expires_in,
    });

    // Ensure line_uid custom field exists for this location
    try {
      await ghlHelper.ensureLineUidField(resolvedLocationId);
    } catch (err) {
      console.warn('[OAuth] Could not ensure line_uid field:', err.message);
    }

    console.log(`[OAuth] Successfully installed for location: ${resolvedLocationId}`);

    // Redirect to the settings page inside GHL
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>LINE Connect — Installed</title>
          <style>
            body { font-family: sans-serif; display: flex; justify-content: center; align-items: center;
                   min-height: 100vh; margin: 0; background: #f5f5f5; }
            .card { background: white; padding: 40px; border-radius: 12px; text-align: center;
                    box-shadow: 0 2px 12px rgba(0,0,0,0.1); max-width: 480px; }
            .icon { font-size: 48px; margin-bottom: 16px; }
            h1 { color: #06C755; margin: 0 0 12px; }
            p { color: #666; margin: 0 0 24px; }
            a { display: inline-block; padding: 12px 24px; background: #06C755; color: white;
                text-decoration: none; border-radius: 8px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">🟢</div>
            <h1>LINE Connect Installed!</h1>
            <p>LINE Connect has been successfully connected to your GoHighLevel account.<br>
               Please configure your LINE channel credentials to start receiving and sending messages.</p>
            <a href="/settings?locationId=${resolvedLocationId}">Open Settings →</a>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('[OAuth] Token exchange failed:', err.response?.data || err.message);
    res.status(500).send(`
      <html><body>
        <h2>Authorization Failed</h2>
        <p>Error: ${err.message}</p>
        <p>Please try installing the app again.</p>
      </body></html>
    `);
  }
});

module.exports = router;
