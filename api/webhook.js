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
  // Removes leading @mentions like "@Bot Trợ Lý", "@Bot", etc.
  return rawText
    .replace(/^@[\p{L}\p{N}_\s\.\-]+?(\s|$)/u, '')
    .trim();
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
  if (secretToken) {
    const incomingSecret = req.headers['x-bot-api-secret-token'];
    if (incomingSecret && incomingSecret !== secretToken) {
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
  const senderName = message.from?.display_name || event.sender?.name || 'Bạn';

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
      const helpText = `👋 **Xin chào ${senderName}!**\n\nMình là trợ lý AI Gemini trong nhóm Zalo của bạn 🤖\n\n📌 **Cách gọi mình:**\n• Gõ **@tên_bot** kèm câu hỏi của bạn\n• Hoặc bấm **Trả lời (Reply)** vào bất kỳ tin nhắn nào của mình\n• Gõ **/ping** để kiểm tra tốc độ phản hồi\n• Gõ **/help** để mở lại bảng hướng dẫn này\n\nBạn cứ tự nhiên đặt câu hỏi, mình luôn sẵn sàng hỗ trợ 24/7! 🚀`;
      await botService.sendMessage(chatId, helpText, msgId);
      return res.status(200).json({ ok: true });
    }

    // 2. Built-in command: /ping
    if (userQuery === '/ping') {
      const pingText = `🏓 **Pong!**\nBot AI Zalo đang hoạt động ổn định trên nền tảng Vercel ⚡`;
      await botService.sendMessage(chatId, pingText, msgId);
      return res.status(200).json({ ok: true });
    }

    // 3. Nếu người dùng chỉ tag bot mà không hỏi gì
    if (!userQuery) {
      const emptyText = `👋 Em nghe đây ${senderName}! Bạn cần em giải đáp hay hỗ trợ vấn đề gì cứ nhắn nhé 😊`;
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
      const errorMsg = `⚠️ Xin lỗi ${senderName}, hiện tại em đang gặp gián đoạn tạm thời khi xử lý thông tin (${err.message}). Bạn vui lòng thử lại sau ít phút nhé!`;
      await botService.sendMessage(chatId, errorMsg, msgId);
    } catch (sendErr) {
      console.error('Không thể gửi tin nhắn báo lỗi:', sendErr);
    }

    // Luôn trả về 200 để Zalo không retry vô tận
    return res.status(200).json({ ok: false, error: err.message });
  }
};
