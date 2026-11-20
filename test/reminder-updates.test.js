const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const service = require('../lib/reminder-service');
const bot = require('../lib/bot-service');
const store = require('../lib/state-store');
const original = { send: bot.sendMessage, now: Date.now, claim: store.claim };
let env, clock, sent, chats;
const daily = { type: 'daily', hour: 8, minute: 0, timeZone: 'Asia/Ho_Chi_Minh' };
beforeEach(() => {
  env = { ...process.env };
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  clock = Date.parse('2026-11-20T08:00:00+07:00');
  Date.now = () => clock;
  sent = []; chats = new Set();
  bot.sendMessage = async (...args) => { sent.push(args); return [{ ok: true }]; };
});
afterEach(async () => {
  store.claim = original.claim;
  for (const chatId of chats) await service.cancelReminder(chatId, 'all');
  process.env = env;
  bot.sendMessage = original.send;
  Date.now = original.now;
});
async function create(chatId, extra = {}) {
  chats.add(chatId);
  return service.createReminder({ chatId, userId: 'owner', senderName: 'Huy', task: 'Họp', scheduledTime: clock, ...extra });
}
test('recurring success keeps same ID and queues the next fixed time', async () => {
  const r = await create('daily', { recurrence: daily });
  assert.equal((await service.checkAndTriggerReminders()).triggeredCount, 1);
  const [next] = await service.listReminders('daily');
  assert.equal(next.id, r.id);
  assert.equal(next.scheduledTime, Date.parse('2026-11-21T08:00:00+07:00'));
  assert.equal(next.attempts, 0);
  assert.equal((await service.checkAndTriggerReminders()).triggeredCount, 0);
  clock += 4 * 86400000 + 5000;
  assert.equal((await service.checkAndTriggerReminders()).triggeredCount, 1);
  assert.equal(sent.length, 2);
  assert.equal((await service.listReminders('daily'))[0].scheduledTime, Date.parse('2026-11-25T08:00:00+07:00'));
});
test('snooze preserves recurring clock and uses now as delay origin', async () => {
  const r = await create('snooze-recurring', { recurrence: daily });
  const changed = await service.updateReminder(r.chatId, r.id, 'owner', { snoozeMs: 900000 });
  assert.equal(changed.reminder.scheduledTime, clock + 900000);
  assert.deepEqual(changed.reminder.recurrence, daily);
  assert.equal((await service.checkAndTriggerReminders()).triggeredCount, 0);
  clock += 900000;
  assert.equal((await service.checkAndTriggerReminders()).triggeredCount, 1);
  assert.equal((await service.listReminders(r.chatId))[0].scheduledTime, Date.parse('2026-11-21T08:00:00+07:00'));
});
test('completed one-shot can be snoozed beyond old retention, then sends again', async () => {
  const r = await create('completed-snooze');
  await service.checkAndTriggerReminders();
  assert.equal((await service.listReminders(r.chatId)).length, 0);
  const updated = await service.updateReminder(r.chatId, r.id, 'owner', { snoozeMs: 2 * 86400000 });
  assert.equal(updated.ok, true);
  assert.equal(updated.reminder.completedAt, undefined);
  clock += 2 * 86400000;
  assert.equal((await service.checkAndTriggerReminders()).triggeredCount, 1);
  assert.equal(sent.length, 2);
  clock += 86400001;
  assert.equal((await service.updateReminder(r.chatId, r.id, 'owner', { snoozeMs: 900000 })).ok, false);
});
test('only owning user in same chat can edit and bad values leave original intact', async () => {
  const r = await create('permissions', { scheduledTime: clock + 60000 });
  for (const [chat, user, changes] of [['other', 'owner', { task: 'wrong' }], [r.chatId, 'other', { task: 'wrong' }], [r.chatId, null, { task: 'wrong' }], [r.chatId, 'owner', { task: '' }], [r.chatId, 'owner', { scheduledTime: clock }], [r.chatId, 'owner', { snoozeMs: -1 }], [r.chatId, 'owner', { recurrence: null }]]) assert.equal((await service.updateReminder(chat, r.id, user, changes)).ok, false);
  assert.equal((await service.listReminders(r.chatId))[0].task, 'Họp');
  assert.equal((await service.updateReminder(r.chatId, r.id, 'owner', { task: 'Gửi báo cáo' })).reminder.task, 'Gửi báo cáo');
});
test('retry retains occurrence; snooze reactivates failed recurring reminder', async () => {
  const r = await create('retry-recurring', { recurrence: daily });
  bot.sendMessage = async () => { throw new Error('network'); };
  for (let i = 0; i < 5; i++) {
    assert.equal((await service.checkAndTriggerReminders()).failedCount, 1);
    const [saved] = await service.listReminders(r.chatId);
    assert.equal(saved.scheduledTime, r.scheduledTime);
    clock = saved.nextAttemptAt;
  }
  assert.equal((await service.listReminders(r.chatId))[0].status, 'failed');
  const updated = await service.updateReminder(r.chatId, r.id, 'owner', { snoozeMs: 60000 });
  assert.equal(updated.reminder.attempts, 0);
  assert.equal(updated.reminder.status, 'pending');
  bot.sendMessage = async () => [{ ok: true }];
  clock += 60000;
  assert.equal((await service.checkAndTriggerReminders()).triggeredCount, 1);
  assert.equal((await service.listReminders(r.chatId))[0].scheduledTime, Date.parse('2026-11-21T08:00:00+07:00'));
});
test('worker selected before snooze rereads new deadline and does not send stale occurrence', async () => {
  const r = await create('stale-selection');
  let intercept = true;
  store.claim = async (...args) => {
    if (intercept) {
      intercept = false;
      assert.equal((await service.updateReminder(r.chatId, r.id, 'owner', { snoozeMs: 60000 })).ok, true);
    }
    return original.claim(...args);
  };
  assert.equal((await service.checkAndTriggerReminders()).triggeredCount, 0);
  assert.equal(sent.length, 0);
});
test('busy reminder cannot be edited while a delivery is in flight', async () => {
  const r = await create('busy');
  let unblock, started;
  const ready = new Promise(resolve => { started = resolve; });
  bot.sendMessage = async () => { started(); await new Promise(resolve => { unblock = resolve; }); return [{ ok: true }]; };
  const worker = service.checkAndTriggerReminders();
  await ready;
  assert.equal((await service.updateReminder(r.chatId, r.id, 'owner', { snoozeMs: 60000 })).reason, 'busy');
  unblock(); await worker;
});
test('expired lock owner cannot release a newer lease', async () => {
  const key = 'test:expiry';
  const first = await store.claim(key, 1);
  clock += 1001;
  const second = await store.claim(key, 10);
  assert.notEqual(first, second);
  await store.release(key, first);
  assert.equal(await store.ownsClaim(key, second), true);
  await store.release(key, second);
});

