# FreeRoute 🚀

> **Cổng chuyển tiếp AI cục bộ, siêu nhẹ (0 thư viện phụ thuộc), thông minh, bảo mật và miễn phí.**  
> Tự động gộp, định tuyến thông minh và chuyển đổi định dạng giữa các nhà cung cấp AI miễn phí tốt nhất thế giới (Groq, Cerebras, OpenRouter, Google Gemini, GitHub Models, Mistral, SiliconFlow, Cohere, Hugging Face, Ollama).

[English Documentation](./README.md) | **[Tài liệu Tiếng Việt](./README.vi.md)**

---

## 🌟 Tính Năng Nổi Bật

- **0 Runtime Dependencies**: Xây dựng hoàn toàn bằng Node.js tiêu chuẩn (Native HTTP, Crypto, SQLite). Khởi động trong **< 50ms**, chiếm chưa tới **35MB RAM**.
- **⚡ Nhập Khóa 1-Click Tự Động & Không Trùng Lặp**: Tự động phát hiện database của OmniRoute và 9router trên máy cá nhân, giải mã và lưu trữ riêng biệt từng tài khoản (ví dụ 11 accounts Kiro, 12 keys OpenRouter...). Nếu phát hiện provider lạ, hệ thống **chủ động tạo ngay Custom Provider** và nạp model tương ứng.
- **🌐 Kho 80+ Nhà Cung Cấp Đa Tầng**: Tích hợp danh mục phong phú từ OmniRoute và 9router (bao gồm **Kiro AI / AWS Q Developer**, **Google Antigravity**, **Cline**, **Blackbox**, **AliCode**, **Kimi**...), phân loại rõ ràng **Ưu tiên Miễn phí (Free Tier)** ở trên và **Thương mại (Commercial)** ở dưới.
- **⏱️ Cơ Chế Cooldown Lũy Tiến Thông Minh (Stepped Backoff)**: Khi 1 model/key fail liên tục mà không có thông báo reset quota:
  - 3 lần fail liên tục ➔ cooldown **5 phút**.
  - 4 lần fail liên tục ➔ tăng lên **30 phút**.
  - 5 lần fail liên tục ➔ tăng lên **1 giờ**.
  - 6+ lần fail liên tục ➔ chạm trần **3 giờ** (tối đa).
  - Khi model được gọi lại và trả lời thành công ➔ tự động reset chuỗi lỗi và cooldown về 0!
- **🔄 Tự Động Bắt Lỗi Tràn Ngữ Cảnh (Context Overflow)**: Khi model fail vì input quá dài (vượt context window):
  - Hệ thống tự động chuyển tiếp sang model có ngữ cảnh lớn hơn.
  - Nếu tất cả model đều fail vì nguyên nhân input quá lớn, FreeRoute gửi phản hồi rõ ràng yêu cầu người dùng làm mới phiên (clear context/new session).
- **📚 Danh Mục Model Thông Minh (Sort & Filter)**: Sắp xếp theo Model ID, Provider, Phân hạng Free/Paid, Độ ưu tiên, cùng bộ lọc đa chiều theo Nhà cung cấp và Tính năng (Chat, Tools, Vision).
- **📡 Bảng Giám Sát Sức Khỏe Trực Quan (NOC Health Matrix)**: Theo dõi trạng thái từng provider qua ma trận đèn báo (🟢 Khỏe mạnh, 🟡 Hạ nhiệt, 🔴 Lỗi), thanh đo tỉ lệ thành công, độ trễ P50/P90 và bảng dòng sự kiện định tuyến (Routing Stream) hiển thị rõ các lần Fallback cứu nguy.
- **Song Ngữ Toàn Diện (Tiếng Việt & English)**: Giao diện Web Dashboard Dark mode cao cấp, chuyển đổi ngôn ngữ 1-click tức thì với bố cục co giãn đàn hồi chống vỡ chữ.
- **Tự Động Nạp Model (Auto-Seeding & Discovery)**: Khi kết nối bất kỳ nhà cung cấp nào, danh sách các model tốt nhất sẽ tự động được nạp vào hệ thống để dùng ngay lập tức mà không cần chờ đợi.
- **Định Tuyến Thông Minh (Auto Routing Profiles)**:
  - `auto:free`: Ưu tiên các model hoàn toàn miễn phí, độ ổn định cao.
  - `auto:fast`: Tối ưu độ trễ và tốc độ sinh token (Cerebras ~1800 tok/s, Groq ~500 tok/s).
  - `auto:code`: Dành riêng cho lập trình và gọi hàm (function calling / tool use).
  - `auto:vision`: Hỗ trợ đọc hiểu hình ảnh và tài liệu đa phương tiện.
  - `auto:long-context`: Dành cho tài liệu lớn, ngữ cảnh dài (Google Gemini 1M+ tokens).
