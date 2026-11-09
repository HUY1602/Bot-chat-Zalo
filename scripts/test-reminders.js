const assert = require('node:assert/strict');
const reminderService = require('../lib/');
const botService = require('../lib/');

async function main() {
  // Isolate tests from Redis and Zalo. No network requests or real reminders.
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  const originalNow = Date.now;
  const originalSend = botService.sendMessage;
  Date.now = () => Date.parse('2026-11-02T10:54:46+07:00');
  const sender = 'Mai Quang Huy';
  try {
    for (const [text, task, target] of [
      ['nhắc anh 11h đứng dậy', 'đứng dậy', `anh ${sender}`],
      ['nhắc anh 11h thức dậy', 'thức dậy', `anh ${sender}`],
      ['11h gọi anh dậy', 'thức dậy', `anh ${sender}`],
      ['11h gọi Tường và Lộc dậy', 'thức dậy', 'các anh Tường và Lộc'],
      ['nhắc anh 11h họp nhóm', 'họp nhóm', `anh ${sender}`]
    ]) {
      const result = reminderService.parseReminderFast(text, sender);
      assert.equal(result.ok, true, text);
      assert.equal(result.task, task, text);
      assert.equal(result.targetName, target, text);
      assert.equal(result.scheduledTime, Date.parse('2026-11-02T11:00:00+07:00'), text);
    }
    const parsed = reminderService.parseReminderFast('nhắc anh 11h đứng dậy', sender);
    const reminder = await reminderService.createReminder({
      ...parsed, chatId: 'test-chat', senderName: sender,
      userId: '63508eb2abe242bc1bf3', msgId: 'test-message'
    });
    assert.match(reminderService.buildConfirmationMessage(reminder), /Đối tượng: anh Mai Quang Huy/);
    const sent = [];
    botService.sendMessage = async (...args) => { sent.push(args); return [{ ok: true }]; };
    Date.now = () => parsed.scheduledTime + 59000;
    const triggered = await reminderService.checkAndTriggerReminders();
    assert.equal(triggered.triggeredCount, 1);
    assert.equal(sent[0][0], 'test-chat');
    assert.match(sent[0][1], /Đến giờ rồi nè anh Mai Quang Huy/);
    assert.doesNotMatch(sent[0][1], /\[@|63508eb2|@Mai/);
    assert.equal(sent[0][2], 'test-message');
    assert.equal((await reminderService.checkAndTriggerReminders()).triggeredCount, 0);
    console.log('Reminder regression tests passed');
  } finally {
    Date.now = originalNow;
    botService.sendMessage = originalSend;
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
