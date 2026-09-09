# MIGRATION_AUDIT: 9router to FreeRoute

## A. Audit 9router

### 1. Data Model / DB schema
- **Path**: `D:/9router/src/lib/db/schema.js`
- **Tables**:
  - `providerConnections`: Stores account credentials and metadata.
    - Columns: `id` (PK), `provider`, `authType`, `name`, `email`, `priority`, `isActive`, `data` (JSON string containing secrets like `apiKey`, `accessToken`), `createdAt`, `updatedAt`.
  - `combos`: Stores multi-model fallback chains.
    - Columns: `id` (PK), `name` (unique), `kind`, `models` (JSON string array of model IDs), `createdAt`, `updatedAt`.
  - `apiKeys`: Manages endpoint access keys.
  - `providerNodes`: Internal provider metadata/capabilities.
  - `usage`: Usage history and statistics.
- **Logic**: Uses `better-sqlite3` (optional) or `sql.js` (fallback) via a repository pattern in `src/lib/db/repos/`. Secrets in `providerConnections.data` are stored as JSON strings.

### 2. Flow "Add Provider" and "Add Key"
- **Path**: `D:/9router/src/lib/db/repos/connectionsRepo.js`
- **Logic**: 
  - UI sends provider info and credentials to API.
  - `createProviderConnection` generates a UUID and upserts into `providerConnections`.
  - `data` column stores encrypted/sensitive fields (though encryption logic wasn't explicitly seen in the repo logic, search suggests Next.js auth or environment-level encryption for cloud sync).
  - Validation is often handled at the provider executor level before saving.

### 3. Flow "Add Model"
- **Path**: `D:/9router/src/lib/db/repos/aliasRepo.js` and `providerNodes`.
- **Logic**: Models are mapped via aliases or custom model entries. Capabilities (vision, tools) are typically defined in provider-specific files in `open-sse/providers/registry/`.

### 4. Flow "Test Model" / "Validate Key"
- **Logic**: Handled by provider-specific executors in `open-sse/providers/`. It attempts a minimal chat completion (e.g., "hi") and updates `testStatus`, `lastTested`, `lastError` in `providerConnections.data`.

### 5. Multi-key & Fallback Logic
- **Path**: `D:/9router/open-sse/services/accountFallback.js`
- **Logic**: 
  - Tracks `rateLimitedUntil` and `backoffLevel`.
  - `checkFallbackError` matches error status/text against `ERROR_RULES`.
  - Supports exponential backoff (1s, 2s, 4s... up to 4m).
  - Selects the next available key (round-robin or priority-based) when one fails.

### 6. Combo Logic
- **Path**: `D:/9router/src/sse/handlers/chat.js`
- **Logic**: 
  - Resolves model name to a combo.
  - Iterates through the `models` array in the combo.
  - For each model, finds available credentials.
  - If a model/key fails, it triggers the fallback to the next candidate in the chain.

### 7. Dashboard
- **Path**: `D:/9router/src/app/dashboard/`
- **Logic**: Built with Next.js App Router. Uses React components with Zustand for state and calls `/api/...` endpoints.

### 8. Dependencies
- **DB**: `better-sqlite3`, `sql.js`.
- **UI**: Next.js, React, Tailwind CSS, `@dnd-kit`.
- **Misc**: `jose` (JWT), `bcryptjs`, `uuid`, `socks-proxy-agent`.

## B. Audit FreeRoute

### 1. Data Model / DB schema
- **Path**: `D:/FreeRoute/src/storage/`
- **Tables**:
  - `credentials`: `provider_id`, `credential_id`, `encrypted_secret` (AES-256-GCM), `created_at`, `updated_at`.
  - `combos`: `combo_id`, `name`, `models_json`, `description`, `created_at`, `updated_at`.
  - `catalog_models`: `provider_id`, `model_id`, `capabilities_json`, `free_tier`, `checked_at`, `expires_at`, `priority`.
  - `routing_events`: Logs every request for usage/telemetry.

### 2. Flow "Add Provider" and "Add Key"
- **Path**: `D:/FreeRoute/src/storage/sqlite-credential-store.ts`
- **Logic**: 
  - `put` encrypts secrets using `AES-256-GCM` with a master secret derived via SHA-256.
  - UI/CLI provides credentials.

### 3. Flow "Add Model"
- **Path**: `D:/FreeRoute/src/storage/sqlite-catalog-store.ts`
- **Logic**: Catalog store tracks models and their capabilities. Capabilities are strictly typed (chat, vision, tools, etc.).

### 4. Flow "Test Model" / "Validate Key"
- **Path**: `D:/FreeRoute/test/` and `src/inference.ts`.
- **Logic**: Validation is primarily via automated tests or manual triggers in the CLI/Dashboard. It checks for specific response shapes.

### 5. Multi-key & Fallback
- **Path**: `D:/FreeRoute/src/router.ts`
- **Logic**: 
  - `RouteCandidate` includes `healthScore`, `latencyScore`, `quotaScore`, and `cooldownUntil`.
  - Scoring determines the best candidate.

### 6. Combo Logic
- **Path**: `D:/FreeRoute/src/router.ts`
- **Logic**: Current implementation is "smart routing" based on scores rather than a fixed sequence, though `sqlite-combo-store.ts` exists for custom sequences.

### 7. Dashboard
- **Path**: `D:/FreeRoute/src/dashboard.ts`
- **Logic**: Single-file HTML/JS string served via `node:http`. Zero-dependency UI.

### 8. Dependencies
- **Zero-dependency**: Only uses `node:sqlite`, `node:crypto`, `node:http`.

## C. So sánh & Gap Analysis

| Feature | 9router | FreeRoute | Gap / Note |
|---|---|---|---|
| DB Driver | better-sqlite3 / sql.js | node:sqlite | FreeRoute uses the new native Node.js driver (STRICT mode). |
| Encryption | (Variable/Cloud) | AES-256-GCM (Mandatory) | FreeRoute has stronger local secret protection. |
| Multi-key | Round-robin / Error-driven | Score-based | 9router is more "reactive" (fail -> switch), FreeRoute is more "proactive" (health scoring). |
| Combo Logic | Fixed sequence fallback | Score-based + Custom | FreeRoute needs to implement the "fixed sequence" UI/Logic better to match 9router's UX. |
| UI | Next.js (Heavy) | Vanilla JS (Zero-dep) | Porting 9router UI requires rewriting React components into Vanilla JS/Templates. |

## D. Rủi ro & Ràng buộc FreeRoute
- **Zero-dependency constraint**: Cannot port 9router's UI components (React) or DB repos directly. Must re-implement using `node:sqlite` and Vanilla DOM.
- **Encryption**: Must maintain the `SqliteCredentialStore` encryption pattern. 9router's "plain-ish" JSON storage must be encrypted before saving in FreeRoute.
- **Compatibility**: The new "combo" logic must not break existing `routing_events` logging or the NOC monitor.
