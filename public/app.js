/**
 * Dashboard Client Application
 */

document.addEventListener('DOMContentLoaded', () => {
  const webhookUrlInput = document.getElementById('webhook-url');
  const secretTokenInput = document.getElementById('secret-token');
  const btnUseCurrentDomain = document.getElementById('btn-use-current-domain');
  const webhookForm = document.getElementById('webhook-form');
  const btnSetWebhook = document.getElementById('btn-set-webhook');
  const btnTestWebhook = document.getElementById('btn-test-webhook');
  const webhookResult = document.getElementById('webhook-result');

  const systemBadge = document.getElementById('system-badge');
  const systemStatusText = document.getElementById('system-status-text');
  const pulseDot = systemBadge.querySelector('.pulse-dot');
  
  const botProfileBox = document.getElementById('bot-profile-box');
  const profileDetails = document.getElementById('profile-details');
  const btnRefreshInfo = document.getElementById('btn-refresh-info');
  const currentModelTag = document.getElementById('current-model-tag');

  const chatViewport = document.getElementById('chat-viewport');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const btnSendChat = document.getElementById('btn-send-chat');

  // Auto populate webhook URL with current origin
  function fillCurrentOrigin() {
    const origin = window.location.origin;
    if (origin && !origin.includes('file://')) {
      webhookUrlInput.value = `${origin}/api/webhook`;
    }
  }

  fillCurrentOrigin();
  btnUseCurrentDomain.addEventListener('click', fillCurrentOrigin);

  // Fetch initial environment & bot status
  async function loadStatus() {
    try {
      const res = await fetch('/api/setup');
      const data = await res.json();

      if (data.ok && data.env) {
        if (data.env.hasZaloToken && data.env.hasGeminiKey) {
          pulseDot.className = 'pulse-dot online';
          systemStatusText.textContent = 'Hệ Thống Sẵn Sàng 24/7';
        } else {
          pulseDot.className = 'pulse-dot';
          systemStatusText.textContent = 'Cần Cấu Hình Biến Môi Trường';
        }

        if (data.env.geminiModel) {
          currentModelTag.textContent = data.env.geminiModel;
        }

        loadBotInfo(data.env);
      }
    } catch (err) {
      console.warn('Không thể kết nối API setup:', err);
      pulseDot.className = 'pulse-dot error';
      systemStatusText.textContent = 'Ngoại Tuyến / Lỗi';
    }
  }

  // Load Bot Profile from Zalo
  async function loadBotInfo(envInfo = {}) {
    profileDetails.innerHTML = `<div class="loading-spinner-small"></div> Đang tải thông tin bot...`;
    
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_bot_info' })
      });
      const data = await res.json();

      if (data.ok && data.data) {
        const bot = data.data.result || data.data.data || data.data;
        const botName = bot.name || bot.display_name || bot.username || 'Zalo Bot';
        const botId = bot.id || bot.bot_id || 'Chưa định danh';

        profileDetails.innerHTML = `
          <div class="profile-item">
            <span>Tên Bot:</span>
            <span class="val">🤖 ${botName}</span>
          </div>
          <div class="profile-item">
            <span>ID Bot:</span>
            <span class="val">${botId}</span>
          </div>
          <div class="profile-item">
            <span>Zalo Bot Token:</span>
            <span class="val" style="color: #34d399;">✅ Đã kết nối</span>
          </div>
          <div class="profile-item">
            <span>Google Gemini Key:</span>
            <span class="val" style="color: ${envInfo.hasGeminiKey ? '#34d399' : '#f87171'};">
              ${envInfo.hasGeminiKey ? '✅ Đã kích hoạt' : '⚠️ Chưa cấu hình'}
            </span>
          </div>
        `;
      } else {
        profileDetails.innerHTML = `
          <div style="color: #f87171; font-size: 0.88rem;">
            ⚠️ Không thể kết nối Zalo Bot Platform (${data.error || 'Kiểm tra ZALO_BOT_TOKEN'}).
          </div>
        `;
      }
    } catch (err) {
      profileDetails.innerHTML = `
        <div style="color: #f87171; font-size: 0.88rem;">
          ❌ Lỗi: ${err.message}
        </div>
      `;
    }
  }

  btnRefreshInfo.addEventListener('click', () => loadStatus());

  // Handle Set Webhook Form
  webhookForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const webhookUrl = webhookUrlInput.value.trim();
    const secretToken = secretTokenInput.value.trim();

    if (!webhookUrl) return;

    btnSetWebhook.disabled = true;
    btnSetWebhook.innerHTML = `<span class="btn-icon">⏳</span> Đang cài đặt...`;
    webhookResult.className = 'result-box';
    webhookResult.textContent = 'Đang gửi yêu cầu đăng ký setWebhook đến Zalo Platform...';

    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_webhook',
          webhookUrl,
          secretToken: secretToken || undefined
        })
      });
      const data = await res.json();

      if (data.ok && (data.data?.ok !== false)) {
        webhookResult.className = 'result-box success';
        webhookResult.textContent = `🎉 ĐĂNG KÝ WEBHOOK THÀNH CÔNG!\n\nChi tiết phản hồi từ Zalo:\n${JSON.stringify(data.data, null, 2)}\n\n👉 Bây giờ bạn có thể thử nhắn tin cho bot hoặc tag bot trong nhóm Zalo!`;
      } else {
        webhookResult.className = 'result-box error';
        webhookResult.textContent = `❌ ĐĂNG KÝ THẤT BẠI: ${data.error || JSON.stringify(data.data, null, 2)}`;
      }
    } catch (err) {
      webhookResult.className = 'result-box error';
      webhookResult.textContent = `❌ Lỗi mạng: ${err.message}`;
    } finally {
      btnSetWebhook.disabled = false;
      btnSetWebhook.innerHTML = `<span class="btn-icon">🚀</span> Kích Hoạt Webhook Lên Zalo`;
    }
  });

  // Handle Test Webhook
  btnTestWebhook.addEventListener('click', async () => {
    btnTestWebhook.disabled = true;
    btnTestWebhook.innerHTML = `<span class="btn-icon">⏳</span> Đang test...`;
    webhookResult.className = 'result-box';
    webhookResult.textContent = 'Đang gọi testWebhook kiểm tra kết nối từ Zalo...';

    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_webhook' })
      });
      const data = await res.json();

      if (data.ok) {
        webhookResult.className = 'result-box success';
        webhookResult.textContent = `📡 KẾT QUẢ KIỂM TRA WEBHOOK:\n${JSON.stringify(data.data, null, 2)}`;
      } else {
        webhookResult.className = 'result-box error';
        webhookResult.textContent = `⚠️ Kiểm tra thất bại: ${data.error || JSON.stringify(data)}`;
      }
    } catch (err) {
      webhookResult.className = 'result-box error';
      webhookResult.textContent = `❌ Lỗi: ${err.message}`;
    } finally {
      btnTestWebhook.disabled = false;
      btnTestWebhook.innerHTML = `<span class="btn-icon">🔍</span> Kiểm Tra Kết Nối (testWebhook)`;
    }
  });

  // Handle Interactive Chat Simulator
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = chatInput.value.trim();
    if (!query) return;

    // Append User Message
    appendMessage('user', 'Bạn', query);
    chatInput.value = '';

    // Append Typing Indicator
    const typingId = appendTypingIndicator();

    btnSendChat.disabled = true;

    try {
      const res = await fetch('/api/test-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query })
      });
      const data = await res.json();

      removeTypingIndicator(typingId);

      if (data.ok) {
        appendMessage('bot', `Zalo Gemini Bot (${data.durationMs}ms)`, data.answer);
      } else {
        appendMessage('bot', 'Hệ Thống Báo Lỗi', `⚠️ ${data.error || 'Không thể tạo phản hồi từ Gemini'}`);
      }
    } catch (err) {
      removeTypingIndicator(typingId);
      appendMessage('bot', 'Lỗi Kết Nối', `❌ Không thể gọi server: ${err.message}`);
    } finally {
      btnSendChat.disabled = false;
      chatInput.focus();
    }
  });

  function appendMessage(role, author, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${role}-msg`;

    const avatar = role === 'user' ? '👤' : '🤖';

    // Simple markdown renderer for bolding **text**
    const formattedText = escapeHtml(text).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    msgDiv.innerHTML = `
      <div class="msg-avatar">${avatar}</div>
      <div class="msg-bubble">
        <div class="msg-author">${escapeHtml(author)}</div>
        <div class="msg-text">${formattedText}</div>
      </div>
    `;

    chatViewport.appendChild(msgDiv);
    chatViewport.scrollTop = chatViewport.scrollHeight;
  }

  function appendTypingIndicator() {
    const id = 'typing-' + Date.now();
    const msgDiv = document.createElement('div');
    msgDiv.id = id;
    msgDiv.className = 'chat-message bot-msg';
    msgDiv.innerHTML = `
      <div class="msg-avatar">🤖</div>
      <div class="msg-bubble">
        <div class="msg-author">Zalo Gemini Bot</div>
        <div class="msg-text" style="color: #9ca3af; font-style: italic;">Gemini đang suy nghĩ câu trả lời...</div>
      </div>
    `;
    chatViewport.appendChild(msgDiv);
    chatViewport.scrollTop = chatViewport.scrollHeight;
    return id;
  }

  function removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Initial load
  loadStatus();
});

// Helper to copy template
window.copyEnvTemplate = function() {
  const text = `ZALO_BOT_TOKEN=token_bot_cua_ban\nGEMINI_API_KEY=khoa_api_gemini_cua_ban`;
  navigator.clipboard.writeText(text).then(() => {
    alert('Đã copy mẫu biến môi trường vào bộ nhớ tạm!');
  }).catch(() => {
    prompt('Vui lòng copy thủ công:', text);
  });
};
