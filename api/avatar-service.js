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

  // 1.5. Yêu cầu xem ảnh khác / ảnh nữa / tấm khác (Ví dụ: "cho a ảnh khác", "ảnh khác", "tấm khác đi", "ảnh nữa")
  const otherPhotoRegex = /(?:ảnh|hình|tấm|avatar|mặt|dung\s+nhan)\s+(?:khác|nữa|mới|tiếp)/i;
  const otherPhotoRegexNoTone = /(?:anh|hinh|tam|avatar|mat|dung\s+nhan)\s+(?:khac|nua|moi|tiep)/i;
  if (otherPhotoRegex.test(raw) || otherPhotoRegexNoTone.test(noTone)) {
    return true;
  }

  // Câu dạng ngắn gọn: "ảnh khác", "tấm khác", "hình khác"
  if (/^(?:ảnh|hình|tấm|avatar)\s+(?:khác|nữa|mới)(?:\s+(?:đi|nào|với|nha|nhé|coi|xem))?$/i.test(raw)) {
    return true;
  }
  if (/^(?:anh|hinh|tam|avatar)\s+(?:khac|nua|moi)(?:\s+(?:di|nao|voi|nha|nhe|coi|xem))?$/i.test(noTone)) {
    return true;
  }

  // Câu yêu cầu: "cho a ảnh...", "cho e xem...", "cho mình tấm ảnh..." (hỗ trợ viết tắt a, e, c, m)
  const pronounPatternWithTone = '(?:anh|chị|em|mình|tôi|tao|a|c|e|m)';
  const pronounPatternNoTone = '(?:anh|chi|em|minh|toi|tao|a|c|e|m)';
  const photoActionWithTone = '(?:cho|xin|gửi|show|coi|ngắm|xem|bật|chụp)';
  const photoActionNoTone = '(?:cho|xin|gui|show|coi|ngam|xem|bat|chup)';

  const requestWithPronoun = new RegExp(
    `^(?:${photoActionWithTone}\\s+)?${pronounPatternWithTone}\\s*(?:xem|coi|ngắm|xin)?\\s*(?:thêm\\s+)?(?:tấm|bức|kiểu|cái)?\\s*(?:ảnh|hình|avatar|tấm|mặt|dung\\s+nhan)`,
    'i'
  );
  if (requestWithPronoun.test(raw)) {
    return true;
  }

  const requestWithPronounNoTone = new RegExp(
    `^(?:${photoActionNoTone}\\s+)?${pronounPatternNoTone}\\s*(?:xem|coi|ngam|xin)?\\s*(?:them\\s+)?(?:tam|buc|kieu|cai)?\\s*(?:anh|hinh|avatar|tam|mat|dung\\s+nhan)`,
    'i'
  );
  if (requestWithPronounNoTone.test(noTone)) {
    return true;
  }

  // 2. Yêu cầu trực tiếp xem mặt / hình / ảnh / avatar / dung nhan
  // Ví dụ: "cho xem mặt", "cho anh xem ảnh", "cho mình xin tấm hình", "xem mặt bot", "gửi ảnh em"
  const requestVerbWithTone = '(?:cho\\s+(?:anh|chị|em|mình|tôi|tao|a|c|e|m)?\\s*(?:xem|coi|ngắm|xin)?|xem|coi|ngắm|xin|gửi|show|chụp|bật)';
  const requestVerbNoTone = '(?:cho\\s+(?:anh|chi|em|minh|toi|tao|a|c|e|m)?\\s*(?:xem|coi|ngam|xin)?|xem|coi|ngam|xin|gui|show|chup|bat)';
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

/**
 * Kiểm tra xem người dùng có phải đang xin đổi sang "ảnh khác" hay không
 * @param {string} text 
 * @returns {boolean}
 */
function isOtherPhotoRequest(text) {
  if (!text) return false;
  const raw = text.toLowerCase();
  const noTone = removeVietnameseTones(raw);
  return /(?:khác|nữa|mới|tiếp)/i.test(raw) || /(?:khac|nua|moi|tiep)/i.test(noTone);
}

// Các đuôi file ảnh được hỗ trợ
const SUPPORTED_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

// Danh sách ảnh mặc định đã được commit vào repository (đảm bảo luôn có kể cả trên Serverless CDN)
const DEFAULT_AVATAR_LIST = [
  'avatar/avatar_01.jpg',
  'avatar/avatar_02.jpg',
  'avatar/avatar_03.jpg',
  'avatar/avatar_04.jpg',
  'avatar/avatar_05.jpg',
  'avatar/avatar_06.jpg'
];

/**
 * Quét và lấy tất cả các file ảnh trong folder public/avatar/
 * Kết hợp quét filesystem động và danh sách DEFAULT_AVATAR_LIST
 * @returns {string[]} Danh sách relative path ví dụ: ['avatar/avatar_01.jpg', ...]
 */
