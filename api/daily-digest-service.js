/**
 * Daily Digest Service for Zalo Bot
 * Handles Morning Greeting, Weather Forecast, Inspirational Quotes,
 * and Today's Group Reminders at 7:30 AM every day.
 */

const botService = require('./bot-service');
const weatherService = require('./weather-service');
const reminderService = require('./reminder-service');
const memoryService = require('./memory-service');

// Upstash REST helper
async function upstashCommand(command) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(command)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.result;
  } catch (err) {
    return null;
  }
}

// In-memory fallback
const inMemorySubscribers = new Set();
const inMemorySentDates = new Map();

/**
 * Danh sách câu chúc và danh ngôn truyền cảm hứng buổi sáng
 */
const MORNING_QUOTES = [
  'Mỗi buổi sáng là một cơ hội mới để bạn làm những điều tuyệt vời hơn hôm qua.',
  'Nụ cười là chiếc chìa khóa mở ra cánh cửa may mắn của một ngày mới!',
  'Hãy bắt đầu ngày mới với lòng biết ơn và một tinh thần tràn đầy năng lượng tích cực.',
  'Thành công bắt đầu từ những thói quen nhỏ và sự kiên trì mỗi ngày.',
  'Dù hôm qua có thế nào, hôm nay vẫn là một trang giấy mới toanh để bạn viết tiếp ước mơ.',
  'Chúc mọi người một ngày làm việc thật thảnh thơi, hiệu quả cao và ngập tràn niềm vui!',
  'Năng lượng tích cực sẽ thu hút những điều may mắn. Hãy tự tin tỏa sáng nha!'
];

/**
 * Lấy các phần ngày/giờ hiện tại theo múi giờ Việt Nam (GMT+7)
 */
function getVietnamDateTimeParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    weekday: 'short',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;

  const weekdayMap = {
    'Sun': 'Chủ Nhật',
    'Mon': 'Thứ Hai',
    'Tue': 'Thứ Ba',
    'Wed': 'Thứ Tư',
    'Thu': 'Thứ Năm',
    'Fri': 'Thứ Sáu',
    'Sat': 'Thứ Bảy'
  };

  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour: parseInt(map.hour, 10),
    minute: parseInt(map.minute, 10),
    second: parseInt(map.second, 10) || 0,
    weekdayName: weekdayMap[map.weekday] || 'Hôm nay',
    dateKey: `${map.year}-${String(map.month).padStart(2, '0')}-${String(map.day).padStart(2, '0')}`
  };
}

/**
 * Đăng ký một chatId nhận điểm tin buổi sáng
 * @param {string} chatId 
 */
async function registerChatForDigest(chatId) {
  if (!chatId) return;
  inMemorySubscribers.add(String(chatId));

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    await upstashCommand(['SADD', 'zalo:digest:subscribers', String(chatId)]);
  }
}

/**
 * Hủy đăng ký nhận điểm tin buổi sáng cho chatId
 * @param {string} chatId 
 */
async function unregisterChatForDigest(chatId) {
  if (!chatId) return;
  inMemorySubscribers.delete(String(chatId));

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    await upstashCommand(['SREM', 'zalo:digest:subscribers', String(chatId)]);
  }
}

/**
 * Lấy danh sách tất cả các chatId đã đăng ký hoặc từng tương tác với bot
 * @returns {Promise<string[]>}
 */
async function getTargetChatIds() {
  const setOfChats = new Set();

  // 1. Lấy từ danh sách subscribers chuyên biệt
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const subs = await upstashCommand(['SMEMBERS', 'zalo:digest:subscribers']);
    if (Array.isArray(subs)) {
      subs.forEach(id => setOfChats.add(String(id)));
    }
  }

  // 2. Nếu chưa có ai đăng ký riêng, lấy từ các nhóm/chat đã từng trò chuyện
  if (setOfChats.size === 0) {
    try {
      const allChats = await memoryService.getAllChats();
      allChats.forEach(c => {
        if (c.chatId) setOfChats.add(String(c.chatId));
      });
    } catch (e) {}
  }

  // 3. Kết hợp in-memory
  inMemorySubscribers.forEach(id => setOfChats.add(String(id)));

  return Array.from(setOfChats);
}

/**
 * Soạn nội dung thông báo Điểm Tin Buổi Sáng & Thời Tiết
 * @param {string} chatId 
 * @param {object} dtParts 
 * @returns {Promise<string>}
 */
