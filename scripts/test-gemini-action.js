require('dotenv').config();
const { generateAnswerWithAction } = require('../lib/');

async function run() {
  const r1 = await generateAnswerWithAction('ảnh', { senderName: 'Mai Quang Huy' });
  console.log('Result for "ảnh":', JSON.stringify(r1, null, 2));

  const r2 = await generateAnswerWithAction('đâu', {
    senderName: 'Mai Quang Huy',
    history: [
      { role: 'user', parts: [{ text: '[Mai Quang Huy]: ảnh' }] },
      { role: 'model', parts: [{ text: r1.rawText }] }
    ]
  });
  console.log('Result for "đâu":', JSON.stringify(r2, null, 2));
}

run().catch(console.error);

