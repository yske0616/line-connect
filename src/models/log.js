const db = require('../config/database');

/**
 * Create a message log entry
 */
async function create({ locationId, direction, lineUid, ghlContactId, messageType, content, status, errorDetail }) {
  const result = await db.query(
    `INSERT INTO message_logs
       (ghl_location_id, direction, line_uid, ghl_contact_id, message_type, content, status, error_detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [locationId, direction, lineUid, ghlContactId, messageType, content, status, errorDetail || null]
  );
  return result.rows[0];
}

/**
 * Get recent logs for a location
 */
async function getRecent(locationId, limit = 50) {
  const result = await db.query(
    `SELECT * FROM message_logs
     WHERE ghl_location_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [locationId, limit]
  );
  return result.rows;
}

module.exports = { create, getRecent };
