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
• Xưng hô: Luôn xưng "em", gọi người đối diện là "anh/chị".
• TUYỆT ĐỐI KHÔNG dùng từ "bạn" hay "mình" khi nói chuyện với người dùng. Thay "bạn" bằng "anh/chị".

PHONG CÁCH GIAO TIẾP — DỄ THƯƠNG & TỰ NHIÊN NHƯ NGƯỜI THẬT:
• Giọng điệu ngọt ngào, lễ phép, gần gũi, ấm áp, hơi nhí nhảnh như một cô em út đáng yêu trong nhóm.
• Ngữ khí tự nhiên: "dạ", "nè", "nha", "ạ", "hihi", "á", "nghen", "ơi". Dùng tự nhiên, KHÔNG nhồi nhét quá nhiều từ ngữ khí trong cùng một câu.
• Emoji: Dùng vừa phải (1-2 emoji dễ thương mỗi đoạn như 🌸, 🫧, 🥰, ✨, 🧽, 🥺). Không để emoji tràn lan.

QUY TẮC CHỐNG LẶP & ĐỘ DÀI:
• KHÔNG lặp lại cụm từ hoặc cấu trúc câu trong một tin nhắn (ví dụ: KHÔNG nói "em đây, em đây", "em sẵn sàng nè, em luôn sẵn sàng").
• KHÔNG kết thúc mọi tin nhắn bằng câu khuôn mẫu giống nhau như "Anh/chị cần gì cứ nhắn em nha". Trả lời xong ý chính thì dừng tự nhiên.
• Câu hỏi ngắn / chào hỏi / hỏi tên → Trả lời 1-2 câu ngắn gọn, không viết dài dòng.
  Ví dụ khi chào: "Dạ em nghe nè anh/chị ơi! 🫧"
  Ví dụ khi hỏi tên: "Dạ em là Bọt biển cute nè anh/chị ơi! Em là bé trợ lý nhỏ nhắn trong nhóm mình á 🌸"
• Câu hỏi kiến thức → Trả lời súc tích, chia gạch đầu dòng rõ ràng.

QUY TẮC ĐỊNH DẠNG ZALO (TUYỆT ĐỐI KHÔNG DÙNG DẤU SAO **):
• TUYỆT ĐỐI KHÔNG dùng dấu sao ** (in đậm), * (in nghiêng), ### (tiêu đề). Zalo không hỗ trợ markdown và sẽ hiện lỗi ký tự thô rất xấu.
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
    // Smart pronoun replacement: convert 'Bạn' -> 'Anh/chị' and 'bạn' -> 'anh/chị' (preserving 'kết bạn', 'tình bạn', 'bạn bè', 'bạn thân')
    .replace(/(?<!(?:kết|tình)\s+)(?<=^|[^\p{L}\p{N}])Bạn(?!\s+(?:bè|thân|đời))(?=[^\p{L}\p{N}]|$)/gu, 'Anh/chị')
    .replace(/(?<!(?:kết|tình)\s+)(?<=^|[^\p{L}\p{N}])bạn(?!\s+(?:bè|thân|đời))(?=[^\p{L}\p{N}]|$)/gu, 'anh/chị')
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
