# 🤖 Zalo Gemini Bot - Trợ Lý AI Hỏi Đáp Nhóm 24/7 (Vercel Serverless)

Dự án Bot Zalo cá nhân / nhóm chat thông minh, tích hợp **Google Gemini AI** (`gemini-2.5-flash`), triển khai hoàn toàn **miễn phí trên Vercel** theo mô hình Serverless Function hoạt động bền bỉ **24/7** không cần máy chủ riêng.

---

## 🌟 Tính Năng Nổi Bật

- ⚡ **Chạy 24/7 Miễn Phí Trên Vercel**: Sử dụng Vercel Serverless Function, tự động scale, không tốn chi phí server hay VPS.
- 🧠 **Tích hợp Google Gemini 2.5 Flash**: Phản hồi siêu nhanh (500ms - 1.5s), thông minh, xử lý đa lĩnh vực bằng tiếng Việt tự nhiên.
- 👥 **Hỗ Trợ Nhóm Chat Zalo Tuyệt Vời**:
  - Nhận diện khi được thành viên **@mention** (`@Tên_Bot [câu hỏi]`).
  - Tự động bắt sự kiện khi thành viên **Reply (Trả lời)** vào tin nhắn của bot.
  - Tự động làm sạch thẻ tag để trích xuất đúng câu hỏi gửi cho AI.
- 🎨 **Tối Ưu Định Dạng Cho Zalo**:
  - Tự động chuẩn hóa câu trả lời: gạch đầu dòng rõ ràng, in đậm từ khóa, kèm emoji sinh động.
  - Tự động chia nhỏ tin nhắn (chunking) thông minh nếu phản hồi dài vượt quá 2.000 ký tự (giới hạn của Zalo).
- 🛠️ **Giao Diện Web Quản Trị Đẹp Mắt**:
  - Tích hợp sẵn Dashboard cấu hình Webhook **1-Click** ngay trên trình duyệt.
  - Kiểm tra trạng thái kết nối bot (`testWebhook`, `getMe`).
  - Khung thử nghiệm tương tác trực tiếp với Gemini AI (Chat Simulator).

---

## 🏗️ Cấu Trúc Dự Án

```
├── api/
│   ├── webhook.js         # Endpoint nhận webhook sự kiện từ Zalo (POST /api/webhook)
│   ├── bot-service.js     # Thư viện gọi Zalo Bot API (sendMessage, setWebhook, testWebhook, getMe)
│   ├── gemini-service.js  # Tích hợp Google GenAI SDK & chuẩn hóa định dạng Zalo
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

## 🚀 Hướng Dẫn Triển Khai Lên Vercel (Chạy 24/7)

### Bước 1: Chuẩn bị Khóa API

1. **Zalo Bot Token**: Bạn đã tạo bot và có chuỗi Token dạng `123456789:AaBbCc...` từ Zalo Bot Creator / Bot Platform.
2. **Google Gemini API Key**:
   - Truy cập: [Google AI Studio](https://aistudio.google.com/apikey)
   - Đăng nhập tài khoản Google và bấm **"Create API key"** (Hoàn toàn miễn phí).

---

### Bước 2: Import Vào Vercel

1. Truy cập [vercel.com](https://vercel.com) và đăng nhập bằng GitHub.
2. Bấm **"Add New..." > "Project"** và chọn Repository `HUY1602/Bot-chat-Zalo`.
3. Tại mục **Environment Variables**, thêm 2 biến sau:
   - `ZALO_BOT_TOKEN`: Dán token bot Zalo của bạn.
   - `GEMINI_API_KEY`: Dán khóa API Google Gemini của bạn.
   - *(Tùy chọn)* `GEMINI_MODEL`: `gemini-2.5-flash`
4. Bấm nút **"Deploy"**. Đợi khoảng 30 giây bạn sẽ nhận được đường link Vercel công khai (ví dụ: `https://bot-chat-zalo-huy.vercel.app`).

---

### Bước 3: Kích Hoạt Webhook Lên Zalo

1. Mở đường link Vercel của bạn trên trình duyệt (ví dụ: `https://bot-chat-zalo-huy.vercel.app`).
2. Giao diện Dashboard quản trị hiện đại sẽ xuất hiện:
   - Bấm nút **"Lấy Domain Này"** (ô URL sẽ tự điền `https://bot-chat-zalo-huy.vercel.app/api/webhook`).
   - Bấm nút **"🚀 Kích Hoạt Webhook Lên Zalo"**.
3. Khi thấy thông báo màu xanh **"ĐĂNG KÝ WEBHOOK THÀNH CÔNG"**, hệ thống Zalo đã liên kết với Vercel của bạn!

*(Bạn cũng có thể chạy lệnh từ máy tính: `npm run set-webhook https://bot-chat-zalo-huy.vercel.app/api/webhook`)*

---

### Bước 4: Đưa Bot Vào Nhóm Zalo

1. Mở ứng dụng quản lý Zalo Bot Creator hoặc trang tạo Bot của bạn.
2. Lấy **Liên kết mời bot (Invite Link)** và gửi vào nhóm Zalo bạn muốn bot tham gia.
3. Trưởng nhóm xác nhận thêm Bot vào nhóm.
4. **Cách trò chuyện với Bot trong nhóm:**
   - Tag tên bot: `@Tên_Bot giải thích ngắn gọn về định luật vạn vật hấp dẫn`
   - Hoặc bấm **Trả lời (Reply)** vào bất kỳ câu nói nào của Bot.
   - Gõ `/help` để xem hướng dẫn sử dụng.
   - Gõ `/ping` để kiểm tra trạng thái hoạt động của Bot.

---

## 💻 Kiểm Tra & Chạy Thử Ở Local

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

## 🔒 Bảo Mật & Lưu Ý Quan Trọng

- **Không chia sẻ file `.env`**: File này chứa các Token và Secret bảo mật, `.gitignore` đã tự động loại trừ nó khỏi git.
- **Giới hạn tin nhắn Zalo**: Bot đã tích hợp cơ chế tự động chia nhỏ văn bản thông minh đảm bảo không bị lỗi tràn giới hạn 2.000 ký tự của Zalo.
- **Tránh trùng lặp tin nhắn**: Webhook đã có bộ nhớ đệm chống xử lý trùng (Deduplication Cache) khi Zalo thực hiện cơ chế gửi lại (retry event).

Chúc bạn có một chú bot AI phục vụ nhóm Zalo thật hữu ích và mượt mà! 🚀
