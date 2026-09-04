# FreeRoute

**Local-first LLM router for free-tier providers.** One endpoint. Automatic fallback. Encrypted secrets. Zero lock-in.

[English Documentation](./README.md) | **[Tài liệu Tiếng Việt](./README.vi.md)**

FreeRoute sits between your tools and the free tiers of OpenRouter, Groq, Cerebras, Google Gemini, GitHub Models, Mistral, SiliconFlow, Hugging Face, Cohere, and Ollama — routing requests to a healthy, quota-available model without you managing keys or guessing which provider is down.

```
Your tool  ──►  FreeRoute  ──►  OpenRouter  (rate-limited)
                │        ──►  Groq        (exhausted)
                └──────►  Gemini      ←  fallback succeeds
```

---

## Status

| | |
|---|---|
| **Build** | ✅ Passing · `tsc` clean |
| **Tests** | ✅ 60/60 green |
| **Version** | 0.1.0 |
| **Bilingual** | 🇻🇳 Tiếng Việt & 🇬🇧 English (100% full i18n & fluid layout) |
| **True Free vs Paid** | 🎁 Strict Zero-Price classification (`:free`, verified) vs Commercial |
| **Custom Combos** | 🔀 Smart fallback chains (`model: "combo:<id>"`) with UI & API |
| **Smart Cooldown** | ⏱️ Stepped backoff (3 fails = 5m, 4 = 30m, 5 = 1h, 6+ = 3h; reset on success) |
| **Context Overflow** | 🔄 Auto-switches to larger models on context overflow; prompts user to refresh session if all fail |
| **1-Click Sync** | ⚡ Auto-detect & import keys (with multi-key preservation & auto custom provider creation) |
| **Anti-Block Safe** | 🛡️ Dedicated guide & header sanitization for Cursor, Cline, Claude CLI |
| **Providers** | 80+ Presets (Kiro, Antigravity, Cline, Groq, Gemini, OpenRouter, etc.) |
| **M1–M5** | ✅ Complete |



---

## Quick start

```bash
# 1. Install
npm install
npm run build

# 2. Configure (use an .env file — it is gitignored)
cat > .env << 'EOF'
FREEROUTE_MASTER_SECRET=change-this-to-a-strong-local-secret
FREEROUTE_API_TOKEN=your-local-bearer-token
EOF

# 3. Add a provider key
node dist/src/cli.js add-key openrouter sk-or-...

# 4. Start
node dist/src/cli.js serve

# 5. Point your tool at:
#    Base URL:  http://127.0.0.1:8787/v1
#    Token:    your-local-bearer-token
```

Open `http://127.0.0.1:8787/` for the dashboard.

---

## CLI reference

```bash
# Key management
freeroute add-key <provider> <api-key>
freeroute list-keys
freeroute remove-key <provider> [credential-id]
freeroute key-validate <provider> [credential-id]

# Custom providers
freeroute provider-add <id> <openai-compatible|gemini> <base-url> [free_verified|free_unverified]
freeroute provider-list
freeroute provider-remove <id>

# Catalog
freeroute refresh              # force-refresh from all providers
freeroute backup <file>        # export catalog + preferences
freeroute restore <file>       # import from backup
freeroute import-9router <db-path> [provider]

# Misc
freeroute status
freeroute serve                # start the routing server
```

**Environment variables:**

| Variable | Default | Description |
|---|---|---|
| `FREEROUTE_PORT` | `8787` | Server port |
| `FREEROUTE_DATA_DIR` | `data/` | SQLite database directory |
| `FREEROUTE_MASTER_SECRET` | *(required)* | AES-256-GCM encryption key for credentials |
| `FREEROUTE_API_TOKEN` | *(optional)* | Bearer token for local API clients; unset to disable auth |
| `FREEROUTE_ENV_FILE` | *(optional)* | Path to `.env` file |
| `FREEROUTE_REFRESH_MINUTES` | `30` | Catalog refresh interval |
| `OPENROUTER_BASE_URL` | OpenRouter default | Override OpenRouter endpoint |
| `GROQ_BASE_URL` | Groq default | Override Groq endpoint |
| `GEMINI_BASE_URL` | Gemini default | Override Gemini endpoint |

---

## API endpoints

