# FreeRoute

> Local-first, quota-aware routing for officially available LLM free tiers — one endpoint for every supported client.

## Project status

**Current phase: complete — milestones 1, 2, and 3 done. Milestone 4 (modalities and ecosystem) is next.**

FreeRoute ships as a usable local router: add keys via CLI, start the server, point any OpenAI-compatible client at `http://127.0.0.1:8787`. This README is the source of truth for product direction, technical decisions, and current work state.

### Quick start

```powershell
# Set secrets (via env file, gitignored, or inline)
$env:FREEROUTE_MASTER_SECRET = '<at-least-16-character local secret>'
$env:FREEROUTE_API_TOKEN   = '<local client token>'

# Add an API key
freeroute add-key openrouter sk-or-your-key-here

# Start the server
freeroute serve

# Or import from 9Router
freeroute import-9router C:\path\to\9router.sqlite openrouter
```

After startup, point any OpenAI-compatible client at `http://127.0.0.1:8787/v1` with the client token. Use `model: "auto:free"` or any listed `provider/model-id`. The catalog refreshes in the background every 30 minutes. Set `FREEROUTE_DATA_DIR`, `FREEROUTE_PORT`, or `OPENROUTER_BASE_URL` to override defaults. Open `http://127.0.0.1:8787/` for the dashboard.

### Progress

| Area | Status | Notes |
| --- | --- | --- |
| Product scope | Complete | Personal/local-first router for user-supplied provider credentials. |
| Architecture | Complete | Core is provider-independent; providers load as adapters. |
| Repository bootstrap | Complete | Git repository, README and secret-safe ignore rules present. |
| Routing core | Complete | Candidate contracts, deterministic score selection and scoped cooldown. |
| CLI setup | Complete | `add-key`, `list-keys`, `remove-key`, `status`, `import-9router`, `serve`, `backup`, `restore`, `refresh`, `key-validate`. |
| Durable catalog cache | Complete | SQLite catalog storage, cache-first startup, 30-min background refresh. |
| Credential security | Complete | AES-256-GCM SQLite credential store; CLI key management. |
| Existing-router import | Complete | Opt-in 9Router importer with encrypted transfer. |
| OpenAI-compatible API | Complete | `/health`, `/v1/models`, streaming/non-streaming `/v1/chat/completions`, `/v1/responses`, `/v1/messages`; tool support. |
| Inference fallback | Complete | Retry on rate-limit/quota/temp; auth errors surface safely. |
| Provider discovery | Complete | Non-overlapping schedule, cache-safe upsert, unit-tested. |
| Routing, quota and fallback | Complete | `auto:free`, `auto:code` (tools-cap), `auto:fast` (3x latency), `auto:long-context`; cooldown, events, quota obs, preferences. |
| Vision support | Complete | image_url content parts routed to vision-capable providers (OpenAI-compatible, Gemini). |
| Structured output | Complete | `response_format: {type:"json_object"}` routing and forwarding. |
| Dashboard | Complete | Provider health, quota observations, model catalog, preference controls, redacted routing history. |
| Provider adapters | Complete | OpenRouter + Groq (OpenAI-compatible) and native Gemini text/streaming/tools/vision. |
| Embeddings & speech | Pending | Extensible via adapter contract; not yet wired. |
| Custom provider config | Complete | `provider-add`, `provider-list`, `provider-remove` CLI commands; SQLite-backed; loaded at runtime. |
| Signed catalog format | Pending | Import/export catalog, signed upstream catalog for offline use. |

## Why FreeRoute

Free tiers are fragmented: each provider has a different key, model catalog, rate limit, response format and availability profile. A capable model can be unusable at one moment because its quota is exhausted or the service is rate-limited, while another free provider is healthy.

FreeRoute gives applications a single local endpoint. The router selects a compatible, healthy model from keys the user has explicitly configured, tracks observed limits, and fails over safely. It is designed for coding agents and ordinary OpenAI-compatible applications.

The project will not bypass provider authentication, scrape protected services, or disguise traffic. Provider credentials are supplied and owned by the user, and each provider's terms continue to apply.

## Product goals

- One local OpenAI-compatible endpoint for many free-tier providers.
- Automatic catalog refresh without making startup slow or fragile.
- Useful defaults: `auto:free`, `auto:code`, `auto:fast`, `auto:best`.
- Transparent decisions: expose the actual provider/model, fallback path and reason.
- Personal quality controls: prefer, limit, or block models based on real usage.
- Modular providers: adding an OpenAI-compatible upstream should be mostly configuration; a native provider should be a small adapter plus tests.
- Local-first secrets and telemetry.

## Non-goals

