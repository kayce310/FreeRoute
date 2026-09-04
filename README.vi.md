# FreeRoute 🚀

> **Cổng chuyển tiếp AI cục bộ, siêu nhẹ (0 thư viện phụ thuộc), thông minh, bảo mật và miễn phí.**  
> Tự động gộp, định tuyến thông minh và chuyển đổi định dạng giữa các nhà cung cấp AI miễn phí tốt nhất thế giới (Groq, Cerebras, OpenRouter, Google Gemini, GitHub Models, Mistral, SiliconFlow, Cohere, Hugging Face, Ollama).

[English Documentation](./README.md) | **[Tài liệu Tiếng Việt](./README.vi.md)**

---

## 🌟 Tính Năng Nổi Bật

- **0 Runtime Dependencies**: Xây dựng hoàn toàn bằng Node.js tiêu chuẩn (Native HTTP, Crypto, SQLite). Khởi động trong **< 50ms**, chiếm chưa tới **35MB RAM**.
- **Song Ngữ Toàn Diện (Tiếng Việt & English)**: Giao diện Web Dashboard Dark mode cao cấp, chuyển đổi ngôn ngữ 1-click tức thì.
- **Tự Động Nạp Model (Auto-Seeding & Discovery)**: Khi kết nối bất kỳ nhà cung cấp nào, danh sách các model miễn phí tốt nhất sẽ tự động được nạp vào hệ thống để dùng ngay lập tức mà không cần chờ đợi.
- **Định Tuyến Thông Minh (Auto Routing Profiles)**:
  - `auto:free`: Ưu tiên các model hoàn toàn miễn phí, độ ổn định cao.
  - `auto:fast`: Tối ưu độ trễ và tốc độ sinh token (Cerebras ~1800 tok/s, Groq ~500 tok/s).
  - `auto:code`: Dành riêng cho lập trình và gọi hàm (function calling / tool use).
  - `auto:vision`: Hỗ trợ đọc hiểu hình ảnh và tài liệu đa phương tiện.
  - `auto:long-context`: Dành cho tài liệu lớn, ngữ cảnh dài (Google Gemini 1M+ tokens).
- **Tương Thích Mọi Chuẩn API**:
  - OpenAI Chat Completions (`/v1/chat/completions`)
  - OpenAI Responses API (`/v1/responses`)
  - Anthropic Messages API (`/v1/messages` - hỗ trợ Claude apps/plugins)
  - OpenAI Models List (`/v1/models`)
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

## 💻 Hướng Dẫn Kết Nối Ứng Dụng & Công Cụ Lập Trình

### 1. Cursor IDE
Vào **Cursor Settings** -> **Models** -> **OpenAI API Key**:
1. Bật **Override OpenAI Base URL**.
2. Đặt URL thành: `http://127.0.0.1:8787/v1`
3. Nhập API Key: Nếu bạn có đặt biến môi trường `FREEROUTE_API_TOKEN`, hãy nhập token đó; nếu không đặt, có thể nhập bất kỳ chuỗi nào (ví dụ: `freeroute-local`).
4. Thêm các model tuỳ ý hoặc dùng các profile tự động: `auto:free`, `auto:fast`, `auto:code`.

### 2. Cline / Roo Code (VS Code Extension)
1. Trong phần cài đặt Provider, chọn **OpenAI Compatible**.
2. **Base URL**: `http://127.0.0.1:8787/v1`
3. **API Key**: `freeroute-local` (hoặc token bạn đã cấu hình).
4. **Model ID**: `auto:code` (tối ưu hóa cho coding và tools).

### 3. OpenAI Python SDK
```python
from openai import OpenAI

# Kết nối trực tiếp tới FreeRoute cục bộ
client = OpenAI(
    base_url="http://127.0.0.1:8787/v1",
    api_key="freeroute-local"  # Bất kỳ chuỗi nào nếu chưa đặt token
)

response = client.chat.completions.create(
    model="auto:free",
    messages=[
        {"role": "user", "content": "Giải thích ngắn gọn cơ chế hoạt động của Attention trong Transformer bằng tiếng Việt"}
    ]
)

print(response.choices[0].message.content)
```

### 4. cURL
```bash
curl http://127.0.0.1:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto:fast",
    "messages": [{"role": "user", "content": "Xin chào FreeRoute!"}]
  }'
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
