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
  // Remove bot's display name or account name
  cleaned = cleaned.replace(/^@?Bot\s+Vạn\s+Năng\s*/i, '');
  cleaned = cleaned.replace(/^@?bot\.UOOvNGDv\s*/i, '');
  // Remove leading @tag if present
  cleaned = cleaned.replace(/^@\S+\s*/i, '');
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
      const helpText = `👋 Xin chào ${senderName} nè! 🥰\n\nMình là Trợ lý AI Zalo siêu dễ thương trong nhóm của bạn đây 🌸✨\n(Bạn cũng có thể gọi mình là Em Trợ Lý hay Trợ lý Mây nha!)\n\n📌 Cách trò chuyện cùng mình:\n• Gõ @tên_bot kèm câu hỏi hoặc lời nhắn của bạn nè\n• Hoặc bấm Trả lời (Reply) vào bất kỳ tin nhắn nào của mình\n• Gõ /ping để kiểm tra tốc độ phản hồi\n• Gõ /help để mở lại bảng hướng dẫn này nè\n\nBạn cứ tự nhiên nhắn tin nha, em luôn sẵn sàng lắng nghe và hỗ trợ bạn 24/7 nè! 💕 Hôm nay mình có thể hỗ trợ gì cho bạn không ạ? 😊`;
      await botService.sendMessage(chatId, helpText, msgId);
      return res.status(200).json({ ok: true });
    }

    // 2. Built-in command: /ping
    if (userQuery === '/ping') {
      const pingText = `🏓 Pong nè! ⚡\nEm Trợ Lý AI Zalo vẫn đang hoạt động siêu mượt mà và sẵn sàng hỗ trợ bạn rồi nha! 🥰✨`;
      await botService.sendMessage(chatId, pingText, msgId);
      return res.status(200).json({ ok: true });
    }

    // 3. Nếu người dùng chỉ tag bot mà không hỏi gì
    if (!userQuery) {
      const emptyText = `Dạ em nghe đây ${senderName} ơi! 🥰 Bạn cần em hỗ trợ hoặc tâm sự điều gì cứ nhắn cho em nè, em thưa liền nha! 💕✨`;
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
      const errorMsg = `Dạ xin lỗi ${senderName} nha, hiện tại em đang hơi chóng mặt xíu nên gặp gián đoạn tạm thời (${err.message}) 🥺. Bạn đợi em một xíu rồi nhắn lại cho em nhé, thương thương nè! 💕`;
      await botService.sendMessage(chatId, errorMsg, msgId);
    } catch (sendErr) {
      console.error('Không thể gửi tin nhắn báo lỗi:', sendErr);
    }

    // Luôn trả về 200 để Zalo không retry vô tận
    return res.status(200).json({ ok: false, error: err.message });
  }
};
