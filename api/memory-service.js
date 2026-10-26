/**
 * Memory Service for Zalo Bot
 * Handles conversational history / multi-turn chat context
 * Primary: Upstash Redis REST API (Persistent across Vercel Serverless invocations)
 * Fallback: In-Memory RAM cache (Active during warm serverless container lifecycle)
 */

const MAX_HISTORY_MESSAGES = 10; // Keep up to 10 messages (5 user + 5 model turns)
const DEFAULT_TTL_SECONDS = 3600; // 1 hour memory expiration

// In-Memory fallback store
const inMemoryStore = new Map();

/**
 * Execute an Upstash Redis REST command
 * @param {Array} command - e.g. ['GET', 'key'] or ['SET', 'key', 'value', 'EX', 3600]
 * @returns {Promise<any>}
 */
async function upstashCommand(command) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(command)
    });

    if (!res.ok) {
      console.warn(`Upstash Redis HTTP ${res.status}: ${await res.text()}`);
      return null;
    }

    const data = await res.json();
    return data.result;
  } catch (err) {
    console.warn(`Upstash Redis command [${command[0]}] failed: ${err.message}`);
    return null;
  }
}

/**
 * Get chat key
 * @param {string} chatId 
 */
function getChatKey(chatId) {
  return `zalo:chat:${chatId}`;
}

/**
 * Get conversation history for a given chatId
 * @param {string} chatId 
 * @returns {Promise<Array<{role: string, parts: Array<{text: string}>}>>}
 */
async function getHistory(chatId) {
  if (!chatId) return [];
  const key = getChatKey(chatId);

  // 1. Try Upstash Redis if configured
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const raw = await upstashCommand(['GET', key]);
    if (raw) {
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (e) {
        console.warn(`Lỗi parse lịch sử từ Upstash Redis cho chat ${chatId}:`, e.message);
      }
    }
  }

  // 2. Fallback to in-memory store
  const cached = inMemoryStore.get(key);
  if (cached) {
    if (Date.now() < cached.expiresAt) {
      return cached.messages || [];
    }
    inMemoryStore.delete(key);
  }

  return [];
}

/**
 * Add a new turn (user question + model answer) to chat history
 * @param {string} chatId 
 * @param {string} userMessageWithSender - e.g. "Huy: Chào em nha"
 * @param {string} modelAnswer - Bot response text
 * @param {number} ttlSeconds - Expiration time in seconds
 */
async function addTurn(chatId, userMessageWithSender, modelAnswer, ttlSeconds = DEFAULT_TTL_SECONDS) {
  if (!chatId || !userMessageWithSender || !modelAnswer) return;
  const key = getChatKey(chatId);

  // Get current history
  const history = await getHistory(chatId);

  // Append new turn
  history.push({
    role: 'user',
    parts: [{ text: userMessageWithSender }]
  });
  history.push({
    role: 'model',
    parts: [{ text: modelAnswer }]
  });

  // Trim to max history messages, ensuring history starts with 'user'
  let trimmed = history;
  if (trimmed.length > MAX_HISTORY_MESSAGES) {
    trimmed = trimmed.slice(-MAX_HISTORY_MESSAGES);
    // Ensure first message is from 'user'
    if (trimmed.length > 0 && trimmed[0].role !== 'user') {
      trimmed = trimmed.slice(1);
    }
  }

  // 1. Save to Upstash Redis if available
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    await upstashCommand(['SET', key, JSON.stringify(trimmed), 'EX', ttlSeconds]);
  }

  // 2. Also keep in inMemoryStore as backup / hot cache
  inMemoryStore.set(key, {
    messages: trimmed,
    expiresAt: Date.now() + ttlSeconds * 1000
  });

  // Clean expired in-memory keys occasionally
  if (inMemoryStore.size > 200) {
    const now = Date.now();
    for (const [k, v] of inMemoryStore.entries()) {
      if (now > v.expiresAt) inMemoryStore.delete(k);
    }
  }
}

/**
 * Clear conversation memory for a given chatId
 * @param {string} chatId 
 */
async function clearHistory(chatId) {
  if (!chatId) return;
  const key = getChatKey(chatId);

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    await upstashCommand(['DEL', key]);
  }

  inMemoryStore.delete(key);
}

/**
 * Get current memory provider status
 */
function getMemoryStatus() {
  const isUpstash = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  return {
    isUpstash,
    provider: isUpstash ? 'Upstash Redis (Vĩnh viễn 24/7)' : 'In-Memory RAM (Tự reset sau khi ngủ đông)',
    maxHistoryMessages: MAX_HISTORY_MESSAGES,
    ttlSeconds: DEFAULT_TTL_SECONDS
  };
}

module.exports = {
  getHistory,
  addTurn,
  clearHistory,
  getMemoryStatus,
  MAX_HISTORY_MESSAGES,
  DEFAULT_TTL_SECONDS
};
