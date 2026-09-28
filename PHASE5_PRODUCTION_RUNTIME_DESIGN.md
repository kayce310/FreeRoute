# Phase 5 Design Document: Production Runtime Wiring & Benchmark Subsystem Integration

**Phase:** Phase 5 — Production Runtime Wiring & Benchmark Subsystem Integration  
**Status:** DRAFT / READY FOR REVIEW  
**Date:** 2026-09-28  
**Scope:** Architecture Design Only (No code, no commit)

---

## 1. FACT (Hiện trạng Codebase)

1. **Production Runtime Hiển Hiện:**
   - `src/cli.ts` `serve()` gọi `createOpenRouterRuntime()`.
   - `src/app.ts` `createOpenRouterRuntime()` khởi tạo các store: `SqliteCatalogStore`, `SqliteCredentialStore`, `SqliteRoutingEventStore`, `SqliteQuotaObservationStore`, `SqlitePreferenceStore`, `SqliteComboStore`, `SqliteProviderStore`.
   - `createFreeRouteServer()` nhận các store trên, nhưng tham số `externalBenchmarks` **bị bỏ trống** (`undefined`).
2. **External Benchmark Subsystem Đang Cô Lập:**
   - `ExternalBenchmarkStorage` (`src/benchmarks/external/storage.ts`) và `RefreshCoordinator` (`src/benchmarks/external/refresh-coordinator.ts`) chỉ được khởi tạo trong test suite (`test/benchmarks/`).
   - Chưa từng được khởi tạo trong `src/app.ts` hoặc `src/cli.ts`.
3. **Auto Combo Generator Hiện Tại:**
   - `constructAutoCombo` (`src/benchmarks/external/auto-combo-generator.ts`) chỉ được gọi trong 2 route handler của `src/server.ts`:
     - `POST /v1/combos/autogenerate`
     - `POST /v1/combos/:id/regenerate`
   - Cả 2 route này đều kiểm tra `options.externalBenchmarks`. Khi chạy production qua CLI, do `options.externalBenchmarks === undefined`, mảng `benchmarks` và `snapshots` truyền vào `constructAutoCombo` luôn rỗng (`[]`).
4. **Không Có Background Auto-Regeneration:**
   - Không có background worker, cron, hay timer nào tự động gọi `regenerate` cho combo.
   - Cờ `locked` được enforce tại `server.ts:739` nhằm chặn request `POST /v1/combos/:id/regenerate` khi `locked === true`. Cờ `locked` không ảnh hưởng đến runtime routing fallback.
5. **Runtime Fallback Bất Biến:**
   - Cơ chế resolve `combo:xxx` -> `expandComboModels()` trong `src/inference.ts` đọc danh sách model tĩnh từ `SqliteComboStore`.
   - Không có can thiệp nào vào thuật toán `scoreCandidate()` hay sequential fallback.

---

## 2. ARCHITECTURE (Kiến trúc Tích hợp Production)

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          CLI Layer (src/cli.ts)                        │
│   freeroute serve                │   freeroute benchmark-refresh       │
└──────────────────────────────────┼─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Runtime Layer (src/app.ts)                           │
│                   createOpenRouterRuntime()                            │
│                                                                        │
│   ├── SqliteCatalogStore                                               │
│   ├── SqliteCredentialStore                                            │
│   ├── SqliteComboStore                                                 │
│   ├── ... (existing stores)                                            │
│   │                                                                    │
│   └── ExternalBenchmarkStorage (NEW IN RUNTIME)                        │
│         └── data/benchmark-external.sqlite                             │
│                                                                        │
│   └── RefreshCoordinator (Optional coordination engine)                │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ injects stores + externalBenchmarks
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     Server Layer (src/server.ts)                       │
│                     createFreeRouteServer()                            │
│                                                                        │
│   ├── POST /v1/combos/autogenerate   ──┐ reads real benchmark context  │
│   ├── POST /v1/combos/:id/regenerate ──┼───────────────────────────┐   │
│   ├── GET  /v1/combos/:id/provenance   │                           │   │
│   ├── GET  /v1/combos/extended         ▼                           │   │
│   │                              AutoComboGenerator                │   │
│   │                                    │                           │   │
│   │                                    ▼                           │   │
│   │                              SqliteComboStore                  │   │
│   │                                    │                           │   │
│   └── /v1/chat/completions ────────────┼───────────────────────────┘   │
│         model: "combo:xxx"             ▼                               │
│                                  expandComboModels()                   │
│                                        │                               │
│                                        ▼                               │
│                                  sequential fallback                   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. LIFECYCLE (Vòng đời Khởi tạo & Dọn dẹp Tài nguyên)

