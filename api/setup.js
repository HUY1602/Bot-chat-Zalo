/**
 * Bot Management & Webhook Setup Endpoint
 * Endpoint: POST /api/setup
 * Actions: 'get_bot_info', 'set_webhook', 'test_webhook', 'check_env'
 */

const botService = require('./bot-service');
const geminiService = require('./gemini-service');
const memoryService = require('./memory-service');
const avatarService = require('./avatar-service');
const reminderService = require('./reminder-service');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const memStatus = memoryService.getMemoryStatus();
    const avatarDetails = await avatarService.getAvatarSourceDetails(req);
    const localFiles = avatarService.getLocalAvatarFiles();
    const localFile = localFiles.length > 0 ? localFiles[0] : null;
    const hasCustomAvatar = Boolean(process.env.BOT_AVATAR_URL || process.env.GOOGLE_DRIVE_FOLDER_ID || localFiles.length > 0);

    return res.status(200).json({
      ok: true,
      env: {
        hasZaloToken: Boolean(process.env.ZALO_BOT_TOKEN),
        hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
        hasWebhookSecret: Boolean(process.env.WEBHOOK_SECRET),
        hasUpstashRedis: memStatus.isUpstash,
        memoryProvider: memStatus.provider,
        geminiModel: process.env.GEMINI_MODEL || geminiService.DEFAULT_MODEL,
        avatarUrl: avatarDetails.currentSampleUrl,
        avatarSource: avatarDetails.sourceProvider,
        avatarCount: avatarDetails.totalAvatars,
        isRemoteAvatar: avatarDetails.isRemote,
        localAvatarFile: localFile,
        avatarList: avatarDetails.isRemote ? avatarDetails.remoteUrls : localFiles,
        hasCustomAvatar
      }
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { action, webhookUrl, secretToken, token, geminiKey, testPrompt } = req.body || {};

  try {
    switch (action) {
      case 'get_bot_info': {
        const info = await botService.getBotInfo(token);
        return res.status(200).json({ ok: true, data: info });
      }

      case 'set_webhook': {
        if (!webhookUrl) {
          return res.status(400).json({ ok: false, error: 'Thiếu tham số webhookUrl' });
        }
        const effectiveSecret = secretToken || process.env.WEBHOOK_SECRET || '16022004';
        const result = await botService.setWebhook(webhookUrl, effectiveSecret, token);
        return res.status(200).json({ ok: true, data: result });
      }

      case 'test_webhook': {
        const result = await botService.testWebhook(token);
        return res.status(200).json({ ok: true, data: result });
      }

      case 'debug_reminder': {
        const codeSnippet = reminderService.checkAndTriggerReminders.toString();
        const resolveSnippet = reminderService.resolvePerson.toString();
        const testPerson = reminderService.resolvePerson('Mai Quang Huy', 'Mai Quang Huy', 'giải lao');
        return res.status(200).json({
          ok: true,
          testPerson,
          hasResolvePersonInTrigger: codeSnippet.includes('resolvePerson'),
          triggerCode: codeSnippet.slice(codeSnippet.indexOf('triggerMessage'), codeSnippet.indexOf('triggerMessage') + 400),
          resolveCode: resolveSnippet.slice(0, 400)
        });
      }

      case 'send_chat_action': {
        const { chatId: targetChatId, chatAction = 'typing' } = req.body || {};
        if (!targetChatId) {
          return res.status(400).json({ ok: false, error: 'Thiếu tham số chatId' });
        }
        const result = await botService.sendChatAction(targetChatId, chatAction, token);
        return res.status(200).json({ ok: true, data: result });
      }

      case 'test_gemini': {
        const prompt = testPrompt || 'Xin chào! Hãy giới thiệu bạn là ai trong 2 câu ngắn gọn.';
        const answer = await geminiService.generateAnswer(prompt, { apiKey: geminiKey });
        return res.status(200).json({ ok: true, prompt, answer });
      }

      default:
        return res.status(400).json({ ok: false, error: `Hành động '${action}' không hợp lệ` });
    }
  } catch (err) {
    console.error(`Lỗi trong /api/setup [${action}]:`, err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
