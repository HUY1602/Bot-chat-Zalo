const { timingSafeEqual } = require('node:crypto');

function equalSecret(actual, expected) {
  if (typeof actual !== 'string' || !expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function isAdmin(req) {
  const header = req.headers?.authorization || '';
  if (header.startsWith('Bearer ')) return equalSecret(header.slice(7), process.env.ADMIN_SECRET);
  if (!header.startsWith('Basic ')) return false;
  const credentials = Buffer.from(header.slice(6), 'base64').toString('utf8');
  return equalSecret(credentials, process.env.ADMIN_SECRET ? `admin:${process.env.ADMIN_SECRET}` : '');
}

function requireAdmin(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.ADMIN_SECRET) {
    res.status(503).json({ ok: false, error: 'Chưa cấu hình ADMIN_SECRET trên máy chủ.' });
    return false;
  }
  if (isAdmin(req)) {
    // Browser credentials must not authorize cross-site mutations.
    let foreignOrigin = false;
    if (req.headers?.origin) {
      try { foreignOrigin = new URL(req.headers.origin).host !== req.headers.host; }
      catch { foreignOrigin = true; }
    }
    if (foreignOrigin || req.headers?.['sec-fetch-site'] === 'cross-site') {
      res.status(403).json({ ok: false, error: 'Cross-site request denied' });
      return false;
    }
    return true;
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="Zalo Bot Admin", charset="UTF-8"');
  res.status(401).json({ ok: false, error: 'Đăng nhập với tên admin và mật khẩu ADMIN_SECRET.' });
  return false;
}

function requireWebhook(req, res) {
  if (!process.env.WEBHOOK_SECRET) {
    res.status(503).json({ ok: false, error: 'WEBHOOK_SECRET is not configured' });
    return false;
  }
  if (!equalSecret(req.headers?.['x-bot-api-secret-token'], process.env.WEBHOOK_SECRET)) {
    res.status(401).json({ ok: false, error: 'Unauthorized webhook' });
    return false;
  }
  return true;
}

module.exports = { equalSecret, isAdmin, requireAdmin, requireWebhook };
