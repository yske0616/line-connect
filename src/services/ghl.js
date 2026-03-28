const axios = require('axios');
const ghlConnectionModel = require('../models/ghl-connection');

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_TOKEN_URL = `${GHL_API_BASE}/oauth/token`;
const API_VERSION = '2021-07-28';

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(code, redirectUri) {
  const params = new URLSearchParams({
    client_id: process.env.GHL_APP_CLIENT_ID,
    client_secret: process.env.GHL_APP_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri || process.env.GHL_APP_REDIRECT_URI,
    user_type: 'Location',
  });

  const res = await axios.post(GHL_TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  return res.data;
  // { access_token, token_type, expires_in, refresh_token, scope, locationId, userId, companyId }
}

/**
 * Refresh an expired access token
 */
async function refreshAccessToken(refreshToken) {
  const params = new URLSearchParams({
    client_id: process.env.GHL_APP_CLIENT_ID,
    client_secret: process.env.GHL_APP_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    user_type: 'Location',
  });

  const res = await axios.post(GHL_TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  return res.data;
}

/**
 * Get a valid access token for a location (auto-refresh if needed)
 */
async function getValidToken(locationId) {
  const conn = await ghlConnectionModel.findByLocationId(locationId);
  if (!conn) throw new Error(`No GHL connection found for location: ${locationId}`);

  if (ghlConnectionModel.isTokenExpiringSoon(conn)) {
    console.log(`[GHL] Refreshing token for location ${locationId}`);
    const refreshed = await refreshAccessToken(conn.refresh_token);
    await ghlConnectionModel.updateTokens({
      locationId,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token || conn.refresh_token,
      expiresIn: refreshed.expires_in,
    });
    return refreshed.access_token;
  }

  return conn.access_token;
}

/**
 * Build GHL API headers
 */
function buildHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Version: API_VERSION,
    'Content-Type': 'application/json',
  };
}

/**
 * Search contacts by query (email, phone, name)
 */
async function searchContacts(locationId, query) {
  const token = await getValidToken(locationId);
  const res = await axios.get(`${GHL_API_BASE}/contacts/`, {
    headers: buildHeaders(token),
    params: { locationId, query, limit: 5 },
  });
  return res.data?.contacts || [];
}

/**
 * Get a contact by ID
 */
async function getContact(locationId, contactId) {
  const token = await getValidToken(locationId);
  const res = await axios.get(`${GHL_API_BASE}/contacts/${contactId}`, {
    headers: buildHeaders(token),
  });
  return res.data?.contact || null;
}

/**
 * Create a new contact
 */
async function createContact(locationId, { firstName, lastName, email, phone, tags, customFields }) {
  const token = await getValidToken(locationId);
  const body = {
    locationId,
    firstName: firstName || 'LINE',
    lastName,
    email,
    phone,
    tags: tags || [],
    customFields: customFields || [],
    source: 'LINE Connect',
  };

  const res = await axios.post(`${GHL_API_BASE}/contacts/`, body, {
    headers: buildHeaders(token),
  });
  return res.data?.contact || res.data;
}

/**
 * Update an existing contact
 */
async function updateContact(locationId, contactId, updates) {
  const token = await getValidToken(locationId);
  const res = await axios.put(`${GHL_API_BASE}/contacts/${contactId}`, updates, {
    headers: buildHeaders(token),
  });
  return res.data?.contact || res.data;
}

/**
 * Add tags to a contact
 */
async function addTags(locationId, contactId, tags) {
  const token = await getValidToken(locationId);
  const res = await axios.post(
    `${GHL_API_BASE}/contacts/${contactId}/tags`,
    { tags },
    { headers: buildHeaders(token) }
  );
  return res.data;
}

/**
 * Remove tags from a contact
 */
async function removeTags(locationId, contactId, tags) {
  const token = await getValidToken(locationId);
  const res = await axios.delete(`${GHL_API_BASE}/contacts/${contactId}/tags`, {
    headers: buildHeaders(token),
    data: { tags },
  });
  return res.data;
}

/**
 * Update or create a custom field value on a contact
 */
