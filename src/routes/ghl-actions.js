const express = require('express');
const router = express.Router();
const { requireGhlWebhook } = require('../middleware/ghl-auth');
const lineService = require('../services/line');
const { buildFlexContents } = require('../services/flex-templates');
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

/**
 * POST /actions/send-line-image
 *
 * Called by GHL when a workflow reaches the "Send LINE Image" action step.
 * GHL sends the image URL and we send a LINE Push Message with an image.
 *
 * Expected payload from GHL:
 * {
 *   "data": {
 *     "image_url": "https://example.com/image.jpg",
 *     "preview_url": "https://example.com/preview.jpg"  // optional
 *   },
 *   "extras": {
 *     "locationId": "...",
 *     "contactId": "...",
 *     "workflowId": "..."
 *   },
 *   "meta": {
 *     "key": "send_line_image",
 *     "version": "1.0"
 *   }
 * }
 */
router.post('/send-line-image', requireGhlWebhook, async (req, res) => {
  const { data, extras } = req.body;
  const locationId = extras?.locationId;
  const contactId = extras?.contactId;

  const imageUrl = data?.image_url;
  const previewUrl = data?.preview_url || imageUrl;

  if (!imageUrl) {
    return res.status(400).json({ status: 'failed', error: 'No image_url provided' });
  }

  if (!imageUrl.startsWith('https://')) {
    return res.status(400).json({ status: 'failed', error: 'image_url must use HTTPS' });
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
        messageType: 'image',
        content: imageUrl,
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

    // 3. Send the LINE image message
    const result = await lineService.sendImageMessage(lineConn.access_token, lineUid, imageUrl, previewUrl);

    // 4. Log success
    await logModel.create({
      locationId,
      direction: 'outbound',
      lineUid,
      ghlContactId: contactId,
      messageType: 'image',
      content: imageUrl,
      status: 'sent',
    });

    console.log(`[GhlActions] Sent LINE image to ${lineUid}, messageId=${result.messageId}`);

    return res.status(200).json({
      status: 'sent',
      messageId: result.messageId,
      lineUid,
    });
  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message;
    console.error('[GhlActions] Failed to send LINE image:', errorMsg);

    await logModel.create({
      locationId,
      direction: 'outbound',
      lineUid: null,
      ghlContactId: contactId,
      messageType: 'image',
      content: imageUrl,
      status: 'failed',
      errorDetail: errorMsg,
    }).catch(() => {});

    return res.status(200).json({ status: 'failed', error: errorMsg });
  }
});

/**
 * POST /actions/send-line-flex
 *
 * Called by GHL when a workflow reaches the "Send LINE Flex Message" action step.
 * Uses preset templates — no JSON knowledge required from the end user.
 *
 * Expected payload from GHL:
 * {
 *   "data": {
 *     "template_type": "booking_confirmation" | "reminder" | "testimonial" | "announcement",
 *     "title": "ご予約ありがとうございます！",
 *     "body": "{{contact.first_name}}様のご予約を承りました。",
 *     "image_url": "https://example.com/image.jpg",   // optional
 *     "button_text": "予約内容を確認する",              // optional
 *     "button_url": "https://example.com/booking"     // optional
 *   },
 *   "extras": {
 *     "locationId": "...",
 *     "contactId": "...",
 *     "workflowId": "..."
 *   },
 *   "meta": {
 *     "key": "send_line_flex",
 *     "version": "2.0"
 *   }
 * }
 */
router.post('/send-line-flex', requireGhlWebhook, async (req, res) => {
  const { data, extras } = req.body;
  const locationId = extras?.locationId;
  const contactId = extras?.contactId;

  const templateType = data?.template_type;
  const title = data?.title;
  const body = data?.body;
  const imageUrl = data?.image_url || null;
  const buttonText = data?.button_text || null;
  const buttonUrl = data?.button_url || null;

  if (!templateType) {
    return res.status(400).json({ status: 'failed', error: 'テンプレートの種類（template_type）が指定されていません' });
  }
  if (!title) {
    return res.status(400).json({ status: 'failed', error: 'タイトルが入力されていません' });
  }
  if (!body) {
    return res.status(400).json({ status: 'failed', error: '本文が入力されていません' });
  }
  if (!contactId) {
    return res.status(400).json({ status: 'failed', error: 'No contactId provided' });
  }

  // Build Flex Message from preset template
  let flexContents;
  try {
    flexContents = buildFlexContents({ templateType, title, body, imageUrl, buttonText, buttonUrl });
  } catch (buildErr) {
    return res.status(400).json({ status: 'failed', error: buildErr.message });
  }

  // Use title as alt text (shown in push notifications)
  const altText = title;

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
        messageType: 'flex',
        content: altText,
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

    // 3. Send the Flex Message
    const result = await lineService.sendFlexMessage(lineConn.access_token, lineUid, altText, flexContents);

    // 4. Log success
    await logModel.create({
      locationId,
      direction: 'outbound',
      lineUid,
      ghlContactId: contactId,
      messageType: 'flex',
      content: `[${templateType}] ${altText}`,
      status: 'sent',
    });

    console.log(`[GhlActions] Sent LINE flex (${templateType}) to ${lineUid}, messageId=${result.messageId}`);

    return res.status(200).json({
      status: 'sent',
      messageId: result.messageId,
      lineUid,
      templateType,
    });
  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message;
    console.error('[GhlActions] Failed to send LINE flex message:', errorMsg);

    await logModel.create({
      locationId,
      direction: 'outbound',
      lineUid: null,
      ghlContactId: contactId,
      messageType: 'flex',
      content: altText,
      status: 'failed',
      errorDetail: errorMsg,
    }).catch(() => {});

    return res.status(200).json({ status: 'failed', error: errorMsg });
  }
});

module.exports = router;
