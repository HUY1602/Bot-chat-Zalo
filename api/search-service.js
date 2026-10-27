/**
 * Web Search Service for Zalo Bot
 * Integrates SerpApi (Google Search Engine) for ultra-accurate, real-time web results
 * with automatic fallback to DuckDuckGo HTML search.
 */

/**
 * Chuyển đổi chuỗi tiếng Việt có dấu thành không dấu để nhận diện ý định và lọc nội dung
 * @param {string} str 
 * @returns {string}
 */
function removeVietnameseTones(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/**
 * Kiểm tra xem câu hỏi có phải là câu hỏi thực tế cần tra cứu Internet không.
 * Chiến lược: Tìm kiếm HẦU HẾT mọi câu hỏi thông tin, hỗ trợ cả tiếng Việt có dấu và KHÔNG DẤU.
 * CHỈ bỏ qua những tin nhắn rõ ràng là chào hỏi / tán gẫu / lệnh bot.
 * @param {string} text
 * @returns {boolean}
 */
function shouldSearchWeb(text) {
  if (!text || typeof text !== 'string') return false;
  const raw = text.trim().toLowerCase();
  if (raw.length < 2) return false;

  // 1. KHÔNG tìm kiếm: Lệnh hệ thống
  if (/^\/(?:draw|image|ve|paint|art|gen|ping|reset|help|clear|forget|start|remind|hengio|nhac|hen|reminder|reminders|dsnhac|huynhac|xoanhac)\b/i.test(raw)) return false;

  // 1.5 KHÔNG tìm kiếm: Yêu cầu hẹn giờ / nhắc việc
  const unaccented = removeVietnameseTones(raw);
  if (/\b(?:nhac|hen gio|dat lich|bao thuc)\s+(?:cho\s+)?(?:anh|chi|em|toi|minh|nhom|tui)?\b/i.test(unaccented)) return false;
  if (/\b(?:\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)\s*(?:phut|giay|tieng|gio|ngay)\s*nua\s+(?:nhac|bao|goi)\b/i.test(unaccented)) return false;
  if (/\b(?:danh sach|xem|huy|xoa)\s+(?:lich\s+)?(?:nhac|hen gio|nhac viec|lich hen)\b/i.test(unaccented)) return false;

  // 2. KHÔNG tìm kiếm: Yêu cầu xem avatar
  if (/\b(?:xem|gửi|cho|đổi|show|khoe|nhìn|ngắm)\b.{0,15}\b(?:ảnh|mặt|hình|avatar|dung nhan)\b/i.test(raw) ||
      /\b(?:ảnh|mặt|hình)\b.{0,10}\b(?:em|bot|bọt biển)\b/i.test(raw)) return false;

  // 3. KHÔNG tìm kiếm: Yêu cầu vẽ tranh AI
  if (/^(?:vẽ|tạo\s+ảnh|phác\s+họa|lên\s+hình)\s+/i.test(raw)) return false;

  // 4. KHÔNG tìm kiếm: Sáng tạo nội dung (thơ, truyện cười, lời chúc, văn mẫu, viết kịch bản)
  if (/\b(?:viet|lam|che)\s+(?:cho\s+anh\s+|cho\s+em\s+)?(?:bai\s+)?(?:tho|van|kich|rap|nhac|status|stt|caption|loi chuc)\b/i.test(unaccented)) return false;
  if (/\b(?:ke|noi)\s+(?:cho\s+anh\s+|cho\s+em\s+)?(?:chuyen\s+)?(?:cuoi|ma|tich|ngungon|vui)\b/i.test(unaccented)) return false;
  if (/\b(?:dat ten|nghi ten|goi y ten)\s+(?:cho\s+)?(?:con|meo|cho|be|nhom)\b/i.test(unaccented)) return false;

  // 5. KHÔNG tìm kiếm: Dịch thuật, ngoại ngữ thuần túy
  if (/\b(?:dich|translate)\s+(?:sang|giup|ho|cau nay|doan nay|tu nay)\b/i.test(unaccented)) return false;
  if (/\b(?:tieng anh|tieng nhat|tieng han|tieng trung)\s+la\s+gi\b/i.test(unaccented)) return false;

  // 6. KHÔNG tìm kiếm: Chào hỏi, cảm ơn, tạm biệt, chúc ngủ ngon
  const SMALLTALK_PATTERNS = [
    /^(?:chao|hi+|hello|hey|ê|e|alo|helo|xin chao|ok|okay|oke|good|nice|duoc roi|u+|uh+|da ok|bye|tam biet|g9|bye bye|👋|🙋)\b/i,
    /\b(?:chuc ngu ngon|ngu ngon|ngu som|ngu di|ngu day|chuc buoi sang|chuc ngay moi|ngay tot lanh|tam biet|hen gap lai|bye bye)\b/i,
    /\b(?:cam on|thank|thanks|biet on|da ta)\b/i,
    /\b(?:khen|gioi qua|thong minh qua|cute qua|de thuong qua|dang yeu qua|dinh qua|xuat sac|tuyet voi)\b/i
  ];
  for (const p of SMALLTALK_PATTERNS) {
    if (p.test(unaccented)) return false;
  }

  // 7. KHÔNG tìm kiếm: Tâm sự, cảm xúc, trạng thái cá nhân
  if (/\b(?:anh|em|minh|tui|to)\s+(?:buon|vui|met|chan|nho|yeu|thich|co don|stress|that tinh|dau dau|om|benh)\b/i.test(unaccented)) {
    if (!/\b(?:uong thuoc|cach chua|trieu chung|benh vien|bac si|o dau)\b/i.test(unaccented)) {
      return false;
    }
  }

  // 8. KHÔNG tìm kiếm: Hỏi danh tính, sở thích, tình cảm của bot
  if (/\b(?:em|bot|bot bien)\s+(?:ten gi|la ai|may tuoi|o dau|thich gi|an gi|yeu ai|co nguoi yeu chua|lam duoc gi|biet lam gi)\b/i.test(unaccented)) return false;
  if (/^(?:em|bot bien)\s+(?:khoe|vui|on|met|buon)\s*(?:khong)?\s*[?!.]*$/i.test(unaccented)) return false;

  // 9. KHÔNG tìm kiếm: Toán học / Code thuần túy
  if (/^[\d\s\+\-\*\/\^\(\)\.\,\=]+$/.test(raw) || /^\d+\s*[\+\-\*\/]\s*\d+/.test(unaccented)) return false;
  if (/\b(?:viet code|viet ham|debug|fix loi|code javascript|code python|code c\+\+)\b/i.test(unaccented)) return false;

  // ==========================================================
  // --- NÊN TÌM KIẾM: Các câu hỏi thông tin thực tế xác định ---
  // ==========================================================
  const combined = raw + ' ' + unaccented;

  // 1. Giải thưởng, danh hiệu, bảng xếp hạng
  if (/\b(?:qua bong|bong vang|bong bac|bong dong|ballon d'?or|chiec giay vang|vua pha luoi|cau thu xuat sac|giai thuong|trao giai|de cu|doat giai|vinh danh|hoa hau|a hau|oscar|grammy|emmy|golden globe|nobel|bang xep hang)\b/i.test(combined)) return true;

  // 2. Thể thao, trận đấu, tỷ số
  if (/\b(?:bong da|bong ro|tennis|cau long|boxing|boi|olympic|sea games|v.?league|premier league|la liga|serie a|bundesliga|champions league|c1|world cup|euro|tran dau|ty so|ti so|cau thu|huan luyen vien|doi tuyen|vo dich|el clasico|clasico|derby)\b/i.test(combined)) return true;

  // 3. Thời tiết, thiên tai
  if (/\b(?:thoi tiet|nhiet do|do am|troi mua|mua to|mua phun|troi nang|bao so|ap thap|lu lut|du bao)\b/i.test(unaccented) || /\b(?:mưa|nắng|bão|lũ|lụt)\b/i.test(raw)) return true;

  // 4. Giá cả, tài chính, thị trường
  if (/\b(?:gia|ty gia|ti gia|hoi doai|lai suat|chung khoan|co phieu|bitcoin|crypto|vang|bac|bat dong san|nha dat|xang|dau)\b/i.test(unaccented)) return true;

  // 5. Sự kiện giải trí, concert, phim ảnh
  if (/\b(?:concert|tour|show|festival|le hoi|buoi dien|lich dien|lich chieu|ve concert|khoi chieu|cong chieu)\b/i.test(unaccented)) return true;

  // 6. Tin tức, sự kiện nóng, thời sự
  if (/\b(?:tin tuc|thoi su|ban tin|scandal|thien tai|tai nan|su co|ket qua)\b/i.test(unaccented)) return true;

  // 7. Thời gian hiện tại kết hợp từ hỏi
  if (/\b(?:hom nay|ngay mai|tuan nay|thang nay|nam nay|hien tai|hien nay|moi nhat|gan day|vua)\b/i.test(unaccented) &&
      /\b(?:la gi|khi nao|bao gio|o dau|the nao|ai|may gio|ngay may|co gi|chuyen gi)\b/i.test(unaccented)) {
    return true;
  }

  // 8. Từ hỏi thông tin khách quan kết hợp thực thể
  if (/\b(?:khi nao|bao gio|ngay nao|o dau|bao nhieu|bao lau|ai la|ai doat|ai thang|ai vo dich|lich thi dau|thong tin ve)\b/i.test(unaccented)) {
    return true;
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
  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(cleanQ)}&api_key=${apiKey}&hl=vi&gl=vn&num=10`;

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

  const unaccentedQ = removeVietnameseTones(cleanQ);
  const qWords = unaccentedQ.split(/\s+/).filter(w => w.length >= 2);
  const hasVnConstraint = /\b(?:viet nam|vn|v-league|vleague)\b/.test(unaccentedQ);
  const hasDongConstraint = /\b(?:dong|qua bong dong)\b/.test(unaccentedQ) && !/\b(?:phong dong|hoang dong)\b/.test(unaccentedQ);

  // Helper kiểm tra độ liên quan của bài viết với từ khóa tìm kiếm
  const isRelevant = (text) => {
    if (!text) return false;
    const norm = removeVietnameseTones(text);

    // Lọc bỏ rác hành chính hoặc trang tra cứu chung chung
    if (/\b(?:nghi dinh|thong tu|chinhphu\.vn|quyet dinh so)\b/.test(norm)) return false;
    if (/^\d{4}\s*–\s*wikipedia/i.test(text.trim())) return false;

    // Nếu hỏi quả bóng đồng thì không lấy tin thuần túy chỉ nói về lãi suất/tài sản/giá vàng
    if (hasDongConstraint) {
      const mentionsDongOrFootball = /\b(?:dong|qua bong|bong da|cau thu|giai thuong|tuan hai|van lam|messi|ronaldo)\b/.test(norm);
      if (!mentionsDongOrFootball) return false;
    }

    // Kiểm tra có ít nhất 1 từ khóa trùng
    let matchCount = 0;
    for (const w of qWords) {
      if (norm.includes(w)) matchCount++;
    }
    return matchCount > 0;
  };

  // 1. Trích xuất Top Stories (Tin tức nóng, sự kiện vừa diễn ra)
  if (Array.isArray(data.top_stories) && data.top_stories.length > 0) {
    for (const story of data.top_stories) {
      if (!isRelevant(story.title)) continue; // Bỏ qua tin thời sự không liên quan do Google đẩy lên

      const timeStr = story.date ? `(${story.date}) ` : '';
      const sourceStr = story.source ? `[${story.source}] ` : '';
      const normTitle = removeVietnameseTones(story.title);

      // Nếu người dùng hỏi "Việt Nam" mà tin này là giải thế giới (như Harry Kane), gắn nhãn rõ ràng
      let prefix = 'Tin mới nhất: ';
      if (hasVnConstraint && !/\b(?:viet nam|vn|v-league|vff|vietnamese|dinh bac|hoang duc|quang hai|tuan hai)\b/.test(normTitle)) {
        prefix = 'Tin thế giới / quốc tế (Lưu ý: Không phải giải Việt Nam): ';
      }

      results.push({
        title: `${sourceStr}${prefix}${story.title}`,
        snippet: `${timeStr}${story.title}`
      });
      if (results.length >= 3) break;
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
      if (!isRelevant(item.title + ' ' + (item.snippet || ''))) continue;
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

  // 7. Trích xuất Organic Results (kèm thời gian đăng bài để phân biệt tin cũ / mới, ưu tiên bài viết liên quan)
  if (Array.isArray(data.organic_results)) {
    for (const item of data.organic_results) {
      if (item.snippet || item.title) {
        const fullText = (item.title || '') + ' ' + (item.snippet || '');
        if (!isRelevant(fullText)) continue;

        const dateStr = item.date ? `[Thời gian đăng: ${item.date}] ` : '';
        results.push({
          title: item.title || '',
          snippet: `${dateStr}${item.snippet || ''}`
        });
        if (results.length >= 8) break;
      }
    }
  }

  // Nếu bộ lọc quá chặt làm kết quả rỗng, lấy các organic kết quả đầu tiên làm dự phòng
  if (results.length === 0 && Array.isArray(data.organic_results)) {
    for (const item of data.organic_results.slice(0, 4)) {
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
 * @param {number} [maxResults=6] - Số kết quả tối đa
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
1. Bạn phải căn cứ vào dữ liệu tìm kiếm thực tế trên để trả lời người dùng.
2. PHÂN BIỆT ĐÚNG ĐỐI TƯỢNG VÀ PHẠM VI (RẤT QUAN TRỌNG):
   • VIỆT NAM vs THẾ GIỚI:
     - Nếu người dùng hỏi về Việt Nam (ví dụ "Quả bóng vàng Việt Nam"): Phải trả lời đúng bóng đá Việt Nam, tuyệt đối KHÔNG trả lời nhầm sang giải thế giới (như Ballon d'Or của Harry Kane/Rodri/Messi).
     - Nếu giải của Việt Nam năm đó CHƯA DIỄN RA (ví dụ Quả bóng vàng Việt Nam 2026 chưa diễn ra, thường tổ chức vào đầu năm sau): Hãy nói rõ ràng, lễ phép: "Giải Quả bóng vàng Việt Nam năm 2026 hiện tại chưa diễn ra nha anh (thường tổ chức vào đầu năm sau để tổng kết mùa giải)". Nêu các ứng viên sáng giá hoặc chủ nhân mùa gần nhất. Nếu muốn, có thể chú thích thêm giải thế giới cùng tên để người dùng khỏi nhầm lẫn.
   • THỨ HẠNG GIẢI THƯỞNG:
     - "Quả bóng đồng": là danh hiệu hạng 3 (giải ba), tuyệt đối KHÔNG tự ý đổi thành "Quả bóng vàng". Nêu rõ cầu thủ đoạt giải Quả bóng đồng (ví dụ Phạm Tuấn Hải, Đặng Văn Lâm).
     - "Quả bóng bạc": là danh hiệu hạng 2 (giải nhì).
   • CÂU HỎI VIẾT KHÔNG DẤU (ví dụ "qua bong dong", "qua bong vang", "thoi tiet"):
     - Tự động hiểu đúng nghĩa tiếng Việt có dấu tương ứng để trả lời.
3. CHÚ Ý MỐC THỜI GIAN: Phân tích kỹ mốc thời gian đăng bài so với ngày giờ hiện tại để xác định sự kiện đã diễn ra hay sắp diễn ra.
4. LỌC DỮ LIỆU THÔNG MINH: Chỉ dùng các dữ liệu thực sự khớp với đối tượng được hỏi. Trả lời súc tích, ngọt ngào, đúng trọng tâm và không lặp lại dòng tiêu đề kỹ thuật này trong câu trả lời)`;
}

module.exports = {
  shouldSearchWeb,
  cleanSearchQuery,
  searchSerpApi,
  searchWeb,
  buildSearchContext
};
