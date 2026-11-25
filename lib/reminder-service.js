const stateStore = require('./state-store');
const { parseRecurringReminder, nextOccurrence, formatRecurrence } = require('./recurrence');
/**
 * Reminder Service for Zalo Bot
 * Handles scheduling, storing, and triggering reminders
 * Storage: Upstash Redis (Persistent across Vercel Serverless invocations) + In-Memory Fallback
 */

const botService = require('./bot-service');
const geminiService = require('./gemini-service');

// In-Memory store for local development or fallback
const inMemoryReminders = new Map();

/**
 * Chuyển đổi chuỗi tiếng Việt có dấu thành không dấu
 * @param {string} str 
 * @returns {string}
 */
function removeVietnameseTones(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/**
 * Lấy các phần ngày/giờ hiện tại theo múi giờ Việt Nam (GMT+7, Asia/Ho_Chi_Minh)
 * @param {Date} date
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

  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10), // 1-12
    day: parseInt(map.day, 10),
    hour: parseInt(map.hour, 10),   // 0-23
    minute: parseInt(map.minute, 10),
    second: parseInt(map.second, 10) || 0,
    weekday: map.weekday
  };
}

/**
 * Định dạng thời gian theo phong cách Việt Nam thân thiện (hỗ trợ nhiều ngày, thứ trong tuần, tháng sau)
 * @param {number|Date} timestamp
 * @returns {string}
 */
function formatTimeVN(timestamp) {
  const date = new Date(timestamp);
  const vn = getVietnamDateTimeParts(date);
  const nowVn = getVietnamDateTimeParts();

  const hh = String(vn.hour).padStart(2, '0');
  const mm = String(vn.minute).padStart(2, '0');
  const dd = String(vn.day).padStart(2, '0');
  const MM = String(vn.month).padStart(2, '0');

  const weekdays = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
  const dayOfWeek = weekdays[new Date(Date.UTC(vn.year, vn.month - 1, vn.day)).getDay()];

  const targetDateOnly = new Date(Date.UTC(vn.year, vn.month - 1, vn.day));
  const nowDateOnly = new Date(Date.UTC(nowVn.year, nowVn.month - 1, nowVn.day));
  const diffDays = Math.round((targetDateOnly - nowDateOnly) / (86400 * 1000));

  let dayLabel = `${dayOfWeek}, ${dd}/${MM}/${vn.year}`;
  if (diffDays === 0) {
    dayLabel = 'hôm nay';
  } else if (diffDays === 1) {
    dayLabel = 'ngày mai';
  } else if (diffDays === 2) {
    dayLabel = `ngày mốt (${dayOfWeek}, ${dd}/${MM})`;
  } else if (diffDays > 2 && diffDays <= 7) {
    dayLabel = `${dayOfWeek} (${dd}/${MM})`;
  } else {
    dayLabel = `${dayOfWeek}, ${dd}/${MM}/${vn.year}`;
  }

  return `${hh}:${mm} (${dayLabel})`;
}

/**
 * Định dạng khoảng cách thời gian từ hiện tại (hỗ trợ giây, phút, tiếng, ngày)
 * @param {number} diffMs
 * @returns {string}
 */
function formatRelativeTime(diffMs) {
  if (diffMs <= 1000) return 'ngay bây giờ';
  const totalSeconds = Math.round(diffMs / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds} giây nữa`;
  }
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} phút nữa`;
  }
  const totalHours = Math.floor(totalMinutes / 60);
  const remMinutes = totalMinutes % 60;
  if (totalHours < 24) {
    if (remMinutes === 0) return `${totalHours} tiếng nữa`;
    return `${totalHours} tiếng ${remMinutes} phút nữa`;
  }
  const days = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;
  if (remHours === 0 && remMinutes === 0) {
    return `${days} ngày nữa`;
  }
  if (remHours === 0) {
    return `${days} ngày ${remMinutes} phút nữa`;
  }
  if (remMinutes === 0) {
    return `${days} ngày ${remHours} tiếng nữa`;
  }
  return `${days} ngày ${remHours} tiếng nữa`;
}

/**
 * Kiểm tra xem tin nhắn có phải là yêu cầu hẹn giờ / nhắc việc hay không
 * @param {string} text
 * @returns {boolean}
 */
function isReminderRequest(text) {
  if (!text || typeof text !== 'string') return false;
  const raw = text.trim();
  if (parseRecurringReminder(raw) !== null) return true;
  const unaccented = removeVietnameseTones(raw);

  // 1. Lệnh trực tiếp: /remind, /hengio, /nhac, /hen, /reminder
  if (/^\/(?:remind|hengio|nhac|hen|reminder)\b/i.test(raw)) {
    return true;
  }

  // 2. Không phải nhắc việc nếu chỉ hỏi xem danh sách hoặc hủy
  if (isListRemindersRequest(text) || isCancelReminderRequest(text)) {
    return false;
  }

  // 3. Các mẫu câu tiếng Việt tự nhiên nhắc việc, hẹn giờ, báo thức, gọi dậy:
  const patterns = [
    /^(?:bot\s+|em\s+|bot\s+bien\s+)?(?:nhac|hen gio|dat lich|bao thuc|goi|keu|hen)\b/i,
    /\b(?:nhac|hen gio|dat lich|bao thuc|goi|keu|hen)\s+(?:cho\s+)?(?:anh|chi|em|toi|minh|nhom|tui|2 em|hai em|moi nguoi)\b/i,
    /\b(?:\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)\s*(?:phut|giay|tieng|gio|ngay)\s*nua\s+(?:nhac|bao|goi|keu|hen)\b/i,
    /\b(?:lat nua|ty nua|teo nua)\s+(?:nhac|goi|keu|bao)\b/i,
    /\b(?:nhac|bao|goi|keu|hen)\s+(?:anh|chi|em|toi|minh|nhom)?\s*(?:luc|vao luc)?\s*\d{1,2}(?:h|:|\s*gio)\b/i,
    /\b(?:mai|ngay mai|toi nay|chieu nay|sang mai|trua nay)\s+(?:nhac|goi|keu|bao|hen)\b/i,
    /^\s*\d{1,2}(?:h|:|\s*gio)\d{0,2}\s+(?:nhac|goi|keu|bao|hen|dat lich|bao thuc)\b/i,
    /\b(?:\d{1,2}(?:h|:|\s*gio)\d{0,2})\b.*?\b(?:nhac|goi|keu|bao|hen|dat lich|bao thuc)\b/i,
    /\b(?:nhac|goi|keu|bao|hen|dat lich|bao thuc)\b.*?\b(?:\d{1,2}(?:h|:|\s*gio)\d{0,2}|\d+\s*phut|\d+\s*tieng)\b/i
  ];

  return patterns.some(p => p.test(unaccented));
}

