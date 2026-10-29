# Zalo Gemini Bot - Trợ Lý AI Hỏi Đáp Nhóm 24/7 (Vercel Serverless)

Dự án Bot Zalo cá nhân / nhóm chat thông minh, tích hợp **Google Gemini AI** (`gemini-3.5-flash`), triển khai hoàn toàn **miễn phí trên Vercel** theo mô hình Serverless Function hoạt động bền bỉ **24/7** không cần máy chủ riêng.

---

## Tính Năng Nổi Bật

- **Chạy 24/7 Miễn Phí Trên Vercel**: Sử dụng Vercel Serverless Function, tự động scale, không tốn chi phí server hay VPS.
- **Tích hợp Google Gemini 2.5 Flash / 3.5 Flash**: Phản hồi siêu nhanh (500ms - 1.5s), thông minh, xử lý đa lĩnh vực bằng tiếng Việt tự nhiên.
- **Trí Nhớ Hội Thoại 24/7 Bền Bỉ (Upstash Redis)**: Lưu trữ lịch sử chat nhiều lượt (multi-turn), ghi nhớ ngữ cảnh riêng biệt cho từng thành viên trong nhóm, không bị mất dữ liệu khi serverless function ngủ đông.
- **Nhận Thức Thời Gian Thực Tuyệt Đối (Real-Time Context Anchor)**: Tự động neo mốc thời gian thực tế chuẩn múi giờ Việt Nam (GMT+7) vào từng lượt câu hỏi, loại bỏ hoàn toàn lỗi mô hình AI bị "neo tư duy" theo các mốc ngày cũ trong lịch sử trò chuyện.
- **Tóm Tắt Cuộc Trò Chuyện Thông Minh (Conversation Recap)**: Tự động trích xuất và tóm tắt súc tích 20 tin nhắn gần nhất trong nhóm bằng AI, phân loại các chủ đề thảo luận chính và các điểm đáng chú ý/thống nhất của các thành viên (	óm tắt cuộc trò chuyện, 	óm tắt 20 tin nhắn gần nhất, /tomtat, /summary).
- **Tra Cứu Google Thời Gian Thực (SerpApi Web Search)**: Tự động phân tích câu hỏi để tra cứu thông tin thời sự, kết quả bóng đá, sự kiện nóng mới nhất trên Google và đối chiếu mốc thời gian thực tế.
- **Hẹn Giờ & Nhắc Việc Thông Minh (Reminders & Scheduler)**: Nhận diện ngôn ngữ tự nhiên tiếng Việt chuẩn xác (`nhắc anh 10 phút nữa...`, `nhắc em mai 8h sáng...`, `/remind 15:30 họp phòng ban`). Hỗ trợ hàng đợi thời gian thực trên **Upstash Redis Delay Queue**, tự động réo chuông thông báo đúng giờ qua **Vercel Cron** (`/api/reminder-cron`). Có lệnh xem danh sách (`/reminders`) và hủy nhắc hẹn (`/huynhac`).
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
│   ├── bot-service.js     # Thư viện gọi Zalo Bot API (sendMessage, sendPhoto, setWebhook...)
│   ├── gemini-service.js  # Tích hợp Google Gemini AI, Intent Routing & Real-time Anchor
│   ├── memory-service.js  # Quản lý bộ nhớ trò chuyện multi-turn qua Upstash Redis REST
│   ├── reminder-service.js# Phân tích cú pháp hẹn giờ tiếng Việt & xử lý hàng đợi nhắc việc
│   ├── reminder-cron.js   # Endpoint cron quét định kỳ nhắc việc cho Vercel Cron
│   ├── search-service.js  # Tra cứu thông tin thời gian thực từ Google qua SerpApi
│   ├── avatar-service.js  # Quét và bốc ngẫu nhiên avatar từ thư mục Google Drive
│   ├── image-service.js   # Tạo prompt và render ảnh vẽ nghệ thuật AI (Flux / Polinations)
│   ├── setup.js           # API phục vụ cấu hình & kiểm tra hệ thống trên Dashboard
│   └── test-chat.js       # API test chat Gemini trực tiếp từ Web Dashboard
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
4. **SerpApi Key (Tùy chọn)**:
   - Đăng ký miễn phí tại [serpapi.com](https://serpapi.com) để bot có khả năng tìm kiếm Google thời gian thực.

---

### Bước 2: Import Vào Vercel

1. Truy cập [vercel.com](https://vercel.com) và đăng nhập bằng GitHub.
2. Bấm **"Add New..." > "Project"** và chọn Repository `HUY1602/Bot-chat-Zalo`.
3. Tại mục **Environment Variables**, cấu hình các biến sau:
   - `ZALO_BOT_TOKEN`: Token bot Zalo.
   - `GEMINI_API_KEY`: API Key Google Gemini.
   - `GEMINI_MODEL`: `gemini-3.5-flash-lite` (hoặc `gemini-2.5-flash`).
   - `UPSTASH_REDIS_REST_URL`: URL REST của Upstash Redis.
   - `UPSTASH_REDIS_REST_TOKEN`: Token REST của Upstash Redis.
   - `SERPAPI_API_KEY`: API Key SerpApi (tra cứu Google).
   - `BOT_AVATAR_URL`: Link thư mục Google Drive chứa ảnh avatar (hoặc link ảnh).
4. Bấm nút **"Deploy"**. Đợi khoảng 30 giây bạn sẽ nhận được đường link Vercel công khai (ví dụ: `https://bot-chat-zalo-one.vercel.app`).

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

### 📸 Cài Đặt Ảnh Đại Diện Bot Từ Thư Mục Google Drive (Tự Động Random)

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
   - ✨ **Tự động nhận diện:** Bot phát hiện link folder, tự nạp tất cả file ảnh mà **KHÔNG CẦN API Key hay OAuth**.
   - 🎲 **Random thông minh:** Mỗi khi thành viên hỏi *"cho xem ảnh bot"*, *"xem mặt em"*, *"ảnh khác đi"*, bot sẽ bốc ngẫu nhiên 1 ảnh (đảm bảo không bị trùng 2 lần liên tiếp).
   - ⚡ **Tốc độ cao:** Ảnh được nạp qua Google Direct CDN (`lh3.googleusercontent.com/d/ID`), gửi ảnh nhị phân trực tiếp đến Zalo.
   - 🔄 **Thêm ảnh không cần sửa code:** Khi muốn thêm ảnh mới, bạn chỉ cần ném thêm ảnh vào folder Drive trên điện thoại/máy tính, bot sẽ tự động cập nhật!

---

## Kiểm Tra & Chạy Thử Ở Local

Nếu bạn muốn kiểm tra cấu hình hoặc chạy thử nghiệm tại máy cá nhân:

1. Mở file `.env` và điền `ZALO_BOT_TOKEN` và `GEMINI_API_KEY`.
2. Kiểm tra kết nối token và Gemini:
   ```bash
   npm run test-bot
   ```
3. Khởi động Web Dashboard nội bộ:
   ```bash
   npm run dev
   ```
   Truy cập `http://localhost:3001` trên trình duyệt để kiểm tra thử nghiệm.

---
