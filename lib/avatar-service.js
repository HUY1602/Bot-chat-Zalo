/**
 * Avatar & Photo Service for Zalo Bot
 * Handles detection of photo/avatar requests and resolves avatar image URLs.
 * Supports:
 * 1. Google Drive direct links (automatically converts view/sharing links to high-speed CDN URLs)
 * 2. Google Drive Folder (via Google Drive API Key or Apps Script Web App)
 * 3. Any public cloud image URLs (Imgur, Cloudinary, Catbox, etc.)
 * 4. Local files in public/avatar/ as fallback
 */

const fs = require('fs');
const path = require('path');

// Fallback avatar mặc định nếu chưa cấu hình ảnh riêng (Bọt biển cute anime)
const DEFAULT_FALLBACK_AVATAR = 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80';

// Các đuôi file ảnh được hỗ trợ
const SUPPORTED_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

// Danh sách ảnh mặc định cục bộ trong repo
const DEFAULT_AVATAR_LIST = [
  'avatar/avatar_01.jpg',
  'avatar/avatar_02.jpg',
  'avatar/avatar_03.jpg',
  'avatar/avatar_04.jpg',
  'avatar/avatar_05.jpg',
  'avatar/avatar_06.jpg'
];

// Lưu vết ảnh vừa gửi gần nhất để lần sau chọn KHÔNG BỊ TRÙNG LẶP LIÊN TIẾP
let lastSentAvatar = null;

// Cache lưu danh sách ảnh lấy từ Google Drive Folder (TTL: 1 giờ) theo Folder ID hoặc URL
const folderCacheMap = new Map();

/**
 * Trích xuất Google Drive File ID từ bất kỳ định dạng link chia sẻ nào
 * @param {string} url 
 * @returns {string|null}
 */
function extractGoogleDriveFileId(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();

  // Dạng /file/d/FILE_ID/view...
  const matchFile = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (matchFile) return matchFile[1];

  // Dạng ?id=FILE_ID hoặc &id=FILE_ID
  const matchId = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchId) return matchId[1];

  // Dạng drive.google.com/open?id=FILE_ID
  const matchOpen = trimmed.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (matchOpen) return matchOpen[1];

  // Dạng lh3.googleusercontent.com/d/FILE_ID
  const matchLh3 = trimmed.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
  if (matchLh3) return matchLh3[1];

  // Dạng chuỗi ID trần (25 ký tự trở lên, không chứa ký tự gạch chéo)
  if (trimmed.length >= 25 && !trimmed.includes('/') && !trimmed.includes('.')) {
    return trimmed;
  }

  return null;
}

/**
 * Trích xuất Google Drive Folder ID từ link thư mục
 * Hỗ trợ các định dạng:
 * - https://drive.google.com/drive/folders/FOLDER_ID
 * - https://drive.google.com/drive/u/0/folders/FOLDER_ID
 * - https://drive.google.com/embeddedfolderview?id=FOLDER_ID
 * - https://drive.google.com/folderview?id=FOLDER_ID
 * @param {string} url 
 * @returns {string|null}
 */
function extractGoogleDriveFolderId(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();

  // Dạng /drive/folders/FOLDER_ID hoặc /folders/FOLDER_ID
  const matchFolder = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (matchFolder) return matchFolder[1];

  // Dạng embeddedfolderview?id=FOLDER_ID hoặc folderview?id=FOLDER_ID hoặc ?id=FOLDER_ID
  const matchId = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchId && (trimmed.includes('folder') || trimmed.includes('embedded'))) return matchId[1];

  return null;
}

/**
 * Chuyển đổi link Google Drive sang link ảnh trực tiếp (Google UserContent CDN)
 * Link dạng: https://lh3.googleusercontent.com/d/{FILE_ID}
 * Đây là link ảnh nhị phân trực tiếp, không bị chuyển hướng sang trang web HTML xem trước
 * @param {string} url 
 * @returns {string}
 */
function convertGoogleDriveUrl(url) {
  if (!url || typeof url !== 'string') return url;
  const trimmed = url.trim();

  // Nếu là Google Drive file
  const driveId = extractGoogleDriveFileId(trimmed);
  if (driveId && !trimmed.includes('/folders/')) {
    return `https://lh3.googleusercontent.com/d/${driveId}`;
  }

  return trimmed;
}