### 3.1 Ownership
- **Owner duy nhất:** `OpenRouterRuntime` đối tượng trả về bởi `createOpenRouterRuntime()` trong `src/app.ts`.
- `ExternalBenchmarkStorage` được tạo bên trong `createOpenRouterRuntime()` và được đóng trong `runtime.close()`.
- Server HTTP (`Server`) chỉ nhận tham chiếu dạng read/query thông qua interface `ExternalBenchmarkStorage`, không sở hữu vòng đời đóng mở kết nối file.

### 3.2 Quy trình Khởi động (Startup Sequence)
1. Xác định `dataDir = resolve(process.env.FREEROUTE_DATA_DIR ?? 'data')`.
2. Khởi tạo `ExternalBenchmarkStorage(dataDir, 'benchmark-external.sqlite')`.
   - Schema SQLite `external_benchmark_snapshots`, `external_benchmark_entries`, `external_source_metadata`, `external_source_runtime_state` được tự động tạo (`CREATE TABLE IF NOT EXISTS`).
3. Khởi tạo `RefreshCoordinator(externalBenchmarkStorage)`.
4. Truyền `externalBenchmarks: externalBenchmarkStorage` vào options của `createFreeRouteServer()`.
5. Bắt đầu lắng nghe cổng HTTP: `runtime.server.listen(port)`.

### 3.3 Quy trình Tắt ứng dụng (Shutdown Sequence & Resource Cleanup)
Khi nhận tín hiệu hệ điều hành (`SIGINT` hoặc `SIGTERM`) hoặc khi `runtime.close()` được gọi:
1. `runtime.server.close()` dừng tiếp nhận HTTP request mới.
2. Dọn dẹp coordinator timers (nếu có debounce/schedule queue đang chạy).
3. Đóng tất cả SQLite storage theo thứ tự:
   ```ts
   externalBenchmarkStorage.close();
   catalog.close();
   credentials.close();
   events.close();
   quotas.close();
   preferences.close();
   providerStore.close();
   comboStore.close();
   ```
4. Đảm bảo **không có file handle leak** (đặc biệt quan trọng trên Windows tránh lỗi `EBUSY`).

### 3.4 Khắc phục lỗi Khởi tạo (Initialization Failure Behavior)
- **Nếu `ExternalBenchmarkStorage` mở database lỗi (e.g. disk full, permission denied):**
  - Ghi log lỗi: `[BenchmarkStorage] Failed to initialize external benchmark storage: <error>`.
  - Chiến lược Graceful Fallback: Runtime vẫn khởi động với `externalBenchmarks: undefined` (hoặc mock empty storage). FreeRoute cốt lõi (routing, credentials, manual combos) **không bị crash** chỉ vì external benchmark gặp sự cố ổ đĩa.
- **Nếu `server.listen()` fail sau khi storage đã mở (e.g. `EADDRINUSE` port collision):**
  - Khối `try...finally` hoặc error event listener của server phải gọi `runtime.close()` để giải phóng database lock ngay lập tức.

---

## 4. STORAGE TOPOLOGY (Cấu trúc Lưu trữ Database)

### 4.1 So sánh Kiến trúc