/**
 * Kiểm tra xem tin nhắn có phải là yêu cầu xem danh sách nhắc việc
 * @param {string} text
 * @returns {boolean}
 */
function isListRemindersRequest(text) {
  if (!text) return false;
  const raw = text.trim();
  const unaccented = removeVietnameseTones(raw);

  if (/^\/(?:reminders|dsnhac|listremind|lichnhac)\b/i.test(raw)) return true;

  const patterns = [
    /\b(?:danh sach|xem|co nhung|kiem tra)\s+(?:lich\s+)?(?:nhac|hen gio|nhac viec|lich hen)\b/i,
    /\b(?:lich\s+)?(?:nhac|hen gio|nhac viec)\s+(?:hom nay|sap toi|con lai)\b/i,
    /\bco\s+(?:lich\s+)?(?:nhac|hen)\s+nao\s+khong\b/i
  ];

  return patterns.some(p => p.test(unaccented));
}

/**
 * Kiểm tra xem tin nhắn có phải là yêu cầu hủy nhắc việc
 * @param {string} text
 * @returns {boolean}
 */
function isCancelReminderRequest(text) {
  if (!text) return false;
  const raw = text.trim();
  const unaccented = removeVietnameseTones(raw);

  if (/^\/(?:cancelremind|cancel_remind|huynhac|xoanhac|clearremind)\b/i.test(raw)) return true;

  const patterns = [
    /\b(?:huy|xoa|bo)\s+(?:tat ca\s+)?(?:lich\s+)?(?:nhac|hen gio|nhac viec|lich hen)\b/i,
    /\b(?:dung\s+nhac|thoi\s+khong\s+can\s+nhac|khong\s+can\s+nhac\s+nua)\b/i
  ];

  return patterns.some(p => p.test(unaccented));
}

/**
 * Trích xuất thông tin ngày (cụ thể, thứ trong tuần, hoặc tương đối) từ tin nhắn
 * @param {string} text 
 * @param {object} nowVn 
 * @returns {{ year: number, month: number, day: number, hasExplicitDate: boolean, matchedDateTokens: string[] }}
 */
