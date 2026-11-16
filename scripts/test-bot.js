/**
 * CLI Script: Test Bot and AI provider configuration
 * Usage:
 *   node scripts/test-bot.js
 */

require('dotenv').config();
const { getBotInfo, testWebhook } = require('../lib/');
const { generateAnswer, DEFAULT_MODEL } = require('../lib/');

async function testAll() {
  console.log('==================================================');
  console.log('🤖 KIỂM TRA HỆ THỐNG ZALO BOT & AI 🤖');
  console.log('==================================================\n');

  // 1. Kiểm tra biến môi trường
  console.log('1️⃣ Kiểm tra biến môi trường:');
  console.log(` - ZALO_BOT_TOKEN: ${process.env.ZALO_BOT_TOKEN ? '✅ Đã cấu hình' : '❌ Chưa có'}`);
  console.log(` - FREEMODEL_API_KEY: ${process.env.FREEMODEL_API_KEY ? '✅ Đã cấu hình' : '⚪ Chưa có'}`);
  console.log(` - FREEMODEL_MODEL:   ${process.env.FREEMODEL_MODEL || 'gpt-6-luna'}`);
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

  // 3. Kiểm tra nhà cung cấp AI ưu tiên (FreeModel, sau đó Gemini)
  if (process.env.FREEMODEL_API_KEY || process.env.GEMINI_API_KEY) {
    console.log('3️⃣ Kiểm tra phản hồi từ AI (ưu tiên FreeModel, Gemini dự phòng):');
    try {
      const testPrompt = 'Chào bạn! Hãy giới thiệu bạn là ai và sẵn sàng hỗ trợ nhóm Zalo trong 2 câu ngắn.';
      console.log(` 💬 Câu hỏi test: "${testPrompt}"`);
      const startTime = Date.now();
      const reply = await generateAnswer(testPrompt);
      const timeMs = Date.now() - startTime;

      console.log(` ✅ Nhận được phản hồi (${timeMs}ms):`);
      console.log(reply);
    } catch (err) {
      console.error(' ❌ Gọi AI API thất bại:', err.message);
    }
  } else {
    console.log('3️⃣ Bỏ qua kiểm tra AI vì chưa cấu hình FREEMODEL_API_KEY hoặc GEMINI_API_KEY trong .env');
  }

  console.log('\n==================================================');
  console.log('🎉 Hoàn tất kiểm tra!');
  console.log('==================================================');
}

testAll();