test('recovery after persisted sent status advances recurrence without sending twice', async () => {
  const r = await create('sent-recovery', { recurrence: daily });
  const owns = store.ownsClaim;
  let writes = 0;
  store.ownsClaim = async (...args) => {
    if (++writes === 2) throw new Error('simulated crash before advance');
    return owns(...args);
  };
  try {
    await assert.rejects(service.checkAndTriggerReminders(), /simulated crash/);
  } finally { store.ownsClaim = owns; }
  assert.equal(sent.length, 1);
  await service.checkAndTriggerReminders();
  assert.equal(sent.length, 1);
  const [saved] = await service.listReminders(r.chatId);
  assert.equal(saved.status, 'pending');
  assert.equal(saved.scheduledTime, Date.parse('2026-11-21T08:00:00+07:00'));
});

test('expired editor lease cannot persist a stale change', async () => {
  const r = await create('stale-editor', { scheduledTime: clock + 600000 });
  store.claim = async (...args) => {
    const token = await original.claim(...args);
    clock += 121000;
    return token;
  };
  await assert.rejects(service.updateReminder(r.chatId, r.id, 'owner', { task: 'stale' }), /lock expired/);
  store.claim = original.claim;
  assert.equal((await service.listReminders(r.chatId))[0].task, 'Họp');
});
