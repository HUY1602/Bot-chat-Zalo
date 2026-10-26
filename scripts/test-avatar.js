const { isBotPhotoRequest, getBotAvatarUrl, getAvatarCaption } = require('../api/avatar-service');

const testCases = [
  // Cần bắt được (true)
  { text: 'cho xem mặt', expected: true },
  { text: 'cho anh xem mặt bot', expected: true },
  { text: 'cho chị xem ảnh em', expected: true },
  { text: 'cho mình xin tấm hình', expected: true },
  { text: 'mặt bot đâu', expected: true },
  { text: 'hình của bot', expected: true },
  { text: 'ảnh bot', expected: true },
  { text: 'dung nhan của em', expected: true },
  { text: 'avatar bot', expected: true },
  { text: 'ảnh đại diện của em', expected: true },
  { text: 'em trông như thế nào', expected: true },
  { text: 'mặt mũi ra sao', expected: true },
  { text: 'xem mặt', expected: true },
  { text: 'gửi ảnh của bạn', expected: true },
  { text: 'cho xin cái ảnh xem nào', expected: true },
  { text: 'cho xem hinh', expected: true },
  { text: 'anh bot dau', expected: true },
  { text: 'selfie phat di', expected: true },
  { text: 'cho xem ảnh', expected: true },
  { text: 'cho xem hình', expected: true },
  { text: 'mặt em thế nào', expected: true },
  { text: 'xem dung nhan', expected: true },
  { text: 'bạn trông thế nào', expected: true },

  // Cần tránh (false)
  { text: 'ảnh hưởng của bão số 3', expected: false },
  { text: 'hình học không gian lớp 12', expected: false },
  { text: 'mặt trời mọc hướng nào', expected: false },
  { text: 'thời tiết hôm nay thế nào', expected: false },
  { text: 'bạn tên gì', expected: false },
  { text: 'mặt trăng cách trái đất bao xa', expected: false },
  { text: 'ảnh chụp màn hình bị lỗi', expected: false },
  { text: 'hôm nay có gì vui không', expected: false }
];

let failed = 0;
console.log('--- KIỂM TRA NHẬN DIỆN YÊU CẦU XEM ẢNH/MẶT BOT ---');
for (const tc of testCases) {
  const result = isBotPhotoRequest(tc.text);
  if (result !== tc.expected) {
    console.error(`❌ FAIL: "${tc.text}" -> got ${result}, expected ${tc.expected}`);
    failed++;
  } else {
    console.log(`✅ PASS: "${tc.text}" -> ${result}`);
  }
}

console.log('\n--- KIỂM TRA AVATAR URL & CAPTION ---');
const url = getBotAvatarUrl();
console.log('Avatar URL mặc định:', url);
const caption = getAvatarCaption('Huy');
console.log('Sample Caption:', caption);

if (failed === 0) {
  console.log(`\n🎉 Tất cả ${testCases.length} trường hợp kiểm tra đều ĐẠT xuất sắc!`);
} else {
  console.log(`\n⚠️ Có ${failed} trường hợp chưa đạt.`);
  process.exit(1);
}
