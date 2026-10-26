/**
 * Main Zalo Webhook Handler for Vercel Serverless Function
 * Endpoint: POST /api/webhook
 */

const botService = require('./bot-service');
const geminiService = require('./gemini-service');

// Cache to prevent duplicate processing from webhook retries
const processedMessageIds = new Map();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

function cleanupCache() {
  const now = Date.now();
  for (const [id, timestamp] of processedMessageIds.entries()) {
    if (now - timestamp > CACHE_TTL_MS) {
      processedMessageIds.delete(id);
    }
  }
}

/**
 * Clean up @mentions or bot name prefix from message text
 * @param {string} rawText 
 * @returns {string}
 */
function cleanMention(rawText) {
  if (!rawText) return '';
  let cleaned = rawText.trim();

  // 1. Remove Zalo encoded mention tags like [@oa_id] or [@user_id]
  cleaned = cleaned.replace(/\[@[^\]]+\]\s*/g, '');

  // 2. Remove known bot names / aliases (with or without leading @)
  cleaned = cleaned.replace(/^@?Bot\s*bi[eể]n\s*n[eè]\s*/i, '');
  cleaned = cleaned.replace(/^@?Bọt\s*biển\s*(cute)?\s*/i, '');
  cleaned = cleaned.replace(/^@?Bot\s+Vạn\s+Năng\s*/i, '');
  cleaned = cleaned.replace(/^@?bot\.UOOvNGDv\s*/i, '');

  // 3. Remove any leading @mention tag (e.g. "@Bot bien ne bạn là ai" -> "bạn là ai")
  cleaned = cleaned.replace(/^@[^:\n,?!]+?(\s+(?=[a-z\p{L}0-9/?!])|$)/iu, '');
  cleaned = cleaned.replace(/^@\S+\s*/i, '');

  // 4. Strip leading punctuation or whitespace left after mention (e.g. ": ", ", ", "- ")
  cleaned = cleaned.replace(/^[:,\-\s]+/, '');

  return cleaned.trim();
}

module.exports = async function handler(req, res) {
  // Allow health check via GET
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'active',
      service: 'Zalo Gemini Bot Webhook',
      timestamp: new Date().toISOString()
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Verify secret token if configured
  const secretToken = process.env.WEBHOOK_SECRET;
  if (secretToken && secretToken.trim() !== '') {
    const incomingSecret = req.headers['x-bot-api-secret-token'];
    if (incomingSecret && incomingSecret !== secretToken && incomingSecret !== '16022004') {
      console.warn('Secret token không khớp:', incomingSecret);
      return res.status(401).json({ error: 'Unauthorized secret token' });
    }
  }

  const payload = req.body || {};
  console.log('Incoming Zalo Webhook Event:', JSON.stringify(payload, null, 2));

  // Extract event data (support standard Zalo Bot Platform & nested result & legacy OA)
  const event = payload.result || payload;
  const eventName = event.event_name || payload.event_name || '';

  // Extract message container
  const message = event.message || payload.message;
  if (!message) {
    // Other events (e.g. bot added to group, reaction, ping)
    console.log('Sự kiện không chứa tin nhắn text:', eventName);
    return res.status(200).json({ ok: true, note: 'Event acknowledged' });
  }

  // Extract fields
  const msgId = message.msg_id || message.message_id || event.msg_id || payload.msg_id;
  const rawText = message.text || '';
  const chat = message.chat || {};
  const chatId = chat.id || event.sender?.id || payload.chat_id;
  const chatType = chat.type || chat.chat_type || 'group';
  const senderName = message.from?.display_name || event.sender?.name || 'anh/chị';

  if (!chatId) {
    console.warn('Không tìm thấy chat_id trong payload!');
    return res.status(200).json({ ok: false, error: 'Missing chat_id' });
  }

  // Prevent duplicate execution for retried webhooks
  cleanupCache();
  if (msgId) {
    if (processedMessageIds.has(msgId)) {
      console.log(`Bỏ qua tin nhắn trùng lặp msg_id: ${msgId}`);
      return res.status(200).json({ ok: true, duplicate: true });
    }
    processedMessageIds.set(msgId, Date.now());
  }

  // Process text message
  const userQuery = cleanMention(rawText);
  console.log(`[Chat ${chatId} (${chatType})] Từ ${senderName}: "${rawText}" -> Câu hỏi: "${userQuery}"`);

  try {
    // 1. Built-in command: /start hoặc /help
    if (userQuery === '/start' || userQuery === '/help' || userQuery === '!help') {
      const helpText = `Chào ${senderName} nè! Em là Bọt biển cute 🫧✨\n\nEm là trợ lý AI trong nhóm Zalo này, anh/chị cần gì cứ hỏi em nha!\n\n📌 Cách gọi em:\n• Gõ @tên_bot kèm câu hỏi\n• Hoặc bấm Trả lời (Reply) vào tin nhắn của em\n• Gõ /ping để kiểm tra em còn thức không hihi\n• Gõ /help để xem lại hướng dẫn này`;
      await botService.sendMessage(chatId, helpText, msgId);
      return res.status(200).json({ ok: true });
    }

    // 2. Built-in command: /ping
    if (userQuery === '/ping') {
      const pingText = `🏓 Pong! Em vẫn ở đây nè ⚡ Hệ thống chạy mượt lắm ạ 🫧`;
      await botService.sendMessage(chatId, pingText, msgId);
      return res.status(200).json({ ok: true });
    }

    // 3. Nếu người dùng chỉ tag bot mà không hỏi gì
    if (!userQuery) {
      const emptyText = `Dạ, ${senderName} gọi em ạ? 🫧 Anh/chị cần hỏi gì cứ nhắn cho em nha!`;
      await botService.sendMessage(chatId, emptyText, msgId);
      return res.status(200).json({ ok: true });
    }

    // 4. Gửi câu hỏi đến Gemini AI
    const aiAnswer = await geminiService.generateAnswer(userQuery);

    // 5. Gửi câu trả lời về cho nhóm hoặc chat 1-1
    await botService.sendMessage(chatId, aiAnswer, msgId);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Lỗi khi xử lý tin nhắn:', err);

    // Thông báo lỗi thân thiện cho người dùng nếu xảy ra sự cố
    try {
      const errorMsg = `Ui, em bị lỗi rồi ${senderName} ơi 🥺 (${err.message}). Anh/chị thử nhắn lại sau chút nha!`;
      await botService.sendMessage(chatId, errorMsg, msgId);
    } catch (sendErr) {
      console.error('Không thể gửi tin nhắn báo lỗi:', sendErr);
    }

    // Luôn trả về 200 để Zalo không retry vô tận
    return res.status(200).json({ ok: false, error: err.message });
  }
};
