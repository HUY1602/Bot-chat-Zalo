/**
 * Bot Management & Webhook Setup Endpoint
 * Endpoint: POST /api/setup
 * Actions: 'get_bot_info', 'set_webhook', 'test_webhook', 'check_env'
 */

const botService = require('../lib/bot-service');
const geminiService = require('../lib/gemini-service');
const memoryService = require('../lib/memory-service');
const avatarService = require('../lib/avatar-service');
const reminderService = require('../lib/reminder-service');
const searchService = require('../lib/search-service');

const { requireAdmin } = require('../lib/auth');

module.exports = async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method === 'GET' && req.query?.login === '1') {
    res.setHeader('Location', '/');
    return res.status(303).end();
  }
  if (req.method === 'GET') {
    const memStatus = memoryService.getMemoryStatus();
    const avatarDetails = await avatarService.getAvatarSourceDetails(req);
    const localFiles = avatarService.getLocalAvatarFiles();
    const localFile = localFiles.length > 0 ? localFiles[0] : null;
    const hasCustomAvatar = Boolean(process.env.BOT_AVATAR_URL || process.env.GOOGLE_DRIVE_FOLDER_ID || localFiles.length > 0);
    const hasFreeModelKey = Boolean(process.env.FREEMODEL_API_KEY);
    const hasSerpApiKey = Boolean((process.env.SERPAPI_API_KEY || process.env.SERP_API_KEY || process.env.serpapi_api_key || '').trim());
    const hasTavilyKey = Boolean((process.env.TAVILY_API_KEY || process.env.tavily_api_key || '').trim());
    const hasSerperKey = Boolean((process.env.SERPER_API_KEY || process.env.serper_api_key || '').trim());
    const freeModel = process.env.FREEMODEL_MODEL || 'gpt-6-luna';
    const geminiModel = process.env.GEMINI_MODEL || geminiService.DEFAULT_MODEL;
    const defaultWeatherCity = process.env.DEFAULT_WEATHER_CITY || 'hanoi';

    return res.status(200).json({
      ok: true,
      env: {
        hasZaloToken: Boolean(process.env.ZALO_BOT_TOKEN),
        hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
        hasFreeModelKey,
        hasSerpApiKey,
        hasTavilyKey,
        hasSerperKey,
        searchProvider: [
          hasTavilyKey ? 'Tavily' : null,
          hasSerperKey ? 'Serper Google' : null,
          hasSerpApiKey ? 'Google (SerpAPI)' : null,
          process.env.GEMINI_API_KEY && process.env.GEMINI_SEARCH_ENABLED !== 'false' ? 'Gemini Google Search' : null,
          'Bing News RSS + Google News RSS + Wikipedia + DuckDuckGo'
        ].filter(Boolean).join(' → '),
        freeModel,
        hasWebhookSecret: Boolean(process.env.WEBHOOK_SECRET),
        hasUpstashRedis: memStatus.isUpstash,
        memoryProvider: memStatus.provider,
        defaultWeatherCity,
        morningDigestWindow: '07:30–07:44 GMT+7',
        geminiModel,
        preferredModel: hasFreeModelKey ? `FreeModel · ${freeModel}` : `Gemini · ${geminiModel}`,
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
        const effectiveSecret = process.env.WEBHOOK_SECRET;
        if (!effectiveSecret || (secretToken && secretToken !== effectiveSecret)) {
          return res.status(400).json({ ok: false, error: 'Cấu hình WEBHOOK_SECRET trên máy chủ; nếu nhập secret, giá trị phải trùng cấu hình.' });
        }
        let target;
        try { target = new URL(webhookUrl); } catch {
          return res.status(400).json({ ok: false, error: 'Webhook URL không hợp lệ.' });
        }
        if (target.protocol !== 'https:' || target.username || target.password) {
          return res.status(400).json({ ok: false, error: 'Webhook phải dùng HTTPS và không chứa thông tin đăng nhập.' });
        }
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

      case 'test_search': {
        const query = typeof testPrompt === 'string' && testPrompt.trim()
          ? testPrompt.trim().slice(0, 600) : 'hội nghị thượng đỉnh APEC 2026 diễn ra ở đâu';
        const search = await searchService.searchWebDetailed(query);
        return res.status(200).json({ ok: search.status === 'ok', search });
      }

      default:
        return res.status(400).json({ ok: false, error: `Hành động '${action}' không hợp lệ` });
    }
  } catch (err) {
    console.error(`Lỗi trong /api/setup [${action}]:`, err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
