# CARO ONLINE (Gomoku 15x15, Socket.IO)

```
caro/
├─ server.js        # Express + Socket.IO: phòng, ghép trận, luật chơi, timer 30s, reconnect (kiểm tra ở server)
├─ package.json
├─ render.yaml      # cấu hình Render (Blueprint)
├─ .env.example
└─ public/          # frontend tĩnh: index.html, config.js
```

## Chạy thử trên máy (chỉ để test)
`npm install && npm start` → mở http://localhost:3000 ở 2 tab/2 thiết bị cùng mạng.

## Triển khai Internet (không phụ thuộc máy bạn)
### Cách đơn giản nhất: 1 dịch vụ trên Render (server phục vụ luôn frontend)
1. Đưa thư mục này lên GitHub.
2. Render → New → Blueprint (hoặc Web Service: Build `npm install`, Start `node server.js`, Health check `/health`).
3. Mở URL `https://<tên>.onrender.com` ở hai thiết bị, hai mạng khác nhau.

### Tách frontend (Vercel / Cloudflare Pages)
1. Deploy backend lên Render như trên, đặt biến môi trường `CORS_ORIGIN=https://<frontend>.vercel.app`.
2. Sửa `public/config.js`: `window.SERVER_URL="https://<tên>.onrender.com"`.
3. Deploy thư mục `public/` lên Vercel/Cloudflare Pages (static, không cần build).
Railway cũng dùng được: Start command `node server.js`, nó tự cấp `PORT`.

## Website độc lập, PWA, tên miền, database
- **PWA:** `manifest.webmanifest`, `sw.js`, icon đã có. Chrome/Edge/Android: menu → "Cài đặt ứng dụng"; iOS Safari: Chia sẻ → "Thêm vào MH chính". Cần HTTPS (Render/Vercel tự cấp). Game vẫn cần Internet để chơi.
- **Database (khuyến nghị):** tạo project Supabase (hoặc Neon/Render Postgres), lấy chuỗi kết nối (Supabase: dùng *connection pooler* URI) → đặt biến môi trường `DATABASE_URL` trên Render. Bảng `rooms` tự tạo khi server chạy. Server lưu snapshot phòng sau mỗi thay đổi và nạp lại khi khởi động; người chơi tự kết nối lại và ván tiếp tục. Không đặt `DATABASE_URL` thì chạy RAM. Không commit chuỗi kết nối vào Git.
- **Tên miền riêng:** mua ở nhà đăng ký bất kỳ → Render/Vercel → Settings → Custom Domains → trỏ DNS theo hướng dẫn. Nếu tách frontend, cập nhật `CORS_ORIGIN` (nhiều domain cách nhau dấu phẩy) và `config.js`.
- **24/7:** cần backend không ngủ (gói trả phí, vd. Render Starter). Gói free sẽ ngủ; ping định kỳ để giữ thức là mẹo không đảm bảo và có thể trái điều khoản/giới hạn giờ của gói, nên không khuyến nghị.

## Giới hạn quan trọng (đọc kỹ)
- **Gói free của Render ngủ sau ~15 phút không có truy cập**; lần đầu truy cập sau đó mất ~30–60 giây để thức dậy, và mọi ván/phòng đang có sẽ mất khi server ngủ hoặc khởi động lại. Muốn chạy 24/7 ổn định cần gói trả phí (ví dụ Render Starter) – hãy kiểm tra giá/giới hạn hiện hành trên trang của nhà cung cấp.
- Server chạy **1 instance** (không scale ngang); timer và kết nối nằm trong RAM. Có `DATABASE_URL` thì phòng được khôi phục sau restart; không có thì mất phòng. Ván khôi phục tính lại 30 giây cho lượt hiện tại.
- Mất kết nối: giữ chỗ 60 giây; quá hạn bị xử thua. Hết 30 giây/lượt = thua.

## Kiểm thử độc lập
Deploy xong → tắt máy cá nhân → A mở URL trên máy tính, tạo phòng → B mở trên điện thoại (4G), nhập mã → bắt đầu, chơi hết ván; thử thêm: người thứ 3 vào phòng (bị từ chối), tải lại trang giữa ván, Tìm trận bằng 2 thiết bị.