/**
 * Quét danh sách tất cả file ảnh từ Google Drive Folder công khai
 * KHÔNG CẦN GOOGLE CLOUD API KEY, KHÔNG CẦN OAUTH, KHÔNG CẦN APPS SCRIPT!
 * Người dùng chỉ cần chia sẻ thư mục Drive với quyền: "Bất kỳ ai có đường liên kết đều có thể xem" (Anyone with the link can view)
 * 
 * @param {string} folderIdOrUrl - Folder ID hoặc URL thư mục Google Drive
 * @param {number} [depth=1] - Hỗ trợ quét thư mục con tối đa 1 cấp nếu thư mục chính chỉ chứa thư mục con
 * @returns {Promise<string[]>} Danh sách link CDN ảnh trực tiếp (https://lh3.googleusercontent.com/d/{FILE_ID})
 */
async function fetchPublicGoogleDriveFolderFiles(folderIdOrUrl, depth = 1) {
  if (!folderIdOrUrl || typeof folderIdOrUrl !== 'string') return [];
  const cleanId = extractGoogleDriveFolderId(folderIdOrUrl) || (
    folderIdOrUrl.length >= 25 && !folderIdOrUrl.includes('/') && !folderIdOrUrl.includes('.')
      ? folderIdOrUrl.trim()
      : null
  );
  if (!cleanId) return [];

  const now = Date.now();
  const cached = folderCacheMap.get(cleanId);
  if (cached && cached.expiresAt > now && cached.urls.length > 0) {
    return cached.urls;
  }

  const endpoint = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(cleanId)}`;
  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8'
      }
    });

    if (!res.ok) {
      console.warn(`[Google Drive Folder HTTP ${res.status}] Không thể truy cập thư mục ${cleanId}. Đảm bảo thư mục đã bật "Bất kỳ ai có đường liên kết đều có thể xem".`);
      return [];
    }

    const html = await res.text();
    const parts = html.split('<div class="flip-entry"');
    const imageUrls = [];
    const subfolderIds = [];

    const nonImageExts = ['.mov', '.mp4', '.avi', '.mkv', '.webm', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.zip', '.rar', '.7z', '.mp3', '.wav', '.flac'];

    for (let i = 1; i < parts.length; i++) {
      const chunk = parts[i];
      const idMatch = chunk.match(/id="entry-([a-zA-Z0-9_-]+)"/);
      if (!idMatch) continue;
      const fileId = idMatch[1];

      const isSubfolder = chunk.includes('drive.google.com/drive/folders/') || chunk.includes('aria-label="Folder"');
      const titleMatch = chunk.match(/class="flip-entry-title">([^<]+)<\/div>/);
      const title = titleMatch ? titleMatch[1].trim() : '';

      if (isSubfolder) {
        subfolderIds.push(fileId);
        continue;
      }

      // Kiểm tra xem có phải file ảnh không
      const lowerTitle = title.toLowerCase();
      const hasImageExt = SUPPORTED_IMAGE_EXTS.some(ext => lowerTitle.endsWith(ext));
      const hasNonImageExt = nonImageExts.some(ext => lowerTitle.endsWith(ext));

      if (hasImageExt || (!hasNonImageExt && lowerTitle.length > 0)) {
        imageUrls.push(`https://lh3.googleusercontent.com/d/${fileId}`);
      }
    }

    // Nếu trong thư mục chính không có ảnh trực tiếp nhưng có thư mục con, quét tiếp thư mục con
    if (imageUrls.length === 0 && subfolderIds.length > 0 && depth > 0) {
      const limitedSubfolders = subfolderIds.slice(0, 3);
      for (const subId of limitedSubfolders) {
        const subImages = await fetchPublicGoogleDriveFolderFiles(subId, depth - 1);
        imageUrls.push(...subImages);
      }
    }

    if (imageUrls.length > 0) {
      folderCacheMap.set(cleanId, {
        urls: imageUrls,
        expiresAt: now + (60 * 60 * 1000) // Cache 1 giờ
      });
      console.log(`[Google Drive Folder] Tự động nạp thành công ${imageUrls.length} ảnh từ thư mục Drive: ${cleanId}`);
    } else {
      console.warn(`[Google Drive Folder] Thư mục ${cleanId} không tìm thấy ảnh hợp lệ hoặc thư mục đang rỗng.`);
    }

    return imageUrls;
  } catch (err) {
    console.error(`[Google Drive Folder] Lỗi khi nạp ảnh từ thư mục ${cleanId}:`, err.message);
    return [];
  }
}

