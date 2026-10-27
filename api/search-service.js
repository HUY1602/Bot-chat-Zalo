/**
 * Web Search Service for Zalo Bot
 * Provides 100% free, real-time internet search via DuckDuckGo without any API key or quotas
 */

/**
 * Kiểm tra xem câu hỏi của người dùng có cần tra cứu Internet thời gian thực hay không
 * @param {string} text - Tin nhắn của người dùng
 * @returns {boolean}
 */
function shouldSearchWeb(text) {
  if (!text || typeof text !== 'string') return false;
  const raw = text.trim().toLowerCase();

  // 1. Loại trừ các trường hợp vẽ tranh hoặc xem ảnh hoặc lệnh hệ thống
  if (/^\/(?:draw|image|ve|paint|art|gen|ping|reset|help|clear)\b/i.test(raw)) {
    return false;
  }
  if (/(?:xem|cho|gửi|show|đổi)?\s*(?:mặt|ảnh|hình|avatar|dung nhan)/i.test(raw)) {
    return false;
  }
  if (/^(?:vẽ|tạo\s+ảnh|phác\s+họa|lên\s+hình)\s+/i.test(raw)) {
    return false;
  }

  // 2. Loại trừ chào hỏi, tán gẫu xã giao thông thường
  if (/^(?:chào|hi|hello|ê|alo|bạn\s+là\s+ai|em\s+tên\s+gì|ăn\s+cơm\s+chưa|ngủ\s+chưa|khỏe\s+không)\s*$/i.test(raw)) {
    return false;
  }

  // 3. Các từ khóa chỉ thị rõ ràng cần tìm kiếm / tra cứu
  const searchKeywords = [
    // Lệnh tìm kiếm
    'tìm kiếm', 'tra cứu', 'tra giúp', 'search', 'tra mạng', 'tra google', 'tìm trên mạng',
    // Tin tức & sự kiện thời sự
    'tin tức', 'thời sự', 'bản tin', 'sự kiện', 'scandal', 'bão số', 'thiên tai', 'tai nạn',
    // Giá cả & thị trường
    'giá vàng', 'giá xăng', 'giá dầu', 'tỷ giá', 'chứng khoán', 'cổ phiếu', 'lãi suất', 'bitcoin', 'crypto', 'giá usd',
    // Thời tiết
    'thời tiết', 'nhiệt độ', 'mưa bão', 'dự báo thời tiết',
    // Thể thao
    'kết quả bóng đá', 'bảng xếp hạng', 'tỷ số', 'lịch thi đấu', 'vô địch', 'ngoại hạng anh', 'c1', 'world cup', 'euro',
    // Thời điểm hiện tại / gần đây
    'hôm nay', 'mới nhất', 'hiện nay', 'vừa xong', 'gần đây', 'dạo này', 'năm 2025', 'năm 2026', 'năm 2027', 'tháng này'
  ];

  for (const kw of searchKeywords) {
    if (raw.includes(kw)) {
      return true;
    }
  }

  return false;
}

/**
 * Làm sạch từ khóa tìm kiếm (bỏ các từ gọi bot, xưng hô thừa thãi để kết quả tìm kiếm chuẩn xác hơn)
 * @param {string} text 
 * @returns {string}
 */
function cleanSearchQuery(text) {
  if (!text) return '';
  let q = text.trim();

  // Bỏ các từ gọi bot ở đầu
  q = q.replace(/^(?:bot\s+ơi|em\s+ơi|bọt\s+biển\s+ơi|bạn\s+ơi|ad\s+ơi)\s*/i, '');
  // Bỏ các từ lệnh ở đầu
  q = q.replace(/^(?:tìm\s+kiếm|tra\s+cứu|tra\s+giúp|search|tra|tìm)\s+(?:cho\s+anh|cho\s+em|giúp\s+mình|hộ\s+anh|về)?\s*/i, '');
  // Bỏ các từ hỏi ở cuối
  q = q.replace(/\s+(?:vậy|thế|nào|hả|em|nhé|nha|ạ|với|vậy\s+em|thế\s+em|đi)[\s.?!]*$/i, '');
  q = q.replace(/[\s.?!]+$/, '');

  return q.trim() || text.trim();
}

/**
 * Tìm kiếm Internet qua DuckDuckGo HTML (Miễn phí 100%, không cần API key)
 * @param {string} query - Nội dung cần tìm kiếm
 * @param {number} [maxResults=4] - Số kết quả tối đa
 * @returns {Promise<Array<{ title: string, snippet: string }>>}
 */
async function searchWeb(query, maxResults = 4) {
  const cleanQ = cleanSearchQuery(query);
  if (!cleanQ) return [];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000); // 6s timeout

    const res = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(cleanQ), {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi,en;q=0.9'
      },
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[SearchService] DuckDuckGo phản hồi status ${res.status}`);
      return [];
    }

    const html = await res.text();
    const results = [];
    const blocks = html.split(/class=['"]result results_links/i).slice(1);

    for (const block of blocks) {
      if (results.length >= maxResults) break;

      const titleMatch = block.match(/<a[^>]*class=['"]result__a['"][^>]*>([\s\S]*?)<\/a>/i);
      const snippetMatch = block.match(/<a[^>]*class=['"]result__snippet['"][^>]*>([\s\S]*?)<\/a>/i);

      if (snippetMatch) {
        const cleanTitle = titleMatch
          ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/&[a-z0-9#]+;/gi, ' ').replace(/\s+/g, ' ').trim()
          : '';
        const cleanSnippet = snippetMatch[1]
          .replace(/<[^>]+>/g, '')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\s+/g, ' ')
          .trim();

        if (cleanSnippet) {
          results.push({
            title: cleanTitle,
            snippet: cleanSnippet
          });
        }
      }
    }

    return results;
  } catch (err) {
    console.warn('[SearchService] Lỗi khi tra cứu web:', err.message);
    return [];
  }
}

/**
 * Định dạng kết quả tìm kiếm thành context để nạp vào prompt cho Gemini
 * @param {Array<{ title: string, snippet: string }>} results 
 * @returns {string}
 */
function buildSearchContext(results) {
  if (!results || !Array.isArray(results) || results.length === 0) {
    return '';
  }

  const items = results.map((r, i) => {
    const titlePart = r.title ? `(${r.title}) ` : '';
    return `• Nguồn ${i + 1} ${titlePart}: ${r.snippet}`;
  }).join('\n');

  return `\n\n[DỮ LIỆU TÌM KIẾM THỜI GIAN THỰC TỪ INTERNET]:\n${items}\n(Hãy ưu tiên sử dụng thông tin mới nhất ở trên để trả lời ngắn gọn, chuẩn xác và dễ thương cho người dùng)`;
}

module.exports = {
  shouldSearchWeb,
  cleanSearchQuery,
  searchWeb,
  buildSearchContext
};
