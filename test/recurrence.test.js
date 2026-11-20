const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseRecurringReminder: parse, nextOccurrence, formatRecurrence } = require('../lib/recurrence');
const { parseReminderEditCommand: edit } = require('../lib/reminder-commands');
const ms = Date.parse;
const now = ms('2026-11-20T10:00:00+07:00');
const daily = { type: 'daily', hour: 8, minute: 0, timeZone: 'Asia/Ho_Chi_Minh' };
const monday = { ...daily, type: 'weekly', weekday: 1 };

test('daily and weekly schedules use Vietnam calendar and strictly future times', () => {
  assert.equal(nextOccurrence(daily, ms('2026-11-20T07:59:59+07:00')), ms('2026-11-20T08:00:00+07:00'));
  assert.equal(nextOccurrence(daily, ms('2026-11-20T08:00:00+07:00')), ms('2026-11-21T08:00:00+07:00'));
  assert.equal(nextOccurrence(monday, now), ms('2026-11-23T08:00:00+07:00'));
  assert.equal(nextOccurrence(monday, ms('2026-11-23T08:00:00+07:00')), ms('2026-11-30T08:00:00+07:00'));
  assert.equal(nextOccurrence({ ...monday, weekday: 0 }, now), ms('2026-11-22T08:00:00+07:00'));
});
test('calendar rollover and recovery skip missed occurrences', () => {
  for (const [from, expected] of [
    ['2026-11-30T23:00:00+07:00', '2026-12-01T08:00:00+07:00'],
    ['2026-12-31T23:00:00+07:00', '2027-01-01T08:00:00+07:00'],
    ['2028-02-28T23:00:00+07:00', '2028-02-29T08:00:00+07:00'],
    ['2028-02-29T23:00:00+07:00', '2028-03-01T08:00:00+07:00']
  ]) assert.equal(nextOccurrence(daily, ms(from)), ms(expected));
  assert.equal(nextOccurrence(monday, ms('2027-03-17T10:30:00+07:00')), ms('2027-03-22T08:00:00+07:00'));
});
test('natural Vietnamese daily and weekly tasks preserve accents and targets', () => {
  for (const [input, task, recurrence] of [
    ['nhắc tôi mỗi ngày lúc 8h uống nước', 'uống nước', daily],
    ['nhắc anh mỗi ngày lúc 8h uống nước', 'uống nước', daily],
    ['Mỗi thứ Hai lúc 8h nhắc họp', 'họp', monday],
    ['Mỗi thứ Hai lúc 8h nhắc thu tiền', 'thu tiền', monday],
    ['hằng ngày 20:30 nhắc đọc sách', 'đọc sách', { ...daily, hour: 20, minute: 30 }],
    ['nhắc tôi hằng tuần vào thứ 3 lúc 8 giờ 30 đọc tài liệu', 'đọc tài liệu', { ...monday, weekday: 2, minute: 30 }]
  ]) {
    const result = parse(input, 'Huy', now);
    assert.equal(result.ok, true, input + ': ' + result.error);
    assert.equal(result.task, task);
    assert.equal(result.targetName, 'Huy');
    assert.deepEqual(result.recurrence, recurrence);
  }
});
test('direct aliases and weekday spellings are supported', () => {
  assert.equal(parse('/repeat daily 08:00 Uống nước', 'An', now).task, 'Uống nước');
  for (const day of ['mon', 'monday', '2', 'thứ Hai']) assert.deepEqual(parse(`/lap weekly ${day} 08:00 Họp nhóm`, 'An', now).recurrence, monday);
  for (const day of ['cn', 'sun', 'Chủ nhật']) assert.equal(parse(`/repeat weekly ${day} 08:00 Nghỉ ngơi`, 'An', now).recurrence.weekday, 0);
  assert.equal(formatRecurrence(monday), 'mỗi thứ Hai lúc 08:00');
});
test('missing and unsupported schedules never silently become one-shot reminders', () => {
  for (const input of ['nhắc tôi mỗi ngày uống nước', 'mỗi ngày lúc 8h nhắc tôi', 'mỗi tuần lúc 8h nhắc họp', '/repeat', '/repeat daily 08:00', '/repeat weekly 08:00 họp', 'mỗi thứ Hai và thứ Ba lúc 8h nhắc họp', 'nhắc tôi mỗi tháng lúc 8h trả tiền nhà', 'mỗi 2 ngày lúc 8h nhắc uống nước', '/repeat monthly 08:00 thu tiền', '/repeat daily 24:00 đọc', '/repeat daily 08:60 đọc', 'mỗi ngày lúc 25h nhắc đọc']) assert.equal(parse(input, 'An', now)?.ok, false, input);
  for (const input of ['', null, 'xin chào', 'nhắc tôi sau 15 phút uống nước', 'ngày mai lúc 8h nhắc họp', 'tôi tập thể dục mỗi ngày']) assert.equal(parse(input, 'An', now), null, input);
});
test('invalid recurrence data is rejected', () => {
  for (const item of [null, { ...daily, type: 'monthly' }, { ...daily, hour: 24 }, { ...daily, minute: 60 }, { ...monday, weekday: 7 }, { ...daily, timeZone: 'UTC' }]) assert.throws(() => nextOccurrence(item, now));
  assert.throws(() => nextOccurrence(daily, NaN));
});
test('edit commands validate IDs, positive bounded durations and task text', () => {
  assert.deepEqual(edit('/hoannhac remind_123_abc 15m', now).changes, { snoozeMs: 900000 });
  assert.deepEqual(edit('hoãn remind_123_abc 2 giờ', now).changes, { snoozeMs: 7200000 });
  assert.deepEqual(edit('/suanhac remind_123_abc noi-dung Gửi báo cáo mới', now).changes, { task: 'Gửi báo cáo mới' });
  for (const input of ['/hoannhac', '/hoannhac all 15m', '/hoannhac remind_123_abc 0m', '/hoannhac remind_123_abc 31d', '/hoannhac remind_123_abc 1.5h', '/suanhac remind_123_abc noi-dung', '/suanhac remind_123_abc gio 24:00']) assert.equal(edit(input, now).ok, false, input);
  assert.equal(edit('hello', now), null);
});
test('clock edits use next future Vietnam clock with explicit tomorrow', () => {
  assert.equal(edit('/suanhac remind_123_abc gio 08:30', now).changes.scheduledTime, ms('2026-11-21T08:30:00+07:00'));
  assert.equal(edit('/editremind remind_123_abc time 11:00', now).changes.scheduledTime, ms('2026-11-20T11:00:00+07:00'));
  assert.equal(edit('/suanhac remind_123_abc gio mai 11:00', now).changes.scheduledTime, ms('2026-11-21T11:00:00+07:00'));
});
