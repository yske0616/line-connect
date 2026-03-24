const db = require('../config/database');

/**
 * Find a LINE contact by locationId + lineUid
 */
async function findByLineUid(locationId, lineUid) {
  const result = await db.query(
    'SELECT * FROM line_contacts WHERE ghl_location_id = $1 AND line_uid = $2',
    [locationId, lineUid]
  );
  return result.rows[0] || null;
}

/**
 * Find a LINE contact by locationId + GHL contactId
 */
async function findByGhlContactId(locationId, ghlContactId) {
  const result = await db.query(
    'SELECT * FROM line_contacts WHERE ghl_location_id = $1 AND ghl_contact_id = $2',
    [locationId, ghlContactId]
  );
  return result.rows[0] || null;
}

/**
 * Get LINE UID for a GHL contact (used by workflow actions to send messages)
 */
async function getLineUidByContactId(locationId, ghlContactId) {
  const result = await db.query(
    `SELECT line_uid FROM line_contacts
     WHERE ghl_location_id = $1 AND ghl_contact_id = $2 AND is_blocked = false`,
    [locationId, ghlContactId]
  );
  return result.rows[0]?.line_uid || null;
}

/**
 * Create a new LINE contact mapping
 */
async function create({ locationId, ghlContactId, lineUid, displayName, pictureUrl }) {
  const result = await db.query(
    `INSERT INTO line_contacts
       (ghl_location_id, ghl_contact_id, line_uid, display_name, picture_url)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (ghl_location_id, line_uid) DO UPDATE SET
       ghl_contact_id = COALESCE(EXCLUDED.ghl_contact_id, line_contacts.ghl_contact_id),
       display_name   = EXCLUDED.display_name,
       picture_url    = EXCLUDED.picture_url,
       is_blocked     = false,
       updated_at     = NOW()
     RETURNING *`,
    [locationId, ghlContactId, lineUid, displayName, pictureUrl]
  );
  return result.rows[0];
}

/**
 * Update the GHL contact ID for a LINE contact
 */
async function updateGhlContactId(locationId, lineUid, ghlContactId) {
  const result = await db.query(
    `UPDATE line_contacts SET ghl_contact_id = $1, updated_at = NOW()
     WHERE ghl_location_id = $2 AND line_uid = $3
     RETURNING *`,
    [ghlContactId, locationId, lineUid]
  );
  return result.rows[0] || null;
}

/**
 * Mark a contact as blocked (LINE unfollow/block event)
 */
async function markBlocked(locationId, lineUid) {
  const result = await db.query(
    `UPDATE line_contacts SET is_blocked = true, updated_at = NOW()
     WHERE ghl_location_id = $1 AND line_uid = $2
     RETURNING *`,
    [locationId, lineUid]
  );
  return result.rows[0] || null;
}

module.exports = {
  findByLineUid,
  findByGhlContactId,
  getLineUidByContactId,
  create,
  updateGhlContactId,
  markBlocked,
};
