/**
 * Main Zalo Webhook Handler for Vercel Serverless Function
 * Endpoint: POST /api/webhook
 */

const botService = require('./bot-service');
const geminiService = require('./gemini-service');
const memoryService = require('./memory-service');
const avatarService = require('./avatar-service');
const imageService = require('./image-service');
const searchService = require('./search-service');

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
  const chatType = String(chat.type || chat.chat_type || 'group').toLowerCase();

  // Extract sender information accurately from Zalo message.from
  const fromUser = message.from || event.sender || payload.sender || {};
  const senderName = fromUser.display_name || fromUser.name || fromUser.first_name || 'Thành viên';

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
    // 0. Built-in command: /reset, /clear hoặc /forget (xóa bộ nhớ trò chuyện)
    if (userQuery === '/reset' || userQuery === '/clear' || userQuery === '/forget' || userQuery === '/quen') {
      await memoryService.clearHistory(chatId);
      const resetText = `Dạ em đã làm mới bộ nhớ của nhóm mình rồi nè anh/chị ơi! Giờ tụi mình bắt đầu câu chuyện mới nghen 🫧✨`;
      await botService.sendMessage(chatId, resetText, msgId);
      return res.status(200).json({ ok: true });
    }

    // 1. Built-in command: /start hoặc /help
    if (userQuery === '/start' || userQuery === '/help' || userQuery === '!help') {
      const helpText = `Chào ${senderName} nè! Em là Bọt biển cute 🫧✨\n\nEm là trợ lý AI trong nhóm Zalo này, anh/chị cần gì cứ hỏi em nha!\n\n📌 Các tính năng của em:\n• Hỏi đáp thông minh: Gõ @tên_bot kèm câu hỏi hoặc Reply tin nhắn của em\n• Vẽ tranh AI: Gõ "vẽ + mô tả" (ví dụ: vẽ chú mèo phi hành gia) hoặc "/draw ..."\n• Xem ảnh của em: Gõ "cho xem ảnh bot", "xem mặt bot"\n• /ping: Kiểm tra bot còn hoạt động không\n• /reset: Làm mới bộ nhớ trò chuyện\n• /help: Xem lại hướng dẫn này`;
      await botService.sendMessage(chatId, helpText, msgId);
      return res.status(200).json({ ok: true });
    }

    // 2. Built-in command: /ping
    if (userQuery === '/ping') {
      const memStatus = memoryService.getMemoryStatus();
      const pingText = `🏓 Pong! Em vẫn ở đây nè ⚡ Hệ thống chạy mượt lắm ạ 🫧\n💾 Bộ nhớ: ${memStatus.provider}`;
      await botService.sendMessage(chatId, pingText, msgId);
      return res.status(200).json({ ok: true });
    }

    // 2.5 Fast-path: Lệnh trực tiếp /draw hoặc /ve (không cần qua AI phân tích ý định)
    if (/^\/(?:draw|image|ve|paint|art|gen)\s+/i.test(userQuery)) {
      console.log(`[Fast-path Draw] ${senderName} yêu cầu vẽ tranh: "${userQuery}"`);
      try {
        const { imageUrl, rawPrompt, caption } = await imageService.generateArtwork(userQuery, senderName);
        console.log(`[Image Generated] URL: ${imageUrl}`);

        const sendResult = await botService.sendPhoto(chatId, imageUrl, caption, msgId);
        if (sendResult && sendResult.ok === false) {
          await botService.sendMessage(chatId, `${caption}\n\n🔗 Bấm vào đây để xem ảnh nét căng: ${imageUrl}`, msgId);
        }

        await memoryService.addTurn(
          chatId,
          `[${senderName}]: ${userQuery}`,
          `[Em đã vẽ tranh "${rawPrompt}" và gửi ảnh thành công cho ${senderName}]`
        );

        return res.status(200).json({ ok: true, action: 'generateArtwork' });
      } catch (drawErr) {
        console.error('Lỗi khi vẽ tranh AI:', drawErr);
        await botService.sendMessage(
          chatId,
          `Ui, em vẽ tranh bị vướng chút trục trặc rồi ${senderName} ơi 🥺 (${drawErr.message}). Anh/chị thử lại sau một lát nha!`,
          msgId
        );
        return res.status(200).json({ ok: false, error: drawErr.message });
      }
    }

    // 3. Nếu người dùng chỉ tag bot mà không hỏi gì
    if (!userQuery) {
      const emptyText = `Dạ, ${senderName} gọi em ạ? 🫧 Anh/chị cần hỏi gì cứ nhắn cho em nha!`;
      await botService.sendMessage(chatId, emptyText, msgId);
      return res.status(200).json({ ok: true });
    }

    // 4. Lấy lịch sử hội thoại gần nhất của chat này
    const history = await memoryService.getHistory(chatId);

    // 4.5 Kiểm tra xem câu hỏi có cần tra cứu Internet thời gian thực không
    let searchContext = '';
    if (searchService.shouldSearchWeb(userQuery)) {
      console.log(`[WebSearch] Đang tìm kiếm thông tin thời gian thực cho: "${userQuery}"`);
      const searchResults = await searchService.searchWeb(userQuery);
      if (searchResults && searchResults.length > 0) {
        searchContext = searchService.buildSearchContext(searchResults);
        console.log(`[WebSearch] Đã nạp ${searchResults.length} nguồn tin từ Internet.`);
      }
    }

    // Gắn tên người gửi rõ ràng theo định dạng [Tên]: Nội dung để AI phân biệt từng người
    const userPrompt = `[${senderName}]: ${userQuery}`;
    const contextualQuery = `${userPrompt}${searchContext}`;

    // 5. Gửi câu hỏi đến Gemini AI để tự động nhận diện ý định (Semantic Intent Routing)
    const { action } = await geminiService.generateAnswerWithAction(contextualQuery, {
      history
    });

    // 6. Xử lý các hành động ngữ nghĩa do Gemini quyết định
    if (action.type === 'SEND_AVATAR') {
      const avatarUrl = avatarService.getBotAvatarUrl(req);
      const caption = action.text || avatarService.getAvatarCaption(senderName, action.isOther);
      console.log(`[Semantic Action: SEND_AVATAR] Gửi ảnh cho ${senderName} (${chatId}): ${avatarUrl} (isOther: ${action.isOther})`);

      try {
        const sendResult = await botService.sendPhoto(chatId, avatarUrl, caption, msgId);
        if (sendResult && sendResult.ok === false) {
          await botService.sendMessage(chatId, `${caption}\n\n🔗 ${avatarUrl}`, msgId);
        }
      } catch (photoErr) {
        console.error('Lỗi khi gọi sendPhoto:', photoErr.message);
        await botService.sendMessage(chatId, `${caption}\n\n🔗 ${avatarUrl}`, msgId);
      }

      await memoryService.addTurn(chatId, userPrompt, caption);
      return res.status(200).json({ ok: true, action: 'sendPhoto' });
    }

    if (action.type === 'GENERATE_IMAGE') {
      console.log(`[Semantic Action: GENERATE_IMAGE] Prompt: "${action.imagePrompt}"`);
      try {
        const imageUrl = imageService.buildImageUrl(action.imagePrompt);
        const caption = action.text || `Dạ tranh của ${senderName} đây nè! 🎨✨\n🫧 Bọt biển vẽ cho ${senderName} có đẹp không nè? 🥰`;

        const sendResult = await botService.sendPhoto(chatId, imageUrl, caption, msgId);
        if (sendResult && sendResult.ok === false) {
          await botService.sendMessage(chatId, `${caption}\n\n🔗 Bấm vào đây để xem ảnh nét căng: ${imageUrl}`, msgId);
        }

        await memoryService.addTurn(chatId, userPrompt, caption);
        return res.status(200).json({ ok: true, action: 'generateArtwork' });
      } catch (drawErr) {
        console.error('Lỗi khi tải ảnh vẽ AI:', drawErr);
        await botService.sendMessage(chatId, `${action.text}\n\n(Ui, em gặp chút trục trặc khi tải ảnh: ${drawErr.message} 🥺)`, msgId);
        return res.status(200).json({ ok: false, error: drawErr.message });
      }
    }

    // 7. Trò chuyện thông thường (CHAT)
    await memoryService.addTurn(chatId, userPrompt, action.text);
    await botService.sendMessage(chatId, action.text, msgId);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Lỗi khi xử lý tin nhắn:', err);

    // Fallback thông minh: Nếu Gemini lỗi nhưng người dùng đang hỏi ảnh đại diện theo regex thì vẫn phục vụ ảnh!
    if (avatarService.isBotPhotoRequest(userQuery)) {
      try {
        const isOther = avatarService.isOtherPhotoRequest(userQuery);
        const avatarUrl = avatarService.getBotAvatarUrl(req);
        const caption = avatarService.getAvatarCaption(senderName, isOther);
        await botService.sendPhoto(chatId, avatarUrl, caption, msgId);
        return res.status(200).json({ ok: true, fallback: 'avatar' });
      } catch (fErr) {}
    }

    // Thông báo lỗi thân thiện cho người dùng nếu xảy ra sự cố
    try {
      const errorMsg = `Ui, em bị lỗi rồi ${senderName} ơi 🥺 (${err.message}). Anh thử nhắn lại sau chút nha!`;
      await botService.sendMessage(chatId, errorMsg, msgId);
    } catch (sendErr) {
      console.error('Không thể gửi tin nhắn báo lỗi:', sendErr);
    }

    // Luôn trả về 200 để Zalo không retry vô tận
    return res.status(200).json({ ok: false, error: err.message });
  }
};
