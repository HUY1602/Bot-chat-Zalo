const assert = require('node:assert/strict');
const { test } = require('node:test');
const searchService = require('../lib/search-service');
const { generateAnswer, generateAnswerWithAction } = require('../lib/gemini-service');

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

test('conversation style rules reach all providers without deleting meaningful dates', async t => {
  await t.test('ordinary questions have no current timestamp and do not inherit historical signoffs as instructions', async () => {
    const history = [
      { role: 'user', parts: [{ text: '[Huy]: chào em' }] },
      { role: 'model', parts: [{ text: 'Dạ em chào anh. Hôm nay là thứ 6 ngày 20/11, anh cần gì cứ báo em nhá.' }] }
    ];
    const savedHistory = structuredClone(history);
    const prompt = '[Mai]: 1 kg bằng bao nhiêu gam?';
    await withGeminiResponses([geminiResponse(['1 kg bằng 1.000 gam ạ.'])], async requests => {
      assert.equal(await generateAnswer(prompt, { apiKey: 'test', model: 'test', history }), '1 kg bằng 1.000 gam ạ.');
      const body = requests[0].body;
      const instruction = body.systemInstruction.parts[0].text;
      assert.match(instruction, /Không tự thêm ngày, tháng, thứ hoặc giờ hiện tại/);
      assert.match(instruction, /Không bắt chước câu kết/);
      assert.doesNotMatch(instruction, /NGỮ CẢNH THỜI GIAN NỘI BỘ:/);
      assert.equal(body.contents.at(-1).parts[0].text, prompt);
      assert.deepEqual(history, savedHistory);
    });
  });

  await t.test('FreeModel custom environment persona still receives shared style rules', async () => {
    const previousInstruction = process.env.SYSTEM_INSTRUCTION;
    process.env.SYSTEM_INSTRUCTION = 'Bạn là trợ lý của nhóm dự án.';
    try {
      await withFreeModelResponses([freeModelResponse('Em nghe đây ạ.')], async requests => {
        await generateAnswer('[Huy]: chào em');
        const instruction = requests[0].body.messages[0].content;
        assert.ok(instruction.startsWith(process.env.SYSTEM_INSTRUCTION));
        assert.match(instruction, /Không tự thêm lời mời hỗ trợ/);
        assert.doesNotMatch(instruction, /NGỮ CẢNH THỜI GIAN NỘI BỘ:/);
      });
    } finally {
      if (previousInstruction === undefined) delete process.env.SYSTEM_INSTRUCTION;
      else process.env.SYSTEM_INSTRUCTION = previousInstruction;
    }
  });

  await t.test('date questions and relative follow-ups still receive Vietnam time context', async () => {
    for (const prompt of ['[Huy]: Hôm nay ngày mấy?', '[Huy]: Thế ngày mai là thứ mấy?']) {
      await withGeminiResponses([geminiResponse(['Hôm nay là thứ Sáu, ngày 20/11/2026.'])], async requests => {
        const answer = await generateAnswer(prompt, { apiKey: 'test', model: 'test' });
        assert.match(answer, /20\/11\/2026/);
        assert.match(requests[0].body.systemInstruction.parts[0].text, /NGỮ CẢNH THỜI GIAN NỘI BỘ:.*GMT\+7/);
        assert.equal(requests[0].body.contents.at(-1).parts[0].text, prompt);
      });
    }
  });

  await t.test('requested quotations and factual dates are preserved verbatim', async () => {
    for (const [prompt, content] of [
      ['Viết nguyên văn: Hôm nay là thứ 6 ngày 20/11, anh cần gì cứ báo em nhá.', 'Hôm nay là thứ 6 ngày 20/11, anh cần gì cứ báo em nhá.'],
      ['Tóm tắt thời gian diễn ra sự kiện trong tài liệu.', 'Sự kiện diễn ra ngày 20/11/2026, lúc 08:00.']
    ]) {
      await withGeminiResponses([geminiResponse([content])], async requests => {
        assert.equal(await generateAnswer(prompt, { apiKey: 'test', model: 'test', systemInstruction: 'Giữ nguyên các dữ kiện và nội dung trích dẫn.' }), content);
        assert.match(requests[0].body.systemInstruction.parts[0].text, /không được sửa hoặc bỏ nội dung người dùng yêu cầu viết, dịch hay trích dẫn/);
      });
    }
  });

  await t.test('provider fallback keeps the same style instructions', async () => {
    await withFreeModelResponses([
      { ok: false, status: 429, body: { error: { message: 'rate limit' } } },
      geminiResponse(['Dạ, 1 kg bằng 1.000 gam.'])
    ], async requests => {
      await generateAnswer('1 kg bằng bao nhiêu gam?', { model: 'test-fallback' });
      assert.equal(requests.length, 2);
      assert.equal(requests[0].body.messages[0].content, requests[1].body.systemInstruction.parts[0].text);
      assert.match(requests[1].body.systemInstruction.parts[0].text, /dừng khi đã đủ ý/);
    });
  });
});

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

  test('model and search actions', async t => {
    await t.test('answers model identity consistently without calling a model', async () => {
      await withFreeModelResponses([], async requests => {
        const { action } = await generateAnswerWithAction('Bạn đang gọi model gì?', {
          model: 'test-gemini-fallback'
        });
        assert.match(action.text, /FreeModel với model test-free-model/);
        assert.match(action.text, /Gemini model test-gemini-fallback/);
        assert.equal(requests.length, 0);
      });
    });

    await t.test('searches current questions before generation and synthesizes with source links', async () => {
      const originalSearchWeb = searchService.searchWebDetailed;
      let searchedQuery = '';
      searchService.searchWebDetailed = async query => {
        searchedQuery = query;
        return { status: 'ok', provider: 'Google', query, attempts: [], durationMs: 1, results: [{ title: 'UEFA Nations League', snippet: 'Đội A 2-1 Đội B', url: 'https://example.test/match' }] };
      };

      try {
        await withFreeModelResponses([
          freeModelResponse('Đội A 2-1 Đội B.')
        ], async requests => {
          const { action } = await generateAnswerWithAction('Cập nhật kết quả Nation League', {});
          assert.equal(action.type, 'CHAT');
          assert.match(action.text, /Đội A 2-1 Đội B/);
          assert.doesNotMatch(action.text, /ACTION:SEARCH_WEB/);
          assert.equal(searchedQuery, 'Cập nhật kết quả Nation League');
          assert.equal(requests.length, 1);
        });
      } finally {
        searchService.searchWebDetailed = originalSearchWeb;
      }
    });

    await t.test('does not fabricate results when SEARCH_WEB finds no sources', async () => {
      const originalSearchWeb = searchService.searchWebDetailed;
      searchService.searchWebDetailed = async () => ({ status: 'empty', provider: '', results: [], attempts: [], durationMs: 1 });

      try {
        await withFreeModelResponses([
          freeModelResponse('Em sẽ tìm [[ACTION:SEARCH_WEB: kết quả trận đêm qua]]')
        ], async () => {
          const { action } = await generateAnswerWithAction('Kết quả trận đêm qua', {});
          assert.match(action.text, /chưa tìm được nguồn tin đáng tin cậy/);
        });
      } finally {
        searchService.searchWebDetailed = originalSearchWeb;
      }
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

    await t.test('retries missing punctuation but accepts a complete FreeModel retry', async () => {
      await withFreeModelResponses([
        freeModelResponse('Đây là câu trả lời đã đầy đủ nhưng không có dấu câu'),
        freeModelResponse('Đây là câu trả lời rút gọn nhưng vẫn đầy đủ ý')
      ], async requests => {
        const answer = await generateAnswer('Hỏi thử', { model: 'test-gemini-model' });
        assert.equal(answer, 'Đây là câu trả lời rút gọn nhưng vẫn đầy đủ ý');
        assert.equal(requests.length, 2);
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

test('grounded replies handle the reported APEC question, failures and model-requested search', async t => {
  const originalSearch = searchService.searchWebDetailed;
  const report = {
    status: 'ok', provider: 'Google', query: 'APEC 2026', attempts: [{ provider: 'Google', status: 'ok' }], durationMs: 1,
    results: [{ title: 'APEC 2026 tại Thâm Quyến', snippet: 'Hội nghị tại Thâm Quyến, Trung Quốc, ngày 18–19/11/2026.',
      url: 'https://apec.org/2026', publishedAt: '2026-11-19' }]
  };
  try {
    await t.test('answers APEC directly without leaking internal headers, omits sources by default, and cites sources when requested', async () => {
      searchService.searchWebDetailed = async () => report;
      await withFreeModelResponses([freeModelResponse('DỮ LIỆU THỰC TẾ TRA CỨU TỪ GOOGLE:\nNội dung: Địa điểm tổ chức APEC 2026 là Thâm Quyến, Trung Quốc [1].')], async requests => {
        const result = await generateAnswerWithAction('[Huy]: hội nghị thượng đỉnh APEC 2026 diễn ra ở đâu', { searchQuery: 'hội nghị thượng đỉnh APEC 2026 diễn ra ở đâu', senderName: 'Huy' });
        assert.match(result.action.text, /Thâm Quyến, Trung Quốc/);
        assert.doesNotMatch(result.action.text, /Nguồn:|https:\/\/apec\.org\/2026|\[1\]/);
        assert.doesNotMatch(result.action.text, /DỮ LIỆU THỰC TẾ|Nội dung:/);
        assert.equal(result.search.provider, 'Google');
        assert.equal(requests.length, 1);
        const instruction = requests[0].body.messages[0].content;
        assert.match(instruction, /Hỏi địa điểm|Nếu hỏi địa điểm/);
        assert.match(instruction, /Không tự suy ra đã diễn ra/);
        assert.doesNotMatch(instruction, /Harry Kane|Quả bóng vàng Việt Nam năm 2026/);
      });

      await withFreeModelResponses([freeModelResponse('Địa điểm tổ chức APEC 2026 là Thâm Quyến, Trung Quốc [1].')], async () => {
        const withSrc = await generateAnswerWithAction('[Huy]: hội nghị thượng đỉnh APEC 2026 diễn ra ở đâu, cho xin nguồn', { searchQuery: 'hội nghị thượng đỉnh APEC 2026 diễn ra ở đâu, cho xin nguồn', senderName: 'Huy' });
        assert.match(withSrc.action.text, /Thâm Quyến, Trung Quốc/);
        assert.match(withSrc.action.text, /Nguồn:\nhttps:\/\/apec\.org\/2026/);
      });
    });
    await t.test('empty and unavailable searches return concise distinct messages without asking AI to guess', async () => {
      for (const status of ['empty', 'unavailable']) {
        searchService.searchWebDetailed = async () => ({ ...report, status, results: [] });
        await withFreeModelResponses([], async requests => {
          const result = await generateAnswerWithAction('APEC 2026 diễn ra ở đâu');
          assert.equal(requests.length, 0);
          assert.equal(result.search.status, status);
          assert.match(result.action.text, status === 'empty' ? /chưa tìm được nguồn/ : /dịch vụ tra cứu.*gặp lỗi/i);
        });
      }
    });
    await t.test('model can request a bounded search for a question missed by keyword routing', async () => {
      const searched = [];
      searchService.searchWebDetailed = async query => { searched.push(query); return report; };
      await withFreeModelResponses([
        freeModelResponse('[[ACTION:SEARCH_WEB: APEC 2026 địa điểm]]'),
        freeModelResponse('Địa điểm tổ chức là Thâm Quyến, Trung Quốc.')
      ], async requests => {
        const result = await generateAnswerWithAction('Kể thêm về diễn đàn đó.');
        assert.deepEqual(searched, ['APEC 2026 địa điểm']);
        assert.equal(requests.length, 2);
        assert.equal(result.action.type, 'CHAT');
        assert.doesNotMatch(result.action.text, /ACTION:/);
      });
    });
    await t.test('already-grounded native answer does not spend another AI request and respects source preference', async () => {
      searchService.searchWebDetailed = async () => ({ ...report, provider: 'Gemini Google Search', answer: 'APEC 2026 tổ chức tại Thâm Quyến.' });
      await withFreeModelResponses([], async requests => {
        const result = await generateAnswerWithAction('APEC 2026 diễn ra ở đâu');
        assert.equal(requests.length, 0);
        assert.match(result.action.text, /Thâm Quyến/);
        assert.doesNotMatch(result.action.text, /Nguồn:/);

        const withSrc = await generateAnswerWithAction('APEC 2026 diễn ra ở đâu, trích nguồn');
        assert.match(withSrc.action.text, /Nguồn:\nhttps:\/\/apec\.org\/2026/);
      });
    });
    await t.test('a question about new models is searched rather than mistaken for bot identity', async () => {
      let searched = false;
      searchService.searchWebDetailed = async () => { searched = true; return { ...report, results: [], status: 'empty' }; };
      await withFreeModelResponses([], async requests => {
        const result = await generateAnswerWithAction('Em ơi model Gemini mới nhất là gì?');
        assert.equal(searched, true);
        assert.equal(requests.length, 0);
        assert.match(result.action.text, /chưa tìm được nguồn/);
      });
    });
    await t.test('if AI synthesis fails, actual snippets are still returned and links shown only when requested', async () => {
      searchService.searchWebDetailed = async () => report;
      await withFreeModelResponses(() => ({ ok: false, status: 500, body: { error: { code: 500, message: 'offline' } } }), async () => {
        const result = await generateAnswerWithAction('APEC 2026 diễn ra ở đâu');
        assert.match(result.action.text, /Thâm Quyến/);
        assert.doesNotMatch(result.action.text, /https:\/\/apec\.org\/2026/);
        assert.equal(result.search.status, 'ok');
        assert.doesNotMatch(result.action.text, /ACTION:|DỮ LIỆU THỰC TẾ/);

        const withSrc = await generateAnswerWithAction('APEC 2026 diễn ra ở đâu, xin link nguồn');
        assert.match(withSrc.action.text, /https:\/\/apec\.org\/2026/);
      });
    });
    await t.test('skips unrelated source links when search excerpts do not answer the question', async () => {
      searchService.searchWebDetailed = async () => report;
      await withFreeModelResponses([
        freeModelResponse('Dạ em không tìm thấy thông tin liên quan đến câu hỏi này ạ. [[NO_SOURCES]]')
      ], async () => {
        const result = await generateAnswerWithAction('tra google sếp Quy vừa nói gì');
        assert.doesNotMatch(result.action.text, /Nguồn:|https:\/\/apec\.org|NO_SOURCES/);
        assert.match(result.action.text, /không tìm thấy/);
      });
    });
  } finally { searchService.searchWebDetailed = originalSearch; }
});
