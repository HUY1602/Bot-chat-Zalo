/**
 * Test Chat with Gemini endpoint
 * Allows direct chat testing from the dashboard
 */

const geminiService = require('./gemini-service');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { message, apiKey, model } = req.body || {};

  if (!message) {
    return res.status(400).json({ ok: false, error: 'Vui lòng cung cấp nội dung câu hỏi' });
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
