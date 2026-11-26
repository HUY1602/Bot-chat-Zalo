const assert = require('node:assert/strict');
const { test, beforeEach, afterEach } = require('node:test');
const search = require('../lib/search-service');
let originalEnv, originalFetch;
beforeEach(() => {
  originalEnv = { ...process.env }; originalFetch = global.fetch;
  for (const name of ['TAVILY_API_KEY', 'SERPER_API_KEY', 'SERPAPI_API_KEY', 'SERP_API_KEY', 'GEMINI_API_KEY']) delete process.env[name];
  global.fetch = async () => { throw new Error('Unexpected network request'); };
});
afterEach(() => { process.env = originalEnv; global.fetch = originalFetch; });
const json = body => ({ ok: true, json: async () => body });
const ddg = '<div class="result results_links"><a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fnews.test%2Fapec" class="result__a">APEC cập nhật</a><div class="result__snippet">Hội nghị APEC tổ chức tại Thâm Quyến &amp; có thông tin mới.</div></div>';

test('new information is searched even when preceded by greetings or bot names', () => {
  for (const query of ['hội nghị thượng đỉnh APEC 2026 diễn ra ở đâu', 'Em ơi cập nhật APEC mới nhất', 'Chào em, APEC diễn ra ở đâu?', 'Cảm ơn, cho hỏi CEO công ty XYZ hiện nay là ai?', 'tra cứu thông tin sản phẩm XYZ', 'tổng thống hiện tại là ai', 'nghị định mới có hiệu lực khi nào', 'cập nhật kết quả lượt trận nation league đêm qua', 'tất cả các trận diễn ra đêm qua', 'Tình hình dự án XYZ hôm nay ra sao?', 'Có cập nhật mới về mẫu điện thoại XYZ không?', 'iPhone mới?', 'tra gg tình hình Mỹ với Iran', 'biết vụ ở đường Nguyễn Văn Tuyết , Hà nội hôm qua không']) assert.equal(search.shouldSearchWeb(query), true, query);
  for (const query of ['Em mới về nhà', 'xin chào', 'cảm ơn em', '/ping', '/repeat daily 08:00 uống nước', '/suanhac remind_1_abc gio 08:00', 'viết cho anh bài thơ', 'em tên gì', 'sếp Quy vừa nói gì', 'anh Huy vừa nhắn gì vậy', 'Em của thầy mới nâng cấp, thông tin hơi bị chuẩn']) assert.equal(search.shouldSearchWeb(query), false, query);
});

test('queries retain the requested subject, expand follow-ups from user history and anchor relative days', () => {
  assert.equal(search.cleanSearchQuery('tra google lại xem ngày 24.11 là ngày gì'), 'ngày 24.11 là ngày gì');
  assert.match(search.cleanSearchQuery('kết quả nation league đêm qua'), /UEFA Nations League/);
  const now = new Date('2026-11-20T03:00:00Z');
  const history = [
    { role: 'user', parts: [{ text: '[Huy]: Hội nghị APEC 2026 diễn ra ở đâu' }] },
    { role: 'model', parts: [{ text: 'Một sự kiện không liên quan do AI bịa ra.' }] },
    { role: 'user', parts: [{ text: '[Lan]: Giá vàng hôm nay' }] }
  ];
  const query = search.buildSearchQuery('Thế còn lịch trình sự kiện đó?', history, 'Huy', now);
  assert.match(query, /APEC 2026/); assert.doesNotMatch(query, /Giá vàng|AI bịa/);
  assert.match(search.buildSearchQuery('kết quả trận đêm qua', [], '', now), /2026-11-19/);
});

test('missing Google key transparently uses fallback rather than failing explicit search', async () => {
  global.fetch = async () => ({ ok: true, text: async () => ddg });
  const report = await search.searchWebDetailed('tra google APEC 2026 ở đâu');
  assert.equal(report.status, 'ok'); assert.equal(report.provider, 'DuckDuckGo');
  assert.deepEqual(report.attempts[0], { provider: 'Google', status: 'missing_key' });
  assert.equal(report.results[0].url, 'https://news.test/apec');
});

test('quota errors fall back and preserve source URLs and decoded snippets', async () => {
  process.env.SERPAPI_API_KEY = 'test-key';
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    return String(url).startsWith('https://serpapi.com/') ? json({ error: 'Searches per month limit reached' }) : { ok: true, text: async () => ddg };
  };
  const report = await search.searchWebDetailed('tra google APEC mới nhất');
  assert.ok(requests.length >= 2);
  assert.equal(new URL(requests[0].url).searchParams.get('tbs'), 'qdr:w');
  assert.ok(requests.every(request => request.options.signal));
  assert.equal(report.results[0].snippet, 'Hội nghị APEC tổ chức tại Thâm Quyến & có thông tin mới.');
  assert.equal(report.attempts[0].status, 'quota');
});

