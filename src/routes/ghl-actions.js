const express = require('express');
const router = express.Router();
const { requireGhlWebhook } = require('../middleware/ghl-auth');
const lineService = require('../services/line');
const lineConnectionModel = require('../models/line-connection');
const contactModel = require('../models/contact');
const logModel = require('../models/log');

/**
 * POST /actions/send-line-text
 *
 * Called by GHL when a workflow reaches the "Send LINE Text" action step.
 * GHL sends the action data and we send the LINE Push Message.
 *
 * Expected payload from GHL:
 * {
 *   "data": {
 *     "message": "template with {{variables}}",
 *     "resolved_message": "resolved text after GHL variable substitution"
 *   },
 *   "extras": {
 *     "locationId": "...",
 *     "contactId": "...",
 *     "workflowId": "..."
 *   },
 *   "meta": {
 *     "key": "send_line_text",
 *     "version": "1.0"
 *   }
 * }
 */
router.post('/send-line-text', requireGhlWebhook, async (req, res) => {
  const { data, extras } = req.body;
  const locationId = extras?.locationId;
  const contactId = extras?.contactId;

  // Use resolved_message (GHL substituted variables) or fall back to raw message
  const messageText = data?.resolved_message || data?.message;

  if (!messageText) {
    return res.status(400).json({ status: 'failed', error: 'No message content provided' });
  }

  if (!contactId) {
    return res.status(400).json({ status: 'failed', error: 'No contactId provided' });
  }

  try {
    // 1. Get LINE UID for this GHL contact
    const lineUid = await contactModel.getLineUidByContactId(locationId, contactId);

    if (!lineUid) {
      const errMsg = `No LINE UID found for contact ${contactId}. The contact may not have added your LINE account as a friend yet.`;
      console.warn(`[GhlActions] ${errMsg}`);
      await logModel.create({
        locationId,
        direction: 'outbound',
        lineUid: null,
        ghlContactId: contactId,
        messageType: 'text',
        content: messageText,
        status: 'failed',
        errorDetail: errMsg,
      });
      return res.status(200).json({ status: 'failed', error: errMsg });
    }

    // 2. Get LINE access token for this location
    const lineConn = await lineConnectionModel.findByLocationId(locationId);
    if (!lineConn) {
      return res.status(200).json({
        status: 'failed',
        error: 'LINE channel not configured for this location. Please complete LINE Connect setup.',
      });
    }

    // 3. Send the LINE message
    const result = await lineService.sendTextMessage(lineConn.access_token, lineUid, messageText);

    // 4. Log success
    await logModel.create({
      locationId,
      direction: 'outbound',
      lineUid,
      ghlContactId: contactId,
      messageType: 'text',
      content: messageText,
      status: 'sent',
    });

    console.log(`[GhlActions] Sent LINE message to ${lineUid}, messageId=${result.messageId}`);

    return res.status(200).json({
      status: 'sent',
      messageId: result.messageId,
      lineUid,
    });
  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message;
    console.error('[GhlActions] Failed to send LINE message:', errorMsg);

    await logModel.create({
      locationId,
      direction: 'outbound',
      lineUid: null,
      ghlContactId: contactId,
      messageType: 'text',
      content: messageText,
      status: 'failed',
      errorDetail: errorMsg,
    }).catch(() => {});

    // Return 200 with error status so GHL doesn't retry indefinitely
    return res.status(200).json({ status: 'failed', error: errorMsg });
  }
});

module.exports = router;
