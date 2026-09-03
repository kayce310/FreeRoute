# FreeRoute

**Local-first LLM router for free-tier providers.** One endpoint. Automatic fallback. Encrypted secrets.

FreeRoute sits between your tools and the free tiers of OpenRouter, Groq, and Gemini — routing requests to a healthy, quota-available model without managing keys or guessing which provider is down.

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
| **Tests** | ✅ 45/45 green |
| **Version** | 0.1.0 |
| **Providers** | OpenRouter · Groq · Gemini · custom (CLI) |
| **M1–M3** | ✅ Complete |
| **M4** | Custom provider ✅ · Embeddings/speech ⏸ · Signed catalog ⏸ |

---

## Quick start

```bash
# 1. Build
npm install
npm run build

# 2. Set secrets (use an .env file — gitignored)
cat > .env << 'EOF'
FREEROUTE_MASTER_SECRET=change-to-a-strong-local-secret
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

Open `http://127.0.0.1:8787/` for the dashboard. All API endpoints require the bearer token.

---

## CLI reference

```bash
# Key management
freeroute add-key <provider> <api-key>
freeroute list-keys
freeroute remove-key <provider> [credential-id]
freeroute key-validate <provider> [credential-id]

# Custom providers (M4)
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
freeroute serve               # start the routing server
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `FREEROUTE_PORT` | `8787` | Server port |
| `FREEROUTE_DATA_DIR` | `data/` | SQLite database directory |
| `FREEROUTE_MASTER_SECRET` | *(required)* | AES-256-GCM encryption key for credentials |
| `FREEROUTE_API_TOKEN` | *(required)* | Bearer token for local API clients |
| `FREEROUTE_ENV_FILE` | *(optional)* | Load secrets from `.env` file |
| `FREEROUTE_REFRESH_MINUTES` | `30` | Catalog refresh interval |
| `OPENROUTER_BASE_URL` | *(default)* | Override OpenRouter endpoint |
| `GROQ_BASE_URL` | *(default)* | Override Groq endpoint |
| `GEMINI_BASE_URL` | *(default)* | Override Gemini endpoint |

---

## API

All endpoints require `Authorization: Bearer <token>`.

### Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Dashboard (HTML) |
| `GET` | `/health` | Health check |
| `GET` | `/v1/models` | OpenAI-compatible model list with FreeRoute metadata |
| `POST` | `/v1/chat/completions` | OpenAI chat completions — streaming & non-streaming |
| `POST` | `/v1/responses` | OpenAI Responses API — streaming & non-streaming |
| `POST` | `/v1/messages` | Anthropic Messages API — streaming & non-streaming |
| `GET` | `/v1/provider-health` | Per-provider success rate and latency percentiles |
| `GET` | `/v1/routing-events` | Redacted routing history |
| `GET` | `/v1/quota-observations` | Observed rate-limit data |
| `GET` | `/v1/preferences` | Model/provider preferences |
| `PUT` | `/v1/preferences` | Set preference (`prefer` / `neutral` / `limit` / `block`) |

### Requesting models

```json
// Auto-select free-tier — router picks the best available
{ "model": "auto:free", "messages": [{"role":"user","content":"hi"}] }

// Coding agents: tool-calling models first
{ "model": "auto:code", "messages": [...], "tools": [...] }

// Exact model
{ "model": "openrouter/google/gemini-2.0-flash" }

// Structured JSON response
{ "model": "auto:free", "messages": [...], "response_format": { "type": "json_object" } }

// Vision (image_url content parts)
{ "model": "auto:free", "messages": [{"role":"user","content": [{"type":"image_url","image_url":{"url":"https://..."}}]}] }
```

### Auto profiles

| Profile | Behaviour |
|---|---|
| `auto:free` | Recurring free tiers only; `free_verified` preferred |
| `auto:code` | Tool-calling models first |
| `auto:fast` | Low-latency, high-success-rate candidates |
| `auto:long-context` | Largest usable context window |

### Response headers

Every routed request returns:

```
x-freeroute-request-id       trace UUID
x-freeroute-provider         actual provider used
x-freeroute-model           actual model used
x-freeroute-fallback-count  fallbacks before success
```

---

## Architecture

```
┌──────────────────────────────────────────────┐
│  SQLite (catalog · credentials · events)      │
└──────────┬──────────────────┬───────────────┘
           │                  │
┌──────────▼──────────┐  ┌──▼─────────────────────┐
│  SqliteProviderStore │  │  CatalogService          │
│  (custom providers)  │  │  per-provider discovery   │
└──────────┬──────────┘  └───┬─────────────────────┘
           │                  │
           │        ┌────────▼──────────────┐
           │        │  Router              │
           │        │  score → cooldown → pick│
           │        └────────┬──────────────┘
           │                 │
┌──────────▼──────────┐  ┌─▼──────────────────────┐
│  OpenAI-compatible  │  │  GeminiAdapter          │
│  (OpenRouter, Groq, │  │  native REST + vision   │
│   custom)          │  └───────────────────────┘
└────────────────────┘
```

### Key design decisions

- **Cache-first startup** — server responds immediately even if all upstreams are offline
- **Encrypted credentials at rest** — AES-256-GCM; master secret never leaves the machine
- **Routing state is ephemeral** — only redacted metadata persisted (no prompts, no outputs)
- **Provider adapters are isolated** — a failing adapter cannot crash the router
- **Official access only** — no scraping, no key bypass; user-supplied credentials only

---

## Development

```bash
npm run build   # compile TypeScript
npm run check   # type-check without building
npm test        # 45 tests, mock-based, no live API calls
```

### File layout

```
src/
  app.ts                  runtime wiring
  cli.ts                  CLI commands
  server.ts               HTTP API + request parsing
  router.ts               candidate scoring and selection
  inference.ts            ChatService + RouteState
  catalog.ts              CatalogService + stores
  contracts.ts            shared types
  providers/
    openai-compatible.ts  OpenAI-compatible adapter
    gemini.ts             Gemini native adapter
  storage/
    sqlite-*.ts           SQLite-backed stores
  importers/
    9router.ts           9Router credential import
```

---

## Milestones

| Milestone | Status | Deliverables |
|---|---|---|
| **M1 — routing core** | ✅ | SQLite, encrypted credentials, `/v1/chat/completions`, `auto:free`, retry + cooldown, dashboard |
| **M2 — catalog quality** | ✅ | Background discovery, quota observations, `auto:code/fast/best`, health ranking, adapter tests |
| **M3 — broader compat** | ✅ | `/v1/responses`, `/v1/messages`, streaming tools, vision, structured output, CLI setup |
| **M4 — ecosystem** | ⏸ | Custom provider config ✅ · Embeddings/speech paused · Signed catalog pending |

---

## Non-goals

- Multi-tenant or hosted API gateway
- Unlimited or SLA-guaranteed free tier access
- Bypassing provider authentication or rate limits
- Supporting every provider before the core is stable

---

## License

MIT — see `LICENSE` file.
