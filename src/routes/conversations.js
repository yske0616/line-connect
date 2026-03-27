const express = require('express');
const router = express.Router();
const ghlService = require('../services/ghl');
const lineService = require('../services/line');
const lineConnectionModel = require('../models/line-connection');
const contactModel = require('../models/contact');
const logModel = require('../models/log');

/**
 * POST /conversations/outbound
 *
 * Called by GHL when a user replies from the Unified Inbox.
 * This is the "Delivery URL" registered in the Conversation Provider settings.
 *
 * GHL Payload:
 * {
 *   "contactId":  "GKBhT6BfwY9mjzXAU3sq",
 *   "locationId": "GKAWb4yu7A4LSc0skQ6g",
 *   "messageId":  "GKJxs4P5L8dWc5CFUITM",  <- GHL's message ID, used to update status
 *   "type":       "SMS",
 *   "phone":      "+81...",                   <- may be empty for LINE contacts
 *   "message":    "Reply text from GHL user",
 *   "attachments": [],
 *   "userId":     "GK56r6wdJDrkUPd0xsmx"
 * }
 *
 * Flow:
 * 1. Respond 200 immediately (GHL requires fast ACK)
 * 2. Look up LINE UID from line_contacts by contactId
 * 3. Send message to LINE via Push Message API
 * 4. Update GHL message status to "delivered" (or "failed")
 */
router.post('/outbound', async (req, res) => {
  // Always respond 200 immediately — GHL will not retry on 2xx
  res.status(200).json({ status: 'accepted' });

  const { contactId, locationId, messageId, message, attachments } = req.body;

  if (!locationId || !contactId || !messageId) {
    console.warn('[Conversations] Missing required fields in outbound webhook:', req.body);
    return;
  }

  console.log(`[Conversations] Outbound webhook: location=${locationId}, contact=${contactId}, messageId=${messageId}`);

  // Process asynchronously after responding
  handleOutbound({ locationId, contactId, messageId, message, attachments }).catch((err) => {
    console.error('[Conversations] Unhandled error in handleOutbound:', err.message);
  });
});

async function handleOutbound({ locationId, contactId, messageId, message, attachments }) {
  let lineUid = null;

  try {
    // 1. Look up LINE UID for this GHL contact
    lineUid = await contactModel.getLineUidByContactId(locationId, contactId);

    if (!lineUid) {
      console.warn(`[Conversations] No LINE UID for contact ${contactId} — cannot deliver outbound message`);
      await ghlService.updateMessageStatus(locationId, messageId, 'failed').catch(() => {});
      await logModel.create({
        locationId,
        direction: 'outbound',
        lineUid: null,
        ghlContactId: contactId,
        messageType: 'text',
        content: message,
        status: 'failed',
        errorDetail: 'No LINE UID found for this contact',
      }).catch(() => {});
      return;
    }

    // 2. Get LINE access token for this location
    const lineConn = await lineConnectionModel.findByLocationId(locationId);
    if (!lineConn) {
      console.warn(`[Conversations] No LINE connection for location ${locationId}`);
      await ghlService.updateMessageStatus(locationId, messageId, 'failed').catch(() => {});
      return;
    }

    // 3. Send message to LINE
    await lineService.sendTextMessage(lineConn.access_token, lineUid, message || '');

    // 4. Update GHL message status to delivered
    await ghlService.updateMessageStatus(locationId, messageId, 'delivered').catch((err) => {
      console.error('[Conversations] Failed to update message status:', err.message);
    });

    // 5. Log outbound message
    await logModel.create({
      locationId,
      direction: 'outbound',
      lineUid,
      ghlContactId: contactId,
      messageType: 'text',
      content: message,
      status: 'sent',
    }).catch(() => {});

    console.log(`[Conversations] Delivered outbound message to LINE UID ${lineUid}`);
  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message;
    console.error('[Conversations] Failed to deliver outbound message:', errorMsg);

    await ghlService.updateMessageStatus(locationId, messageId, 'failed').catch(() => {});
    await logModel.create({
      locationId,
      direction: 'outbound',
      lineUid,
      ghlContactId: contactId,
      messageType: 'text',
      content: message,
      status: 'failed',
      errorDetail: errorMsg,
    }).catch(() => {});
  }
}

module.exports = router;
