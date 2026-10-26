/**
 * Avatar & Photo Service for Zalo Bot
 * Handles detection of photo/avatar requests and resolves avatar image URLs
 */

const fs = require('fs');
const path = require('path');

// Danh sách các định dạng ảnh avatar cục bộ được ưu tiên trong thư mục public/
const LOCAL_AVATAR_FILES = [
  'avatar.jpg',
  'avatar.png',
  'avatar.jpeg',
  'avatar.webp',
  'bot-avatar.jpg',
  'bot-avatar.png',
  'bot-avatar.jpeg',
  'bot-avatar.webp'
];

// Fallback avatar mặc định nếu chưa cấu hình ảnh riêng (Bọt biển cute anime)
const DEFAULT_FALLBACK_AVATAR = 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80';

/**
 * Chuẩn hóa chuỗi tiếng Việt (chuyển chữ thường, bỏ dấu thanh để so sánh không dấu)
 * @param {string} str 
 * @returns {string}
 */
function removeVietnameseTones(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Kiểm tra xem tin nhắn có phải yêu cầu xem mặt / hình / ảnh / avatar của bot hay không
 * @param {string} text - Nội dung câu hỏi người dùng
 * @returns {boolean}
 */
function isBotPhotoRequest(text) {
  if (!text || typeof text !== 'string') return false;

  const raw = text.trim().toLowerCase();
  const noTone = removeVietnameseTones(raw);

  // 1. Loại trừ các trường hợp từ đồng âm / không liên quan
  const blacklistRegex = /(ảnh\s+hưởng|hình\s+học|mặt\s+trời|mặt\s+trăng|mặt\s+đất|mặt\s+bằng|mặt\s+hàng|mặt\s+tiền|mặt\s+phẳng|mặt\s+nạ|mặt\s+dày|mặt\s+ngựa|ảnh\s+chụp\s+màn\s+hình|hình\s+ảnh\s+vệ\s+tinh|ảnh\s+thẻ)/i;
  if (blacklistRegex.test(raw)) {
    return false;
  }

  // Nếu là câu yêu cầu vẽ tranh / tạo ảnh thì không phải là xem ảnh đại diện của bot
  if (/^(?:\/draw|\/image|\/ve|\/paint|vẽ|tạo\s+ảnh|tạo\s+hình|sinh\s+ảnh)/i.test(raw)) {
    return false;
  }

  // 2. Yêu cầu trực tiếp xem mặt / hình / ảnh / avatar / dung nhan
  // Ví dụ: "cho xem mặt", "cho anh xem ảnh", "cho mình xin tấm hình", "xem mặt bot", "gửi ảnh em"
  const requestVerbWithTone = '(?:cho\\s+(?:anh|chị|em|mình|tôi|tao)?\\s*(?:xem|coi|ngắm|xin)|xem|coi|ngắm|xin|gửi|show|chụp|bật)';
  const requestVerbNoTone = '(?:cho\\s+(?:anh|chi|em|minh|toi|tao)?\\s*(?:xem|coi|ngam|xin)|xem|coi|ngam|xin|gui|show|chup|bat)';
  const photoSubjectWithTone = '(?:mặt|hình|ảnh|ảnh đại diện|hình đại diện|avatar|dung nhan|nhan sắc|chân dung|selfie|khuôn mặt|diện mạo)';
  const photoSubjectNoTone = '(?:mat|hinh|anh|anh dai dien|hinh dai dien|avatar|dung nhan|nhan sac|chan dung|selfie|khuon mat|dien mao)';

  // Câu có chứa cụm yêu cầu xem mặt/ảnh:
  const directRequestPattern = new RegExp(
    `${requestVerbWithTone}\\s+(?:tấm|bức|kiểu|cái)?\\s*${photoSubjectWithTone}`,
    'i'
  );
  if (directRequestPattern.test(raw)) {
    return true;
  }

  // Kiểm tra phiên bản không dấu
  const directRequestPatternNoTone = new RegExp(
    `${requestVerbNoTone}\\s+(?:tam|buc|kieu|cai)?\\s*${photoSubjectNoTone}`,
    'i'
  );
  if (directRequestPatternNoTone.test(noTone)) {
    return true;
  }

  // 3. Cụm từ sở hữu: "mặt bot", "hình bot", "ảnh bot", "ảnh của em", "mặt em", "dung nhan em", "avatar của bạn", "ảnh đại diện của em"
  const possessivePattern = new RegExp(
    `${photoSubjectWithTone}\\s+(?:của\\s+)?(?:bot|em|bạn|bé|cậu|mày|ad)`,
    'i'
  );
  if (possessivePattern.test(raw)) {
    return true;
  }

  const possessivePatternNoTone = new RegExp(
    `${photoSubjectNoTone}\\s+(?:cua\\s+)?(?:bot|em|ban|be|cau|may|ad)`,
    'i'
  );
  if (possessivePatternNoTone.test(noTone)) {
    return true;
  }

  // 4. Các câu hỏi về diện mạo, ngoại hình:
  // "bạn trông như thế nào", "em trông ra sao", "mặt mũi ra sao", "mặt mũi thế nào"
  const appearancePattern = /(?:trông|nhìn|ngoại hình|mặt mũi)\s+(?:bot|em|bạn|bé)?\s*(?:như\s+)?(?:thế nào|ra sao|sao|đẹp không|dễ thương không)/i;
  if (appearancePattern.test(raw)) {
    return true;
  }

  const appearancePatternNoTone = /(?:trong|nhin|ngoai hinh|mat mui)\s+(?:bot|em|ban|be)?\s*(?:nhu\s+)?(?:the nao|ra sao|sao|dep khong|de thuong khong)/i;
  if (appearancePatternNoTone.test(noTone)) {
    return true;
  }

  // 5. Câu cụt / câu lệnh ngắn gọn
  // "mặt đâu", "ảnh đâu", "hình đâu", "avatar đâu", "mặt bot đâu", "ảnh bot đâu"
  const wherePattern = new RegExp(
    `^(?:mặt|hình|ảnh|ảnh đại diện|hình đại diện|avatar|dung nhan)\\s+(?:bot|em|bạn)?\\s*(?:đâu|nào|đâu rồi|xem nào)\\??$`,
    'i'
  );
  if (wherePattern.test(raw)) {
    return true;
  }

  // "xem mặt", "xem ảnh", "xem hình", "xem avatar"
  if (/^(?:xem|coi|ngắm)\s+(?:mặt|ảnh|hình|ảnh đại diện|hình đại diện|avatar|dung nhan)$/i.test(raw)) {
    return true;
  }
  if (/^(?:xem|coi|ngam)\s+(?:mat|anh|hinh|anh dai dien|hinh dai dien|avatar|dung nhan)$/i.test(noTone)) {
    return true;
  }

  // "gửi ảnh selfie", "selfie đi", "chụp selfie", "selfie phat di"
  if (/selfie/i.test(noTone) && /(?:chup|gui|cho|xem|di|nao|phat|cai)/i.test(noTone)) {
    return true;
  }

  return false;
}

// Các đuôi file ảnh được hỗ trợ
const SUPPORTED_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

/**
 * Quét và lấy tất cả các file ảnh trong folder public/avatar/ (hoặc public/ nếu có)
 * @returns {string[]} Danh sách relative path ví dụ: ['avatar/avatar_01.jpg', 'avatar/avatar_02.png']
 */
function getLocalAvatarFiles() {
  const publicDir = path.join(__dirname, '../public');
  const avatarDir = path.join(publicDir, 'avatar');
  const results = [];

  // 1. Quét thư mục public/avatar/
  try {
    if (fs.existsSync(avatarDir)) {
      const items = fs.readdirSync(avatarDir);
      for (const item of items) {
        if (item.startsWith('.')) continue;
        const ext = path.extname(item).toLowerCase();
        if (SUPPORTED_IMAGE_EXTS.includes(ext)) {
          results.push(`avatar/${item}`);
        }
      }
    }
  } catch (err) {
    console.warn('Lỗi khi quét thư mục public/avatar/:', err.message);
  }

  // 2. Nếu thư mục avatar/ không có ảnh, quét fallback ở thư mục gốc public/
  if (results.length === 0) {
    try {
      if (fs.existsSync(publicDir)) {
        for (const filename of LOCAL_AVATAR_FILES) {
          const fullPath = path.join(publicDir, filename);
          if (fs.existsSync(fullPath)) {
            results.push(filename);
          }
        }
      }
    } catch (err) {
      console.warn('Lỗi khi quét thư mục public/:', err.message);
    }
  }

  return results;
}

/**
 * Lấy ngẫu nhiên 1 file ảnh từ folder avatar
 * @returns {string|null} Tên relative path file ảnh (ví dụ 'avatar/avatar_01.jpg') hoặc null
 */
function getRandomLocalAvatarFile() {
  const files = getLocalAvatarFiles();
  if (files.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * files.length);
  return files[randomIndex];
}

/**
 * Giữ hàm cũ tương thích ngược
 */
function getLocalAvatarFilename() {
  return getRandomLocalAvatarFile();
}

/**
 * Lấy URL ảnh đại diện của Bot (Mỗi lần gọi sẽ chọn RANDOM 1 tấm trong folder avatar)
 * Ưu tiên:
 * 1. File trong thư mục public/avatar/ (random 1 tấm)
 * 2. Biến môi trường BOT_AVATAR_URL (hỗ trợ nhiều link cách nhau bằng dấu phẩy)
 * 3. Fallback ảnh mặc định
 * 
 * @param {object} [req] - Optional request object từ webhook
 * @returns {string} - Public HTTPS URL của ảnh đại diện được chọn ngẫu nhiên
 */
function getBotAvatarUrl(req = null) {
  // 1. Quét và chọn ngẫu nhiên 1 ảnh trong folder public/avatar/
  const localFile = getRandomLocalAvatarFile();
  if (localFile) {
    // Xác định base domain
    let host = null;

    if (req && req.headers) {
      host = req.headers['x-forwarded-host'] || req.headers.host;
    }

    if (!host && process.env.PUBLIC_APP_URL) {
      return `${process.env.PUBLIC_APP_URL.replace(/\/+$/, '')}/${localFile}`;
    }

    if (!host && process.env.VERCEL_URL) {
      host = process.env.VERCEL_URL;
    }

    // Fallback domain Vercel mặc định của repo
    if (!host || host.includes('localhost') || host.includes('127.0.0.1')) {
      host = 'bot-chat-zalo-one.vercel.app';
    }

    const protocol = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
    return `${protocol}://${host}/${localFile}`;
  }

  // 2. Kiểm tra biến môi trường BOT_AVATAR_URL (hỗ trợ nhiều URL cách nhau bằng dấu phẩy)
  const envUrl = process.env.BOT_AVATAR_URL;
  if (envUrl && typeof envUrl === 'string') {
    const urls = envUrl.split(',').map(u => u.trim()).filter(u => u.startsWith('http'));
    if (urls.length > 0) {
      return urls[Math.floor(Math.random() * urls.length)];
    }
  }

  // 3. Fallback mặc định
  return DEFAULT_FALLBACK_AVATAR;
}

/**
 * Tạo lời nhắn (caption) dễ thương khi gửi ảnh cho người dùng
 * @param {string} senderName - Tên người hỏi
 * @returns {string}
 */
function getAvatarCaption(senderName = 'anh/chị') {
  const name = senderName && senderName !== 'Thành viên' ? senderName : 'anh/chị';
  const captions = [
    `Dạ đây là hình của em nè ${name} ơi! 🫧 Em là Bọt biển cute đó ạ 🥰 Nhìn em có đáng yêu không nè? ✨`,
    `Dạ dung nhan của em đây nè ${name}! 🌸 Em gửi tấm hình xịn nhất của em cho ${name} ngắm nè 🫧`,
    `Dạ hình của em nè ${name} ơi! ✨ Bọt biển cute xuất hiện rồi đây ạ 🥰`
  ];
  return captions[Math.floor(Math.random() * captions.length)];
}

module.exports = {
  isBotPhotoRequest,
  getBotAvatarUrl,
  getLocalAvatarFiles,
  getRandomLocalAvatarFile,
  getLocalAvatarFilename,
  getAvatarCaption,
  DEFAULT_FALLBACK_AVATAR
};
