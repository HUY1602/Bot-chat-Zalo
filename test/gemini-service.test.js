const assert = require('node:assert/strict');
const { test } = require('node:test');
const { generateAnswer } = require('../lib/gemini-service');

async function withGeminiResponses(responses, run) {
  const originalFetch = global.fetch;
  const originalFreeModelKey = process.env.FREEMODEL_API_KEY;
  const requests = [];
  delete process.env.FREEMODEL_API_KEY;

  global.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    const response = typeof responses === 'function' ? responses(requests.length) : responses.shift();
    return { ok: true, json: async () => response };
  };

  try {
    return await run(requests);
  } finally {
    global.fetch = originalFetch;
    if (originalFreeModelKey === undefined) {
      delete process.env.FREEMODEL_API_KEY;
    } else {
      process.env.FREEMODEL_API_KEY = originalFreeModelKey;
    }
  }
}

async function withFreeModelResponses(responses, run) {
  const originalFetch = global.fetch;
  const originalEnvironment = {
    apiKey: process.env.FREEMODEL_API_KEY,
    baseUrl: process.env.FREEMODEL_BASE_URL,
    model: process.env.FREEMODEL_MODEL,
    geminiKey: process.env.GEMINI_API_KEY
  };
  const requests = [];
  process.env.FREEMODEL_API_KEY = 'test-free-model-key';
  process.env.FREEMODEL_BASE_URL = 'https://freemodel.test/v1';
  process.env.FREEMODEL_MODEL = 'test-free-model';
  process.env.GEMINI_API_KEY = 'test-gemini-key';

  global.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    const response = typeof responses === 'function' ? responses(url, requests.length) : responses.shift();
    return {
      ok: response.ok !== false,
      status: response.status || 200,
      json: async () => response.body || response
    };
  };

  try {
    return await run(requests);
  } finally {
    global.fetch = originalFetch;
    for (const [name, value] of Object.entries({
      FREEMODEL_API_KEY: originalEnvironment.apiKey,
      FREEMODEL_BASE_URL: originalEnvironment.baseUrl,
      FREEMODEL_MODEL: originalEnvironment.model,
      GEMINI_API_KEY: originalEnvironment.geminiKey
    })) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

function geminiResponse(parts, finishReason = 'STOP') {
  return {
    candidates: [{
      finishReason,
      content: { parts: parts.map(text => ({ text })) }
    }]
  };
}

function freeModelResponse(content, finishReason = 'stop') {
  return {
    choices: [{
      finish_reason: finishReason,
      message: { content }
    }]
  };
}

test('Gemini response handling', async t => {
  await t.test('combines all text parts instead of dropping later parts', async () => {
    await withGeminiResponses([
      geminiResponse(['Dạ anh Huy ơi, sự việc đã được xác nhận', ' và có 6 quân nhân thiệt mạng ạ.'])
    ], async requests => {
      const answer = await generateAnswer('Hỏi về sự việc', { apiKey: 'test-key', model: 'test-model' });
      assert.equal(answer, 'Dạ anh Huy ơi, sự việc đã được xác nhận và có 6 quân nhân thiệt mạng ạ.');
      assert.equal(requests.length, 1);
    });
  });

  test('FreeModel provider priority', async t => {
    await t.test('retries incomplete replies with FreeModel before considering Gemini', async () => {
      await withFreeModelResponses([
        freeModelResponse('Dạ anh Huy ơi, sự việc khiến 6 quân nhân không qua', 'length'),
        freeModelResponse('Dạ, sự việc khiến 6 quân nhân thiệt mạng trong buổi huấn luyện ạ.')
      ], async requests => {
        const answer = await generateAnswer('Hỏi về sự việc', { model: 'test-gemini-model' });
        assert.equal(answer, 'Dạ, sự việc khiến 6 quân nhân thiệt mạng trong buổi huấn luyện ạ.');
        assert.equal(requests.length, 2);
        assert.ok(requests.every(request => request.url.startsWith('https://freemodel.test/')));
        assert.equal(requests[1].body.max_tokens, 1024);
      });
    });

    await t.test('keeps a completed response without punctuation on FreeModel', async () => {
      await withFreeModelResponses([
        freeModelResponse('Đây là câu trả lời đã đầy đủ nhưng không có dấu câu')
      ], async requests => {
        const answer = await generateAnswer('Hỏi thử', { model: 'test-gemini-model' });
        assert.equal(answer, 'Đây là câu trả lời đã đầy đủ nhưng không có dấu câu');
        assert.equal(requests.length, 1);
        assert.ok(requests.every(request => request.url.startsWith('https://freemodel.test/')));
      });
    });

    await t.test('retries an obviously unfinished phrase with FreeModel', async () => {
      await withFreeModelResponses([
        freeModelResponse('Sự việc khiến 6 quân nhân không qua'),
        freeModelResponse('Sự việc khiến 6 quân nhân thiệt mạng ạ.')
      ], async requests => {
        const answer = await generateAnswer('Hỏi thử', { model: 'test-gemini-model' });
        assert.equal(answer, 'Sự việc khiến 6 quân nhân thiệt mạng ạ.');
        assert.equal(requests.length, 2);
        assert.ok(requests.every(request => request.url.startsWith('https://freemodel.test/')));
      });
    });

    await t.test('uses Gemini only after a real FreeModel API error', async () => {
      await withFreeModelResponses([
        { ok: false, status: 429, body: { error: { message: 'rate limit' } } },
        { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Gemini dự phòng trả lời.' }] } }] }
      ], async requests => {
        const answer = await generateAnswer('Hỏi thử', { model: 'test-gemini-model' });
        assert.equal(answer, 'Gemini dự phòng trả lời.');
        assert.equal(requests.length, 2);
        assert.ok(requests[0].url.startsWith('https://freemodel.test/'));
        assert.match(requests[1].url, /generativelanguage\.googleapis\.com/);
      });
    });
  });

  await t.test('retries token-limited output as a concise complete answer', async () => {
    await withGeminiResponses([
      geminiResponse(['Dạ anh Huy ơi, sự việc khiến 6 quân nhân không qua'], 'MAX_TOKENS'),
      geminiResponse(['Dạ, sự việc khiến 6 quân nhân thiệt mạng trong buổi huấn luyện ạ.'])
    ], async requests => {
      const answer = await generateAnswer('Hỏi về sự việc', { apiKey: 'test-key', model: 'test-model' });
      assert.equal(answer, 'Dạ, sự việc khiến 6 quân nhân thiệt mạng trong buổi huấn luyện ạ.');
      assert.equal(requests.length, 2);
      assert.equal(requests[1].body.generationConfig.maxOutputTokens, 1024);
      assert.match(
        requests[1].body.contents.at(-1).parts.at(-1).text,
        /tối đa 1800 ký tự/
      );
    });
  });

  await t.test('summarizes completed output that is longer than a safe Zalo message', async () => {
    await withGeminiResponses([
      geminiResponse([`${'Nội dung dài '.repeat(160)}Kết thúc.`]),
      geminiResponse(['Dạ, đây là bản tóm lược ngắn gọn và đầy đủ ạ.'])
    ], async requests => {
      const answer = await generateAnswer('Tóm tắt nội dung', { apiKey: 'test-key', model: 'test-model' });
      assert.equal(answer, 'Dạ, đây là bản tóm lược ngắn gọn và đầy đủ ạ.');
      assert.equal(requests.length, 2);
    });
  });

  await t.test('never returns output that remains truncated after the compact retry', async () => {
    await withGeminiResponses(
      () => geminiResponse(['Dạ anh Huy ơi, sự việc khiến 6 quân nhân không qua'], 'MAX_TOKENS'),
      async requests => {
        await assert.rejects(
          generateAnswer('Hỏi về sự việc', { apiKey: 'test-key', model: 'test-model' }),
          /MAX_TOKENS/
        );
        assert.ok(requests.length > 2);
      }
    );
  });
});