| Tiêu chí | Phương án A: Gộp vào `data/freeroute.sqlite` | Phương án B: Tách file `data/benchmark-external.sqlite` |
| :--- | :--- | :--- |
| **Trạng thái Code hiện tại** | Cần sửa `ExternalBenchmarkStorage` để nhận `DatabaseSync` hoặc dbPath cụ thể. | **Code hiện tại (`src/benchmarks/external/storage.ts:68`) đã viết sẵn mặc định `(dataDir, 'benchmark-external.sqlite')`.** |
| **Phân tách trách nhiệm** | Trộn lẫn dữ liệu cấu hình nhạy cảm (API keys, credentials, preferences) với dữ liệu benchmark công khai tải về từ web. | Tách biệt hoàn toàn: Credential Vault độc lập với External Web Data Cache. |
| **Kích thước & IO** | Dữ liệu benchmark OpenRouter chứa hàng trăm model, nhiều snapshot làm phình to DB chính. | DB chính luôn nhỏ gọn (<1MB). Benchmark DB có thể xóa đi tải lại mà không mất key. |
| **Migration Risk** | Nguy cơ xung đột lock bảng hoặc lỗi migration khi nâng cấp phiên bản core. | Zero migration impact lên `freeroute.sqlite`. |

### 4.2 Quyết định (Decision)
**Chọn Phương án B: `data/benchmark-external.sqlite`.**
- Giữ nguyên thiết kế của Phase 3.5.
- Không cần sửa đổi schema hay constructor của `ExternalBenchmarkStorage`.
- Cả hai file đều nằm trong thư mục `data/` và đã được `.gitignore` bảo vệ.

---

## 5. BENCHMARK INGESTION (Cơ chế Nạp Dữ liệu Benchmark)

### 5.1 Phân tích các Phương án

| Phương án | Mô tả | Trigger | Đánh giá |
| :--- | :--- | :--- | :--- |
| **Option A: Startup Refresh** | Tự động gọi API OpenRouter mỗi khi server boot. | `freeroute serve` boot event | ⚠️ Làm chậm thời gian khởi động server (<40ms tăng lên >1-2s); phụ thuộc mạng khi boot; vi phạm tiêu chí offline-first. |
| **Option B: Explicit CLI Refresh** | Người dùng hoặc script chạy `freeroute benchmark-refresh`. | CLI command | ✅ Rõ ràng, kiểm soát được, không ảnh hưởng startup, tuân thủ mô hình của `freeroute refresh` hiện có. |
| **Option C: HTTP/Manual Refresh Endpoint** | Endpoint bảo vệ `POST /v1/benchmarks/refresh`. | HTTP POST (Admin/Dashboard) | ✅ Hỗ trợ gọi từ xa hoặc tích hợp UI trong tương lai, deduplication qua `RefreshCoordinator`. |
| **Option D: Periodic Background Refresh** | Timer/cron tự động fetch sau mỗi N giờ trong khi server đang chạy. | `setInterval` trong tiến trình serve | ⚠️ Tiềm ẩn rủi ro rate limit, network churn nếu server chạy lâu dài mà không cần dùng benchmark. |

### 5.2 Quyết định Thiết kế
1. **Trục Ingestion Chính:**
   - **CLI Command:** `freeroute benchmark-refresh` (dùng cho local/terminal).
   - **HTTP Endpoint:** `POST /v1/benchmarks/refresh` (dùng cho HTTP client / server runtime).
2. **Quy tắc Vận hành:**
   - **Không bật Startup Refresh bắt buộc.** Khi khởi động, nếu đã có snapshot cũ trong DB thì tái sử dụng; nếu DB rỗng, hệ thống chấp nhận trạng thái chưa có benchmark cho đến khi có lệnh refresh.
   - **Tận dụng `RefreshCoordinator`:** Khi có lệnh refresh, `RefreshCoordinator.acquireRefresh(scope, sourceConfigs)` đảm bảo:
     - Deduplication: Nếu đang có tiến trình fetch OpenRouter, các request đến sau sẽ chờ cùng promise, không bắn 2 request đồng thời.
     - Rate Limiting: Tuân thủ cấu hình rate limit token bucket của source.
   - **Xử lý Stale / Failed Refresh:**
     - Nếu fetch thất bại (mạng lỗi, 5xx): Snapshot cũ gần nhất vẫn được giữ nguyên làm fallback, trạng thái runtime ghi nhận `failed`, hệ thống không xóa dữ liệu cũ.

---

## 6. AUTO COMBO LIFECYCLE (Vòng đời của Combo Tự động)

### 6.1 Phân định Rõ 5 Vòng Đời Độc Lập