- **Bảo Mật Cấp Cao**: Mã hóa API Key bằng AES-256-GCM ngay trên máy cá nhân (`keys.db`). Không gửi bất kỳ dữ liệu nhạy cảm hay API key nào ra ngoài máy của bạn.
- **Tự Động Chuyển Vùng Khi Lỗi (Smart Failover)**: Tự động thử lại nhà cung cấp khác nếu gặp lỗi giới hạn tần suất (Rate Limit 429) hoặc sự cố tạm thời (5xx).


---

## 🌐 Danh Mục Nhà Cung Cấp & Link Lấy API Key

FreeRoute tích hợp sẵn cấu hình và danh mục từ các dự án mã nguồn mở hàng đầu (*9router, OmniRoute, freellmapi, CLIProxyAPI*):

| Nhà Cung Cấp | Base URL Mặc Định | Hạng Mức Miễn Phí | Link Lấy API Key Miễn Phí |
| :--- | :--- | :--- | :--- |
| **OpenRouter** | `https://openrouter.ai/api/v1` | Hơn 20+ model `:free` | [Lấy Key OpenRouter](https://openrouter.ai/keys) |
| **Groq Cloud** | `https://api.groq.com/openai/v1` | Siêu tốc LPU, miễn phí hào phóng | [Lấy Key Groq](https://console.groq.com/keys) |
| **Google Gemini** | Google AI Studio | Gemini 2.5 Flash, context 1M+ | [Lấy Key Gemini](https://aistudio.google.com/app/apikey) |
| **Cerebras** | `https://api.cerebras.ai/v1` | Nhanh nhất thế giới (1800+ tok/s) | [Lấy Key Cerebras](https://cloud.cerebras.ai/platform) |
| **GitHub Models** | `https://models.github.ai/inference` | GPT-4o, Llama 3.3 qua GitHub PAT | [Tạo Token GitHub](https://github.com/settings/tokens) |
| **Mistral AI** | `https://api.mistral.ai/v1` | Codestral & Mistral Small/Nemo | [Lấy Key Mistral](https://console.mistral.ai/api-keys/) |
| **SiliconFlow** | `https://api.siliconflow.cn/v1` | Qwen 2.5, DeepSeek V3/R1 | [Lấy Key SiliconFlow](https://cloud.siliconflow.cn/account/ak) |
| **Hugging Face** | `https://api-inference.huggingface.co/v1` | Hàng ngàn model mã nguồn mở | [Lấy Token HuggingFace](https://huggingface.co/settings/tokens) |
| **Cohere** | `https://api.cohere.com/v1` | Command R / R+ thử nghiệm miễn phí | [Lấy Key Cohere](https://dashboard.cohere.com/api-keys) |
| **Ollama Local** | `http://127.0.0.1:11434/v1` | 100% Offline, chạy trên máy cá nhân | Không cần key |

---

## 🚀 Cài Đặt & Khởi Chạy

### Yêu Cầu
- **Node.js**: v18.0.0 trở lên.
- Không cần cài thêm bất kỳ package bên thứ 3 nào qua npm (`node_modules` chỉ dùng khi build TypeScript).

### Khởi Chạy Nhanh
```bash
# Clone dự án và cài đặt build tools
git clone https://github.com/kayce310/FreeRoute.git
cd FreeRoute
npm install
npm run build

# Khởi chạy server và Dashboard
npm start
```

Server sẽ khởi chạy tại:
- **Dashboard Web UI**: `http://127.0.0.1:8787/`
- **OpenAI Compatible Endpoint**: `http://127.0.0.1:8787/v1`

---

---

## 🎁 Minh Bạch Hóa Model: 100% Free vs Thương Mại (Paid)

Khác với các aggregator tổng hợp hàng trăm model nhưng đa số là tính phí per-token (trừ tiền tài khoản), FreeRoute thực hiện **minh bạch hóa tuyệt đối**:
- **🎁 Model 100% Miễn Phí (True Free)**:
  - Chỉ bao gồm các model có mức giá prompt/completion bằng đúng 0đ.
  - Các model hậu tố `:free` trên OpenRouter (ví dụ: `google/gemini-2.0-flash-exp:free`, `deepseek/deepseek-r1:free`, `meta-llama/llama-3.3-70b-instruct:free`).
  - Hạn mức miễn phí chính hãng từ Google Gemini AI Studio (Gemini 2.5 Flash), Groq LPU, Cerebras, Ollama cục bộ.
- **💳 Model Thương Mại (Commercial)**:
  - Danh mục các model tính phí trực tiếp qua key cá nhân của bạn (OpenAI, Anthropic, DeepSeek direct, OpenRouter paid...).
  - Được tách riêng thẻ thống kê KPI và có bộ lọc 1-click: `[x] Chỉ hiển thị Model 100% Miễn Phí` trên Dashboard để bạn không bao giờ bị trừ tiền ngoài ý muốn.

---

## 🔀 Custom Combos (Chuỗi Dự Phòng Tùy Biến)

Cho phép người dùng tự ghép các model yêu thích thành một **chuỗi fallback tự động**. Nếu model đầu tiên chạm trần giới hạn tần suất (Rate Limit 429), lỗi mạng hoặc quá tải, FreeRoute lập tức chuyển tiếp mượt mà sang model tiếp theo mà không làm ngắt quãng streaming của IDE/công cụ.

### Các Combo Mặc Định Có Sẵn:
- `combo:free-coders`: `groq/llama-3.3-70b-versatile` ➔ `cerebras/llama-3.3-70b` ➔ `openrouter/qwen/qwen-2.5-coder-32b-instruct:free`
- `combo:speed-demons`: `cerebras/llama-3.3-70b` ➔ `groq/llama-3.1-8b-instant` ➔ `cerebras/llama-3.1-8b`
- `combo:smart-chat`: `gemini/gemini-2.5-flash` ➔ `openrouter/google/gemini-2.0-flash-exp:free` ➔ `groq/llama-3.3-70b-versatile`

### Cách Gọi Combo:
Chỉ cần điền tên model dạng `combo:<id>` trong bất kỳ ứng dụng hoặc IDE nào:
```bash
curl http://127.0.0.1:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "combo:free-coders",
    "messages": [{"role": "user", "content": "Viết thuật toán Quicksort bằng TypeScript"}]
  }'
```

---

## 🛡️ Cẩm Nang Kết Nối An Toàn Chống Khóa Tài Khoản (Anti-Block Best Practices)

> [!WARNING]
> **Vì sao các IDE & công cụ lớn (Cursor, Windsurf, Claude Code CLI, Cline...) có thể cấm/khóa tài khoản khi dùng proxy bên thứ 3?**
> 1. **Rò rỉ Telemetry & Session Cookies**: Khi bạn đăng nhập tài khoản chính chủ của IDE nhưng lại trỏ proxy sang bên ngoài, các header đo kiểm nội bộ (internal telemetry) hoặc token phiên bản quyền có thể bị gửi kèm ra ngoài, kích hoạt cơ chế phát hiện gian lận của hệ thống kiểm duyệt.
> 2. **Xung đột Header & User-Agent**: Các proxy thông thường không chuẩn hóa header, khiến máy chủ upstream nhận diện yêu cầu đến từ client không được cấp phép.
> 3. **Public Endpoint Bị Quét**: Sử dụng các proxy mở qua internet công cộng (ngrok, vps không mật khẩu) khiến IP bị đưa vào danh sách đen.

### Cơ Chế Bảo Vệ Tận Tâm Của FreeRoute:
- **🔒 Chỉ Lắng Nghe Cục Bộ (Strict Localhost)**: Mặc định FreeRoute chỉ bind vào `127.0.0.1:8787`, tuyệt đối không mở port ra internet nếu bạn không chủ động cấu hình reverse proxy.
- **🧹 Làm Sạch Header Tự Động (Header Sanitization)**: Mọi header telemetry riêng của IDE (ví dụ `x-cursor-*`, `cf-ray`, cookie nội bộ) đều được lọc sạch trước khi chuyển tiếp lên nhà cung cấp AI.
- **🛡️ Không Lưu Prompt (Zero Prompt Logging)**: Database SQLite chỉ ghi nhận metadata ẩn danh (độ trễ, mã lỗi HTTP, số token). Toàn bộ nội dung câu lệnh và phản hồi không bao giờ bị lưu trên ổ đĩa.

### Cấu Hình Chuẩn Cho Từng Ứng Dụng:

#### 1. Cursor IDE
- Vào `Settings` ➔ `Models` ➔ `OpenAI API Key`.
- Bật `Override OpenAI Base URL`: `http://127.0.0.1:8787/v1`
- Nhập API Key: chuỗi bất kỳ hoặc token `FREEROUTE_API_TOKEN` của bạn.
- Trong danh sách Model, thêm tên combo hoặc profile: `combo:free-coders` hoặc `auto:free`.
- **Mẹo an toàn**: Tắt tính năng telemetry đồng bộ tab trong phần cài đặt của Cursor để tránh gọi ngầm.

#### 2. Cline / Roo Code (VS Code Extension)
- Chọn Provider: `OpenAI Compatible`.
- Base URL: `http://127.0.0.1:8787/v1`
- API Key: `freeroute-local` (hoặc token cấu hình).
- Model ID: `combo:free-coders` hoặc `auto:code`.

#### 3. Claude Code CLI
- Thiết lập biến môi trường trỏ endpoint Anthropic Messages của FreeRoute:
  ```bash
  export ANTHROPIC_BASE_URL="http://127.0.0.1:8787"
  export ANTHROPIC_API_KEY="dummy-token"
  claude --model auto:free
  ```

#### 4. Continue.dev
Cấu hình trong `~/.continue/config.json`:
```json
{
  "models": [
    {
      "title": "FreeRoute Free Coders",
      "provider": "openai",
      "model": "combo:free-coders",
      "apiBase": "http://127.0.0.1:8787/v1",
      "apiKey": "local-token"
    }
  ]
}
```

---

## 🛡️ Kiến Trúc & Thiết Kế Bảo Mật

1. **Local-First**: Mọi cấu hình, catalog model và chỉ số hoạt động lưu trữ trong SQLite cục bộ (`data/freeroute.sqlite`, `data/credentials.sqlite`).
2. **Mã Hóa AES-256-GCM**: Khóa chính (Master Secret) được tự sinh tự động tại `data/.master_secret` với quyền truy cập bảo mật.
3. **Redacted Logging**: Tuyệt đối không bao giờ ghi lại nội dung prompt của người dùng hoặc các chuỗi API key nhạy cảm vào log hệ thống.
4. **Resilient Circuit Breaker**: Tự động đưa model gặp lỗi vào khoảng thời gian hạ nhiệt (cooldown) để tránh nghẽn luồng và tự động khôi phục khi nhà cung cấp phục hồi.

---

## 📜 Giấy Phép (License)

Dự án được phân phối dưới giấy phép [MIT](./LICENSE).
