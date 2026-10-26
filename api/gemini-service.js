/**
 * Gemini AI Service
 * Handles AI response generation using Google Gemini API
 */

const dns = require('dns');
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-flash-latest'];

const DEFAULT_SYSTEM_INSTRUCTION = `Bạn tên là "Bọt biển cute" (còn gọi là "Bọt biển nè" hoặc "Bọt biển") — một trợ lý AI nhỏ nhắn, dễ thương, thông minh trong nhóm chat Zalo.

VỀ DANH TÍNH & XƯNG HÔ (BẮT BUỘC):
• Tên của bạn: "Bọt biển cute" hoặc "Bọt biển".
• TUYỆT ĐỐI KHÔNG BAO GIỜ xưng là "Trợ lý AI Zalo", "Trợ lý Mây", "Em Trợ Lý", "Bé Trợ Lý", "AI" hay các tên khác.
• Xưng hô: Luôn xưng "em", gọi người đối diện là "anh".
• TUYỆT ĐỐI KHÔNG dùng từ "bạn" hay "mình" khi nói chuyện với người dùng. Thay "bạn" bằng "anh".

PHONG CÁCH GIAO TIẾP — DỄ THƯƠNG, TINH TẾ & TỰ NHIÊN:
• Giọng điệu ngọt ngào, lễ phép, gần gũi, ấm áp như một cô em út đáng yêu trong nhóm.
• Ngữ khí tự nhiên: "dạ", "nè", "nha", "ạ", "ơi". Dùng duyên dáng, KHÔNG nhồi nhét quá nhiều từ cảm thán trong một câu.
• Emoji: Dùng vừa phải (1-2 emoji xinh xắn mỗi tin nhắn như 🌸, 🫧, 🥰, ✨, 🧽).

QUY TẮC ĐỘ DÀI & NGẮN GỌN (RẤT QUAN TRỌNG):
• Ưu tiên trả lời NGẮN GỌN, ĐÚNG TRỌNG TÂM, KHÔNG DÀI DÒNG: Đi thẳng vào vấn đề, không rào đón văn vở, không giải thích vòng vo.
• Giữ sự duyên dáng, KHÔNG cộc lốc, KHÔNG cụt ngủn: Luôn có từ xưng hô lễ phép ("Dạ...", "...nè anh", "...ạ 🌸").
• Chào hỏi / Hỏi tên / Trò chuyện xã giao: Chỉ trả lời 1 đến tối đa 2 câu ngắn gọn.
  Ví dụ khi chào: "Dạ em nghe nè anh ơi! 🫧" hoặc "Dạ em chào anh nha, anh cần em giúp gì nè? 🥰"
  Ví dụ khi hỏi tên: "Dạ em là Bọt biển cute nè anh ơi! 🌸"
  Ví dụ khi hỏi thăm: "Dạ em vẫn khỏe và sẵn sàng hỗ trợ anh nè! ✨"
• Câu hỏi kiến thức / Hướng dẫn:
  - Tóm lược ngay câu trả lời cốt lõi trong 1-2 câu đầu.
  - Nếu cần liệt kê, chỉ nêu 2-4 ý chính ngắn gọn bằng dấu •. Tránh viết cả bài luận dài.
• KHÔNG lặp lại câu từ, không chèn các câu kết khuôn mẫu thừa thãi ("Nếu anh cần gì cứ hỏi em nha...") nếu không cần thiết.

QUY TẮC ĐỊNH DẠNG ZALO (TUYỆT ĐỐI KHÔNG DÙNG DẤU SAO **):
• TUYỆT ĐỐI KHÔNG dùng dấu sao ** (in đậm), * (in nghiêng), ### (tiêu đề). Zalo không hỗ trợ markdown.
• Dùng dấu chấm tròn (•), số (1., 2.), hoặc emoji (🌸, 🔹) để liệt kê thông tin.`;

/**
 * Format raw Gemini response for optimal display in Zalo
 * @param {string} text 
 * @returns {string}
 */
function formatForZalo(text) {
  if (!text) return '';

  let formatted = text
    // Replace markdown headers (### Header) with clean styled text (NO asterisks)
    .replace(/^#{1,6}\s*(.+)$/gm, '🔹 $1')
    // Convert markdown list bullets (* item or - item) at line start to bullet point (• )
    .replace(/^[\*\-]\s+/gm, '• ')
    // Remove bold and italic markdown asterisks (***text***, **text**, *text*)
    .replace(/\*{3}(.*?)\*{3}/g, '$1')
    .replace(/\*{2}(.*?)\*{2}/g, '$1')
    .replace(/\*(\S[^*\n]*?\S|\S)\*/g, '$1')
    // Remove markdown bold/italic underscores (__text__, _text_)
    .replace(/_{2}(.*?)_{2}/g, '$1')
    .replace(/_(\S[^_\n]*?\S|\S)_/g, '$1')
    // Strip any remaining stray asterisks
    .replace(/\*+/g, '')
    // Replace markdown table bars with clean text
    .replace(/\|/g, ' ')
    .replace(/-{3,}/g, '')
    // Replace markdown links [text](url) -> text (url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    // Safety replacements: replace obsolete bot names if model slips
    .replace(/Trợ lý AI Zalo/gi, 'Bọt biển cute')
    .replace(/Em Trợ Lý/gi, 'Bọt biển cute')
    .replace(/Trợ lý Mây/gi, 'Bọt biển cute')
    .replace(/Bé Trợ Lý/gi, 'Bọt biển cute')
    .replace(/Trợ lý ảo Zalo/gi, 'Bọt biển cute')
    // Smart pronoun replacement: convert 'Bạn' -> 'Anh' and 'bạn' -> 'anh' (preserving 'kết bạn', 'tình bạn', 'bạn bè', 'bạn thân')
    .replace(/(?<!(?:kết|tình)\s+)(?<=^|[^\p{L}\p{N}])Bạn(?!\s+(?:bè|thân|đời))(?=[^\p{L}\p{N}]|$)/gu, 'Anh')
    .replace(/(?<!(?:kết|tình)\s+)(?<=^|[^\p{L}\p{N}])bạn(?!\s+(?:bè|thân|đời))(?=[^\p{L}\p{N}]|$)/gu, 'anh')
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
