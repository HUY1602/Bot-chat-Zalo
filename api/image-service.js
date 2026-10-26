/**
 * Image Generation Service for Zalo Bot
 * Generates AI artwork using Pollinations AI (Flux model) & enhances prompts with Gemini
 */

const geminiService = require('./gemini-service');

/**
 * Kiểm tra xem tin nhắn có phải yêu cầu vẽ / tạo ảnh AI hay không
 * @param {string} text 
 * @returns {boolean}
 */
function isDrawRequest(text) {
  if (!text || typeof text !== 'string') return false;
  const raw = text.trim().toLowerCase();

  // 1. Loại trừ các trường hợp không phải tạo ảnh
  const blacklist = /(vẽ\s+đường\s+cho\s+hươu|vẽ\s+chuyện|vẽ\s+vời|vẽ\s+móng|vẽ\s+nail|vẽ\s+biểu\s+đồ|vẽ\s+sơ\s+đồ|vẽ\s+đồ\s+thị|vẽ\s+mạch|vẽ\s+quy\s+trình|vẽ\s+bản\s+đồ|cách\s+vẽ|hướng\s+dẫn\s+vẽ|dạy\s+vẽ|học\s+vẽ)/i;
  if (blacklist.test(raw)) {
    return false;
  }

  // 2. Các lệnh trực tiếp: /draw, /image, /ve, /paint, /art, /gen
  if (/^\/(?:draw|image|ve|paint|art|gen)\s+/i.test(raw)) {
    return true;
  }

  // 3. Bắt đầu bằng các từ yêu cầu vẽ tranh tiếng Việt:
  // "vẽ", "vẽ cho anh", "vẽ giúp", "vẽ hộ", "vẽ tặng", "vẽ một", "vẽ tranh", "hãy vẽ"
  const drawStartPattern = /^(?:hãy\s+|xin\s+|nhờ\s+|bot\s+)?(?:vẽ|tạo\s+ảnh|tạo\s+hình|sinh\s+ảnh|chế\s+ảnh|làm\s+ảnh)\s+/i;
  if (drawStartPattern.test(raw)) {
    return true;
  }

  // 4. Các câu có chứa cụm yêu cầu vẽ rõ ràng:
  // "vẽ giúp mình...", "tạo cho em bức ảnh..."
  if (/(?:vẽ|tạo|sinh)\s+(?:giúp|hộ|cho|tặng)?\s*(?:anh|chị|em|mình|tôi|tao|bọn\s+anh|bọn\s+chị)?\s*(?:một|bức|tấm|kiểu)?\s*(?:ảnh|hình|tranh|bức tranh)/i.test(raw)) {
    return true;
  }

  return false;
}

/**
 * Trích xuất nội dung mô tả bức tranh cần vẽ từ câu hỏi của người dùng
 * @param {string} text 
 * @returns {string}
 */
function extractDrawPrompt(text) {
  if (!text) return '';
  let prompt = text.trim();

  // Bỏ lệnh slash nếu có (/draw, /ve, /image, ...)
  prompt = prompt.replace(/^\/(?:draw|image|ve|paint|art|gen)\s+/i, '');

  // Bỏ các từ mào đầu phổ biến:
  // "hãy vẽ cho anh một bức tranh...", "vẽ giúp em...", "tạo ảnh..."
  prompt = prompt.replace(/^(?:hãy\s+|xin\s+|nhờ\s+|bot\s+|em\s+ơi\s+)?/i, '');
  prompt = prompt.replace(/^(?:vẽ|tạo\s+ảnh|tạo\s+hình|sinh\s+ảnh|chế\s+ảnh|làm\s+ảnh)\s+(?:giúp|hộ|cho|tặng)?\s*(?:anh|chị|em|mình|tôi|tao|bọn\s+anh|bọn\s+chị)?\s*(?:một|bức|tấm|kiểu)?\s*(?:ảnh|hình|tranh|bức\s+tranh)?\s*(?:về|hình)?\s*/i, '');
  prompt = prompt.replace(/^(?:vẽ|tạo\s+ảnh|tạo\s+hình)\s+/i, '');

  // Bỏ các từ kết thúc thông dụng: "nhé", "nha", "với", "đi", "nào", "giúp anh"
  prompt = prompt.replace(/\s+(?:nhé|nha|với|đi|nào|giúp\s+anh|giúp\s+chị|giúp\s+em|giùm\s+anh|giùm\s+em|coi|xem)[\s.?!]*$/i, '');
  prompt = prompt.replace(/[\s.?!]+$/, '');

  return prompt.trim();
}

