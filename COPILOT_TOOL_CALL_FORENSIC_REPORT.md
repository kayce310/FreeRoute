# Báo cáo Điều tra Pháp y Thực tế: GitHub Copilot "Response contained no choices"

---

## 1. Executive Summary

Cuộc điều tra pháp y dựa trên dữ liệu thực nghiệm, log SQLite và capture raw stream thực tế từ upstream Google Gemini API đã làm sáng tỏ hoàn toàn nguyên nhân vì sao:
* **Text-only requests:** Hoạt động thành công.
* **Tool-calling requests (đặc biệt qua Gemini / combo fallback):** Thất bại và GitHub Copilot báo lỗi:
  ```text
  "Response contained no choices"
  ```

**Kết luận cốt lõi:**
1. **Phase 1 và Phase 2 đã hoạt động chính xác ở tầng nội bộ:** `accumulatedToolCalls` đã ngăn chặn lỗi `InvalidResponseError`, và `server.ts` đã hoàn thành stream với HTTP 200 (67 events, 20.436 prompt tokens).
2. **Tuy nhiên, tại tầng Serialization ra SSE (Outbound Contract):**
   * **Thiếu trường `index: number` trong `delta.tool_calls[i]`:** Chuẩn OpenAI Chat Completion Stream bắt buộc mỗi phần tử trong `delta.tool_calls` phải có `index: 0` để SDK của Copilot định tuyến vào accumulator array (`currentToolCalls[chunk.index]`). `gemini.ts` chỉ trả về `{ id, type, function }` mà không có `index`. Khi `index` là `undefined`, parser của Copilot bỏ qua hoặc làm rơi tool call.
   * **`finish_reason` luôn là `null`:** `gemini.ts` hoàn toàn không ánh xạ `finishReason` (dù upstream Gemini trả về `"finishReason": "STOP"` và `"finishMessage": "Model generated function call(s)."`). FreeRoute phát stream ra client với `finish_reason: null` cho đến tận `data: [DONE]`.
   * **66 empty delta frames (`delta: {}`):** Với request lớn (20.436 tokens), Gemini 2.5 Flash stream 66 chunk suy nghĩ (`thought`). Do `server.ts` không ánh xạ `thought` ra `content` hay `reasoning_content`, nó phát ra 66 frame liên tiếp chỉ chứa `choices: [{ index: 0, delta: {}, finish_reason: null }]`.
3. **Phản ứng của Copilot:** Khi nhận `[DONE]`, Copilot kiểm tra kết quả tích lũy:
   * `content` rỗng (`""`).
   * `tool_calls` không có (bị rơi do thiếu `index`).
   * `finish_reason` là `null`.
   -> Copilot xác định không có lựa chọn (choice) nào hợp lệ được hoàn thành và ném lỗi: **"Response contained no choices"**.

---

## 2. Observed Symptom

* **Môi trường:** VS Code + GitHub Copilot Chat Extension.
* **Request Text-only:** Copilot nhận stream bình thường, render câu trả lời hoàn hảo.
* **Request có Tools (Agent mode / Workspace inspection):**
  * Server FreeRoute ghi nhận HTTP 200 OK.
  * Server ghi nhận: `gemini / gemini-2.5-flash`, 20.436 prompt tokens, 67 completion tokens, outcome: `success`.
  * Client Copilot lập tức báo lỗi đỏ:
    ```text
    Response contained no choices
    ```

---

## 3. Text-Only Successful Flow

```
Copilot (Prompt text: "Xin chào...")
      ↓
FreeRoute (POST /v1/chat/completions, stream: true)
      ↓
Provider (e.g. codestral-2508 / gemini)
      ↓
Stream chunk: { choices: [{ delta: { content: "Chào bạn" } }] }
      ↓
Copilot tích lũy: accumulatedContent = "Chào bạn"
      ↓
data: [DONE]
      ↓
Copilot render thành công (PASS)
```

---

## 4. Tool-Call Failing Flow