test('official legal sources and article dates are kept, unrelated and duplicate links removed', async () => {
  process.env.SERPAPI_API_KEY = 'test';
  global.fetch = async () => json({ organic_results: [
    { title: 'Nghị định mới của Chính phủ', snippet: 'Nghị định ABC áp dụng từ ngày 20/11/2026.', link: 'https://chinhphu.vn/nghi-dinh-abc', date: 'Nov 19, 2026' },
    { title: 'Nghị định ABC', snippet: 'Nội dung trùng', link: 'https://chinhphu.vn/nghi-dinh-abc?utm_source=feed' },
    { title: 'Kết quả bóng đá', snippet: 'Đội A thắng', link: 'https://sports.test/result' }
  ], ai_overview: { text_blocks: [{ snippet: 'Không có nguồn độc lập' }] } });
  const report = await search.searchWebDetailed('nghị định ABC mới áp dụng khi nào');
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0].publishedAt, 'Nov 19, 2026');
  assert.equal(report.results[0].url, 'https://chinhphu.vn/nghi-dinh-abc');
  assert.equal(report.attempts.length, 1);
});

test('empty Google results retry news once and handle nested articles', async () => {
  process.env.SERPAPI_API_KEY = 'test';
  const engines = [];
  global.fetch = async url => {
    const engine = new URL(url).searchParams.get('engine'); engines.push(engine);
    return engine === 'google' ? json({ organic_results: [] }) : json({ news_results: [{ title: 'APEC', stories: [{ title: 'APEC 2026 tại Thâm Quyến', snippet: 'Hội nghị ngày 18–19/11.', link: 'https://apec.org/2026', iso_date: '2026-11-19T00:00:00Z', source: { name: 'APEC' } }] }] });
  };
  const report = await search.searchWebDetailed('hội nghị APEC 2026 ở đâu');
  assert.deepEqual(engines, ['google', 'google_news']);
  assert.equal(report.provider, 'Google News');
  assert.equal(report.results[0].source, 'APEC');
});

test('blocked fallback and provider outages are distinguished from genuine empty results', async () => {
  process.env.SERPAPI_API_KEY = 'test';
  global.fetch = async url => String(url).startsWith('https://serpapi.com/')
    ? json({ error: 'Searches per month limit reached' })
    : { ok: true, text: async () => '<form class="challenge-form">Bots use DuckDuckGo</form>' };
  const report = await search.searchWebDetailed('APEC ở đâu');
  assert.equal(report.status, 'unavailable');
  assert.equal(report.attempts.at(-1).status, 'blocked');
  assert.match(search.formatSearchFailure(report), /dịch vụ tra cứu.*gặp lỗi/i);
  global.fetch = async () => ({ ok: true, text: async () => '<p>No results</p>' });
  delete process.env.SERPAPI_API_KEY;
  assert.equal((await search.searchWebDetailed('APEC ở đâu')).status, 'empty');
});

test('Gemini native search fallback requires actual grounding sources and supporting text', async () => {
  process.env.GEMINI_API_KEY = 'test-gemini';
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    return json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'APEC 2026 tổ chức tại Thâm Quyến.' }] }, groundingMetadata: {
      groundingChunks: [{ web: { title: 'APEC', uri: 'https://apec.org/2026' } }],
      groundingSupports: [{ segment: { text: 'APEC 2026 tổ chức tại Thâm Quyến.' }, groundingChunkIndices: [0] }]
    } }] });
  };
  const report = await search.searchWebDetailed('hội nghị APEC 2026 diễn ra ở đâu');
  assert.equal(report.provider, 'Gemini Google Search');
  assert.match(report.answer, /Thâm Quyến/);
  assert.deepEqual(JSON.parse(requests[0].options.body).tools, [{ googleSearch: {} }]);
  assert.equal(requests[0].options.headers['x-goog-api-key'], 'test-gemini');
  assert.doesNotMatch(requests[0].url, /test-gemini/);
  assert.equal(report.results[0].url, 'https://apec.org/2026');
});

