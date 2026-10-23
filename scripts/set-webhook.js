/**
 * CLI Script: Set Webhook for Zalo Bot
 * Usage:
 *   node scripts/set-webhook.js https://your-project.vercel.app/api/webhook [optional_secret]
 */

require('dotenv').config();
const { setWebhook, getBotInfo, testWebhook } = require('../api/bot-service');

async function main() {
  const urlArg = process.argv[2];
  const secretArg = process.argv[3] || process.env.WEBHOOK_SECRET;
  const token = process.env.ZALO_BOT_TOKEN;

  if (!token) {
    console.error('❌ Lỗi: Chưa cấu hình ZALO_BOT_TOKEN trong file .env');
    process.exit(1);
  }

  if (!urlArg) {
    console.log('📖 Hướng dẫn sử dụng:');
    console.log('   node scripts/set-webhook.js <URL_WEBHOOK_VERCEL> [SECRET_TOKEN]');
    console.log('Ví dụ:');
    console.log('   node scripts/set-webhook.js https://my-zalo-bot.vercel.app/api/webhook\n');
    process.exit(1);
  }

  console.log(`🤖 Đang kiểm tra thông tin Bot với Token...`);
  try {
    const info = await getBotInfo(token);
    console.log('✅ Thông tin Bot:', JSON.stringify(info, null, 2));
  } catch (e) {
    console.warn('⚠️ Không thể lấy thông tin Bot (vẫn tiếp tục đăng ký Webhook):', e.message);
  }

  console.log(`\n🔗 Đang gửi yêu cầu cài đặt Webhook URL: ${urlArg}...`);
  try {
    const res = await setWebhook(urlArg, secretArg, token);
    console.log('🎉 Kết quả cài đặt Webhook:', JSON.stringify(res, null, 2));

    console.log('\n🔍 Đang chạy kiểm tra webhook (testWebhook)...');
    const testRes = await testWebhook(token);
    console.log('📡 Trạng thái testWebhook:', JSON.stringify(testRes, null, 2));
  } catch (err) {
    console.error('❌ Lỗi cài đặt webhook:', err.message);
    process.exit(1);
  }
}

main();