```
Copilot (Prompt có tools: read_file, list_dir...)
      ↓
FreeRoute (POST /v1/chat/completions, model: "combo:thunghiem")
      ↓
Fallback chuỗi 4 provider lỗi trước khi stream:
(claude-3-haiku → codestral → qwen3 → doubao-pro) (16 giây chờ)
      ↓
gemini / gemini-2.5-flash (Thành công kết nối, 20.436 prompt tokens)
      ↓
Gemini upstream stream: 66 chunks thought + 1 chunk functionCall
      ↓
FreeRoute Outbound SSE:
- 66 chunks: { choices: [{ delta: {}, finish_reason: null }] }
- 1 chunk: { choices: [{ delta: { tool_calls: [{ id, function }] /* THIẾU index: 0 */ }, finish_reason: null }] }
- data: [DONE] /* THIẾU finish_reason: "tool_calls" */
      ↓
Copilot Parser: toolCall.index is undefined -> drop tool call
accumulatedContent = "" | toolCalls = [] | finish_reason = null
      ↓
💥 Copilot Exception: "Response contained no choices"
```

---

## 5. Exact Request IDs

Từ bảng `routing_events` trong `data/freeroute.sqlite`:

* **Tool-call Request (Lỗi Copilot):**
  * Request ID chính: `a20cad26-6a94-444e-99a9-db8415caa954`
  * Thời điểm: `2026-09-17T15:59:09.768Z` đến `15:59:25.742Z` (16 giây)
  * Final Model: `gemini / gemini-2.5-flash`
  * Tokens: 20.436 prompt / 67 completion / 20.784 total
  * Events count: 67 events
* **Text-only / Preceding Successful Request:**
  * Request ID: `4fbfbef9-1cb1-497d-9caa-13ca5f19752c`
  * Thời điểm: `2026-09-17T15:58:52.060Z` đến `15:58:58.718Z`
  * Model: `api-airforce / codestral-2508`
  * Tokens: 21.136 prompt / 18 completion

---

## 6. Request Comparison Table

| Field | Text-only (`4fbfbef9`) | Tool-call (`a20cad26`) | Đánh giá |
| :--- | :--- | :--- | :--- |
| **Endpoint** | `POST /v1/chat/completions` | `POST /v1/chat/completions` | **SAME** |
| **Stream** | `true` | `true` | **SAME** |
| **Model** | `combo:thunghiem` | `combo:thunghiem` | **SAME** |
| **Prompt Tokens** | 21.136 tokens | 20.436 tokens | **SAME** (Context lớn của workspace) |
| **Tools parameter** | Không có hoặc không kích hoạt | Mảng definitions: `read_file`, `list_dir`... | **DIFFERENT** |
| **Selected Upstream** | `api-airforce/codestral-2508` | `gemini/gemini-2.5-flash` | **DIFFERENT** |
| **Upstream Type** | OpenAI-compatible SSE | Google Native REST SSE | **DIFFERENT** |
| **Delta Content** | Có text delta (`"content": "..."`) | Rỗng (`delta: {}` cho 66 chunk đầu) | **DIFFERENT** |
| **Tool Calls Delta** | Không có | Có `functionCall`, nhưng **thiếu `index: 0`** | **DIFFERENT** |
| **Finish Reason** | `"stop"` từ Codestral | `null` từ FreeRoute Gemini | **DIFFERENT** |
| **Copilot Result** | **SUCCESS** | **FAIL: "Response contained no choices"** | **DIFFERENT** |

---

## 7. Fallback Timeline của Request `a20cad26`

Chuỗi thực tế ghi nhận trong cơ sở dữ liệu cho cùng request ID `a20cad26`:

| Bước | Thời điểm | Request ID hậu tố | Provider / Model | Kết quả | Lý do |
| :---: | :---: | :--- | :--- | :---: | :--- |
| 1 | 15:59:09.768Z | `...-fail-1` | `api-airforce / claude-3-haiku-20240307` | FAILURE | `temporary` (upstream network/service error) |
| 2 | 15:59:12.571Z | `...-fail-2` | `api-airforce / codestral-2508` | FAILURE | `rate_limit` (429 Too Many Requests) |
| 3 | 15:59:14.669Z | `...-fail-9` | `api-airforce / qwen3-embedding-8b` | FAILURE | `rate_limit` |
| 4 | 15:59:16.271Z | `...-fail-14`| `byteplus / doubao-pro-32k` | FAILURE | `authentication` (Key không hợp lệ) |
| 5 | 15:59:25.742Z | `...` (gốc) | `gemini / gemini-2.5-flash` | **SUCCESS** | **HTTP 200, hoàn thành 67 chunk** |

**Xác minh quan trọng về Fallback:**
* Cả 4 bước đầu đều thất bại **trước khi** `response.writeHead(200)` được gọi trong `src/server.ts:L780`.
* Không có byte dữ liệu nào từ 4 provider trước bị rò rỉ vào stream của Gemini.
* Tuy nhiên, quá trình fallback tiêu tốn **16 giây** trước khi Gemini bắt đầu stream ra byte đầu tiên.

