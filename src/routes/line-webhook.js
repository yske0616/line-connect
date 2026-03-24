const express = require('express');
const router = express.Router();
const { loadLineConnection, verifyLineSignature } = require('../middleware/line-signature');
const lineConnectionModel = require('../models/line-connection');
const contactMapper = require('../services/contact-mapper');

/**
 * POST /webhook/:locationId
 *
 * Receives LINE Webhook events for a specific GHL location.
 * Each location has its own webhook URL: /webhook/{ghl_location_id}
 *
 * LINE sends events like: follow, unfollow, message
 *
 * IMPORTANT: This route uses express.raw() for body parsing to allow
 * signature verification. The rawBody is captured in the main index.js.
 */
router.post('/:locationId', loadLineConnection, verifyLineSignature, async (req, res) => {
  // Immediately respond 200 to LINE (LINE expects a fast response)
  res.status(200).json({ status: 'ok' });

  const locationId = req.params.locationId;
  const { lineConnection } = req;
  const { events } = req.body;

  if (!events || events.length === 0) {
    return; // Verification webhook or empty event
  }

  console.log(`[LineWebhook] Received ${events.length} event(s) for location ${locationId}`);

  // Update last webhook timestamp
  await lineConnectionModel.touchWebhook(locationId).catch(() => {});

  // Process each event asynchronously
  for (const event of events) {
    try {
      await processEvent(locationId, lineConnection.access_token, event);
    } catch (err) {
      console.error(`[LineWebhook] Error processing event type=${event.type}:`, err.message);
    }
  }
});

/**
 * Process a single LINE event
 */
async function processEvent(locationId, lineAccessToken, event) {
  const userId = event.source?.userId;
  if (!userId) {
    console.warn('[LineWebhook] Event has no userId, skipping');
    return;
  }

  const timestamp = event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString();

  switch (event.type) {
    case 'follow':
      // User added the bot as a friend
      await contactMapper.handleFollow(locationId, lineAccessToken, userId, timestamp);
      break;

    case 'message':
      // User sent a message
      if (event.message?.type === 'text') {
        await contactMapper.handleMessage(
          locationId,
          lineAccessToken,
          userId,
          event.message.text,
          event.replyToken,
          timestamp
        );
      } else {
        console.log(`[LineWebhook] Unsupported message type: ${event.message?.type} (Phase 3)`);
      }
      break;

    case 'unfollow':
      // User blocked or unfollowed the bot
      await contactMapper.handleUnfollow(locationId, userId, timestamp);
      break;

    case 'postback':
      // Button/carousel tap (Phase 2)
      console.log(`[LineWebhook] Postback event (Phase 2): data=${event.postback?.data}`);
      break;

    default:
      console.log(`[LineWebhook] Unhandled event type: ${event.type}`);
  }
}

module.exports = router;