/**
 * Gọi Google Drive API v3 để lấy danh sách tất cả file ảnh trong 1 Folder (dùng khi có Google Cloud API Key)
 * @param {string} folderId 
 * @param {string} apiKey 
 * @returns {Promise<string[]>}
 */
async function fetchGoogleDriveFolderFiles(folderId, apiKey) {
  if (!folderId || !apiKey) return [];

  const now = Date.now();
  const cached = folderCacheMap.get(folderId);
  if (cached && cached.expiresAt > now && cached.urls.length > 0) {
    return cached.urls;
  }

  try {
    const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const endpoint = `https://www.googleapis.com/drive/v3/files?q=${query}&key=${apiKey}&fields=files(id,name,mimeType)&pageSize=100`;
    
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!res.ok) {
      console.warn(`[Google Drive API HTTP ${res.status}]: ${await res.text()}`);
      return [];
    }

    const data = await res.json();
    const files = data.files || [];

    // Lọc các file ảnh (mimeType starts with 'image/' hoặc đuôi file ảnh)
    const imageUrls = files
      .filter(f => (f.mimeType && f.mimeType.startsWith('image/')) || (f.name && SUPPORTED_IMAGE_EXTS.some(ext => f.name.toLowerCase().endsWith(ext))))
      .map(f => `https://lh3.googleusercontent.com/d/${f.id}`);

    if (imageUrls.length > 0) {
      folderCacheMap.set(folderId, {
        urls: imageUrls,
        expiresAt: now + (60 * 60 * 1000) // Cache 1 giờ
      });
      console.log(`[Google Drive API] Đã nạp thành công ${imageUrls.length} ảnh từ thư mục Drive ${folderId}`);
    }

    return imageUrls;
  } catch (err) {
    console.error('Lỗi khi fetch danh sách ảnh từ Google Drive Folder API:', err.message);
    return [];
  }
}

/**
 * Fetch danh sách file ảnh từ Google Apps Script Web App (Không cần Google Cloud API Key)
 * @param {string} webAppUrl 
 * @returns {Promise<string[]>}
 */
async function fetchGoogleDriveWebAppFiles(webAppUrl) {
  if (!webAppUrl || !webAppUrl.startsWith('http')) return [];

  const now = Date.now();
  const cached = folderCacheMap.get(webAppUrl);
  if (cached && cached.expiresAt > now && cached.urls.length > 0) {
    return cached.urls;
  }

  try {
    const res = await fetch(webAppUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!res.ok) return [];
    const data = await res.json();

    let list = [];
    if (Array.isArray(data)) {
      list = data;
    } else if (data.files && Array.isArray(data.files)) {
      list = data.files;
    } else if (data.ids && Array.isArray(data.ids)) {
      list = data.ids;
    }

    const urls = list
      .map(item => {
        if (typeof item === 'string') return convertGoogleDriveUrl(item);
        if (item && item.id) return `https://lh3.googleusercontent.com/d/${item.id}`;
        return null;
      })
      .filter(Boolean);

    if (urls.length > 0) {
      folderCacheMap.set(webAppUrl, {
        urls,
        expiresAt: now + (60 * 60 * 1000)
      });
      console.log(`[Google Apps Script] Đã nạp ${urls.length} ảnh từ Drive Web App`);
    }

    return urls;
  } catch (err) {
    console.warn('Lỗi khi fetch ảnh từ Google Apps Script Web App:', err.message);
    return [];
  }
}

/**
 * Lấy danh sách các URL ảnh online đã cấu hình (Google Drive Folder, Google Drive file, Cloud URLs, v.v.)
 * @returns {Promise<string[]>}
 */