- A hosted multi-tenant API gateway in the first releases.
- Claims that all free tiers are unlimited or production-SLA reliable.
- Circumvention of authentication, billing, rate limits or provider terms.
- Starting with every modality and every provider before the chat/router core is reliable.

## User experience

1. Start FreeRoute and open the local dashboard.
2. Add official provider API keys; keys are encrypted at rest.
3. FreeRoute validates the key, imports models and records known free-tier metadata.
4. Copy one base URL and one FreeRoute bearer key into Codex, Claude Code-compatible configuration, Cursor, Cline, or an SDK.
5. Request `model: "auto:code"` or a named model. The dashboard shows exactly which upstream served it.

```text
Client
  │  OpenAI-compatible request
  ▼
FreeRoute /v1
  │
  ├─ API normalization and capability check
  ├─ router ranking + quota/health gate
  ├─ provider adapter
  └─ normalized streaming response
        │
        ▼
   Provider API selected for this request
```

## Architecture

The project will be a TypeScript monorepo on Node.js 20+ with SQLite for a single-user local deployment.

```text
apps/
  server/                 HTTP API, SSE, auth, scheduler
  dashboard/              Local web UI
  cli/                    setup helpers for coding clients
packages/
  core/                   normalized request/response contracts
  router/                 candidate selection, retry and sticky sessions
  catalog/                model catalog, discovery and freshness rules
  quota/                  declared and observed rate-limit accounting
  storage/                SQLite schema, migrations, encrypted secrets
  telemetry/              privacy-conscious request facts and aggregates
  provider-sdk/           adapter interface and conformance test kit
  providers/
    gemini/
    groq/
    openrouter/
    openai-compatible/
```

### Startup and catalog refresh

The server must not block on dozens of remote calls at startup.

1. Open SQLite and load the last known catalog, enabled keys and routing profiles.
2. Start serving requests immediately from that cache.
3. Run adapter discovery jobs concurrently with bounded concurrency and timeouts.
4. Upsert changed models/capabilities/free-tier metadata; retain the last good record if discovery fails.
5. Run a scheduled refresh afterwards, with jitter and per-provider backoff.

Every catalog entry carries `source`, `checkedAt`, `expiresAt`, and a confidence classification:

- `free_verified` — free status and quota are documented or returned by the official API.
- `free_unverified` — advertised as free, but quota cannot be reliably verified.
- `credits_only` — a signup/promo credit, not a recurring pool.
- `paid` — discoverable but excluded from `auto:free` by default.
- `retired` — previously known and retained for history, never auto-routed.

## Provider adapter contract

Each adapter owns protocol conversion and provider-specific discovery, not routing policy.

```ts
export interface ProviderAdapter {
  manifest: ProviderManifest;
  validateCredential(credential: Credential): Promise<CredentialHealth>;
  discoverModels(context: DiscoveryContext): Promise<DiscoveredModel[]>;
  discoverQuota?(context: DiscoveryContext): Promise<QuotaSnapshot[]>;
  invoke(request: NormalizedRequest, target: RouteTarget): AsyncIterable<NormalizedEvent>;
}
```

An adapter must declare capabilities such as chat, streaming, tools, structured output, vision, embeddings and audio. It must also map upstream failures into normalized classes: authentication, quota, rate limit, temporary upstream error, unsupported feature and permanent request error.

## Routing

Routes are candidates, not a fixed global list. A candidate is eligible only when it has an enabled credential, supports the request's capabilities, is not in cooldown, and has not exceeded a known quota.

```text
effective score =
  profile priority
  + personal preference
  + observed reliability
  + remaining quota estimate
  + latency score
  - recent error penalty
  - limit/unknown-quota penalty
```

Profiles initially include:

- `auto:free`: recurring free tiers only, with verified models preferred.
- `auto:code`: tool calling and user-rated coding models first.
- `auto:fast`: low observed latency and high success rate.
- `auto:best`: balanced quality, health, quota and user preference.
- `auto:long-context`: eligible models with the largest usable context.

On `429`, transient `5xx`, connection failure, or known exhausted quota, the router records a scoped cooldown and tries the next safe candidate. It never retries permanent validation/authentication errors as a fallback loop.

## Personal feedback and live visibility

Each completed request records an immutable routing event:

```text
timestamp, profile, requested model, selected provider/model,
credential reference (redacted), latency, TTFT, token counts,
outcome, fallback chain and normalized error reason
```

The dashboard will let the user mark a provider/model as:

- **Prefer** — boosts it when it meets the request requirements.
- **Neutral** — no manual adjustment.
- **Limit** — retains it as a later fallback.
- **Block** — excludes it from automatic profiles.

Optional 1–5 ratings and tags (`good-code`, `fast`, `bad-tools`, `unstable`) provide a separate personal score. No prompt or output is stored by default.

## Dashboard roadmap