All endpoints require `Authorization: Bearer <token>`, unless `FREEROUTE_API_TOKEN` is unset.

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Dashboard (HTML) |
| `GET` | `/health` | Health check |
| `GET` | `/v1/auth/status` | Setup status & configured providers (Public) |
| `GET` | `/v1/providers/presets` | Curated provider directory with direct API key links and seed models (Public) |
| `GET` | `/v1/credentials` | List stored credential metadata (no secrets exposed) |
| `POST` | `/v1/credentials` | Add or update provider API key (auto-seeds catalog models) |
| `DELETE` | `/v1/credentials` | Remove provider credential |
| `GET` | `/v1/providers/custom` | List custom registered providers |
| `POST` | `/v1/providers/custom` | Add custom OpenAI-compatible or Gemini provider |
| `DELETE` | `/v1/providers/custom` | Remove custom provider |
| `POST` | `/v1/import/9router` | Import credential from 9Router SQLite database |
| `GET` | `/v1/import/sources` | Auto-detect stored keys across local 9router and OmniRoute instances (Public) |
| `POST` | `/v1/import/sync` | 1-Click sync discovered credentials into encrypted store and auto-seed models |
| `GET` | `/v1/models` | OpenAI-compatible model list with FreeRoute metadata |
| `POST` | `/v1/chat/completions` | OpenAI chat completions (streaming + non-streaming) |
| `POST` | `/v1/responses` | OpenAI Responses API (streaming + non-streaming) |
| `POST` | `/v1/messages` | Anthropic Messages API (streaming + non-streaming) |
| `GET` | `/v1/provider-health` | Per-provider success rate and latency percentiles |
| `GET` | `/v1/routing-events` | Redacted routing history |
| `GET` | `/v1/quota-observations` | Observed rate-limit data |
| `GET` | `/v1/preferences` | Model/provider preferences |
| `PUT` | `/v1/preferences` | Set preference for a model (`prefer` / `neutral` / `limit` / `block`) |

---

## 🌐 Supported Free Providers Directory

FreeRoute bundles curated presets extracted from battle-tested open-source routers (*9router, OmniRoute, freellmapi, CLIProxyAPI*):

