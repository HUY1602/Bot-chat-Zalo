/**
 * Memory Inspector Endpoint
 * Endpoint: GET /api/memory
 * Allows users to view live conversation memory stored in Upstash Redis or In-Memory RAM
 */

const memoryService = require('./memory-service');

module.exports = async function handler(req, res) {
  // Allow clearing memory via POST or DELETE: /api/memory?chatId=xxx
  if (req.method === 'POST' || req.method === 'DELETE') {
    const chatId = req.query?.chatId || req.body?.chatId;
    if (!chatId) {
      return res.status(400).json({ ok: false, error: 'Vui lòng cung cấp chatId' });
    }
    await memoryService.clearHistory(chatId);
    return res.status(200).json({ ok: true, message: `Đã xóa bộ nhớ của chat ${chatId}` });
  }

  // GET: Return all active chat memories
  try {
    const status = memoryService.getMemoryStatus();
    const chats = await memoryService.getAllChats();

    // If request asks for JSON explicitly, return JSON
    const acceptHeader = req.headers['accept'] || '';
    if (req.query?.format === 'json' || acceptHeader.includes('application/json')) {
      return res.status(200).json({
        ok: true,
        status,
        totalActiveChats: chats.length,
        chats
      });
    }

    // Otherwise render a sleek visual HTML page
    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zalo Bot • Trình Xem Bộ Nhớ Hội Thoại</title>
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: rgba(22, 27, 46, 0.75);
      --border: rgba(255, 255, 255, 0.08);
      --primary: #0084ff;
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --user-msg: rgba(0, 132, 255, 0.12);
      --bot-msg: rgba(255, 255, 255, 0.05);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 24px 16px;
      line-height: 1.5;
    }
    .container { max-width: 860px; margin: 0 auto; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }
    h1 { font-size: 22px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
    .badge {
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 999px;
      background: ${status.isUpstash ? 'rgba(16, 185, 129, 0.15)' : 'rgba(234, 179, 8, 0.15)'};
      color: ${status.isUpstash ? '#34d399' : '#facc15'};
      border: 1px solid ${status.isUpstash ? 'rgba(16, 185, 129, 0.3)' : 'rgba(234, 179, 8, 0.3)'};
    }
    .btn-refresh {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text);
      border: 1px solid var(--border);
      padding: 6px 14px;
      border-radius: 8px;
      cursor: pointer;
      text-decoration: none;
      font-size: 13px;
    }
    .chat-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      margin-bottom: 20px;
      overflow: hidden;
    }
    .card-top {
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.03);
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
    }
    .chat-id { font-family: monospace; font-weight: 600; color: #60a5fa; }
    .ttl { color: var(--text-muted); font-size: 12px; }
    .msg-list { padding: 16px; display: flex; flex-direction: column; gap: 10px; }
    .msg-item {
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 14px;
      max-width: 90%;
    }
    .msg-user {
      align-self: flex-start;
      background: var(--user-msg);
      border: 1px solid rgba(0, 132, 255, 0.2);
    }
    .msg-model {
      align-self: flex-start;
      background: var(--bot-msg);
      border: 1px solid var(--border);
    }
    .msg-role {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      margin-bottom: 4px;
      color: var(--text-muted);
    }
    .empty-box {
      text-align: center;
      padding: 48px 16px;
      color: var(--text-muted);
      background: var(--card-bg);
      border-radius: 12px;
      border: 1px dashed var(--border);
    }
    .json-link {
      margin-top: 24px;
      text-align: center;
      font-size: 13px;
    }
    .json-link a { color: #60a5fa; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>🫧 Bộ Nhớ Hội Thoại Bot Zalo</h1>
        <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">
          Nơi lưu trữ: <span class="badge">${status.provider}</span>
        </div>
      </div>
      <div>
        <a href="/api/memory" class="btn-refresh">Làm mới ↻</a>
      </div>
    </div>

    ${chats.length === 0 ? `
      <div class="empty-box">
        <h3>Chưa có dữ liệu hội thoại nào trong bộ nhớ</h3>
        <p style="margin-top: 8px; font-size: 13px;">Hãy vào Zalo nhắn tin với bot, các câu trò chuyện sẽ tự động được lưu và hiển thị tại đây!</p>
      </div>
    ` : chats.map(c => `
      <div class="chat-card">
        <div class="card-top">
          <div>
            Chat ID: <span class="chat-id">${c.chatId}</span>
          </div>
          <div class="ttl">
            ${c.messageCount} tin nhắn • Hết hạn sau ${Math.round(c.ttlSeconds / 60)} phút
          </div>
        </div>
        <div class="msg-list">
          ${c.messages.map(m => `
            <div class="msg-item ${m.role === 'user' ? 'msg-user' : 'msg-model'}">
              <div class="msg-role">${m.role === 'user' ? '👤 Người Dùng' : '🫧 Bọt Biển Cute'}</div>
              <div>${(m.parts?.[0]?.text || '').replace(/\n/g, '<br>')}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}

    <div class="json-link">
      <a href="/api/memory?format=json" target="_blank">🔗 Xem dưới dạng JSON thô</a>
    </div>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (err) {
    console.error('Lỗi khi lấy dữ liệu memory:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
