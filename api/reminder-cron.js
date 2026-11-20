/**
 * Reminder Cron & Management Endpoint
 * Endpoint: /api/reminder-cron
 * 
 * Can be called by:
 * - Vercel Cron (schedule in vercel.json)
 * - External Cron (cron-job.org / UptimeRobot / EasyCron)
 * - Web Dashboard (manual trigger / view upcoming reminders)
 */

const reminderService = require('../lib/reminder-service');
const dailyDigestService = require('../lib/daily-digest-service');
const { requireAdmin, equalSecret } = require('../lib/auth');
const { escapeHtml } = require('../lib/html');

module.exports = async function handler(req, res) {
  const cronRequest = equalSecret(req.headers?.authorization, process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : '');
  if (!cronRequest && !requireAdmin(req, res)) return;
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return res.status(405).json({ ok: false });
  res.setHeader('Cache-Control', 'no-store');

  // 1. DELETE / POST to cancel reminder: ?action=cancel&id=xxx&chatId=yyy
  if (req.method === 'DELETE' || req.query?.action === 'cancel') {
    if (cronRequest) return res.status(403).json({ ok: false, error: 'Admin access required' });
    if (req.method === 'GET') return res.status(405).json({ ok: false, error: 'Use POST or DELETE to cancel' });
    const reminderId = req.query?.id || req.body?.id;
    const chatId = req.query?.chatId || req.body?.chatId;
    if (!chatId || !reminderId) {
      return res.status(400).json({ ok: false, error: 'Thiếu chatId' });
    }
    const result = await reminderService.cancelReminder(chatId, reminderId);
    return res.status(200).json({ ok: true, message: `Đã hủy ${result.count} nhắc việc!`, result });
  }

  // 2. Main Trigger Run (GET or POST)
  try {
    const triggerResult = await reminderService.checkAndTriggerReminders();

    // 2.5 Kích hoạt điểm tin trong khung 7:30–7:44 GMT+7
    const forceDigest = !cronRequest && req.method === 'POST' && (req.body?.triggerDigest === true || req.body?.triggerDigest === 'true');
    let digestResult = null;
    let dailyDigestError = null;
    try {
      digestResult = await dailyDigestService.checkAndTriggerMorningDigest(forceDigest);
    } catch (dErr) {
      console.warn('[Reminder Cron] Lỗi kích hoạt daily digest:', dErr.message);
      dailyDigestError = dErr.message;
    }

    // If client requested JSON explicitly
    const acceptHeader = req.headers['accept'] || '';
    if (req.query?.format === 'json' || acceptHeader.includes('application/json') || req.method === 'POST') {
      return res.status(200).json({
        ok: true,
        service: 'Zalo Bot Reminder Cron',
        timestamp: new Date().toISOString(),
        triggeredCount: triggerResult.triggeredCount,
        failedCount: triggerResult.failedCount || 0,
        triggered: triggerResult.triggered,
        dailyDigest: digestResult,
        dailyDigestError
      });
    }

    // 3. Sleek HTML Inspector for Browser Users
    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zalo Bot • Quản Lý Hẹn Giờ & Nhắc Việc</title>
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: rgba(22, 27, 46, 0.75);
      --border: rgba(255, 255, 255, 0.08);
      --primary: #0084ff;
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --success: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 24px 16px;
      line-height: 1.5;
    }
    .container { max-width: 800px; margin: 0 auto; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }
    h1 { font-size: 20px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
    .badge {
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(16, 185, 129, 0.15);
      color: var(--success);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .btn-action {
      background: var(--primary);
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .status-box {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .tip-box {
      background: rgba(0, 132, 255, 0.08);
      border-left: 4px solid var(--primary);
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 13px;
      color: #93c5fd;
      margin-top: 16px;
    }
    code {
      background: rgba(255, 255, 255, 0.1);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: monospace;
      color: #fca5a5;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⏰ Zalo Bot • Trình Kích Hoạt Nhắc Việc</h1>
      <span class="badge">● Sẵn sàng</span>
    </div>

    <div class="card">
      <div class="status-box">
        <div>
          <h3>Trạng thái kiểm tra định kỳ</h3>
          <p style="color: var(--text-muted); font-size: 14px;">Thời gian vừa quét: ${new Date().toLocaleTimeString('vi-VN')}</p>
        </div>
        <a href="/api/reminder-cron" class="btn-action">🔄 Quét & Kích Hoạt Ngay</a>
      </div>

      <p style="font-size: 14px;">
        Số lượng nhắc việc vừa được kích hoạt: <strong>${triggerResult.triggeredCount}</strong>
      </p>
      <p style="font-size: 14px; margin-top: 8px;">
        Điểm tin sáng (7:30–7:44 GMT+7): <strong>${escapeHtml(dailyDigestError) || (digestResult?.failedCount > 0 ? `Gửi lỗi ${digestResult.failedCount} nhóm; sẽ thử lại.` : (digestResult?.triggeredCount > 0 ? `Đã gửi ${digestResult.triggeredCount} nhóm!` : (digestResult?.reason || 'Chưa đến giờ')))}</strong>
      </p>
      <div style="margin-top: 12px;">
        <form method="post" action="/api/reminder-cron"><input type="hidden" name="triggerDigest" value="true"><button class="btn-action" type="submit">☀️ Thử Gửi Điểm Tin Sáng Ngay</button></form>
      </div>

      <div class="tip-box">
        <strong>💡 Thiết lập Cron tự động 24/7:</strong><br>
        • <strong>GitHub Actions</strong>: Workflow chạy mỗi 5 phút; cần repository secret <code>CRON_SECRET</code> trùng cấu hình máy chủ.<br>
        • <strong>Cron-job.org / Miễn phí</strong>: Đăng ký tại <a href="https://cron-job.org" target="_blank" style="color: #60a5fa;">cron-job.org</a>, tạo job gọi URL <code>https://&lt;domain-cua-ban&gt;/api/reminder-cron</code> với header <code>Authorization: Bearer CRON_SECRET</code>. Độ trễ nhắc việc phụ thuộc chu kỳ và thời điểm cron thực sự chạy.
      </div>
    </div>
  </div>
</body>
</html>`;

    return res.status(200).send(html);
  } catch (err) {
    console.error('Lỗi khi chạy reminder cron:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
