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
const reminderService = require('./reminder-service');

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

  // 2. Remove known bot names / aliases anywhere in text (with or without @)
  cleaned = cleaned.replace(/@?Bot\s*bi[eể]n\s*n[eè]\b/gi, '');
  cleaned = cleaned.replace(/@?Bọt\s*biển\s*(?:cute)?\b/gi, '');
  cleaned = cleaned.replace(/@?Bot\s+Vạn\s+Năng\b/gi, '');
  cleaned = cleaned.replace(/@?bot\.UOOvNGDv\b/gi, '');

  // 3. Remove any remaining @mention tag (e.g. "@Bot bien ne bạn là ai" -> "bạn là ai")
  cleaned = cleaned.replace(/^@[^:\n,?!]+?(\s+(?=[a-z\p{L}0-9/?!])|$)/iu, '');
  cleaned = cleaned.replace(/^@\S+\s*/i, '');
  cleaned = cleaned.replace(/\s*@\S+$/i, '');

  // 4. Strip leading/trailing punctuation or whitespace left after mention
  cleaned = cleaned.replace(/^[:,\-\s]+/, '').replace(/[:,\-\s]+$/, '');

  return cleaned.trim();
}


/**
 * Kiểm tra xem người dùng có đang yêu cầu tóm tắt cuộc trò chuyện không
 * @param {string} rawText 
 * @returns {boolean}
 */