async function getRemoteAvatarUrls() {
  const resultUrls = [];

  // 1. Kiểm tra Google Apps Script Web App (nếu có cấu hình)
  const webAppUrl = process.env.GOOGLE_DRIVE_FOLDER_WEBAPP_URL || process.env.GOOGLE_DRIVE_WEBAPP_URL;
  if (webAppUrl) {
    const webAppFiles = await fetchGoogleDriveWebAppFiles(webAppUrl);
    if (webAppFiles.length > 0) {
      resultUrls.push(...webAppFiles);
    }
  }

  // 2. Kiểm tra Google Drive Folder ID / URL từ biến riêng GOOGLE_DRIVE_FOLDER_URL hoặc GOOGLE_DRIVE_FOLDER_ID
  const folderConfig = process.env.GOOGLE_DRIVE_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_URL;
  if (folderConfig) {
    const folderId = extractGoogleDriveFolderId(folderConfig) || (
      folderConfig.length >= 25 && !folderConfig.includes('/') ? folderConfig.trim() : null
    );
    if (folderId) {
      // Ưu tiên quét public folder tự động (không cần API key)
      let folderFiles = await fetchPublicGoogleDriveFolderFiles(folderId);
      // Fallback API v3 nếu có cung cấp API key
      const driveApiKey = process.env.GOOGLE_DRIVE_API_KEY || process.env.GOOGLE_API_KEY;
      if (folderFiles.length === 0 && driveApiKey) {
        folderFiles = await fetchGoogleDriveFolderFiles(folderId, driveApiKey);
      }
      if (folderFiles.length > 0) {
        resultUrls.push(...folderFiles);
      }
    }
  }

  // 3. Kiểm tra biến môi trường BOT_AVATAR_URL (có thể là link 1 folder, nhiều folder, hoặc danh sách file)
  const envUrl = process.env.BOT_AVATAR_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    const rawTokens = envUrl
      .split(/[\n,;]/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const token of rawTokens) {
      // Nếu là link Google Drive Folder -> Tự động nạp toàn bộ ảnh trong folder đó!
      const possibleFolderId = extractGoogleDriveFolderId(token);
      if (possibleFolderId) {
        let folderFiles = await fetchPublicGoogleDriveFolderFiles(possibleFolderId);
        const driveApiKey = process.env.GOOGLE_DRIVE_API_KEY || process.env.GOOGLE_API_KEY;
        if (folderFiles.length === 0 && driveApiKey) {
          folderFiles = await fetchGoogleDriveFolderFiles(possibleFolderId, driveApiKey);
        }
        if (folderFiles.length > 0) {
          resultUrls.push(...folderFiles);
          continue;
        }
      }

      // Nếu là link file đơn lẻ hoặc link ảnh trực tiếp
      const converted = convertGoogleDriveUrl(token);
      if (converted && converted.startsWith('http')) {
        resultUrls.push(converted);
      }
    }
  }

  // Loại bỏ các URL trùng lặp
  return Array.from(new Set(resultUrls));
}

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

  // Câu yêu cầu: "cho a ảnh...", "cho e xem...", "cho mình tấm ảnh..."
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
  const requestVerbWithTone = '(?:cho\\s+(?:anh|chị|em|mình|tôi|tao|a|c|e|m)?\\s*(?:xem|coi|ngắm|xin)?|xem|coi|ngắm|xin|gửi|show|chụp|bật)';
  const requestVerbNoTone = '(?:cho\\s+(?:anh|chi|em|minh|toi|tao|a|c|e|m)?\\s*(?:xem|coi|ngam|xin)?|xem|coi|ngam|xin|gui|show|chup|bat)';
  const photoSubjectWithTone = '(?:mặt|hình|ảnh|ảnh đại diện|hình đại diện|avatar|dung nhan|nhan sắc|chân dung|selfie|khuôn mặt|diện mạo)';
  const photoSubjectNoTone = '(?:mat|hinh|anh|anh dai dien|hinh dai dien|avatar|dung nhan|nhan sac|chan dung|selfie|khuon mat|dien mao)';

  const directRequestPattern = new RegExp(
    `${requestVerbWithTone}\\s+(?:tấm|bức|kiểu|cái)?\\s*${photoSubjectWithTone}`,
    'i'
  );
  if (directRequestPattern.test(raw)) {
    return true;
  }

  const directRequestPatternNoTone = new RegExp(
    `${requestVerbNoTone}\\s+(?:tam|buc|kieu|cai)?\\s*${photoSubjectNoTone}`,
    'i'
  );
  if (directRequestPatternNoTone.test(noTone)) {
    return true;
  }

  // 3. Cụm từ sở hữu: "mặt bot", "hình bot", "ảnh bot", "ảnh của em", "mặt em", "dung nhan em", "avatar của bạn"
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
  const appearancePattern = /(?:trông|nhìn|ngoại hình|mặt mũi)\s+(?:bot|em|bạn|bé)?\s*(?:như\s+)?(?:thế nào|ra sao|sao|đẹp không|dễ thương không)/i;
  if (appearancePattern.test(raw)) {
    return true;
  }

  const appearancePatternNoTone = /(?:trong|nhin|ngoai hinh|mat mui)\s+(?:bot|em|ban|be)?\s*(?:nhu\s+)?(?:the nao|ra sao|sao|dep khong|de thuong khong)/i;
  if (appearancePatternNoTone.test(noTone)) {
    return true;
  }

  // 5. Câu cụt / câu lệnh ngắn gọn
  const wherePattern = new RegExp(
    `^(?:mặt|hình|ảnh|ảnh đại diện|hình đại diện|avatar|dung nhan)\\s+(?:bot|em|bạn)?\\s*(?:đâu|nào|đâu rồi|xem nào)\\??$`,
    'i'
  );
  if (wherePattern.test(raw)) {
    return true;
  }

  if (/^(?:xem|coi|ngắm)\s+(?:mặt|ảnh|hình|ảnh đại diện|hình đại diện|avatar|dung nhan)$/i.test(raw)) {
    return true;
  }
  if (/^(?:xem|coi|ngam)\s+(?:mat|anh|hinh|anh dai dien|hinh dai dien|avatar|dung nhan)$/i.test(noTone)) {
    return true;
  }

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

