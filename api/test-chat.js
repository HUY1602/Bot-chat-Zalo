/**
 * Test Chat with Gemini endpoint
 * Allows direct chat testing from the dashboard
 */

const geminiService = require('./gemini-service');
const avatarService = require('./avatar-service');
const imageService = require('./image-service');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { message, apiKey, model } = req.body || {};

  if (!message) {
    return res.status(400).json({ ok: false, error: 'Vui lòng cung cấp nội dung câu hỏi' });
  }

  // Nếu người dùng test câu hỏi xem mặt / ảnh bot
  if (avatarService.isBotPhotoRequest(message)) {
    const avatarUrl = avatarService.getBotAvatarUrl(req);
    const caption = avatarService.getAvatarCaption('Bạn');
    return res.status(200).json({
      ok: true,
      answer: caption,
      photoUrl: avatarUrl,
      durationMs: 40
    });
  }

  // Nếu người dùng test vẽ tranh / tạo ảnh AI
  if (imageService.isDrawRequest(message)) {
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
    const answer = await geminiService.generateAnswer(message, {
      apiKey: apiKey || process.env.GEMINI_API_KEY,
      model: model || process.env.GEMINI_MODEL
    });
    const duration = Date.now() - startTime;

    return res.status(200).json({
      ok: true,
      answer,
      durationMs: duration
    });
  } catch (err) {
    console.error('Lỗi khi test chat Gemini:', err);
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
};