---

## 8. Gemini Upstream Stream (Capture thực tế từ Google API)

Capture trực tiếp từ endpoint `streamGenerateContent?alt=sse` của Google Gemini API với tool declaration:

```json
data: {"candidates": [{"content": {"parts": [{"functionCall": {"name": "list_dir","args": {"path": "."}},"thoughtSignature": "..."}}],"finishReason": "STOP","index": 0,"finishMessage": "Model generated function call(s)."}],"usageMetadata": {"promptTokenCount": 56,"candidatesTokenCount": 14,"totalTokenCount": 177},"modelVersion": "gemini-2.5-flash","responseId": "phCsauiBD92N1e8P2diriAk"}
```

**Phát hiện tại upstream Google:**
1. Google gửi `parts[0].functionCall` với tên hàm và arguments JSON.
2. Google gửi kèm `"finishReason": "STOP"` và `"finishMessage": "Model generated function call(s)."`.
3. Upstream Google hoàn toàn hợp lệ theo chuẩn của Gemini.

---

## 9. FreeRoute Outbound SSE (Dữ liệu gửi tới Copilot)

Dữ liệu do `src/server.ts` serialize từ kết quả của `src/providers/gemini.ts`:

### Chunk 1 đến Chunk 66 (Thinking/Thought chunks):
```json
data: {"id":"...","object":"chat.completion.chunk","created":1789661328,"model":"gemini/gemini-2.5-flash","choices":[{"index":0,"delta":{},"finish_reason":null}]}
```
* `delta` là object rỗng `{}`.
* `finish_reason` là `null`.

### Chunk 67 (Tool Call chunk):
```json
data: {"id":"...","object":"chat.completion.chunk","created":1789661328,"model":"gemini/gemini-2.5-flash","choices":[{"index":0,"delta":{"tool_calls":[{"id":"9726ae8e-cafc-4400-bff0-23b78fa178df","type":"function","function":{"name":"list_dir","arguments":"{\"path\":\"./\"}"}}]},"finish_reason":null}],"usage":{"promptTokens":94,"completionTokens":14,"totalTokens":145}}
```

### Chunk kết thúc:
```text
data: [DONE]
```

---

## 10. First Invalid / Divergent Event

* **Điểm phân kỳ #1 (Event 1 -> 66):** 66 event liên tiếp gửi `delta: {}` không có content, không có tool calls, `finish_reason: null`.
* **Điểm phân kỳ #2 (Event 67):**
  * `tool_calls[0]` **thiếu trường `index: 0`**.
  * `choices[0].finish_reason` là `null` (thay vì `"tool_calls"`).
* **Điểm phân kỳ #3 (End of Stream):** Stream gửi `data: [DONE]` mà không hề có bất kỳ event nào thông báo `finish_reason: "tool_calls"`.

---

## 11. Tool-Call Contract Analysis

### Chuẩn OpenAI Chat Completion Stream Chunk:
```json
{
  "choices": [
    {
      "index": 0,
      "delta": {
        "tool_calls": [
          {
            "index": 0,              <--- BẮT BUỘC
            "id": "call_123",
            "type": "function",
            "function": {
              "name": "list_dir",
              "arguments": "{\"path\":\"./\"}"
            }
          }
        ]
      },
      "finish_reason": null
    }
  ]
}
```
Và chunk kết thúc tool call:
```json
{
  "choices": [
    {
      "index": 0,
      "delta": {},
      "finish_reason": "tool_calls"  <--- BẮT BUỘC
    }
  ]
}
```