/**
 * Quét các file ảnh cục bộ trong public/avatar/
 * @returns {string[]}
 */
function getLocalAvatarFiles() {
  const publicDir = path.join(__dirname, '../public');
  const avatarDir = path.join(publicDir, 'avatar');
  const resultsSet = new Set(DEFAULT_AVATAR_LIST);

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

/**
 * Lấy ngẫu nhiên 1 file ảnh từ folder avatar cục bộ
 * @returns {string|null}
 */
function getRandomLocalAvatarFile() {
  const files = getLocalAvatarFiles();
  if (files.length === 0) return null;
  if (files.length === 1) return files[0];

  const candidates = lastSentAvatar
    ? files.filter(f => f !== lastSentAvatar)
    : files;

  const listToPick = candidates.length > 0 ? candidates : files;
  const randomIndex = Math.floor(Math.random() * listToPick.length);
  const chosen = listToPick[randomIndex];
  lastSentAvatar = chosen;
  return chosen;
}

function getLocalAvatarFilename() {
  return getRandomLocalAvatarFile();
}

/**
 * Lấy URL ảnh đại diện của Bot:
 * THỨ TỰ ƯU TIÊN:
 * 1. Google Drive / Remote Online URLs (nếu có cấu hình BOT_AVATAR_URL hoặc Google Drive Folder)
 * 2. File cục bộ trong public/avatar/ (chỉ khi không cấu hình online nào)
 * 3. Default fallback avatar
 * 
 * @param {object} [req] - Optional request object từ webhook
 * @returns {Promise<string>} - Public HTTPS URL của ảnh đại diện được chọn
 */
async function getBotAvatarUrl(req = null) {
  // 1. ƯU TIÊN SỐ 1: Lấy từ Google Drive hoặc Cloud URLs đã cấu hình
  try {
    const remoteUrls = await getRemoteAvatarUrls();
    if (remoteUrls.length > 0) {
      const candidates = lastSentAvatar && remoteUrls.length > 1
        ? remoteUrls.filter(u => u !== lastSentAvatar)
        : remoteUrls;
      const listToPick = candidates.length > 0 ? candidates : remoteUrls;
      const chosen = listToPick[Math.floor(Math.random() * listToPick.length)];
      lastSentAvatar = chosen;
      console.log(`[Avatar Selected (Remote / Google Drive)]: ${chosen} (tổng ${remoteUrls.length} ảnh)`);
      return chosen;
    }
  } catch (err) {
    console.warn('Lỗi khi lấy ảnh remote avatar:', err.message);
  }

  // 2. ƯU TIÊN SỐ 2: Fallback về ảnh cục bộ trong public/avatar/
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

    if (!host || host.includes('localhost') || host.includes('127.0.0.1')) {
      host = 'bot-chat-zalo-one.vercel.app';
    }

    const protocol = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
    return `${protocol}://${host}/${localFile}`;
  }

  // 3. Fallback mặc định
  return DEFAULT_FALLBACK_AVATAR;
}

