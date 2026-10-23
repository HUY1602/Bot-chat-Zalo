/**
 * CLI Script: Test Bot and Gemini configuration
 * Usage:
 *   node scripts/test-bot.js
 */

require('dotenv').config();
const { getBotInfo, testWebhook } = require('../api/bot-service');
const { generateAnswer, DEFAULT_MODEL } = require('../api/gemini-service');

async function testAll() {
  console.log('==================================================');
  console.log('🤖 KIỂM TRA HỆ THỐNG ZALO BOT & GEMINI AI 🤖');
  console.log('==================================================\n');

  // 1. Kiểm tra biến môi trường
  console.log('1️⃣ Kiểm tra biến môi trường:');
  console.log(` - ZALO_BOT_TOKEN: ${process.env.ZALO_BOT_TOKEN ? '✅ Đã cấu hình' : '❌ Chưa có'}`);
  console.log(` - GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✅ Đã cấu hình' : '❌ Chưa có'}`);
  console.log(` - GEMINI_MODEL:   ${process.env.GEMINI_MODEL || DEFAULT_MODEL}`);
  console.log(` - WEBHOOK_SECRET: ${process.env.WEBHOOK_SECRET ? '✅ Đã cấu hình' : '⚪ Không bắt buộc'}\n`);

  // 2. Kiểm tra Zalo Bot Platform
  if (process.env.ZALO_BOT_TOKEN) {
    console.log('2️⃣ Kiểm tra kết nối Zalo Bot Platform:');
    try {
      const info = await getBotInfo();
      console.log(' ✅ Lấy thông tin Bot thành công:');
      console.log(JSON.stringify(info, null, 2));

      console.log('\n 📡 Kiểm tra trạng thái Webhook:');
      const testWh = await testWebhook();
      console.log(JSON.stringify(testWh, null, 2));
    } catch (err) {
      console.error(' ❌ Kết nối Zalo Bot thất bại:', err.message);
    }
  } else {
    console.log('2️⃣ Bỏ qua kiểm tra Zalo Bot vì chưa điền ZALO_BOT_TOKEN vào .env');
  }

  console.log('\n--------------------------------------------------');

  // 3. Kiểm tra Gemini API
  if (process.env.GEMINI_API_KEY) {
    console.log('3️⃣ Kiểm tra phản hồi từ Google Gemini AI:');
    try {
      const testPrompt = 'Chào bạn! Hãy giới thiệu bạn là ai và sẵn sàng hỗ trợ nhóm Zalo trong 2 câu ngắn.';
      console.log(` 💬 Câu hỏi test: "${testPrompt}"`);
      const startTime = Date.now();
      const reply = await generateAnswer(testPrompt);
      const timeMs = Date.now() - startTime;

      console.log(` ✅ Phản hồi từ Gemini (${timeMs}ms):`);
      console.log(reply);
    } catch (err) {
      console.error(' ❌ Gọi Gemini API thất bại:', err.message);
    }
  } else {
    console.log('3️⃣ Bỏ qua kiểm tra Gemini vì chưa điền GEMINI_API_KEY vào .env');
  }

  console.log('\n==================================================');
  console.log('🎉 Hoàn tất kiểm tra!');
  console.log('==================================================');
}

testAll();
