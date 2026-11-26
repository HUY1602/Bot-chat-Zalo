const assert = require('node:assert/strict');
const { test, beforeEach, afterEach } = require('node:test');
const bot = require('../lib/bot-service');
const imageService = require('../lib/image-service');
const geminiService = require('../lib/gemini-service');
const imageEndpoint = require('../api/image');
const webhook = require('../api/webhook');

const originals = {
  fetch: global.fetch,
  sendMessage: bot.sendMessage,
  sendPhoto: bot.sendPhoto,
  sendPhotoBuffer: bot.sendPhotoBuffer,
  sendChatAction: bot.sendChatAction,
  generateArtwork: imageService.generateArtwork,
  generateAnswerWithAction: geminiService.generateAnswerWithAction
};

let originalEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.WEBHOOK_SECRET = 'test-webhook-secret';
  process.env.ZALO_BOT_TOKEN = 'test-token';
  bot.sendChatAction = async () => ({ ok: true });
});

afterEach(() => {
  process.env = originalEnv;
  global.fetch = originals.fetch;
  bot.sendMessage = originals.sendMessage;
  bot.sendPhoto = originals.sendPhoto;
  bot.sendPhotoBuffer = originals.sendPhotoBuffer;
  bot.sendChatAction = originals.sendChatAction;
  imageService.generateArtwork = originals.generateArtwork;
  geminiService.generateAnswerWithAction = originals.generateAnswerWithAction;
});

function mockResponse() {
  return {
    code: 200,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end() { return this; }
  };
}

function drawWebhookReq(id, text = '/draw cute cat') {
  return {
    method: 'POST',
    headers: {
      'x-bot-api-secret-token': process.env.WEBHOOK_SECRET,
      host: 'bot-chat-zalo-one.vercel.app'
    },
    body: {
      message: {
        message_id: id,
        text,
        chat: { id: 'img-chat' },
        from: { id: 'owner', name: 'Tester' }
      }
    }
  };
}

test('sendPhotoBuffer uploads binary photo via multipart FormData and retries without reply_to_message_id', async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) {
      return { ok: true, json: async () => ({ ok: false, error_code: 400, description: 'reply invalid' }) };
    }
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 'sent-1' } }) };
  };

  const buf = Buffer.alloc(1024, 0xff);
  const res = await bot.sendPhotoBuffer('chat-1', buf, { caption: 'Tranh mèo', replyToMsgId: 'msg-1', token: 'tok' });
  assert.equal(res.ok, true);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].options.body instanceof FormData);
  assert.equal(calls[0].options.body.get('reply_to_message_id'), 'msg-1');
  assert.equal(calls[1].options.body.get('reply_to_message_id'), null);
  assert.equal(calls[1].options.body.get('caption'), 'Tranh mèo');
});

test('temp image store saves and /api/image serves clean JPEG bytes with Content-Length', async () => {
  const sample = Buffer.alloc(900, 0xab);
  const saved = await imageService.saveTempImage(sample, 'image/jpeg');
  assert.ok(saved.id.startsWith('art_'));
  assert.equal(saved.ext, 'jpg');

  const res = mockResponse();
  await imageEndpoint({ method: 'GET', query: { id: `${saved.id}.jpg` } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.headers['Content-Type'], 'image/jpeg');
  assert.equal(res.headers['Content-Length'], '900');
  assert.deepEqual(res.body, sample);

  const missing = mockResponse();
  await imageEndpoint({ method: 'GET', query: { id: 'invalid/../../etc' } }, missing);
  assert.equal(missing.code, 404);
});

test('webhook /draw uploads image directly via multipart first without sending fallback text link', async () => {
  const fakeImg = Buffer.alloc(1500, 0xcd);
  imageService.generateArtwork = async () => ({
    imageUrl: 'https://image.pollinations.ai/prompt/cat?width=1024',
    rawPrompt: 'cute cat',
    caption: 'Tranh của Tester'
  });
  global.fetch = async url => {
    assert.ok(String(url).startsWith('https://image.pollinations.ai/'));
    return {
      ok: true,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      arrayBuffer: async () => fakeImg
    };
  };

  let multipartCalls = 0;
  let textFallbackCalls = 0;
  bot.sendPhotoBuffer = async (_chatId, buf, opts) => {
    multipartCalls++;
    assert.equal(buf.length, 1500);
    assert.equal(opts.filename, 'artwork.jpg');
    return { ok: true };
  };
  bot.sendMessage = async () => { textFallbackCalls++; return [{ ok: true }]; };

  const res = mockResponse();
  await webhook(drawWebhookReq('draw-direct-1'), res);
  assert.equal(res.code, 200);
  assert.equal(res.body.deliveryMethod, 'multipart');
  assert.equal(multipartCalls, 1);
  assert.equal(textFallbackCalls, 0);
});

test('webhook GENERATE_IMAGE falls back to hosted /api/image URL if multipart fails', async () => {
  const fakeImg = Buffer.alloc(1200, 0xef);
  geminiService.generateAnswerWithAction = async () => ({
    action: { type: 'GENERATE_IMAGE', imagePrompt: 'cute dog', text: 'Đang vẽ nè' }
  });
  global.fetch = async () => ({
    ok: true,
    headers: new Headers({ 'content-type': 'image/png' }),
    arrayBuffer: async () => fakeImg
  });
  bot.sendPhotoBuffer = async () => ({ ok: false, description: 'multipart unsupported' });

  let sentHostedUrl = null;
  bot.sendPhoto = async (_chatId, url) => {
    sentHostedUrl = url;
    return { ok: true };
  };

  const res = mockResponse();
  await webhook(drawWebhookReq('draw-hosted-1', 'vẽ chú chó dễ thương'), res);
  assert.equal(res.code, 200);
  assert.equal(res.body.deliveryMethod, 'hosted');
  assert.match(sentHostedUrl, /^https:\/\/bot-chat-zalo-one\.vercel\.app\/api\/image\?id=art_.*\.png$/);
});
