const express = require('express');
const router = express.Router();
const triggerSubModel = require('../models/trigger-subscription');

/**
 * POST /triggers/subscribe
 *
 * Called by GHL when a workflow trigger step is created, updated, or deleted.
 * We store the targetUrl so we can fire events to it later.
 *
 * GHL sends:
 * {
 *   "triggerData": {
 *     "id": "trigger-instance-id",
 *     "key": "line_friend_added",
 *     "filters": [],
 *     "eventType": "CREATED" | "UPDATED" | "DELETED",
 *     "targetUrl": "https://services.leadconnectorhq.com/workflows-marketplace/triggers/execute/..."
 *   },
 *   "meta": { "key": "line_friend_added", "version": "2.4" },
 *   "extras": { "locationId": "...", "workflowId": "...", "companyId": "..." }
 * }
 */
router.post('/subscribe', async (req, res) => {
  const { triggerData, extras } = req.body;

  if (!triggerData || !extras?.locationId) {
    return res.status(400).json({ error: 'Invalid subscription payload' });
  }

  const { id: triggerId, key: triggerKey, eventType, targetUrl } = triggerData;
  const { locationId, workflowId } = extras;

  console.log(`[Triggers] Subscription event: type=${eventType}, key=${triggerKey}, location=${locationId}`);

  try {
    switch (eventType) {
      case 'CREATED':
      case 'UPDATED':
        await triggerSubModel.upsert({
          locationId,
          triggerKey,
          triggerId,
          targetUrl,
          workflowId,
        });
        console.log(`[Triggers] Saved subscription: ${triggerId} → ${targetUrl}`);
        break;

      case 'DELETED':
        await triggerSubModel.deactivate(triggerId);
        console.log(`[Triggers] Deactivated subscription: ${triggerId}`);
        break;

      default:
        console.warn(`[Triggers] Unknown eventType: ${eventType}`);
    }

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[Triggers] Failed to handle subscription:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * GET /triggers/subscribe
 * Health check for the subscription endpoint (some GHL integrations ping this)
 */
router.get('/subscribe', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'LINE Connect trigger subscription endpoint' });
});

module.exports = router;
