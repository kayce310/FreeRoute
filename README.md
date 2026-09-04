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
| **Tests** | ✅ 51/51 green |
| **Version** | 0.1.0 |
| **Bilingual** | 🇻🇳 Tiếng Việt & 🇬🇧 English UI & Docs |
| **Providers** | OpenRouter · Groq · Gemini · Cerebras · GitHub · Mistral · SiliconFlow · HF · Cohere · Ollama |
| **M1–M4** | ✅ Complete (UI, Bilingual, Credentials, Auto-Seed Models, Presets) |


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
| `GET` | `/v1/credentials` | List stored credential metadata (no secrets exposed) |
| `POST` | `/v1/credentials` | Add or update provider API key |
| `DELETE` | `/v1/credentials` | Remove provider credential |
| `GET` | `/v1/providers/custom` | List custom registered providers |
| `POST` | `/v1/providers/custom` | Add custom OpenAI-compatible or Gemini provider |
| `DELETE` | `/v1/providers/custom` | Remove custom provider |
| `POST` | `/v1/import/9router` | Import credential from 9Router SQLite database |
| `GET` | `/v1/models` | OpenAI-compatible model list with FreeRoute metadata |
| `POST` | `/v1/chat/completions` | OpenAI chat completions (streaming + non-streaming) |
| `POST` | `/v1/responses` | OpenAI Responses API (streaming + non-streaming) |
| `POST` | `/v1/messages` | Anthropic Messages API (streaming + non-streaming) |
| `GET` | `/v1/provider-health` | Per-provider success rate and latency percentiles |
| `GET` | `/v1/routing-events` | Redacted routing history |
| `GET` | `/v1/quota-observations` | Observed rate-limit data |
| `GET` | `/v1/preferences` | Model/provider preferences |
| `PUT` | `/v1/preferences` | Set preference for a model (`prefer` / `neutral` / `limit` / `block`) |

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
    sqlite-*.ts           SQLite-backed stores
  importers/
    9router.ts          9Router credential import
```

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

---

## License

MIT — see `LICENSE` file.
