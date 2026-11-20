const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const OFFSET_MS = 7 * 3600000;
const DAY_MS = 86400000;
const WEEKDAY_NAMES = ['Chủ nhật', 'thứ Hai', 'thứ Ba', 'thứ Tư', 'thứ Năm', 'thứ Sáu', 'thứ Bảy'];
const DAY_WORDS = {
  hai: 1, ba: 2, tu: 3, nam: 4, sau: 5, bay: 6,
  '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6,
  cn: 0, sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2,
  wed: 3, wednesday: 3, thu: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6
};
const NATURAL_DAY = '(?:thu\\s+(?:hai|ba|tu|nam|sau|bay|[2-7])|chu\\s+nhat|cn)';
const DIRECT_DAY = `(?:${NATURAL_DAY}|[2-7]|monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat|sunday|sun)`;
const TIME_PATTERN = '(?:luc\\s+)?(\\d{1,3})(?::(\\d{1,3})|\\s*(?:h|gio)(?:\\s*(\\d{1,3})(?:\\s*(?:p|phut))?)?)(?:\\s*(sang|chieu|toi|trua|dem))?';
function normalize(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}
function validateRecurrence(recurrence) {
  if (!recurrence || !['daily', 'weekly'].includes(recurrence.type)) throw new RangeError('Chu kỳ phải là daily hoặc weekly.');
  if (!Number.isInteger(recurrence.hour) || recurrence.hour < 0 || recurrence.hour > 23 || !Number.isInteger(recurrence.minute) || recurrence.minute < 0 || recurrence.minute > 59) throw new RangeError('Giờ phải từ 00:00 đến 23:59.');
  if (recurrence.type === 'weekly' && (!Number.isInteger(recurrence.weekday) || recurrence.weekday < 0 || recurrence.weekday > 6)) throw new RangeError('Ngày trong tuần không hợp lệ.');
  if (recurrence.timeZone !== undefined && recurrence.timeZone !== TIME_ZONE) throw new RangeError('Chỉ hỗ trợ múi giờ Asia/Ho_Chi_Minh.');
}
// Vietnam has a fixed UTC+7 offset; no host timezone or locale parsing is involved.
function nextOccurrence(recurrence, afterMs) {
  validateRecurrence(recurrence);
  if (!Number.isFinite(afterMs)) throw new RangeError('Thời điểm tham chiếu không hợp lệ.');
  const local = new Date(afterMs + OFFSET_MS);
  if (!Number.isFinite(local.getTime())) throw new RangeError('Thời điểm tham chiếu không hợp lệ.');
  const candidate = new Date(local.getTime());
  candidate.setUTCHours(recurrence.hour, recurrence.minute, 0, 0);
  let scheduledTime = candidate.getTime() - OFFSET_MS;
  if (recurrence.type === 'weekly') {
    scheduledTime += ((recurrence.weekday - local.getUTCDay() + 7) % 7) * DAY_MS;
    if (scheduledTime <= afterMs) scheduledTime += 7 * DAY_MS;
  } else if (scheduledTime <= afterMs) scheduledTime += DAY_MS;
  if (!Number.isFinite(new Date(scheduledTime).getTime())) throw new RangeError('Lịch nằm ngoài khoảng thời gian hợp lệ.');
  return scheduledTime;
}
function formatRecurrence(recurrence) {
  validateRecurrence(recurrence);
  const time = `${String(recurrence.hour).padStart(2, '0')}:${String(recurrence.minute).padStart(2, '0')}`;
  return `${recurrence.type === 'daily' ? 'mỗi ngày' : `mỗi ${WEEKDAY_NAMES[recurrence.weekday]}`} lúc ${time}`;
}
function readWeekday(value) {
  const day = value.trim().replace(/\s+/g, ' ');
  return day === 'chu nhat' ? 0 : DAY_WORDS[day.replace(/^thu\s+/, '')];
}
function readTime(text, requireStart = false) {
  const pattern = new RegExp((requireStart ? '^' : '\\b') + TIME_PATTERN + (requireStart ? '(?=\\s|$)' : '\\b'), 'g');
  const matches = [...text.matchAll(pattern)];
  let match = matches.find(item => /^luc\s/.test(item[0])) || matches[0];
  if (!match) match = new RegExp((requireStart ? '^' : '\\b') + 'luc\\s+(\\d{1,3})(?![\\d:])\\b').exec(text);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? match[3] ?? 0);
  const period = match[4];
  if (period) {
    if (hour < 1 || hour > 12) throw new RangeError('Giờ có sáng/chiều/tối phải từ 1 đến 12.');
    if (period === 'sang' || period === 'dem') { if (hour === 12) hour = 0; }
    else if (hour < 12) hour += 12;
  }
  validateRecurrence({ type: 'daily', hour, minute });
  return { hour, minute, index: match.index, length: match[0].length };
}
function eraseSpans(source, spans) {
  const chars = source.split('');
  for (const [start, length] of spans) for (let i = start; i < start + length; i++) chars[i] = ' ';
  return chars.join('');
}
function cleanTask(source) {
  let result = source.trim();
  const prefix = /^\s*[,;:–—-]*\s*(?:(?:hay\s+)?nhac(?:\s+nho)?(?:\s+(?:cho\s+)?(?:chung toi|toi|minh|em|ban|anh|chi|nhom))?\b\s*[,;:–—-]*\s*)?/;
  const match = prefix.exec(normalize(result));
  if (match) result = result.slice(match[0].length);
  return result.replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, '').replace(/\s+/g, ' ');
}
function finish(recurrence, task, senderName, now) {
  if (!task || task.length > 2000) return { ok: false, error: 'Nội dung nhắc cần từ 1 đến 2.000 ký tự.' };
  const scheduledTime = nextOccurrence(recurrence, now);
  return { ok: true, scheduledTime, delayMs: scheduledTime - now, task, targetName: typeof senderName === 'string' && senderName.trim() ? senderName.trim() : 'Bạn', recurrence };
}
function parseRecurringReminder(text, senderName = 'Bạn', now = Date.now()) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const source = text.normalize('NFC').trim();
  const normalized = normalize(source);
  const command = /^\/(?:repeat|lap)(?:@\S+)?(?=\s|$)\s*/.exec(normalized);
  const intent = /\b(?:moi|hang)\s+(?:(?:\d+|hai|ba|bon)\s+)?(?:ngay|tuan|thang|nam|gio|phut|thu|chu nhat|cn|sang|trua|chieu|toi)\b|\b(?:dinh ky|lap lai)\b/;
  if (!command && (!intent.test(normalized) || (!/\b(?:nhac|hen|bao thuc|dat lich)\b/.test(normalized) && !/^(?:moi|hang|lap lai|dinh ky)\b/.test(normalized)))) return null;
  try {
    if (command) {
      let offset = command[0].length;
      let remainder = normalized.slice(offset);
      const mode = /^(daily|weekly|ngay|tuan)(?=\s|$)\s*/.exec(remainder);
      if (!mode) return { ok: false, error: 'Dùng /repeat daily 08:00 nội dung hoặc /repeat weekly mon 08:00 nội dung.' };
      const type = ['daily', 'ngay'].includes(mode[1]) ? 'daily' : 'weekly';
      offset += mode[0].length;
      remainder = normalized.slice(offset);
      const recurrence = { type, timeZone: TIME_ZONE };
      if (type === 'weekly') {
        const day = new RegExp(`^(${DIRECT_DAY})(?=\\s|$)\\s*`).exec(remainder);
        if (!day) return { ok: false, error: 'Chỉ rõ thứ trong tuần, ví dụ mon, thứ Hai hoặc 2.' };
        recurrence.weekday = readWeekday(day[1]);
        offset += day[0].length;
        remainder = normalized.slice(offset);
      }
      const time = readTime(remainder, true);
      if (!time) return { ok: false, error: 'Nhập giờ hợp lệ, ví dụ 08:00 hoặc 20:30.' };
      recurrence.hour = time.hour;
      recurrence.minute = time.minute;
      return finish(recurrence, source.slice(offset + time.length).trim(), senderName, now);
    }
    if (/\b(?:moi|hang)\s+(?:(?:\d+|hai|ba|bon)\s+)?(?:thang|nam|gio|phut)\b/.test(normalized) || /\b(?:moi|hang)\s+(?:\d+|hai|ba|bon)\s+(?:ngay|tuan)\b/.test(normalized)) return { ok: false, error: 'Hiện chỉ hỗ trợ lặp mỗi ngày hoặc mỗi tuần vào một thứ cụ thể.' };
    const daily = /\b(?:moi|hang)\s+ngay\b/.exec(normalized);
    const weekly = /\b(?:moi|hang)\s+tuan\b/.exec(normalized);
    const weeklyDay = new RegExp(`\\b(?:moi|hang)\\s+(${NATURAL_DAY})\\b`).exec(normalized);
    if (daily && (weekly || weeklyDay)) return { ok: false, error: 'Chọn một chu kỳ: mỗi ngày hoặc mỗi tuần.' };
    if (!daily && !weekly && !weeklyDay) return { ok: false, error: 'Chỉ rõ lặp mỗi ngày hoặc mỗi tuần và giờ cần nhắc.' };
    const recurrence = { type: daily ? 'daily' : 'weekly', timeZone: TIME_ZONE };
    const cadence = daily || weekly || weeklyDay;
    const spans = [[cadence.index, cadence[0].length]];
    if (recurrence.type === 'weekly') {
      const days = [...normalized.matchAll(new RegExp(`\\b(${NATURAL_DAY})\\b`, 'g'))];
      if (days.length !== 1) return { ok: false, error: 'Chỉ rõ một thứ trong tuần, ví dụ mỗi thứ Hai.' };
      recurrence.weekday = readWeekday(days[0][1]);
      let start = days[0].index;
      const connector = /\bvao\s*$/.exec(normalized.slice(0, start));
      if (connector) start = connector.index;
      spans.push([start, days[0].index + days[0][0].length - start]);
    }
    const time = readTime(normalized);
    if (!time) return { ok: false, error: 'Bạn chưa chỉ rõ giờ nhắc, ví dụ lúc 08:00.' };
    recurrence.hour = time.hour;
    recurrence.minute = time.minute;
    spans.push([time.index, time.length]);
    return finish(recurrence, cleanTask(eraseSpans(source, spans)), /\bnhac\s+(?:cho\s+)?nhom\b/.test(normalized) ? 'cả nhóm' : senderName, now);
  } catch (error) { return { ok: false, error: error.message }; }
}
module.exports = { parseRecurringReminder, nextOccurrence, formatRecurrence };
