/**
 * Zalo Bot API Service
 * Handles communication with Zalo Bot Platform (bot-api.zaloplatforms.com)
 */

const ZALO_API_BASE = process.env.ZALO_API_BASE || 'https://bot-api.zaloplatforms.com/bot';

/**
 * Get Bot profile information
 * @param {string} token 
 */
async function getBotInfo(token = process.env.ZALO_BOT_TOKEN) {
  if (!token) throw new Error('ZALO_BOT_TOKEN is not defined');
  const url = `${ZALO_API_BASE}${token}/getMe`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  const data = await res.json();
  return data;
}

/**
 * Register Webhook URL with Zalo
 * @param {string} webhookUrl - Public HTTPS endpoint (e.g. https://your-project.vercel.app/api/webhook)
 * @param {string} secretToken - Optional secret token
 * @param {string} token - Bot Token
 */
async function setWebhook(webhookUrl, secretToken = process.env.WEBHOOK_SECRET || 'zalo_gemini_secret_token', token = process.env.ZALO_BOT_TOKEN) {
  if (!token) throw new Error('ZALO_BOT_TOKEN is not defined');
  const url = `${ZALO_API_BASE}${token}/setWebhook`;
  
  const payload = {
    url: webhookUrl,
    secret_token: secretToken || process.env.WEBHOOK_SECRET || 'zalo_gemini_secret_token'
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return await res.json();
}

/**
 * Test Webhook connectivity on Zalo Platform
 * @param {string} token 
 */
async function testWebhook(token = process.env.ZALO_BOT_TOKEN) {
  if (!token) throw new Error('ZALO_BOT_TOKEN is not defined');
  const url = `${ZALO_API_BASE}${token}/testWebhook`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  return await res.json();
}

/**
 * Split long message into chunks under 1900 characters (Zalo limit is 2000)
 * @param {string} text 
 * @param {number} maxChunkLength 
 * @returns {string[]}
 */
function splitMessage(text, maxChunkLength = 1900) {
  if (!text || text.length <= maxChunkLength) return [text || ''];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxChunkLength) {
      chunks.push(remaining);
      break;
    }

    // Try finding the last paragraph break or newline within chunk length
    let splitIndex = remaining.lastIndexOf('\n\n', maxChunkLength);
    if (splitIndex === -1 || splitIndex < maxChunkLength * 0.5) {
      splitIndex = remaining.lastIndexOf('\n', maxChunkLength);
    }
    if (splitIndex === -1 || splitIndex < maxChunkLength * 0.5) {
      splitIndex = remaining.lastIndexOf('. ', maxChunkLength);
      if (splitIndex !== -1) splitIndex += 1;
    }
    if (splitIndex === -1 || splitIndex < maxChunkLength * 0.5) {
      splitIndex = remaining.lastIndexOf(' ', maxChunkLength);
    }
    if (splitIndex === -1) {
      splitIndex = maxChunkLength;
    }

    chunks.push(remaining.substring(0, splitIndex).trim());
    remaining = remaining.substring(splitIndex).trim();
  }

  return chunks;
}

/**
 * Send text message to a user or group on Zalo
 * @param {string|number} chatId 
 * @param {string} text 
 * @param {string|number} replyToMsgId 
 * @param {string} token 
 */
async function sendMessage(chatId, text, replyToMsgId = null, token = process.env.ZALO_BOT_TOKEN) {
  if (!token) throw new Error('ZALO_BOT_TOKEN is not defined');
  if (!chatId) throw new Error('chat_id is required');

  const chunks = splitMessage(text);
  const results = [];
  const endpoint = `${ZALO_API_BASE}${token}/sendMessage`;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const body = {
      chat_id: String(chatId),
      text: chunk
    };

    // Only attach reply_to_message_id on the first chunk
    if (i === 0 && replyToMsgId) {
      body.reply_to_message_id = String(replyToMsgId);
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      // If reply_to_message_id failed, retry once without it
      if (!data.ok && body.reply_to_message_id) {
        delete body.reply_to_message_id;
        const retryRes = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        results.push(await retryRes.json());
      } else {
        results.push(data);
      }
    } catch (err) {
      console.error(`Error sending message chunk ${i}:`, err);
      results.push({ ok: false, error: err.message });
    }

    // Small delay between chunks to preserve message order
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  return results;
}

module.exports = {
  getBotInfo,
  setWebhook,
  testWebhook,
  sendMessage,
  splitMessage
};