function parseDateTimeInfo(text, nowVn) {
  let targetYear = nowVn.year;
  let targetMonth = null;
  let targetDay = null;
  const matchedDateTokens = [];

  // Dạng trong ngoặc: (1/11), (ngày 1/11), (01/11/2026), (1-11)
  const parenDateMatch = text.match(/\((?:ngày\s+)?(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?\)/i);
  if (parenDateMatch) {
    targetDay = parseInt(parenDateMatch[1], 10);
    targetMonth = parseInt(parenDateMatch[2], 10);
    if (parenDateMatch[3]) targetYear = parseInt(parenDateMatch[3], 10);
    matchedDateTokens.push(parenDateMatch[0]);
  }

  // Dạng: ngày 1 tháng 11 hoặc mùng 1 tháng 11
  if (!targetDay) {
    const textDateMatch = text.match(/\b(?:ngày|ngay|mùng|mung|mồng|mong)\s*(\d{1,2})\s*(?:tháng|thang|\/|\-)\s*(\d{1,2})(?:\s*(?:năm|nam|\/|\-)\s*(\d{4}))?\b/i);
    if (textDateMatch) {
      targetDay = parseInt(textDateMatch[1], 10);
      targetMonth = parseInt(textDateMatch[2], 10);
      if (textDateMatch[3]) targetYear = parseInt(textDateMatch[3], 10);
      matchedDateTokens.push(textDateMatch[0]);
    }
  }

  // Dạng: ngày 1/11 hoặc 1/11
  if (!targetDay) {
    const slashDateMatch = text.match(/\b(?:ngày|ngay\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/i);
    if (slashDateMatch) {
      targetDay = parseInt(slashDateMatch[1], 10);
      targetMonth = parseInt(slashDateMatch[2], 10);
      if (slashDateMatch[3]) targetYear = parseInt(slashDateMatch[3], 10);
      matchedDateTokens.push(slashDateMatch[0]);
    }
  }

  // 2. Tìm thứ trong tuần: chủ nhật, thứ 2 -> thứ 7 (kèm tới, này, tuần sau...)
  let weekdayOffset = null;
  const weekdayMatch = text.match(/\b(chủ nhật|chu nhat|cn|thứ\s*[2-7]|thu\s*[2-7]|thứ\s*(?:hai|ba|tư|tu|năm|nam|sáu|sau|bảy|bay)|t[2-7])(?:\s*(tới|toi|này|nay|tuần\s*sau|tuan\s*sau|tuần\s*tới|tuan\s*toi|tuần\s*này|tuan\s*nay))?\b/i);

  if (weekdayMatch) {
    const rawWd = removeVietnameseTones(weekdayMatch[1]).replace(/\s+/g, '');
    const modifier = (weekdayMatch[2] || '').toLowerCase();
    matchedDateTokens.push(weekdayMatch[0]);

    let targetWd = -1;
    if (rawWd.includes('chunhat') || rawWd === 'cn') targetWd = 0;
    else if (rawWd.includes('2') || rawWd.includes('hai')) targetWd = 1;
    else if (rawWd.includes('3') || rawWd.includes('ba')) targetWd = 2;
    else if (rawWd.includes('4') || rawWd.includes('tu')) targetWd = 3;
    else if (rawWd.includes('5') || rawWd.includes('nam')) targetWd = 4;
    else if (rawWd.includes('6') || rawWd.includes('sau')) targetWd = 5;
    else if (rawWd.includes('7') || rawWd.includes('bay')) targetWd = 6;

    if (targetWd !== -1) {
      const nowWeekday = new Date(Date.UTC(nowVn.year, nowVn.month - 1, nowVn.day)).getDay();
      let diff = (targetWd - nowWeekday + 7) % 7;

      const isNextWeek = /tuần\s*(?:sau|tới)|tuan\s*(?:sau|toi)/i.test(modifier);
      const isExplicitToi = /tới|toi/i.test(modifier);

      if (diff === 0) {
        if (isNextWeek || isExplicitToi) diff = 7;
      }
      weekdayOffset = diff;
    }
  }

  // 3. Tìm từ chỉ ngày tương đối: ngày mai, ngày mốt, ngày kia, hôm nay
  let relativeDayOffset = null;
  const relDayMatch = text.match(/\b(?:mai|ngày mai|ngay mai|sáng mai|sang mai|chiều mai|chieu mai|tối mai|toi mai|trưa mai|trua mai|hôm sau|hom sau)\b/i);
  if (relDayMatch) {
    relativeDayOffset = 1;
    matchedDateTokens.push(relDayMatch[0]);
  } else {
    const motMatch = text.match(/\b(?:mốt|mot|ngày mốt|ngay mot|ngày kia|ngay kia)\b/i);
    if (motMatch) {
      relativeDayOffset = 2;
      matchedDateTokens.push(motMatch[0]);
    } else {
      const kiaMatch = text.match(/\b(?:ngày kìa|ngay kia)\b/i);
      if (kiaMatch) {
        relativeDayOffset = 3;
        matchedDateTokens.push(kiaMatch[0]);
      } else {
        const todayMatch = text.match(/\b(?:hôm nay|hom nay|tối nay|toi nay|chiều nay|chieu nay|sáng nay|sang nay|trưa nay|trua nay)\b/i);
        if (todayMatch) {
          relativeDayOffset = 0;
          matchedDateTokens.push(todayMatch[0]);
        }
      }
    }
  }

  // 4. Tìm X ngày nữa
  const daysAfterMatch = text.match(/(\d+)\s*(?:ngày|ngay)\s*(?:nữa|nua|sau)/i);
  if (daysAfterMatch) {
    relativeDayOffset = parseInt(daysAfterMatch[1], 10);
    matchedDateTokens.push(daysAfterMatch[0]);
  }

  let finalYear = nowVn.year;
  let finalMonth = nowVn.month;
  let finalDay = nowVn.day;

  if (targetDay !== null && targetMonth !== null) {
    finalDay = targetDay;
    finalMonth = targetMonth;
    finalYear = targetYear;
    const checkTarget = new Date(Date.UTC(finalYear, finalMonth - 1, finalDay));
    const checkNow = new Date(Date.UTC(nowVn.year, nowVn.month - 1, nowVn.day));
    if (checkTarget < checkNow && !matchedDateTokens.some(t => t.includes(String(finalYear)))) {
      finalYear += 1;
    }
  } else if (weekdayOffset !== null) {
    const targetDate = new Date(Date.UTC(nowVn.year, nowVn.month - 1, nowVn.day + weekdayOffset));
    finalYear = targetDate.getUTCFullYear();
    finalMonth = targetDate.getUTCMonth() + 1;
    finalDay = targetDate.getUTCDate();
  } else if (relativeDayOffset !== null) {
    const targetDate = new Date(Date.UTC(nowVn.year, nowVn.month - 1, nowVn.day + relativeDayOffset));
    finalYear = targetDate.getUTCFullYear();
    finalMonth = targetDate.getUTCMonth() + 1;
    finalDay = targetDate.getUTCDate();
  }

  return {
    year: finalYear,
    month: finalMonth,
    day: finalDay,
    hasExplicitDate: (targetDay !== null || weekdayOffset !== null || relativeDayOffset !== null),
    matchedDateTokens
  };
}

/**
 * Phân tích trích xuất thời gian và nội dung cần nhắc bằng Regex & Logic Việt Nam
 * @param {string} rawText 
 * @param {string} senderName 
 * @returns {{ ok: boolean, delayMs?: number, scheduledTime?: number, task?: string, targetName?: string, timeFormatted?: string, error?: string }}
 */
function parseReminderFast(rawText, senderName = 'anh') {
  if (!rawText) return { ok: false, error: 'Tin nhắn rỗng' };
  let text = rawText.trim();

  // Bỏ các mention bot còn sót lại bất kỳ đâu trong câu
  text = text.replace(/@?Bot\s*bi[eể]n\s*n[eè]\b/gi, '');
  text = text.replace(/@?Bọt\s*biển\s*(?:cute)?\b/gi, '');
  text = text.replace(/@?Bot\s+Vạn\s+Năng\b/gi, '');
  text = text.replace(/@?bot\.UOOvNGDv\b/gi, '');
  text = text.replace(/\s*@\S+$/gi, '').trim();

  // Bỏ lệnh slash nếu có (/remind, /nhac, /hengio...)
  text = text.replace(/^\/(?:remind|hengio|nhac|hen|reminder)\s+/i, '');

  // Xác định đối tượng được nhắc (targetName)
  let targetName = senderName;
  let targetNameToRemove = '';

  // Nhận diện mẫu đặc biệt: "gọi [ai đó] dậy" hoặc "kêu [ai đó] dậy"
  let isWakeUp = false;
  // Chỉ nhận hành động gọi thức dậy rõ ràng. "nhắc anh 11h đứng dậy"
  // là nhắc chính người gửi làm việc, không phải tên "anh 11h đứng".
  const wakeUpMatch = text.match(/(?:^|\s)(?:gọi|kêu)\s+(?:cho\s+)?([^\d]+?)\s+(?:thức dậy|ngủ dậy|dậy)(?=\s|$|[.!?])/i);
  if (wakeUpMatch) {
    isWakeUp = true;
    let rawWho = wakeUpMatch[1].replace(/^(?:cho\s+)?(?:2|hai)?\s*em\s+(?:của\s+)?(?:anh|tôi|mình)\s*(?:là)?\s*/i, '').trim();
    const SELF_PRONOUNS = /^(?:a|anh|e|em|tôi|toi|t|mình|minh|m|tao|bác|bac|chú|chu|cô|co)$/i;
    if (SELF_PRONOUNS.test(rawWho)) {
      targetName = senderName;
    } else if (rawWho) {
      targetName = rawWho;
    }
    targetNameToRemove = wakeUpMatch[0];
  }

  const targetMatch = !wakeUpMatch && text.match(/\b(?:nhắc|hẹn|báo|gọi|kêu|báo thức)\s+(?:cho\s+)?(cả\s+nhóm|nhóm|anh|chị|em|tôi|mình|2\s+em|hai\s+em|a|e)(?:\s+([A-Za-zÀ-ỹ]+))?\b/i);
  if (targetMatch) {
    const pronoun = targetMatch[1].trim().toLowerCase();
    const potentialName = targetMatch[2] ? targetMatch[2].trim() : '';

    const EXCLUDED_WORDS = /^(?:dung|thuc|day|mai|ngay|hom|chieu|toi|sang|trua|lat|ty|luc|vao|gio|tieng|phut|nua|nho|hay|giup|ho|voi|nhe|nha|di|nha|nghen|goi|lam|nho|di|nop|hop|uong|mua|an|hoc|viet|gui|don|noi|xem|chat|bao|choi|ve|ra|vao|lay|tat|bat|test|chay|xong|chuan)\b/i;

    if (pronoun === 'cả nhóm' || pronoun === 'nhóm') {
      targetName = 'cả nhóm mình';
      targetNameToRemove = targetMatch[1];
    } else if (['tôi', 'mình', 'a', 'e'].includes(pronoun) || !potentialName || EXCLUDED_WORDS.test(removeVietnameseTones(potentialName))) {
      targetName = senderName;
      targetNameToRemove = targetMatch[1];
    } else if (potentialName && !EXCLUDED_WORDS.test(removeVietnameseTones(potentialName))) {
      targetName = `${targetMatch[1]} ${potentialName}`;
      targetNameToRemove = `${targetMatch[1]} ${potentialName}`;
    } else {
      targetName = senderName;
      targetNameToRemove = targetMatch[1];
    }
  }

  const now = Date.now();
  const nowVn = getVietnamDateTimeParts();
  let delayMs = 0;
  let scheduledTime = null;
  let matchedTimeText = '';

  // Quét ngày/tháng/thứ trước
  const dateInfo = parseDateTimeInfo(text, nowVn);

  // 1. Kiểm tra các dạng tiếng rưỡi / giờ rưỡi trước: "1 tiếng rưỡi nữa", "nửa tiếng nữa"
  const rưỡiMatch = text.match(/(\d+)\s*(?:tiếng|giờ)\s*(?:rưỡi|ruoi)\s*(?:nữa)?/i) ||
                    text.match(/(?:nửa|nua)\s*(?:tiếng|giờ)\s*(?:nữa)?/i);
  if (rưỡiMatch) {
    matchedTimeText = rưỡiMatch[0];
    if (/nửa\s*(?:tiếng|giờ)/i.test(rưỡiMatch[0])) {
      delayMs = 30 * 60 * 1000;
    } else {
      const h = parseInt(rưỡiMatch[1], 10);
      delayMs = (h * 60 + 30) * 60 * 1000;
    }
    scheduledTime = now + delayMs;
  }

  // 2. Dạng thời gian tương đối: "10m nữa", "30s nữa", "15 phút nữa", "2 tiếng nữa", "sau 1 tiếng"
  if (!scheduledTime) {
    const shortFormatMatch = text.match(/\b(\d+)\s*(m|p|min|mins|phút|phut|s|sec|giây|giay|h|tiếng|tieng|giờ|gio)(?:\s*(\d+)\s*(?:p|phút|phut|m))?(?:\s*nữa)?\b/i);
    if (shortFormatMatch) {
      const val1 = parseInt(shortFormatMatch[1], 10);
      const unit1 = shortFormatMatch[2].toLowerCase();
      const val2 = shortFormatMatch[3] ? parseInt(shortFormatMatch[3], 10) : 0;
      const isHourUnit = ['h', 'giờ', 'gio'].includes(unit1);
      const isTiengUnit = ['tiếng', 'tieng'].includes(unit1);
      const hasRelativeKeyword = /\b(?:nữa|sau|trong)\b/i.test(text);
      const isSlashCommand = /^\/(?:remind|nhac|hen)/i.test(rawText);

      // Nếu đơn vị là "h" hoặc "giờ" mà KHÔNG có từ tương đối (nữa/sau/trong) và không phải slash command,
      // thì ĐÂY LÀ GIỜ TRONG NGÀY (ví dụ: "15h", "16h", "8h"), KHÔNG ĐƯỢC tính là thời gian tương đối!
      const isTrueRelative = isTiengUnit || 
                             (['s', 'sec', 'giây', 'giay', 'm', 'p', 'min', 'mins', 'phút', 'phut'].includes(unit1) && (hasRelativeKeyword || isSlashCommand || /^(?:\d+)\s*(?:m|p|phút|phut|s|giây)/i.test(text))) ||
                             (isHourUnit && (hasRelativeKeyword || isSlashCommand));

      if (isTrueRelative && !dateInfo.hasExplicitDate) {
        let totalMs = 0;
        if (['s', 'sec', 'giây', 'giay'].includes(unit1)) {
          totalMs = val1 * 1000;
        } else if (['m', 'p', 'min', 'mins', 'phút', 'phut'].includes(unit1)) {
          totalMs = val1 * 60 * 1000;
        } else if (isHourUnit || isTiengUnit) {
          totalMs = (val1 * 3600 + val2 * 60) * 1000;
        }

        if (totalMs > 0) {
          delayMs = totalMs;
          scheduledTime = now + delayMs;
          matchedTimeText = shortFormatMatch[0];
        }
      }
    }
  }

  // 3. Dạng thời gian tuyệt đối trong ngày: "15:30", "15h30", "3h chiều", "3 rưỡi chiều", "8h sáng", "9 rưỡi tối"...
  if (!scheduledTime) {
    const timeMatch = text.match(/(?:lúc|vào lúc)?\s*(\d{1,2})(?:h|:|\s*giờ\s*)(\d{2})?\s*(sáng|trưa|chiều|tối|đêm|am|pm)?/i) ||
                      text.match(/(?:lúc|vào lúc)?\s*(\d{1,2})\s*(?:h|giờ)?\s*(?:rưỡi|ruoi)\s*(sáng|trưa|chiều|tối|đêm|am|pm)?/i);

    let hour = 8; // Mặc định 8h sáng nếu người dùng chỉ nói ngày mà không kèm giờ
    let minute = 0;
    let period = '';

    if (timeMatch) {
      hour = parseInt(timeMatch[1], 10);
      if (/rưỡi|ruoi/i.test(timeMatch[0])) {
        minute = 30;
        period = (timeMatch[2] || '').toLowerCase();
      } else {
        minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
        period = (timeMatch[3] || '').toLowerCase();
      }
      matchedTimeText = timeMatch[0];
    } else if (!dateInfo.hasExplicitDate) {
      return { ok: false, error: 'Chưa xác định được thời gian hẹn giờ' };
    }

    // Xử lý sáng / trưa / chiều / tối
    if (['chiều', 'tối', 'pm'].includes(period) && hour < 12) {
      hour += 12;
    } else if (['sáng', 'am'].includes(period) && hour === 12) {
      hour = 0;
    }

    // Tính timestamp chuẩn UTC của múi giờ Việt Nam GMT+7
    let targetUtc = Date.UTC(dateInfo.year, dateInfo.month - 1, dateInfo.day, hour - 7, minute, 0, 0);
    delayMs = targetUtc - now;

    // Nếu không nói ngày cụ thể và giờ hẹn hôm nay đã trôi qua:
    if (!dateInfo.hasExplicitDate && delayMs <= 0) {
      if (hour <= 12 && !period) {
        // Thử phiên bản chiều/tối (+12h)
        const pmUtc = Date.UTC(dateInfo.year, dateInfo.month - 1, dateInfo.day, (hour + 12) - 7, minute, 0, 0);
        if (pmUtc > now) {
          targetUtc = pmUtc;
          delayMs = targetUtc - now;
        }
      }
      if (delayMs <= 0) {
        // Đã qua -> tự động chuyển sang ngày mai
        targetUtc = Date.UTC(dateInfo.year, dateInfo.month - 1, dateInfo.day + 1, hour - 7, minute, 0, 0);
        delayMs = targetUtc - now;
      }
    }

    if (delayMs > 0) {
      scheduledTime = targetUtc;
    }
  }

  if (!scheduledTime || delayMs <= 0) {
    return { ok: false, error: 'Chưa xác định được thời gian hẹn giờ hợp lệ' };
  }

  // Trích xuất nội dung cần nhắc (Task)
  let task = text;
  // Bỏ từ khóa thời gian đã khớp
  if (matchedTimeText) {
    task = task.replace(matchedTimeText, ' ');
  }
  // Bỏ tất cả các cụm từ chỉ ngày đã khớp
  for (const token of dateInfo.matchedDateTokens) {
    task = task.replace(token, ' ');
  }

  // Bỏ đối tượng đích đã trích xuất
  if (targetNameToRemove) {
    task = task.replace(targetNameToRemove, ' ');
  }

  // Dọn dẹp khoảng trắng trước khi lọc tiền tố
  task = task.trim();

  // Bỏ các từ mào đầu và đại từ
  task = task.replace(/^(?:bot\s+|em\s+|bọt biển\s+ơi\s+|ơi\s+)?(?:nhắc|hẹn giờ|đặt lịch|báo thức|gọi|kêu)\s+/i, '');
  task = task.replace(/^(?:cho\s+)?(?:cả\s+nhóm|nhóm|anh|chị|em|tôi|mình|2\s+em|hai\s+em)\s+/i, '');
  task = task.replace(/^(?:bọt biển\s+ơi\s+|em\s+ơi\s+|bot\s+ơi\s+|ơi\s+)/i, '');
  // Tiếp tục bỏ từ 'nhắc', 'gọi', 'kêu' nếu vẫn còn đứng đầu sau khi loại bỏ đại từ
  task = task.replace(/^(?:nhắc|gọi|kêu)\s+/i, '');
  task = task.replace(/\b(?:lúc|vào lúc|vào|để|nữa|hôm nay|ngày mai|sáng mai|chiều mai|tối mai|chiều nay|tối nay|sáng nay|ngày mốt|mốt|mai|hôm|nay)\b/gi, ' ');
  task = task.replace(/\b(?:nhớ|hãy|giúp|hộ|với|nhé|nha|ạ|đi|nhá|nghen|xem)\b/gi, ' ');
  // Bỏ bất kỳ mention bot nào còn sót lại trong task
  task = task.replace(/@?Bot\s*bi[eể]n\s*n[eè]\b/gi, '');
  task = task.replace(/@?Bọt\s*biển\s*(?:cute)?\b/gi, '');
  task = task.replace(/@?Bot\s+Vạn\s+Năng\b/gi, '');
  task = task.replace(/\s*@\S+$/gi, '');
  task = task.replace(/\s{2,}/g, ' ');
  task = task.replace(/^[:\-,\s]+/, '').replace(/[:\-,\s]+$/, '').trim();

  if (task.toLowerCase() === 'dậy' || task.toLowerCase() === 'thuc day' || (isWakeUp && (!task || task.length < 2 || task === 'Công việc đã hẹn giờ'))) {
    task = 'thức dậy';
  }

  if (!task || task.length < 2) {
    task = 'Công việc đã hẹn giờ';
  }

  const person = resolvePerson(targetName, senderName, rawText);
  return {
    ok: true,
    delayMs,
    scheduledTime,
    task,
    targetName: person.displayName,
    timeFormatted: formatTimeVN(scheduledTime),
    relativeFormatted: formatRelativeTime(delayMs)
  };
}

/**
 * Phân tích yêu cầu hẹn giờ bằng Gemini AI khi ngôn ngữ phức tạp
 * @param {string} rawText 
 * @param {string} senderName 
 * @returns {Promise<{ ok: boolean, scheduledTime?: number, task?: string, targetName?: string, timeFormatted?: string, relativeFormatted?: string }>}
 */
async function parseReminderWithGemini(rawText, senderName = 'anh') {
  const now = Date.now();
  const nowVn = getVietnamDateTimeParts();
  const prompt = `Phân tích câu nói sau đây để trích xuất thông tin hẹn giờ / nhắc việc:
"${rawText}"

THỜI GIAN HIỆN TẠI (GMT+7 Việt Nam):
- Bây giờ là: ${nowVn.hour} giờ ${nowVn.minute} phút, ngày ${nowVn.day}/${nowVn.month}/${nowVn.year} (Hôm nay).
- Thứ trong tuần hiện tại: ${nowVn.weekday}.
- Tên người yêu cầu: "${senderName}".

YÊU CẦU:
Trả về DUY NHẤT một chuỗi JSON hợp lệ (không kèm giải thích, không markdown code block):
{
  "isReminder": true,
  "targetDate": "YYYY-MM-DD",
  "targetTime": "HH:mm",
  "delayMinutes": <số phút nếu là thời gian tương đối>,
  "task": "<nội dung việc cần nhắc, viết ngắn gọn súc tích tiếng Việt>",
  "targetName": "<tên hoặc danh xưng người được nhắc, ví dụ 'anh Huy', 'chị Lan', 'cả nhóm' hoặc '${senderName}'>"
}

Nếu câu nói KHÔNG PHẢI là yêu cầu hẹn giờ/nhắc việc, trả về: {"isReminder": false}`;

  try {
    const rawAnswer = await geminiService.generateAnswer(prompt, {
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'
    });

    const jsonMatch = rawAnswer.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ok: false, error: 'Không parse được JSON từ Gemini' };

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.isReminder) {
      return { ok: false, error: 'Không phải yêu cầu nhắc việc hợp lệ' };
    }

    let scheduledTime = null;
    let delayMs = 0;

    if (parsed.targetDate && parsed.targetTime) {
      const [y, m, d] = parsed.targetDate.split('-').map(Number);
      const [hh, mm] = parsed.targetTime.split(':').map(Number);
      if (y && m && d && !isNaN(hh) && !isNaN(mm)) {
        scheduledTime = Date.UTC(y, m - 1, d, hh - 7, mm, 0, 0);
        delayMs = scheduledTime - now;
      }
    }

    if ((!scheduledTime || delayMs <= 0) && parsed.delayMinutes && parsed.delayMinutes > 0) {
      delayMs = Math.round(parsed.delayMinutes * 60 * 1000);
      scheduledTime = now + delayMs;
    }

    if (!scheduledTime || delayMs <= 0) {
      return { ok: false, error: 'Thời gian nhắc đã qua hoặc không xác định được' };
    }

    return {
      ok: true,
      delayMs,
      scheduledTime,
      task: parsed.task || 'Công việc đã hẹn',
      targetName: parsed.targetName || senderName,
      timeFormatted: formatTimeVN(scheduledTime),
      relativeFormatted: formatRelativeTime(delayMs)
    };
  } catch (err) {
    console.error('Lỗi khi parse reminder qua Gemini:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Phân tích thông minh: Thử Fast Regex trước, nếu không rõ ràng thì dùng Gemini
 * @param {string} text 
 * @param {string} senderName 
 * @returns {Promise<{ ok: boolean, scheduledTime?: number, task?: string, targetName?: string, timeFormatted?: string, relativeFormatted?: string, error?: string }>}
 */
async function parseReminder(text, senderName = 'anh') {
  const recurring = parseRecurringReminder(text, senderName);
  if (recurring !== null) {
    return recurring.ok ? { ...recurring, timeFormatted: formatTimeVN(recurring.scheduledTime), relativeFormatted: formatRelativeTime(recurring.delayMs) } : recurring;
  }
  // Thử fast regex trước
  const fastResult = parseReminderFast(text, senderName);
  if (fastResult.ok && fastResult.scheduledTime) {
    return fastResult;
  }

  // Thử Gemini AI
  const aiResult = await parseReminderWithGemini(text, senderName);
  if (aiResult.ok && aiResult.scheduledTime) {
    return aiResult;
  }

  return {
    ok: false,
    error: fastResult.error || aiResult.error || 'Em chưa hiểu rõ thời gian anh muốn hẹn ạ!'
  };
}

/**
 * Tạo và lưu một nhắc việc mới vào Redis / Memory
 * @param {object} params
 * @returns {Promise<object>}
 */
async function createReminder({ chatId, senderName, userId, targetName, task, scheduledTime, timeFormatted, msgId, recurrence = null }) {
  if (!Number.isFinite(scheduledTime) || scheduledTime <= 0 || typeof task !== 'string' || !task.trim() || task.length > 2000) throw new Error('Thời gian hoặc nội dung nhắc không hợp lệ');
  if (recurrence) nextOccurrence(recurrence, scheduledTime);
  const id = `remind_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const reminder = {
    id,
    chatId: String(chatId),
    senderName,
    userId: userId || null,
    targetName: targetName || senderName,
    task,
    scheduledTime,
    timeFormatted: timeFormatted || formatTimeVN(scheduledTime),
    msgId: msgId ? String(msgId) : null,
    createdAt: Date.now(),
    recurrence: recurrence ? { ...recurrence } : null
  };

  reminder.status = 'pending';
  reminder.attempts = 0;
  await saveReminder(reminder);

  return reminder;
}

// All reminder mutations share the same lock and persist detail + queue index together.
async function saveReminder(reminder, lease = null) {
  const score = reminder.nextAttemptAt || reminder.scheduledTime;
  const queued = !['completed', 'failed'].includes(reminder.status);
  const ttl = reminder.status === 'completed' ? 86400 : Math.max(7 * 86400, Math.ceil((score - Date.now()) / 1000) + 7 * 86400);
  if (stateStore.hasRedis()) {
    const result = await stateStore.command(['EVAL', `
      if ARGV[6] ~= '' and redis.call('GET', KEYS[4]) ~= ARGV[6] then return 0 end
      redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
      if ARGV[5] == '1' then redis.call('ZADD', KEYS[2], ARGV[3], ARGV[4])
      else redis.call('ZREM', KEYS[2], ARGV[4]) end
      redis.call('SADD', KEYS[3], ARGV[4])
      return 1
    `, 4, `zalo:reminder:${reminder.id}`, 'zalo:reminders:pending', `zalo:chat_reminders:${reminder.chatId}`, lease?.key || `zalo:reminder:lock:${reminder.id}`,
    JSON.stringify(reminder), ttl, score, reminder.id, queued ? '1' : '0', lease?.token || '']);
    if (result !== 1) throw new Error('Reminder lock expired');
  } else {
    if (lease && !await stateStore.ownsClaim(lease.key, lease.token)) throw new Error('Reminder lock expired');
    inMemoryReminders.set(reminder.id, { ...reminder });
  }
}

async function readReminder(id) {
  const raw = stateStore.hasRedis() ? await stateStore.command(['GET', `zalo:reminder:${id}`]) : inMemoryReminders.get(id);
  const reminder = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (reminder?.status === 'completed' && reminder.completedAt + 86400000 <= Date.now()) {
    if (!stateStore.hasRedis()) inMemoryReminders.delete(id);
    return null;
  }
  return reminder ? { ...reminder } : null;
}

// A snooze or time edit changes only the next occurrence; recurring wall-clock time stays fixed.
async function updateReminder(chatId, id, requesterId, changes) {
  if (!id || !requesterId || !changes || typeof changes !== 'object') return { ok: false, reason: 'invalid' };
  const allowed = ['snoozeMs', 'scheduledTime', 'task'];
  if (!Object.keys(changes).length || Object.keys(changes).some(key => !allowed.includes(key))) return { ok: false, reason: 'invalid' };
  if (changes.snoozeMs !== undefined && (!Number.isSafeInteger(changes.snoozeMs) || changes.snoozeMs < 60000 || changes.snoozeMs > 30 * 86400000 || changes.scheduledTime !== undefined)) return { ok: false, reason: 'invalid' };
  if (changes.scheduledTime !== undefined && (!Number.isFinite(changes.scheduledTime) || changes.scheduledTime <= Date.now() || changes.scheduledTime > Date.now() + 366 * 86400000)) return { ok: false, reason: 'invalid' };
  if (changes.task !== undefined && (typeof changes.task !== 'string' || !changes.task.trim() || changes.task.length > 2000)) return { ok: false, reason: 'invalid' };
  const key = `zalo:reminder:lock:${id}`;
  const token = await stateStore.claim(key);
  if (!token) return { ok: false, reason: 'busy' };
  try {
    const reminder = await readReminder(id);
    if (!reminder || reminder.chatId !== String(chatId) || !reminder.userId || String(reminder.userId) !== String(requesterId)) return { ok: false, reason: 'not_found' };
    if (reminder.status === 'sent') return { ok: false, reason: 'busy' };
    const reschedule = changes.snoozeMs !== undefined || changes.scheduledTime !== undefined;
    if (reminder.status === 'completed' && !reschedule) return { ok: false, reason: 'completed' };
    if (changes.task !== undefined) reminder.task = changes.task.trim();
    if (reschedule) {
      reminder.scheduledTime = changes.snoozeMs !== undefined ? Date.now() + changes.snoozeMs : changes.scheduledTime;
      if (reminder.scheduledTime <= Date.now()) return { ok: false, reason: 'invalid' };
      reminder.timeFormatted = formatTimeVN(reminder.scheduledTime);
      reminder.status = 'pending';
      reminder.attempts = 0;
      delete reminder.nextAttemptAt;
      delete reminder.lastError;
      delete reminder.completedAt;
      delete reminder.sentAt;
    }
    reminder.updatedAt = Date.now();
    await saveReminder(reminder, { key, token });
    return { ok: true, reminder };
  } finally {
    await stateStore.release(key, token);
  }
}

async function finishDelivery(reminder, lease) {
  if (reminder.recurrence) {
    reminder.scheduledTime = nextOccurrence(reminder.recurrence, Math.max(Date.now(), reminder.sentAt || 0));
    reminder.timeFormatted = formatTimeVN(reminder.scheduledTime);
    reminder.status = 'pending';
    reminder.attempts = 0;
    delete reminder.nextAttemptAt;
    delete reminder.lastError;
  } else {
    // Retain one-shot IDs for 24 hours so the owner can snooze a notification just received.
    reminder.status = 'completed';
    reminder.completedAt = Date.now();
  }
  await saveReminder(reminder, lease);
}

/**
 * Lấy danh sách các việc đang hẹn giờ của một nhóm/chat
 * @param {string} chatId 
 * @returns {Promise<Array<object>>}
 */
async function listReminders(chatId, { includeCompleted = false } = {}) {
  let list;
  if (stateStore.hasRedis()) {
    const ids = await stateStore.command(['SMEMBERS', `zalo:chat_reminders:${chatId}`]);
    list = [];
    for (const id of ids || []) {
      const reminder = await readReminder(id);
      if (reminder) list.push(reminder);
      else await stateStore.command(['SREM', `zalo:chat_reminders:${chatId}`, id]);
    }
  } else list = [...inMemoryReminders.values()].filter(r => r.chatId === String(chatId));
  return list.filter(r => (r.status !== 'completed' || (includeCompleted && r.completedAt + 86400000 > Date.now())) && r.status !== 'sent').sort((a, b) => a.scheduledTime - b.scheduledTime);
}

async function removeReminder(reminder, lease) {
  if (stateStore.hasRedis()) {
    const result = await stateStore.command(['EVAL', `
      if redis.call('GET', KEYS[4]) ~= ARGV[2] then return 0 end
      redis.call('ZREM', KEYS[1], ARGV[1])
      redis.call('DEL', KEYS[2])
      redis.call('SREM', KEYS[3], ARGV[1])
      return 1
    `, 4, 'zalo:reminders:pending', `zalo:reminder:${reminder.id}`, `zalo:chat_reminders:${reminder.chatId}`, lease.key, reminder.id, lease.token]);
    if (result !== 1) throw new Error('Reminder lock expired');
  }
  if (!stateStore.hasRedis() && !await stateStore.ownsClaim(lease.key, lease.token)) throw new Error('Reminder lock expired');
  inMemoryReminders.delete(reminder.id);
}

// undefined requester is reserved for authenticated admin API calls; chat calls pass an ID or null.
async function cancelReminder(chatId, reminderId, requesterId = undefined) {
  if (!reminderId) return { ok: false, count: 0 };
  const reminders = await listReminders(chatId, { includeCompleted: true });
  let count = 0;
  for (const reminder of reminders) {
    if (reminderId !== 'all' && reminder.id !== reminderId) continue;
    if (requesterId !== undefined && (!requesterId || !reminder.userId || String(reminder.userId) !== String(requesterId))) continue;
    const key = `zalo:reminder:lock:${reminder.id}`;
    const token = await stateStore.claim(key);
    if (!token) continue;
    try {
      const latest = await readReminder(reminder.id);
      if (latest && latest.chatId === String(chatId)) {
        await removeReminder(latest, { key, token });
        count++;
      }
    } finally {
      await stateStore.release(key, token);
    }
  }
  return { ok: true, count };
}

async function checkAndTriggerReminders() {
  const now = Date.now();
  const triggered = [];
  let failedCount = 0;
  const dueIds = stateStore.hasRedis()
    ? await stateStore.command(['ZRANGEBYSCORE', 'zalo:reminders:pending', '-inf', String(now), 'LIMIT', 0, 20])
    : [...inMemoryReminders.values()].filter(r => !['failed', 'completed'].includes(r.status) && (r.nextAttemptAt || r.scheduledTime) <= now).map(r => r.id);

  for (const id of dueIds || []) {
    if (Date.now() - now > 35000) break;
    const key = `zalo:reminder:lock:${id}`;
    const token = await stateStore.claim(key, 120);
    if (!token) continue;
    try {
      // Read after acquiring the lock: another worker may have completed/cancelled it.
      const reminder = await readReminder(id);
      if (!reminder) {
        if (stateStore.hasRedis()) await stateStore.command(['ZREM', 'zalo:reminders:pending', id]);
        continue;
      }
      if (reminder.status === 'sent') { await finishDelivery(reminder, { key, token }); continue; }
      if (['failed', 'completed'].includes(reminder.status) || (reminder.nextAttemptAt || reminder.scheduledTime) > Date.now()) continue;
      const person = resolvePerson(reminder.targetName, reminder.senderName, reminder.task);
      const triggerMessage = `⏰ Đến giờ rồi ${person.displayName} ơi!\n\n📌 ${reminder.task}\n🕒 Đã hẹn: ${formatTimeVN(reminder.scheduledTime)}${reminder.recurrence ? `\n🔁 ${formatRecurrence(reminder.recurrence)}` : ''}`;
      try {
        const results = await botService.sendMessage(reminder.chatId, triggerMessage, reminder.msgId || null);
        if (!Array.isArray(results) || !results.length || results.some(result => result?.ok !== true)) {
          throw new Error('Zalo chưa xác nhận gửi thành công');
        }
      } catch (error) {
        failedCount++;
        reminder.attempts = (reminder.attempts || 0) + 1;
        reminder.status = reminder.attempts >= 5 ? 'failed' : 'pending';
        reminder.lastError = 'Gửi thất bại; hãy kiểm tra kết nối Zalo.';
        reminder.nextAttemptAt = Date.now() + Math.min(3600000, 60000 * 2 ** (reminder.attempts - 1));
        await saveReminder(reminder, { key, token });
        continue;
      }
      // Persist delivery receipt before advancing; a recovery must not resend this occurrence.
      reminder.status = 'sent';
      reminder.sentAt = Date.now();
      await saveReminder(reminder, { key, token });
      triggered.push({ ...reminder });
      await finishDelivery(reminder, { key, token });
    } finally {
      await stateStore.release(key, token);
    }
  }
  return { triggeredCount: triggered.length, triggered, failedCount };
}

/**
 * Phân tích danh xưng và đối tượng chuẩn xác nhất, loại bỏ hoàn toàn "anh" chung chung
 * @param {string} rawTarget 
 * @param {string} senderName 
 * @param {string} fullText 
 * @returns {{ pronoun: string, displayName: string, mentionTag: string, baseName: string }}
 */
function resolvePerson(rawTarget = '', senderName = 'Anh', fullText = '') {
  const combined = (rawTarget || senderName).toLowerCase();

  // 1. Cả nhóm
  if (/\b(?:cả\s*nhóm|nhóm|mọi\s*người|mng|cả\s*nhà)\b/i.test(combined)) {
    return {
      pronoun: 'cả nhóm',
      displayName: 'cả nhóm mình',
      mentionTag: '@cả nhóm',
      baseName: 'cả nhóm'
    };
  }

  // 2. Tên cơ sở (bỏ tiền tố anh/em nếu có để chuẩn hóa)
  let baseName = (rawTarget || senderName || 'Anh').trim();
  // ID trong nội dung là văn bản thuần, không phải cú pháp mention được Bot API hỗ trợ.
  baseName = baseName.replace(/\[@?[^\]]+\]/g, '').trim() || senderName || 'Anh';
  if (/^(?:a|anh|chi|chị|e|em|tôi|toi|mình|minh)$/i.test(baseName)) {
    baseName = senderName || 'Anh';
  }
  baseName = baseName.replace(/^(?:cho\s+)?(?:2|hai)?\s*em\s+(?:của\s+)?(?:anh|tôi|mình)\s*(?:là)?\s*/i, '');
  baseName = baseName.replace(/^(?:các\s+)?(?:anh|chị|em|bác|chú|cô|bạn)\s+/i, '').trim();
  if (['tôi', 'mình'].includes(baseName.toLowerCase())) {
    baseName = (senderName || 'Anh').replace(/^(?:anh|chị|em|bác|chú|cô|bạn)\s+/i, '').trim();
  }

  // Nếu nhắc nhiều người (ví dụ: "Tường và Lộc", "Nam, Dũng")
  if (/(?:\s+(?:và|va)\s+|[,&])/i.test(baseName)) {
    const names = baseName.split(/(?:\s+(?:và|va)\s+|[,&])/i).filter(Boolean);
    const mentionTag = names.map(n => `@${n.trim()}`).join(' ');
    return {
      pronoun: 'hai bạn',
      displayName: `các anh ${names.join(' và ')}`,
      mentionTag,
      baseName
    };
  }

  // 3. Xác định đại từ (pronoun)
  let pronoun = 'anh'; // Mặc định là anh theo phong cách Bọt biển cute

  if (/\b(?:chị|chi|c)\b/i.test(rawTarget) || /\b(?:nhắc\s+chị)\b/i.test(fullText)) {
    pronoun = 'chị';
  } else if (/\b(?:chị\s+)/i.test(senderName)) {
    pronoun = 'chị';
  } else if (/\b(?:nhắc\s+em)\b/i.test(fullText) && !/\b(?:nhắc\s+anh)\b/i.test(fullText)) {
    pronoun = 'em';
  } else if (/\b(?:nhắc\s+anh|anh\s+)\b/i.test(fullText) || /\b(?:anh|a)\b/i.test(rawTarget)) {
    pronoun = 'anh';
  } else {
    // Kiểm tra tên nữ phổ biến ở Việt Nam
    const FEMALE_NAMES = /\b(?:thị|ngọc|hương|hoa|lan|linh|thảo|trang|huyền|dung|hà|nhung|nga|quỳnh|yến|vy|trâm|oanh|hằng|nhi|my|ly|chi|diệp|mơ|đào|vân|tuyết|ngân)\b/i;
    // Tên nam phổ biến
    const MALE_NAMES = /\b(?:văn|quang|huy|tường|nam|dũng|tuấn|hoàng|cường|đức|minh|hải|phong|thành|trung|khánh|việt|quân|long|bách|khoa|thắng|phúc|tú|bảo|đạt|sơn|vinh|tân|hùng|tùng|tiến|toàn|trọng|vũ|kiên|hiếu|duy|hưng|nghĩa|phát|lộc|khôi|nhật|hào|hậu|bình|đông|tài|đăng|nghiêm)\b/i;

    const lowerBase = baseName.toLowerCase();
    if (FEMALE_NAMES.test(lowerBase) && !MALE_NAMES.test(lowerBase)) {
      pronoun = 'chị';
    } else {
      pronoun = 'anh';
    }
  }

  const displayName = `${pronoun} ${baseName}`;
  const mentionTag = baseName === 'cả nhóm' ? '@cả nhóm' : `@${baseName}`;

  return { pronoun, displayName, mentionTag, baseName };
}

/**
 * Tạo câu trả lời xác nhận đặt lịch dễ thương cho Bọt biển
 * @param {object} reminder 
 * @returns {string}
 */
function buildConfirmationMessage(reminder) {
  const person = resolvePerson(reminder.targetName, reminder.senderName, reminder.rawText || reminder.task || '');
  const greeting = reminder.senderName && reminder.senderName !== 'Thành viên'
    ? reminder.senderName
    : person.displayName;

  return `Dạ Bọt biển đã ghi nhớ lịch nhắc rồi nè ${greeting} ơi! ⏰✨\n\n📌 Việc cần nhắc: ${reminder.task}\n🕒 Thời gian nhắc: ${formatTimeVN(reminder.scheduledTime)} (${formatRelativeTime(reminder.scheduledTime - Date.now())})\n👤 Đối tượng: ${person.displayName}\n${reminder.recurrence ? `🔁 ${formatRecurrence(reminder.recurrence)}\n` : ''}🔑 ID: ${reminder.id}\n\nHoãn: /hoannhac ${reminder.id} 15m\nSửa giờ: /suanhac ${reminder.id} gio 08:30\nThông báo được gửi khi hệ thống kiểm tra lịch đến hạn.`;
}

module.exports = {
  isReminderRequest,
  isListRemindersRequest,
  isCancelReminderRequest,
  parseReminder,
  parseReminderFast,
  createReminder,
  listReminders,
  cancelReminder,
  updateReminder,
  parseRecurringReminder,
  nextOccurrence,
  formatRecurrence,
  checkAndTriggerReminders,
  buildConfirmationMessage,
  resolvePerson,
  formatTimeVN,
  formatRelativeTime,
  removeVietnameseTones
};
