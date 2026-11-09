const { shouldSearchWeb } = require('../api/search-service');

// Test cases từ cuộc hội thoại thực tế
const cases = [
  'đã biết tin gì mới về anh 7 chưa',
  'da biet tin gi moi ve anh 7 chua',
  'tin gì mới về CR7',
  'có tin gì mới về Ronaldo không',
  'anh 7 chia tay đội tuyển',
  'anh 7 tin mới',
  'tin tức mới về anh 7',
];

for (const q of cases) {
  console.log(JSON.stringify(q), '->', shouldSearchWeb(q));
}

