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

  const unaccented = removeVietnameseTones(raw);

  // --- KHÔNG tìm kiếm: Chào hỏi thuần túy (cả có dấu lẫn không dấu) ---
  const PURE_SMALLTALK = /^(?:chào|chao|hi+|hello|hey|ê|e|alo|helo|xin chào|xin chao|ok|okay|oke|good|nice|được rồi|duoc roi|ừ+|u+|uh+|dạ ok|da ok|👋|🙋)\s*[!.]*$/i;
  if (PURE_SMALLTALK.test(unaccented)) return false;
  if (/^(?:chào|chao|hi|hello|ê|e)\s+(?:em|bot|bọt biển|bot bien|bọt biển cute|bot bien cute)\s*[!.]*$/i.test(unaccented)) return false;

  // --- KHÔNG tìm kiếm: Hỏi danh tính / khả năng của bot ---
  if (/^(?:em tên gì|em ten gi|bạn là ai|ban la ai|em là ai|em la ai|tên em là gì|ten em la gi|bot tên gì|bot ten gi|em làm được gì|em lam duoc gi|em có thể làm gì|em co the lam gi)\s*[?!.]*$/i.test(unaccented)) return false;

  // --- KHÔNG tìm kiếm: Hỏi thăm trạng thái / cảm xúc của bot ---
  if (/^(?:em|bọt biển|bot bien)\s+(?:khỏe|khoe|vui|ổn|on|mệt|met|buồn|buon)\s*(?:không|khong)?\s*[?!.]*$|^(?:khỏe không|khoe khong|ổn không|on khong|vui không|vui khong|ăn cơm chưa|an com chua|ngủ chưa|ngu chua)\s*[?!.]*$/i.test(unaccented)) return false;

  // Chuỗi kết hợp có dấu + không dấu để khớp nhanh, toàn diện
  const combined = raw + ' ' + unaccented;

  // ==========================================================
  // --- TÌM KIẾM: Mọi câu còn lại có dấu hiệu câu hỏi thực tế ---
  // ==========================================================

  // Giải thưởng, danh hiệu thể thao & văn hóa (CỰC KỲ QUAN TRỌNG: Quả bóng vàng, bạc, đồng,...)
  if (/\b(?:quả bóng|qua bong|bóng vàng|bong vang|bóng bạc|bong bac|bóng đồng|bong dong|ballon d'?or|chiếc giày vàng|chiec giay vang|vua phá lưới|vua pha luoi|cầu thủ xuất sắc|cau thu xuat sac|giải thưởng|giai thuong|trao giải|trao giai|đề cử|de cu|đoạt giải|doat giai|vinh danh|hoa hậu|hoa hau|á hậu|a hau|oscar|grammy|emmy|golden globe|nobel)\b/i.test(combined)) return true;

  // Từ hỏi rõ ràng (có dấu & không dấu)
  if (/\b(?:khi nào|khi nao|bao giờ|bao gio|ngày nào|ngay nao|ở đâu|o dau|thế nào|the nao|ra sao|bao nhiêu|bao nhieu|bao lâu|bao lau|tại sao|tai sao|vì sao|vi sao|ai là|ai la|ai đoạt|ai doat|ai thắng|ai thang|ai vô địch|ai vo dich|cái gì|cai gi|điều gì|dieu gi|chuyện gì|chuyen gi|lịch|lich|thông tin|thong tin)\b/i.test(combined)) return true;

  // Thời gian / sự kiện hiện tại
  if (/\b(?:hôm nay|hom nay|ngày mai|ngay mai|tuần này|tuan nay|tháng này|thang nay|năm nay|nam nay|hiện tại|hien tai|hiện nay|hien nay|mới nhất|moi nhat|gần đây|gan day|vừa|vua|đang|dang|sắp|sap|sắp tới|sap toi|sắp ra|sap ra|ra mắt|ra mat|phát hành|phat hanh|khởi chiếu|khoi chieu|khai mạc|khai mac)\b/i.test(combined)) return true;

  // Sự kiện giải trí / âm nhạc / phim
  if (/\b(?:concert|tour|show|festival|lễ hội|le hoi|buổi diễn|buoi dien|lịch diễn|lich dien|lịch chiếu|lich chieu|vé|ve|album|ca sĩ|ca si|diễn viên|dien vien|đạo diễn|dao dien|phim|movie|anime|manga)\b/i.test(combined)) return true;

  // Thể thao (có dấu & không dấu)
  if (/\b(?:bóng đá|bong da|bóng rổ|bong ro|tennis|cầu lông|cau long|boxing|bơi|boi|olympic|sea games|v.?league|premier league|la liga|serie a|bundesliga|champions league|c1|world cup|euro|trận đấu|tran dau|tỷ số|ty so|ti so|bảng xếp hạng|bang xep hang|cầu thủ|cau thu|huấn luyện viên|huan luyen vien|đội tuyển|doi tuyen|vô địch|vo dich|el clasico|clasico|derby)\b/i.test(combined)) return true;

  // Giá cả / thị trường
  if (/\b(?:giá|gia|tỷ giá|ty gia|ti gia|hối đoái|hoi doai|lãi suất|lai suat|chứng khoán|chung khoan|cổ phiếu|co phieu|bitcoin|crypto|vàng|vang|bạc|bac|bất động sản|bat dong san|nhà đất|nha dat|xăng|xang|dầu|dau)\b/i.test(combined)) return true;

  // Thời tiết
  if (/\b(?:thời tiết|thoi tiet|nhiệt độ|nhiet do|độ ẩm|do am|mưa|mua|nắng|nang|bão|bao|lũ|lu|lụt|lut|áp thấp|ap thap)\b/i.test(combined)) return true;

  // Công nghệ / sản phẩm
  if (/\b(?:iphone|samsung|android|ios|windows|macbook|playstation|xbox|app|ứng dụng|ung dung|game|xiaomi|oppo)\b/i.test(combined)) return true;

  // Chính trị / xã hội / y tế
  if (/\b(?:bầu cử|bau cu|chính phủ|chinh phu|thủ tướng|thu tuong|tổng thống|tong thong|quốc hội|quoc hoi|luật|luat|vaccine|dịch|dich|virus|bệnh|benh|thuốc|thuoc|sức khỏe|suc khoe)\b/i.test(combined)) return true;

  // Du lịch / giao thông
  if (/\b(?:vé máy bay|ve may bay|chuyến bay|chuyen bay|vé tàu|ve tau|khách sạn|khach san|du lịch|du lich|visa|hộ chiếu|ho chieu|sân bay|san bay|giao thông|giao thong|đường bay|duong bay)\b/i.test(combined)) return true;

  // Tin tức
  if (/\b(?:tin tức|tin tuc|thời sự|thoi su|bản tin|ban tin|scandal|thiên tai|thien tai|tai nạn|tai nan|sự cố|su co|kết quả|ket qua)\b/i.test(combined)) return true;

  // Câu có ≥ 3 từ và không phải chào hỏi thuần túy -> tìm kiếm an toàn
  const wordCount = raw.trim().split(/\s+/).length;
  if (wordCount >= 3) return true;

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
