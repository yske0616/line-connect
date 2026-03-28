const ghlService = require('./ghl');
const lineService = require('./line');
const contactModel = require('../models/contact');
const triggerSubModel = require('../models/trigger-subscription');
const logModel = require('../models/log');

const LINE_FRIEND_TAG = 'LINE友だち';

/**
 * Handle a LINE follow event (friend added)
 * 1. Get LINE user profile
 * 2. Find or create GHL contact
 *    - refContactId がある場合: 既存コンタクトに LINE UID を紐づけ（新規作成しない）
 *    - refContactId がない場合: 新規コンタクトを作成
 * 3. Save line_uid mapping
 * 4. Add "LINE友だち" tag
 * 5. Fire GHL custom trigger "line_friend_added"
 *
 * @param {string} refContactId - GHL contact ID passed via LINE add friend URL (?ref=contactId)
 */
async function handleFollow(locationId, lineAccessToken, userId, timestamp, refContactId = null) {
  console.log(`[ContactMapper] Follow event: location=${locationId}, user=${userId}, ref=${refContactId || 'none'}`);

  // 1. Get LINE user profile
  let profile;
  try {
    profile = await lineService.getUserProfile(lineAccessToken, userId);
  } catch (err) {
    console.error('[ContactMapper] Failed to get LINE profile:', err.message);
    profile = { userId, displayName: `LINE User ${userId.slice(-4)}`, pictureUrl: null };
  }

  const { displayName, pictureUrl } = profile;

  // 2. Check if we already have this LINE user mapped
  let lineContact = await contactModel.findByLineUid(locationId, userId);
  let ghlContactId = lineContact?.ghl_contact_id;

  // 3. Determine the GHL contact to link to
  if (!ghlContactId) {
    if (refContactId) {
      // --- パターン A: ref パラメータあり → 既存コンタクトに紐づける ---
      try {
        const existingContact = await ghlService.getContact(locationId, refContactId);
        if (existingContact) {
          ghlContactId = refContactId;
          await ghlService.addTags(locationId, ghlContactId, [LINE_FRIEND_TAG]);
          await ghlService.updateCustomFields(locationId, ghlContactId, [
            { key: 'line_uid', field_value: userId },
          ]);
          console.log(`[ContactMapper] ✅ Linked LINE UID to existing contact via ref: ${ghlContactId}`);
        } else {
          console.warn(`[ContactMapper] ref contact not found in GHL: ${refContactId}, will create new`);
        }
      } catch (err) {
        console.error('[ContactMapper] Failed to link ref contact:', err.message);
      }
    }

    if (!ghlContactId) {
      // --- パターン B: ref なし / ref 解決失敗 → 新規コンタクト作成 ---
      try {
        const nameParts = displayName.split(' ');
        const firstName = nameParts[0] || displayName;
        const lastName = nameParts.slice(1).join(' ') || '';

        const newContact = await ghlService.createContact(locationId, {
          firstName,
          lastName,
          tags: [LINE_FRIEND_TAG],
          customFields: [{ key: 'line_uid', field_value: userId }],
        });

        ghlContactId = newContact.id || newContact.contact?.id;
        console.log(`[ContactMapper] Created new GHL contact: ${ghlContactId}`);
      } catch (err) {
        console.error('[ContactMapper] Failed to create GHL contact:', err.message);
      }
    }
  } else {
    // 既にマッピング済み → タグ・フィールドだけ更新
    try {
      await ghlService.addTags(locationId, ghlContactId, [LINE_FRIEND_TAG]);
      await ghlService.updateCustomFields(locationId, ghlContactId, [
        { key: 'line_uid', field_value: userId },
      ]);
    } catch (err) {
      console.error('[ContactMapper] Failed to update GHL contact:', err.message);
    }
  }

  // 4. Save/update the LINE contact mapping
  lineContact = await contactModel.create({
    locationId,
    ghlContactId,
    lineUid: userId,
    displayName,
    pictureUrl,
  });

  // 5. Log the event
  await logModel.create({
    locationId,
    direction: 'inbound',
    lineUid: userId,
    ghlContactId,
    messageType: 'follow',
    content: `Friend added: ${displayName}`,
    status: 'received',
  });

  // 6. Fire "LINE Friend Added" custom trigger in GHL workflows
  await fireCustomTrigger(locationId, 'line_friend_added', {
    userId,
    displayName,
    pictureUrl,
    contactId: ghlContactId,
    timestamp,
    sourceType: 'user',
  });

  return { lineContact, ghlContactId };
}

/**
 * Handle a LINE message received event
 * 1. Find or create GHL contact mapping
 * 2. Fire GHL custom trigger "line_message_received"
 */
