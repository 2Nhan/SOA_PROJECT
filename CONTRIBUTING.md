# Hướng Dẫn Dành Cho Lập Trình Viên (Developer Guide)

Tài liệu này hướng dẫn các thành viên trong team cách làm việc với kiến trúc **Microservices (Database-per-Service)** mới của dự án. Để giữ cho source code sạch sẽ, dễ maintain và tuân thủ nguyên tắc DRY (Don't Repeat Yourself), mời mọi người đọc kỹ các quy chuẩn dưới đây trước khi code.

---

## 1. Cấu Trúc Thư Mục Mới Nhất

Hệ thống đã được quy hoạch lại để rõ ràng ranh giới giữa giao diện (Web UI) và nền tảng giao tiếp (API/Client). Mỗi Microservice sẽ có cấu trúc lõi bên trong thư mục `src/` như sau:

```text
microservices/[service-name]/src/
├── api/          # ⬅️ INTERNAL API: Trả về dữ liệu thô (JSON) cho các service khác gọi.
├── clients/      # ⬅️ HTTP CLIENTS: Code dùng để gọi (fetch/axios) sang service khác.
├── controllers/  # ⬅️ WEB UI: Trả về giao diện (HTML/EJS), redirect trang, báo lỗi cho user thật.
├── models/       # ⬅️ DATABASE MODELS: Thao tác trực tiếp với Database của chính nó.
├── routes/       # ⬅️ ROUTERS: Khai báo các endpoint.
└── config/       # ⬅️ Cấu hình Local.
```

### 💡 Sự khác biệt bạn cần nắm rõ:
- **`controllers/` vs `api/`**: 
  - Nếu bạn viết code in ra giao diện Web (`res.render`) ➡️ Đặt trong `controllers/`.
  - Nếu bạn viết code xuất ra JSON cho service khác hoặc frontend độc lập xài (`res.json`) ➡️ Đặt trong `api/`.
- **`clients/`**: Trước đây là `services/`. Nay được đổi thành `clients/` để hiểu rõ đây là code **đóng vai trò như một khách hàng** gửi HTTP request sang Microservice khác. (Ví dụ: Shop muốn lấy danh sách Product từ Supplier thì dùng `supplier.client.js`).

---

## 2. Thư mục Khởi Nguồn: `shared/`

Để tránh việc copy-paste code từ service này sang service khác, dự án có thư mục `shared/` nằm ở ngoài cùng (root).

```text
shared/
├── clients/      # Chứa các HTTP clients dùng chung (Vd: auth.client.js dùng cho cả Shop và Supplier)
├── config/       # Wrapper cấu hình Database nội bộ (db.config.js)
├── middlewares/  # Middleware xác thực (auth.middleware.js) & xử lý lỗi xài chung
└── utils/        # Hàm helper dùng chung
```

**⚠️ Lưu ý quan trọng:** Không viết lại logic Database, File Upload, hay Check Login ở từng service. Hãy luôn Import từ `shared/`.

---

## 3. Quy Chuẩn Đặt Tên (Naming Convention)

Để tránh lộn xộn giữa PascalCase, camelCase và kebab-case, toàn team thống nhất:

1. **Files & Folders**: `kebab-case.loại-file.js`
   - ✅ Đúng: `shop.routes.js`, `product-api.controller.js`, `auth.client.js`.
   - ❌ Sai: `ShopRoutes.js`, `productApiController.js`.
2. **Classes / Models**: `PascalCase`
   - Vd: `const Product = require("../models/product.model");`
3. **Variables / Functions**: `camelCase`
   - Vd: `const shopController = ...`, `function getProductById() { ... }`

---

## 4. Cách Thêm Một Tính Năng Mới (Workflow)

Giả sử bạn cần tạo luồng: **"Admin xem danh sách báo cáo vi phạm của Shop"**.

1. **Xác định Data Ownership:** Data báo cáo này nằm ở database nào? Điển hình là `supplier_db`.
2. **Khai báo Internal API (Nếu service khác cần):** Dữ liệu nằm ở Supplier, nên bên Supplier bạn tạo file `src/api/report.api.js` xuất ra dữ liệu JSON.
3. **Gọi Client:** Bên service cần xem (VD: Auth service hoặc Shop service) muốn request sang, bạn tạo File `src/clients/supplier.client.js` có hàm `getReports()`.
4. **Rendering Web UI:** Tại service hiển thị, bạn tạo file `src/controllers/report.controller.js` gọi `supplier.client.js` và `res.render(...)` ra màn hình tương ứng.

---

## 5. Lưu Ý Về Build Docker
Trong kiến trúc mới, Docker context là Thư Mục Root (thư mục ngoài cùng của toàn bộ dự án). Đừng chạy lệnh `docker build` ở trong thư mục con nữa.

**Cách build thủ công (nếu cần test Docker):**
```bash
# Đứng tại thư mục root AWS_LAB/
docker build -t shop -f ./microservices/shop/docker/Dockerfile .
```
Lệnh trên cho phép Docker container copy được cả thư mục code của service lẫn thư mục `shared/`.

Chúc các bạn code vui vẻ, ít bug và tuân thủ DRY! 🎉