```text
[1. Benchmark Fetch]  ──(Lưu snapshot)──►  [ExternalBenchmarkStorage]
                                                    │
[2. Combo Creation]   ──(POST /autogenerate)─►  [constructAutoCombo]  ──►  [SqliteComboStore]
                                                                                ▲
[3. Combo Regen]      ──(POST /:id/regenerate) ─────────────────────────────────┤
                                                                                │
[4. Runtime Resolve]  ──(Request combo:xxx) ──► [expandComboModels] ────────────┘
```

1. **Benchmark Fetch (A):** Nạp dữ liệu thị trường bên ngoài vào storage. Độc lập với combo.
2. **Auto Combo Generation (B):** Người dùng yêu cầu tạo mới combo dựa trên danh sách model mục tiêu (`POST /v1/combos/autogenerate`). Độc lập với việc routing.
3. **Auto Combo Regeneration (C & D):**
   - **User-triggered (D):** `POST /v1/combos/:id/regenerate` — ĐÃ CÓ VÀ ĐÃ PASS TEST.
   - **Periodic Background Regeneration (C):** **KHÔNG ĐƯA VÀO PHASE 5.** Việc tự ý thay đổi danh sách model của một combo đang chạy có thể làm gián đoạn IDE/agent đang gọi prompt giữa chừng. Mọi hành vi cập nhật combo phải có chủ đích rõ ràng.
4. **Startup Synchronization (E):** Server boot **chỉ đọc** dữ liệu combos đã lưu từ SQLite, không tự ý mutate hay regenerate lại model list lúc boot.

### 6.2 Data Flow trong Production
```text
Client Request: POST /v1/combos/autogenerate
      ↓
server.ts kiểm tra options.externalBenchmarks (đã được inject từ app.ts)
      ↓
Query externalBenchmarks.queryEntries({}) và listSnapshots()
      ↓
constructAutoCombo(targetModels, policy, context)
      ↓
1. Canonical Identity Mapping (MAPPED / AMBIGUOUS / UNMAPPED / UNKNOWN)
2. Hard Eligibility Filtering (inCatalog, enabled, live, credentials)
3. Soft Policy Filtering (minSuccessRate, requireBenchmarkData)
4. Deterministic Ranking (catalog_priority desc -> observed_latency asc)
5. Diversity constraint (tối đa 2 model / provider)
      ↓
options.combos.put({ comboId, type: 'automatic', ... })
options.combos.addProvenance(comboId, provenanceEntry)
      ↓
Trả về HTTP 200 { status: 'ok', combo, provenance }
```

---

## 7. CLI DESIGN (Thiết kế Lệnh CLI)

Theo đúng cấu trúc hiện tại của `src/cli.ts`:

### 7.1 Lệnh: `freeroute benchmark-refresh`
- **Cú pháp:** `freeroute benchmark-refresh [source]`
- **Tham số:** `source` (tùy chọn, mặc định: `openrouter`). Hỗ trợ `all` hoặc `openrouter`.
- **Input:** Biến môi trường chuẩn (`FREEROUTE_DATA_DIR`).
- **Processing:**
  1. Khởi tạo `ExternalBenchmarkStorage(dataDir)`.
  2. Khởi tạo `RefreshCoordinator(storage)`.
  3. Gọi `coordinator.forceRefresh(scope, BUILTIN_EXTERNAL_SOURCES)`.
- **Output (Console):**
  - Thành công: `[Benchmark] OpenRouter: refreshed successfully (128 models recorded in snapshot snap-xxx).`
  - Thất bại: `[Benchmark] OpenRouter refresh failed: <error message>. Previous snapshot preserved.`
- **Exit Code:**
  - `0`: Thành công.
  - `1`: Lỗi tham số hoặc toàn bộ source thất bại.

---

## 8. FAILURE SEMANTICS (Nguyên tắc Phân lập Sự cố)

