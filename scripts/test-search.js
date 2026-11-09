require('dotenv').config();
const { shouldSearchWeb, searchWeb, buildSearchContext } = require('../lib/');

const testCases = [
  'cr7 chia tay doi tuyen quoc gia',
  'Ronaldo chia tay đội tuyển quốc gia Bồ Đào Nha',
  'CR7 retire international football',
  'Ronaldo thôi không đá đội tuyển nữa',
  'có chuyện gì với Ronaldo và đội tuyển không',
  'Messi mới nhất',
  'trận đấu bóng đá hôm nay',
];

console.log('--- Kiểm tra shouldSearchWeb ---');
for (const q of testCases) {
  console.log(`"${q}" -> ${shouldSearchWeb(q)}`);
}

console.log('\n--- Test SerpApi key ---');
console.log('SERPAPI_API_KEY:', process.env.SERPAPI_API_KEY ? process.env.SERPAPI_API_KEY.slice(0, 15) + '...' : '(NOT SET)');

(async () => {
  console.log('\n--- Test live search: "CR7 chia tay doi tuyen" ---');
  const results = await searchWeb('CR7 chia tay đội tuyển quốc gia');
  console.log('Results count:', results.length);
  for (const r of results) {
    console.log('-', r.title, '|', r.snippet?.slice(0, 100));
  }
})();

