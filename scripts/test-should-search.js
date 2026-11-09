const { shouldSearchWeb } = require('../lib/');

const cases = [
  // Should be TRUE (cần tìm kiếm)
  { q: 'Messi mới nhất', expect: true },
  { q: 'Ronaldo mới nhất', expect: true },
  { q: 'tin tức Ronaldo mới nhất', expect: true },
  { q: 'CR7 chia tay', expect: true },
  { q: 'CR7 chia tay đội tuyển', expect: true },
  { q: 'chia tay đội tuyển', expect: true },
  { q: 'thông tin mới nhất về CR7', expect: true },
  { q: 'CR7 rời đội tuyển', expect: true },
  { q: 'Arsenal thắng mấy bàn hôm qua', expect: true },
  { q: 'kq bong da hom qua', expect: true },
  { q: 'bong da tin moi nhat', expect: true },
  { q: 'Ronaldo ký hợp đồng mới chưa', expect: true },
  { q: 'Messi chuyển sang đội nào', expect: true },
  { q: 'Mbappe bị chấn thương không', expect: true },
  { q: 'Man City vô địch Champions League chưa', expect: true },
  { q: 'tỷ giá usd hôm nay', expect: true },
  { q: 'giá vàng hôm nay', expect: true },
  { q: 'giá xăng mới nhất', expect: true },
  { q: 'thời tiết Hà Nội hôm nay', expect: true },
  { q: 'bão số 3 mới nhất', expect: true },

  // Should be FALSE (không cần tìm kiếm)
  { q: 'chào em', expect: false },
  { q: 'cảm ơn em nha', expect: false },
  { q: 'em tên gì', expect: false },
  { q: 'em khỏe không', expect: false },
  { q: 'vẽ tranh phong cảnh', expect: false },
  { q: 'viết thơ cho anh đi', expect: false },
  { q: 'dịch sang tiếng anh', expect: false },
  { q: '1 + 1 bằng mấy', expect: false },
  { q: '/ping', expect: false },
  { q: '/reminders', expect: false },
  { q: 'nhắc anh 10 phút nữa uống nước', expect: false },
  { q: 'anh buồn quá em ơi', expect: false },
  { q: 'cho xem ảnh em', expect: false },
];

let pass = 0, fail = 0;
for (const { q, expect } of cases) {
  const got = shouldSearchWeb(q);
  const ok = got === expect;
  if (ok) {
    console.log(`✅ "${q}" -> ${got}`);
    pass++;
  } else {
    console.error(`❌ "${q}" -> got ${got}, expected ${expect}`);
    fail++;
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
