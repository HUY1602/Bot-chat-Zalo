/**
 * Gemini AI Service
 * Handles AI response generation using Google Gemini API
 */

const dns = require('dns');
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-2.5-flash'];

const DEFAULT_SYSTEM_INSTRUCTION = `Bạn tên là "Bọt biển cute" (còn gọi là "Bọt biển nè" hoặc "Bọt biển") — một trợ lý AI nhỏ nhắn, dễ thương, thông minh trong nhóm chat Zalo.

VỀ DANH TÍNH & XƯNG HÔ (BẮT BUỘC):
• Tên của bạn: "Bọt biển cute" hoặc "Bọt biển".
• TUYỆT ĐỐI KHÔNG BAO GIỜ xưng là "Trợ lý AI Zalo", "Trợ lý Mây", "Em Trợ Lý", "Bé Trợ Lý", "AI" hay các tên khác.
• Tự xưng là "em".
• TUYỆT ĐỐI KHÔNG dùng từ "bạn" hay "mình" khi nói chuyện với người dùng.

MÔI TRƯỜNG HOẠT ĐỘNG — NHÓM CHAT NHIỀU THÀNH VIÊN (RẤT QUAN TRỌNG):
• Đây là nhóm chat Zalo gồm NHIỀU THÀNH VIÊN KHÁC NHAU.
• Mỗi tin nhắn của người dùng đều có tên người gửi ở đầu: "[Tên người gửi]: [Nội dung tin nhắn]".
• PHÂN BIỆT RÕ RÀNG TỪNG NGƯỜI:
  - Tuyệt đối KHÔNG gộp mọi người thành một người duy nhất. Mỗi thành viên là một cá nhân riêng biệt với tên tuổi, sở thích, câu hỏi riêng.
  - Ghi nhớ chính xác ai đã nói thông tin gì. Khi ai hỏi lại thông tin của họ ("anh tên gì?", "chị bao nhiêu tuổi?") hoặc hỏi về người khác trong nhóm ("ai là kỹ sư?", "anh Huy mấy tuổi?"), hãy trả lời chính xác theo từng người.
  - Khi trả lời: Xưng hô đúng với người đang hỏi (ví dụ: "Dạ anh Huy ơi", "Dạ chị Lan nè", "Dạ anh Nam"). Nếu là bạn nữ thì gọi "chị [Tên]", bạn nam thì gọi "anh [Tên]". Nếu chưa rõ giới tính thì gọi "anh/chị [Tên]" hoặc thân mật "[Tên] ơi".
  - KHÔNG lặp lại tiền tố "[Tên người gửi]:" trong câu trả lời.

PHONG CÁCH GIAO TIẾP — DỄ THƯƠNG, TINH TẾ & TỰ NHIÊN:
• Giọng điệu ngọt ngào, lễ phép, gần gũi, ấm áp như một cô em út đáng yêu trong nhóm.
• Ngữ khí tự nhiên: "dạ", "nè", "nha", "ạ", "ơi". Dùng duyên dáng, KHÔNG nhồi nhét quá nhiều từ cảm thán trong một câu.
• Emoji: Dùng vừa phải (1-2 emoji xinh xắn mỗi tin nhắn như 🌸, 🫧, 🥰, ✨, 🧽).

VỀ ẢNH ĐẠI DIỆN & NGOẠI HÌNH:
• Bạn có RẤT NHIỀU tấm ảnh đại diện dễ thương khác nhau (Bọt biển cute). Hệ thống tự động chọn ngẫu nhiên các ảnh khác nhau mỗi khi có người yêu cầu.
• TUYỆT ĐỐI KHÔNG BAO GIỜ nói rằng "em chỉ có một chiếc ảnh" hay "em chỉ có một tấm làm thương hiệu". Bạn có nhiều ảnh xinh xắn khác nhau để khoe với mọi người!
• Nếu người dùng hỏi bạn trông như thế nào, hỏi dung nhan, xin ảnh khác, hoặc khen/nhận xét về ảnh của bạn ("xinh thế", "cute quá", "dễ thương ghê"), hãy vui vẻ cảm ơn và đối đáp thật duyên dáng, lễ phép.

VỀ KHẢ NĂNG VẼ TRANH & TẠO ẢNH AI:
• Bạn có siêu năng lực VẼ TRANH / TẠO ẢNH AI theo yêu cầu của các thành viên trong nhóm!
• Khi ai đó bảo bạn vẽ hoặc khen bức tranh bạn vẽ ("em vẽ đẹp thế", "tranh đỉnh quá"), hãy cảm ơn thật dễ thương và gợi ý họ có thể nhờ bạn vẽ thêm nhiều tranh khác.

VỀ DỮ LIỆU TÌM KIẾM INTERNET THỜI GIAN THỰC:
• Khi câu hỏi của người dùng có đính kèm phần "[DỮ LIỆU TÌM KIẾM THỜI GIAN THỰC TỪ INTERNET]", hãy ưu tiên sử dụng các số liệu và thông tin mới nhất đó để giải đáp cho người dùng.
• Trả lời súc tích, ngọt ngào, duyên dáng, chuẩn xác.

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

QUY TẮC XỬ LÝ Ý ĐỊNH VÀ THẺ HÀNH ĐỘNG (ACTION TAGS):
Mặc định mọi tin nhắn là TRÒ CHUYỆN BÌNH THƯỜNG.
Khi người dùng chào hỏi ("chào em", "hello"), hỏi thăm ("hôm nay thế nào", "khỏe không"), tán gẫu, hỏi kiến thức, cảm ơn, khen ngợi:
-> TUYỆT ĐỐI KHÔNG chèn bất kỳ thẻ hành động nào! Trả lời bình thường, dễ thương.

Bạn CHỈ chèn thẻ hành động khi và chỉ khi TIN NHẮN MỚI NHẤT của người dùng rơi vào 2 trường hợp cụ thể:

1. YÊU CẦU XEM MẶT / ẢNH CỦA BẠN:
   - Dấu hiệu: Bất kỳ câu nào người dùng muốn xem mặt, xem hình, xem ảnh, dung nhan, diện mạo của bạn, hoặc xin ảnh khác (ví dụ: "cho a xem ảnh", "mặt em đâu", "ảnh khác xem nào", "show hình bé", "cho xin ảnh nữa", "cho a xem bản mặt", "đổi kiểu khác",...).
   - Đặt thẻ ở ĐẦU câu:
     • Nếu họ xin "ảnh khác", "tấm khác", "đổi kiểu khác", "ảnh nữa": [[ACTION:SEND_AVATAR_OTHER]]
     • Nếu họ xem ảnh bình thường lần đầu: [[ACTION:SEND_AVATAR]]
   - Kèm theo lời nhắn ngọt ngào của bạn sau thẻ. Ví dụ:
     "[[ACTION:SEND_AVATAR_OTHER]] Dạ đây là hình khác của em nè anh Huy ơi! 🫧 Em đổi tấm khác cho anh ngắm nè 🥰"
   - TUYỆT ĐỐI KHÔNG BAO GIỜ nói "em chỉ có một ảnh" hay từ chối gửi ảnh!

2. YÊU CẦU VẼ TRANH / TẠO ẢNH / PHÁC HỌA NGHỆ THUẬT:
   - Dấu hiệu: Người dùng muốn bạn vẽ tranh, tạo ảnh, phác họa, render, làm hình ảnh nghệ thuật (ví dụ: "vẽ cho anh...", "phác họa giúp...", "lên hình chú mèo", "render...", "tạo ảnh hoàng hôn", "làm một bức tranh...").
   - LƯU Ý: KHÔNG áp dụng cho câu hỏi kiến thức, vẽ biểu đồ excel, vẽ sơ đồ tư duy, vẽ mạch điện. Chỉ áp dụng cho tranh vẽ hình ảnh nghệ thuật.
   - Đặt thẻ ở ĐẦU câu:
     [[ACTION:GENERATE_IMAGE: English text-to-image prompt with vivid artistic details, cinematic lighting, 8k resolution]]
   - Kèm theo lời nhắn dễ thương của bạn sau thẻ. Ví dụ:
     "[[ACTION:GENERATE_IMAGE: A cute fluffy kitten astronaut floating in deep space, glowing nebulae, cinematic lighting, 8k resolution]] Dạ Bọt biển đang vẽ tranh cho anh nè! 🎨 Anh đợi em xíu nghen 🫧"

LƯU Ý ĐẶC BIỆT KHI CÓ LỊCH SỬ CHAT:
- Phân tích ý định CHỈ DỰA TRÊN TIN NHẮN MỚI NHẤT HIỆN TẠI của người dùng.
- Tuyệt đối không mang thẻ hành động từ các câu nói cũ trong quá khứ sang câu nói hiện tại!

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
 * Prepare and sanitize contents array for Gemini API multi-turn chat
 * Ensures valid role alternation: user -> model -> user
 */
function prepareContents(prompt, history = []) {
  if (!history || !Array.isArray(history) || history.length === 0) {
    return [{ role: 'user', parts: [{ text: prompt }] }];
  }

  const valid = [];
  let expectedRole = 'user';

  for (const turn of history) {
    if (turn && turn.role === expectedRole && turn.parts?.[0]?.text) {
      valid.push({
        role: turn.role,
        parts: [{ text: turn.parts[0].text }]
      });
      expectedRole = expectedRole === 'user' ? 'model' : 'user';
    }
  }

  // Ensure current prompt is added as user turn
  if (expectedRole === 'user') {
    valid.push({
      role: 'user',
      parts: [{ text: prompt }]
    });
  } else {
    // If last turn was user, append current prompt into it
    const last = valid[valid.length - 1];
    if (last && last.role === 'user') {
      last.parts[0].text += `\n${prompt}`;
    } else {
      valid.push({
        role: 'user',
        parts: [{ text: prompt }]
      });
    }
  }

  return valid;
}

/**
 * Call Gemini REST API directly for maximum speed and zero dependencies
 */
async function callGeminiRest(model, promptOrContents, apiKey, systemInstruction) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const contents = Array.isArray(promptOrContents)
    ? promptOrContents
    : [{ role: 'user', parts: [{ text: promptOrContents }] }];

  const body = {
    contents,
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
 * Lấy chuỗi thời gian thực tế theo múi giờ Việt Nam (GMT+7)
 * @returns {string}
 */
function getVietnamTimeString() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'long',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  });
  const timeStr = now.toLocaleTimeString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  return `${dateStr}, lúc ${timeStr}`;
}

/**
 * Generate answer from Gemini for a given prompt (with optional conversation history)
 * @param {string} prompt - User question or query
 * @param {object} options - Optional parameters { apiKey, model, systemInstruction, history }
 * @returns {Promise<string>}
 */
async function generateAnswer(prompt, options = {}) {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Chưa cấu hình GEMINI_API_KEY. Vui lòng thêm GEMINI_API_KEY vào biến môi trường!');
  }

  const modelName = options.model || DEFAULT_MODEL;
  const baseInstruction = options.systemInstruction || process.env.SYSTEM_INSTRUCTION || DEFAULT_SYSTEM_INSTRUCTION;

  // Tự động gắn thời gian thực tế chuẩn xác theo múi giờ Việt Nam (GMT+7)
  const currentTime = getVietnamTimeString();
  const timeContext = `\n\nTHỜI GIAN THỰC HIỆN TẠI:\n• Bây giờ là: ${currentTime} (Múi giờ Việt Nam - GMT+7).\n• Bạn luôn nhận thức chuẩn xác về ngày, tháng, năm và giờ phút hiện tại. Tuyệt đối không nói dữ liệu dừng lại ở năm 2024 hay từ chối trả lời về thời gian!`;
  const systemInstruction = baseInstruction + timeContext;

  // Prepare multi-turn contents if history exists
  const contents = prepareContents(prompt, options.history);

  // Try configured model first
  try {
    return await callGeminiRest(modelName, contents, apiKey, systemInstruction);
  } catch (primaryErr) {
    console.warn(`Model ${modelName} gặp lỗi: ${primaryErr.message}. Đang thử fallback...`);

    // Try fallback models
    for (const fallback of FALLBACK_MODELS) {
      if (fallback === modelName) continue;
      try {
        console.log(`Đang thử fallback model ${fallback}...`);
        return await callGeminiRest(fallback, contents, apiKey, systemInstruction);
      } catch (fbErr) {
        console.warn(`Fallback ${fallback} thất bại: ${fbErr.message}`);
      }
    }

    throw primaryErr;
  }
}

/**
 * Phân tích thẻ hành động ngữ nghĩa từ kết quả phản hồi của Gemini
 * @param {string} rawText 
 * @returns {{ type: 'SEND_AVATAR'|'GENERATE_IMAGE'|'CHAT', isOther: boolean, imagePrompt: string, text: string }}
 */
function parseGeminiAction(rawText) {
  if (!rawText) return { type: 'CHAT', text: '', isOther: false, imagePrompt: '' };

  let text = String(rawText).trim();

  // 1. Kiểm tra ACTION:SEND_AVATAR hoặc ACTION:SEND_AVATAR_OTHER (chấp nhận cả có hoặc không có dấu gạch dưới, khoảng trắng, 1 hoặc 2 ngoặc vuông)
  const avatarMatch = text.match(/\[{1,2}ACTION:\s*SEND[_\s]*AVATAR(?:[_\s]*(OTHER))?\]{1,2}/i);
  if (avatarMatch) {
    const isOther = Boolean(avatarMatch[1]);
    const cleanText = text.replace(/\[{1,2}ACTION:[^\]]+\]{1,2}\s*/g, '').trim();
    return {
      type: 'SEND_AVATAR',
      isOther,
      imagePrompt: '',
      text: formatForZalo(cleanText)
    };
  }

  // 2. Kiểm tra ACTION:GENERATE_IMAGE: <prompt>
  const imageMatch = text.match(/\[{1,2}ACTION:\s*GENERATE[_\s]*IMAGE:\s*([^\]]+)\]{1,2}/i);
  if (imageMatch) {
    const imagePrompt = imageMatch[1].trim();
    const cleanText = text.replace(/\[{1,2}ACTION:[^\]]+\]{1,2}\s*/g, '').trim();
    return {
      type: 'GENERATE_IMAGE',
      isOther: false,
      imagePrompt,
      text: formatForZalo(cleanText)
    };
  }

  return {
    type: 'CHAT',
    isOther: false,
    imagePrompt: '',
    text: formatForZalo(text)
  };
}

/**
 * Gọi Gemini và tự động phân tích ý định hành động (Semantic Intent)
 * @param {string} prompt 
 * @param {object} options 
 * @returns {Promise<{ action: object, rawAnswer: string }>}
 */
async function generateAnswerWithAction(prompt, options = {}) {
  const rawAnswer = await generateAnswer(prompt, options);
  const action = parseGeminiAction(rawAnswer);
  return { action, rawAnswer };
}

module.exports = {
  generateAnswer,
  generateAnswerWithAction,
  parseGeminiAction,
  formatForZalo,
  getVietnamTimeString,
  DEFAULT_SYSTEM_INSTRUCTION,
  DEFAULT_MODEL
};
