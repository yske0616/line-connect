const db = require('../config/database');

/**
 * Save a new trigger subscription (called when GHL workflow step is created)
 */
async function upsert({ locationId, triggerKey, triggerId, targetUrl, workflowId }) {
  const result = await db.query(
    `INSERT INTO trigger_subscriptions
       (ghl_location_id, trigger_key, trigger_id, target_url, workflow_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (trigger_id) DO UPDATE SET
       target_url  = EXCLUDED.target_url,
       workflow_id = EXCLUDED.workflow_id,
       is_active   = true,
       updated_at  = NOW()
     RETURNING *`,
    [locationId, triggerKey, triggerId, targetUrl, workflowId]
  );
  return result.rows[0];
}

/**
 * Get all active trigger subscriptions for a location + trigger key
 */
async function findActive(locationId, triggerKey) {
  const result = await db.query(
    `SELECT * FROM trigger_subscriptions
     WHERE ghl_location_id = $1 AND trigger_key = $2 AND is_active = true`,
    [locationId, triggerKey]
  );
  return result.rows;
}

/**
 * Deactivate a trigger subscription (called when GHL workflow step is deleted)
 */
async function deactivate(triggerId) {
  await db.query(
    `UPDATE trigger_subscriptions SET is_active = false, updated_at = NOW()
     WHERE trigger_id = $1`,
    [triggerId]
  );
}

/**
 * Delete a trigger subscription permanently
 */
async function remove(triggerId) {
  await db.query(
    'DELETE FROM trigger_subscriptions WHERE trigger_id = $1',
    [triggerId]
  );
}

module.exports = { upsert, findActive, deactivate, remove };
