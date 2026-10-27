/**
 * Web Search Service for Zalo Bot
 * Integrates SerpApi (Google Search Engine) for ultra-accurate, real-time web results
 * with automatic fallback to DuckDuckGo HTML search.
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
    'tìm kiếm', 'tra cứu', 'tra giúp', 'search', 'tra mạng', 'tra google', 'tìm trên mạng', 'cho biết',
    // Tin tức & sự kiện thời sự
    'tin tức', 'thời sự', 'bản tin', 'sự kiện', 'scandal', 'bão số', 'thiên tai', 'tai nạn',
    // Giá cả & thị trường
    'giá vàng', 'giá xăng', 'giá dầu', 'tỷ giá', 'chứng khoán', 'cổ phiếu', 'lãi suất', 'bitcoin', 'crypto', 'giá usd',
    // Thời tiết
    'thời tiết', 'nhiệt độ', 'mưa bão', 'dự báo thời tiết',
    // Thể thao & Trận đấu
    'kết quả', 'trận', 'bóng đá', 'bảng xếp hạng', 'tỷ số', 'lịch thi đấu', 'vô địch', 'el clasico', 'clasico', 'derby',
    'ngoại hạng anh', 'c1', 'world cup', 'euro', 'la liga', 'champions league',
    // Thời điểm hiện tại / gần đây
    'hôm nay', 'mới nhất', 'hiện nay', 'vừa xong', 'gần đây', 'dạo này', 'năm 2024', 'năm 2025', 'năm 2026', 'tháng này'
  ];

  for (const kw of searchKeywords) {
    if (raw.includes(kw)) {
      return true;
    }
  }

  return false;
}

/**
 * Làm sạch từ khóa tìm kiếm (bỏ các từ gọi bot, xưng hô thừa thãi để kết quả Google chuẩn xác nhất)
 * @param {string} text 
 * @returns {string}
 */
function cleanSearchQuery(text) {
  if (!text) return '';
  let q = text.trim();

  // Bỏ các từ gọi bot ở đầu
  q = q.replace(/^(?:bot\s+ơi|em\s+ơi|bọt\s+biển\s+ơi|bạn\s+ơi|ad\s+ơi)\s*/i, '');
  // Bỏ từ mào đầu: "thế", "cho anh hỏi", "hỏi xíu", "thế thì", "vậy thì"
  q = q.replace(/^(?:thế\s+|thế\s+thì\s+|vậy\s+thì\s+|cho\s+(?:anh|em|mình)\s+hỏi\s+|hỏi\s+(?:chút|xíu)\s+)/i, '');
  // Bỏ các từ lệnh ở đầu
  q = q.replace(/^(?:tìm\s+kiếm|tra\s+cứu|tra\s+giúp|search|tra|tìm)\s+(?:cho\s+anh|cho\s+em|giúp\s+mình|hộ\s+anh|về)?\s*/i, '');
  // Bỏ các từ hỏi ở cuối: "kết quả thế nào", "thế nào", "ra sao", "bao nhiêu", "vậy em", "hả em"
  q = q.replace(/\s+(?:kết\s+quả\s+thế\s+nào|thế\s+nào|ra\s+sao|bao\s+nhiêu|vậy|thế|nào|hả|em|nhé|nha|ạ|với|vậy\s+em|thế\s+em|đi)[\s.?!]*$/i, '');
  q = q.replace(/[\s.?!]+$/, '');

  return q.trim() || text.trim();
}

/**
 * Tra cứu qua SerpApi (Google Search Engine)
 * @param {string} cleanQ 
 * @param {string} apiKey 
 * @returns {Promise<Array<{ title: string, snippet: string }>>}
 */
