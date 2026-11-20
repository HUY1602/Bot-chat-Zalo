# Zalo Gemini Bot - Trợ Lý AI Hỏi Đáp Nhóm 24/7 (Vercel Serverless)

## Tra cứu thông tin mới và kiểm tra lỗi tìm kiếm

Webhook Zalo và khung chat thử dùng chung luồng tra cứu: nhận diện câu hỏi cần cập nhật → tìm nguồn → tổng hợp trực tiếp → đính kèm đường dẫn. Câu hỏi tiếp nối ngắn dùng câu hỏi gần đây của chính người gửi để bổ sung chủ đề; không lấy câu trả lời cũ của AI làm nguồn. Ngày tương đối như “hôm qua” được gắn ngày Việt Nam khi tìm kiếm. Bộ lọc giữ nguồn chính phủ, thời gian đăng và loại link trùng hoặc kết quả rõ ràng khác năm được hỏi.

Thứ tự dịch vụ:

1. Google qua `SERPAPI_API_KEY` (cũng nhận `SERP_API_KEY`). Nếu kết quả rỗng, thử Google News một lần. Bộ lọc ngày được dùng cho yêu cầu có dấu hiệu thời sự, không ép mọi câu hỏi vào 24 giờ gần nhất.
2. Gemini có công cụ Google Search, dùng `GEMINI_API_KEY`, khi bước trên không có dữ liệu hoặc lỗi. Chỉ nhận khi Google trả metadata nguồn và đoạn văn được nguồn hỗ trợ. Cấu hình `GEMINI_SEARCH_MODEL` (mặc định `gemini-3.5-flash-lite`); đặt `GEMINI_SEARCH_ENABLED=false` để tắt. Tính năng có hạn mức/chi phí riêng; xem [tài liệu Google Search grounding](https://ai.google.dev/gemini-api/docs/google-search).
3. DuckDuckGo HTML làm dự phòng; có thể bị chặn hoặc timeout. Bot nhận diện các lỗi này thay vì coi như đã tìm kiếm thành công.

Nếu tất cả dịch vụ lỗi, bot báo ngắn gọn chưa xác minh được. Nếu tìm được nguồn nhưng AI tổng hợp lỗi, bot gửi trích đoạn và link. Trích đoạn có thể thiếu/cũ; bot chỉ nên khẳng định phần có chứng cứ, không tự quyết định sự kiện vẫn sắp diễn ra từ cách viết “sẽ” trong bài cũ. Luồng tra cứu có giới hạn thời gian và số lần thử để tránh chờ kéo dài.

Trong dashboard đã đăng nhập, nhập câu hỏi rồi bấm **Kiểm tra tra cứu** để xem trạng thái từng dịch vụ: `quota` (hết lượt), `auth` (khóa/quyền), `timeout`, `blocked`, `empty`. Khung chat thử cũng hiển thị chẩn đoán. Có cấu hình khóa không đồng nghĩa còn hạn mức.

Có thể chạy `node scripts/check-search.js "hội nghị thượng đỉnh APEC 2026 diễn ra ở đâu"`. Lệnh chỉ đọc dữ liệu, không gửi tin Zalo và không in khóa. API tương đương: `POST /api/setup` với body `{"action":"test_search","testPrompt":"câu hỏi"}` và xác thực quản trị. Cần duy trì hạn mức ít nhất một nhà cung cấp; sửa mã không khôi phục được quota đã hết. Không commit `.env` hoặc đưa khóa vào URL.

## Nhắc việc lặp lại, sửa và hoãn lịch

Các lệnh dùng giờ Việt Nam (UTC+7). Bot trả ID trong tin xác nhận, `/reminders` và thông báo khi đến hạn. Thay `ID` dưới đây bằng mã `remind_...` thực tế.

| Nhu cầu | Ví dụ |
|---|---|
| Nhắc mỗi ngày | `/repeat daily 08:00 uống nước` |
| Nhắc mỗi tuần | `/repeat weekly mon 08:00 họp nhóm` |
| Tiếng Việt tự nhiên | `nhắc tôi mỗi ngày lúc 8h uống nước`, `Mỗi thứ Hai lúc 8h nhắc họp` |
| Hoãn kể từ bây giờ | `/hoannhac ID 15m`, `/snooze ID 2h`, `hoãn ID 15 phút` |
| Sửa nội dung | `/suanhac ID noi-dung Gửi báo cáo dự án` |
| Sửa lần nhắc kế tiếp | `/suanhac ID gio 08:30`, `/suanhac ID gio mai 08:30` |
| Hủy chuỗi nhắc | `/huynhac ID` |

`/lap` là tên khác của `/repeat`; thứ có thể dùng `mon`–`sun`, `2`–`7`, `cn` hoặc `thứ Hai`… `Chủ nhật`. Chỉ hỗ trợ chu kỳ hằng ngày hoặc hằng tuần vào một thứ cụ thể; các chu kỳ khác hoặc thiếu giờ/nội dung sẽ được yêu cầu nhập lại, không tự đổi thành nhắc một lần.

Chỉ người tạo lịch được sửa hoặc hoãn, trong đúng nhóm đã tạo. Thời gian hoãn từ 1 phút đến 30 ngày, tính từ lúc gửi lệnh. Nếu sửa giờ không ghi `mai` và giờ đó đã qua, bot chọn ngày mai. Với lịch lặp, sửa giờ/hoãn chỉ thay đổi lần kế tiếp; các lần tiếp theo quay lại giờ lặp gốc. Để đổi hẳn chu kỳ, hủy và tạo lại lịch. Lịch một lần vừa gửi có thể hoãn bằng ID trong 24 giờ, dù không còn hiển thị ở danh sách đang chờ.

Sau khi gửi thành công, lịch lặp giữ nguyên ID và chuyển sang mốc tiếp theo trong tương lai; các mốc đã bỏ lỡ không được gửi dồn. Nếu gửi lỗi, bot thử lại cùng lần nhắc tối đa 5 lần rồi tạm dừng lịch. Sửa nội dung không tự kích hoạt lại lịch lỗi; sửa giờ hoặc hoãn sẽ kích hoạt lại. Gửi vẫn phụ thuộc lịch cron, mặc định mỗi 5 phút. Cần Upstash để lưu lịch và khóa xử lý bền vững trên Vercel.

Không cần thêm API key hoặc gói phụ thuộc mới cho các tính năng này. Giữ các cấu hình bảo mật/Redis ở mục bên dưới khi deploy. Lịch cũ không có trường `recurrence` tiếp tục là lịch một lần.


## Cập nhật bảo mật và độ ổn định

Trước khi triển khai bản cập nhật:

1. Đặt ba biến môi trường riêng biệt trên Vercel: `ADMIN_SECRET`, `WEBHOOK_SECRET`, `CRON_SECRET`. Dùng các chuỗi ngẫu nhiên dài; không dùng mã mặc định cũ. Khi thiếu khóa, endpoint tương ứng từ chối hoạt động.
2. Đặt GitHub repository secret `CRON_SECRET` giống giá trị trên Vercel. Workflow heartbeat đã gửi header xác thực. Cron ngoài cũng phải gửi `Authorization: Bearer <CRON_SECRET>`.
3. Sau khi deploy, bấm **Đăng nhập quản trị**, nhập username `admin`, password là `ADMIN_SECRET`. Chỉ sử dụng HTTPS khi truy cập bản triển khai. Trình duyệt lưu thông tin HTTP Basic trong phiên; đóng phiên trình duyệt khi dùng máy chung. API quản trị cũng chấp nhận `Authorization: Bearer <ADMIN_SECRET>`.
4. Đăng ký lại webhook từ dashboard để Zalo gửi đúng `WEBHOOK_SECRET`. Có thể để trống ô secret trên dashboard để dùng cấu hình máy chủ; nếu nhập phải trùng cấu hình. Không dán khóa bí mật vào URL hoặc commit `.env`.
5. Cấu hình Upstash Redis để chống xử lý trùng giữa các serverless instance. Khi Redis đã cấu hình nhưng lỗi, thao tác lưu/khóa sẽ báo lỗi thay vì tự chuyển sang RAM. RAM chỉ phục vụ chạy cục bộ khi chưa cấu hình Redis.

Nhắc việc gửi lỗi được thử lại tối đa 5 lần, có khoảng chờ tăng dần. Sau đó lịch được giữ ở trạng thái `failed` và vẫn có trong `/reminders`; hãy kiểm tra kết nối rồi sửa giờ hoặc hoãn để kích hoạt lại. `/huynhac` yêu cầu ID hoặc `all`; thành viên chỉ hủy được lịch của chính mình. Lịch cũ không có `userId` cần quản trị viên hủy qua API đã xác thực. Ví dụ: `DELETE /api/reminder-cron?chatId=...&id=...` (hoặc `id=all`).

Webhook chống lặp theo cặp chat/message ID trong 24 giờ. Lịch sử Redis vẫn giữ định dạng JSON cũ nhưng được nối thêm nguyên tử để tránh ghi đè khi nhiều tin đến cùng lúc. Khóa ngăn các worker gửi nhắc việc đồng thời; nếu tiến trình dừng đúng lúc Zalo đã nhận tin nhưng chưa lưu trạng thái, lần thử lại vẫn có thể gửi trùng vì không có giao dịch chung với Zalo. Heartbeat mặc định mỗi 5 phút nên nhắc việc có thể trễ theo lịch chạy; tác vụ cron chịu trách nhiệm kích hoạt lịch trên Vercel.

Chạy `npm test` để kiểm tra AI/search/digest và các ca xác thực, webhook trùng, XSS bộ nhớ, hủy nhầm, lưu lịch sử đồng thời, retry và xử lý nhắc việc đồng thời. Các bài test dùng giả lập, không gửi tin nhắn Zalo thật.


Dự án Bot Zalo cá nhân / nhóm chat thông minh, tích hợp **Google Gemini AI** (`gemini-3.5-flash`), triển khai hoàn toàn **miễn phí trên Vercel** theo mô hình Serverless Function hoạt động bền bỉ **24/7** không cần máy chủ riêng.

---

## Tính Năng Nổi Bật

- **Chạy 24/7 Miễn Phí Trên Vercel**: Sử dụng Vercel Serverless Function, tự động scale, không tốn chi phí server hay VPS.
- **Tích hợp Google Gemini 2.5 Flash / 3.5 Flash**: Phản hồi siêu nhanh (500ms - 1.5s), thông minh, xử lý đa lĩnh vực bằng tiếng Việt tự nhiên.
- **Trí Nhớ Hội Thoại 24/7 Bền Bỉ (Upstash Redis)**: Lưu trữ lịch sử chat nhiều lượt (multi-turn), ghi nhớ ngữ cảnh riêng biệt cho từng thành viên trong nhóm, không bị mất dữ liệu khi serverless function ngủ đông.
- **Nhận Thức Thời Gian Thực Tuyệt Đối (Real-Time Context Anchor)**: Tự động neo mốc thời gian thực tế chuẩn múi giờ Việt Nam (GMT+7) vào từng lượt câu hỏi, loại bỏ hoàn toàn lỗi mô hình AI bị "neo tư duy" theo các mốc ngày cũ trong lịch sử trò chuyện.
- **Đọc & Phân Tích Hình Ảnh Thông Minh (Gemini Vision Multimodal)**: Tự động đọc và phân tích chi tiết hình ảnh khi thành viên gửi ảnh kèm chú thích hoặc nhấn Trả lời (Reply / Quote) vào một bức ảnh đã gửi trong nhóm và tag tên bot. Bot sử dụng năng lực thị giác máy tính của Gemini để nhận diện sản phẩm, thương hiệu, thành phần, nhãn mác, đọc chữ viết và tư vấn chuẩn xác.
- **Trạng Thái Đang Soạn Tin Nhắn Thời Gian Thực (Typing Indicator)**: Tự động kích hoạt trạng thái "đang soạn tin..." (sendChatAction) trên giao diện chat Zalo ngay khi nhận được tin nhắn, tự động duy trì tín hiệu liên tục trong lúc AI đang xử lý (phân tích hình ảnh, tra cứu thông tin mạng, suy nghĩ câu trả lời hoặc sinh ảnh nghệ thuật), giúp người dùng biết bot đang chuẩn bị phản hồi.
- **Tóm Tắt Cuộc Trò Chuyện Thông Minh (Conversation Recap)**: Tự động trích xuất và tóm tắt súc tích 20 tin nhắn gần nhất trong nhóm bằng AI, phân loại các chủ đề thảo luận chính và các điểm đáng chú ý/thống nhất của các thành viên (tóm tắt cuộc trò chuyện, tóm tắt 20 tin nhắn gần nhất, /tomtat, /summary).
- **Tra Cứu Google Thời Gian Thực (SerpApi Web Search)**: Tự động phân tích câu hỏi để tra cứu thông tin thời sự, kết quả bóng đá, sự kiện nóng mới nhất trên Google và đối chiếu mốc thời gian thực tế.
- **Lời Chúc & Điểm Tin Sáng Tự Động (Daily Morning Digest)**: Cron heartbeat chạy mỗi 5 phút và gửi bản tin trong khung **7:30–7:44 sáng (GMT+7)**, chống gửi lặp trong ngày. Địa điểm thời tiết mặc định là Hà Nội; có thể đổi bằng `DEFAULT_WEATHER_CITY` (ví dụ `hcm`). Có thể gõ `/morning` để xem trước.
- **Hẹn Giờ & Nhắc Việc Thông Minh (Reminders & Scheduler)**: Nhận diện ngôn ngữ tự nhiên tiếng Việt chuẩn xác (`nhắc anh 10 phút nữa...`, `nhắc em mai 8h sáng...`, `14h20 gọi 2 em của anh là Tường và Lộc dậy`, `15h nhắc họp phòng ban`, `/remind 15:30 họp phòng ban`). Hỗ trợ hàng đợi thời gian thực trên **Upstash Redis Delay Queue**, gửi thông báo qua GitHub Actions Heartbeat / Cron (`/api/reminder-cron`); độ trễ phụ thuộc thời điểm cron chạy. Có lệnh xem danh sách (`/reminders`) và hủy nhắc hẹn (`/huynhac`).
- **Tạo Ảnh & Vẽ Tranh AI (Text-to-Image)**: Tự động nhận diện yêu cầu vẽ tranh tiếng Việt (`vẽ...` hoặc `/draw...`), tối ưu hóa prompt qua Gemini và tạo tác phẩm nghệ thuật 8K sắc nét (mô hình Flux) gửi trực tiếp vào nhóm Zalo.
- **Gửi Ảnh Đại Diện Tự Động (Google Drive / CDN)**: Khi thành viên yêu cầu xem mặt / xem hình / xem ảnh của bot, bot sẽ tự động quét thư mục Google Drive và bốc ngẫu nhiên ảnh gửi kèm lời chào dễ thương.
- **Hỗ Trợ Nhóm Chat Zalo Tuyệt Vời**:
  - Nhận diện khi được thành viên **@mention** (`@Tên_Bot [câu hỏi]`).
  - Tự động bắt sự kiện khi thành viên **Reply (Trả lời)** vào tin nhắn của bot.
  - Tự động làm sạch thẻ tag để trích xuất đúng câu hỏi gửi cho AI.
- **Tối Ưu Định Dạng Cho Zalo**:
  - Tự động chuẩn hóa câu trả lời: gạch đầu dòng rõ ràng, in đậm từ khóa, kèm emoji sinh động.
  - Tự động chia nhỏ tin nhắn (chunking) thông minh nếu phản hồi dài vượt quá 2.000 ký tự (giới hạn của Zalo).
- **Giao Diện Web Quản Trị Đẹp Mắt**:
  - Tích hợp sẵn Dashboard cấu hình Webhook **1-Click** ngay trên trình duyệt.
  - Kiểm tra trạng thái kết nối bot (`testWebhook`, `getMe`).
  - Khung thử nghiệm tương tác trực tiếp với Gemini AI (Chat Simulator).

---

## Cấu Trúc Dự Án

```
├── api/
│   ├── webhook.js         # Endpoint nhận webhook sự kiện từ Zalo (POST /api/webhook)
│   ├── reminder-cron.js   # Endpoint cron quét định kỳ nhắc việc & Điểm tin sáng
│   ├── memory.js          # Endpoint kiểm tra bộ nhớ trò chuyện (GET /api/memory)
│   ├── setup.js           # API phục vụ cấu hình & kiểm tra hệ thống trên Dashboard
│   └── test-chat.js       # API test chat Gemini trực tiếp từ Web Dashboard
├── lib/
│   ├── bot-service.js     # Thư viện gọi Zalo Bot API (sendMessage, sendPhoto, setWebhook...)
│   ├── gemini-service.js  # Tích hợp Google Gemini AI, Intent Routing & Real-time Anchor
│   ├── memory-service.js  # Quản lý bộ nhớ trò chuyện multi-turn qua Upstash Redis REST
│   ├── reminder-service.js# Phân tích cú pháp hẹn giờ tiếng Việt & xử lý hàng đợi nhắc việc
│   ├── weather-service.js # Dịch vụ tra cứu dự báo thời tiết Open-Meteo chuẩn xác
│   ├── daily-digest-service.js # Lời chúc, thời tiết & điểm tin sáng tự động 7h30
│   ├── search-service.js  # Tra cứu thông tin thời gian thực từ Google qua SerpApi
│   ├── avatar-service.js  # Quét và bốc ngẫu nhiên avatar từ thư mục Google Drive
│   └── image-service.js   # Tạo prompt và render ảnh vẽ nghệ thuật AI (Flux / Polinations)
├── public/
│   ├── index.html         # Giao diện Web Dashboard quản trị hiện đại
│   ├── style.css          # Giao diện Dark Mode cao cấp
│   └── app.js             # Logic xử lý Dashboard phía client
├── scripts/
│   ├── set-webhook.js     # Script CLI cài đặt Webhook nhanh qua dòng lệnh
│   ├── test-bot.js        # Script kiểm tra chẩn đoán Token & Gemini Key
│   └── local-dev.js       # Local Express dev server cho môi trường test
├── vercel.json            # Cấu hình runtime Vercel (hạn mức 30s xử lý)
├── .env.example           # File mẫu biến môi trường
└── package.json           # Danh mục dependencies & scripts
```

---

## Hướng Dẫn Triển Khai Lên Vercel (Chạy 24/7)

### Bước 1: Chuẩn bị Khóa API

1. **Zalo Bot Token**: Bạn đã tạo bot và có chuỗi Token dạng `123456789:AaBbCc...` từ Zalo Bot Creator / Bot Platform.
2. **Google Gemini API Key**:
   - Truy cập: [Google AI Studio](https://aistudio.google.com/apikey)
   - Đăng nhập tài khoản Google và bấm **"Create API key"** (Hoàn toàn miễn phí).
3. **Upstash Redis (Miễn phí)**:
   - Truy cập: [console.upstash.com](https://console.upstash.com)
   - Tạo Database Redis Serverless miễn phí, copy `UPSTASH_REDIS_REST_URL` và `UPSTASH_REDIS_REST_TOKEN`.
   - Cần thiết để lưu bền vững danh sách nhóm nhận điểm tin giữa các Vercel Serverless Function; chỉ dùng RAM có thể khiến cron không tìm thấy nhóm.
4. **SerpApi Key (Tùy chọn)**:
   - Đăng ký tại [serpapi.com](https://serpapi.com) để ưu tiên tìm kiếm Google thời gian thực. Khi SerpApi hết quota hoặc gặp lỗi, bot sẽ tự động thử DuckDuckGo.

---

### Bước 2: Import Vào Vercel

1. Truy cập [vercel.com](https://vercel.com) và đăng nhập bằng GitHub.
2. Bấm **"Add New..." > "Project"** và chọn Repository `HUY1602/Bot-chat-Zalo`.
3. Tại mục **Environment Variables**, cấu hình các biến sau:
   - `ZALO_BOT_TOKEN`: Token bot Zalo.
   - `FREEMODEL_API_KEY`: API Key FreeModel (được ưu tiên gọi trước nếu cấu hình).
   - `FREEMODEL_MODEL`: Model dùng qua FreeModel (mặc định `gpt-6-luna`).
   - `GEMINI_API_KEY`: API Key Google Gemini, dùng dự phòng khi FreeModel lỗi.
   - `GEMINI_MODEL`: Model Gemini dự phòng (`gemini-3.5-flash-lite` hoặc `gemini-2.5-flash`).
   - `UPSTASH_REDIS_REST_URL`: URL REST của Upstash Redis (cần để lưu bộ nhớ và danh sách nhóm nhận điểm tin).
   - `UPSTASH_REDIS_REST_TOKEN`: Token REST của Upstash Redis.
   - `SERPAPI_API_KEY`: API Key SerpApi (tra cứu Google).
   - `BOT_AVATAR_URL`: Link thư mục Google Drive chứa ảnh avatar (hoặc link ảnh).
   - `DEFAULT_WEATHER_CITY`: `hanoi` (mặc định), `hcm`, `danang`... cho dự báo thời tiết buổi sáng.
4. Bấm nút **"Deploy"**. Đợi khoảng 30 giây bạn sẽ nhận được đường link Vercel công khai (ví dụ: `https://bot-chat-zalo-one.vercel.app`).

Khi FreeModel trả lời quá dài hoặc bị ngắt, bot sẽ thử lại FreeModel với yêu cầu trả lời gọn trước; chỉ chuyển sang Gemini nếu FreeModel vẫn lỗi.

Điểm tin được kích hoạt bởi GitHub Actions heartbeat mỗi 5 phút trong khung 7:30–7:44 (GMT+7). Nếu không gửi, kiểm tra tab Actions của repository và trạng thái Upstash trên Dashboard; workflow hiện sẽ báo lỗi gọi Vercel thay vì bỏ qua âm thầm.

---

### Bước 3: Kích Hoạt Webhook Lên Zalo

1. Mở đường link Vercel của bạn trên trình duyệt (ví dụ: `https://bot-chat-zalo-huy.vercel.app`).
2. Giao diện Dashboard quản trị hiện đại sẽ xuất hiện:
   - Bấm nút **"Lấy Domain Này"** (ô URL sẽ tự điền `https://bot-chat-zalo-huy.vercel.app/api/webhook`).
   - Bấm nút **"Kích Hoạt Webhook Lên Zalo"**.
3. Khi thấy thông báo màu xanh **"ĐĂNG KÝ WEBHOOK THÀNH CÔNG"**, hệ thống Zalo đã liên kết với Vercel của bạn!

*(Bạn cũng có thể chạy lệnh từ máy tính: `npm run set-webhook https://bot-chat-zalo-huy.vercel.app/api/webhook`)*

---

### Bước 4: Đưa Bot Vào Nhóm Zalo

1. Mở ứng dụng quản lý Zalo Bot Creator hoặc trang tạo Bot của bạn.
2. Lấy **Liên kết mời bot (Invite Link)** và gửi vào nhóm Zalo bạn muốn bot tham gia.
3. Trưởng nhóm xác nhận thêm Bot vào nhóm.
4. **Cách trò chuyện với Bot trong nhóm:**
   - Tag tên bot để hỏi đáp: `@Tên_Bot giải thích ngắn gọn về định luật vạn vật hấp dẫn`
   - Hoặc bấm **Trả lời (Reply)** vào bất kỳ câu nói nào của Bot.
   - **Hẹn giờ & Nhắc việc:**
     - `@Tên_Bot nhắc anh 10 phút nữa đi uống nước nha`
     - `@Tên_Bot nhắc em mai 8h sáng nộp báo cáo`
     - `@Tên_Bot nhắc nhóm 15h30 chiều nay họp dự án`
     - `/remind 30m kiểm tra tiến độ`
     - `/reminders`: Xem danh sách việc đang hẹn của nhóm.
     - `/huynhac [ID]` hoặc `/huynhac all`: Hủy lịch nhắc hẹn.
   - **Vẽ tranh AI:** `@Tên_Bot vẽ chú mèo phi hành gia ngoài vũ trụ` hoặc `/draw phong cảnh anime...`
   - **Xem ảnh đại diện của Bot:** `cho xem ảnh bot`, `xem mặt bot`, `gửi ảnh em`
   - Gõ `/help` để xem hướng dẫn sử dụng.
   - Gõ `/ping` để kiểm tra trạng thái hoạt động của Bot.

---

### Cài Đặt Ảnh Đại Diện Bot Từ Thư Mục Google Drive (Tự Động Random)

Bạn **KHÔNG CẦN dán từng link ảnh**! Bạn có thể dán nguyên **link 1 thư mục (Folder) Google Drive**, bot sẽ tự động quét toàn bộ ảnh trong đó và random mỗi lần được hỏi:

1. **Tạo 1 thư mục trên Google Drive** (ví dụ: `Avatar Bot Zalo`).
2. **Tải tất cả ảnh bạn muốn vào thư mục đó** (jpg, png, webp, gif...).
3. **Chia sẻ thư mục công khai:**
   - Chuột phải vào Thư mục > Chọn **Chia sẻ (Share)**.
   - Ở mục *Quyền truy cập chung*, đổi sang: **"Bất kỳ ai có đường liên kết đều có thể xem"** (Anyone with the link can view).
   - Bấm **Sao chép đường liên kết** (Link có dạng: `https://drive.google.com/drive/folders/1a2b3c4d5e...`).
4. **Cấu hình trên Vercel** (hoặc file `.env`):
   - Thêm biến `BOT_AVATAR_URL` và dán thẳng link thư mục:
     ```env
     BOT_AVATAR_URL=https://drive.google.com/drive/folders/1a2b3c4d5e...
     ```
   - *(Hoặc bạn cũng có thể dùng biến riêng: `GOOGLE_DRIVE_FOLDER_URL=https://drive.google.com/drive/folders/...`)*
5. **Cách Bot Hoạt Động:**
   - **Tự động nhận diện:** Bot phát hiện link folder, tự nạp tất cả file ảnh mà **KHÔNG CẦN API Key hay OAuth**.
   - **Random thông minh:** Mỗi khi thành viên hỏi *"cho xem ảnh bot"*, *"xem mặt em"*, *"ảnh khác đi"*, bot sẽ bốc ngẫu nhiên 1 ảnh (đảm bảo không bị trùng 2 lần liên tiếp).
   - **Tốc độ cao:** Ảnh được nạp qua Google Direct CDN (`lh3.googleusercontent.com/d/ID`), gửi ảnh nhị phân trực tiếp đến Zalo.
   - **Thêm ảnh không cần sửa code:** Khi muốn thêm ảnh mới, bạn chỉ cần ném thêm ảnh vào folder Drive trên điện thoại/máy tính, bot sẽ tự động cập nhật!

---

## Kiểm Tra & Chạy Thử Ở Local

Nếu bạn muốn kiểm tra cấu hình hoặc chạy thử nghiệm tại máy cá nhân:

1. Mở file `.env` và điền `ZALO_BOT_TOKEN` và `GEMINI_API_KEY`.
2. Kiểm tra kết nối token và Gemini:
   ```bash
   npm run test-bot
   ```
   Kiểm tra trực tiếp FreeModel bằng một câu hỏi ngắn (dùng `FREEMODEL_API_KEY` trong `.env`, không in khóa ra màn hình):
   ```bash
   npm run test-freemodel
   ```
3. Khởi động Web Dashboard nội bộ:
   ```bash
   npm run dev
   ```
   Truy cập `http://localhost:3001` trên trình duyệt để kiểm tra thử nghiệm.

---
