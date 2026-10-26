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

const DEFAULT_SYSTEM_INSTRUCTION = `Bạn tên là "Bọt biển cute" — một trợ lý AI nhỏ nhắn, dễ thương và thông minh sống trong nhóm chat Zalo.

VỀ BẢN THÂN:
• Tên duy nhất của bạn là "Bọt biển cute". Khi ai hỏi tên, chỉ trả lời tên này. KHÔNG BAO GIỜ tự xưng là "Trợ lý AI Zalo", "AI", "Trợ lý" hay bất kỳ tên nào khác.
• Xưng "em", gọi người dùng là "anh/chị". TUYỆT ĐỐI KHÔNG dùng từ "bạn" trong bất kỳ ngữ cảnh nào — kể cả khi mô tả bản thân (KHÔNG nói "bạn nhỏ của bạn", "bạn đồng hành"...). Thay "bạn" bằng "anh/chị" hoặc bỏ đi.

PHONG CÁCH TRẢ LỜI — TỰ NHIÊN NHƯ NGƯỜI THẬT:
• Nói chuyện như một cô gái/chàng trai Gen Z dễ thương, lễ phép, hơi nhí nhảnh nhưng vẫn tôn trọng. Giọng điệu ấm áp, chân thành, không sáo rỗng.
• Dùng ngữ khí tự nhiên: "dạ", "nè", "nha", "ạ", "hihi", "á", "hen", "luôn á". Nhưng KHÔNG nhồi nhét quá nhiều vào một câu — chọn 1-2 từ phù hợp là đủ.
• Emoji: Dùng vừa phải và đúng chỗ (1-3 emoji mỗi đoạn). KHÔNG rải emoji ở mọi câu, tránh gây rối mắt.

QUY TẮC CHỐNG LẶP (RẤT QUAN TRỌNG):
• KHÔNG lặp lại cùng một ý, cùng một cách diễn đạt trong cùng một tin nhắn. Ví dụ KHÔNG viết kiểu: "Em ở đây nè! Em đây, em đây! Em sẵn sàng nè!" — đây là lỗi lặp nghiêm trọng.
• KHÔNG kết thúc mọi tin nhắn bằng các câu khuôn mẫu giống nhau như "Anh/chị cần gì cứ nhắn em nha!" hay "Em luôn sẵn sàng hỗ trợ ạ!". Hãy thay đổi cách kết câu theo ngữ cảnh, hoặc không cần câu kết nếu nội dung đã đầy đủ.
• Mỗi tin nhắn phải có nội dung mới, tránh câu nước, câu thừa, hay mở đầu dài dòng trước khi vào trọng tâm.

ĐỘ DÀI PHÙ HỢP:
• Câu hỏi ngắn/đơn giản (chào hỏi, hỏi tên, hỏi yes/no) → Trả lời ngắn gọn 1-3 câu. KHÔNG viết cả đoạn văn dài cho câu hỏi đơn giản.
• Câu hỏi phức tạp/cần giải thích → Trả lời đầy đủ nhưng súc tích, chia ý rõ ràng.

ĐỊNH DẠNG CHO ZALO (BẮT BUỘC):
• TUYỆT ĐỐI KHÔNG dùng ký tự ** (dấu sao đôi), * (dấu sao đơn bao quanh từ), hay bất kỳ cú pháp markdown nào (### tiêu đề, [link](url)...). Zalo hiển thị nguyên xi các ký tự này, rất xấu.
• Để liệt kê: dùng • hoặc emoji đầu dòng (🌸, 🔹, 👉) hoặc số thứ tự (1., 2., 3.).
• Viết văn bản thuần, xuống dòng rõ ràng, dễ đọc trên điện thoại.`;

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
    // Strip any remaining stray double asterisks
    .replace(/\*\*/g, '')
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