/**
 * Lấy thông tin chi tiết về các nguồn avatar hiện có (dùng cho Web Dashboard / Debug)
 * @param {object} [req]
 * @returns {Promise<object>}
 */
async function getAvatarSourceDetails(req = null) {
  const remoteUrls = await getRemoteAvatarUrls();
  const localFiles = getLocalAvatarFiles();
  const activeUrl = await getBotAvatarUrl(req);

  let sourceProvider = 'Default';
  if (remoteUrls.length > 0) {
    const hasDrive = remoteUrls.some(u => u.includes('googleusercontent.com') || u.includes('drive.google'));
    sourceProvider = hasDrive ? 'Google Drive' : 'Cloud URLs';
  } else if (localFiles.length > 0) {
    sourceProvider = 'Local Files';
  }

  return {
    sourceProvider,
    totalAvatars: remoteUrls.length > 0 ? remoteUrls.length : localFiles.length,
    isRemote: remoteUrls.length > 0,
    remoteCount: remoteUrls.length,
    remoteUrls,
    localCount: localFiles.length,
    localFiles,
    currentSampleUrl: activeUrl
  };
}

/**
 * Tạo lời nhắn (caption) dễ thương khi gửi ảnh cho người dùng
 * @param {string} senderName - Tên người hỏi
 * @param {boolean} [isOther=false] - Người dùng xin ảnh khác hay không
 * @returns {string}
 */
function getAvatarCaption(senderName = 'anh', isOther = false) {
  const name = senderName && senderName !== 'Thành viên' ? senderName : 'anh';

  if (isOther) {
    const otherCaptions = [
      `Dạ đây là góc khác của em nè ${name} ơi! 🫧 Em đổi tấm khác cho ${name} ngắm nè 🥰 Xinh không ạ? ✨`,
      `Dạ tấm ảnh khác của em đây nè ${name}! ✨ Bọt biển cute có nhiều ảnh lắm nè hihi 🫧`,
      `Dạ em đổi ảnh mới cho ${name} liền nè! ✨ Tấm này nhìn em có đáng yêu không nè? 🥰`,
      `Dạ hình khác của em đây nè ${name} ơi! 🫧 Mỗi lần ${name} hỏi là em lại biến hình đó nha 🥰`
    ];
    return otherCaptions[Math.floor(Math.random() * otherCaptions.length)];
  }

  const captions = [
    `Dạ đây là hình của em nè ${name} ơi! 🫧 Em là Bọt biển cute đó ạ 🥰 Nhìn em có đáng yêu không nè? ✨`,
    `Dạ dung nhan của em đây nè ${name}! ✨ Em gửi tấm hình xịn nhất của em cho ${name} ngắm nè 🫧`,
    `Dạ hình của em nè ${name} ơi! ✨ Bọt biển cute xuất hiện rồi đây ạ 🥰`
  ];
  return captions[Math.floor(Math.random() * captions.length)];
}

module.exports = {
  isBotPhotoRequest,
  isOtherPhotoRequest,
  getBotAvatarUrl,
  getAvatarSourceDetails,
  getRemoteAvatarUrls,
  convertGoogleDriveUrl,
  extractGoogleDriveFileId,
  extractGoogleDriveFolderId,
  getLocalAvatarFiles,
  getRandomLocalAvatarFile,
  getLocalAvatarFilename,
  getAvatarCaption,
  fetchPublicGoogleDriveFolderFiles,
  DEFAULT_FALLBACK_AVATAR
};
