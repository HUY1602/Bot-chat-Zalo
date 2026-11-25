const assert = require('node:assert/strict');
const { test, beforeEach, afterEach } = require('node:test');
const bot = require('../lib/bot-service');
const digest = require('../lib/daily-digest-service');
const memory = require('../lib/memory-service');
const reminders = require('../lib/reminder-service');
const store = require('../lib/state-store');
const webhook = require('../api/webhook');
const setup = require('../api/setup');
const memoryApi = require('../api/memory');
const cron = require('../api/reminder-cron');
const chat = require('../api/test-chat');
const searchService = require('../lib/search-service');
const originals = { sendMessage: bot.sendMessage, sendChatAction: bot.sendChatAction, register: digest.registerChatForDigest, trigger: digest.checkAndTriggerMorningDigest, fetch: global.fetch, now: Date.now };
let originalEnv;
let sent;
let registered;
beforeEach(() => {
  originalEnv = { ...process.env };
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.WEBHOOK_SECRET = 'test-webhook-secret';
  process.env.ADMIN_SECRET = 'test-admin-secret';
  process.env.CRON_SECRET = 'test-cron-secret';
  sent = [];
  registered = [];
  bot.sendMessage = async (...args) => { sent.push(args); return [{ ok: true }]; };
  bot.sendChatAction = async () => ({ ok: true });
  digest.registerChatForDigest = async id => { registered.push(id); };
  digest.checkAndTriggerMorningDigest = async () => ({ triggeredCount: 0 });
  global.fetch = async () => { throw new Error('Unexpected network call in offline tests'); };
});
afterEach(() => {
  process.env = originalEnv;
  bot.sendMessage = originals.sendMessage;
  bot.sendChatAction = originals.sendChatAction;
  digest.registerChatForDigest = originals.register;
  digest.checkAndTriggerMorningDigest = originals.trigger;
  global.fetch = originals.fetch;
  Date.now = originals.now;
});
function response() {
  return { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; }, end() { return this; } };
}
function message(id, text = '/ping', chatId = 'webhook-test') {
  return { method: 'POST', headers: { 'x-bot-api-secret-token': process.env.WEBHOOK_SECRET }, body: { message: { message_id: id, text, chat: { id: chatId }, from: { id: 'owner', name: 'Tester' } } } };
}
function admin(method = 'GET') {
  return { method, headers: { authorization: `Basic ${Buffer.from('admin:test-admin-secret').toString('base64')}` }, query: {}, body: {} };
}
function reminder(chatId, overrides = {}) {
  return reminders.createReminder({ chatId, userId: 'owner', senderName: 'Tester', task: 'Test task', scheduledTime: Date.now() - 1000, ...overrides });
}

test('webhook handles a message, registers its chat, and suppresses repeated deliveries', async () => {
  const req = message('valid-delivery');
  const first = response();
  await webhook(req, first);
  assert.equal(first.code, 200);
  assert.deepEqual(registered, ['webhook-test']);
  assert.equal(sent.length, 1);
  const second = response();
  await webhook(req, second);
  assert.equal(second.body.duplicate, true);
  assert.equal(sent.length, 1);
  await webhook(message('valid-delivery', '/ping', 'other-chat'), response());
  assert.equal(sent.length, 2);
});

test('webhook rejects absent, wrong, and legacy secrets before any side effects', async () => {
  for (const secret of [undefined, 'wrong', '16022004']) {
    const req = message('bad-auth');
    req.headers['x-bot-api-secret-token'] = secret;
    const res = response();
    await webhook(req, res);
    assert.equal(res.code, 401);
  }
  delete process.env.WEBHOOK_SECRET;
  const res = response();
  await webhook(message('no-config'), res);
  assert.equal(res.code, 503);
  assert.equal(registered.length, 0);
  assert.equal(sent.length, 0);
});

test('admin APIs and cron reject missing credentials and fail closed without configuration', async () => {
  for (const handler of [setup, memoryApi, chat, cron]) {
    const res = response();
    await handler({ method: 'POST', headers: {}, body: {}, query: {} }, res);
    assert.equal(res.code, 401);
  }
  delete process.env.ADMIN_SECRET;
  const res = response();
  await setup(admin(), res);
  assert.equal(res.code, 503);
});

test('admin navigation supports Basic login and rejects cross-site authenticated requests', async () => {
  const req = admin();
  req.query.login = '1';
  const res = response();
  await setup(req, res);
  assert.equal(res.code, 303);
  assert.equal(res.headers.Location, '/');
  req.headers['sec-fetch-site'] = 'cross-site';
  const denied = response();
  await setup(req, denied);
  assert.equal(denied.code, 403);
});