| Kịch bản Sự cố | Tác động lên Runtime Routing | Xử lý & Phục hồi |
| :--- | :--- | :--- |
| **Lỗi mở SQLite Benchmark DB** | **KHÔNG** ảnh hưởng routing. | Log warning, runtime fallback về `externalBenchmarks = undefined`. Chat/completions chạy bình thường. |
| **Lỗi Mạng khi Fetch Benchmark** | **KHÔNG** ảnh hưởng routing. | Lỗi được cô lập trong `RefreshCoordinator`. Giữ nguyên snapshot cũ gần nhất (stale snapshot). Trả về mã lỗi cho caller lệnh refresh. |
| **OpenRouter Rate Limit (429)** | **KHÔNG** ảnh hưởng routing. | Coordinator đánh dấu status `failed` và ghi nhận `last_failure_retryable = 1`. Lệnh refresh sau đó sẽ tuân thủ backoff. |
| **Snapshot bị Stale (>24h)** | **KHÔNG** ảnh hưởng routing. | Combo generator vẫn dùng dữ liệu gần nhất kèm warning trong provenance metadata (`status: 'stale'`). |
| **Không có Benchmark Data nào (DB rỗng)**| **KHÔNG** ảnh hưởng routing. | Generator tự động fallback: xếp hạng hoàn toàn bằng `catalog_priority` nội bộ; provenance ghi nhận `snapshotId: 'none'`. |
| **Server Crash lúc khởi động** | Server dừng tiến trình. | Khối dọn dẹp `runtime.close()` giải phóng toàn bộ file lock SQLite ngay lập tức. |

---

## 9. CONCURRENCY & SERIALIZATION

- **Mô hình luồng:** Node.js chạy single-threaded event loop.
- **SQLite Engine:** `node:sqlite` (`DatabaseSync`) vận hành in-process.
- **Xung đột đọc/ghi:**
  - `server request` (đọc `external_benchmark_entries`) và `benchmark refresh` (ghi `INSERT INTO external_benchmark_snapshots`) chạy trong cùng tiến trình Node.js.
  - SQLite WAL mode (hoặc default journal mode) của `DatabaseSync` xử lý đồng thời các câu lệnh tuần tự trên cùng file an toàn mà không cần thêm mutex bên ngoài.
  - `RefreshCoordinator.inFlightJobs` đảm bảo không bao giờ có 2 tác vụ fetch cùng ghi đè một source cùng lúc.
- **Kết luận:** **Không cần cài đặt thêm external mutex hay lock phức tạp.**

---

## 10. OBSERVABILITY & LOGGING

Mức log tối thiểu cần có (chuẩn console structured text):
1. **Khởi tạo Storage:**
   `[Storage] Initialized external benchmark storage at data/benchmark-external.sqlite`
2. **Bắt đầu Refresh:**
   `[Benchmark] Refresh started for scope: openrouter (trigger: manual/cli)`
3. **Hoàn thành Refresh:**
   `[Benchmark] Snapshot snap-1727500000 created for openrouter with 142 entries`
4. **Lỗi Refresh:**
   `[Benchmark] Failed to refresh source openrouter: 503 Service Unavailable (retryable: true)`
5. **Sinh Combo Tự động:**
   `[Combo] Autogenerated combo 'auto-fast' with 4 models (snapshot: snap-1727500000, version: 1)`

---

## 11. SECURITY & CREDENTIAL BOUNDARIES

1. **Public vs Private Sources:**
   - Source chuẩn `openrouter` (`src/benchmarks/external/sources.ts:18`) gọi endpoint public catalog (`https://openrouter.ai/api/v1/models`), **không cần API key**.
   - Nếu trong tương lai có source cần key, key phải được lấy từ `SqliteCredentialStore`, **tuyệt đối không hardcode**.
2. **Bảo mật Logging:**
   - Nghiêm cấm in Authorization headers hoặc token vào log của coordinator/storage.
3. **Database Isolation:**
   - Dữ liệu benchmark công khai nằm ở `data/benchmark-external.sqlite`.
   - Khóa bí mật API keys nằm riêng ở `data/freeroute.sqlite` được mã hóa AES-256-GCM bởi `masterSecret`. Không có liên kết khóa ngoại (Foreign Key) nào giữa hai database này.

---

## 12. E2E VERIFICATION CONTRACT (Đặc tả Bộ Test Phase 5)

Bộ test E2E cho Phase 5 sẽ bao gồm 5 bài kiểm thử trọng tâm:

* **Test A (Production Runtime Boot):**
  - Khởi tạo runtime qua `createOpenRouterRuntime()`.
  - Xác nhận instance `externalBenchmarks` tồn tại trên server options và kết nối SQLite sẵn sàng.
* **Test B (Benchmark Data Ingestion):**
  - Thực thi nạp snapshot benchmark (mock network response của OpenRouter).
  - Xác nhận snapshot và entries được lưu bền vững vào `benchmark-external.sqlite`.
* **Test C (Production Autogenerate Flow):**
  - Gửi request `POST /v1/combos/autogenerate` tới server đang chạy.
  - Xác nhận combo được tạo ra với `context.benchmarks` có dữ liệu thực tế, provenance ghi nhận đúng snapshotId, và combo resolve thành công qua `expandComboModels()`.
* **Test D (Clean Shutdown & Resource Release):**
  - Gọi `runtime.close()`.
  - Xác nhận file database không bị khóa và các handle được đóng hoàn toàn.
* **Test E (Resilience to Ingestion Failure):**
  - Giả lập lỗi network/500 khi nạp benchmark mới.
  - Xác nhận snapshot cũ vẫn nguyên vẹn, server vẫn phục vụ routing bình thường không bị gián đoạn.

---

## 13. SCOPE MATRIX

### MUST HAVE
1. Khởi tạo `ExternalBenchmarkStorage` trong `src/app.ts` và truyền vào `createFreeRouteServer`.
2. Đóng kết nối `ExternalBenchmarkStorage` trong `runtime.close()`.
3. Bổ sung endpoint server hoặc CLI handler để trigger nạp benchmark cho production.
4. E2E verification tests (Test A đến E) đảm bảo 100% xanh.

### SHOULD HAVE
1. Tích hợp `RefreshCoordinator` vào runtime để bảo vệ tránh spam request nạp benchmark.

### NON-GOALS
- KHÔNG sửa đổi `scoreCandidate()`, `expandComboModels()`, hay thuật toán sequential fallback.
- KHÔNG mở lại contracts của Phase 1, 2, 3, 3.5, 4.
- KHÔNG debug HuggingFace/LMSYS (chỉ dùng OpenRouter/mock verified).
- KHÔNG xây dựng background auto-regeneration scheduler bắt buộc.
- KHÔNG xây dựng Web Dashboard UI mới trong phase này.
- KHÔNG tự tiện commit code.

---

## 14. OPEN DECISIONS (Quyết định Cần Thống nhất)

1. **Trigger nạp benchmark chính cho User:**
   - *Lựa chọn 1:* Chỉ dùng lệnh CLI `freeroute benchmark-refresh`.
   - *Lựa chọn 2:* Hỗ trợ cả lệnh CLI và HTTP endpoint `POST /v1/benchmarks/refresh`.
   *(Khuyến nghị: Lựa chọn 2 để linh hoạt cho cả terminal lẫn API client).*
2. **Hành vi khi chưa có Benchmark Data:**
   - Khi vừa cài mới FreeRoute mà chưa từng chạy refresh benchmark, `POST /v1/combos/autogenerate` sẽ dùng 100% `catalog_priority` từ catalog nội bộ để sinh combo (Graceful Degradation).
   *(Khuyến nghị: Chấp nhận Graceful Degradation).*

---

## 15. FOLLOW-UP / FUTURE CAPABILITIES

1. **Scheduled Auto-Regeneration (Phase tương lai):** Khi hệ thống vận hành ổn định, có thể xem xét cung cấp tùy chọn bật cron ngầm định kỳ đánh giá lại combo (e.g. mỗi 24h) nếu người dùng chủ động cấu hình.
2. **Dashboard UI Integration:** Thêm tab Benchmark và các nút tương tác quản lý Combo trên giao diện Web.

---

## 16. VERDICT

```text
READY FOR IMPLEMENTATION
```

**Lý do:** Bản thiết kế đã giải quyết triệt để bài toán tích hợp production, phân định rõ ràng 5 vòng đời, xác định cấu trúc lưu trữ và nguyên tắc cô lập lỗi mà không vi phạm bất kỳ nguyên tắc bất biến nào của FreeRoute. Sẵn sàng chuyển sang giai đoạn implement khi được phê duyệt.