async function handleMessage(locationId, lineAccessToken, userId, messageText, replyToken, timestamp) {
  console.log(`[ContactMapper] Message event: location=${locationId}, user=${userId}`);

  // 1. Find existing contact mapping
  let lineContact = await contactModel.findByLineUid(locationId, userId);
  let ghlContactId = lineContact?.ghl_contact_id;

  // 2. If no mapping exists, fetch profile and create contact (in case follow event was missed)
  if (!lineContact) {
    let profile;
    try {
      profile = await lineService.getUserProfile(lineAccessToken, userId);
    } catch {
      profile = { userId, displayName: `LINE User ${userId.slice(-4)}`, pictureUrl: null };
    }

    const { displayName, pictureUrl } = profile;

    try {
      const nameParts = displayName.split(' ');
      const newContact = await ghlService.createContact(locationId, {
        firstName: nameParts[0] || displayName,
        lastName: nameParts.slice(1).join(' ') || '',
        tags: [LINE_FRIEND_TAG],
        customFields: [{ key: 'line_uid', field_value: userId }],
      });
      ghlContactId = newContact.id || newContact.contact?.id;
    } catch (err) {
      console.error('[ContactMapper] Failed to create contact for message:', err.message);
    }

    lineContact = await contactModel.create({
      locationId,
      ghlContactId,
      lineUid: userId,
      displayName,
      pictureUrl,
    });
  } else {
    // 既存コンタクトにも毎回タグを付与（手動削除後も復元される）
    try {
      await ghlService.addTags(locationId, ghlContactId, [LINE_FRIEND_TAG]);
    } catch (err) {
      console.error('[ContactMapper] Failed to re-add tag for existing contact:', err.message);
    }
  }

  // 3. Log the message
  await logModel.create({
    locationId,
    direction: 'inbound',
    lineUid: userId,
    ghlContactId,
    messageType: 'text',
    content: messageText,
    status: 'received',
  });

  // 4. Post message to GHL Unified Inbox (Conversation Provider)
  if (ghlContactId && process.env.GHL_CONVERSATION_PROVIDER_ID) {
    console.log(`[ContactMapper] Posting to GHL Unified Inbox: contactId=${ghlContactId}`);
    ghlService.addInboundMessage(locationId, ghlContactId, messageText).then((result) => {
      console.log(`[ContactMapper] ✅ Unified Inbox message posted: conversationId=${result?.conversationId}, messageId=${result?.messageId}`);
    }).catch((err) => {
      const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.error(`[ContactMapper] ❌ Failed to post to GHL Unified Inbox: ${detail}`);
    });
  } else {
    console.warn(`[ContactMapper] Skipping Unified Inbox: ghlContactId=${ghlContactId}, providerId=${!!process.env.GHL_CONVERSATION_PROVIDER_ID}`);
  }

  // 5. Fire "LINE Message Received" custom trigger
  await fireCustomTrigger(locationId, 'line_message_received', {
    userId,
    displayName: lineContact?.display_name || userId,
    messageText,
    contactId: ghlContactId,
    timestamp,
    sourceType: 'user',
  });

  return { lineContact, ghlContactId };
}

/**
 * Handle LINE unfollow/block event
 */
async function handleUnfollow(locationId, userId, timestamp) {
  console.log(`[ContactMapper] Unfollow event: location=${locationId}, user=${userId}`);

  const lineContact = await contactModel.markBlocked(locationId, userId);

  if (lineContact?.ghl_contact_id) {
    try {
      await ghlService.removeTags(locationId, lineContact.ghl_contact_id, [LINE_FRIEND_TAG]);
    } catch (err) {
      console.error('[ContactMapper] Failed to remove tag on unfollow:', err.message);
    }
  }

  await logModel.create({
    locationId,
    direction: 'inbound',
    lineUid: userId,
    ghlContactId: lineContact?.ghl_contact_id,
    messageType: 'unfollow',
    content: 'User unfollowed/blocked',
    status: 'received',
  });
}

/**
 * Fire all active GHL custom trigger subscriptions for a given trigger key
 */
async function fireCustomTrigger(locationId, triggerKey, payload) {
  const subscriptions = await triggerSubModel.findActive(locationId, triggerKey);

  if (subscriptions.length === 0) {
    console.log(`[ContactMapper] No active subscriptions for ${triggerKey} on location ${locationId}`);
    return;
  }

  console.log(`[ContactMapper] Firing ${triggerKey} to ${subscriptions.length} subscription(s)`);

  for (const sub of subscriptions) {
    try {
      await ghlService.fireTrigger(sub.target_url, {
        type: triggerKey,
        locationId,
        ...payload,
      });
      console.log(`[ContactMapper] Fired trigger to: ${sub.target_url}`);
    } catch (err) {
      console.error(`[ContactMapper] Failed to fire trigger ${sub.trigger_id}:`, err.message);
    }
  }
}

module.exports = { handleFollow, handleMessage, handleUnfollow };