function getLocalAvatarFiles() {
  const publicDir = path.join(__dirname, '../public');
  const avatarDir = path.join(publicDir, 'avatar');
  const resultsSet = new Set(DEFAULT_AVATAR_LIST);

  // Quét thư mục public/avatar/ trên ổ đĩa
  try {
    if (fs.existsSync(avatarDir)) {
      const items = fs.readdirSync(avatarDir);
      for (const item of items) {
        if (item.startsWith('.')) continue;
        const ext = path.extname(item).toLowerCase();
        if (SUPPORTED_IMAGE_EXTS.includes(ext)) {
          resultsSet.add(`avatar/${item}`);
        }
      }
    }
  } catch (err) {
    console.warn('Lỗi khi quét thư mục public/avatar/:', err.message);
  }

  return Array.from(resultsSet);
}

// Lưu vết ảnh vừa gửi gần nhất để lần sau chọn KHÔNG BỊ TRÙNG LẶP
let lastSentAvatar = null;

/**
 * Lấy ngẫu nhiên 1 file ảnh từ folder avatar (TRÁNH TRÙNG LẶP LIÊN TIẾP)
 * @returns {string|null} Tên relative path file ảnh (ví dụ 'avatar/avatar_03.jpg')
 */
function getRandomLocalAvatarFile() {
  const files = getLocalAvatarFiles();
  if (files.length === 0) return null;
  if (files.length === 1) return files[0];

  // Loại trừ ảnh vừa gửi gần nhất để đảm bảo mỗi lần gửi một ảnh khác nhau
  const candidates = lastSentAvatar
    ? files.filter(f => f !== lastSentAvatar)
    : files;

  const listToPick = candidates.length > 0 ? candidates : files;
  const randomIndex = Math.floor(Math.random() * listToPick.length);
  const chosen = listToPick[randomIndex];
  lastSentAvatar = chosen;
  return chosen;
}

/**
 * Giữ hàm cũ tương thích ngược
 */
function getLocalAvatarFilename() {
  return getRandomLocalAvatarFile();
}

/**
 * Lấy URL ảnh đại diện của Bot (Mỗi lần gọi sẽ chọn RANDOM 1 tấm trong folder avatar và KHÔNG TRÙNG tấm cũ)
 * @param {object} [req] - Optional request object từ webhook
 * @returns {string} - Public HTTPS URL của ảnh đại diện được chọn ngẫu nhiên
 */
function getBotAvatarUrl(req = null) {
  // 1. Quét và chọn ngẫu nhiên 1 ảnh trong folder public/avatar/
  const localFile = getRandomLocalAvatarFile();
  if (localFile) {
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
      const candidates = lastSentAvatar && urls.length > 1
        ? urls.filter(u => u !== lastSentAvatar)
        : urls;
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      lastSentAvatar = chosen;
      return chosen;
    }
  }

  // 3. Fallback mặc định
  return DEFAULT_FALLBACK_AVATAR;
}

/**
 * Tạo lời nhắn (caption) dễ thương khi gửi ảnh cho người dùng
 * @param {string} senderName - Tên người hỏi
 * @param {boolean} [isOther=false] - Người dùng xin ảnh khác hay không
 * @returns {string}
 */
function getAvatarCaption(senderName = 'anh/chị', isOther = false) {
  const name = senderName && senderName !== 'Thành viên' ? senderName : 'anh/chị';

  if (isOther) {
    const otherCaptions = [
      `Dạ đây là góc khác của em nè ${name} ơi! 🫧 Em đổi tấm khác cho ${name} ngắm nè 🥰 Xinh không ạ? ✨`,
      `Dạ tấm ảnh khác của em đây nè ${name}! 🌸 Bọt biển cute có nhiều ảnh lắm nè hihi 🫧`,
      `Dạ em đổi ảnh mới cho ${name} liền nè! ✨ Tấm này nhìn em có đáng yêu không nè? 🥰`,
      `Dạ hình khác của em đây nè ${name} ơi! 🫧 Mỗi lần ${name} hỏi là em lại biến hình đó nha 🌸`
    ];
    return otherCaptions[Math.floor(Math.random() * otherCaptions.length)];
  }

  const captions = [
    `Dạ đây là hình của em nè ${name} ơi! 🫧 Em là Bọt biển cute đó ạ 🥰 Nhìn em có đáng yêu không nè? ✨`,
    `Dạ dung nhan của em đây nè ${name}! 🌸 Em gửi tấm hình xịn nhất của em cho ${name} ngắm nè 🫧`,
    `Dạ hình của em nè ${name} ơi! ✨ Bọt biển cute xuất hiện rồi đây ạ 🥰`
  ];
  return captions[Math.floor(Math.random() * captions.length)];
}

module.exports = {
  isBotPhotoRequest,
  isOtherPhotoRequest,
  getBotAvatarUrl,
  getLocalAvatarFiles,
  getRandomLocalAvatarFile,
  getLocalAvatarFilename,
  getAvatarCaption,
  DEFAULT_FALLBACK_AVATAR
};
