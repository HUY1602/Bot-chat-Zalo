const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  buildSearchContext,
  cleanSearchQuery,
  formatSearchResults,
  searchWeb,
  shouldSearchWeb
} = require('../lib/search-service');

test('sports results questions trigger current web search', () => {
  assert.equal(shouldSearchWeb('cập nhật kết quả lượt trận nation league đêm qua'), true);
  assert.equal(shouldSearchWeb('tất cả các trận diễn ra đêm qua'), true);
  assert.match(cleanSearchQuery('kết quả nation league đêm qua'), /UEFA Nations League/i);
});

test('questions about new or current information trigger web search', () => {
  assert.equal(shouldSearchWeb('Tình hình dự án XYZ hôm nay ra sao?'), true);
  assert.equal(shouldSearchWeb('Có cập nhật mới về mẫu điện thoại XYZ không?'), true);
  assert.equal(shouldSearchWeb('iPhone mới?'), true);
  assert.equal(shouldSearchWeb('Em mới về nhà'), false);
});

test('falls back to DuckDuckGo when SerpApi reports an exhausted quota', async () => {
  const originalApiKey = process.env.SERPAPI_API_KEY;
  const originalFetch = global.fetch;
  const requestedUrls = [];

  process.env.SERPAPI_API_KEY = 'test-serpapi-key';
  global.fetch = async url => {
    requestedUrls.push(String(url));
    if (String(url).startsWith('https://serpapi.com/')) {
      return {
        ok: true,
        json: async () => ({ error: 'Searches per month limit reached' })
      };
    }

    return {
      ok: true,
      text: async () => '<div class="result results_links"><a class="result__a">Tin cập nhật</a><a class="result__snippet">Thông tin mới nhất hôm nay.</a></div>'
    };
  };

  try {
    const results = await searchWeb('tình hình hôm nay');
    assert.equal(requestedUrls.length, 2);
    assert.match(requestedUrls[0], /^https:\/\/serpapi\.com\//);
    assert.match(requestedUrls[1], /^https:\/\/html\.duckduckgo\.com\//);
    assert.equal(results[0].title, 'Tin cập nhật');
    assert.equal(results[0].snippet, 'Thông tin mới nhất hôm nay.');
  } finally {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.SERPAPI_API_KEY;
    } else {
      process.env.SERPAPI_API_KEY = originalApiKey;
    }
  }
});

test('search context prevents fabricated results when no sources were found', () => {
  const context = buildSearchContext([]);
  assert.match(context, /KHÔNG CÓ KẾT QUẢ/);
  assert.match(context, /Không được tự suy đoán tỷ số/);
});

test('search context requires actual match scores instead of generic commentary', () => {
  const context = buildSearchContext([
    { title: 'UEFA Nations League', snippet: 'Đội A 2-1 Đội B' }
  ]);
  assert.match(context, /nêu tên từng trận và tỷ số/);
  assert.match(context, /Đội A 2-1 Đội B/);
});

test('formats search-action results without exposing an action marker', () => {
  const answer = formatSearchResults([
    { title: 'UEFA Nations League', snippet: 'Đội A 2-1 Đội B' }
  ]);
  assert.match(answer, /UEFA Nations League/);
  assert.match(answer, /Đội A 2-1 Đội B/);
  assert.doesNotMatch(answer, /ACTION:SEARCH_WEB/);
});