async function composeMorningDigestMessage(chatId, dtParts) {
  const { day, month, year, weekdayName } = dtParts;
  const dateFormatted = `${weekdayName}, ngày ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;

  // 1. Lấy thông tin thời tiết (TP.HCM và Hà Nội làm chuẩn)
  const defaultCity = process.env.DEFAULT_WEATHER_CITY || 'hcm';
  const weather = await weatherService.getWeatherToday(defaultCity);
  const advice = weatherService.getWeatherAdvice(weather);

  // 2. Lấy danh sách các việc cần nhắc hôm nay trong nhóm (nếu có)
  let todayTasksText = '';
  try {
    const reminders = await reminderService.listReminders(chatId);
    if (reminders && reminders.length > 0) {
      // Lọc ra các nhắc việc diễn ra trong ngày hôm nay
      const todayReminders = reminders.filter(r => {
        const rDate = new Date(r.scheduledTime);
        const rParts = getVietnamDateTimeParts(rDate);
        return rParts.day === day && rParts.month === month && rParts.year === year;
      });

      if (todayReminders.length > 0) {
        const taskLines = todayReminders.map((r, idx) => {
          return `   ${idx + 1}. 🕒 **${r.timeFormatted}**: ${r.task} (nhắc: ${r.targetName})`;
        }).join('\n');
        todayTasksText = `\n\n📌 **LỊCH NHẮC TRONG NGÀY CỦA NHÓM:**\n${taskLines}`;
      }
    }
  } catch (err) {}

  // 3. Chọn ngẫu nhiên 1 câu quote truyền cảm hứng
  const quote = MORNING_QUOTES[Math.floor(Math.random() * MORNING_QUOTES.length)];

  // 4. Lắp ráp bản tin hoàn chỉnh theo phong cách Bọt biển cute
  let weatherSection = '';
  if (weather) {
    weatherSection = `🌤️ **DỰ BÁO THỜI TIẾT HÔM NAY (${weather.cityName.toUpperCase()}):**
• Trạng thái: ${weather.emoji} ${weather.description}
• Nhiệt độ: ${weather.tempCurrent}°C (Cao nhất: ${weather.tempMax}°C • Thấp nhất: ${weather.tempMin}°C)
• Xác suất mưa: ${weather.rainProb}% | Gió: ${weather.windSpeed} km/h
💡 ${advice}`;
  } else {
    weatherSection = `🌤️ **DỰ BÁO THỜI TIẾT HÔM NAY:**
• Thời tiết ôn hòa, trời mát mẻ thích hợp ra ngoài.
💡 Chúc anh chị một ngày làm việc và học tập tràn đầy năng lượng!`;
  }

  const message = `🫧 **CHÀO BUỔI SÁNG CẢ NHÀ MÌNH ƠI!** ✨☀️

📅 ${dateFormatted}

${weatherSection}${todayTasksText}

💌 **Thông điệp ngày mới:**
"${quote}"

Bọt biển chúc mọi người một ngày mới ngập tràn niềm vui, công việc suôn sẻ và gặp thật nhiều may mắn nha! 🥰🫧`;

  return message;
}

/**
 * Kiểm tra xem ngày hôm nay đã gửi điểm tin buổi sáng cho chatId này chưa
 * @param {string} chatId 
 * @param {string} dateKey - Ví dụ "2026-11-09"
 * @returns {Promise<boolean>}
 */
async function hasSentToday(chatId, dateKey) {
  // 1. Redis
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const key = `zalo:digest:sent:${dateKey}:${chatId}`;
    const sent = await upstashCommand(['GET', key]);
    if (sent) return true;
  }

  // 2. In-memory
  const memKey = `${dateKey}:${chatId}`;
  return Boolean(inMemorySentDates.get(memKey));
}

/**
 * Đánh dấu đã gửi điểm tin thành công hôm nay
 * @param {string} chatId 
 * @param {string} dateKey 
 */
async function markSentToday(chatId, dateKey) {
  // 1. Redis (TTL 48 giờ để tự giải phóng)
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const key = `zalo:digest:sent:${dateKey}:${chatId}`;
    await upstashCommand(['SET', key, '1', 'EX', 172800]);
  }

  // 2. In-memory
  const memKey = `${dateKey}:${chatId}`;
  inMemorySentDates.set(memKey, Date.now());
}

/**
 * Kiểm tra khung giờ và kích hoạt Điểm Tin Buổi Sáng nếu đúng 7h30 sáng
 * @param {boolean} [force=false] - Gửi cưỡng bức bất chấp giờ giấc (dành cho nút test thủ công)
 * @returns {Promise<{
 *   triggeredCount: number,
 *   chats: string[],
 *   reason?: string
 * }>}
 */
async function checkAndTriggerMorningDigest(force = false) {
  const dtParts = getVietnamDateTimeParts();
  const { hour, minute, dateKey } = dtParts;

  // Kiểm tra thời gian: Khoảng từ 7h30 đến 7h45 sáng (GMT+7)
  // Nếu force = true thì bỏ qua điều kiện giờ
  const isMorningTimeWindow = (hour === 7 && minute >= 30) || (hour === 8 && minute <= 0);

  if (!isMorningTimeWindow && !force) {
    return {
      triggeredCount: 0,
      chats: [],
      reason: `Chưa đến khung giờ 7:30 sáng (Bây giờ là ${hour}:${String(minute).padStart(2, '0')} GMT+7)`
    };
  }

  const targetChats = await getTargetChatIds();
  if (targetChats.length === 0) {
    return {
      triggeredCount: 0,
      chats: [],
      reason: 'Chưa có nhóm hoặc người dùng nào được ghi nhận.'
    };
  }

  const sentChats = [];

  for (const chatId of targetChats) {
    try {
      if (!force) {
        const alreadySent = await hasSentToday(chatId, dateKey);
        if (alreadySent) {
          continue;
        }
      }

      // Soạn nội dung và gửi
      const message = await composeMorningDigestMessage(chatId, dtParts);
      const res = await botService.sendMessage(chatId, message);

      if (res && (!Array.isArray(res) || res[0]?.ok !== false)) {
        await markSentToday(chatId, dateKey);
        sentChats.push(chatId);
        console.log(`[Daily Digest] Đã gửi lời chúc buổi sáng cho chat ${chatId}`);
      }
    } catch (err) {
      console.warn(`[Daily Digest Error] Lỗi gửi chat ${chatId}:`, err.message);
    }
  }

  return {
    triggeredCount: sentChats.length,
    chats: sentChats,
    dateKey
  };
}

module.exports = {
  checkAndTriggerMorningDigest,
  composeMorningDigestMessage,
  registerChatForDigest,
  unregisterChatForDigest,
  getTargetChatIds,
  getVietnamDateTimeParts
};