| Provider | Default Base URL | Free Tier Highlights | Direct API Key Link |
| :--- | :--- | :--- | :--- |
| **OpenRouter** | `https://openrouter.ai/api/v1` | 20+ `:free` models | [Get OpenRouter Key](https://openrouter.ai/keys) |
| **Groq Cloud** | `https://api.groq.com/openai/v1` | Ultra-fast LPU (Llama 3.3, Mixtral) | [Get Groq Key](https://console.groq.com/keys) |
| **Google Gemini** | Google AI Studio | Gemini 2.5 Flash, 1M+ context window | [Get Gemini Key](https://aistudio.google.com/app/apikey) |
| **Cerebras** | `https://api.cerebras.ai/v1` | World-record speed (1800+ tok/s) | [Get Cerebras Key](https://cloud.cerebras.ai/platform) |
| **GitHub Models** | `https://models.github.ai/inference` | Azure AI / GPT-4o & Llama via PAT | [Generate GitHub Token](https://github.com/settings/tokens) |
| **Mistral AI** | `https://api.mistral.ai/v1` | Codestral & Mistral Small/Nemo | [Get Mistral Key](https://console.mistral.ai/api-keys/) |
| **SiliconFlow** | `https://api.siliconflow.cn/v1` | Qwen 2.5, DeepSeek V3/R1 | [Get SiliconFlow Key](https://cloud.siliconflow.cn/account/ak) |
| **Hugging Face** | `https://api-inference.huggingface.co/v1` | Serverless Open LLM inference | [Get HuggingFace Token](https://huggingface.co/settings/tokens) |
| **Cohere** | `https://api.cohere.com/v1` | Command R / R+ trial tier | [Get Cohere Key](https://dashboard.cohere.com/api-keys) |
| **Ollama Local** | `http://127.0.0.1:11434/v1` | 100% Offline on localhost | None needed |


**Requesting a model:**

```json
// Auto-select from free-tier providers
{ "model": "auto:free", "messages": [{"role":"user","content":"hi"}] }

// Auto-select tool-capable model for coding
{ "model": "auto:code", "messages": [...], "tools": [...] }

// Named model (exact provider/model)
{ "model": "openrouter/google/gemini-2.0-flash" }

// Structured JSON output
{ "model": "auto:free", "messages": [...], "response_format": { "type": "json_object" } }

// Vision request
{ "model": "auto:free", "messages": [{"role":"user","content": [{"type":"image_url","image_url":{"url":"https://..."}}]}] }
```

**Auto profiles:**

| Profile | Behaviour |
|---|---|
| `auto:free` | Recurring free tiers only; `free_verified` preferred |
| `auto:code` | Tool-calling models first; best for coding agents |
| `auto:fast` | Low-latency, high-success-rate candidates |
| `auto:long-context` | Largest usable context window |

**Response headers** on every routed request:

```
x-freeroute-request-id       UUID for tracing
x-freeroute-provider        Actual provider that served the request
x-freeroute-model           Actual model used
x-freeroute-fallback-count  Number of fallbacks before success
```

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  SQLite  (catalog · credentials · events)    │
└──────────┬───────────────────────┬────────────┘
           │                       │
┌──────────▼──────────┐  ┌──────▼──────────────────┐
│  SqliteProviderStore │  │   CatalogService        │
│  (custom providers)  │  │   (per-provider discover)│
└──────────┬──────────┘  └──────┬──────────────────┘
           │                      │
           │           ┌──────────▼──────────────┐
           │           │  Router                 │
           │           │  score → cooldown → pick │
           │           └──────────┬──────────────┘
           │                      │
┌──────────▼──────────┐  ┌─────▼────────────────────┐
│  OpenAI-compatible  │  │  GeminiAdapter           │
│  (OpenRouter, Groq,│  │  (native REST, vision)  │
│   custom)          │  └─────────────────────────┘
└─────────────────────┘
```

**Key design decisions:**

- Cache-first startup — server responds immediately even if all upstreams are offline
- Encrypted credentials at rest — AES-256-GCM; master secret never leaves the machine
- Routing state is ephemeral — only redacted metadata persisted (no prompts, no outputs)
- Provider adapters are isolated — a failing adapter cannot crash the router

---

## Development

```bash
# Build
npm run build

# Type-check without building
npm run check

# Tests
npm test

# Add a new test (mock-based, no live API calls)
# Edit or create files in test/ — matches src/ layout
```

**File layout:**

```
src/
  app.ts                  Runtime wiring
  cli.ts                  CLI commands
  server.ts               HTTP API + request parsing
  router.ts               Candidate scoring and selection
  inference.ts            ChatService + RouteState
  catalog.ts              CatalogService + InMemoryCatalogStore
  contracts.ts            Shared types
  providers/
    openai-compatible.ts  OpenAI-compatible adapter (OpenRouter, Groq, custom)
    gemini.ts            Gemini native adapter
  storage/
    sqlite-*.ts           SQLite-backed stores (catalog, credentials, events, quotas, preferences, combos)
  importers/
    local-detect.ts       Auto-detect & decrypt 9router/OmniRoute keys
    9router.ts            9Router credential import
```

---

## 🎁 True Free vs Commercial Classification

FreeRoute believes in **absolute transparency** regarding pricing:
- Aggregators like OpenRouter return hundreds of models in their catalog, but 95%+ of them are **commercial pay-per-token** models.
- **FreeRoute classifies models into 2 distinct groups**:
  1. **🎁 100% Free**: Models explicitly zero-priced (e.g., OpenRouter `:free` suffix like `google/gemini-2.0-flash-exp:free`, Google Gemini Free Tier, Groq Free Tier, Cerebras Free Tier, Ollama local).
  2. **💳 Commercial**: Paid models from your own accounts (OpenAI, Anthropic, DeepSeek direct, paid OpenRouter, etc.).
- The dashboard provides separate KPI metric cards and a one-click filter `[x] Show 100% Free Models Only` so you never accidentally incur charges or experience quota surprises.

---

## 🔀 Custom Combos (Smart Fallback Chains)

FreeRoute allows creating custom fallback chains. If the primary model encounters a rate limit (`429`), server error (`500/503`), or context exhaustion, the router seamlessly and instantly cascades to the next candidate model in your defined chain without breaking client streaming.

### Pre-seeded Combos:
- `combo:free-coders`: `groq/llama-3.3-70b-versatile` ➔ `cerebras/llama-3.3-70b` ➔ `openrouter/qwen/qwen-2.5-coder-32b-instruct:free`
- `combo:speed-demons`: `cerebras/llama-3.3-70b` ➔ `groq/llama-3.1-8b-instant` ➔ `cerebras/llama-3.1-8b`
- `combo:smart-chat`: `gemini/gemini-2.5-flash` ➔ `openrouter/google/gemini-2.0-flash-exp:free` ➔ `groq/llama-3.3-70b-versatile`

### API & Usage:
Call any combo in your tools by setting the model name:
```json
{
  "model": "combo:free-coders",
  "messages": [{ "role": "user", "content": "Write a quicksort in Rust" }]
}
```

- `GET /v1/combos`: List all configured combos.
- `POST /v1/combos`: Create or update a combo (`{ comboId, name, models: string[], description }`).
- `DELETE /v1/combos/:id`: Delete a custom combo.

---

## 🛡️ Anti-Block & Safe Connection Best Practices

> [!WARNING]
> **Why IDEs and AI tools suspend accounts:**
> Major platforms (Cursor, Windsurf, Claude Code CLI, Cline) can flag or suspend accounts if:
> 1. You configure a 3rd-party proxy endpoint directly into official account fields while signed in to their commercial sync service.
> 2. Leaked telemetry or inconsistent request headers reveal unauthorized proxying of internal session cookies.
> 3. Models or system prompts clash with upstream compliance filters.

### FreeRoute Safety Safeguards:
- **Strict Localhost Only**: Listens strictly on `127.0.0.1:8787` by default. Never exposes a public IP without your explicit reverse-proxy config.
- **Header Sanitization**: Drops client-specific telemetry headers (`x-cursor-*`, `cf-ray`, internal auth cookies) before forwarding upstream.
- **Zero Prompt Logging**: The SQLite database only records redacted metadata (latency, status code, token counts). Prompt contents and completions are never stored at rest.

### Tool Setup Reference:

#### 1. Cursor IDE
- Go to `Settings` ➔ `Models` ➔ `OpenAI API Key`.
- Override OpenAI Base URL: `http://127.0.0.1:8787/v1`
- Enter any API Key or your `FREEROUTE_API_TOKEN`.
- In Model list, add your desired FreeRoute model or combo: e.g. `combo:free-coders` or `auto:free`.
- **Recommendation**: Disable "Cursor Tab" sync telemetry in Settings to prevent unnecessary internal calls.

#### 2. Cline / Roo Code (VS Code Extensions)
- Select Provider: `OpenAI Compatible`.
- Base URL: `http://127.0.0.1:8787/v1`
- API Key: your local token (or any non-empty string if token disabled).
- Model ID: `combo:free-coders` or `auto:code`.

#### 3. Claude Code CLI
- Use Anthropic endpoint override:
  ```bash
  export ANTHROPIC_BASE_URL="http://127.0.0.1:8787"
  export ANTHROPIC_API_KEY="dummy-or-local-token"
  claude --model auto:free
  ```

#### 4. Continue.dev
In `~/.continue/config.json`:
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

#### 5. GitHub Copilot Custom Endpoint (VS Code)
In your VS Code `settings.json`:
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

> [!TIP]
> **Cloning FreeRoute to a New Machine:**
> The `data/` directory (SQLite database and master encryption key) is intentionally excluded from Git (`.gitignore`) to keep your API tokens 100% private.
> When cloning to a new machine:
> 1. Run `npm install` and start the server: `npm start`
> 2. Open `http://127.0.0.1:8787` in your browser.
> 3. Click **"⚡ Nhập Khóa Từ 9router & OmniRoute"** (or **"➕ Thêm Key Mới"**) to configure your free keys (e.g. Google Gemini, Groq, OpenRouter).
> 4. Once at least one key is configured, your IDE will immediately connect and stream smoothly with zero 502 errors!

---

## Milestones

| Milestone | Status | Key deliverables |
|---|---|---|
| **M1 — routing core** | ✅ | SQLite, encrypted credentials, `/v1/chat/completions`, `auto:free`, retry + cooldown, dashboard |
| **M2 — catalog quality** | ✅ | Background discovery, quota observations, `auto:code/fast/best`, health ranking, adapter tests |
| **M3 — broader compat** | ✅ | `/v1/responses`, `/v1/messages`, streaming tools, vision, structured output, CLI setup |
| **M4 — ecosystem** | ⏳ | Custom provider config ✅ · Embeddings/speech skip (no stable free tier) · Signed catalog pending |

---

## Public endpoints

These routes are accessible **without** any token (`Authorization` header not required):

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Dashboard (HTML) |
| `GET` | `/health` | Health check (`{ status: "ok" }`) |
| `GET` | `/v1/auth/status` | Public status check (`needsSetup`, configured providers) |

All other routes (`/v1/models`, `/v1/chat/completions`, `/v1/responses`, `/v1/messages`, etc.) require `Authorization: Bearer <token>`.

Setting `FREEROUTE_API_TOKEN` to an empty string or omitting it entirely disables all authentication.

---

## Comparison with Related Projects

| Feature | FreeRoute | 9router | OmniRoute | FreeLLMAPI |
|---|---|---|---|---|
| **Focus** | Free-tier routing | Multi-provider proxy | Enterprise routing | Free-tier aggregation |
| **Dashboard** | ✅ Full Modern UI (Analytics, Playground) | ✅ Full UI | ✅ Full UI | ✅ Full UI |
| **Auth flow** | Optional token | Optional login | JWT auth | Setup wizard |
| **Add keys via UI** | ✅ Full UI + Modal | ✅ Modal | ✅ Settings | ✅ UI |
| **Public endpoints** | ✅ `/`, `/health`, `/v1/auth/status` | ✅ Yes | ✅ Yes | ✅ Yes |
| **First-run UX** | ✅ Auto-secret + Onboarding wizard | ✅ Open dashboard | ✅ Open dashboard | ✅ Setup wizard |
| **9Router import** | ✅ CLI + Dashboard Modal | N/A | ✅ Yes | ❌ No |
| **Custom providers** | ✅ CLI + UI + Runtime | ❌ Fixed | ✅ Config | ❌ Fixed |
| **Structured output** | ✅ `response_format` | ❌ | ❌ | ❌ |
| **Tech stack** | Node.js (TypeScript) · 0-deps | Next.js | Next.js | Node.js + React |
| **Complexity** | Simple & lightweight | Medium | Complex | Medium |

---

## UX Issues (TODO)

### Current Problem

Requires `.env` with token **before** accessing dashboard. Compare:

| Project | Start → Dashboard | See Status | Add Keys |
|---|---|---|---|
| 9router | ✅ Immediate | ✅ Yes | ✅ UI |
| FreeLLMAPI | ✅ Immediate | ✅ Yes | ✅ UI |
| FreeRoute | ✅ Dashboard works immediately (public) | ✅ Yes | ❌ CLI only |

### Reference: Key Patterns

| Project | Public Endpoints | Auth | Add Keys |
|---|---|---|---|
| 9router | `/api/health`, `/api/init`, `/api/auth/status` | Optional | Dashboard UI |
| FreeLLMAPI | `/api/auth/status` (with `needsSetup`) | Setup wizard | Dashboard UI |
| FreeRoute | `/` and `/health` | Optional token | CLI only |

### Migration Path

```bash
# Current (good — dashboard already public):
freeroute serve                         # Start server
# Open http://127.0.0.1:8787/          # Dashboard works immediately
# Add key via CLI: freeroute add-key openrouter sk-or-...

# Future (even better):
freeroute serve                         # Start server
# Add key via dashboard modal when first visiting
```

### Reference: Key Code Patterns

**FreeLLMAPI** (`/api/auth/status`):
```typescript
authRouter.get('/status', (req, res) => {
  res.json({
    needsSetup: userCount() === 0,
    authenticated: !!session
  });
});
```

**9router** (public paths):
```javascript
const PUBLIC_API_PATHS = ["/api/health", "/api/init", "/api/auth/status"];
```

**FreeLLMAPI** (health):
```typescript
res.json({ platforms: [...], keys: [...], healthy: boolean });
```

---

## Roadmap

| Priority | Item | Status | Description |
|---|---|---|---|
| P0 | Public endpoints | ✅ Done | `/`, `/health`, and `/v1/auth/status` accessible without token |
| P0 | Dashboard UX | ✅ Done | Show empty state + setup instructions when no keys |
| P1 | Add key via UI | ✅ Done | Modal to add/manage API keys directly from dashboard |
| P1 | Auto-generate token | ✅ Done | Auto-generate master secret & manage local API token |
| P2 | First-run wizard | ✅ Done | Step-by-step onboarding guide on initial launch |
| P2 | Real-time stats | ✅ Done | Poll health, quota, and events every 30s with toggle |
| P3 | Web redesign | ✅ Done | Modern dark lab UI with analytics, test playground & quick connect |
| P4 | Bilingual & Presets | ✅ Done | 🇻🇳 Tiếng Việt & 🇬🇧 English UI, 10 Curated Providers, Auto-Model Seeding |
| P5 | 1-Click Sync & NOC Monitor | ✅ Done | ⚡ 1-Click sync from 9router/OmniRoute, Model Sorting/Filters, NOC Health Matrix, 70+ Presets (Free vs Commercial) |
| P6 | True Free Clarity & Custom Combos | ✅ Done | 🎁 Minh bạch Model 100% Free vs Paid, 🔀 Custom Combos Fallback Chain, 🛡️ Cẩm nang kết nối an toàn chống khóa tài khoản IDE |



---

## License

MIT — see `LICENSE` file.
