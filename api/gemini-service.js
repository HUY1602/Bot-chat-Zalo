/**
 * Gemini AI Service
 * Handles AI response generation using Google Gemini API
 */

const dns = require('dns');
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const FALLBACK_MODELS = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];

const DEFAULT_SYSTEM_INSTRUCTION = `Bạn là trợ lý AI thông minh, thân thiện và hữu ích trên nền tảng Zalo.
Nhiệm vụ chính của bạn là hỗ trợ trả lời các câu hỏi thắc mắc, tư vấn, giải đáp kiến thức của các thành viên trong nhóm chat Zalo hoặc tin nhắn riêng tư.

Quy tắc ứng xử và định dạng:
1. Trả lời bằng tiếng Việt lịch sự, nhiệt tình, tự nhiên và dễ mến (xưng "mình" hoặc "em", gọi người dùng là "bạn" hoặc "anh/chị").
2. Định dạng câu trả lời:
   - Zalo không hỗ trợ markdown phức tạp như tiêu đề ### hay kẻ bảng table.
   - Hãy dùng gạch đầu dòng (• hoặc -), danh sách số (1., 2., 3.) và in đậm (**từ khóa**).
   - Thêm các biểu tượng cảm xúc (emoji) phù hợp để câu trả lời thêm sinh động, thân thiện.
3. Độ dài:
   - Ưu tiên ngắn gọn, đúng trọng tâm, giải thích dễ hiểu.
   - Nếu câu hỏi phức tạp, hãy tóm tắt ý chính trước, sau đó đi vào chi tiết ngắn gọn.`;

/**
 * Format raw Gemini response for optimal display in Zalo
 * @param {string} text 
 * @returns {string}
 */
function formatForZalo(text) {
  if (!text) return '';
  
  let formatted = text
    // Replace markdown headers (### Header) with bold text
    .replace(/^#{1,6}\s*(.+)$/gm, '🔹 **$1**')
    // Replace markdown table bars with clean text
    .replace(/\|/g, ' ')
    .replace(/-{3,}/g, '')
    // Clean up excessive blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return formatted;
}

/**
 * Call Gemini REST API directly for maximum speed and zero dependencies
 */
async function callGeminiRest(model, prompt, apiKey, systemInstruction) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  const body = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1500
    }
  };

  if (systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await res.json();

  if (data.error) {
    throw new Error(`[Gemini ${data.error.code}]: ${data.error.message}`);
  }

  const answer = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!answer) {
    throw new Error('Không nhận được nội dung từ Gemini');
  }

  return formatForZalo(answer);
}

/**
 * Generate answer from Gemini for a given prompt
 * @param {string} prompt - User question or query
 * @param {object} options - Optional parameters
 * @returns {Promise<string>}
 */
async function generateAnswer(prompt, options = {}) {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Chưa cấu hình GEMINI_API_KEY. Vui lòng thêm GEMINI_API_KEY vào biến môi trường!');
  }

  const modelName = options.model || DEFAULT_MODEL;
  const systemInstruction = options.systemInstruction || process.env.SYSTEM_INSTRUCTION || DEFAULT_SYSTEM_INSTRUCTION;

  // Try configured model first
  try {
    return await callGeminiRest(modelName, prompt, apiKey, systemInstruction);
  } catch (primaryErr) {
    console.warn(`Model ${modelName} gặp lỗi: ${primaryErr.message}. Đang thử fallback...`);
    
    // Try fallback models
    for (const fallback of FALLBACK_MODELS) {
      if (fallback === modelName) continue;
      try {
        console.log(`Đang thử fallback model ${fallback}...`);
        return await callGeminiRest(fallback, prompt, apiKey, systemInstruction);
      } catch (fbErr) {
        console.warn(`Fallback ${fallback} thất bại: ${fbErr.message}`);
      }
    }

    throw primaryErr;
  }
}

module.exports = {
  generateAnswer,
  formatForZalo,
  DEFAULT_SYSTEM_INSTRUCTION,
  DEFAULT_MODEL
};
