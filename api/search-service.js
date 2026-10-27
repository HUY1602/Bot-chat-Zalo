/**
 * Web Search Service for Zalo Bot
 * Integrates SerpApi (Google Search Engine) for ultra-accurate, real-time web results
 * with automatic fallback to DuckDuckGo HTML search.
 */

/**
 * Kiểm tra xem câu hỏi có phải là câu hỏi thực tế cần tra cứu Internet không.
 * Chiến lược: Tìm kiếm HẦU HẾT mọi câu, CHỈ bỏ qua những tin nhắn rõ ràng là chào hỏi / tán gẫu / lệnh bot.
 * @param {string} text
 * @returns {boolean}
 */
function shouldSearchWeb(text) {
  if (!text || typeof text !== 'string') return false;
  const raw = text.trim().toLowerCase();
  if (raw.length < 3) return false;

  // --- KHÔNG tìm kiếm: Lệnh hệ thống ---
  if (/^\/(?:draw|image|ve|paint|art|gen|ping|reset|help|clear|forget|start)\b/i.test(raw)) {
    return false;
  }

  // --- KHÔNG tìm kiếm: Yêu cầu xem ảnh/avatar bot ---
  if (/\b(?:xem|gửi|cho|đổi|show|khoe|nhìn|ngắm)\b.{0,15}\b(?:ảnh|mặt|hình|avatar|dung nhan)\b/i.test(raw) ||
      /\b(?:ảnh|mặt|hình)\b.{0,10}\b(?:em|bot|bọt biển)\b/i.test(raw)) {
    return false;
  }

  // --- KHÔNG tìm kiếm: Yêu cầu vẽ tranh AI ---
  if (/^(?:vẽ|tạo\s+ảnh|phác\s+họa|lên\s+hình)\s+/i.test(raw)) return false;

  // --- KHÔNG tìm kiếm: Chào hỏi thuần túy (câu rất ngắn, rõ ràng là xã giao) ---
  const PURE_SMALLTALK = /^(?:chào|hi+|hello|hey|ê|alo|helo|xin chào|ok|okay|oke|good|nice|được rồi|ừ+|uh+|dạ ok|👋|🙋)\s*[!.]*$/i;
  if (PURE_SMALLTALK.test(raw)) return false;
  if (/^(?:chào|hi|hello|ê)\s+(?:em|bot|bọt biển|bọt biển cute)\s*[!.]*$/i.test(raw)) return false;

  // --- KHÔNG tìm kiếm: Hỏi danh tính / khả năng của bot ---
  if (/^(?:em\s+tên\s+gì|bạn\s+là\s+ai|em\s+là\s+ai|tên\s+em\s+là\s+gì|bot\s+tên\s+gì|em\s+làm\s+được\s+gì|em\s+có\s+thể\s+làm\s+gì)\s*[?!.]*$/i.test(raw)) return false;

  // --- KHÔNG tìm kiếm: Hỏi thăm trạng thái / cảm xúc của bot ---
  if (/^(?:em|bọt biển)\s+(?:khỏe|vui|ổn|mệt|buồn)\s*(?:không)?\s*[?!.]*$|^(?:khỏe\s+không|ổn\s+không|vui\s+không|ăn\s+cơm\s+chưa|ngủ\s+chưa)\s*[?!.]*$/i.test(raw)) return false;

  // ==========================================================
  // --- TÌM KIẾM: Mọi câu còn lại có dấu hiệu câu hỏi thực tế ---
  // ==========================================================

  // Từ hỏi rõ ràng
  if (/\b(?:khi nào|bao giờ|ngày nào|ở đâu|thế nào|ra sao|bao nhiêu|bao lâu|tại sao|vì sao|ai là|cái gì|điều gì|chuyện gì|lịch|thông tin)\b/i.test(raw)) return true;

  // Thời gian / sự kiện hiện tại
  if (/\b(?:hôm nay|ngày mai|tuần này|tháng này|năm nay|hiện tại|hiện nay|mới nhất|gần đây|vừa|đang|sắp|sắp tới|sắp ra|ra mắt|phát hành|khởi chiếu|khai mạc)\b/i.test(raw)) return true;

  // Sự kiện giải trí / âm nhạc / phim
  if (/\b(?:concert|tour|show|festival|lễ hội|buổi diễn|lịch diễn|lịch chiếu|vé|album|ca sĩ|diễn viên|đạo diễn|phim|movie|anime|manga)\b/i.test(raw)) return true;

  // Thể thao
  if (/\b(?:bóng đá|bóng rổ|tennis|cầu lông|boxing|bơi|olympic|sea games|v.?league|premier league|la liga|serie a|bundesliga|champions league|world cup|euro|trận đấu|tỷ số|bảng xếp hạng|cầu thủ|huấn luyện viên|đội tuyển|vô địch|el clasico|clasico|derby)\b/i.test(raw)) return true;

  // Giá cả / thị trường
  if (/\b(?:giá|tỷ giá|hối đoái|lãi suất|chứng khoán|cổ phiếu|bitcoin|crypto|vàng|bạc|bất động sản|nhà đất|xăng|dầu)\b/i.test(raw)) return true;

  // Thời tiết
  if (/\b(?:thời tiết|nhiệt độ|độ ẩm|mưa|nắng|bão|lũ|lụt|áp thấp)\b/i.test(raw)) return true;

  // Công nghệ / sản phẩm
  if (/\b(?:iphone|samsung|android|ios|windows|macbook|playstation|xbox|app|ứng dụng|game)\b/i.test(raw)) return true;

  // Chính trị / xã hội / y tế
  if (/\b(?:bầu cử|chính phủ|thủ tướng|tổng thống|quốc hội|luật|vaccine|dịch|virus|bệnh|thuốc|sức khỏe)\b/i.test(raw)) return true;

  // Du lịch / giao thông
  if (/\b(?:vé máy bay|chuyến bay|vé tàu|khách sạn|du lịch|visa|hộ chiếu|sân bay|giao thông|đường bay)\b/i.test(raw)) return true;

  // Tin tức
  if (/\b(?:tin tức|thời sự|bản tin|scandal|thiên tai|tai nạn|sự cố|kết quả)\b/i.test(raw)) return true;

  // Câu có ≥ 5 từ và không phải chào hỏi -> tìm kiếm phòng thủ
  const wordCount = raw.trim().split(/\s+/).length;
  if (wordCount >= 5) return true;

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
  // Bỏ các từ hỏi ở cuối
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
  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(cleanQ)}&api_key=${apiKey}&hl=vi&gl=vn&num=8`;

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

  // 1. Trích xuất Top Stories (Tin tức nóng, sự kiện vừa diễn ra, tin mới trong vài phút/giờ qua)
  if (Array.isArray(data.top_stories) && data.top_stories.length > 0) {
    for (const story of data.top_stories.slice(0, 4)) {
      const timeStr = story.date ? `(${story.date}) ` : '';
      const sourceStr = story.source ? `[${story.source}] ` : '';
      results.push({
        title: `${sourceStr}Tin mới nhất: ${story.title}`,
        snippet: `${timeStr}${story.title}`
      });
    }
  }

  // 2. Trích xuất Google AI Overview (Tổng hợp sự kiện thời gian thực siêu chuẩn xác từ Google)
  if (data.ai_overview && Array.isArray(data.ai_overview.text_blocks)) {
    const aiTexts = [];
    for (const b of data.ai_overview.text_blocks) {
      if (b.snippet) aiTexts.push(b.snippet);
      if (Array.isArray(b.list)) {
        for (const li of b.list) {
          if (li.snippet) aiTexts.push(`• ${li.snippet}`);
        }
      }
    }
    if (aiTexts.length > 0) {
      results.push({
        title: 'Google Tổng hợp thời gian thực',
        snippet: aiTexts.slice(0, 5).join('\n')
      });
    }
  }

  // 3. Trích xuất Answer Box (hộp câu trả lời trực tiếp của Google)
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

  // 4. Trích xuất Sports Results (kết quả thể thao, trận đấu, tỷ số)
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

  // 5. Trích xuất News Results (kết quả tin tức nếu có)
  if (Array.isArray(data.news_results) && data.news_results.length > 0) {
    for (const item of data.news_results.slice(0, 3)) {
      const dateStr = item.date ? `(${item.date}) ` : '';
      const sourceStr = item.source ? `[${item.source}] ` : '';
      results.push({
        title: `${sourceStr}${item.title || ''}`,
        snippet: `${dateStr}${item.snippet || item.title || ''}`
      });
    }
  }

  // 6. Trích xuất Knowledge Graph
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

  // 7. Trích xuất Organic Results (kèm thời gian đăng bài để phân biệt tin cũ / mới)
  if (Array.isArray(data.organic_results)) {
    for (const item of data.organic_results.slice(0, 6)) {
      if (item.snippet || item.title) {
        const dateStr = item.date ? `[Thời gian đăng: ${item.date}] ` : '';
        results.push({
          title: item.title || '',
          snippet: `${dateStr}${item.snippet || ''}`
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
async function searchWeb(query, maxResults = 6) {
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

  return `\n\n--- DỮ LIỆU THỰC TẾ TRA CỨU TỪ GOOGLE (BẮT BUỘC DÙNG LÀM CHÂN LÝ DUY NHẤT): ---\n${items}\n(QUY TẮC BẮT BUỘC KHI TRẢ LỜI:
1. Bạn phải căn cứ 100% vào dữ liệu tìm kiếm thực tế trên để trả lời người dùng.
2. CHÚ Ý MỐC THỜI GIAN: Phân tích kỹ mốc thời gian đăng bài "(X giờ trước)", "[Thời gian đăng:...]" so với ngày giờ hiện tại. Nếu bài báo cũ viết "sẽ diễn ra vào ngày 24-25/10" nhưng hôm nay đã là ngày 27/10, bạn phải hiểu sự kiện đó ĐÃ DIỄN RA và tóm tắt diễn biến/kết quả theo thông tin mới nhất.
3. ƯU TIÊN TIN MỚI: Ưu tiên các mục "Tin mới nhất", "Google Tổng hợp thời gian thực" hoặc các bài đăng trong vài giờ/vài ngày gần nhất.
4. Trả lời súc tích, ngọt ngào, đúng trọng tâm và tuyệt đối không lặp lại dòng tiêu đề kỹ thuật này trong câu trả lời)`;
}

module.exports = {
  shouldSearchWeb,
  cleanSearchQuery,
  searchSerpApi,
  searchWeb,
  buildSearchContext
};
