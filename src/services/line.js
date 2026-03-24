const axios = require('axios');

const LINE_API_BASE = 'https://api.line.me';

/**
 * Get LINE user profile
 * @param {string} accessToken - LINE Channel Access Token
 * @param {string} userId - LINE User ID
 */
async function getUserProfile(accessToken, userId) {
  const res = await axios.get(`${LINE_API_BASE}/v2/bot/profile/${userId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.data; // { userId, displayName, pictureUrl, statusMessage }
}

/**
 * Send a text message to a LINE user (Push Message)
 * @param {string} accessToken - LINE Channel Access Token
 * @param {string} userId - LINE User ID
 * @param {string} text - Message text
 * @returns {{ messageId: string }}
 */
async function sendTextMessage(accessToken, userId, text) {
  const res = await axios.post(
    `${LINE_API_BASE}/v2/bot/message/push`,
    {
      to: userId,
      messages: [{ type: 'text', text }],
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
  // LINE returns { messages: [{ id, quoteToken }] }
  return {
    messageId: res.data?.messages?.[0]?.id || 'sent',
  };
}

/**
 * Get the number of friends for the bot
 * @param {string} accessToken
 * @returns {number}
 */
async function getFriendCount(accessToken) {
  try {
    const res = await axios.get(`${LINE_API_BASE}/v2/bot/followers/count`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.data?.count || 0;
  } catch {
    return 0;
  }
}

/**
 * Verify the LINE channel access token is valid
 * @param {string} accessToken
 * @param {string} channelId
 */
async function verifyToken(accessToken, channelId) {
  try {
    const res = await axios.get(`${LINE_API_BASE}/v2/bot/channel/webhook/endpoint`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return { valid: true, webhookEndpoint: res.data?.webhookEndpoint };
  } catch (err) {
    return {
      valid: false,
      error: err.response?.data?.message || err.message,
    };
  }
}

/**
 * Reply to a LINE message (uses replyToken from webhook)
 * Only used for immediate replies; prefer pushMessage for workflow actions
 */
async function replyMessage(accessToken, replyToken, text) {
  const res = await axios.post(
    `${LINE_API_BASE}/v2/bot/message/reply`,
    {
      replyToken,
      messages: [{ type: 'text', text }],
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
  return res.data;
}

module.exports = { getUserProfile, sendTextMessage, getFriendCount, verifyToken, replyMessage };
