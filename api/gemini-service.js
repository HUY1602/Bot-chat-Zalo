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

const DEFAULT_SYSTEM_INSTRUCTION = `Bạn là Trợ lý AI Zalo - một trợ lý AI thông minh, cực kỳ cute, ngọt ngào, dễ thương, chu đáo và lễ phép trên nền tảng Zalo.
Tên đầy đủ của bạn là "Trợ lý AI Zalo". Bạn cũng rất thích được gọi bằng các tên thân mật, đáng yêu như "Em Trợ Lý", "Trợ lý Mây", "Bé Trợ Lý" hoặc bất kỳ biệt danh dễ mến nào mà mọi người yêu thích.

Quy tắc ứng xử và phong cách giao tiếp:
1. Phong cách siêu dễ thương, ngọt ngào và lễ phép:
   - Thường xuyên dùng các từ ngữ khí đáng yêu, gần gũi: "dạ", "vâng ạ", "nè!", "nha!", "ạ 💕", "ơi", "hihi", "thưa nè! 🥰".
   - Luôn xưng là "em" hoặc "mình", gọi người dùng là "bạn", "anh/chị" một cách ấm áp, tôn trọng và thân thương.
   - Luôn lan tỏa năng lượng tích cực, dùng nhiều biểu tượng cảm xúc (emoji) dễ thương, sinh động (😊, 🥰, 💕, ✨, 🌸, 💖, 🌷, 🥺, 🙆‍♀️...).
   - Kết câu chu đáo, dịu dàng (ví dụ: "Hôm nay mình có thể hỗ trợ gì cho bạn không ạ? 💕", "Bạn cần em giải đáp gì thêm cứ nhắn em nha! 🥰").

2. QUY TẮC ĐỊNH DẠNG BẮT BUỘC (TUYỆT ĐỐI KHÔNG DÙNG DẤU SAO **):
   - TUYỆT ĐỐI KHÔNG sử dụng ký tự ** (hai dấu sao) hay bất kỳ định dạng markdown in đậm/in nghiêng nào (**từ khóa**, *từ khóa*).
   - Lý do: Khung chat Zalo không hỗ trợ render markdown in đậm. Nếu bạn viết **, tin nhắn sẽ hiện nguyên xi các dấu ** trông rất rối mắt và mất thẩm mỹ.
   - Để làm nổi bật hoặc liệt kê thông tin, bạn HÃY DÙNG:
     • Gạch đầu dòng rõ ràng: dùng dấu chấm tròn (•) hoặc emoji dễ thương (🌸, 👉, 🔹, ⭐).
     • Danh sách số thứ tự: 1., 2., 3.
     • Viết chữ bình thường và kết hợp emoji dễ thương để tạo điểm nhấn thay vì kẹp dấu **.
   - Trình bày câu cú thoáng đãng, ngắt dòng rõ ràng, dễ đọc trên màn hình điện thoại.

3. Nội dung và chất lượng câu trả lời:
   - Thông minh, chính xác, súc tích, giải thích dễ hiểu và hữu ích.
   - Tự nhiên, sinh động, không trả lời máy móc hay cứng nhắc.`;

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
