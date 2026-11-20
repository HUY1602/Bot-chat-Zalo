// Deterministic edits: never let a model guess which reminder to mutate.
function parseReminderEditCommand(text, now = Date.now()) {
  if (typeof text !== 'string') return null;
  const input = text.trim();
  const command = input.match(/^(\/(?:hoannhac|snooze|suanhac|editremind)|hoãn|hoan)(?=\s|$)/iu);
  if (!command) return null;
  const isSnooze = ['/hoannhac', '/snooze', 'hoãn', 'hoan'].includes(command[1].toLowerCase());
  const usage = isSnooze
    ? 'Dùng /hoannhac ID 15m hoặc hoãn ID 15 phút. Lấy ID từ /reminders hoặc tin nhắc vừa nhận.'
    : 'Dùng /suanhac ID noi-dung Nội dung mới hoặc /suanhac ID gio 08:30 hoặc /suanhac ID gio mai 08:30.';
  const parts = input.slice(command[0].length).trim().match(/^(\S+)\s+([\s\S]+)$/u);
  if (!parts || !/^remind_[a-z0-9_]{1,120}$/i.test(parts[1])) return { ok: false, error: usage };
  const [, id, rawValue] = parts;
  const value = rawValue.trim();
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) return { ok: false, error: 'Thời gian hiện tại không hợp lệ.' };
  if (isSnooze) {
    const duration = value.match(/^(\d+)\s*(m|min|phút|phut|h|giờ|gio|d|ngày|ngay)$/iu);
    if (!duration) return { ok: false, error: 'Nhập số nguyên dương kèm đơn vị: 15m, 2h hoặc 1 ngày.' };
    const unit = duration[2].toLowerCase();
    const multiplier = /^(m|min|phút|phut)$/.test(unit) ? 60000 : /^(h|giờ|gio)$/.test(unit) ? 3600000 : 86400000;
    const snoozeMs = Number(duration[1]) * multiplier;
    if (!Number.isSafeInteger(snoozeMs) || snoozeMs < 60000 || snoozeMs > 30 * 86400000) return { ok: false, error: 'Thời gian hoãn phải từ 1 phút đến 30 ngày.' };
    return { ok: true, id, changes: { snoozeMs } };
  }
  const edit = value.match(/^(noi-dung|nội-dung|nội\s+dung|text|gio|giờ|time)(?:\s+([\s\S]*))?$/iu);
  if (!edit) return { ok: false, error: usage };
  const replacement = (edit[2] || '').trim();
  if (/^(noi-dung|nội-dung|nội\s+dung|text)$/iu.test(edit[1])) {
    if (!replacement || replacement.length > 2000) return { ok: false, error: 'Nội dung mới phải có từ 1 đến 2.000 ký tự.' };
    return { ok: true, id, changes: { task: replacement } };
  }
  const clock = replacement.match(/^(?:(mai|tomorrow)\s+)?(\d{1,2}):(\d{2})$/iu);
  if (!clock || Number(clock[2]) > 23 || Number(clock[3]) > 59) return { ok: false, error: 'Nhập giờ Việt Nam hợp lệ: HH:MM hoặc mai HH:MM (00:00–23:59).' };
  const day = 86400000;
  const offset = 7 * 3600000;
  let scheduledTime = Math.floor((now + offset) / day) * day - offset + Number(clock[2]) * 3600000 + Number(clock[3]) * 60000;
  if (clock[1] || scheduledTime <= now) scheduledTime += day;
  return { ok: true, id, changes: { scheduledTime } };
}

module.exports = { parseReminderEditCommand };
