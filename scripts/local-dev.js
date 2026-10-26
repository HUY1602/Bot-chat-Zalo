/**
 * Local Development Server
 * Emulates Vercel Serverless Functions locally
 * Usage: npm run dev
 */

require('dotenv').config();
const express = require('express');
const path = require('path');

const webhookHandler = require('../api/webhook');
const setupHandler = require('../api/setup');
const testChatHandler = require('../api/test-chat');
const memoryHandler = require('../api/memory');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static dashboard
app.use(express.static(path.join(__dirname, '../public')));

// Mount API routes exactly matching Vercel Serverless Functions
app.all('/api/webhook', (req, res) => webhookHandler(req, res));
app.all('/api/setup', (req, res) => setupHandler(req, res));
app.all('/api/test-chat', (req, res) => testChatHandler(req, res));
app.all('/api/memory', (req, res) => memoryHandler(req, res));

app.listen(PORT, () => {
  console.log(`\n🚀 Zalo Bot Dev Server đang chạy tại: http://localhost:${PORT}`);
  console.log(`📡 Webhook Endpoint Local:           http://localhost:${PORT}/api/webhook`);
  console.log(`📊 Dashboard Quản Lý:                http://localhost:${PORT}\n`);
  console.log('💡 Gợi ý: Dùng ngrok hoặc cloudflared để mở HTTPS tunnel nếu muốn test webhook trực tiếp từ Zalo:');
  console.log(`   npx ngrok http ${PORT}\n`);
});
