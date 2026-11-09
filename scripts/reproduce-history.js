require('dotenv').config();
const { generateAnswerWithAction } = require('../lib/');

async function testWithHistory() {
  const res = await fetch(process.env.UPSTASH_REDIS_REST_URL + '/get/zalo:chat:zgr-9b2c3b8596ea7fb426fb', {
    headers: { Authorization: 'Bearer ' + process.env.UPSTASH_REDIS_REST_TOKEN }
  });
  const data = await res.json();
  const fullHistory = JSON.parse(data.result);

  // History before the "ảnh" message:
  // In the history we printed earlier:
  // ...
  // [Mai Quang Huy]: hình em iu
  // Model: Dạ hình của em đây nè...
  // [Mai Quang Huy]: ảnh
  // Model: ...

  // Find the index of "[Mai Quang Huy]: ảnh"
  const idx = fullHistory.findIndex(m => m.role === 'user' && m.parts[0].text === '[Mai Quang Huy]: ảnh');
  console.log('Index of "ảnh":', idx);

  const historyBeforeAnh = fullHistory.slice(0, idx);
  console.log('Testing with historyBeforeAnh length:', historyBeforeAnh.length);

  const result = await generateAnswerWithAction('[Mai Quang Huy]: ảnh', {
    history: historyBeforeAnh,
    senderName: 'Mai Quang Huy'
  });

  console.log('\n--- RAW GEMINI OUTPUT ---');
  console.log(result.rawAnswer);
  console.log('\n--- PARSED ACTION ---');
  console.log(JSON.stringify(result.action, null, 2));
}

testWithHistory().catch(console.error);