async function searchSerpApi(cleanQ, apiKey) {
  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(cleanQ)}&api_key=${apiKey}&hl=vi&gl=vn&num=5`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  const res = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`SerpApi HTTP ${res.status}: ${errText.slice(0, 100)}`);
  }

  const data = await res.json();
  const results = [];

  // 1. Trích xuất Sports Results (kết quả thể thao, trận đấu, tỷ số)
  if (data.sports_results) {
    const sr = data.sports_results;
    let sportsText = '';
    if (sr.game_spotlight) {
      const gs = sr.game_spotlight;
      const teams = (gs.teams || []).map(t => `${t.name}: ${t.score || ''}`).join(' vs ');
      sportsText = `Trận đấu: ${gs.stage || ''} ${teams} (${gs.date || ''} - ${gs.status || ''})`;
    } else if (sr.title) {
      sportsText = `${sr.title}: ${(sr.games || []).map(g => (g.teams || []).map(t => `${t.name} ${t.score || ''}`).join(' - ')).join('; ')}`;
    }
    if (sportsText) {
      results.push({
        title: 'Kết quả thể thao Google',
        snippet: sportsText.trim()
      });
    }
  }

  // 2. Trích xuất Answer Box (hộp câu trả lời trực tiếp của Google)
  if (data.answer_box) {
    const ab = data.answer_box;
    const answer = ab.answer || ab.snippet || ab.result || (Array.isArray(ab.snippet_highlighted_words) ? ab.snippet_highlighted_words.join(' ') : '');
    if (answer) {
      results.push({
        title: ab.title || 'Câu trả lời trực tiếp từ Google',
        snippet: answer.trim()
      });
    }
  }

  // 3. Trích xuất Knowledge Graph
  if (data.knowledge_graph && (data.knowledge_graph.description || data.knowledge_graph.title)) {
    const kg = data.knowledge_graph;
    const text = [kg.title, kg.type, kg.description].filter(Boolean).join(' - ');
    if (text) {
      results.push({
        title: kg.title || 'Thông tin tổng hợp Google',
        snippet: text
      });
    }
  }

  // 4. Trích xuất Organic Results
  if (Array.isArray(data.organic_results)) {
    for (const item of data.organic_results.slice(0, 4)) {
      if (item.snippet || item.title) {
        results.push({
          title: item.title || '',
          snippet: item.snippet || ''
        });
      }
    }
  }

  return results;
}

/**
 * Tìm kiếm dự phòng qua DuckDuckGo HTML
 * @param {string} cleanQ 
 * @param {number} maxResults 
 * @returns {Promise<Array<{ title: string, snippet: string }>>}
 */
async function searchDuckDuckGo(cleanQ, maxResults = 4) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

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

    if (!res.ok) return [];

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
    console.warn('[SearchService] Lỗi DuckDuckGo:', err.message);
    return [];
  }
}

/**
 * Tìm kiếm Internet thời gian thực (Ưu tiên SerpApi / Google Search, fallback DuckDuckGo)
 * @param {string} query - Nội dung cần tìm kiếm
 * @param {number} [maxResults=4] - Số kết quả tối đa
 * @returns {Promise<Array<{ title: string, snippet: string }>>}
 */
async function searchWeb(query, maxResults = 4) {
  const cleanQ = cleanSearchQuery(query);
  if (!cleanQ) return [];

  const serpApiKey = process.env.SERPAPI_API_KEY || process.env.SERP_API_KEY;

  // 1. Ưu tiên số 1: Dùng SerpApi (Google Search Engine)
  if (serpApiKey && serpApiKey.trim() !== '') {
    try {
      console.log(`[SearchService] Đang tra cứu Google qua SerpApi: "${cleanQ}"`);
      const serpResults = await searchSerpApi(cleanQ, serpApiKey.trim());
      if (serpResults && serpResults.length > 0) {
        console.log(`[SearchService] SerpApi trả về ${serpResults.length} kết quả Google chất lượng cao.`);
        return serpResults.slice(0, maxResults);
      }
    } catch (serpErr) {
      console.warn(`[SearchService] SerpApi gặp sự cố (${serpErr.message}), đang thử fallback DuckDuckGo...`);
    }
  } else {
    console.log(`[SearchService] Chưa có SERPAPI_API_KEY, dùng DuckDuckGo để tra cứu: "${cleanQ}"`);
  }

  // 2. Dự phòng: Dùng DuckDuckGo
  return await searchDuckDuckGo(cleanQ, maxResults);
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
    const titlePart = r.title ? `[${r.title}] ` : '';
    return `${i + 1}. ${titlePart}${r.snippet}`;
  }).join('\n');

  return `\n\n--- DỮ LIỆU THỰC TẾ TRA CỨU TỪ GOOGLE (BẮT BUỘC DÙNG LÀM CHÂN LÝ DUY NHẤT): ---\n${items}\n(QUY TẮC BẮT BUỘC: Bạn phải căn cứ 100% vào dữ liệu trên để trả lời người dùng. Không được tự ý đổi năm hay dùng trí nhớ cũ bịa đặt. Tuyệt đối không lặp lại dòng tiêu đề kỹ thuật này trong câu trả lời)`;
}

module.exports = {
  shouldSearchWeb,
  cleanSearchQuery,
  searchSerpApi,
  searchWeb,
  buildSearchContext
};