### Free Tier Explorer

A searchable table of provider/model records, free-tier classification, known limits, freshness, capability, health and remaining observed quota. It includes rankings for available free capacity, reliability, latency, tool support and user score.

### Live Routing

Shows the actual model/provider per request in near real time, including the complete fallback path. Example:

```text
auto:code → Groq/model-a (429, cooldown 60s) → Gemini/model-b (success, 1.2s)
```

### Provider Health

Ranks enabled providers by success rate, latency p50/p95, recent 429 rate, cooldown state and observed available capacity.

### Preferences

Lets users reorder profiles and assign Prefer/Limit/Block rules without needing to edit provider code.

## API delivery order

### Milestone 1 — usable routing core

- SQLite migrations and encrypted credential store.
- `/v1/models`, non-streaming and SSE `/v1/chat/completions` are implemented.
- `auto:free` and named-model routing are implemented.
- OpenRouter Free, Groq, and native Gemini adapters are wired.
- Basic retry, cooldown, request trace and local dashboard.

### Milestone 2 — reliable catalog and decision quality

- Background discovery and catalog freshness states.
- Quota observations from headers/responses.
- `auto:code`, `auto:fast`, `auto:best` profiles.
- Health ranking, feedback controls and live routing screen.
- Provider adapter conformance tests.

### Milestone 3 — broader compatibility

- Streaming and non-streaming `/v1/responses` for Codex-oriented clients are implemented.
- Streaming and non-streaming Anthropic Messages compatibility for Claude-oriented clients are implemented.
- Native Gemini compatibility is implemented for text chat, streaming, and SSE.
- Tool calls, vision (image_url), and structured output (response_format) parity are implemented.
- CLI setup commands (`backup`, `restore`, `refresh`, `key-validate`) and safe config backup are implemented.

### Milestone 4 — additional modalities and ecosystem

- Embeddings, images, speech/transcription where official free tiers permit.
- Custom OpenAI-compatible provider configuration.
- Signed/updatable catalog format, import/export and an adapter SDK.

## Initial provider strategy

Start with providers that offer official APIs, documented developer access and relatively stable free-tier information. The initial adapter targets are Gemini AI Studio, Groq and OpenRouter's explicitly free models. The next wave will be chosen based on API stability, terms, actual model discovery support, and user demand — not simply marketing claims.

### Verified integration evidence

On 2026-09-03, the OpenAI-compatible adapter was tested against an active, user-owned OpenRouter connection from the local 9Router installation. The live `/models` response contained 423 catalog models, including 21 entries with both prompt and completion price reported as zero. A one-token-style smoke prompt completed successfully through `inclusionai/ling-3.0-flash-fin:free`.

The imported credential existed only in the test process: it was neither printed, committed, nor persisted to the FreeRoute database. A dedicated opt-in import/setup command is required before a regular FreeRoute server can use an existing 9Router credential.

## Data model outline

```text
providers           provider metadata and adapter version
credentials         encrypted secret material, enabled state, health
models              provider model metadata and capabilities
catalog_observations source, freshness, limits and confidence
route_profiles      profile constraints and ordered preferences
preferences         provider/model ratings and routing modifiers
quota_windows       per credential/model rate-limit observations
routing_events      redacted outcome, timing and fallback trace
```

## Decisions already made

| Decision | Rationale |
| --- | --- |
| Local-first and single-user first | Keeps secrets and prompts on the user's machine; minimizes operations. |
| Cache-first startup | A temporary upstream/catalog outage must not stop the router. |
| Adapter modules, not a giant provider switch | Provider additions and repairs remain isolated and testable. |
| Quota as observed data plus documented metadata | Providers often omit precise quota APIs; the router must not pretend certainty. |
| Feedback influences routing but does not override hard capability/limit gates | A preferred model cannot be selected when it cannot serve the request. |
| Official/provider-authorized access only | Long-term maintainability and account safety. |

## Handoff notes

When continuing this project, read this README first, then update the **Project status** table and the milestone checklist as work is completed. Preserve these constraints:

1. Do not put provider secrets, prompt text, or raw responses in logs by default.
2. A discovery failure must preserve the last known good catalog.
3. A provider adapter must have mock tests for streaming, `429`, temporary failure and unsupported features.
4. Routing decisions must be observable from a request ID and must name the actual upstream in a response header.
5. Free-tier status must carry provenance and freshness; do not convert unclear marketing claims into a verified quota.

## References informing the design

The local repositories `9router`, `OmniRoute`, `CLIProxyAPI`, and `freellmapi` were reviewed for their public architecture and feature sets. FreeRoute adopts the useful patterns — unified endpoint, provider adapters, fallback, quota visibility and a dashboard — while keeping the initial codebase smaller, local-first and explicitly modular.