test('memory HTML escapes message content and chat IDs', async () => {
  const id = '<img src=x onerror=alert(1)>';
  await memory.addTurn(id, '<script>alert(1)</script>', '"quoted" & text');
  const res = response();
  await memoryApi(admin(), res);
  assert.equal(res.code, 200);
  assert.ok(!res.body.includes('<script>alert(1)</script>'));
  assert.ok(!res.body.includes(id));
  assert.ok(res.body.includes('&lt;script&gt;'));
  await memory.clearHistory(id);
});

test('concurrent local history appends retain every turn', async () => {
  await Promise.all(Array.from({ length: 12 }, (_, i) => memory.addTurn('concurrent-memory', `user-${i}`, `answer-${i}`)));
  const history = await memory.getHistory('concurrent-memory');
  assert.equal(history.length, 24);
  assert.equal(new Set(history.filter(m => m.role === 'user').map(m => m.parts[0].text)).size, 12);
  await memory.clearHistory('concurrent-memory');
});

test('cancel without an explicit ID preserves reminders; users cannot cancel another owner', async () => {
  const item = await reminder('cancel-test', { scheduledTime: Date.now() + 60000 });
  await webhook(message('cancel-empty', '/huynhac', 'cancel-test'), response());
  assert.equal((await reminders.listReminders('cancel-test')).length, 1);
  assert.equal((await reminders.cancelReminder('cancel-test', item.id, 'someone-else')).count, 0);
  assert.equal((await reminders.cancelReminder('wrong-chat', item.id)).count, 0);
  assert.equal((await reminders.cancelReminder('cancel-test', item.id, null)).count, 0);
  assert.equal((await reminders.cancelReminder('cancel-test', item.id, 'owner')).count, 1);
});

test('failed sends stay pending, retry with backoff, and remain visible after five failures', async () => {
  let now = originals.now();
  Date.now = () => now;
  const item = await reminder('failed-reminder');
  bot.sendMessage = async () => [{ ok: false }];
  for (let attempt = 1; attempt <= 5; attempt++) {
    const result = await reminders.checkAndTriggerReminders();
    assert.equal(result.failedCount, 1);
    const [saved] = await reminders.listReminders('failed-reminder');
    assert.equal(saved.attempts, attempt);
    assert.equal(saved.status, attempt === 5 ? 'failed' : 'pending');
    assert.equal((await reminders.checkAndTriggerReminders()).failedCount, 0);
    now = saved.nextAttemptAt;
  }
  assert.equal((await reminders.listReminders('failed-reminder')).length, 1);
  await reminders.cancelReminder('failed-reminder', item.id);
});

test('concurrent reminder workers send only once and remove only after success', async () => {
  await reminder('parallel-reminder');
  let unblock;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  bot.sendMessage = async () => { sent.push('sent'); started(); await new Promise(resolve => { unblock = resolve; }); return [{ ok: true }]; };
  const first = reminders.checkAndTriggerReminders();
  await ready;
  const second = await reminders.checkAndTriggerReminders();
  assert.equal(second.triggeredCount, 0);
  assert.equal((await reminders.listReminders('parallel-reminder')).length, 1);
  unblock();
  assert.equal((await first).triggeredCount, 1);
  assert.equal(sent.length, 1);
  assert.equal((await reminders.listReminders('parallel-reminder')).length, 0);
});

test('Redis claim uses shared NX state and cannot be bypassed on an outage', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  const commands = [];
  global.fetch = async (_url, options) => {
    commands.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ result: null }) };
  };
  const res = response();
  await webhook(message('redis-duplicate'), res);
  assert.equal(res.body.duplicate, true);
  assert.deepEqual(commands[0].slice(3), ['NX', 'EX', 86400]);
  assert.equal(sent.length, 0);
  global.fetch = async () => { throw new Error('offline'); };
  const unavailable = response();
  await webhook(message('redis-outage'), unavailable);
  assert.equal(unavailable.code, 503);
  await assert.rejects(store.claim('outage'), /offline/);
  await assert.rejects(memory.addTurn('outage', 'user', 'answer'), /offline/);
});

test('cron token can trigger scheduled work but cannot cancel reminders', async () => {
  const req = { method: 'POST', headers: { authorization: 'Bearer test-cron-secret' }, query: {}, body: {} };
  const res = response();
  await cron(req, res);
  assert.equal(res.code, 200);
  req.query = { action: 'cancel', chatId: 'anything', id: 'all' };
  const denied = response();
  await cron(req, denied);
  assert.equal(denied.code, 403);
});

test('Zalo send failures propagate to callers even when HTTP succeeds', async () => {
  global.fetch = async () => ({ ok: true, json: async () => ({ ok: false, description: 'Rejected' }) });
  await assert.rejects(originals.sendMessage('chat', 'hello', null, 'test-token'), /Zalo/);
});

test('a failed reminder is removed only after a later successful delivery', async () => {
  let now = originals.now();
  Date.now = () => now;
  await reminder('retry-success');
  bot.sendMessage = async () => { throw new Error('Network unavailable'); };
  assert.equal((await reminders.checkAndTriggerReminders()).failedCount, 1);
  const [saved] = await reminders.listReminders('retry-success');
  now = saved.nextAttemptAt;
  bot.sendMessage = async () => [{ ok: true }];
  assert.equal((await reminders.checkAndTriggerReminders()).triggeredCount, 1);
  assert.equal((await reminders.listReminders('retry-success')).length, 0);
});

