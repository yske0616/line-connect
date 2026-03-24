const db = require('../config/database');
const { encrypt, decrypt } = require('../config/encryption');

/**
 * Find LINE connection by locationId (decrypts tokens)
 */
async function findByLocationId(locationId) {
  const result = await db.query(
    'SELECT * FROM line_connections WHERE ghl_location_id = $1',
    [locationId]
  );
  if (!result.rows[0]) return null;
  return decryptRow(result.rows[0]);
}

/**
 * Upsert LINE connection (encrypts tokens before storing)
 */
async function upsert({ locationId, channelId, channelSecret, accessToken }) {
  const encryptedSecret = encrypt(channelSecret);
  const encryptedToken = encrypt(accessToken);

  const result = await db.query(
    `INSERT INTO line_connections
       (ghl_location_id, line_channel_id, channel_secret, access_token)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (ghl_location_id) DO UPDATE SET
       line_channel_id = EXCLUDED.line_channel_id,
       channel_secret  = EXCLUDED.channel_secret,
       access_token    = EXCLUDED.access_token,
       updated_at      = NOW()
     RETURNING *`,
    [locationId, channelId, encryptedSecret, encryptedToken]
  );
  return decryptRow(result.rows[0]);
}

/**
 * Update webhook status and last webhook time
 */
async function updateWebhookStatus(locationId, active) {
  const result = await db.query(
    `UPDATE line_connections SET
       webhook_active = $1,
       last_webhook_at = NOW(),
       updated_at = NOW()
     WHERE ghl_location_id = $2
     RETURNING *`,
    [active, locationId]
  );
  return result.rows[0] ? decryptRow(result.rows[0]) : null;
}

/**
 * Update friends count
 */
async function updateFriendsCount(locationId, count) {
  await db.query(
    `UPDATE line_connections SET friends_count = $1, updated_at = NOW()
     WHERE ghl_location_id = $2`,
    [count, locationId]
  );
}

/**
 * Record that a webhook was received
 */
async function touchWebhook(locationId) {
  await db.query(
    `UPDATE line_connections SET last_webhook_at = NOW(), webhook_active = true
     WHERE ghl_location_id = $1`,
    [locationId]
  );
}

/**
 * Delete LINE connection for a location
 */
async function deleteByLocationId(locationId) {
  await db.query(
    'DELETE FROM line_connections WHERE ghl_location_id = $1',
    [locationId]
  );
}

function decryptRow(row) {
  if (!row) return null;
  return {
    ...row,
    channel_secret: decrypt(row.channel_secret),
    access_token: decrypt(row.access_token),
  };
}

module.exports = {
  findByLocationId,
  upsert,
  updateWebhookStatus,
  updateFriendsCount,
  touchWebhook,
  deleteByLocationId,
};
