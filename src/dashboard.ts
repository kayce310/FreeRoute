/**
 * Modern, bilingual Dashboard for FreeRoute (Tiếng Việt & English).
 * Synthesizes provider lists, API key links, and model catalogs from:
 * 9router, OmniRoute, FreeLLMAPI, and CLIProxyAPI.
 */
export function dashboardHtml(): string {
  return `<!doctype html>
<html lang="vi">
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
      max-width: 1280px;
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
      width: 40px;
      height: 40px;
      background: var(--primary-gradient);
      border-radius: var(--radius);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
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
      gap: 10px;
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
      gap: 6px;
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
      width: 120px;
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
      background: rgba(255, 255, 255, 0.04);
      padding: 5px 10px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--card-border);
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
      flex-wrap: wrap;
      gap: 12px;
    }

    .wizard-title {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .wizard-desc {
      color: var(--text-muted);
      font-size: 13px;
      max-width: 720px;
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

    /* Preset Provider Grid */
    .preset-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
      gap: 16px;
      margin-top: 16px;
    }
    .preset-card {
      background: #0d1320;
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 16px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: all 0.2s;
    }
    .preset-card:hover {
      border-color: var(--border-focus);
      background: #111a2d;
      transform: translateY(-2px);
    }
    .preset-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .preset-name {
      font-weight: 700;
      font-size: 15px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .preset-desc {
      font-size: 12px;
      color: var(--text-muted);
      line-height: 1.4;
      margin-bottom: 12px;
    }
    .preset-models {
      font-size: 11px;
      color: var(--text-dim);
      font-family: var(--font-mono);
      background: rgba(255,255,255,0.03);
      padding: 6px 8px;
      border-radius: var(--radius-sm);
      margin-bottom: 12px;
    }
    .preset-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
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
      width: 90px;
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
      max-width: 540px;
      width: 100%;
      padding: 24px;
      box-shadow: var(--shadow);
      position: relative;
    }

    .modal-title {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 6px;
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
    .form-help a { color: var(--accent); text-decoration: none; font-weight: 500; }
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
        <div class="brand-subtitle" id="i18n-sub">Local-first, quota-aware routing for free-tier LLMs</div>
      </div>
    </div>
    <div class="header-actions">
      <!-- Language Toggle -->
      <button class="btn btn-outline btn-sm" id="lang-toggle-btn" onclick="toggleLanguage()">
        🇻🇳 Tiếng Việt
      </button>

      <div class="status-pill" id="gateway-status">
        <span class="status-dot"></span>
        <span id="gateway-text">127.0.0.1:8787</span>
      </div>

      <div class="polling-control" id="poll-toggle" title="Auto-refresh toggle">
        <span id="poll-icon">⏱️</span>
        <span id="poll-text">30s Live</span>
      </div>

      <button class="btn btn-outline btn-sm" onclick="loadAll()" title="Refresh">
        🔄 <span id="btn-refresh-text">Làm mới</span>
      </button>

      <div class="token-bar" title="API Token">
        <span>🔑</span>
        <input id="token" type="password" placeholder="Local API token" autocomplete="off" onchange="saveToken()">
      </div>

      <button class="btn btn-primary" onclick="openAddKeyModal()">
        + <span id="btn-add-key-text">Thêm API Key</span>
      </button>
    </div>
  </header>

  <!-- Onboarding Wizard Banner -->
  <div class="wizard-card" id="wizard-banner" style="display: none;">
    <div class="wizard-header">
      <div>
        <h2 class="wizard-title" id="wz-title">👋 Chào mừng đến với FreeRoute!</h2>
        <p class="wizard-desc" id="wz-desc">FreeRoute tự động gộp và định tuyến thông minh giữa các gói miễn phí từ OpenRouter, Groq, Gemini, Cerebras... thành một endpoint duy nhất có tự động dự phòng (fallback) khi hết quota.</p>
      </div>
      <button class="btn btn-primary btn-sm" onclick="openAddKeyModal()">+ <span id="wz-connect-btn">Kết nối Key đầu tiên</span></button>
    </div>
    <div class="wizard-steps">
      <div class="wizard-step">
        <div class="step-number">1</div>
        <div class="step-title" id="wz-s1-title">Lấy API Key Miễn Phí</div>
        <div class="step-desc" id="wz-s1-desc">Chọn bất kỳ nhà cung cấp miễn phí nào bên dưới, không cần thẻ tín dụng:</div>
        <div style="display: flex; gap: 6px; flex-wrap: wrap;" id="wizard-quick-links">
          <!-- populated dynamically -->
        </div>
      </div>
      <div class="wizard-step">
        <div class="step-number">2</div>
        <div class="step-title" id="wz-s2-title">Lưu Key vào FreeRoute</div>
        <div class="step-desc" id="wz-s2-desc">Key được mã hóa an toàn AES-256-GCM tại máy của bạn và tự động nạp danh sách model.</div>
        <button class="btn btn-outline btn-sm" onclick="openAddKeyModal()" id="wz-open-modal-btn">Mở Trình quản lý Key</button>
      </div>
      <div class="wizard-step">
        <div class="step-number">3</div>
        <div class="step-title" id="wz-s3-title">Trỏ Công Cụ Của Bạn</div>
        <div class="step-desc" id="wz-s3-desc">Sử dụng Base URL <code>http://127.0.0.1:8787/v1</code> trong Cursor, Cline, hoặc script cá nhân.</div>
        <button class="btn btn-outline btn-sm" onclick="switchTab('quickstart')" id="wz-view-config-btn">Xem Cấu hình Mẫu</button>
      </div>
    </div>
  </div>

  <!-- KPI Cards -->
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label"><span>🌐</span> <span id="kpi-lbl-providers">Nhà Cung Cấp Đã Kết Nối</span></div>
      <div class="kpi-value" id="kpi-providers">0</div>
      <div class="kpi-sub" id="kpi-providers-sub">Chưa có key nào</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label"><span>🤖</span> <span id="kpi-lbl-models">Model Miễn Phí Sẵn Sàng</span></div>
      <div class="kpi-value" id="kpi-models">0</div>
      <div class="kpi-sub" id="kpi-models-sub">Từ các provider đang hoạt động</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label"><span>⚡</span> <span id="kpi-lbl-requests">Yêu Cầu Đã Xử Lý</span></div>
      <div class="kpi-value" id="kpi-requests">0</div>
      <div class="kpi-sub" id="kpi-success-rate">100% thành công</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label"><span>🛡️</span> <span id="kpi-lbl-fallbacks">Lần Fallback Cứu Nguy</span></div>
      <div class="kpi-value" id="kpi-fallbacks">0</div>
      <div class="kpi-sub" id="kpi-fallbacks-sub">Tự động vượt giới hạn quota</div>
    </div>
  </div>

  <!-- Navigation Tabs -->
  <div class="nav-tabs">
    <button class="tab-btn active" onclick="switchTab('analytics')">
      📊 <span id="tab-lbl-analytics">Phân tích & Sức khỏe</span>
    </button>
    <button class="tab-btn" onclick="switchTab('presets')">
      🌐 <span id="tab-lbl-presets">Danh mục Nhà cung cấp</span>
    </button>
    <button class="tab-btn" onclick="switchTab('models')">
      🤖 <span id="tab-lbl-models">Danh mục Model</span> <span class="tab-badge" id="tab-model-count">0</span>
    </button>
    <button class="tab-btn" onclick="switchTab('keys')">
      🔑 <span id="tab-lbl-keys">Quản lý API Key</span> <span class="tab-badge" id="tab-key-count">0</span>
    </button>
    <button class="tab-btn" onclick="switchTab('playground')">
      ⚡ <span id="tab-lbl-play">Thử nghiệm Prompt</span>
    </button>
    <button class="tab-btn" onclick="switchTab('quickstart')">
      🔌 <span id="tab-lbl-guide">Hướng dẫn Kết nối</span>
    </button>
  </div>

  <!-- TAB 1: Analytics & Health -->
  <div class="tab-pane active" id="tab-analytics">
    <div class="card">
      <div class="card-header">
        <div class="card-title"><span>🏥</span> <span id="card-health-title">Bảng Theo Dõi Sức Khỏe & Hiệu Năng Provider</span></div>
        <span class="badge badge-provider">Live Stats</span>
      </div>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th id="th-h-provider">Nhà cung cấp</th>
              <th id="th-h-status">Trạng thái</th>
              <th id="th-h-rate">Tỷ lệ thành công</th>
              <th id="th-h-reqs">Yêu cầu</th>
              <th id="th-h-latency">Độ trễ (p50 / p95)</th>
            </tr>
          </thead>
          <tbody id="health-rows">
            <tr><td colspan="5" class="text-dim" style="text-align:center;padding:20px;">Đang tải dữ liệu sức khỏe…</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
      <div class="card">
        <div class="card-header">
          <div class="card-title"><span>⏱️</span> <span id="card-quota-title">Hạn Ngạch & Thời Gian Phục Hồi (Cooldown)</span></div>
        </div>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Route</th>
                <th id="th-q-reqs">Số Req còn lại</th>
                <th id="th-q-tokens">Tokens</th>
                <th id="th-q-reset">Reset vào lúc</th>
              </tr>
            </thead>
            <tbody id="quota-rows">
              <tr><td colspan="4" class="text-dim" style="text-align:center;padding:20px;">Chưa có dữ liệu hạn ngạch nào.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title"><span>📜</span> <span id="card-events-title">Lịch Sử Định Tuyến Gần Đây (Redacted)</span></div>
        </div>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th id="th-e-time">Thời gian</th>
                <th>Route</th>
                <th id="th-e-outcome">Kết quả</th>
                <th id="th-e-fb">Số lần fallback</th>
              </tr>
            </thead>
            <tbody id="event-rows">
              <tr><td colspan="4" class="text-dim" style="text-align:center;padding:20px;">Chưa có lịch sử định tuyến nào.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <!-- TAB 2: Provider Directory (Presets from 9router, OmniRoute, freellmapi, CLIProxyAPI) -->
  <div class="tab-pane" id="tab-presets">
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title"><span>🌐</span> <span id="card-dir-title">Danh Mục Nhà Cung Cấp Miễn Phí (Provider Directory)</span></div>
          <p class="wizard-desc" style="margin-top:4px" id="card-dir-desc">Tổng hợp các nhà cung cấp có gói miễn phí định kỳ từ 9router, OmniRoute, FreeLLMAPI và CLIProxyAPI. Bấm để lấy API key và tự động nạp model.</p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="openAddKeyModal()">+ <span id="btn-add-custom-provider">Thêm Provider Tùy Chỉnh</span></button>
      </div>
      <div class="preset-grid" id="preset-container">
        <!-- Loaded dynamically from /v1/providers/presets -->
      </div>
    </div>
  </div>

  <!-- TAB 3: Model Catalog & Preferences -->
  <div class="tab-pane" id="tab-models">
    <div class="card">
      <div class="card-header">
        <div class="card-title"><span>🤖</span> <span id="card-models-title">Danh Mục Model & Chính Sách Ưu Tiên</span></div>
        <div style="display:flex; gap:10px;">
          <input id="model-search" type="text" placeholder="Tìm kiếm model…" oninput="filterModels()">
          <select id="model-filter-provider" onchange="filterModels()">
            <option value="">Tất cả Provider</option>
          </select>
        </div>
      </div>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th id="th-m-id">Tên Model</th>
              <th>Provider</th>
              <th id="th-m-tier">Gói cước</th>
              <th id="th-m-caps">Khả năng</th>
              <th id="th-m-pref">Chính sách Định tuyến</th>
            </tr>
          </thead>
          <tbody id="model-rows">
            <tr><td colspan="5" class="text-dim" style="text-align:center;padding:20px;">Đang tải danh sách model…</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- TAB 4: Key Management -->
  <div class="tab-pane" id="tab-keys">
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title"><span>🔑</span> <span id="card-keys-title">Danh Sách API Key Đã Kết Nối</span></div>
          <div class="wizard-desc" style="margin-top:4px" id="card-keys-desc">Toàn bộ key được mã hóa AES-256-GCM cục bộ trên máy. Secret không bao giờ được gửi đi.</div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-primary" onclick="openAddKeyModal()">+ <span id="btn-add-key-card">Thêm Key</span></button>
          <button class="btn btn-outline" onclick="openImportModal()">Nhập từ 9Router</button>
        </div>
      </div>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Credential ID</th>
              <th id="th-k-status">Trạng thái</th>
              <th id="th-k-added">Ngày thêm</th>
              <th id="th-k-actions">Thao tác</th>
            </tr>
          </thead>
          <tbody id="credential-rows">
            <tr><td colspan="5" class="text-dim" style="text-align:center;padding:20px;">Đang tải danh sách key…</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title"><span>⚙️</span> <span id="card-custom-title">Provider Tùy Chỉnh (OpenAI-compatible / Gemini)</span></div>
      </div>
      <p class="wizard-desc" style="margin-bottom:16px" id="card-custom-desc">Bạn có thể kết nối bất kỳ endpoint cục bộ nào (Ollama, LM Studio, vLLM) hoặc proxy bên ngoài.</p>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Provider ID</th>
              <th>Adapter</th>
              <th>Base URL</th>
              <th>Tier</th>
              <th id="th-c-actions">Thao tác</th>
            </tr>
          </thead>
          <tbody id="custom-provider-rows">
            <tr><td colspan="5" class="text-dim" style="text-align:center;padding:16px;">Đang tải danh sách provider tùy chỉnh…</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- TAB 5: Test Playground -->
  <div class="tab-pane" id="tab-playground">
    <div class="card">
      <div class="card-header">
        <div class="card-title"><span>⚡</span> <span id="card-play-title">Thử Nghiệm Định Tuyến Trực Tiếp (Live Routing Playground)</span></div>
        <div class="wizard-desc" id="card-play-desc">Kiểm tra kết nối và theo dõi các header định tuyến (provider, model, fallback count) thời gian thực.</div>
      </div>
      <div class="playground-grid">
        <div>
          <div class="form-group">
            <label id="lbl-play-route">Chọn Profile Định Tuyến hoặc Model</label>
            <select id="play-model">
              <option value="auto:free">auto:free (Ưu tiên gói miễn phí)</option>
              <option value="auto:code">auto:code (Hỗ trợ gọi công cụ/coding)</option>
              <option value="auto:fast">auto:fast (Tốc độ phản hồi nhanh nhất)</option>
              <option value="auto:long-context">auto:long-context (Ngữ cảnh lớn nhất)</option>
            </select>
          </div>
          <div class="form-group">
            <label id="lbl-play-prompt">Prompt Thử Nghiệm</label>
            <textarea id="play-prompt" rows="5" style="width:100%" placeholder="Nhập câu hỏi thử nghiệm tại đây…">Chào FreeRoute! Hãy giới thiệu bạn là ai và mô hình nào đang trả lời câu hỏi này.</textarea>
          </div>
          <button class="btn btn-primary" id="play-send-btn" onclick="runPlayground()">
            🚀 <span id="btn-play-send">Gửi Yêu Cầu</span>
          </button>
        </div>
        <div>
          <label style="font-size:12px; font-weight:600; color:var(--text-muted); display:block; margin-bottom:6px;" id="lbl-play-result">Kết Quả & Thông Số Định Tuyến (Tracing)</label>
          <div class="code-block" id="play-result" style="min-height: 200px;">
// Kết quả và các header định tuyến sẽ xuất hiện tại đây:
// x-freeroute-request-id
// x-freeroute-provider
// x-freeroute-model
// x-freeroute-fallback-count
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- TAB 6: Quick Connect & User Guide (Bilingual) -->
  <div class="tab-pane" id="tab-quickstart">
    <div class="card">
      <div class="card-header">
        <div class="card-title"><span>🔌</span> <span id="guide-title">Hướng Dẫn Kết Nối (Quick Connect & User Guide)</span></div>
      </div>
      <p class="wizard-desc" style="margin-bottom:20px;" id="guide-desc">FreeRoute đóng vai trò là một proxy tương thích 100% chuẩn OpenAI. Bạn chỉ cần trỏ công cụ của mình tới Base URL cục bộ.</p>

      <div style="margin-bottom:24px;">
        <h3 style="font-size:14px; margin-bottom:8px;" id="guide-cursor-title">1. Cấu hình cho Cursor / Windsurf / Cline / Roo Code / Continue</h3>
        <div class="code-block">
Base URL:  http://127.0.0.1:8787/v1
Model:     auto:free   (hoặc auto:code cho coding agent cần function calling)
API Key:   <span id="quick-token-display">chưa đặt token (mặc định mở trên localhost)</span>
        </div>
        <p class="wizard-desc" style="margin-top:6px" id="guide-cursor-note">💡 Lưu ý: Khi sử dụng <code>auto:free</code>, FreeRoute sẽ tự động chọn model miễn phí tốt nhất và tự động fallback sang provider khác nếu gặp lỗi hoặc hết quota.</p>
      </div>

      <div style="margin-bottom:24px;">
        <h3 style="font-size:14px; margin-bottom:8px;">2. OpenAI Python SDK</h3>
        <div class="code-block">
from openai import OpenAI

# Kết nối trực tiếp tới FreeRoute cục bộ
client = OpenAI(
    base_url="http://127.0.0.1:8787/v1",
    api_key="your-freeroute-token"  # Optional or FREEROUTE_API_TOKEN
)

response = client.chat.completions.create(
    model="auto:free",
    messages=[{"role": "user", "content": "Giải thích điện toán đám mây bằng tiếng Việt"}]
)
print(response.choices[0].message.content)
        </div>
      </div>

      <div style="margin-bottom:24px;">
        <h3 style="font-size:14px; margin-bottom:8px;">3. Lệnh kiểm tra cURL</h3>
        <div class="code-block">
curl http://127.0.0.1:8787/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{"model":"auto:free","messages":[{"role":"user","content":"Xin chào!"}]}'
        </div>
      </div>

      <div>
        <h3 style="font-size:14px; margin-bottom:8px;" id="guide-profiles-title">4. Ý nghĩa các Profile Định Tuyến Tự Động (Auto Profiles)</h3>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Profile</th>
                <th id="th-p-meaning">Ý nghĩa & Hành vi</th>
                <th id="th-p-bestfor">Phù hợp nhất cho</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>auto:free</code></td>
                <td id="td-p1-desc">Chỉ chọn các model miễn phí định kỳ đã kiểm chứng (free_verified).</td>
                <td id="td-p1-use">Sử dụng hàng ngày, chat, dịch thuật, tóm tắt.</td>
              </tr>
              <tr>
                <td><code>auto:code</code></td>
                <td id="td-p2-desc">Ưu tiên các model có hỗ trợ Function Calling / Tools Calling.</td>
                <td id="td-p2-use">Coding agent (Cursor, Cline, Aider).</td>
              </tr>
              <tr>
                <td><code>auto:fast</code></td>
                <td id="td-p3-desc">Ưu tiên các provider có độ trễ phản hồi thấp nhất (Groq, Cerebras).</td>
                <td id="td-p3-use">Autocomplete, phản hồi tức thì.</td>
              </tr>
              <tr>
                <td><code>auto:long-context</code></td>
                <td id="td-p4-desc">Ưu tiên model có cửa sổ ngữ cảnh lớn nhất (Gemini 2.0 Flash 1M tokens).</td>
                <td id="td-p4-use">Đọc tài liệu lớn, phân tích toàn bộ codebase.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- Modal: Add Key & Connect Provider -->
<div class="modal-backdrop" id="add-key-modal">
  <div class="modal-box">
    <h3 class="modal-title" id="modal-key-title">Thêm API Key Provider</h3>
    <p class="modal-desc" id="modal-key-desc">Chọn nhà cung cấp và nhập API key. Danh sách model sẽ được tự động nạp ngay lập tức.</p>
    
    <div class="form-group">
      <label id="lbl-modal-prov">Nhà Cung Cấp (Provider)</label>
      <select id="modal-provider" onchange="updateKeyModalHelper()">
        <!-- Filled dynamically from presets -->
      </select>
      <div class="form-help">
        <span id="modal-provider-help">Miễn phí định kỳ không cần thẻ tín dụng.</span>
        <a id="modal-provider-link" href="#" target="_blank">Lấy Key miễn phí ↗</a>
      </div>
    </div>

    <div class="form-group" id="modal-custom-url-group" style="display:none;">
      <label id="lbl-modal-url">Base URL Tùy Chỉnh</label>
      <input type="text" id="modal-custom-url" placeholder="http://127.0.0.1:11434/v1">
    </div>

    <div class="form-group">
      <label id="lbl-modal-key">API Key / Secret</label>
      <div style="position:relative">
        <input type="password" id="modal-key" placeholder="Dán API key vào đây…" style="padding-right: 36px; width:100%">
        <span onclick="togglePasswordVisibility('modal-key')" style="position:absolute; right:10px; top:8px; cursor:pointer; font-size:14px;">👁️</span>
      </div>
      <div class="form-help">
        <span id="modal-key-note" style="color:var(--text-dim)">Mã hóa an toàn bằng AES-256-GCM tại máy của bạn.</span>
      </div>
    </div>

    <div class="form-group">
      <label id="lbl-modal-label">Nhãn Định Danh (Tùy chọn)</label>
      <input type="text" id="modal-label" placeholder="default">
    </div>

    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeAddKeyModal()" id="btn-modal-cancel">Hủy</button>
      <button class="btn btn-primary" id="modal-submit-btn" onclick="submitAddKey()">Lưu & Tự Động Nạp Model</button>
    </div>
  </div>
</div>

<!-- Modal: Import 9Router -->
<div class="modal-backdrop" id="import-modal">
  <div class="modal-box">
    <h3 class="modal-title">Nhập kết nối từ 9Router</h3>
    <p class="modal-desc">Nhập key đang hoạt động từ file database SQLite của 9Router mà không để lộ secret.</p>
    <div class="form-group">
      <label>Đường dẫn file 9Router SQLite</label>
      <input type="text" id="import-path" placeholder="D:/9router/data/9router.sqlite">
    </div>
    <div class="form-group">
      <label>Provider muốn import</label>
      <select id="import-provider">
        <option value="openrouter">OpenRouter</option>
        <option value="groq">Groq</option>
        <option value="gemini">Gemini</option>
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeImportModal()">Hủy</button>
      <button class="btn btn-primary" onclick="submitImport9Router()">Bắt đầu Import</button>
    </div>
  </div>
</div>

<!-- Toast -->
<div id="toast"></div>

<script>
  let currentLang = localStorage.getItem('freeroute_lang') || 'vi';
  let allModels = [];
  let allPreferences = [];
  let allPresets = [];
  let pollInterval = null;
  let isPolling = true;

  const I18N = {
    vi: {
      sub: 'Định tuyến LLM cục bộ, tối ưu hạn ngạch miễn phí, tự động chuyển đổi dự phòng',
      langBtn: '🇻🇳 Tiếng Việt',
      refresh: 'Làm mới',
      addKey: 'Thêm API Key',
      providersKpi: 'Nhà Cung Cấp Đã Kết Nối',
      modelsKpi: 'Model Miễn Phí Sẵn Sàng',
      requestsKpi: 'Yêu Cầu Đã Xử Lý',
      fallbacksKpi: 'Lần Fallback Cứu Nguy',
      tabAnalytics: 'Phân tích & Sức khỏe',
      tabPresets: 'Danh mục Nhà cung cấp',
      tabModels: 'Danh mục Model',
      tabKeys: 'Quản lý API Key',
      tabPlay: 'Thử nghiệm Prompt',
      tabGuide: 'Hướng dẫn Kết nối',
      getKey: 'Lấy Key miễn phí ↗',
      connectKey: 'Kết nối Key',
      saveKeyBtn: 'Lưu & Tự Động Nạp Model',
      cancelBtn: 'Hủy'
    },
    en: {
      sub: 'Local-first, quota-aware routing for official free-tier LLMs',
      langBtn: '🇬🇧 English',
      refresh: 'Refresh',
      addKey: 'Add API Key',
      providersKpi: 'Configured Providers',
      modelsKpi: 'Available Free Models',
      requestsKpi: 'Requests Handled',
      fallbacksKpi: 'Fallbacks Recovered',
      tabAnalytics: 'Analytics & Health',
      tabPresets: 'Provider Directory',
      tabModels: 'Model Catalog',
      tabKeys: 'Key Management',
      tabPlay: 'Test Playground',
      tabGuide: 'Quick Connect',
      getKey: 'Get Free Key ↗',
      connectKey: 'Connect Key',
      saveKeyBtn: 'Save & Auto-load Models',
      cancelBtn: 'Cancel'
    }
  };

  document.addEventListener('DOMContentLoaded', async () => {
    const savedToken = localStorage.getItem('freeroute_token') || '';
    if (savedToken) {
      document.getElementById('token').value = savedToken;
      updateQuickTokenDisplay(savedToken);
    }
    applyLanguage(currentLang);
    await loadPresets();
    loadAll();
    setupPolling();
  });

  function toggleLanguage() {
    currentLang = currentLang === 'vi' ? 'en' : 'vi';
    localStorage.setItem('freeroute_lang', currentLang);
    applyLanguage(currentLang);
    renderPresets(allPresets);
    renderModels(allModels);
  }

  function applyLanguage(lang) {
    const t = I18N[lang];
    document.getElementById('lang-toggle-btn').textContent = t.langBtn;
    document.getElementById('i18n-sub').textContent = t.sub;
    document.getElementById('btn-refresh-text').textContent = t.refresh;
    document.getElementById('btn-add-key-text').textContent = t.addKey;
    document.getElementById('kpi-lbl-providers').textContent = t.providersKpi;
    document.getElementById('kpi-lbl-models').textContent = t.modelsKpi;
    document.getElementById('kpi-lbl-requests').textContent = t.requestsKpi;
    document.getElementById('kpi-lbl-fallbacks').textContent = t.fallbacksKpi;
    document.getElementById('tab-lbl-analytics').textContent = t.tabAnalytics;
    document.getElementById('tab-lbl-presets').textContent = t.tabPresets;
    document.getElementById('tab-lbl-models').textContent = t.tabModels;
    document.getElementById('tab-lbl-keys').textContent = t.tabKeys;
    document.getElementById('tab-lbl-play').textContent = t.tabPlay;
    document.getElementById('tab-lbl-guide').textContent = t.tabGuide;
    document.getElementById('btn-modal-cancel').textContent = t.cancelBtn;
    document.getElementById('modal-submit-btn').textContent = t.saveKeyBtn;
  }

  function saveToken() {
    const val = document.getElementById('token').value.trim();
    localStorage.setItem('freeroute_token', val);
    updateQuickTokenDisplay(val);
    showToast(currentLang === 'vi' ? 'Đã lưu API token.' : 'API token saved.');
    loadAll();
  }

  function updateQuickTokenDisplay(t) {
    const el = document.getElementById('quick-token-display');
    if (el) el.textContent = t || (currentLang === 'vi' ? 'chưa đặt token (mặc định mở)' : 'unset (public localhost)');
  }

  function token() { return document.getElementById('token').value.trim(); }

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

  // Load Presets from server
  async function loadPresets() {
    try {
      const res = await fetch('/v1/providers/presets');
      if (res.ok) {
        const body = await res.json();
        allPresets = body.data || [];
        populateModalPresets(allPresets);
        renderPresets(allPresets);
        renderWizardLinks(allPresets);
      }
    } catch (e) {
      console.warn('Failed to load presets', e);
    }
  }

  function populateModalPresets(presets) {
    const sel = document.getElementById('modal-provider');
    sel.replaceChildren();
    presets.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      sel.appendChild(opt);
    });
    const customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.textContent = currentLang === 'vi' ? '➕ Provider Tùy Chỉnh (OpenAI-compatible)' : '➕ Custom OpenAI-Compatible';
    sel.appendChild(customOpt);
  }

  function renderPresets(presets) {
    const c = document.getElementById('preset-container');
    if (!c) return;
    c.replaceChildren();
    presets.forEach(p => {
      const card = document.createElement('div');
      card.className = 'preset-card';
      const desc = currentLang === 'vi' ? p.descriptionVi : p.descriptionEn;
      const modelNames = p.seedModels.map(m => m.modelId.split('/').pop()).slice(0, 3).join(', ') + (p.seedModels.length > 3 ? '...' : '');

      card.innerHTML = \`
        <div>
          <div class="preset-top">
            <div class="preset-name">
              <span>⚡</span> \${p.name}
            </div>
            <span class="badge badge-verified">\${p.category.toUpperCase()}</span>
          </div>
          <div class="preset-desc">\${desc}</div>
          <div class="preset-models">📦 Models: \${modelNames}</div>
        </div>
        <div class="preset-actions">
          <a href="\${p.apiKeyUrl}" target="_blank" class="btn btn-outline btn-sm" style="text-decoration:none">
            \${currentLang === 'vi' ? 'Lấy Key ↗' : 'Get Key ↗'}
          </a>
          <button class="btn btn-primary btn-sm" onclick="connectPreset('\${p.id}')">
            + \${currentLang === 'vi' ? 'Kết nối' : 'Connect'}
          </button>
        </div>
      \`;
      c.appendChild(card);
    });
  }

  function renderWizardLinks(presets) {
    const c = document.getElementById('wizard-quick-links');
    if (!c) return;
    c.replaceChildren();
    presets.slice(0, 5).forEach(p => {
      const a = document.createElement('a');
      a.href = p.apiKeyUrl;
      a.target = '_blank';
      a.className = 'btn btn-outline btn-sm';
      a.style.textDecoration = 'none';
      a.textContent = p.name + ' ↗';
      c.appendChild(a);
    });
  }

  function connectPreset(presetId) {
    openAddKeyModal();
    document.getElementById('modal-provider').value = presetId;
    updateKeyModalHelper();
  }

  // Load all dashboard components
  async function loadAll() {
    try {
      await Promise.allSettled([
        loadAuthStatus(),
        loadHealthAndAnalytics(),
        loadModelsAndPreferences(),
        loadCredentials(),
        loadCustomProviders()
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
      document.getElementById('kpi-providers-sub').textContent = (data.configuredProviders || []).join(', ') || (currentLang === 'vi' ? 'Chưa có key' : 'None configured');
    } catch (e) {
      console.warn('Auth status load error', e);
    }
  }

  // Provider Health & Stats
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

      const evList = events.data || [];
      const totalReq = evList.length;
      const successes = evList.filter(e => e.outcome === 'success').length;
      const fallbacks = evList.reduce((acc, cur) => acc + (cur.fallbackCount || 0), 0);

      document.getElementById('kpi-requests').textContent = totalReq;
      if (totalReq > 0) {
        document.getElementById('kpi-success-rate').textContent = ((successes / totalReq) * 100).toFixed(0) + (currentLang === 'vi' ? '% thành công' : '% success rate');
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
      tbody.innerHTML = '<tr><td colspan="5" class="text-dim" style="text-align:center;padding:16px;">' + (currentLang === 'vi' ? 'Chưa có lưu lượng định tuyến nào.' : 'No provider traffic observed yet.') + '</td></tr>';
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
      tbody.innerHTML = '<tr><td colspan="4" class="text-dim" style="text-align:center;padding:16px;">' + (currentLang === 'vi' ? 'Chưa có sự kiện nào.' : 'No routing events recorded yet.') + '</td></tr>';
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
      tbody.innerHTML = '<tr><td colspan="4" class="text-dim" style="text-align:center;padding:16px;">' + (currentLang === 'vi' ? 'Chưa có dữ liệu hạn ngạch.' : 'No quota events recorded yet.') + '</td></tr>';
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

      const provSelect = document.getElementById('model-filter-provider');
      const providers = [...new Set(allModels.map(m => m.owned_by))];
      provSelect.innerHTML = '<option value="">' + (currentLang === 'vi' ? 'Tất cả Provider' : 'All Providers') + '</option>';
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
      tbody.innerHTML = '<tr><td colspan="5" class="text-dim" style="text-align:center;padding:20px;">' + (currentLang === 'vi' ? 'Chưa có model nào. Hãy kết nối API key để tự động nạp model.' : 'No models available. Add a provider key to auto-load models.') + '</td></tr>';
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
      showToast((currentLang === 'vi' ? 'Đã lưu chính sách: ' : 'Saved policy: ') + provider + '/' + model + ' → ' + pref);
    } catch (e) {
      showToast('Error: ' + e.message);
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

  // Credentials & Custom Providers
  async function loadCredentials() {
    try {
      const res = await api('/v1/credentials').catch(() => ({ data: [] }));
      const creds = res.data || [];
      document.getElementById('tab-key-count').textContent = creds.length;
      const tbody = document.getElementById('credential-rows');
      tbody.replaceChildren();
      if (!creds.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-dim" style="text-align:center;padding:20px;">' + (currentLang === 'vi' ? 'Chưa có key nào. Bấm "+ Thêm API Key" để bắt đầu.' : 'No provider keys stored. Click "+ Add Key" to get started.') + '</td></tr>';
        return;
      }
      creds.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = \`
          <td><strong>\${c.providerId}</strong></td>
          <td><code>\${c.credentialId}</code></td>
          <td><span class="badge badge-verified">AES-256 Encrypted</span></td>
          <td>\${new Date(c.createdAt).toLocaleDateString()}</td>
          <td>
            <button class="btn btn-danger-outline btn-sm" onclick="deleteCredential('\${c.providerId}', '\${c.credentialId}')">
              \${currentLang === 'vi' ? 'Xóa' : 'Delete'}
            </button>
          </td>
        \`;
        tbody.appendChild(tr);
      });
    } catch (e) {
      console.warn('Credential list error', e);
    }
  }

  async function deleteCredential(providerId, credentialId) {
    if (!confirm((currentLang === 'vi' ? 'Bạn có chắc chắn muốn xóa key cho ' : 'Remove key for ') + providerId + ' (' + credentialId + ')?')) return;
    try {
      await api('/v1/credentials?providerId=' + encodeURIComponent(providerId) + '&credentialId=' + encodeURIComponent(credentialId), {
        method: 'DELETE'
      });
      showToast((currentLang === 'vi' ? 'Đã xóa key ' : 'Removed key ') + providerId);
      loadAll();
    } catch (e) {
      showToast('Error: ' + e.message);
    }
  }

  async function loadCustomProviders() {
    try {
      const res = await api('/v1/providers/custom').catch(() => ({ data: [] }));
      const list = res.data || [];
      const tbody = document.getElementById('custom-provider-rows');
      tbody.replaceChildren();
      if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-dim" style="text-align:center;padding:16px;">' + (currentLang === 'vi' ? 'Mặc định hỗ trợ các provider cài sẵn (OpenRouter, Groq, Gemini). Thêm custom endpoint nếu muốn kết nối Ollama/vLLM.' : 'Built-in providers active. Add custom provider to connect Ollama/vLLM.') + '</td></tr>';
        return;
      }
      list.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = \`
          <td><strong>\${p.providerId}</strong></td>
          <td><code>\${p.adapterType}</code></td>
          <td>\${p.baseUrl}</td>
          <td><span class="badge badge-verified">\${p.classifyAsFree || 'free'}</span></td>
          <td>
            <button class="btn btn-danger-outline btn-sm" onclick="deleteCustomProvider('\${p.providerId}')">\${currentLang === 'vi' ? 'Xóa' : 'Delete'}</button>
          </td>
        \`;
        tbody.appendChild(tr);
      });
    } catch (e) {
      console.warn('Custom provider list error', e);
    }
  }

  async function deleteCustomProvider(id) {
    try {
      await api('/v1/providers/custom?providerId=' + encodeURIComponent(id), { method: 'DELETE' });
      showToast(currentLang === 'vi' ? 'Đã xóa provider ' + id : 'Removed provider ' + id);
      loadAll();
    } catch (e) {
      showToast('Error: ' + e.message);
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
    const provId = document.getElementById('modal-provider').value;
    const link = document.getElementById('modal-provider-link');
    const help = document.getElementById('modal-provider-help');
    const customUrlGroup = document.getElementById('modal-custom-url-group');

    if (provId === 'custom') {
      link.style.display = 'none';
      help.textContent = currentLang === 'vi' ? 'Nhập Base URL tương thích OpenAI hoặc Gemini.' : 'Enter any OpenAI or Gemini compatible base URL.';
      customUrlGroup.style.display = 'block';
      return;
    }

    customUrlGroup.style.display = 'none';
    const preset = allPresets.find(p => p.id === provId);
    if (preset) {
      link.style.display = 'inline';
      link.href = preset.apiKeyUrl;
      link.textContent = currentLang === 'vi' ? 'Lấy Key miễn phí ↗' : 'Get Free Key ↗';
      help.textContent = currentLang === 'vi' ? preset.keyInstructionsVi : preset.keyInstructionsEn;
    }
  }

  async function submitAddKey() {
    const provider = document.getElementById('modal-provider').value;
    const key = document.getElementById('modal-key').value.trim();
    const label = document.getElementById('modal-label').value.trim() || 'default';
    const customUrl = document.getElementById('modal-custom-url').value.trim();
    const btn = document.getElementById('modal-submit-btn');

    if (!key) {
      alert(currentLang === 'vi' ? 'Vui lòng nhập API Key' : 'Please enter an API Key');
      return;
    }

    try {
      btn.disabled = true;
      btn.textContent = currentLang === 'vi' ? 'Đang lưu & nạp model…' : 'Saving & loading models…';

      // If custom provider, register provider definition first
      if (provider === 'custom') {
        if (!customUrl) { alert('Please enter Custom Base URL'); return; }
        const customId = label !== 'default' ? label : 'custom-' + Date.now();
        await api('/v1/providers/custom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerId: customId, adapterType: 'openai-compatible', baseUrl: customUrl, classifyAsFree: 'free_verified' })
        });
        await api('/v1/credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerId: customId, credentialId: 'default', secret: key })
        });
      } else {
        await api('/v1/credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerId: provider, credentialId: label, secret: key })
        });
      }

      closeAddKeyModal();
      showToast(currentLang === 'vi' ? 'Đã lưu key & tự động nạp danh sách model!' : 'Key saved & models auto-loaded!');
      setTimeout(loadAll, 1000);
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = I18N[currentLang].saveKeyBtn;
    }
  }

  function openImportModal() { document.getElementById('import-modal').classList.add('open'); }
  function closeImportModal() { document.getElementById('import-modal').classList.remove('open'); }

  async function submitImport9Router() {
    const path = document.getElementById('import-path').value.trim();
    const provider = document.getElementById('import-provider').value;
    if (!path) { alert('Vui lòng nhập đường dẫn file 9Router SQLite'); return; }
    try {
      await api('/v1/import/9router', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDatabasePath: path, providerId: provider })
      });
      closeImportModal();
      showToast(currentLang === 'vi' ? 'Đã nhập key thành công từ 9Router!' : 'Imported key from 9Router!');
      loadAll();
    } catch (e) {
      alert('Import error: ' + e.message);
    }
  }

  function togglePasswordVisibility(id) {
    const inp = document.getElementById(id);
    inp.type = inp.type === 'password' ? 'text' : 'password';
  }

  // Live Playground
  async function runPlayground() {
    const model = document.getElementById('play-model').value;
    const prompt = document.getElementById('play-prompt').value.trim();
    const btn = document.getElementById('play-send-btn');
    const resultBox = document.getElementById('play-result');

    if (!prompt) return;

    try {
      btn.disabled = true;
      btn.textContent = currentLang === 'vi' ? 'Đang định tuyến…' : 'Routing…';
      resultBox.textContent = (currentLang === 'vi' ? 'Đang gửi yêu cầu tới ' : 'Sending request to ') + model + '…';

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

      showToast((currentLang === 'vi' ? 'Định tuyến thành công qua ' : 'Routed via ') + providerHeader + ' (' + modelHeader + ') trong ' + elapsed + 'ms');
      loadHealthAndAnalytics();
    } catch (e) {
      resultBox.textContent = 'Request failed: ' + e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = '🚀 ' + (currentLang === 'vi' ? 'Gửi Yêu Cầu' : 'Send Request');
    }
  }

  // 30s Polling
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
        showToast(currentLang === 'vi' ? 'Đã bật làm mới tự động.' : 'Real-time polling resumed.');
      } else {
        document.getElementById('poll-text').textContent = currentLang === 'vi' ? 'Tạm dừng' : 'Paused';
        document.getElementById('poll-icon').textContent = '⏸️';
        showToast(currentLang === 'vi' ? 'Đã tạm dừng làm mới tự động.' : 'Real-time polling paused.');
      }
    };
  }
</script>
</body>
</html>`;
}