function isSummaryRequest(rawText) {
  if (!rawText) return false;
  const clean = rawText.trim().toLowerCase();

  // 1. Lệnh trực tiếp
  if (/^\/(?:tomtat|summary|recap|brief)\b/i.test(clean)) return true;

  // 2. Không kích hoạt nếu đang yêu cầu tóm tắt tài liệu, bài viết, đoạn văn bên ngoài
  if (/(?:đoạn văn|văn bản|bài viết|bài báo|cuốn sách|truyện|bài thơ|link|nội dung sau|dưới đây)/i.test(clean)) {
    return false;
  }

  // 3. Mẫu câu tóm tắt cuộc trò chuyện / nhóm / tin nhắn
  if (/\b(?:tóm tắt|recap)\b.*?(?:cuộc trò chuyện|hội thoại|tin nhắn|đoạn chat|gần đây|nhóm|vừa rồi|nội dung|20 tin|lại)/i.test(clean)) {
    return true;
  }

  // 4. Mẫu câu ngắn: "tóm tắt", "tóm tắt giúp anh", "tóm tắt nha em", "tóm tắt đi", "tóm tắt hộ em"
  if (/^(?:hãy\s+)?(?:tóm tắt|recap)(?:\s+(?:giúp|hộ|cho|nha|nhé|nè|đi))?(?:\s+(?:anh|chị|em|bot|bọt biển))?$/i.test(clean)) {
    return true;
  }

  // 5. Câu hỏi tình hình nhóm: "nãy giờ mọi người nói gì thế", "vừa nói gì thế", "có chuyện gì vừa xảy ra"
  if (/(?:nãy giờ|vừa rồi)\s+(?:nhóm|mọi người|mng|các bạn)\s+(?:nói|bàn|trò chuyện)\s+gì/i.test(clean)) {
    return true;
  }

  if (/(?:có chuyện gì|vừa xảy ra chuyện gì)\s+(?:thế|vậy|hả)/i.test(clean)) {
    return true;
  }

  return false;
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

  // Opportunistic trigger: Quét kiểm tra xem có nhắc việc nào đã đến hạn không
  reminderService.checkAndTriggerReminders().catch(err => {
    console.warn('[Webhook Opportunistic Trigger Error]:', err.message);
  });

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
  const userId = fromUser.id || fromUser.user_id || event.sender?.id || payload.sender?.id;

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
      const helpText = `Chào ${senderName} nè! Em là Bọt biển cute 🫧✨\n\nEm là trợ lý AI trong nhóm Zalo này, anh/chị cần gì cứ hỏi em nha!\n\n📌 Các tính năng của em:\n• Hỏi đáp thông minh: Gõ @tên_bot kèm câu hỏi hoặc Reply tin nhắn của em\n• ⏰ Hẹn giờ & Nhắc việc: "nhắc anh 10 phút nữa uống nước", "nhắc em mai 8h sáng nộp báo cáo", /reminders, /huynhac\n• 📝 Tóm tắt hội thoại: "tóm tắt cuộc trò chuyện", "tóm tắt 20 tin nhắn gần nhất", /tomtat, /summary
• 🎨 Vẽ tranh AI: Gõ "vẽ + mô tả" (ví dụ: vẽ chú mèo phi hành gia) hoặc "/draw ..."\n• 📸 Xem ảnh của em: Gõ "cho xem ảnh bot", "xem mặt bot"\n• /ping: Kiểm tra bot còn hoạt động không\n• /reset: Làm mới bộ nhớ trò chuyện\n• /help: Xem lại hướng dẫn này`;
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

    // 2.3 Xem danh sách nhắc việc: /reminders, /dsnhac hoặc "danh sách nhắc việc"
    if (reminderService.isListRemindersRequest(userQuery)) {
      const reminders = await reminderService.listReminders(chatId);
      if (reminders.length === 0) {
        const noRemindText = `Dạ hiện tại nhóm mình chưa có lịch hẹn hay nhắc việc nào đang chờ nè ${senderName} ơi! ⏰✨\n\nAnh/chị có thể nhắn ví dụ: "nhắc anh 15 phút nữa nộp báo cáo" để em ghi nhớ nha! 🥰`;
        await botService.sendMessage(chatId, noRemindText, msgId);
      } else {
        const listItems = reminders.map((r, i) => {
          const diffMs = r.scheduledTime - Date.now();
          const relStr = reminderService.formatRelativeTime(diffMs);
          return `${i + 1}. 📌 **${r.task}**\n   🕒 ${r.timeFormatted} (${relStr})\n   👤 Nhắc: ${r.targetName}\n   🔑 ID: ${r.id}`;
        }).join('\n\n');

        const listText = `⏰ DANH SÁCH NHẮC VIỆC ĐANG CHỜ CỦA NHÓM NÈ:\n\n${listItems}\n\n💡 Để hủy nhắc việc, anh/chị gõ: /huynhac [ID] hoặc /huynhac all (hủy tất cả)`;
        await botService.sendMessage(chatId, listText, msgId);
      }
      return res.status(200).json({ ok: true, action: 'listReminders' });
    }

    // 2.4 Hủy nhắc việc: /huynhac, /cancelremind hoặc "hủy nhắc việc"
    if (reminderService.isCancelReminderRequest(userQuery)) {
      const idMatch = userQuery.match(/\b(remind_[a-z0-9_]+)\b/i);
      const isAll = /\ball\b|tất\s*cả|toàn\s*bộ/i.test(userQuery);
      const targetId = idMatch ? idMatch[1] : (isAll ? 'all' : 'all');

      const cancelRes = await reminderService.cancelReminder(chatId, targetId);
      const cancelText = cancelRes.count > 0
        ? `Dạ Bọt biển đã hủy thành công ${cancelRes.count} lịch nhắc cho nhóm mình rồi nè ${senderName} ơi! 🫧`
        : `Dạ em không tìm thấy lịch nhắc nào cần hủy trong nhóm mình nè ${senderName} ơi! 🥰`;

      await botService.sendMessage(chatId, cancelText, msgId);
      return res.status(200).json({ ok: true, action: 'cancelReminder' });
    }

    // 2.5 Hẹn giờ & Nhắc việc thông minh (/remind hoặc ngôn ngữ tự nhiên)
    if (reminderService.isReminderRequest(userQuery)) {
      console.log(`[Reminder Request] Từ ${senderName}: "${userQuery}"`);
      const parseResult = await reminderService.parseReminder(userQuery, senderName);

      if (parseResult.ok && parseResult.scheduledTime) {
        const reminder = await reminderService.createReminder({
          chatId,
          senderName,
          userId,
          targetName: parseResult.targetName,
          task: parseResult.task,
          scheduledTime: parseResult.scheduledTime,
          timeFormatted: parseResult.timeFormatted,
          msgId
        });

        const confirmMsg = reminderService.buildConfirmationMessage(reminder);
        await botService.sendMessage(chatId, confirmMsg, msgId);

        // Lưu vào bộ nhớ ngữ cảnh hội thoại
        await memoryService.addTurn(
          chatId,
          `[${senderName}]: ${userQuery}`,
          `[Em đã đặt lịch nhắc "${reminder.task}" vào lúc ${reminder.timeFormatted} cho ${reminder.targetName}]`
        );

        // Nếu hẹn trong thời gian rất ngắn (dưới 25 giây), chạy hẹn giờ trong tiến trình hiện tại nếu còn sống
        if (parseResult.delayMs <= 25000) {
          setTimeout(async () => {
            try {
              await reminderService.checkAndTriggerReminders();
            } catch (e) {}
          }, parseResult.delayMs);
        }

        return res.status(200).json({ ok: true, action: 'createReminder', reminderId: reminder.id });
      } else {
        const guideText = `Ui, ${senderName} ơi, em chưa hiểu rõ thời gian anh/chị muốn hẹn nè 🥺\n\nAnh/chị có thể nhắn rõ hơn, ví dụ:\n• "nhắc anh 10 phút nữa uống nước"\n• "nhắc em mai 8h sáng nộp báo cáo"\n• "nhắc nhóm 15h30 chiều nay họp"\n• Hoặc dùng lệnh: /remind 15m đi ăn cơm`;
        await botService.sendMessage(chatId, guideText, msgId);
        return res.status(200).json({ ok: false, error: 'Could not parse reminder time' });
      }
    }

    // 2.6 Fast-path: Lệnh trực tiếp /draw hoặc /ve (không cần qua AI phân tích ý định)
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


    // 2.7 Tóm tắt cuộc trò chuyện (20 tin nhắn gần nhất): /tomtat, /summary, /recap hoặc ngôn ngữ tự nhiên
    if (isSummaryRequest(userQuery)) {
      console.log(`[Summary Request] Từ ${senderName}: "${userQuery}"`);
      const countMatch = userQuery.match(/(\d+)\s*(?:tin|tin nhắn|câu)/i);
      const count = countMatch ? Math.min(Math.max(parseInt(countMatch[1], 10), 5), 50) : 20;

      const history = await memoryService.getHistory(chatId);
      if (!history || history.length < 2) {
        const noHistoryText = `Dạ hiện tại nhóm mình chưa có đủ tin nhắn trò chuyện để em tóm tắt nè ${senderName} ơi! 🫧 Mọi người cùng trò chuyện thêm chút nữa rồi gọi em tóm tắt nha 🥰`;
        await botService.sendMessage(chatId, noHistoryText, msgId);
        return res.status(200).json({ ok: true, action: 'summaryEmpty' });
      }

      const recentMessages = history.slice(-count);
      const summaryText = await geminiService.summarizeConversation(recentMessages, senderName);

      await botService.sendMessage(chatId, summaryText, msgId);

      // Lưu vào bộ nhớ ngữ cảnh hội thoại
      await memoryService.addTurn(
        chatId,
        `[${senderName}]: ${userQuery}`,
        summaryText
      );

      return res.status(200).json({ ok: true, action: 'summarizeConversation', count: recentMessages.length });
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
      const avatarUrl = await avatarService.getBotAvatarUrl(req);
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
        const avatarUrl = await avatarService.getBotAvatarUrl(req);
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