test('webhook setup rejects mismatched secrets and non-HTTPS URLs before network calls', async () => {
  for (const body of [
    { webhookUrl: 'https://example.test/webhook', secretToken: 'wrong' },
    { webhookUrl: 'http://example.test/webhook' },
    { webhookUrl: 'https://user:password@example.test/webhook' }
  ]) {
    const req = admin('POST');
    req.body = { action: 'set_webhook', ...body };
    const res = response();
    await setup(req, res);
    assert.equal(res.code, 400);
  }
});

test('webhook creates recurring reminders and routes owner edits without AI', async () => {
  process.env.VERCEL = '1';
  const chatId = 'recurring-webhook';
  const created = response();
  await webhook(message('recurring-create', 'Mỗi thứ Hai lúc 8h nhắc họp', chatId), created);
  assert.equal(created.body.action, 'createReminder');
  const [item] = await reminders.listReminders(chatId);
  assert.equal(item.recurrence.type, 'weekly');
  assert.equal(item.recurrence.weekday, 1);
  assert.ok(sent[0][1].includes(item.id));
  const edited = response();
  await webhook(message('recurring-edit', `/suanhac ${item.id} noi-dung Họp dự án mới`, chatId), edited);
  assert.equal(edited.body.ok, true);
  assert.equal((await reminders.listReminders(chatId))[0].task, 'Họp dự án mới');
  const snoozed = response();
  await webhook(message('recurring-snooze', `/hoannhac ${item.id} 15m`, chatId), snoozed);
  assert.equal(snoozed.body.action, 'updateReminder');
  assert.deepEqual((await reminders.listReminders(chatId))[0].recurrence, item.recurrence);
  const invalid = response();
  await webhook(message('recurring-invalid', '/repeat monthly 08:00 họp', chatId), invalid);
  assert.equal(invalid.body.action, 'recurringReminderHelp');
  assert.equal((await reminders.listReminders(chatId)).length, 1);
  await reminders.cancelReminder(chatId, 'all');
  await memory.clearHistory(chatId);
});

test('Zalo and dashboard share search failure handling and admin search diagnostics stay protected', async () => {
  const originalSearch = searchService.searchWebDetailed;
  const report = { status: 'unavailable', provider: '', query: 'APEC 2026', results: [],
    attempts: [{ provider: 'Google', status: 'quota' }], durationMs: 1 };
  let searches = 0;
  searchService.searchWebDetailed = async () => { searches++; return report; };
  try {
    const preview = admin('POST'); preview.body = { message: 'APEC 2026 diễn ra ở đâu' };
    const previewResponse = response();
    await chat(preview, previewResponse);
    assert.equal(previewResponse.code, 200);
    assert.equal(previewResponse.body.search.status, 'unavailable');
    await webhook(message('search-unavailable', 'APEC 2026 diễn ra ở đâu', 'search-shared'), response());
    assert.equal(sent[0][1], previewResponse.body.answer);
    const diagnostic = admin('POST'); diagnostic.body = { action: 'test_search', testPrompt: 'APEC 2026' };
    const diagnosticResponse = response();
    await setup(diagnostic, diagnosticResponse);
    assert.equal(diagnosticResponse.body.search.attempts[0].status, 'quota');
    assert.equal(diagnosticResponse.body.ok, false);
    const denied = response();
    await setup({ method: 'POST', headers: {}, body: diagnostic.body }, denied);
    assert.equal(denied.code, 401);
    assert.equal(searches, 3);
    await memory.clearHistory('search-shared');
  } finally { searchService.searchWebDetailed = originalSearch; }
});

test('webhook /id reports userId and /reset enforces ADMIN_ZALO_IDS when configured', async () => {
  await webhook(message('id-check', '/id', 'admin-guard-chat'), response());
  assert.ok(sent[0][1].includes('owner'));
  assert.ok(sent[0][1].includes('admin-guard-chat'));

  process.env.ADMIN_ZALO_IDS = 'real-admin-id';
  await memory.addTurn('admin-guard-chat', 'hello', 'hi');
  const blocked = response();
  await webhook(message('reset-denied', '/reset', 'admin-guard-chat'), blocked);
  assert.equal(blocked.body.ok, false);
  assert.equal((await memory.getHistory('admin-guard-chat')).length, 2);

  const adminMsg = message('reset-allowed', '/reset', 'admin-guard-chat');
  adminMsg.body.message.from.id = 'real-admin-id';
  const allowed = response();
  await webhook(adminMsg, allowed);
  assert.equal(allowed.body.ok, true);
  assert.equal((await memory.getHistory('admin-guard-chat')).length, 0);
});
