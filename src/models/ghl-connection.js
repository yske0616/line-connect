const db = require('../config/database');

/**
 * Find a GHL connection by locationId
 */
async function findByLocationId(locationId) {
  const result = await db.query(
    'SELECT * FROM ghl_connections WHERE ghl_location_id = $1',
    [locationId]
  );
  return result.rows[0] || null;
}

/**
 * Upsert a GHL connection (create or update tokens)
 */
async function upsert({ locationId, companyId, accessToken, refreshToken, expiresIn }) {
  const expiresAt = new Date(Date.now() + (expiresIn || 86400) * 1000);
  const result = await db.query(
    `INSERT INTO ghl_connections
       (ghl_location_id, ghl_company_id, access_token, refresh_token, token_expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (ghl_location_id) DO UPDATE SET
       ghl_company_id   = EXCLUDED.ghl_company_id,
       access_token     = EXCLUDED.access_token,
       refresh_token    = EXCLUDED.refresh_token,
       token_expires_at = EXCLUDED.token_expires_at,
       updated_at       = NOW()
     RETURNING *`,
    [locationId, companyId, accessToken, refreshToken, expiresAt]
  );
  return result.rows[0];
}

/**
 * Update tokens after refresh
 */
async function updateTokens({ locationId, accessToken, refreshToken, expiresIn }) {
  const expiresAt = new Date(Date.now() + (expiresIn || 86400) * 1000);
  const result = await db.query(
    `UPDATE ghl_connections SET
       access_token     = $1,
       refresh_token    = $2,
       token_expires_at = $3,
       updated_at       = NOW()
     WHERE ghl_location_id = $4
     RETURNING *`,
    [accessToken, refreshToken, expiresAt, locationId]
  );
  return result.rows[0] || null;
}

/**
 * Check if token is expiring within 5 minutes
 */
function isTokenExpiringSoon(connection) {
  if (!connection.token_expires_at) return true;
  const fiveMinutes = 5 * 60 * 1000;
  return new Date(connection.token_expires_at).getTime() - Date.now() < fiveMinutes;
}

module.exports = { findByLocationId, upsert, updateTokens, isTokenExpiringSoon };
