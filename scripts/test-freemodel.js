require('dotenv').config();

async function testFreeModel() {
  const apiKey = process.env.FREEMODEL_API_KEY;
  if (!apiKey) {
    throw new Error('FREEMODEL_API_KEY chưa được cấu hình trong môi trường hoặc file .env');
  }

  const baseUrl = (process.env.FREEMODEL_BASE_URL || 'https://freemodel.in/v1').replace(/\/$/, '');
  const model = process.env.FREEMODEL_MODEL || 'gpt-6-luna';
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Trả lời trực tiếp trong một câu: 2 + 2 bằng bao nhiêu?' }],
      temperature: 0,
      max_tokens: 120
    })
  });
  const data = await response.json();

  console.log(`HTTP: ${response.status}`);
  console.log(`Model yêu cầu: ${model}`);
  console.log(`Thời gian: ${Date.now() - startedAt}ms`);

  if (!response.ok || data.error) {
    console.error(`FreeModel API báo lỗi (${data.error?.code || data.error?.type || 'không có mã lỗi'}).`);
    process.exitCode = 1;
    return;
  }

  const choice = data.choices?.[0];
  if (!choice?.message?.content) {
    console.error('FreeModel API không trả về nội dung.');
    process.exitCode = 1;
    return;
  }

  console.log(`Model API trả về: ${data.model || 'không được trả về'}`);
  console.log(`Finish reason: ${choice.finish_reason || 'không được trả về'}`);
  if (data.usage) {
    console.log(`Token sử dụng: prompt=${data.usage.prompt_tokens ?? 'n/a'}, completion=${data.usage.completion_tokens ?? 'n/a'}, total=${data.usage.total_tokens ?? 'n/a'}`);
  }
  console.log('Nội dung:');
  console.log(choice.message.content);
}

testFreeModel().catch(err => {
  console.error('Không thể kiểm tra FreeModel API:', err.message);
  process.exitCode = 1;
});
