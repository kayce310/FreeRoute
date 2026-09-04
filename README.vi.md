<div align="center">

# ⚡ FreeRoute

### **Cổng Điều Hướng AI Thông Minh · 0 Thư Viện Phụ Thuộc · Local-First**
**Tự Động Fallback Cứu Nguy · Két Khóa Mã Hóa AES-256-GCM · Hơn 80+ Nhà Cung Cấp · Giám Sát NOC Thời Gian Thực · Ưu Tiên 100% Miễn Phí**

[![Tests](https://img.shields.io/badge/tests-60%2F60%20passing-brightgreen.svg)](https://github.com/kayce310/FreeRoute)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-green.svg)](https://nodejs.org/)
[![Dependencies](https://img.shields.io/badge/dependencies-0%20runtime-purple.svg)](https://github.com/kayce310/FreeRoute)
[![Security](https://img.shields.io/badge/vault-AES--256--GCM-orange.svg)](https://github.com/kayce310/FreeRoute)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[**Tài Liệu Tiếng Anh**](./README.md) · [**Tài Liệu Tiếng Việt**](./README.vi.md) · [**Báo Lỗi / Góp Ý**](https://github.com/kayce310/FreeRoute/issues)

<br/>

```
  IDE / Công Cụ Lập Trình (Cursor, VS Code Copilot, Cline, Claude CLI)
                               │
                               ▼  [http://127.0.0.1:8787/v1]
                 ┌───────────────────────────┐
                 │    ⚡ FreeRoute Router     │
                 └─────────────┬─────────────┘
                               │
      ┌────────────────────────┼────────────────────────┐
      ▼ (Lần 1)                ▼ (Fallback Lần 2)       ▼ (Fallback Lần 3)
┌───────────┐            ┌───────────┐            ┌───────────┐
│ Cerebras  │ ──► 429 ──►│   Groq    │ ──► 503 ──►│  Gemini   │ ──► 200 OK (Stream Mượt!)
│  (1800t/s)│ Quá Tải    │ (LPU Siêu)│ Server Lỗi │ (1M Ctx)  │
└───────────┘            └───────────┘            └───────────┘
```

</div>

---

## 🚀 Vì Sao Bạn Cần FreeRoute?

Các lập trình viên thường kết hợp nhiều gói miễn phí (Google AI Studio, Groq, Cerebras, OpenRouter, GitHub Models, SiliconFlow, Mistral, HuggingFace...) để lập trình trên Cursor, VS Code, Cline. Nhưng khi một nhà cung cấp bị chạm giới hạn tần suất (`429 Rate Limit`), gặp sự cố bảo trì (`503`), hoặc hết hạn mức trong ngày, **công việc của bạn ngay lập tức bị gián đoạn**.

**FreeRoute giải quyết dứt điểm vấn đề này.** Hệ thống hoạt động như một cổng OpenAI-compatible nội bộ duy nhất trên máy bạn: tự động chuyển vùng dự phòng khi có lỗi, tự đổi model khi tràn ngữ cảnh, mã hóa an toàn toàn bộ khóa API và tiêu tốn **$0** chi phí vận hành.

---

## ✨ Điểm Nhấn Tính Năng Nổi Bật

| Tính Năng | Chi Tiết |
| :--- | :--- |
| **🏎️ 0 Thư Viện Phụ Thuộc (Zero Dependencies)** | Xây dựng 100% bằng các module chuẩn của Node.js (`node:sqlite`, `node:crypto`, `node:http`). Khởi động trong **< 40ms**, tiêu thụ **< 35MB RAM**, hoàn toàn không có nguy cơ mã độc từ npm supply chain. |
| **🔀 Fallback Chuyển Vùng Đa Tầng** | Tự động chuyển vùng mượt mà khi gặp lỗi `429`, `5xx`, hoặc hết hạn mức. Không làm đứt đoạn luồng streaming phản hồi (`text/event-stream`). |
| **🔄 Tự Động Xử Lý Tràn Ngữ Cảnh (Context Overflow)** | Tự động nâng cấp sang model có ngữ cảnh lớn hơn (ví dụ Gemini 1M+) khi prompt vượt quá context window của model hiện tại. |
| **⏱️ Cooldown Lũy Tiến Thông Minh** | Cơ chế phạt thông minh (3 lần lỗi = 5 phút, 4 = 30 phút, 5 = 1 giờ, 6+ = tối đa 3 giờ) tránh gửi dồn dập vào endpoint đang kiệt quệ, tự động reset về 0 ngay khi request thành công. |
| **🔀 Chuỗi Fallback Tùy Biến (Custom Combos)** | Tự thiết lập chuỗi model theo ý muốn (ví dụ `combo:free-coders`, `combo:speed-demons`) trực tiếp từ Dashboard hoặc qua API. |
| **⚡ Đồng Bộ Khóa 1-Click Không Trùng Lặp** | Tự động phát hiện database của **9router** và **OmniRoute** trên máy cá nhân, nhập an toàn không bao giờ phát cảnh báo sai lệch. Hỗ trợ đa khóa cho từng nhà cung cấp. |
| **🛡️ Két Khóa AES-256-GCM & Bảo Mật Git** | Khóa API được lưu độc lập tại `data/credentials.sqlite` mã hóa AES-256-GCM. Quy tắc `.gitignore` nghiêm ngặt đảm bảo key và file backup không bao giờ bị đẩy lên GitHub. |
| **💾 Xuất & Nhập File JSON Backup Khóa** | Xuất/nhập toàn bộ API key chỉ với 1 click trên Web Dashboard hoặc qua lệnh terminal (`npm run backup:keys` / `npm run restore:keys`). |
| **🔄 1 Lệnh Cập Nhật Terminal Tự Động** | Nâng cấp FreeRoute lên bản mới nhất bằng 1 lệnh duy nhất (`npm run update` hoặc `freeroute update`), tự kéo git, cài đặt và build lại mã nguồn mà không mất dữ liệu. |
| **📡 Giám Sát Sức Khỏe & Routing Stream** | Theo dõi ma trận sức khỏe nhà cung cấp (độ trễ P50/P90, tỷ lệ thành công) và bảng log định tuyến thời gian thực tự động cuộn theo timeline với nhãn nổi bật. |
| **🧪 Test Playground Định Dạng Dọc** | Khu vực thử nghiệm chuyên nghiệp với console streaming dọc hiển thị từng token thời gian thực, đo tốc độ token đầu tiên (TTFT) và tổng thời gian phản hồi. |
| **🎁 Minh Bạch 100% Free vs Paid** | Phân loại rõ ràng các model hoàn toàn miễn phí (`:free`, verified tier) tách biệt với model thương mại trả phí. |
| **🌐 Hơn 80+ Nhà Cung Cấp Có Sẵn** | Tích hợp sẵn mẫu kết nối cho OpenRouter, Groq, Gemini, Cerebras, GitHub Models, Kiro, Antigravity, Cline, SiliconFlow, Cohere, Ollama... |
| **🌍 Song Ngữ Toàn Diện** | Chuyển đổi ngôn ngữ tức thì giữa **Tiếng Việt** và **English** chỉ với 1 cú click chuột. |

---

## ⚡ Bắt Đầu Nhanh Trong 5 Phút

### 1. Yêu Cầu Môi Trường
- **Node.js phiên bản 22 trở lên** (hỗ trợ module `node:sqlite` tích hợp sẵn).

### 2. Clone Dự Án & Cài Đặt
```bash
git clone https://github.com/kayce310/FreeRoute.git
cd FreeRoute
npm install
npm run build
```

### 3. Khởi Chạy FreeRoute
```bash
# Chạy máy chủ daemon ở cổng http://127.0.0.1:8787
npm start
```

### 4. Thiết Lập Khóa API (Giao Diện Web)
Mở trình duyệt truy cập: **[http://127.0.0.1:8787](http://127.0.0.1:8787)**:
- Nhấn **`⚡ Nhập Từ 9router & OmniRoute`** để nạp tự động các khóa có sẵn trên máy.
- Hoặc vào **Tab 5: Quản Lý API Key** để thêm khóa thủ công.
- Hoặc dùng nút **`📥 Xuất Backup JSON`** / **`📤 Nhập từ JSON`** để chuyển khóa giữa các máy.

---

## 💻 Danh Mục Lệnh Terminal & CLI

```bash
# === Vận Hành Máy Chủ ===
freeroute serve                         # Khởi chạy server ở chế độ foreground
npm start                               # Chạy server daemon chạy ngầm

# === Cập Nhật Phiên Bản (Giống 9router) ===
npm run update                          # Tự động git pull, npm install và rebuild
freeroute update                        # Lệnh rút gọn qua CLI

# === Quản Lý Khóa API ===
freeroute add-key <provider> <api-key>  # Lưu thêm khóa API an toàn
freeroute list-keys                     # Xem danh sách các khóa đã lưu (ẩn secret)
freeroute remove-key <provider> [id]    # Xóa bớt khóa
freeroute key-validate <provider> [id]  # Kiểm tra kết nối thực tế của khóa

# === Sao Lưu & Khôi Phục ===
npm run backup:keys                     # Xuất khóa ra file freeroute-keys-backup-YYYY-MM-DD.json
freeroute export-keys [path.json]       # Xuất khóa ra đường dẫn tùy chọn
npm run restore:keys <path.json>        # Khôi phục khóa từ file JSON
freeroute import-keys <path.json>       # Nhập khóa qua CLI

# === Quản Lý Danh Mục & Nhà Cung Cấp Tự Tạo ===
freeroute refresh                       # Quét làm mới lại danh mục model
freeroute provider-add <id> <type> <url># Thêm endpoint OpenAI/Gemini tùy chỉnh
freeroute provider-list                 # Xem danh sách provider tùy chỉnh
freeroute provider-remove <id>          # Xóa provider tùy chỉnh
```

---

## 🔀 Hồ Sơ Tự Động & Chuỗi Custom Combos

Thay vì cố định một model duy nhất dễ gặp lỗi, hãy trỏ công cụ của bạn vào các **Hồ Sơ Tự Động** hoặc **Combo Dự Phòng**:

### Các Hồ Sơ Tự Động (Auto Profiles)
| ID Model Yêu Cầu | Ý Nghĩa Hoạt Động | Phù Hợp Cho |
| :--- | :--- | :--- |
| `auto:free` | Tự động chọn các model 100% miễn phí tốt nhất. | Trò chuyện, viết lách, dịch thuật thông thường. |
| `auto:code` | Ưu tiên model hỗ trợ gọi công cụ (tool-calling) và sinh code. | Trợ lý lập trình, Cursor, VS Code, Cline. |
| `auto:fast` | Ưu tiên các nhà cung cấp siêu tốc (Cerebras, Groq). | Gợi ý code nhanh, sửa lỗi ngắn, brainstorming. |
| `auto:long-context` | Ưu tiên model có ngữ cảnh siêu lớn (Gemini 1M+). | Phân tích toàn bộ codebase, đọc tài liệu dày. |

### Các Combo Dự Phòng Mẫu
| ID Combo | Chuỗi Chuyển Vùng Fallback |
| :--- | :--- |
| `combo:free-coders` | `groq/llama-3.3-70b` ➔ `cerebras/llama-3.3-70b` ➔ `openrouter/...:free` |
| `combo:speed-demons` | `cerebras/llama-3.3-70b` ➔ `groq/llama-3.1-8b-instant` |
| `combo:smart-chat` | `gemini/gemini-2.5-flash` ➔ `openrouter/...:free` ➔ `groq/...` |

---

## 🛠️ Hướng Dẫn Cấu Hình IDE & Công Cụ

### 1. Cursor IDE
1. Vào **Settings** ➔ **Models** ➔ **OpenAI API Key**.
2. Điền **OpenAI Base URL**: `http://127.0.0.1:8787/v1`
3. Ô API Key: Nhập bất kỳ ký tự nào (hoặc token `FREEROUTE_API_TOKEN` nếu bạn cài đặt).
4. Thêm model: `combo:free-coders` hoặc `auto:code`.

### 2. VS Code GitHub Copilot Custom Endpoint
Thêm vào file `settings.json` của VS Code:
```json
{
  "github.copilot.chat.customEndpoints": [
    {
      "name": "FreeRoute",
      "vendor": "customendpoint",
      "apiKey": "freeroute-local",
      "apiType": "chat-completions",
      "models": [
        {
          "id": "auto:code",
          "name": "FreeRoute Auto Code",
          "url": "http://127.0.0.1:8787/v1",
          "toolCalling": true,
          "vision": true,
          "maxInputTokens": 128000,
          "maxOutputTokens": 16000
        }
      ]
    }
  ]
}
```

### 3. Cline / Roo Code
1. API Provider: Chọn `OpenAI Compatible`
2. Base URL: `http://127.0.0.1:8787/v1`
3. API Key: `freeroute-local`
4. Model ID: `combo:free-coders` hoặc `auto:code`

### 4. Claude Code CLI
```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:8787"
export ANTHROPIC_API_KEY="freeroute-local"
claude --model auto:free
```

---

## 🛡️ Cam Kết An Toàn & Bảo Mật

1. **Local-First & Khép Kín**: Mặc định lắng nghe duy nhất tại `127.0.0.1:8787`, không mở cổng ra mạng Internet công cộng nếu bạn không tự cấu hình.
2. **Khử Sạch Header Định Danh**: Loại bỏ toàn bộ các header đặc thù của client (`x-cursor-*`, `cf-ray`...) trước khi chuyển tiếp yêu cầu đến provider nhằm chống việc tài khoản bị khóa nhầm.
3. **Không Lưu Nội Dung Prompt**: Cơ sở dữ liệu SQLite chỉ lưu trữ siêu dữ liệu thống kê ẩn danh (thời gian, model, latency, mã HTTP status). Câu hỏi và mã nguồn của bạn không bao giờ bị lưu trên đĩa.
4. **Cô Lập Với Git**: Thư mục cơ sở dữ liệu `data/` và tất cả các file sao lưu (`*backup*.json`) được cấu hình trong `.gitignore`, đảm bảo an toàn tuyệt đối khi bạn đẩy code lên GitHub.

---

## 📄 Bản Quyền (License)

Dự án được phân phối dưới giấy phép mã nguồn mở **MIT License** — xem chi tiết tại file [LICENSE](./LICENSE).