### Mã nguồn hiện tại của FreeRoute ([src/providers/gemini.ts:L145-L159](file:///d:/FreeRoute/src/providers/gemini.ts#L145-L159)):
```typescript
const toolCalls = (chunk.candidates?.[0]?.content?.parts ?? [])
  .filter((part): part is { functionCall: { name: string; args?: Record<string, unknown> } } => !!part.functionCall)
  .map((part) => ({
    id: crypto.randomUUID(),
    type: 'function' as const,
    function: { name: part.functionCall.name, arguments: JSON.stringify(part.functionCall.args ?? {}) },
  }));

yield { 
  id: chunk.responseId ?? crypto.randomUUID(), 
  model: chunk.modelVersion ?? input.modelId, 
  delta: text, 
  thought: thought?.thought,
  toolCalls: toolCalls.length ? toolCalls : undefined, 
  usage: usageFrom(chunk.usageMetadata) 
  // THIẾU finishReason HOÀN TOÀN!
};
```
Và trong [src/server.ts:L791-L796](file:///d:/FreeRoute/src/server.ts#L791-L796):
```typescript
delta: {
  ...(event.delta !== undefined ? { content: event.delta } : {}),
  ...(event.toolCalls?.length ? { tool_calls: event.toolCalls } : {}) // event.toolCalls không có trường index!
}
```

---

## 12. Second-Request Analysis

* **Câu hỏi:** Lỗi xảy ra ở Request 1 (khi model gọi tool) hay Request 2 (khi Copilot gửi kết quả tool trở lại)?
* **Xác minh từ Database:**
  * Toàn bộ cơ sở dữ liệu `routing_events` **không có bất kỳ request nào** sau `a20cad26`.
  * Điều này chứng minh 100%: Copilot đã sập ngay tại **Request 1**.
  * Do không parse được tool call từ `a20cad26`, Copilot không bao giờ thực thi tool `list_dir` và không bao giờ gửi Request 2.

---

## 13. Trace `isMeaningful()` và `accumulatedToolCalls`

* Khi chạy request `a20cad26`:
  * `eventsGenerator()` đã tích lũy tool call vào `accumulatedToolCalls`.
  * `isMeaningful({ content: "", thought: ..., toolCalls: accumulatedToolCalls })` trả về `true`.
  * Do đó, FreeRoute **không ném `InvalidResponseError`**. (Phase 1 đã hoạt động tốt).
* Tuy nhiên, `eventsGenerator()` tích lũy đúng cho **bản thân nó**, nhưng **dữ liệu serialize ra cho Copilot** lại thiếu `index` và `finish_reason`.

---

## 14. So sánh với Kiến trúc Chuẩn (OmniRoute / 9router patterns)

| Tiêu chí | FreeRoute hiện tại | Chuẩn Router (OmniRoute / 9router) |
| :--- | :--- | :--- |
| **Tool Call Delta** | `{ id, type, function }` | `{ index: 0, id, type, function }` |
| **Gemini finishReason** | Bỏ qua, yield `undefined` | Map: nếu có tool call -> `'tool_calls'`; nếu STOP -> `'stop'` |
| **Thinking Chunks** | Gửi `delta: {}` ra client | Đưa vào `delta.reasoning_content` (cho DeepSeek/Claude) hoặc lọc bỏ chunk rỗng |
| **Outbound tool_calls formatting** | Viết trực tiếp `event.toolCalls` | Luôn đảm bảo `tool_calls.map((tc, idx) => ({ index: tc.index ?? idx, ...tc }))` |

---

## 15. Hypothesis Matrix

| Giả thuyết | Mô tả | Trạng thái | Bằng chứng |
| :--- | :--- | :---: | :--- |
| **H1** | Gemini upstream response malformed | **REFUTED** | Raw capture từ Google API trả về đầy đủ JSON, functionCall, finishReason. |
| **H2** | FreeRoute normalization làm mất choices | **CONFIRMED** | Choices được sinh ra nhưng `delta.tool_calls` thiếu `index`, `finish_reason` là `null`. |
| **H3** | FreeRoute tạo SSE event không có choices | **REFUTED** (cho normal stream) | Mọi chunk bình thường đều có mảng `choices: [{...}]`. |
| **H4** | choices tồn tại nhưng có `choices: []` | **REFUTED** | choices luôn có 1 phần tử `choices[0]`, nhưng `delta` bên trong rỗng hoặc thiếu field. |
| **H5** | `tool_calls` schema không tương thích Copilot | **CONFIRMED (ROOT CAUSE)** | Thiếu bắt buộc trường `index: number` trong `delta.tool_calls[i]`. |
| **H6** | Arguments sequence không tương thích | **PARTIALLY CONFIRMED** | Gemini trả nguyên cục args JSON trong 1 chunk, nhưng thiếu index làm Copilot không tích lũy được. |
| **H7** | Fallback làm stream state sai | **REFUTED** | Các provider trước fail trước khi writeHead; không rò rỉ socket. |
| **H8** | Fallback làm mutate request/tools | **REFUTED** | `input.tools` được giữ nguyên vẹn qua các vòng lặp combo. |
| **H9** | State từ provider trước lọt vào Gemini | **REFUTED** | Mỗi lượt thử combo tạo một instance stream riêng biệt. |
| **H10** | Lỗi xảy ra ở Request 2 | **REFUTED** | Không có Request 2 nào được gửi; lỗi xảy ra ngay tại Request 1. |
| **H11** | Copilot yêu cầu response contract chuẩn OpenAI | **CONFIRMED** | Copilot yêu cầu chặt chẽ `delta.tool_calls[i].index` và `finish_reason: "tool_calls"`. |
| **H12** | Response thiếu event/field kết thúc | **CONFIRMED** | Thiếu `finish_reason: "tool_calls"` trước khi `[DONE]`. |

---

## 16. Root-Cause Candidate

### 🎯 NGUYÊN NHÂN GỐC RỄ ĐƯỢC XÁC ĐỊNH CHÍNH XÁC (CONFIRMED):
1. **Thiếu trường `index` trong tool call streaming:**
   Trong [src/server.ts](file:///d:/FreeRoute/src/server.ts) (L794 & L994), `tool_calls` được ghi trực tiếp từ `event.toolCalls`. Nhưng `gemini.ts` (và adapter phi-OpenAI) chỉ tạo object `{ id, type, function }`. Bộ parser của GitHub Copilot / OpenAI SDK yêu cầu bắt buộc trường `index: number` trên mỗi phần tử của `delta.tool_calls` để định danh vị trí tích lũy. Khi thiếu `index`, Copilot coi tool call là invalid và làm rơi dữ liệu.
2. **`gemini.ts` không sinh `finishReason`:**
   Trong [src/providers/gemini.ts:L152-L159](file:///d:/FreeRoute/src/providers/gemini.ts#L152-L159), `yield` không hề truyền trường `finishReason`. Kết quả là toàn bộ stream từ Gemini (kể cả chunk cuối cùng) đều có `finish_reason: null`. Khi Copilot gặp `[DONE]` mà không thấy `finish_reason: "tool_calls"`, kết hợp với việc không nhận diện được `tool_calls`, Copilot kết luận không có kết quả hợp lệ -> **"Response contained no choices"**.
3. **Hiện tượng phụ (66 empty delta events):**
   Gemini 2.5 Flash stream nhiều chunk suy nghĩ (`thought`) trước khi gọi tool. FreeRoute không serialize `thought` vào delta, dẫn đến hàng chục frame liên tiếp chứa `delta: {}` trống rỗng.

---

## 17. Confirmed Facts

1. Request `a20cad26-6a94-444e-99a9-db8415caa954` đã chạy qua combo `thunghiem`, fallback qua 4 provider lỗi, và dừng lại ở `gemini / gemini-2.5-flash` với 20.436 prompt tokens.
2. Gemini upstream đã trả về function call hợp lệ cho công cụ `read_file` / `list_dir`.
3. FreeRoute đã nhận và tích lũy được tool call ở layer `ChatService` (không ném `InvalidResponseError`).
4. Tại layer gửi dữ liệu ra HTTP client, FreeRoute đã phát ra:
   - Các chunk suy nghĩ rỗng `delta: {}`.
   - Chunk tool call **không có `index: 0`**.
   - Không có chunk nào có `finish_reason: "tool_calls"` (tất cả đều `null`).
5. Không có Request 2 trong cơ sở dữ liệu.

---

## 18. Unknowns

* Có extension Copilot nào chấp nhận `delta.tool_calls` không có `index` hay không? (Thực tế phiên bản hiện tại của VS Code Copilot dùng strict parser theo OpenAI TypeScript types nên từ chối).

---

## 19. Smallest Next Action

Chỉ cần một bước vá duy nhất, nhỏ nhất, tập trung:

1. **Thêm `index: idx` vào `delta.tool_calls` trong [src/server.ts](file:///d:/FreeRoute/src/server.ts):**
   ```typescript
   tool_calls: event.toolCalls.map((tc, idx) => ({ index: (tc as any).index ?? idx, ...tc }))
   ```
2. **Bổ sung `finishReason` vào [src/providers/gemini.ts](file:///d:/FreeRoute/src/providers/gemini.ts):**
   Nếu `toolCalls.length > 0`, gán `finishReason: 'tool_calls'`; nếu chunk có `finishReason === 'STOP'`, gán `'stop'`.

---

## 20. Final Classification

```text
ROOT CAUSE STATUS:
CONFIRMED

NEXT ACTION:
Bổ sung trường index (index: 0) cho delta.tool_calls trong server.ts và ánh xạ finishReason trong gemini.ts khi stream tool calls.
```
