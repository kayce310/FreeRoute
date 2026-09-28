# Phase 6 Design Document: Runtime Signal Derivation & Evidence-Driven Ranking

**Phase:** Phase 6 — Runtime Signal Derivation & Evidence-Driven Ranking  
**Status:** DRAFT / READY FOR REVIEW (Updated: +Failure Classification, +Schema Audit)  
**Date:** 2026-09-28  
**Scope:** Architecture & Contract Design Only (No code, no commit)

---

## 1. FACT (Hiện trạng Codebase & Bằng chứng từ Code)

Dựa trên việc kiểm tra trực tiếp các file source code:

1. **Kho dữ liệu Sự kiện Routing ([`src/storage/sqlite-routing-event-store.ts`](file:///e:/Test/FreeRoute/src/storage/sqlite-routing-event-store.ts)):**
   - Bảng `routing_events` lưu trữ lịch sử ở cấp độ từng request riêng lẻ:
     `request_id`, `occurred_at`, `profile`, `provider_id`, `model_id`, `credential_ref`, `fallback_count`, `outcome` (`'success'` | `'failure'`), `failure_kind`, `latency_ms`, `prompt_tokens`, `completion_tokens`, `total_tokens`.
   - **Bản chất:** Đây là **Raw Immutable Request Logs**, không phải là các chỉ số thống kê đã được tiền xử lý.
   - **Điểm nghẽn hiện tại ([`src/server.ts:822`](file:///e:/Test/FreeRoute/src/server.ts#L822)):**
     Server gọi `options.events.list()` (không truyền tham số). Do mặc định `list(limit = 50)` nên generator hiện chỉ nhận được tối đa 50 sự kiện gần nhất trên toàn bộ hệ thống. Nếu có 10 provider/model, mỗi model chỉ nhận được trung bình vài sự kiện, không đủ ý nghĩa thống kê.

2. **Kho dữ liệu Benchmark Ngoại vi ([`src/benchmarks/external/storage.ts`](file:///e:/Test/FreeRoute/src/benchmarks/external/storage.ts)):**
   - Bảng `external_benchmark_entries` lưu dữ liệu thị trường từ OpenRouter catalog:
     `entry_id`, `snapshot_id`, `model_permaslug`, `model_name`, `provider_id`, `metric_key`, `metric_value`, `unit`, `source_url`.
   - Các metric hiện có: `price_per_1m_input_tokens`, `price_per_1m_output_tokens`, `context_length`.

3. **Thuật toán Sinh Combo Hiện tại ([`src/benchmarks/external/auto-combo-generator.ts`](file:///e:/Test/FreeRoute/src/benchmarks/external/auto-combo-generator.ts)):**
   - **Đang hoạt động:**
     - Phân giải danh tính Canonical qua `buildCanonicalIndex` (MAPPED / AMBIGUOUS / UNMAPPED / UNKNOWN).
     - Lọc điều kiện cứng (`checkHardEligibility`): model phải có trong catalog, active, usable credential.
     - Ràng buộc cấu trúc (`applyDiversity`): tối đa 2 model / provider.
     - Xếp hạng theo `catalog_priority`.
   - **Đang bị STUB (chưa hiện thực):**
     - Lines 57–70 (`checkSoftEligibility`): Bộ lọc `minSuccessRate`, `maxLatencyP95Ms`, `requireBenchmarkData` bị bỏ qua với chú thích `// skip for now`.
     - Lines 188–194 & 205–208 (`applyRanking`): Sắp xếp theo `observed_latency`, `recent_success_rate`, `benchmark_price` đều trả về `primaryDiff = 0` và `secondaryDiff = 0`.

4. **Hiện tượng Vi phạm Đơn Trách Nhiệm (Single Responsibility Principle):**
   - `auto-combo-generator.ts` hiện đang gánh đồng thời 7 trách nhiệm: phân giải danh tính, lọc điều kiện cứng, lọc điều kiện mềm, xử lý thống kê raw events, thuật toán sắp xếp, áp dụng ràng buộc cấu trúc đa dạng hóa, và sinh provenance metadata.

---

## 2. ARCHITECTURAL VISION (Kiến trúc Phân tầng Dữ liệu)

Để tránh chồng chéo trách nhiệm và đảm bảo hiệu năng tính toán, Phase 6 phân ranh giới rõ ràng thành 6 tầng độc lập:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 1. RAW EVIDENCE STORES (Dữ liệu Thô Bất biến)                          │
│    • SqliteRoutingEventStore (routing_events: logs từng request)       │
│    • ExternalBenchmarkStorage (external_benchmark_entries: snapshot)  │
│    • SqliteCatalogStore / SqliteCredentialStore (danh mục & chìa khóa) │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 2. RUNTIME SIGNAL DERIVATION ENGINE (Tầng Tổng hợp Thống kê Độc lập)  │
│    (New: src/benchmarks/signals/signal-aggregator.ts)                  │
│    • Windowing: Hybrid (time-window + partitioned limit per candidate) │
│    • Grouping: providerId:modelId (kèm truy nguyên credential count)   │
│    • Error isolation: Tách client_cancelled khỏi provider reliability  │
│    • Math calculations: SuccessRate, P50/P95, SampleCount              │
│    • Confidence analysis: isStatisticallySignificant (>= 10 obs)       │
│    • Missing-data semantics: handling cold-start / sparse data         │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ emits Map<ModelKey, ModelRuntimeSignals>
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 3. CANONICAL MODEL CONTEXT (Đồng bộ Danh tính & Bằng chứng Đa nguồn)   │
│    (src/benchmarks/external/canonical-identity.ts)                     │
│    • Ghép nối Catalog Candidate + Runtime Signals + Benchmark Metrics  │
│    • Phân định minh bạch: Explicit Input / Output Pricing              │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 4. POLICY ENGINE (Bộ lọc Điều kiện Mềm)                                │
│    • Soft Eligibility filtering (minSuccessRate, maxLatencyP95Ms)      │
│    • Fallback policy: "Innocent until proven guilty" cho cold-start    │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 5. RANKING ENGINE (Bộ Sắp xếp Đa tiêu chí)                             │
│    • Multi-tier deterministic sorting:                                 │
│      Tier 1: Policy Primary (latency | success | price_in/out | prior) │
│      Tier 2: Policy Secondary (tie-breaker)                            │
│      Tier 3: Deterministic tie-breaker (provider_id / model_id)        │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 6. COMBO CONSTRUCTION (Ràng buộc Cấu trúc & Đóng gói)                  │
│    (src/benchmarks/external/auto-combo-generator.ts refactored)        │
│    • Diversity constraints (max candidates / provider)                 │
│    • Gán ID, đóng gói Model List và Provenance Audit Metadata          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. INPUT LAYER SPECIFICATION

Tầng Input định nghĩa cách thức trích xuất dữ liệu sạch từ các store hiện có mà không gây nghẽn:

### 3.1 RoutingEventStore Input
- **Hiện trạng:** Hàm `list(limit = 50)` hiện tại chỉ lấy 50 dòng mới nhất chung cho toàn server.
- **Contract Mới Cần Bổ Sung:** Bổ sung phương thức truy vấn có phân vùng (partitioned query) cho `SqliteRoutingEventStore`:
  ```ts
  export interface PartitionedEventQueryOptions {
    /** Lọc các sự kiện có occurredAt >= now - maxAgeMs */
    since?: Date;
    /** Giới hạn số lượng sự kiện tối đa cho TỪNG cặp (providerId, modelId) */
    maxSamplesPerCandidate?: number;
    /** Danh sách candidate cần truy vấn (providerId:modelId) */
    candidateKeys?: string[];
  }
  ```
- **Nguyên tắc phân vùng:** LIMIT phải áp dụng **theo từng cặp `providerId:modelId`** (bằng SQL Window Function `ROW_NUMBER() OVER (PARTITION BY provider_id, model_id ORDER BY occurred_at DESC)` hoặc gom nhóm theo partition), **tuyệt đối không LIMIT toàn bảng**.

### 3.2 ExternalBenchmarkStorage Input
- **Truy vấn:** Lấy snapshot mới nhất qua `getLatestSnapshot(sourceId)` và entries qua `getEntriesBySnapshot(snapshotId)`.
- **Trường Dữ liệu Tiêu thụ:**
  - `model_permaslug`: Khóa ánh xạ với canonical model identity.
  - `metric_key`: `price_per_1m_input_tokens`, `price_per_1m_output_tokens`.
  - `metric_value`: Giá trị chuỗi, parse thành số thực `number`.

### 3.3 CatalogStore & CredentialStore Input
- **CatalogStore:** Danh sách `ModelRecord[]` xác định các model đang `enabled`, trạng thái `catalogStatus: 'live'`, và `priority` cấu hình trong danh mục.
- **CredentialStore:** Danh sách thông tin xác thực để xác nhận model có usable key hay không.

---

## 4. SIGNAL DERIVATION ENGINE (`SignalAggregator`)

Engine này hoạt động độc lập, nhận dữ liệu thô và xuất ra bảng chỉ số tín hiệu đã được tính toán sẵn ($O(1)$ lookup khi sinh combo).

### 4.1 Grouping Key & Credential Dimension Traceability
- **Primary Grouping Key:** `providerId:modelId` (ví dụ: `groq:llama-3.3-70b-versatile`).
  - *Lý do:* Danh sách model trong Combo của FreeRoute là mảng các chuỗi `providerId/modelId`. Runtime routing resolution sau đó sẽ tự động chọn credential phù hợp.
- **Truy nguyên Chiều Credential (Credential Dimension Traceability):**
  - Mặc dù không biến credential thành tiêu chí xếp hạng trong Phase 6, `ModelRuntimeSignals` **bắt buộc phải lưu vết**:
    - `observedCredentialCount: number`: Số lượng credential khác nhau đã tham gia vào mẫu quan sát.
    - `credentialsObserved: string[]`: Danh sách ID các credential đã ghi nhận traffic.
  - *Lợi ích:* Đảm bảo tính minh bạch khi audit và mở đường cho các phase sau nếu cần phát hiện sự cố lệch chất lượng giữa các key (ví dụ: Key A free bị rate limit liên tục trong khi Key B paid vẫn chạy tốt).

### 4.2 Windowing Strategy: HYBRID CONTRACT
Tuân thủ quyết định của User, chiến lược cửa sổ dữ liệu được định nghĩa dưới dạng **Hybrid Contract**:

```typescript
export interface WindowPolicy {
  /** Thời gian tối đa của sự kiện được xét (ví dụ: 7 ngày, tính bằng ms) */
  maxAgeMs: number;
  /** Giới hạn số lượng mẫu tối đa cho MỖI candidate (providerId:modelId) */
  maxSamplesPerCandidate: number;
}
```

- **Quy tắc thực thi:**
  $$\text{Sự kiện hợp lệ} = \{ e \in \text{routing\_events} \mid e.\text{occurredAt} \ge (\text{now} - \text{maxAgeMs}) \land \text{rank}(e)_{\text{provider:model}} \le \text{maxSamplesPerCandidate} \}$$
- **Tính chất:**
  - Tránh model ít traffic có quá ít mẫu trong time-window.
  - Tránh đọc quá nhiều event của model có traffic cao làm chậm SQLite.
  - Các giá trị (ví dụ: 7 ngày hay 200 events) là **default policy có thể cấu hình**, không bị khóa cứng vào mã nguồn.

### 4.3 Failure Classification → Signal Eligibility

#### SCHEMA AUDIT (Verified 2026-09-28)

> [!IMPORTANT]
> Tên chính xác trong `RouteFailureKind` ([`src/contracts.ts:59–71`](file:///e:/Test/FreeRoute/src/contracts.ts#L59-L71)) là **`client_cancelled`**, **không phải** `client_abort`. Thuật ngữ `client_abort` không tồn tại trong codebase.

**Tất cả các giá trị hợp lệ của `RouteFailureKind`:**
```typescript
// src/contracts.ts
export type RouteFailureKind =
  | 'authentication'        // key không hợp lệ / hết hạn
  | 'rate_limit'            // upstream trả 429
  | 'quota_exhausted'       // hết quota
  | 'temporary'             // lỗi 5xx tạm thời, có thể retry
  | 'unsupported'           // model không hỗ trợ capability
  | 'permanent'             // lỗi không thể khắc phục
  | 'context_overflow'      // prompt vượt context window
  | 'provider_bad_request'  // upstream trả 400 do payload
  | 'no_candidate'          // không tìm thấy route candidate
  | 'client_cancelled'      // client ngắt kết nối / cancel request
  | 'invalid_response'      // upstream trả về response không hợp lệ
  | 'invalid_stream';       // upstream stream bị corrupt
```

**Trạng thái logging hiện tại (verified từ [`src/server.ts`](file:///e:/Test/FreeRoute/src/server.ts)):**

| `failure_kind` value | Được log vào `routing_events`? | Code path |
| :--- | :--- | :--- |
| `'temporary'` | ✅ Có | `server.ts:1199` (fallback khi không phải ProviderInvocationError), `server.ts:1273` |
| `'context_overflow'` | ✅ Có | `server.ts:1234` |
| `'rate_limit'`, `'authentication'`, etc. | ✅ Có | `server.ts:1199` (qua `err.failure.kind` từ ProviderInvocationError) |
| **`'client_cancelled'`** | ❌ **CHƯA ĐƯỢC LOG** | Không có code path nào trong `server.ts` set `failureKind = 'client_cancelled'` vào routing events |

> [!NOTE]
> `client_cancelled` tồn tại trong type contract nhưng **chưa được emit** vào `routing_events` trong Phase 1–5. Điều này có nghĩa là ở thời điểm hiện tại, `clientAbortCount` trong `ModelRuntimeSignals` sẽ luôn bằng 0 — nhưng contract phải được chuẩn bị sẵn để khi Phase tương lai bổ sung logging này, `SignalAggregator` xử lý đúng ngay lập tức.

---

### 4.3a Error Isolation: Tách `client_cancelled` khỏi Provider Reliability

> [!IMPORTANT]
> **QUY TẮC CỐT LÕI:** Consumer/Request Lifecycle evidence (`client_cancelled`) **KHÔNG** được tính là lỗi của upstream provider/model.

Phân loại bản chất sự kiện:
```text
Sự kiện Routing
├── Provider Evidence (Đánh giá năng lực nhà cung cấp)
│     ├── Success (outcome === 'success')
│     └── Provider Failures (outcome === 'failure' && failure_kind !== 'client_cancelled')
│           ├── authentication
│           ├── rate_limit
│           ├── quota_exhausted
│           ├── temporary
│           ├── unsupported
│           ├── permanent
│           ├── context_overflow
│           ├── provider_bad_request
│           ├── no_candidate
│           ├── invalid_response
│           └── invalid_stream
└── Consumer / Lifecycle Evidence (Không phản ánh độ tin cậy upstream)
      └── client_cancelled (User cancel request / client disconnect)
          → Đếm riêng vào clientAbortCount, KHÔNG tính vào N_eligible
          → Hiện tại CHƯA được emit vào routing_events (Phase 1–5)
          → Contract sẵn sàng khi được bổ sung
```

**Công thức tính toán:**
1. **Total Eligible Observations ($N_{\text{eligible}}$):**
   $$N_{\text{eligible}} = N_{\text{success}} + N_{\text{provider\_failure}}$$
   *(Sự kiện `client_cancelled` được đếm riêng vào `clientAbortCount`, không đưa vào $N_{\text{eligible}}$. Lọc bằng: `failure_kind === 'client_cancelled'`).*

2. **Success Rate:**
   $$\text{successRate} = \begin{cases} \frac{N_{\text{success}}}{N_{\text{eligible}}} & \text{khi } N_{\text{eligible}} > 0 \\ \text{null} & \text{khi } N_{\text{eligible}} == 0 \end{cases}$$

3. **Latency Percentiles (P50 & P95):**
   - Chỉ tính trên mảng các sự kiện thành công (`outcome === 'success'`) có `latencyMs > 0`.
   - Mảng `latencies = [L_1, L_2, ..., L_m]` sắp xếp tăng dần:
     - $\text{P50} = \text{latencies}[\lceil 0.50 \times m \rceil - 1]$
     - $\text{P95} = \text{latencies}[\lceil 0.95 \times m \rceil - 1]$
     - *(Nếu $m == 0$, gán `null`).*

### 4.4 Statistical Significance Threshold: 10 Eligible Observations
Tuân thủ quyết định của User:
- **Ngưỡng quy định:** `minSampleThreshold = 10` (mặc định cấu hình được qua policy).
- **Định nghĩa mẫu:** 10 **eligible observations** (bao gồm cả $N_{\text{success}}$ và $N_{\text{provider\_failure}}$).
  - *Lý do:* Nếu chỉ đếm success thì một model đang lỗi liên tục sẽ không bao giờ đạt ngưỡng 10 để bị soft filter phạt!
- **Quy tắc cờ:**
  - Nếu $N_{\text{eligible}} < \text{minSampleThreshold}$:
    `isStatisticallySignificant = false`
  - Nếu $N_{\text{eligible}} \ge \text{minSampleThreshold}$:
    `isStatisticallySignificant = true`

### 4.5 Missing-Data Semantics (Ngữ nghĩa Xử lý Dữ liệu Khuyết thiếu)

| Tình huống Dữ liệu | Giá trị Signal Xuất ra | Hành vi trong Policy Filter | Hành vi trong Ranking Sort |
| :--- | :--- | :--- | :--- |
| **Cold Start Tuyệt đối** ($N_{\text{eligible}} == 0$) | `sampleCount: 0`<br>`successRate: null`<br>`latencyP50Ms: null`<br>`isStatisticallySignificant: false` | **KHÔNG BỊ LOẠI BỎ** (Quy tắc *Innocent until proven guilty*). Giữ lại candidate. | Fallback về `catalog_priority`. Không thể so sánh bằng latency hay success rate. |
| **Mẫu Thấp / Chưa đủ độ tin cậy** ($1 \le N_{\text{eligible}} < 10$) | `sampleCount: N`<br>`successRate: value`<br>`latencyP50Ms: value`<br>`isStatisticallySignificant: false` | **KHÔNG BỊ LOẠI BỎ** bởi soft filter (bảo vệ model ít request). | Dùng giá trị làm gợi ý phụ, nhưng ưu tiên chính vẫn là `catalog_priority`. |
| **Không có Benchmark Evidence** (Model nội bộ/custom) | `benchmarkPriceInput: null`<br>`benchmarkPriceOutput: null` | Bỏ qua bộ lọc `requireBenchmarkData` nếu cờ không bật. | Khi xếp hạng theo price: Xếp sau các model có giá rõ ràng, hoặc fallback về `catalog_priority`. |

---

## 5. OUTPUT SPECIFICATION: `ModelRuntimeSignals`

Cấu trúc đối tượng đầu ra chuẩn hóa phát sinh từ `SignalAggregator`:

```typescript
export interface ModelRuntimeSignals {
  /** Định danh duy nhất cho provider và model */
  providerId: string;
  modelId: string;
  modelKey: string; // "providerId:modelId"

  /** Số lượng mẫu hợp lệ (eligible observations = success + provider_failures) */
  sampleCount: number;
  successCount: number;
  failureCount: number;
  
  /** Số lượng client abort ghi nhận được (được tách riêng, không tính vào sampleCount) */
  clientAbortCount: number;

  /** Tỷ lệ thành công (0.0 đến 1.0), null nếu không có mẫu hợp lệ */
  successRate: number | null;

  /** Độ trễ P50 tính bằng ms (chỉ tính request thành công), null nếu không có mẫu */
  latencyP50Ms: number | null;

  /** Độ trễ P95 tính bằng ms (chỉ tính request thành công), null nếu không có mẫu */
  latencyP95Ms: number | null;

  /** Cờ xác nhận dữ liệu đã đạt >= 10 eligible observations */
  isStatisticallySignificant: boolean;

  /** Thời điểm gần nhất quan sát thấy sự kiện */
  lastObservedAt: Date | null;

  /** Truy nguyên chiều credential (auditability) */
  observedCredentialCount: number;
  credentialsObserved: string[];

  /** Chi tiết phân loại lỗi upstream */
  failureBreakdown: Record<string, number>;
}

export type ModelSignalMap = Map<string, ModelRuntimeSignals>;
```

---

## 6. BENCHMARK PRICING: EXPLICIT INPUT/OUTPUT PRICING

Tuân thủ quyết định của User, **loại bỏ hoàn toàn khái niệm giá trung bình tùy tiện**:

```typescript
export interface ModelBenchmarkPricing {
  /** Giá USD cho 1 triệu input/prompt tokens */
  inputPricePer1M?: number;
  /** Giá USD cho 1 triệu output/completion tokens */
  outputPricePer1M?: number;
}
```

### Các Tiêu chí Ranking theo Giá được Hỗ trợ:
Trong `RankingPolicy`:
1. `primary: 'benchmark_price_input'`: Sắp xếp ưu tiên theo chi phí token đầu vào (prompt tokens).
2. `primary: 'benchmark_price_output'`: Sắp xếp ưu tiên theo chi phí token đầu ra (completion tokens).
3. *(Tương lai - Optional Workload Cost):* `primary: 'benchmark_estimated_cost'`. Tiêu chí này **bắt buộc phải có workload token mix profile** do user cung cấp:
   $$\text{estimatedCost} = (\text{promptTokensRatio} \times \text{inputPrice}) + (\text{completionTokensRatio} \times \text{outputPrice})$$
   Tuyệt đối không tự bịa ra tỷ lệ mix nếu user không cấu hình.

---

## 7. CONSUMER REFACTORING: `AutoComboGenerator`

Sau khi tách tầng Derivation Engine, `AutoComboGenerator` trong [`src/benchmarks/external/auto-combo-generator.ts`](file:///e:/Test/FreeRoute/src/benchmarks/external/auto-combo-generator.ts) trở thành Consumer thuần túy:

### 7.1 Refactored ConstructionContext
```typescript
export interface RefactoredConstructionContext {
  catalog: ModelRecord[];
  credentials: Array<{ providerId: string; credentialId: string; enabled: boolean }>;
  benchmarks: ExternalBenchmarkEntry[];
  latestSnapshots: Map<string, ExternalBenchmarkSnapshot>;
  /** Bảng tín hiệu runtime đã được tổng hợp trước, tra cứu O(1) */
  signals: ModelSignalMap;
}
```

### 7.2 Hiệu năng Tối ưu
- Trong hàm `applyRanking(candidates, policy)`:
  - Thay vì duyệt qua mảng hàng trăm event trong mỗi lần so sánh $O(N \log N)$, hàm sort chỉ việc lấy tín hiệu qua `context.signals.get(key)` với độ phức tạp $O(1)$.
  - Tốc độ sinh combo tăng gấp nhiều lần, hoàn toàn không phụ thuộc vào kích thước của bảng `routing_events`.

---

## 8. CONTRACT SPECIFICATIONS: POLICY, RANKING, FALLBACK, PROVENANCE

### 8.1 Policy Contract (Quy tắc Đánh giá Điều kiện)

#### Hard Eligibility (Bắt buộc phải đạt):
1. `inCatalog === true` (Model tồn tại trong catalog).
2. `hasUsableCredential === true` (Có credential hợp lệ và đang enabled).
3. `isEnabled === true` (Model được kích hoạt).
4. `isLive === true` (Trạng thái catalog là live).
5. `supportsRequiredCapabilities === true` (Hỗ trợ chat, streaming theo yêu cầu).

#### Soft Eligibility (Bộ lọc Chính sách Linh hoạt):
Nhận vào `RankingPolicy['filters']`:
- **`minSuccessRate` (ví dụ: 0.85):**
  - Nếu `signals.isStatisticallySignificant === true` và `signals.successRate < minSuccessRate`: **REJECT** (Lý do: `success_rate_below_threshold`).
  - Nếu `signals.isStatisticallySignificant === false`: **PASS** (Bảo vệ model mới/mẫu thấp).
- **`maxLatencyP95Ms` (ví dụ: 3000ms):**
  - Nếu `signals.isStatisticallySignificant === true` và `signals.latencyP95Ms > maxLatencyP95Ms`: **REJECT** (Lý do: `latency_p95_above_threshold`).
  - Nếu `signals.isStatisticallySignificant === false`: **PASS**.
- **`requireBenchmarkData` (boolean):**
  - Nếu `true` và model không có entry trong `context.benchmarks`: **REJECT**.

### 8.2 Ranking Contract (Thuật toán Sắp xếp Đa tiêu chí)

So sánh giữa Candidate A và Candidate B dựa trên `policy.primary` và `policy.secondary`:

```text
Step 1: Primary Key Comparison
  ├── Case 'catalog_priority':
  │     diff = priority(A) - priority(B)
  │
  ├── Case 'observed_latency':
  │     latA = signals(A)?.latencyP50Ms
  │     latB = signals(B)?.latencyP50Ms
  │     Nếu cả hai có giá trị: diff = latA - latB (thấp hơn tốt hơn)
  │     Nếu chỉ một bên có tín hiệu có ý nghĩa thống kê: ưu tiên bên có tín hiệu
  │     Nếu cả hai đều null: diff = 0 (fallback)
  │
  ├── Case 'recent_success_rate':
  │     rateA = signals(A)?.successRate
  │     rateB = signals(B)?.successRate
  │     Nếu cả hai có giá trị: diff = rateA - rateB (cao hơn tốt hơn)
  │     Nếu cả hai đều null: diff = 0
  │
  ├── Case 'benchmark_price_input':
  │     pA = getBenchmarkInputPrice(A)
  │     pB = getBenchmarkInputPrice(B)
  │     Nếu cả hai có giá: diff = pA - pB (rẻ hơn tốt hơn)
  │     Nếu chỉ một bên có giá: ưu tiên bên có giá benchmark rõ ràng
  │     Nếu cả hai đều null: diff = 0
  │
  └── Case 'benchmark_price_output':
        pA = getBenchmarkOutputPrice(A)
        pB = getBenchmarkOutputPrice(B)
        diff = pA - pB (rẻ hơn tốt hơn)

Step 2: Áp dụng policy.direction ('asc' hoặc 'desc')
  Nếu diff !== 0, trả về kết quả đã nhân với chiều sắp xếp.

Step 3: Secondary Key Comparison (Tie-breaker nếu Step 1 trả về 0)
  Áp dụng tiêu chí phụ theo cùng quy tắc như Step 1.

Step 4: Ultimate Deterministic Tie-Breaker
  Nếu sau cả tiêu chí chính và phụ vẫn hòa:
  return a.providerId.localeCompare(b.providerId) || a.modelId.localeCompare(b.modelId);
```

### 8.3 Fallback Contract (Xuống cấp An toàn khi Thiếu Dữ liệu)
- Khi `signals` rỗng (server vừa boot, chưa có request nào): Toàn bộ ranking tự động chuyển về `catalog_priority`.
- Khi benchmark storage rỗng: Các policy liên quan đến giá tự động chuyển về `catalog_priority`.
- Hệ thống luôn sinh được Combo hợp lệ chừng nào Catalog và Credential còn model hoạt động.

### 8.4 Provenance Contract (Lưu vết Nguồn gốc)

Đối tượng `provenance` được lưu vào combo phải ghi nhận đầy đủ ngữ cảnh để phục vụ audit/debug:

```typescript
export interface RefactoredComboProvenance {
  generatedAt: string;
  snapshotId: string;
  candidateCount: number;
  selectedCount: number;
  policyUsed: RankingPolicy;
  /** Tóm tắt dữ liệu thống kê tại thời điểm sinh */
  signalSummary: {
    totalEligibleEventsObserved: number;
    clientAbortsIgnored: number;
    statisticallySignificantCandidatesCount: number;
    coldStartCandidatesCount: number;
  };
  /** Lý do loại bỏ của các candidate bị reject trong soft filtering */
  rejectedCandidates?: Array<{
    candidate: string;
    reasons: string[];
  }>;
}
```

---

## 9. RESOLVED POLICY DECISIONS (Quyết định Chính sách Đã Thống nhất)

1. **Windowing Strategy:** Chốt phương án **HYBRID** (Time Window `maxAgeMs` kết hợp Partitioned Limit `maxSamplesPerCandidate` theo từng cặp `providerId:modelId`). Các giá trị tham số là configurable policy, không hardcode.
2. **Ngưỡng Mẫu Tối thiểu:** Chốt **10 ELIGIBLE OBSERVATIONS** ($N_{\text{success}} + N_{\text{provider\_failure}} \ge 10$).
3. **Phân lập Lỗi Client:** Chốt **TÁCH BIỆT `client_cancelled`**. Lỗi do người dùng cancel/disconnect không tính vào tỷ lệ thành công của provider/model. Tên chính xác trong schema: `client_cancelled` (không phải `client_abort`). Hiện chưa được emit vào routing_events nhưng contract đã sẵn sàng.
4. **Ngữ nghĩa Giá Benchmark:** Chốt **EXPLICIT INPUT / OUTPUT PRICING** (`benchmark_price_input` / `benchmark_price_output`), loại bỏ hoàn toàn giá trung bình tùy tiện.
5. **Truy nguyên Credential:** Chốt **LƯU VẾT SỐ LƯỢNG VÀ DANH SÁCH CREDENTIAL** trong `ModelRuntimeSignals` để audit, không biến credential thành chiều ranking trong Phase 6.

---

## 10. SCOPE MATRIX (Phạm vi của Phase 6)

### MUST HAVE
1. Module `SignalAggregator` (`src/benchmarks/signals/signal-aggregator.ts`) với đầy đủ logic: Hybrid windowing, error isolation, quantile P50/P95, significance, missing-data semantics.
2. Cập nhật `SqliteRoutingEventStore` với query phân vùng theo từng candidate.
3. Tái cấu trúc `AutoComboGenerator` để tiêu thụ `ModelSignalMap` với $O(1)$ lookup, hiện thực hóa các nhánh code đang bị stub.
4. Hỗ trợ explicit pricing ranking (`benchmark_price_input`, `benchmark_price_output`).
5. Unit tests và E2E tests 100% pass kiểm thử:
   - Client abort không làm giảm success rate.
   - Cold start model không bị loại bởi soft filter.
   - Sắp xếp P50/P95 và pricing hoạt động chính xác.

### NON-GOALS
- KHÔNG thay đổi runtime sequential fallback trong `src/inference.ts`.
- KHÔNG biến credential thành ranking dimension trong Phase 6.
- KHÔNG tạo background auto-regeneration scheduler.
- KHÔNG xây dựng CLI combo management trong phase này.

---

## 11. VERDICT

```text
READY FOR IMPLEMENTATION
```

**Lý do:** Toàn bộ các câu hỏi kiến trúc, phân định ngữ nghĩa dữ liệu, ranh giới phân lớp và 5 quyết định chính sách đã được giải quyết triệt để và chốt bằng contract rõ ràng. Không còn điểm nghẽn hay giả định mơ hồ nào. Sẵn sàng cho việc lập implementation plan và triển khai code.