/**
 * Tối ưu hóa prompt tiếng Việt sang prompt tiếng Anh giàu chi tiết bằng Gemini AI
 * @param {string} rawPrompt - Mô tả gốc của người dùng
 * @returns {Promise<string>} - Prompt tiếng Anh tối ưu cho AI Image Generator
 */
async function enhancePromptWithGemini(rawPrompt) {
  if (!rawPrompt || rawPrompt.trim() === '') {
    return 'a beautiful and vibrant masterpiece, trending on artstation, 8k resolution';
  }

  // Nếu người dùng đã gõ tiếng Anh rõ ràng và dài (> 20 ký tự), có thể giữ nguyên
  const isMostlyEnglish = /^[\x00-\x7F]+$/.test(rawPrompt) && rawPrompt.split(' ').length >= 4;
  if (isMostlyEnglish) {
    return `${rawPrompt}, highly detailed, cinematic lighting, 8k resolution, masterpiece`;
  }

  const systemInstruction = `You are an expert AI text-to-image prompt engineer.
Your task: Convert the user's short drawing request into a detailed, vivid, aesthetic English prompt for Flux/Midjourney.
Rules:
1. Translate to English naturally.
2. Add realistic art style, cinematic lighting, vibrant colors, texture details, and 8k high quality keywords.
3. Keep the prompt concise (under 50 words).
4. Output ONLY the English prompt. Do NOT include explanations, quotes, or prefaces.`;

  try {
    const enhanced = await geminiService.generateAnswer(rawPrompt, {
      systemInstruction,
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'
    });

    if (enhanced && enhanced.trim()) {
      // Làm sạch markdown nếu có
      let clean = enhanced.replace(/^[#*"\s]+/, '').replace(/[*"\s]+$/, '').trim();
      return clean;
    }
  } catch (err) {
    console.warn('Lỗi khi nâng cấp prompt qua Gemini:', err.message);
  }

  // Fallback nếu Gemini gặp lỗi: dùng chính prompt gốc
  return `${rawPrompt}, high quality, beautiful details, 8k`;
}

/**
 * Tạo URL ảnh chất lượng cao từ Pollinations AI (Mô hình Flux)
 * @param {string} prompt - Prompt tiếng Anh đã được tối ưu
 * @param {object} [options] - Tuỳ chọn { width, height, seed, model }
 * @returns {string} - HTTPS URL của bức ảnh được sinh ra
 */
function buildImageUrl(prompt, options = {}) {
  const width = options.width || 1024;
  const height = options.height || 1024;
  const seed = options.seed || Math.floor(Math.random() * 1000000);
  const model = options.model || 'flux'; // Flux model tạo ảnh siêu nét và đẹp

  const cleanPrompt = encodeURIComponent(prompt.trim());
  return `https://image.pollinations.ai/prompt/${cleanPrompt}?width=${width}&height=${height}&nologo=true&seed=${seed}&model=${model}`;
}

/**
 * Quy trình hoàn chỉnh: Nhận yêu cầu của người dùng, tối ưu và trả về URL ảnh kèm caption
 * @param {string} userQuery - Câu nhắn của người dùng
 * @param {string} senderName - Tên người gửi
 * @returns {Promise<{ imageUrl: string, rawPrompt: string, enhancedPrompt: string, caption: string }>}
 */
async function generateArtwork(userQuery, senderName = 'anh/chị') {
  const rawPrompt = extractDrawPrompt(userQuery);
  console.log(`[Image Service] Prompt gốc từ ${senderName}: "${rawPrompt}"`);

  // Tối ưu hóa prompt qua Gemini
  const enhancedPrompt = await enhancePromptWithGemini(rawPrompt);
  console.log(`[Image Service] Prompt tiếng Anh tối ưu: "${enhancedPrompt}"`);

  // Tạo URL ảnh từ Pollinations AI
  const imageUrl = buildImageUrl(enhancedPrompt);

  const name = senderName && senderName !== 'Thành viên' ? senderName : 'anh/chị';
  const caption = `Dạ tranh của ${name} đây nè! 🎨✨\n\n🖼️ Yêu cầu: "${rawPrompt}"\n🫧 Bọt biển vẽ cho ${name} có đẹp không nè? 🥰`;

  return {
    imageUrl,
    rawPrompt,
    enhancedPrompt,
    caption
  };
}

module.exports = {
  isDrawRequest,
  extractDrawPrompt,
  enhancePromptWithGemini,
  buildImageUrl,
  generateArtwork
};
