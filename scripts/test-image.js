require('dotenv').config();
const { isDrawRequest, extractDrawPrompt, enhancePromptWithGemini, buildImageUrl } = require('../api/image-service');

const testCases = [
  // Cần bắt được (true)
  { text: 'vẽ cho anh một chú mèo con', expected: true, prompt: 'chú mèo con' },
  { text: 'vẽ giúp em một bức tranh phong cảnh hồ gươm hà nội', expected: true, prompt: 'phong cảnh hồ gươm hà nội' },
  { text: 'vẽ một con rồng vàng bay lượn trên mây', expected: true, prompt: 'con rồng vàng bay lượn trên mây' },
  { text: 'tạo ảnh phi hành gia trên sao hỏa', expected: true, prompt: 'phi hành gia trên sao hỏa' },
  { text: 'tạo hình chú chó corgi đáng yêu nhé', expected: true, prompt: 'chú chó corgi đáng yêu' },
  { text: '/draw cyberpunk tokyo night in rain', expected: true, prompt: 'cyberpunk tokyo night in rain' },
  { text: 'vẽ tranh anime cô gái cầm ô dưới mưa', expected: true, prompt: 'anime cô gái cầm ô dưới mưa' },
  { text: 'vẽ hoàng hôn trên biển đi', expected: true, prompt: 'hoàng hôn trên biển' },

  // Cần tránh (false)
  { text: 'vẽ đường cho hươu chạy', expected: false },
  { text: 'vẽ biểu đồ tròn trong excel', expected: false },
  { text: 'cách vẽ hình tròn không cần compa', expected: false },
  { text: 'thời tiết hôm nay thế nào', expected: false },
  { text: 'bạn tên gì', expected: false }
];

let failed = 0;
console.log('--- 1. KIỂM TRA NHẬN DIỆN YÊU CẦU VẼ ẢNH ---');
for (const tc of testCases) {
  const isDraw = isDrawRequest(tc.text);
  if (isDraw !== tc.expected) {
    console.error(`❌ FAIL: "${tc.text}" -> got ${isDraw}, expected ${tc.expected}`);
    failed++;
  } else {
    console.log(`✅ PASS: "${tc.text}" -> isDraw: ${isDraw}`);
    if (isDraw && tc.prompt) {
      const extracted = extractDrawPrompt(tc.text);
      console.log(`   📝 Extracted: "${extracted}" (Expected: "${tc.prompt}")`);
    }
  }
}

async function testGeminiEnhance() {
  console.log('\n--- 2. KIỂM TRA TỐI ƯU HÓA PROMPT VỚI GEMINI & TẠO URL ---');
  const sample = 'chú mèo con phi hành gia khám phá vũ trụ';
  try {
    const enhanced = await enhancePromptWithGemini(sample);
    console.log('Original prompt:', sample);
    console.log('Enhanced prompt:', enhanced);

    const imageUrl = buildImageUrl(enhanced);
    console.log('Generated Image URL:', imageUrl);
  } catch (err) {
    console.error('Error enhancing prompt:', err.message);
    failed++;
  }

  if (failed === 0) {
    console.log('\n🎉 Tất cả bài test tạo ảnh AI đều ĐẠT xuất sắc!');
  } else {
    console.log(`\n⚠️ Có ${failed} lỗi xảy ra.`);
    process.exit(1);
  }
}

testGeminiEnhance();