test('ungrounded native model output is discarded and another provider is tried', async () => {
  process.env.GEMINI_API_KEY = 'test';
  global.fetch = async url => String(url).includes('generativelanguage.googleapis.com')
    ? json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Bịa một câu trả lời.' }] } }] })
    : { ok: true, text: async () => ddg };
  const report = await search.searchWebDetailed('APEC ở đâu');
  assert.equal(report.provider, 'DuckDuckGo');
  assert.equal(report.answer, '');
});

test('context is bounded evidence data, not fixed event claims or executable instructions', () => {
  const context = search.buildSearchContext([{ title: 'APEC 2026', snippet: 'Hội nghị tại Thâm Quyến.', url: 'https://apec.org/2026', publishedAt: '2026-11-19' }]);
  assert.match(context, /search_evidence/); assert.match(context, /Thâm Quyến/);
  assert.match(context, /https:\/\/apec.org\/2026/);
  assert.doesNotMatch(context, /CHÂN LÝ DUY NHẤT|Harry Kane|chưa diễn ra/);
  assert.match(search.buildSearchContext([]), /KHÔNG CÓ KẾT QUẢ/);
  assert.match(search.formatSearchResults([]), /chưa tìm được nguồn tin đáng tin cậy/);
  assert.match(search.appendSources('APEC tại Thâm Quyến.', [{ url: 'https://apec.org/2026' }]), /Nguồn:\nhttps:\/\/apec.org\/2026/);
});

test('Bing News RSS and Google News RSS deliver real-time results even when SerpAPI quota fails and DuckDuckGo is blocked', async () => {
  process.env.SERPAPI_API_KEY = 'test';
  const bingXml = `<rss><channel><item>
    <title>U17 Việt Nam h&#242;a U17 New Zealand 3-3 tại U17 World Cup 2026</title>
    <description>Lượt trận thứ 2 bảng G U17 World Cup 2026, U17 Việt Nam giành 1 điểm quý giá trước New Zealand.</description>
    <link>http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;url=https%3A%2F%2Fvov.vn%2Fu17-vn-nz-2026</link>
    <pubDate>Mon, 23 Nov 2026 17:18:00 GMT</pubDate>
  </item></channel></rss>`;
  global.fetch = async url => {
    const u = String(url);
    if (u.startsWith('https://serpapi.com/')) return json({ error: 'Your account has run out of searches.' });
    if (u.includes('html.duckduckgo.com')) return { ok: true, text: async () => '<form class="challenge-form">Bots use DuckDuckGo</form>' };
    if (u.includes('bing.com/news/search')) return { ok: true, text: async () => bingXml };
    return { ok: true, text: async () => '<rss><channel></channel></rss>' };
  };
  const report = await search.searchWebDetailed('cập nhật kết quả của u17 việt nam tại u17 world cup 2026');
  assert.equal(report.status, 'ok');
  assert.equal(report.provider, 'Bing News');
  assert.equal(report.results[0].url, 'https://vov.vn/u17-vn-nz-2026');
  assert.match(report.results[0].title, /hòa U17 New Zealand 3-3/);
  assert.match(report.results[0].publishedAt, /24\/11\/2026/);
});

test('Tavily and Serper providers work when configured', async () => {
  process.env.TAVILY_API_KEY = 'tvly-test';
  global.fetch = async url => {
    assert.equal(String(url), 'https://api.tavily.com/search');
    return json({ results: [{ title: 'U17 World Cup 2026', content: 'U17 Việt Nam hòa New Zealand 3-3.', url: 'https://vnexpress.net/u17-2026', published_date: '2026-11-24' }] });
  };
  const tavilyReport = await search.searchWebDetailed('kết quả U17 Việt Nam 2026');
  assert.equal(tavilyReport.provider, 'Tavily');
  assert.equal(tavilyReport.results[0].url, 'https://vnexpress.net/u17-2026');

  delete process.env.TAVILY_API_KEY;
  process.env.SERPER_API_KEY = 'serper-test';
  global.fetch = async url => {
    assert.equal(String(url), 'https://google.serper.dev/search');
    return json({ organic: [{ title: 'U17 Việt Nam 2026', snippet: 'U17 Việt Nam đấu U17 Mali lượt cuối.', link: 'https://tuoitre.vn/u17-mali-2026', date: '1 day ago' }] });
  };
  const serperReport = await search.searchWebDetailed('kết quả U17 Việt Nam 2026');
  assert.equal(serperReport.provider, 'Serper Google');
  assert.equal(serperReport.results[0].url, 'https://tuoitre.vn/u17-mali-2026');
});
