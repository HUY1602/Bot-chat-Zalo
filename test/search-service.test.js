const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  buildSearchContext,
  cleanSearchQuery,
  formatSearchResults,
  shouldSearchWeb
} = require('../lib/search-service');

test('sports results questions trigger current web search', () => {
  assert.equal(shouldSearchWeb('cập nhật kết quả lượt trận nation league đêm qua'), true);
  assert.equal(shouldSearchWeb('tất cả các trận diễn ra đêm qua'), true);
  assert.match(cleanSearchQuery('kết quả nation league đêm qua'), /UEFA Nations League/i);
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