async function updateCustomFields(locationId, contactId, customFields) {
  const token = await getValidToken(locationId);
  const res = await axios.put(
    `${GHL_API_BASE}/contacts/${contactId}`,
    { customFields },
    { headers: buildHeaders(token) }
  );
  return res.data;
}

/**
 * Get all custom fields for a location
 */
async function getCustomFields(locationId) {
  const token = await getValidToken(locationId);
  const res = await axios.get(`${GHL_API_BASE}/locations/${locationId}/customFields`, {
    headers: buildHeaders(token),
  });
  return res.data?.customFields || [];
}

/**
 * Create a custom field for a location
 */
async function createCustomField(locationId, { name, fieldKey, dataType }) {
  const token = await getValidToken(locationId);
  const res = await axios.post(
    `${GHL_API_BASE}/locations/${locationId}/customFields`,
    { name, fieldKey, dataType: dataType || 'TEXT' },
    { headers: buildHeaders(token) }
  );
  return res.data;
}

/**
 * Ensure the line_uid custom field exists for a location
 * Returns the field key to use in customFields arrays
 */
async function ensureLineUidField(locationId) {
  try {
    const fields = await getCustomFields(locationId);
    const existing = fields.find(
      (f) => f.fieldKey === 'line_uid' || f.name === 'LINE UID'
    );
    if (existing) return existing.fieldKey || 'line_uid';

    await createCustomField(locationId, {
      name: 'LINE UID',
      fieldKey: 'line_uid',
      dataType: 'TEXT',
    });
    return 'line_uid';
  } catch (err) {
    console.error('[GHL] Failed to ensure line_uid custom field:', err.message);
    return 'line_uid'; // Fall back to expected key
  }
}

/**
 * Fire a custom workflow trigger by POSTing to its targetUrl
 * @param {string} targetUrl - The GHL-generated URL for this trigger instance
 * @param {object} payload - The event data
 */
async function fireTrigger(targetUrl, payload) {
  const res = await axios.post(targetUrl, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000,
  });
  return res.data;
}

/**
 * Add an inbound message to GHL Unified Inbox (Conversation Provider)
 * Called when a LINE user sends a message — posts it into the GHL Conversations inbox.
 *
 * @param {string} locationId - GHL location ID
 * @param {string} contactId  - GHL contact ID
 * @param {string} body       - Message text
 * @param {string} [altId]    - LINE message ID (echoed back in outbound webhook as replyToAltId)
 * @returns {{ messageId: string, conversationId: string }}
 */
async function addInboundMessage(locationId, contactId, body, altId) {
  const providerId = process.env.GHL_CONVERSATION_PROVIDER_ID;
  if (!providerId) {
    throw new Error('GHL_CONVERSATION_PROVIDER_ID is not configured');
  }

  const token = await getValidToken(locationId);
  const payload = {
    type: 'SMS',
    contactId,
    locationId,
    body,
    conversationProviderId: providerId,
    direction: 'inbound',
    contentType: 'text/plain',
    dateAdded: new Date().toISOString(),
  };

  if (altId) payload.altId = altId;

  const res = await axios.post(
    `${GHL_API_BASE}/conversations/messages/inbound`,
    payload,
    { headers: buildHeaders(token) }
  );
  return res.data;
}

/**
 * Update the delivery status of a GHL conversation message.
 * Must be called after attempting to deliver an outbound message to LINE.
 *
 * @param {string} locationId - GHL location ID
 * @param {string} messageId  - GHL message ID (from outbound webhook payload)
 * @param {'pending'|'delivered'|'read'|'failed'} status
 */
async function updateMessageStatus(locationId, messageId, status) {
  const token = await getValidToken(locationId);
  const res = await axios.put(
    `${GHL_API_BASE}/conversations/messages/${messageId}/status`,
    { status },
    { headers: buildHeaders(token) }
  );
  return res.data;
}

module.exports = {
  exchangeCodeForTokens,
  refreshAccessToken,
  getValidToken,
  searchContacts,
  getContact,
  createContact,
  updateContact,
  addTags,
  removeTags,
  updateCustomFields,
  getCustomFields,
  createCustomField,
  ensureLineUidField,
  fireTrigger,
  addInboundMessage,
  updateMessageStatus,
};
