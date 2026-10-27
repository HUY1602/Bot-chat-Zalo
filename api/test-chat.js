/**
 * Test Chat with Gemini endpoint
 * Allows direct chat testing from the dashboard
 */

const geminiService = require('./gemini-service');
const avatarService = require('./avatar-service');
const imageService = require('./image-service');
const searchService = require('./search-service');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { message, apiKey, model } = req.body || {};

  if (!message) {
    return res.status(400).json({ ok: false, error: 'Vui lòng cung cấp nội dung câu hỏi' });
  }

  // Fast-path: Lệnh trực tiếp /draw hoặc /ve
  if (/^\/(?:draw|image|ve|paint|art|gen)\s+/i.test(message)) {
    const startTime = Date.now();
    try {
      const { imageUrl, caption } = await imageService.generateArtwork(message, 'Bạn');
      const duration = Date.now() - startTime;
      return res.status(200).json({
        ok: true,
        answer: caption,
        photoUrl: imageUrl,
        durationMs: duration
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: `Lỗi tạo ảnh: ${err.message}` });
    }
  }

  try {
    const startTime = Date.now();

    // Kiểm tra xem câu hỏi có cần tra cứu Internet thời gian thực không
    let searchContext = '';
    if (searchService.shouldSearchWeb(message)) {
      const searchResults = await searchService.searchWeb(message);
      if (searchResults && searchResults.length > 0) {
        searchContext = searchService.buildSearchContext(searchResults);
      }
    }

    const { action } = await geminiService.generateAnswerWithAction(`[Bạn]: ${message}${searchContext}`, {
      apiKey: apiKey || process.env.GEMINI_API_KEY,
      model: model || process.env.GEMINI_MODEL
    });
    const duration = Date.now() - startTime;

    if (action.type === 'SEND_AVATAR') {
      const avatarUrl = await avatarService.getBotAvatarUrl(req);
      const caption = action.text || avatarService.getAvatarCaption('Bạn', action.isOther);
      return res.status(200).json({
        ok: true,
        answer: caption,
        photoUrl: avatarUrl,
        durationMs: duration
      });
    }

    if (action.type === 'GENERATE_IMAGE') {
      const imageUrl = imageService.buildImageUrl(action.imagePrompt);
      const caption = action.text || `Dạ tranh của bạn đây nè! 🎨✨`;
      return res.status(200).json({
        ok: true,
        answer: caption,
        photoUrl: imageUrl,
        durationMs: duration
      });
    }

    return res.status(200).json({
      ok: true,
      answer: action.text,
      durationMs: duration
    });
  } catch (err) {
    console.error('Lỗi khi test chat Gemini:', err);

    // Fallback: Nếu Gemini lỗi nhưng người dùng hỏi ảnh đại diện theo keyword
    if (avatarService.isBotPhotoRequest(message)) {
      const isOther = avatarService.isOtherPhotoRequest(message);
      const avatarUrl = await avatarService.getBotAvatarUrl(req);
      const caption = avatarService.getAvatarCaption('Bạn', isOther);
      return res.status(200).json({
        ok: true,
        answer: caption,
        photoUrl: avatarUrl,
        durationMs: 50
      });
    }

    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
};
