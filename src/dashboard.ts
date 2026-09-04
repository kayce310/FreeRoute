/**
 * Modern, responsive Dashboard for FreeRoute.
 * Incorporates best practices from OmniRoute, 9router, FreeLLMAPI, and CLIProxyAPI:
 * - Lab/Dark theme with glowing accents and sleek typography
 * - First-run onboarding wizard when needsSetup === true
 * - Add/Manage API Keys directly in UI (OpenRouter, Groq, Gemini, Custom)
 * - Provider Health Matrix & Latency percentiles (Analyst)
 * - Live Quota & Cooldown observations
 * - Model Catalog with instant preference toggling (prefer / neutral / limit / block)
 * - 30-second real-time stats polling with toggle and visual countdown
 * - Interactive Prompt Playground with route tracing headers (x-freeroute-provider, etc.)
 * - One-click Quick Connect guides for Cursor, Cline, Python, and cURL
 */
export function dashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>FreeRoute</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111827;
      --card-hover: #151e32;
      --card-border: #1f293d;
      --border-focus: #3b82f6;
      --text: #f9fafb;
      --text-muted: #9ca3af;
      --text-dim: #6b7280;
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --primary-gradient: linear-gradient(135deg, #6366f1 0%, #06b6d4 100%);
      --accent: #06b6d4;
      --success: #10b981;
      --success-bg: rgba(16, 185, 129, 0.12);
      --warning: #f59e0b;
      --warning-bg: rgba(245, 158, 11, 0.12);
      --danger: #ef4444;
      --danger-bg: rgba(239, 68, 68, 0.12);
      --font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
      --radius-sm: 6px;
      --radius: 10px;
      --radius-lg: 16px;
      --shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font);
      font-size: 14px;
      line-height: 1.5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Layout */
    .app-container {
      max-width: 1240px;
      margin: 0 auto;
      padding: 24px 20px 60px;
      width: 100%;
    }

    /* Header */
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 16px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-icon {
      width: 38px;
      height: 38px;
      background: var(--primary-gradient);
      border-radius: var(--radius);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      box-shadow: 0 0 16px rgba(99, 102, 241, 0.4);
    }

    .brand-title {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.02em;
      background: var(--primary-gradient);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .brand-subtitle {
      font-size: 12px;
      color: var(--text-muted);
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    /* Live status badge */
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 500;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.25);
      color: #34d399;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 8px var(--success);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 7px 14px;
      font-size: 13px;
      font-weight: 600;
      border-radius: var(--radius-sm);
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
    }

    .btn-primary {
      background: var(--primary);
      color: #fff;
    }
    .btn-primary:hover {
      background: var(--primary-hover);
      box-shadow: 0 0 12px rgba(99, 102, 241, 0.5);
    }

    .btn-outline {
      background: transparent;
      border-color: var(--card-border);
      color: var(--text);
    }
    .btn-outline:hover {
      background: var(--card-border);
      color: #fff;
    }

    .btn-sm {
      padding: 4px 8px;
      font-size: 11px;
    }

    .btn-danger-outline {
      background: transparent;
      border-color: rgba(239, 68, 68, 0.3);
      color: #f87171;
    }
    .btn-danger-outline:hover {
      background: rgba(239, 68, 68, 0.15);
      border-color: #ef4444;
    }

    /* Auth token bar */
    .token-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      padding: 4px 8px;
      border-radius: var(--radius-sm);
    }
    .token-bar input {
      background: transparent;
      border: none;
      color: var(--text);
      font-size: 12px;
      outline: none;
      width: 140px;
      font-family: var(--font-mono);
    }
    .token-bar input::placeholder { color: var(--text-dim); }

    /* Polling indicator */
    .polling-control {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--text-muted);
      cursor: pointer;
      user-select: none;
    }

    /* Tabs */
    .nav-tabs {
      display: flex;
      gap: 8px;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 24px;
      overflow-x: auto;
    }

    .tab-btn {
      padding: 10px 16px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-muted);
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s;
      white-space: nowrap;
    }
    .tab-btn:hover { color: var(--text); }
    .tab-btn.active {
      color: var(--text);
      border-bottom-color: var(--primary);
    }

    .tab-badge {
      background: rgba(255,255,255,0.08);
      padding: 2px 6px;
      border-radius: 9999px;
      font-size: 11px;
    }

    .tab-pane { display: none; }
    .tab-pane.active { display: block; animation: fadeIn 0.25s ease; }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Onboarding wizard banner */
    .wizard-card {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(6, 182, 212, 0.08) 100%);
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: var(--radius-lg);
      padding: 24px;
      margin-bottom: 24px;
      position: relative;
      overflow: hidden;
    }
    .wizard-card::before {
      content: '';
      position: absolute;
      top: -40px; right: -40px;
      width: 140px; height: 140px;
      background: radial-gradient(circle, rgba(99, 102, 241, 0.2) 0%, transparent 70%);
      pointer-events: none;
    }

    .wizard-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 16px;
    }

    .wizard-title {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .wizard-desc {
      color: var(--text-muted);
      font-size: 13px;
      max-width: 680px;
    }

    .wizard-steps {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
      margin-top: 20px;
    }

    .wizard-step {
      background: rgba(17, 24, 39, 0.7);
      backdrop-filter: blur(8px);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 16px;
    }
    .step-number {
      display: inline-block;
      width: 24px; height: 24px;
      background: var(--primary);
      color: #fff;
      font-weight: 700;
      font-size: 12px;
      border-radius: 50%;
      text-align: center;
      line-height: 24px;
      margin-bottom: 8px;
    }
    .step-title { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
    .step-desc { font-size: 12px; color: var(--text-muted); line-height: 1.4; margin-bottom: 10px; }

    /* KPI Metrics Cards */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .kpi-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      transition: transform 0.2s, border-color 0.2s;
    }
    .kpi-card:hover {
      border-color: #2e3e5c;
      transform: translateY(-2px);
    }
    .kpi-label {
      font-size: 12px;
      color: var(--text-muted);
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .kpi-value {
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .kpi-sub {
      font-size: 11px;
      color: var(--text-dim);
    }

    /* Cards & Containers */
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 20px;
      margin-bottom: 24px;
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      flex-wrap: wrap;
      gap: 10px;
    }
    .card-title {
      font-size: 15px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Tables */
    .table-responsive {
      overflow-x: auto;
      width: 100%;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 13px;
    }
    th {
      color: var(--text-dim);
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 10px 12px;
      border-bottom: 1px solid var(--card-border);
    }
    td {
      padding: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      color: var(--text);
    }
    tr:last-child td { border-bottom: none; }
    tbody tr:hover { background: rgba(255, 255, 255, 0.02); }

    /* Badges */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 500;
    }
    .badge-verified { background: var(--success-bg); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .badge-unverified { background: var(--warning-bg); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
    .badge-capability { background: rgba(99, 102, 241, 0.12); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.25); }
    .badge-provider { background: rgba(255,255,255,0.06); color: var(--text); font-family: var(--font-mono); }

    /* Form Controls */
    input[type="text"], input[type="password"], select, textarea {
      background: #0d1320;
      border: 1px solid var(--card-border);
      border-radius: var(--radius-sm);
      color: var(--text);
      padding: 8px 12px;
      font-size: 13px;
      outline: none;
      font-family: inherit;
      transition: border-color 0.2s;
    }
    input[type="text"]:focus, input[type="password"]:focus, select:focus, textarea:focus {
      border-color: var(--border-focus);
    }
    select { cursor: pointer; }

    /* Preferences Select */
    .pref-select {
      font-size: 11px;
      padding: 4px 8px;
      border-radius: var(--radius-sm);
      font-weight: 600;
      background: #1e293b;
      border: 1px solid #334155;
    }
    .pref-select[data-pref="prefer"] { color: #fbbf24; border-color: rgba(251, 191, 36, 0.4); }
    .pref-select[data-pref="neutral"] { color: var(--text-muted); }
    .pref-select[data-pref="limit"] { color: #f97316; border-color: rgba(249, 115, 22, 0.4); }
    .pref-select[data-pref="block"] { color: #f87171; border-color: rgba(248, 113, 113, 0.4); }

    /* Progress bar */
    .progress-bar-container {
      width: 100px;
      height: 6px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 9999px;
      overflow: hidden;
      display: inline-block;
      vertical-align: middle;
      margin-right: 8px;
    }
    .progress-bar-fill {
      height: 100%;
      border-radius: 9999px;
      background: var(--success);
    }

    /* Modal */
    .modal-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      z-index: 100;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .modal-backdrop.open { display: flex; animation: fadeIn 0.2s ease; }

    .modal-box {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-lg);
      max-width: 520px;
      width: 100%;
      padding: 24px;
      box-shadow: var(--shadow);
      position: relative;
    }

    .modal-title {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .modal-desc {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 20px;
    }

    .form-group {
      margin-bottom: 16px;
    }
    .form-group label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 6px;
    }
    .form-group input, .form-group select {
      width: 100%;
    }
    .form-help {
      font-size: 11px;
      color: var(--text-dim);
      margin-top: 4px;
      display: flex;
      justify-content: space-between;
    }
    .form-help a { color: var(--accent); text-decoration: none; }
    .form-help a:hover { text-decoration: underline; }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 24px;
    }

    /* Playground */
    .playground-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    @media (max-width: 768px) {
      .playground-grid { grid-template-columns: 1fr; }
    }

    .code-block {
      background: #080c14;
      border: 1px solid var(--card-border);
      border-radius: var(--radius-sm);
      padding: 14px;
      font-family: var(--font-mono);
      font-size: 12px;
      color: #e2e8f0;
      position: relative;
      overflow-x: auto;
      line-height: 1.6;
    }
    .copy-btn {
      position: absolute;
      top: 8px; right: 8px;
      padding: 3px 8px;
      font-size: 11px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: var(--radius-sm);
      color: var(--text-muted);
      cursor: pointer;
    }
    .copy-btn:hover { background: rgba(255, 255, 255, 0.15); color: #fff; }

    /* Toast notification */
    #toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 10px 18px;
      background: #1e293b;
      color: #fff;
      border: 1px solid #3b82f6;
      border-radius: var(--radius-sm);
      font-size: 13px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      opacity: 0;
      transform: translateY(10px);
      transition: all 0.25s ease;
      pointer-events: none;
      z-index: 1000;
    }
    #toast.show {
      opacity: 1;
      transform: translateY(0);
    }
  </style>
</head>
<body>

<div class="app-container">
  <!-- Header -->
  <header>
    <div class="brand">
      <div class="brand-icon">⚡</div>
      <div>
        <div class="brand-title">FreeRoute</div>
        <div class="brand-subtitle">Local-first, quota-aware routing for free-tier LLMs</div>
      </div>
    </div>
    <div class="header-actions">
      <div class="status-pill" id="gateway-status">
        <span class="status-dot"></span>
        <span id="gateway-text">127.0.0.1:8787</span>
      </div>

      <div class="polling-control" id="poll-toggle" title="Toggle 30s auto-refresh">
        <span id="poll-icon">⏱️</span>
        <span id="poll-text">30s Live</span>
      </div>

      <button class="btn btn-outline btn-sm" onclick="loadAll()" title="Refresh all data">
        🔄 Refresh
      </button>

      <div class="token-bar" title="API Token (saved locally)">
        <span>🔑</span>
        <input id="token" type="password" placeholder="Local API token" autocomplete="off" onchange="saveToken()">
      </div>

      <button class="btn btn-primary" onclick="openAddKeyModal()">
        + Add Provider Key
      </button>
    </div>
  </header>

  <!-- Onboarding Wizard Banner (shown if needsSetup) -->
  <div class="wizard-card" id="wizard-banner" style="display: none;">
    <div class="wizard-header">
      <div>
        <h2 class="wizard-title">👋 Welcome to FreeRoute!</h2>
        <p class="wizard-desc">FreeRoute pools together free-tier models from OpenRouter, Groq, and Google Gemini into a single unified endpoint with automatic fallback.</p>
      </div>
      <button class="btn btn-primary btn-sm" onclick="openAddKeyModal()">+ Connect First Key</button>
    </div>
    <div class="wizard-steps">
      <div class="wizard-step">
        <div class="step-number">1</div>
        <div class="step-title">Get a Free Provider Key</div>
        <div class="step-desc">Pick any free tier provider. No credit card required.</div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <a href="https://openrouter.ai/keys" target="_blank" class="btn btn-outline btn-sm" style="text-decoration:none">OpenRouter ↗</a>
          <a href="https://console.groq.com/keys" target="_blank" class="btn btn-outline btn-sm" style="text-decoration:none">Groq ↗</a>
          <a href="https://aistudio.google.com/app/apikey" target="_blank" class="btn btn-outline btn-sm" style="text-decoration:none">Gemini ↗</a>
        </div>
      </div>
      <div class="wizard-step">
        <div class="step-number">2</div>
        <div class="step-title">Add Key to FreeRoute</div>
        <div class="step-desc">Keys are encrypted at rest with AES-256-GCM and never leave your machine.</div>
        <button class="btn btn-outline btn-sm" onclick="openAddKeyModal()">Open Key Manager</button>
      </div>
      <div class="wizard-step">
        <div class="step-number">3</div>
        <div class="step-title">Point Your Agent</div>
        <div class="step-desc">Use <code>http://127.0.0.1:8787/v1</code> in Cursor, Cline, or any OpenAI-compatible client.</div>
        <button class="btn btn-outline btn-sm" onclick="switchTab('quickstart')">View Configs</button>
      </div>
    </div>
  </div>

  <!-- KPI Cards -->
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label"><span>🌐</span> Configured Providers</div>
      <div class="kpi-value" id="kpi-providers">0</div>
      <div class="kpi-sub" id="kpi-providers-sub">No active credentials</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label"><span>🤖</span> Available Free Models</div>
      <div class="kpi-value" id="kpi-models">0</div>
      <div class="kpi-sub">Across all healthy providers</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label"><span>⚡</span> Requests Handled</div>
      <div class="kpi-value" id="kpi-requests">0</div>
      <div class="kpi-sub" id="kpi-success-rate">100% success rate</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label"><span>🛡️</span> Fallbacks Recovered</div>
      <div class="kpi-value" id="kpi-fallbacks">0</div>
      <div class="kpi-sub">Quota limits prevented</div>
    </div>
  </div>

  <!-- Navigation Tabs -->
  <div class="nav-tabs">
    <button class="tab-btn active" onclick="switchTab('analytics')">
      📊 Analytics & Health
    </button>
    <button class="tab-btn" onclick="switchTab('models')">
      🤖 Model Catalog <span class="tab-badge" id="tab-model-count">0</span>
    </button>
    <button class="tab-btn" onclick="switchTab('keys')">
      🔑 Key Management <span class="tab-badge" id="tab-key-count">0</span>
    </button>
    <button class="tab-btn" onclick="switchTab('playground')">
      ⚡ Test Playground
    </button>
    <button class="tab-btn" onclick="switchTab('quickstart')">
      🔌 Quick Connect
    </button>
  </div>

  <!-- TAB 1: Analytics & Health -->
  <div class="tab-pane active" id="tab-analytics">
    <div class="card">
      <div class="card-header">
        <div class="card-title"><span>🏥</span> Provider Health & Performance Matrix</div>
        <span class="badge badge-provider">Updated live</span>
      </div>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Status</th>
              <th>Success Rate</th>
              <th>Requests</th>
              <th>Latency (p50 / p95)</th>
            </tr>
          </thead>
          <tbody id="health-rows">
            <tr><td colspan="5" class="text-dim" style="text-align:center;padding:20px;">Loading provider health…</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
      <div class="card">
        <div class="card-header">
          <div class="card-title"><span>⏱️</span> Quota Observations & Cooldowns</div>
        </div>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Route</th>
                <th>Remaining Req</th>
                <th>Tokens</th>
                <th>Reset Time</th>
              </tr>
            </thead>
            <tbody id="quota-rows">
              <tr><td colspan="4" class="text-dim" style="text-align:center;padding:20px;">No quota events recorded yet.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title"><span>📜</span> Recent Routing Events (Redacted)</div>
        </div>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Route</th>
                <th>Outcome</th>
                <th>Fallbacks</th>
              </tr>
            </thead>
            <tbody id="event-rows">
              <tr><td colspan="4" class="text-dim" style="text-align:center;padding:20px;">No routing events recorded yet.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <!-- TAB 2: Model Catalog & Preferences -->
  <div class="tab-pane" id="tab-models">
    <div class="card">
      <div class="card-header">
        <div class="card-title"><span>🤖</span> Discovered Models & Routing Preferences</div>
        <div style="display:flex; gap:10px;">
          <input id="model-search" type="text" placeholder="Search models…" oninput="filterModels()">
          <select id="model-filter-provider" onchange="filterModels()">
            <option value="">All Providers</option>
          </select>
        </div>
      </div>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Model Identifier</th>
              <th>Provider</th>
              <th>Tier</th>
              <th>Capabilities</th>
              <th>Preference Policy</th>
            </tr>
          </thead>
          <tbody id="model-rows">
            <tr><td colspan="5" class="text-dim" style="text-align:center;padding:20px;">Loading models…</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- TAB 3: Key Management -->
  <div class="tab-pane" id="tab-keys">
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title"><span>🔑</span> Configured Provider Credentials</div>
          <div class="wizard-desc" style="margin-top:4px">Credentials are encrypted with local AES-256-GCM. Plaintext secrets are never transmitted.</div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-primary" onclick="openAddKeyModal()">+ Add Key</button>
          <button class="btn btn-outline" onclick="openImportModal()">Import 9Router</button>
        </div>
      </div>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Credential ID</th>
              <th>Status</th>
              <th>Added At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="credential-rows">
            <tr><td colspan="5" class="text-dim" style="text-align:center;padding:20px;">Loading credentials…</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title"><span>⚙️</span> Custom Providers (OpenAI-compatible / Gemini)</div>
      </div>
      <p class="wizard-desc" style="margin-bottom:16px">You can register any OpenAI-compatible or Gemini-compatible local/remote endpoint (Ollama, vLLM, DeepSeek, etc.).</p>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Provider ID</th>
              <th>Type</th>
              <th>Base URL</th>
              <th>Tier</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="custom-provider-rows">
            <tr><td colspan="5" class="text-dim" style="text-align:center;padding:16px;">Built-in providers: openrouter, groq, gemini</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- TAB 4: Test Playground -->
  <div class="tab-pane" id="tab-playground">
    <div class="card">
      <div class="card-header">
        <div class="card-title"><span>⚡</span> Live Routing Playground</div>
        <div class="wizard-desc">Test chat completion directly through FreeRoute and inspect fallback headers in real-time.</div>
      </div>
      <div class="playground-grid">
        <div>
          <div class="form-group">
            <label>Route Profile or Model</label>
            <select id="play-model">
              <option value="auto:free">auto:free (Recommended Free-Tier)</option>
              <option value="auto:code">auto:code (Coding & Tools)</option>
              <option value="auto:fast">auto:fast (Lowest Latency)</option>
              <option value="auto:long-context">auto:long-context (Largest Context)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Prompt</label>
            <textarea id="play-prompt" rows="5" style="width:100%" placeholder="Type a test prompt here…">Hello FreeRoute! Introduce yourself and list your model name.</textarea>
          </div>
          <button class="btn btn-primary" id="play-send-btn" onclick="runPlayground()">
            🚀 Send Request
          </button>
        </div>
        <div>
          <label style="font-size:12px; font-weight:600; color:var(--text-muted); display:block; margin-bottom:6px;">Response & Routing Tracing</label>
          <div class="code-block" id="play-result" style="min-height: 200px;">
// Response will appear here with routing headers:
// x-freeroute-request-id
// x-freeroute-provider
// x-freeroute-model
// x-freeroute-fallback-count
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- TAB 5: Quick Connect -->
  <div class="tab-pane" id="tab-quickstart">
    <div class="card">
      <div class="card-header">
        <div class="card-title"><span>🔌</span> Connect Cursor, Cline, or OpenAI SDK</div>
      </div>
      <p class="wizard-desc" style="margin-bottom:20px;">Use FreeRoute as a drop-in replacement for OpenAI endpoints. Point your tools to the local base URL.</p>

      <div style="margin-bottom:24px;">
        <h3 style="font-size:14px; margin-bottom:8px;">1. Cursor / Cline / Continue Configuration</h3>
        <div class="code-block">
Base URL:  http://127.0.0.1:8787/v1
Model:     auto:free  (or auto:code for tool-calling coding agents)
API Key:   <span id="quick-token-display">your-token-if-configured</span>
        </div>
      </div>

      <div style="margin-bottom:24px;">
        <h3 style="font-size:14px; margin-bottom:8px;">2. OpenAI Python SDK</h3>
        <div class="code-block">
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:8787/v1",
    api_key="your-token"  # optional if FREEROUTE_API_TOKEN is unset
)

response = client.chat.completions.create(
    model="auto:free",
    messages=[{"role": "user", "content": "Explain quantum computing simply"}]
)
print(response.choices[0].message.content)
        </div>
      </div>

      <div>
        <h3 style="font-size:14px; margin-bottom:8px;">3. cURL Test</h3>
        <div class="code-block">
curl http://127.0.0.1:8787/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{"model":"auto:free","messages":[{"role":"user","content":"Hi"}]}'
        </div>
      </div>
    </div>
  </div>
</div>

<!-- Modal: Add Key -->
<div class="modal-backdrop" id="add-key-modal">
  <div class="modal-box">
    <h3 class="modal-title">Add Provider API Key</h3>
    <p class="modal-desc">Add a free-tier API key. It will be encrypted locally with AES-256-GCM.</p>
    <div class="form-group">
      <label>Provider</label>
      <select id="modal-provider" onchange="updateKeyModalHelper()">
        <option value="openrouter">OpenRouter (Free Models Pool)</option>
        <option value="groq">Groq (Ultra-Fast Llama)</option>
        <option value="gemini">Google Gemini (Gemini 2.0 Flash)</option>
        <option value="custom">Custom OpenAI-Compatible</option>
      </select>
      <div class="form-help">
        <span id="modal-provider-help">Free tier available with recurring limits.</span>
        <a id="modal-provider-link" href="https://openrouter.ai/keys" target="_blank">Get Free Key ↗</a>
      </div>
    </div>

    <div class="form-group" id="modal-custom-url-group" style="display:none;">
      <label>Custom Base URL</label>
      <input type="text" id="modal-custom-url" placeholder="http://127.0.0.1:11434/v1">
    </div>

    <div class="form-group">
      <label>API Key / Secret</label>
      <div style="position:relative">
        <input type="password" id="modal-key" placeholder="sk-..." style="padding-right: 36px; width:100%">
        <span onclick="togglePasswordVisibility('modal-key')" style="position:absolute; right:10px; top:8px; cursor:pointer; font-size:14px;">👁️</span>
      </div>
    </div>

    <div class="form-group">
      <label>Credential Label (Optional)</label>
      <input type="text" id="modal-label" placeholder="default">
    </div>

    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeAddKeyModal()">Cancel</button>
      <button class="btn btn-primary" id="modal-submit-btn" onclick="submitAddKey()">Save & Validate</button>
    </div>
  </div>
</div>

<!-- Modal: Import 9Router -->
<div class="modal-backdrop" id="import-modal">
  <div class="modal-box">
    <h3 class="modal-title">Import from 9Router Database</h3>
    <p class="modal-desc">Import existing active keys from a 9Router SQLite file without plain-text exposure.</p>
    <div class="form-group">
      <label>9Router SQLite File Path</label>
      <input type="text" id="import-path" placeholder="data/9router.sqlite">
    </div>
    <div class="form-group">
      <label>Provider</label>
      <select id="import-provider">
        <option value="openrouter">OpenRouter</option>
        <option value="groq">Groq</option>
        <option value="gemini">Gemini</option>
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeImportModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitImport9Router()">Import Key</button>
    </div>
  </div>
</div>

<!-- Toast -->
<div id="toast"></div>

<script>
  let allModels = [];
  let allPreferences = [];
  let pollInterval = null;
  let isPolling = true;

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    const savedToken = localStorage.getItem('freeroute_token') || '';
    if (savedToken) {
      document.getElementById('token').value = savedToken;
      updateQuickTokenDisplay(savedToken);
    }
    loadAll();
    setupPolling();
  });

  function saveToken() {
    const val = document.getElementById('token').value.trim();
    localStorage.setItem('freeroute_token', val);
    updateQuickTokenDisplay(val);
    showToast('API token saved.');
    loadAll();
  }

  function updateQuickTokenDisplay(token) {
    const el = document.getElementById('quick-token-display');
    if (el) el.textContent = token || 'unset (public localhost)';
  }

  function token() {
    return document.getElementById('token').value.trim();
  }

  async function api(path, options = {}) {
    const headers = { ...options.headers };
    const t = token();
    if (t) headers['Authorization'] = 'Bearer ' + t;
    const res = await fetch(path, { ...options, headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || res.statusText);
    }
    return res.json();
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2800);
  }

  function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    event.currentTarget.classList.add('active');
    const pane = document.getElementById('tab-' + tabId);
    if (pane) pane.classList.add('active');
  }

  // Load all dashboard components
  async function loadAll() {
    try {
      await Promise.allSettled([
        loadAuthStatus(),
        loadHealthAndAnalytics(),
        loadModelsAndPreferences(),
        loadCredentials()
      ]);
    } catch (e) {
      console.error('Error refreshing dashboard:', e);
    }
  }

  // Auth Status & First-Run Wizard
  async function loadAuthStatus() {
    try {
      const res = await fetch('/v1/auth/status');
      if (!res.ok) return;
      const data = await res.json();
      const banner = document.getElementById('wizard-banner');
      if (data.needsSetup) {
        banner.style.display = 'block';
      } else {
        banner.style.display = 'none';
      }
      document.getElementById('kpi-providers').textContent = (data.configuredProviders || []).length;
      document.getElementById('kpi-providers-sub').textContent = (data.configuredProviders || []).join(', ') || 'None configured';
    } catch (e) {
      console.warn('Could not fetch auth status', e);
    }
  }

  // Provider Health, Quota, Routing Events
  async function loadHealthAndAnalytics() {
    try {
      const [health, events, quotas] = await Promise.all([
        api('/v1/provider-health').catch(() => ({ data: [] })),
        api('/v1/routing-events').catch(() => ({ data: [] })),
        api('/v1/quota-observations').catch(() => ({ data: [] }))
      ]);

      renderHealth(health.data || []);
      renderEvents(events.data || []);
      renderQuotas(quotas.data || []);

      // Calculate KPIs
      const evList = events.data || [];
      const totalReq = evList.length;
      const successes = evList.filter(e => e.outcome === 'success').length;
      const fallbacks = evList.reduce((acc, cur) => acc + (cur.fallbackCount || 0), 0);

      document.getElementById('kpi-requests').textContent = totalReq;
      if (totalReq > 0) {
        document.getElementById('kpi-success-rate').textContent = ((successes / totalReq) * 100).toFixed(0) + '% success rate';
      }
      document.getElementById('kpi-fallbacks').textContent = fallbacks;
    } catch (e) {
      console.warn('Analytics load error', e);
    }
  }

  function renderHealth(list) {
    const tbody = document.getElementById('health-rows');
    tbody.replaceChildren();
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-dim" style="text-align:center;padding:16px;">No provider traffic observed yet.</td></tr>';
      return;
    }
    list.forEach(p => {
      const tr = document.createElement('tr');
      const ratePct = (p.successRate * 100).toFixed(0);
      tr.innerHTML = \`
        <td><strong>\${p.providerId}</strong></td>
        <td><span class="status-pill"><span class="status-dot"></span> Active</span></td>
        <td>
          <div class="progress-bar-container"><div class="progress-bar-fill" style="width: \${ratePct}%"></div></div>
          \${ratePct}%
        </td>
        <td>\${p.requestCount}</td>
        <td>\${p.latencyP50Ms ? p.latencyP50Ms + 'ms / ' + (p.latencyP95Ms || '-') + 'ms' : '-'}</td>
      \`;
      tbody.appendChild(tr);
    });
  }

  function renderEvents(list) {
    const tbody = document.getElementById('event-rows');
    tbody.replaceChildren();
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-dim" style="text-align:center;padding:16px;">No routing events recorded yet.</td></tr>';
      return;
    }
    list.slice(0, 15).forEach(e => {
      const tr = document.createElement('tr');
      const isSuccess = e.outcome === 'success';
      const outcomeBadge = isSuccess
        ? '<span class="badge badge-verified">success</span>'
        : '<span class="badge badge-unverified">' + (e.outcome || 'failed') + '</span>';
      tr.innerHTML = \`
        <td>\${new Date(e.occurredAt).toLocaleTimeString()}</td>
        <td><code>\${e.providerId}/\${e.modelId}</code></td>
        <td>\${outcomeBadge}</td>
        <td>\${e.fallbackCount > 0 ? '🔄 ' + e.fallbackCount : '0'}</td>
      \`;
      tbody.appendChild(tr);
    });
  }

  function renderQuotas(list) {
    const tbody = document.getElementById('quota-rows');
    tbody.replaceChildren();
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-dim" style="text-align:center;padding:16px;">No quota events recorded yet.</td></tr>';
      return;
    }
    list.slice(0, 10).forEach(q => {
      const tr = document.createElement('tr');
      tr.innerHTML = \`
        <td><code>\${q.providerId}/\${q.modelId}</code></td>
        <td>\${q.remainingRequests ?? 'untracked'}</td>
        <td>\${q.remainingTokens ?? 'untracked'}</td>
        <td>\${q.resetAt ? new Date(q.resetAt).toLocaleTimeString() : 'standard'}</td>
      \`;
      tbody.appendChild(tr);
    });
  }

  // Models & Preferences
  async function loadModelsAndPreferences() {
    try {
      const [modelsRes, prefsRes] = await Promise.all([
        api('/v1/models').catch(() => ({ data: [] })),
        api('/v1/preferences').catch(() => ({ data: [] }))
      ]);
      allModels = modelsRes.data || [];
      allPreferences = prefsRes.data || [];
      document.getElementById('kpi-models').textContent = allModels.length;
      document.getElementById('tab-model-count').textContent = allModels.length;

      // Update provider filter
      const provSelect = document.getElementById('model-filter-provider');
      const providers = [...new Set(allModels.map(m => m.owned_by))];
      provSelect.innerHTML = '<option value="">All Providers</option>';
      providers.forEach(p => {
        const opt = document.createElement('option');
        opt.value = opt.textContent = p;
        provSelect.appendChild(opt);
      });

      renderModels(allModels);
    } catch (e) {
      console.warn('Model load error', e);
    }
  }

  function renderModels(list) {
    const tbody = document.getElementById('model-rows');
    tbody.replaceChildren();
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-dim" style="text-align:center;padding:20px;">No models available. Add a provider key first.</td></tr>';
      return;
    }
    list.forEach(m => {
      const tr = document.createElement('tr');
      const tierBadge = m.freeroute?.free_tier === 'free_verified'
        ? '<span class="badge badge-verified">verified free</span>'
        : '<span class="badge badge-unverified">' + (m.freeroute?.free_tier || 'free') + '</span>';

      const caps = (m.freeroute?.capabilities || [])
        .map(c => '<span class="badge badge-capability">' + c + '</span>')
        .join(' ');

      const modelIdOnly = m.id.slice(m.owned_by.length + 1);
      const curPref = getModelPreference(m.owned_by, modelIdOnly);

      tr.innerHTML = \`
        <td><strong>\${modelIdOnly}</strong></td>
        <td><span class="badge badge-provider">\${m.owned_by}</span></td>
        <td>\${tierBadge}</td>
        <td>\${caps}</td>
        <td>
          <select class="pref-select" data-pref="\${curPref}" onchange="updatePreference(this, '\${m.owned_by}', '\${modelIdOnly}')">
            <option value="prefer" \${curPref==='prefer'?'selected':''}>⭐ Prefer</option>
            <option value="neutral" \${curPref==='neutral'?'selected':''}>⚪ Neutral</option>
            <option value="limit" \${curPref==='limit'?'selected':''}>⏳ Limit</option>
            <option value="block" \${curPref==='block'?'selected':''}>🚫 Block</option>
          </select>
        </td>
      \`;
      tbody.appendChild(tr);
    });
  }

  function getModelPreference(provider, model) {
    const match = allPreferences.find(p => p.providerId === provider && p.modelId === model);
    return match ? match.preference : 'neutral';
  }

  async function updatePreference(select, provider, model) {
    const pref = select.value;
    select.setAttribute('data-pref', pref);
    try {
      await api('/v1/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_id: provider, model_id: model, preference: pref })
      });
      showToast('Saved policy: ' + provider + '/' + model + ' → ' + pref);
    } catch (e) {
      showToast('Error saving preference: ' + e.message);
    }
  }

  function filterModels() {
    const q = (document.getElementById('model-search').value || '').toLowerCase();
    const p = document.getElementById('model-filter-provider').value;
    const filtered = allModels.filter(m => {
      const matchQ = m.id.toLowerCase().includes(q);
      const matchP = !p || m.owned_by === p;
      return matchQ && matchP;
    });
    renderModels(filtered);
  }

  // Credentials & Key Management
  async function loadCredentials() {
    try {
      const res = await api('/v1/credentials').catch(() => ({ data: [] }));
      const creds = res.data || [];
      document.getElementById('tab-key-count').textContent = creds.length;
      const tbody = document.getElementById('credential-rows');
      tbody.replaceChildren();
      if (!creds.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-dim" style="text-align:center;padding:20px;">No provider keys stored. Click "+ Add Key" to get started.</td></tr>';
        return;
      }
      creds.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = \`
          <td><strong>\${c.providerId}</strong></td>
          <td><code>\${c.credentialId}</code></td>
          <td><span class="badge badge-verified">Active & Encrypted</span></td>
          <td>\${new Date(c.createdAt).toLocaleDateString()}</td>
          <td>
            <button class="btn btn-danger-outline btn-sm" onclick="deleteCredential('\${c.providerId}', '\${c.credentialId}')">Delete</button>
          </td>
        \`;
        tbody.appendChild(tr);
      });
    } catch (e) {
      console.warn('Credential list error', e);
    }
  }

  async function deleteCredential(providerId, credentialId) {
    if (!confirm('Are you sure you want to remove the key for ' + providerId + ' (' + credentialId + ')?')) return;
    try {
      await api('/v1/credentials?providerId=' + encodeURIComponent(providerId) + '&credentialId=' + encodeURIComponent(credentialId), {
        method: 'DELETE'
      });
      showToast('Removed ' + providerId + ' key.');
      loadAll();
    } catch (e) {
      showToast('Error removing key: ' + e.message);
    }
  }

  // Modal Handlers
  function openAddKeyModal() {
    document.getElementById('add-key-modal').classList.add('open');
    updateKeyModalHelper();
  }
  function closeAddKeyModal() {
    document.getElementById('add-key-modal').classList.remove('open');
    document.getElementById('modal-key').value = '';
  }

  function updateKeyModalHelper() {
    const prov = document.getElementById('modal-provider').value;
    const link = document.getElementById('modal-provider-link');
    const help = document.getElementById('modal-provider-help');
    const customUrlGroup = document.getElementById('modal-custom-url-group');

    if (prov === 'openrouter') {
      link.href = 'https://openrouter.ai/keys';
      help.textContent = 'Free models: Gemini 2.0 Flash, DeepSeek R1, Llama 3.3';
      customUrlGroup.style.display = 'none';
    } else if (prov === 'groq') {
      link.href = 'https://console.groq.com/keys';
      help.textContent = 'High-speed free Llama, Gemma & Mixtral models.';
      customUrlGroup.style.display = 'none';
    } else if (prov === 'gemini') {
      link.href = 'https://aistudio.google.com/app/apikey';
      help.textContent = 'Generous free tier for Gemini 2.0 Flash and 1.5 Pro.';
      customUrlGroup.style.display = 'none';
    } else {
      link.href = '#';
      help.textContent = 'Any OpenAI-compatible or Gemini-compatible endpoint.';
      customUrlGroup.style.display = 'block';
    }
  }

  async function submitAddKey() {
    const provider = document.getElementById('modal-provider').value;
    const key = document.getElementById('modal-key').value.trim();
    const label = document.getElementById('modal-label').value.trim() || 'default';
    const btn = document.getElementById('modal-submit-btn');

    if (!key) {
      alert('Please enter an API Key');
      return;
    }

    try {
      btn.disabled = true;
      btn.textContent = 'Saving…';
      await api('/v1/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: provider, credentialId: label, secret: key })
      });
      closeAddKeyModal();
      showToast('Key saved! FreeRoute is refreshing models…');
      setTimeout(loadAll, 1200);
    } catch (e) {
      alert('Error saving key: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save & Validate';
    }
  }

  function openImportModal() { document.getElementById('import-modal').classList.add('open'); }
  function closeImportModal() { document.getElementById('import-modal').classList.remove('open'); }

  async function submitImport9Router() {
    const path = document.getElementById('import-path').value.trim();
    const provider = document.getElementById('import-provider').value;
    if (!path) { alert('Please enter path to 9Router SQLite file'); return; }
    try {
      await api('/v1/import/9router', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDatabasePath: path, providerId: provider })
      });
      closeImportModal();
      showToast('Imported key from 9Router!');
      loadAll();
    } catch (e) {
      alert('Import error: ' + e.message);
    }
  }

  function togglePasswordVisibility(id) {
    const inp = document.getElementById(id);
    inp.type = inp.type === 'password' ? 'text' : 'password';
  }

  // Playground Test
  async function runPlayground() {
    const model = document.getElementById('play-model').value;
    const prompt = document.getElementById('play-prompt').value.trim();
    const btn = document.getElementById('play-send-btn');
    const resultBox = document.getElementById('play-result');

    if (!prompt) return;

    try {
      btn.disabled = true;
      btn.textContent = 'Routing…';
      resultBox.textContent = 'Sending request to ' + model + '…';

      const start = Date.now();
      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token() ? { 'Authorization': 'Bearer ' + token() } : {})
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const elapsed = Date.now() - start;
      const providerHeader = res.headers.get('x-freeroute-provider') || 'unknown';
      const modelHeader = res.headers.get('x-freeroute-model') || 'unknown';
      const fallbackHeader = res.headers.get('x-freeroute-fallback-count') || '0';
      const reqId = res.headers.get('x-freeroute-request-id') || 'unknown';

      const data = await res.json();
      if (!res.ok) {
        resultBox.textContent = 'Error (' + res.status + '): ' + (data.error?.message || JSON.stringify(data));
        return;
      }

      const content = data.choices?.[0]?.message?.content || JSON.stringify(data, null, 2);
      resultBox.textContent =
        '// Routing Tracing:\\n' +
        '// Provider:       ' + providerHeader + '\\n' +
        '// Model:          ' + modelHeader + '\\n' +
        '// Fallbacks:      ' + fallbackHeader + '\\n' +
        '// Latency:        ' + elapsed + 'ms\\n' +
        '// Request ID:     ' + reqId + '\\n\\n' +
        content;

      showToast('Routed via ' + providerHeader + ' (' + modelHeader + ') in ' + elapsed + 'ms');
      loadHealthAndAnalytics();
    } catch (e) {
      resultBox.textContent = 'Request failed: ' + e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = '🚀 Send Request';
    }
  }

  // 30s Real-time Polling
  function setupPolling() {
    const toggle = document.getElementById('poll-toggle');
    let countdown = 30;

    pollInterval = setInterval(() => {
      if (!isPolling) return;
      countdown--;
      if (countdown <= 0) {
        countdown = 30;
        loadAll();
      }
      document.getElementById('poll-text').textContent = countdown + 's Live';
    }, 1000);

    toggle.onclick = () => {
      isPolling = !isPolling;
      if (isPolling) {
        document.getElementById('poll-text').textContent = '30s Live';
        document.getElementById('poll-icon').textContent = '⏱️';
        countdown = 30;
        showToast('Real-time polling resumed.');
      } else {
        document.getElementById('poll-text').textContent = 'Paused';
        document.getElementById('poll-icon').textContent = '⏸️';
        showToast('Real-time polling paused.');
      }
    };
  }
</script>
</body>
</html>`;
}
