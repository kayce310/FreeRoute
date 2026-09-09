## 1. FreeRoute: Nơi gọi `chooseRoute()` và `getCandidateDiagnostics()`
### `chooseRoute()` calls:
Không tìm thấy lời gọi `chooseRoute()` trong `D:/FreeRoute/src`.
### `getCandidateDiagnostics()` calls:
Không tìm thấy lời gọi `getCandidateDiagnostics()` trong `D:/FreeRoute/src`.
### Hàm `buildRouteCandidates` (nơi tạo `RouteCandidate[]`)
**File:** `D:/FreeRoute/src/router.ts`
```typescript

```

## 2. FreeRoute: Xử lý nhiều credential khi tạo RouteCandidate
Code không rõ ràng về cách tạo nhiều `RouteCandidate` cho nhiều credential của cùng một provider.

## 3. FreeRoute: Nơi lưu lại cooldown sau `applyFailureCooldown()`
Không tìm thấy lời gọi `applyFailureCooldown()` trong `D:/FreeRoute/src`.

## 4. FreeRoute: Xử lý request `combo:xxx`
### Đoạn code liên quan từ `D:/FreeRoute/src/router.ts`
```typescript

```
Hàm xử lý `combo:xxx` nằm trong `route()` của `D:/FreeRoute/src/router.ts`. Nó gọi `comboStore.get(comboId)` để lấy combo, sau đó lặp qua từng `modelId` trong `combo.models` để tạo `RouteCandidate` cho mỗi model. Cuối cùng, tất cả `candidates` được đưa vào `scoreRouteCandidates` để sắp xếp và chọn ra route tốt nhất, do đó thứ tự trong combo không được tôn trọng tuyệt đối.

## 5. 9router: `getProviderCredentials` từ `open-sse/services/auth.js`
```javascript

```
Không thể phân tích logic chọn key kế tiếp từ đoạn code này.

## 6. 9router: `handleComboChat` từ `open-sse/services/combo.js`
```javascript

```
Không thể phân tích logic xử lý khi model fail hoặc cấu trúc final error message từ đoạn code này.
