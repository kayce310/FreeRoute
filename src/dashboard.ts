/**
 * Modern, fully bilingual, NOC-style Dashboard for FreeRoute (Tiếng Việt & English).
 * Synthesizes 70+ providers from OmniRoute & 9router with Free/Commercial categorization,
 * 1-click credential sync, true free vs paid model separation, custom routing combos,
 * and comprehensive safe/anti-block connection instructions for IDEs.
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
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111827;
      --card-hover: #151e32;
      --card-border: #1f293d;
      --border-focus: #6366f1;
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
      overflow-x: hidden;
    }

    /* Fluid App Container */
    .app-container {
      max-width: 1360px;
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
      width: 42px;
      height: 42px;
      background: var(--primary-gradient);
      border-radius: var(--radius);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      box-shadow: 0 0 16px rgba(99, 102, 241, 0.4);
      flex-shrink: 0;
    }

    .brand-title {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
      background: var(--primary-gradient);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .brand-sub {
      color: var(--text-muted);
      font-size: 13px;
      margin-top: 2px;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px 14px;
      font-size: 13px;
      font-weight: 500;
      border-radius: var(--radius-sm);
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
      text-decoration: none;
      color: var(--text);
      background: var(--card-bg);
      border-color: var(--card-border);
    }
    .btn:hover {
      background: var(--card-hover);
      border-color: var(--primary);
    }
    .btn-primary {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }
    .btn-primary:hover {
      background: var(--primary-hover);
      box-shadow: 0 0 12px rgba(99, 102, 241, 0.4);
    }
    .btn-success {
      background: var(--success);
      color: #fff;
      border-color: var(--success);
    }
    .btn-success:hover {
      background: #059669;
    }
    .btn-danger {
      color: var(--danger);
      border-color: rgba(239, 68, 68, 0.3);
      background: var(--danger-bg);
    }
    .btn-danger:hover {
      background: var(--danger);
      color: #fff;
    }
    .btn-sm {
      padding: 4px 10px;
      font-size: 12px;
    }

    /* Smart Sync Banner */
    .sync-banner {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(6, 182, 212, 0.15) 100%);
      border: 1px solid rgba(99, 102, 241, 0.4);
      border-radius: var(--radius);
      padding: 14px 18px;
      margin-bottom: 24px;
      display: none;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
    }
    .sync-banner-text {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
    }
    .sync-icon {
      font-size: 20px;
      color: var(--accent);
    }

    /* KPI Grid */
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
      padding: 18px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: border-color 0.2s;
    }
    .kpi-card:hover { border-color: var(--primary); }
    .kpi-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 6px;
    }
    .kpi-value {
      font-size: 24px;
      font-weight: 700;
      color: var(--text);
      font-family: var(--font-mono);
    }
    .kpi-icon {
      font-size: 28px;
      opacity: 0.7;
    }

    /* Navigation Tabs */
    .tabs-nav {
      display: flex;
      gap: 6px;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 24px;
      overflow-x: auto;
      padding-bottom: 2px;
    }
    .tab-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 10px 16px;
      font-size: 13px;
      font-weight: 500;
      border-bottom: 2px solid transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      white-space: nowrap;
      transition: all 0.15s;
    }
    .tab-btn:hover {
      color: var(--text);
    }
    .tab-btn.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
      font-weight: 600;
    }

    /* Tab Content Panes */
    .tab-pane {
      display: none;
    }
    .tab-pane.active {
      display: block;
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
      gap: 12px;
    }
    .card-title {
      font-size: 16px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Filter & Search Bar */
    .filter-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .filter-group {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .filter-pill {
      background: var(--card-hover);
      border: 1px solid var(--card-border);
      color: var(--text-muted);
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }
    .filter-pill:hover, .filter-pill.active {
      background: rgba(99, 102, 241, 0.2);
      border-color: var(--primary);
      color: var(--text);
    }
    .search-input {
      background: var(--bg);
      border: 1px solid var(--card-border);
      color: var(--text);
      padding: 7px 12px;
      border-radius: var(--radius-sm);
      font-size: 13px;
      min-width: 220px;
      outline: none;
    }
    .search-input:focus {
      border-color: var(--primary);
    }
    select.filter-select {
      background: var(--bg);
      border: 1px solid var(--card-border);
      color: var(--text);
      padding: 7px 10px;
      border-radius: var(--radius-sm);
      font-size: 13px;
      outline: none;
    }

    /* Tables */
    .table-wrap {
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
      background: rgba(255, 255, 255, 0.02);
      padding: 10px 14px;
      color: var(--text-muted);
      font-weight: 600;
      border-bottom: 1px solid var(--card-border);
      white-space: nowrap;
      user-select: none;
    }
    th.sortable {
      cursor: pointer;
    }
    th.sortable:hover {
      color: var(--text);
    }
    td {
      padding: 12px 14px;
      border-bottom: 1px solid rgba(31, 41, 61, 0.5);
      vertical-align: middle;
    }
    tr:hover td {
      background: var(--card-hover);
    }

    /* Badges */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }
    .badge-green { background: var(--success-bg); color: var(--success); }
    .badge-yellow { background: var(--warning-bg); color: var(--warning); }
    .badge-red { background: var(--danger-bg); color: var(--danger); }
    .badge-blue { background: rgba(6, 182, 212, 0.12); color: var(--accent); }
    .badge-gray { background: rgba(156, 163, 175, 0.12); color: var(--text-muted); }
    .badge-purple { background: rgba(168, 85, 247, 0.12); color: #c084fc; }

    /* Provider Directory Cards Grid */
    .presets-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 16px;
    }
    .preset-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 18px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: all 0.2s;
    }
    .preset-card:hover {
      border-color: var(--primary);
      transform: translateY(-2px);
      box-shadow: var(--shadow);
    }
    .preset-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 10px;
    }
    .preset-name {
      font-size: 16px;
      font-weight: 600;
      color: var(--text);
    }
    .preset-desc {
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 14px;
      line-height: 1.4;
      flex-grow: 1;
    }
    .preset-models {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 14px;
    }
    .preset-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      border-top: 1px solid var(--card-border);
      padding-top: 12px;
    }

    /* Combos Grid */
    .combos-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 16px;
    }
    .combo-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 18px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: all 0.2s;
    }
    .combo-card:hover {
      border-color: var(--accent);
      box-shadow: var(--shadow);
    }
    .combo-chain {
      background: var(--bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-sm);
      padding: 10px 12px;
      margin: 12px 0;
      font-family: var(--font-mono);
      font-size: 12px;
      line-height: 1.7;
    }
    .chain-step {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .chain-arrow {
      color: var(--accent);
      font-weight: bold;
    }

    /* NOC Health Matrix */
    .health-matrix {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 14px;
    }
    .health-item {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 14px 16px;
      transition: border-color 0.2s;
    }
    .health-item:hover {
      border-color: var(--primary);
    }
    .health-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .health-name {
      font-weight: 600;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
    }
    .dot-green { background: var(--success); box-shadow: 0 0 8px var(--success); }
    .dot-yellow { background: var(--warning); box-shadow: 0 0 8px var(--warning); }
    .dot-red { background: var(--danger); box-shadow: 0 0 8px var(--danger); }
    .dot-gray { background: var(--text-dim); }

    .progress-bar {
      height: 6px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 3px;
      overflow: hidden;
      margin: 8px 0;
    }
    .progress-fill {
      height: 100%;
      background: var(--success);
      border-radius: 3px;
    }

    .health-metrics {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: var(--text-muted);
      font-family: var(--font-mono);
    }

    /* Modal */
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(4px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 20px;
    }
    .modal-overlay.active {
      display: flex;
    }
    .modal {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-lg);
      width: 100%;
      max-width: 560px;
      padding: 24px;
      box-shadow: var(--shadow);
      max-height: 90vh;
      overflow-y: auto;
    }
    .modal-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .form-group {
      margin-bottom: 14px;
    }
    .form-group label {
      display: block;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-muted);
      margin-bottom: 6px;
    }
    .form-control {
      width: 100%;
      background: var(--bg);
      border: 1px solid var(--card-border);
      color: var(--text);
      padding: 8px 12px;
      border-radius: var(--radius-sm);
      font-size: 13px;
      outline: none;
    }
    .form-control:focus {
      border-color: var(--primary);
    }
    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 20px;
    }

    /* Code Snippet Box */
    .code-box {
      background: var(--bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-sm);
      padding: 14px 16px;
      font-family: var(--font-mono);
      font-size: 12px;
      line-height: 1.6;
      color: #a5b4fc;
      overflow-x: auto;
      white-space: pre;
    }

    .alert-box {
      border-radius: var(--radius-sm);
      padding: 12px 16px;
      margin-bottom: 16px;
      font-size: 13px;
      line-height: 1.5;
    }
    .alert-info {
      background: rgba(6, 182, 212, 0.1);
      border: 1px solid rgba(6, 182, 212, 0.3);
      color: #a5f3fc;
    }
    .alert-warning {
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: #fde68a;
    }

    /* Toast Notification */
    #toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: var(--card-bg);
      border: 1px solid var(--border-focus);
      color: var(--text);
      padding: 10px 18px;
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      font-size: 13px;
      opacity: 0;
      transform: translateY(10px);
      transition: all 0.2s ease;
      pointer-events: none;
      z-index: 2000;
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
          <h1 class="brand-title">FreeRoute</h1>
          <div class="brand-sub" id="hdr-subtitle">Định tuyến LLM cục bộ, tối ưu hạn ngạch miễn phí, chuyển đổi dự phòng tức thì</div>
        </div>
      </div>
      <div class="header-actions">
        <button class="btn btn-sm" id="lang-btn" onclick="toggleLanguage()">🇻🇳 Tiếng Việt</button>
        <button class="btn btn-sm" onclick="triggerRefresh()" id="hdr-refresh-btn">🔄 Làm mới</button>
        <button class="btn btn-primary btn-sm" onclick="openAddKeyModal()" id="hdr-add-key-btn">➕ Thêm API Key</button>
        <button class="btn btn-success btn-sm" onclick="openSyncModal()" id="hdr-sync-btn" style="display:none;">⚡ Nhập Key Có Sẵn</button>
      </div>
    </header>

    <!-- Smart 1-Click Sync Banner -->
    <div class="sync-banner" id="sync-banner">
      <div class="sync-banner-text">
        <span class="sync-icon">⚡</span>
        <span id="sync-banner-msg">Phát hiện khóa API từ OmniRoute & 9router trên máy này.</span>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-success btn-sm" onclick="quickSyncAll()" id="sync-quick-btn">Đồng bộ tất cả ngay</button>
        <button class="btn btn-outline btn-sm" onclick="openSyncModal()" id="sync-review-btn">Xem chi tiết</button>
      </div>
    </div>

    <!-- KPI Summary Cards -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div>
          <div class="kpi-label" id="kpi-lbl-providers">Nhà Cung Cấp Đã Kết Nối</div>
          <div class="kpi-value" id="kpi-providers">0</div>
        </div>
        <div class="kpi-icon">🌐</div>
      </div>
      <div class="kpi-card">
        <div>
          <div class="kpi-label" id="kpi-lbl-models-free">🎁 Model 100% Miễn Phí</div>
          <div class="kpi-value" id="kpi-models-free" style="color:var(--success);">0</div>
        </div>
        <div class="kpi-icon">🎉</div>
      </div>
      <div class="kpi-card">
        <div>
          <div class="kpi-label" id="kpi-lbl-models-paid">💳 Model Thương Mại (Paid)</div>
          <div class="kpi-value" id="kpi-models-paid" style="color:#c084fc;">0</div>
        </div>
        <div class="kpi-icon">💎</div>
      </div>
      <div class="kpi-card">
        <div>
          <div class="kpi-label" id="kpi-lbl-requests">Yêu Cầu Đã Xử Lý</div>
          <div class="kpi-value" id="kpi-requests">0</div>
        </div>
        <div class="kpi-icon">📊</div>
      </div>
      <div class="kpi-card">
        <div>
          <div class="kpi-label" id="kpi-lbl-fallbacks">Chuyển Vùng Cứu Nguy</div>
          <div class="kpi-value" id="kpi-fallbacks">0</div>
        </div>
        <div class="kpi-icon">🛡️</div>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="tabs-nav">
      <button class="tab-btn active" onclick="switchTab('monitor')" id="tab-btn-monitor">📡 Giám Sát Sức Khỏe</button>
      <button class="tab-btn" onclick="switchTab('directory')" id="tab-btn-directory">🌐 Danh Mục 70+ Provider</button>
      <button class="tab-btn" onclick="switchTab('models')" id="tab-btn-models">📚 Danh Sách Model</button>
      <button class="tab-btn" onclick="switchTab('combos')" id="tab-btn-combos">🔀 Custom Combos</button>
      <button class="tab-btn" onclick="switchTab('credentials')" id="tab-btn-credentials">🔑 Quản Lý API Key</button>
      <button class="tab-btn" onclick="switchTab('playground')" id="tab-btn-playground">🧪 Test Playground</button>
      <button class="tab-btn" onclick="switchTab('guide')" id="tab-btn-guide">📖 Hướng Dẫn An Toàn</button>
    </div>

    <!-- TAB 1: MONITOR & HEALTH MATRIX -->
    <div class="tab-pane active" id="pane-monitor">
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <span id="title-health-matrix">Lưới Sức Khỏe Nhà Cung Cấp (Provider Health Matrix)</span>
          </div>
          <div style="font-size:12px; color:var(--text-muted);" id="lbl-live-polling">
            🟢 Tự động cập nhật mỗi 10s
          </div>
        </div>
        <div class="health-matrix" id="health-matrix-container">
          <!-- Rendered dynamically -->
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <span id="title-recent-stream">Dòng Sự Kiện Định Tuyến Gần Đây (Routing Stream)</span>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th id="th-ev-time">Thời gian</th>
                <th id="th-ev-reqid">Request ID</th>
                <th id="th-ev-target">Model Yêu Cầu</th>
                <th id="th-ev-served">Phục Vụ Bởi</th>
                <th id="th-ev-fallbacks">Fallback Hops</th>
                <th id="th-ev-latency">Độ Trễ</th>
                <th id="th-ev-status">Trạng Thái</th>
              </tr>
            </thead>
            <tbody id="events-tbody">
              <tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:20px;" id="lbl-no-events">Chưa có sự kiện nào. Hãy gửi request qua cổng http://127.0.0.1:8787/v1!</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 2: PROVIDER DIRECTORY (70+ PRESETS) -->
    <div class="tab-pane" id="pane-directory">
      <div class="filter-bar">
        <div class="filter-group">
          <div class="filter-pill active" onclick="filterPresets('all')" id="pill-all">Tất cả (<span id="cnt-all">0</span>)</div>
          <div class="filter-pill" onclick="filterPresets('free')" id="pill-free">🎁 Miễn phí & Mã nguồn mở (<span id="cnt-free">0</span>)</div>
          <div class="filter-pill" onclick="filterPresets('commercial')" id="pill-comm">💎 Thương mại (Pay-as-you-go) (<span id="cnt-comm">0</span>)</div>
        </div>
        <input type="text" class="search-input" id="search-presets" placeholder="🔍 Tìm nhà cung cấp..." oninput="handlePresetSearch()">
      </div>
      <div class="presets-grid" id="presets-container">
        <!-- Rendered dynamically -->
      </div>
    </div>

    <!-- TAB 3: MODEL CATALOG (WITH SORTING & FILTERING) -->
    <div class="tab-pane" id="pane-models">
      <div class="filter-bar">
        <div class="filter-group">
          <label style="display:flex; align-items:center; gap:6px; font-size:13px; font-weight:600; cursor:pointer; background:var(--card-hover); padding:6px 12px; border-radius:var(--radius-sm); border:1px solid var(--card-border);">
            <input type="checkbox" id="chk-free-only" onchange="applyModelFilters()" checked>
            <span id="lbl-free-only">🎁 Chỉ hiển thị Model 100% Miễn Phí</span>
          </label>
          <select class="filter-select" id="model-filter-provider" onchange="applyModelFilters()">
            <option value="all">Tất cả Provider</option>
          </select>
          <select class="filter-select" id="model-filter-cap" onchange="applyModelFilters()">
            <option value="all">Tất cả Tính Năng</option>
            <option value="chat">Chat</option>
            <option value="tools">Tools / Function Calling</option>
            <option value="vision">Vision</option>
          </select>
        </div>
        <input type="text" class="search-input" id="search-models" placeholder="🔍 Tìm model theo tên, ID..." oninput="applyModelFilters()">
      </div>

      <div class="card" style="padding:0; overflow:hidden;">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th class="sortable" onclick="sortModels('modelId')" id="th-model-id">Model ID ⇕</th>
                <th class="sortable" onclick="sortModels('providerId')" id="th-model-provider">Nhà Cung Cấp ⇕</th>
                <th class="sortable" onclick="sortModels('isTrueFree')" id="th-model-tier">Chi Phí / Hạng Mức ⇕</th>
                <th class="sortable" onclick="sortModels('priority')" id="th-model-priority">Độ Ưu Tiên ⇕</th>
                <th id="th-model-caps">Tính Năng Hỗ Trợ</th>
                <th id="th-model-pref">Định Tuyến</th>
              </tr>
            </thead>
            <tbody id="models-tbody">
              <!-- Rendered dynamically -->
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 4: CUSTOM COMBOS (NEW!) -->
    <div class="tab-pane" id="pane-combos">
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title" id="title-combos">Chuỗi Định Tuyến Dự Phòng Tùy Biến (Custom Combos)</div>
            <div style="font-size:12px; color:var(--text-muted); margin-top:4px;" id="desc-combos">
              Tự thiết lập chuỗi Fallback theo ý muốn. Khi model trước gặp sự cố hoặc hết quota, FreeRoute sẽ tự động chuyển sang model kế tiếp!
            </div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="openCreateComboModal()" id="btn-create-combo">➕ Tạo Combo Mới</button>
        </div>
        <div class="combos-grid" id="combos-container">
          <!-- Rendered dynamically -->
        </div>
      </div>
    </div>

    <!-- TAB 5: KEY MANAGEMENT & LOCAL SYNC -->
    <div class="tab-pane" id="pane-credentials">
      <div class="card">
        <div class="card-header">
          <div class="card-title" id="title-keys-heading">Khóa API Đã Lưu (Mã Hóa AES-256-GCM)</div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-success btn-sm" onclick="openSyncModal()" id="btn-sync-local">⚡ Nhập Từ 9router & OmniRoute</button>
            <button class="btn btn-primary btn-sm" onclick="openAddKeyModal()" id="btn-add-key-sub">➕ Thêm Key Mới</button>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th id="th-k-prov">Nhà Cung Cấp</th>
                <th id="th-k-id">ID Khóa</th>
                <th id="th-k-updated">Cập Nhật</th>
                <th style="text-align:right;" id="th-k-action">Hành Động</th>
              </tr>
            </thead>
            <tbody id="creds-tbody">
              <!-- Rendered dynamically -->
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 6: TEST PLAYGROUND -->
    <div class="tab-pane" id="pane-playground">
      <div class="card">
        <div class="card-header">
          <div class="card-title" id="title-play">Thử Nghiệm Định Tuyến Prompt</div>
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:16px; margin-bottom:16px;">
          <div class="form-group">
            <label id="lbl-play-model">Hồ Sơ / Model / Combo Mục Tiêu</label>
            <select class="form-control" id="play-model-select">
              <optgroup label="Hồ Sơ Tự Động (Auto Profiles)">
                <option value="auto:free">auto:free (Ưu tiên mô hình miễn phí)</option>
                <option value="auto:fast">auto:fast (Tối ưu tốc độ cao Cerebras/Groq)</option>
                <option value="auto:code">auto:code (Lập trình & Tools)</option>
                <option value="auto:long-context">auto:long-context (Ngữ cảnh dài Gemini 1M+)</option>
              </optgroup>
              <optgroup label="Custom Combos" id="play-combos-group">
                <!-- Populated dynamically -->
              </optgroup>
            </select>
          </div>
          <div class="form-group">
            <label id="lbl-play-temp">Nhiệt Độ (Temperature): <span id="temp-val">0.7</span></label>
            <input type="range" min="0" max="1" step="0.1" value="0.7" class="form-control" id="play-temp" oninput="document.getElementById('temp-val').textContent = this.value">
          </div>
        </div>
        <div class="form-group">
          <label id="lbl-play-prompt">Prompt Thử Nghiệm</label>
          <textarea class="form-control" id="play-prompt" rows="3" placeholder="Nhập câu hỏi tại đây...">Giải thích ngắn gọn cơ chế Fallback của FreeRoute trong 2 câu.</textarea>
        </div>
        <button class="btn btn-primary" onclick="sendTestChat()" id="btn-play-send">🚀 Gửi Thử Nghiệm (Streaming)</button>

        <div style="margin-top:20px;">
          <label style="font-size:12px; color:var(--text-muted); display:block; margin-bottom:6px;" id="lbl-play-res">Kết quả phản hồi:</label>
          <div class="code-box" id="play-output" style="min-height:100px; max-height:300px;">Chờ gửi prompt...</div>
        </div>
      </div>
    </div>

    <!-- TAB 7: SAFE & ANTI-BLOCK CONNECTION GUIDE -->
    <div class="tab-pane" id="pane-guide">
      <div class="card">
        <h2 style="font-size:18px; margin-bottom:12px;" id="guide-head">🛡️ Cẩm Nang Kết Nối & Bảo Vệ Tài Khoản An Toàn Tuyệt Đối</h2>
        <div class="alert-box alert-info" id="guide-sec-alert">
          <strong>🔒 An Tâm Sử Dụng:</strong> FreeRoute chạy hoàn toàn trên máy cục bộ của bạn (<code style="color:#fff;">127.0.0.1:8787</code>). Mọi dữ liệu mã hóa lưu trong máy, không qua server trung gian nào, tự động gỡ bỏ telemetry và khử sạch các header lạ để tránh bị hệ thống quét của IDE phát hiện hoặc đánh dấu tài khoản bất thường!
        </div>

        <div style="margin-bottom:24px;">
          <h3 style="font-size:15px; margin-bottom:8px; color:var(--accent);">1. Cursor IDE (Cấu hình an toàn không lo xung đột)</h3>
          <p style="color:var(--text-muted); font-size:13px; margin-bottom:8px;">
            Vào <strong>Settings -> Models -> OpenAI API Key</strong>:
          </p>
          <ul style="color:var(--text-muted); font-size:13px; margin-left:20px; margin-bottom:10px; line-height:1.6;">
            <li>Bật <strong>Override OpenAI Base URL</strong> và điền: <code style="color:#fff;">http://127.0.0.1:8787/v1</code></li>
            <li>API Key: Nhập bất kỳ chuỗi nào (vd: <code style="color:#fff;">freeroute-local</code>) hoặc token nếu bạn có cấu hình.</li>
            <li><strong>Mẹo tránh bị block:</strong> Chỉ thêm các model alias của FreeRoute như <code style="color:#fff;">auto:free</code>, <code style="color:#fff;">auto:code</code>, <code style="color:#fff;">auto:fast</code> hoặc tên combo của bạn như <code style="color:#fff;">combo:free-coders</code>. <em>Tuyệt đối không đặt tên model trùng với các model độc quyền Cursor (claude-3-5-sonnet-cursor...)</em> để tránh bị hệ thống verify server-side của Cursor gắn cờ!</li>
          </ul>
        </div>

        <div style="margin-bottom:24px;">
          <h3 style="font-size:15px; margin-bottom:8px; color:var(--accent);">2. Cline / Roo Code (VS Code & JetBrains Extension)</h3>
          <p style="color:var(--text-muted); font-size:13px; margin-bottom:8px;">
            Cline và Roo Code hỗ trợ chuẩn cả 2 giao thức OpenAI Compatible và Anthropic Messages:
          </p>
          <div class="code-box">Option A: OpenAI Compatible
- API Provider: OpenAI Compatible
- Base URL: http://127.0.0.1:8787/v1
- API Key: freeroute-local
- Model ID: auto:code (hoặc combo:free-coders)

Option B: Anthropic Native Mode (Hỗ trợ Tool Calling / Function tốt nhất)
- API Provider: Anthropic
- Base URL: http://127.0.0.1:8787/v1
- API Key: freeroute-local
- Model ID: auto:code</div>
        </div>

        <div style="margin-bottom:24px;">
          <h3 style="font-size:15px; margin-bottom:8px; color:var(--accent);">3. Claude Code CLI & OpenCode</h3>
          <p style="color:var(--text-muted); font-size:13px; margin-bottom:8px;">
            Đặt biến môi trường terminal trong file profile (<code style="color:#fff;">.bashrc</code> hoặc PowerShell):
          </p>
          <div class="code-box"># Cho Claude Code CLI
export ANTHROPIC_BASE_URL="http://127.0.0.1:8787/v1"
export ANTHROPIC_API_KEY="freeroute-local"

# Cho Aider / OpenCode / AutoGPT
export OPENAI_BASE_URL="http://127.0.0.1:8787/v1"
export OPENAI_API_KEY="freeroute-local"</div>
        </div>

        <div style="margin-bottom:24px;">
          <h3 style="font-size:15px; margin-bottom:8px; color:var(--accent);">4. Continue.dev (Cấu hình config.json)</h3>
          <div class="code-box">{
  "models": [
    {
      "title": "FreeRoute Coding",
      "provider": "openai",
      "model": "auto:code",
      "apiBase": "http://127.0.0.1:8787/v1",
      "apiKey": "freeroute-local"
    }
  ]
}</div>
        </div>

        <div style="margin-bottom:24px;">
          <h3 style="font-size:15px; margin-bottom:8px; color:var(--accent);">5. OpenAI Python SDK</h3>
          <div class="code-box">from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:8787/v1",
    api_key="your-freeroute-token"
)

# Gọi combo tự tạo hoặc profile tự động
response = client.chat.completions.create(
    model="combo:free-coders",
    messages=[{"role": "user", "content": "Viết hàm đảo ngược xâu trong Python"}]
)
print(response.choices[0].message.content)</div>
        </div>
      </div>
    </div>

  </div> <!-- /app-container -->

  <!-- MODAL: ADD API KEY -->
  <div class="modal-overlay" id="modal-add-key">
    <div class="modal">
      <div class="modal-title">
        <span id="modal-add-title">Thêm / Cập Nhật Khóa API</span>
        <button class="btn btn-sm" onclick="closeAddKeyModal()">✕</button>
      </div>
      <div class="form-group">
        <label id="lbl-modal-prov">Chọn Nhà Cung Cấp</label>
        <select class="form-control" id="modal-prov-select" onchange="onModalProviderChange()">
          <!-- Populated dynamically -->
        </select>
      </div>
      <div id="modal-prov-hint" style="font-size:12px; color:var(--accent); margin-bottom:12px;"></div>
      <div class="form-group">
        <label id="lbl-modal-secret">API Key / Secret Token</label>
        <input type="password" class="form-control" id="modal-secret" placeholder="sk-...">
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeAddKeyModal()" id="btn-modal-cancel">Hủy</button>
        <button class="btn btn-primary" onclick="submitAddKey()" id="btn-modal-save">Lưu & Nạp Model</button>
      </div>
    </div>
  </div>

  <!-- MODAL: 1-CLICK SYNC FROM 9ROUTER & OMNIROUTE -->
  <div class="modal-overlay" id="modal-sync">
    <div class="modal" style="max-width:640px;">
      <div class="modal-title">
        <span id="modal-sync-title">⚡ Nhập Khóa Từ 9router & OmniRoute</span>
        <button class="btn btn-sm" onclick="closeSyncModal()">✕</button>
      </div>
      <p style="font-size:12px; color:var(--text-muted); margin-bottom:14px;" id="modal-sync-desc">
        Hệ thống tự động phát hiện các cấu hình khóa API đã có sẵn trên máy của bạn. Chọn các khóa muốn nhập vào FreeRoute:
      </p>
      <div style="max-height:300px; overflow-y:auto; border:1px solid var(--card-border); border-radius:var(--radius-sm); margin-bottom:16px;">
        <table style="width:100%;">
          <thead>
            <tr>
              <th style="width:40px;"><input type="checkbox" id="sync-select-all" checked onchange="toggleSelectAllSync(this)"></th>
              <th>Provider</th>
              <th>Nguồn</th>
              <th>Masked Key</th>
            </tr>
          </thead>
          <tbody id="sync-sources-tbody">
            <!-- Populated dynamically -->
          </tbody>
        </table>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeSyncModal()" id="btn-sync-cancel">Hủy</button>
        <button class="btn btn-success" onclick="executeSyncSelected()" id="btn-sync-confirm">Đồng Bộ Khóa Đã Chọn</button>
      </div>
    </div>
  </div>

  <!-- MODAL: CREATE CUSTOM COMBO (NEW!) -->
  <div class="modal-overlay" id="modal-create-combo">
    <div class="modal" style="max-width:620px;">
      <div class="modal-title">
        <span id="modal-combo-title">➕ Tạo Custom Routing Combo</span>
        <button class="btn btn-sm" onclick="closeCreateComboModal()">✕</button>
      </div>
      <div class="form-group">
        <label id="lbl-combo-id">Mã Combo (ID duy nhất, dùng trong request model: "combo:xxx")</label>
        <input type="text" class="form-control" id="combo-input-id" placeholder="vd: my-coding-chain">
      </div>
      <div class="form-group">
        <label id="lbl-combo-name">Tên Combo Hiển Thị</label>
        <input type="text" class="form-control" id="combo-input-name" placeholder="vd: Siêu Tốc & Lập Trình Dự Phòng">
      </div>
      <div class="form-group">
        <label id="lbl-combo-desc">Mô Tả</label>
        <input type="text" class="form-control" id="combo-input-desc" placeholder="vd: Chuỗi fallback khi cần lập trình">
      </div>
      <div class="form-group">
        <label id="lbl-combo-models">Chuỗi Model Fallback (Theo Thứ Tự Ưu Tiên)</label>
        <div style="display:flex; gap:8px; margin-bottom:8px;">
          <select class="form-control" id="combo-add-model-select">
            <!-- Populated with models -->
          </select>
          <button class="btn btn-sm btn-primary" onclick="addModelToComboChain()">➕ Thêm</button>
        </div>
        <div id="combo-chain-list" style="max-height:160px; overflow-y:auto; border:1px solid var(--card-border); border-radius:var(--radius-sm); padding:8px;">
          <!-- Items listed with remove button -->
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeCreateComboModal()" id="btn-combo-cancel">Hủy</button>
        <button class="btn btn-primary" onclick="submitCreateCombo()" id="btn-combo-save">Lưu Combo</button>
      </div>
    </div>
  </div>

  <!-- Toast Notification -->
  <div id="toast"></div>

  <script>
    // State
    let currentLang = localStorage.getItem('freeroute_lang') || 'vi';
    let presets = [];
    let models = [];
    let combos = [];
    let credentials = [];
    let healthData = [];
    let eventsData = [];
    let detectedSources = [];
    let activePresetFilter = 'all';
    let modelSortField = 'priority';
    let modelSortAsc = false;
    let tempComboChain = [];

    // Helper: Identify True Free models
    function isTrueFreeModel(m) {
      if (m.freeTier === 'free_verified') return true;
      if (m.modelId.endsWith(':free') || m.id.endsWith(':free')) return true;
      const p = (m.providerId || '').toLowerCase();
      if (['groq', 'cerebras', 'github', 'ollama', 'gemini'].includes(p)) {
        if (m.freeTier !== 'paid') return true;
      }
      return false;
    }

    // Full i18n Dictionary
    const I18N = {
      vi: {
        langBtn: '🇻🇳 Tiếng Việt',
        subtitle: 'Định tuyến LLM cục bộ, tối ưu hạn ngạch miễn phí, chuyển đổi dự phòng tức thì',
        refresh: '🔄 Làm mới',
        addKey: '➕ Thêm API Key',
        syncKey: '⚡ Nhập Key Có Sẵn',
        syncBanner: (n) => 'Phát hiện ' + n + ' khóa API từ OmniRoute & 9router trên máy này.',
        syncAllNow: 'Đồng bộ tất cả ngay',
        syncReview: 'Xem chi tiết',
        kpiProviders: 'Nhà Cung Cấp Đã Kết Nối',
        kpiModelsFree: '🎁 Model 100% Miễn Phí',
        kpiModelsPaid: '💳 Model Thương Mại (Paid)',
        kpiRequests: 'Yêu Cầu Đã Xử Lý',
        kpiFallbacks: 'Chuyển Vùng Cứu Nguy',
        tabMonitor: '📡 Giám Sát Sức Khỏe',
        tabDirectory: '🌐 Danh Mục 70+ Provider',
        tabModels: '📚 Danh Sách Model',
        tabCombos: '🔀 Custom Combos',
        tabCredentials: '🔑 Quản Lý API Key',
        tabPlayground: '🧪 Test Playground',
        tabGuide: '📖 Hướng Dẫn An Toàn',
        healthTitle: 'Lưới Sức Khỏe Nhà Cung Cấp (Provider Health Matrix)',
        healthAutoPoll: '🟢 Tự động cập nhật mỗi 10s',
        recentStreamTitle: 'Dòng Sự Kiện Định Tuyến Gần Đây (Routing Stream)',
        thTime: 'Thời gian',
        thReqId: 'Request ID',
        thTarget: 'Model Yêu Cầu',
        thServed: 'Phục Vụ Bởi',
        thFallbacks: 'Fallback Hops',
        thLatency: 'Độ Trễ',
        thStatus: 'Trạng Thái',
        noEvents: 'Chưa có sự kiện nào. Hãy gửi request qua cổng http://127.0.0.1:8787/v1!',
        searchProviders: '🔍 Tìm nhà cung cấp...',
        pillAll: 'Tất cả',
        pillFree: '🎁 Miễn phí & Mã nguồn mở',
        pillComm: '💎 Thương mại (Pay-as-you-go)',
        getKeyLink: 'Lấy Key ↗',
        connectBtn: 'Kết nối',
        connectedBadge: 'Đã kết nối',
        allProvidersOpt: 'Tất cả Provider',
        allCapsOpt: 'Tất cả Tính Năng',
        lblFreeOnly: '🎁 Chỉ hiển thị Model 100% Miễn Phí',
        searchModels: '🔍 Tìm model theo tên, ID...',
        thModelId: 'Model ID',
        thProvider: 'Nhà Cung Cấp',
        thTier: 'Chi Phí / Hạng Mức',
        thPriority: 'Độ Ưu Tiên',
        thCaps: 'Tính Năng Hỗ Trợ',
        thPref: 'Định Tuyến',
        titleCombos: 'Chuỗi Định Tuyến Dự Phòng Tùy Biến (Custom Combos)',
        descCombos: 'Tự thiết lập chuỗi Fallback theo ý muốn. Khi model trước gặp sự cố hoặc hết quota, FreeRoute sẽ tự động chuyển sang model kế tiếp!',
        btnCreateCombo: '➕ Tạo Combo Mới',
        keysTitle: 'Khóa API Đã Lưu (Mã Hóa AES-256-GCM)',
        thUpdated: 'Cập Nhật',
        thAction: 'Hành Động',
        deleteBtn: 'Xóa',
        playTitle: 'Thử Nghiệm Định Tuyến Prompt',
        playSend: '🚀 Gửi Thử Nghiệm (Streaming)',
        modalAddTitle: 'Thêm / Cập Nhật Khóa API',
        modalProvLabel: 'Chọn Nhà Cung Cấp',
        modalSecretLabel: 'API Key / Secret Token',
        modalCancel: 'Hủy',
        modalSave: 'Lưu & Nạp Model',
        modalSyncTitle: '⚡ Nhập Khóa Từ 9router & OmniRoute',
        modalSyncDesc: 'Hệ thống tự động phát hiện các cấu hình khóa API đã có sẵn trên máy của bạn. Chọn các khóa muốn nhập vào FreeRoute:',
        syncConfirm: 'Đồng Bộ Khóa Đã Chọn',
        statusHealthy: 'Khỏe mạnh',
        statusCooldown: 'Hạ nhiệt',
        statusError: 'Lỗi',
        statusUnconfigured: 'Chưa kết nối'
      },
      en: {
        langBtn: '🇬🇧 English',
        subtitle: 'Local-first LLM router, quota-aware fallback, zero lock-in',
        refresh: '🔄 Refresh',
        addKey: '➕ Add API Key',
        syncKey: '⚡ Import Stored Keys',
        syncBanner: (n) => 'Detected ' + n + ' API keys from OmniRoute & 9router on this machine.',
        syncAllNow: 'Sync all now',
        syncReview: 'Review details',
        kpiProviders: 'Configured Providers',
        kpiModelsFree: '🎁 100% Free Models',
        kpiModelsPaid: '💳 Commercial Models',
        kpiRequests: 'Requests Handled',
        kpiFallbacks: 'Fallbacks Recovered',
        tabMonitor: '📡 Health & Monitor',
        tabDirectory: '🌐 70+ Provider Directory',
        tabModels: '📚 Model Catalog',
        tabCombos: '🔀 Custom Combos',
        tabCredentials: '🔑 Key Management',
        tabPlayground: '🧪 Test Playground',
        tabGuide: '📖 Safe Connect Guide',
        healthTitle: 'Provider Health Matrix',
        healthAutoPoll: '🟢 Auto-refreshing every 10s',
        recentStreamTitle: 'Recent Routing Stream',
        thTime: 'Time',
        thReqId: 'Request ID',
        thTarget: 'Target Model',
        thServed: 'Served By',
        thFallbacks: 'Fallback Hops',
        thLatency: 'Latency',
        thStatus: 'Status',
        noEvents: 'No events yet. Send requests to http://127.0.0.1:8787/v1!',
        searchProviders: '🔍 Search providers...',
        pillAll: 'All',
        pillFree: '🎁 Free & Open Source',
        pillComm: '💎 Commercial (Pay-as-you-go)',
        getKeyLink: 'Get Key ↗',
        connectBtn: 'Connect',
        connectedBadge: 'Connected',
        allProvidersOpt: 'All Providers',
        allCapsOpt: 'All Capabilities',
        lblFreeOnly: '🎁 Show 100% Free Models Only',
        searchModels: '🔍 Search models by ID or name...',
        thModelId: 'Model ID',
        thProvider: 'Provider',
        thTier: 'Cost / Tier',
        thPriority: 'Priority',
        thCaps: 'Capabilities',
        thPref: 'Routing',
        titleCombos: 'Custom Fallback Routing Chains (Combos)',
        descCombos: 'Define your own priority chains. When the primary model fails or hits quota limits, FreeRoute transparently routes to the next model in sequence!',
        btnCreateCombo: '➕ Create Combo',
        keysTitle: 'Stored API Keys (Encrypted with AES-256-GCM)',
        thUpdated: 'Updated',
        thAction: 'Action',
        deleteBtn: 'Delete',
        playTitle: 'Prompt Routing Test Playground',
        playSend: '🚀 Send Request (Streaming)',
        modalAddTitle: 'Add / Update API Key',
        modalProvLabel: 'Select Provider',
        modalSecretLabel: 'API Key / Secret Token',
        modalCancel: 'Cancel',
        modalSave: 'Save & Load Models',
        modalSyncTitle: '⚡ Import Keys from 9router & OmniRoute',
        modalSyncDesc: 'Automatically discovered API keys stored locally on this machine. Select the keys you wish to import into FreeRoute:',
        syncConfirm: 'Sync Selected Keys',
        statusHealthy: 'Healthy',
        statusCooldown: 'Cooldown',
        statusError: 'Error',
        statusUnconfigured: 'Not Configured'
      }
    };

    function t(key, arg) {
      const dict = I18N[currentLang] || I18N.vi;
      const val = dict[key];
      if (typeof val === 'function') return val(arg);
      return val || key;
    }

    // App Initialization
    document.addEventListener('DOMContentLoaded', async () => {
      applyLanguage();
      await fetchPresets();
      await fetchImportSources();
      await refreshAllData();
      setInterval(refreshMonitoring, 10000);
    });

    function toggleLanguage() {
      currentLang = currentLang === 'vi' ? 'en' : 'vi';
      localStorage.setItem('freeroute_lang', currentLang);
      applyLanguage();
      renderPresets();
      renderModels();
      renderCombos();
      renderHealthMatrix();
      renderEvents();
      renderCredentials();
    }

    function applyLanguage() {
      document.getElementById('lang-btn').textContent = t('langBtn');
      document.getElementById('hdr-subtitle').textContent = t('subtitle');
      document.getElementById('hdr-refresh-btn').textContent = t('refresh');
      document.getElementById('hdr-add-key-btn').textContent = t('addKey');
      document.getElementById('hdr-sync-btn').textContent = t('syncKey');

      document.getElementById('kpi-lbl-providers').textContent = t('kpiProviders');
      document.getElementById('kpi-lbl-models-free').textContent = t('kpiModelsFree');
      document.getElementById('kpi-lbl-models-paid').textContent = t('kpiModelsPaid');
      document.getElementById('kpi-lbl-requests').textContent = t('kpiRequests');
      document.getElementById('kpi-lbl-fallbacks').textContent = t('kpiFallbacks');

      document.getElementById('tab-btn-monitor').textContent = t('tabMonitor');
      document.getElementById('tab-btn-directory').textContent = t('tabDirectory');
      document.getElementById('tab-btn-models').textContent = t('tabModels');
      document.getElementById('tab-btn-combos').textContent = t('tabCombos');
      document.getElementById('tab-btn-credentials').textContent = t('tabCredentials');
      document.getElementById('tab-btn-playground').textContent = t('tabPlayground');
      document.getElementById('tab-btn-guide').textContent = t('tabGuide');

      document.getElementById('title-health-matrix').textContent = t('healthTitle');
      document.getElementById('lbl-live-polling').textContent = t('healthAutoPoll');
      document.getElementById('title-recent-stream').textContent = t('recentStreamTitle');

      document.getElementById('th-ev-time').textContent = t('thTime');
      document.getElementById('th-ev-reqid').textContent = t('thReqId');
      document.getElementById('th-ev-target').textContent = t('thTarget');
      document.getElementById('th-ev-served').textContent = t('thServed');
      document.getElementById('th-ev-fallbacks').textContent = t('thFallbacks');
      document.getElementById('th-ev-latency').textContent = t('thLatency');
      document.getElementById('th-ev-status').textContent = t('thStatus');

      document.getElementById('search-presets').placeholder = t('searchProviders');
      document.getElementById('search-models').placeholder = t('searchModels');
      document.getElementById('lbl-free-only').textContent = t('lblFreeOnly');

      document.getElementById('th-model-id').innerHTML = t('thModelId') + ' ' + (modelSortField === 'modelId' ? (modelSortAsc ? '▲' : '▼') : '⇕');
      document.getElementById('th-model-provider').innerHTML = t('thProvider') + ' ' + (modelSortField === 'providerId' ? (modelSortAsc ? '▲' : '▼') : '⇕');
      document.getElementById('th-model-tier').innerHTML = t('thTier') + ' ' + (modelSortField === 'isTrueFree' ? (modelSortAsc ? '▲' : '▼') : '⇕');
      document.getElementById('th-model-priority').innerHTML = t('thPriority') + ' ' + (modelSortField === 'priority' ? (modelSortAsc ? '▲' : '▼') : '⇕');
      document.getElementById('th-model-caps').textContent = t('thCaps');
      document.getElementById('th-model-pref').textContent = t('thPref');

      document.getElementById('title-combos').textContent = t('titleCombos');
      document.getElementById('desc-combos').textContent = t('descCombos');
      document.getElementById('btn-create-combo').textContent = t('btnCreateCombo');

      document.getElementById('title-keys-heading').textContent = t('keysTitle');
      document.getElementById('btn-sync-local').textContent = t('syncKey');
      document.getElementById('btn-add-key-sub').textContent = t('addKey');
      document.getElementById('th-k-updated').textContent = t('thUpdated');
      document.getElementById('th-k-action').textContent = t('thAction');

      document.getElementById('title-play').textContent = t('playTitle');
      document.getElementById('btn-play-send').textContent = t('playSend');

      document.getElementById('modal-add-title').textContent = t('modalAddTitle');
      document.getElementById('lbl-modal-prov').textContent = t('modalProvLabel');
      document.getElementById('lbl-modal-secret').textContent = t('modalSecretLabel');
      document.getElementById('btn-modal-cancel').textContent = t('modalCancel');
      document.getElementById('btn-modal-save').textContent = t('modalSave');

      document.getElementById('modal-sync-title').textContent = t('modalSyncTitle');
      document.getElementById('modal-sync-desc').textContent = t('modalSyncDesc');
      document.getElementById('btn-sync-cancel').textContent = t('modalCancel');
      document.getElementById('btn-sync-confirm').textContent = t('syncConfirm');
      document.getElementById('sync-quick-btn').textContent = t('syncAllNow');
      document.getElementById('sync-review-btn').textContent = t('syncReview');
    }

    function switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      document.getElementById('tab-btn-' + tabId).classList.add('active');
      document.getElementById('pane-' + tabId).classList.add('active');
    }

    // Data Fetching
    async function triggerRefresh() {
      showToast(currentLang === 'vi' ? 'Đang làm mới dữ liệu...' : 'Refreshing data...');
      await refreshAllData();
      showToast(currentLang === 'vi' ? 'Làm mới thành công!' : 'Refresh completed!');
    }

    async function refreshAllData() {
      await Promise.all([
        fetchCredentials(),
        fetchModels(),
        fetchCombos(),
        fetchHealthAndEvents(),
      ]);
      updateKpis();
      renderPresets();
      renderModels();
      renderCombos();
      renderHealthMatrix();
      renderEvents();
      renderCredentials();
    }

    async function refreshMonitoring() {
      await fetchHealthAndEvents();
      renderHealthMatrix();
      renderEvents();
      updateKpis();
    }

    async function fetchPresets() {
      try {
        const res = await fetch('/v1/providers/presets');
        if (res.ok) {
          const json = await res.json();
          presets = json.data || [];
          populateModalProviders();
          populateModelFilterProviders();
        }
      } catch (err) {
        console.error('Failed to load presets:', err);
      }
    }

    async function fetchCombos() {
      try {
        const res = await fetch('/v1/combos');
        if (res.ok) {
          const json = await res.json();
          combos = json.data || [];
          populatePlaygroundCombos();
        }
      } catch (err) {
        console.error('Failed to load combos:', err);
      }
    }

    async function fetchImportSources() {
      try {
        const res = await fetch('/v1/import/sources');
        if (res.ok) {
          const json = await res.json();
          detectedSources = json.data || [];
          if (detectedSources.length > 0) {
            document.getElementById('sync-banner').style.display = 'flex';
            document.getElementById('hdr-sync-btn').style.display = 'inline-flex';
            document.getElementById('sync-banner-msg').textContent = t('syncBanner', detectedSources.length);
          }
        }
      } catch (err) {
        console.error('Failed to detect sources:', err);
      }
    }

    async function fetchCredentials() {
      try {
        const res = await fetch('/v1/credentials');
        if (res.ok) {
          const json = await res.json();
          credentials = json.data || [];
        }
      } catch (err) {
        console.error('Failed to load credentials:', err);
      }
    }

    async function fetchModels() {
      try {
        const res = await fetch('/v1/models');
        if (res.ok) {
          const json = await res.json();
          models = (json.data || []).map(m => {
            const parts = m.id.split('/');
            const item = {
              id: m.id,
              providerId: m.owned_by || parts[0],
              modelId: parts.slice(1).join('/') || m.id,
              capabilities: m.freeroute?.capabilities || [],
              freeTier: m.freeroute?.free_tier || 'paid',
              priority: m.priority || 50,
              isTrueFree: false
            };
            item.isTrueFree = isTrueFreeModel(item);
            return item;
          });
          populateComboAddSelect();
        }
      } catch (err) {
        console.error('Failed to load models:', err);
      }
    }

    async function fetchHealthAndEvents() {
      try {
        const [hRes, eRes] = await Promise.all([
          fetch('/v1/provider-health'),
          fetch('/v1/routing-events')
        ]);
        if (hRes.ok) {
          const hJson = await hRes.json();
          healthData = hJson.data || [];
        }
        if (eRes.ok) {
          const eJson = await eRes.json();
          eventsData = eJson.data || [];
        }
      } catch (err) {
        console.error('Failed to fetch health/events:', err);
      }
    }

    function updateKpis() {
      const activeProviders = new Set(credentials.map(c => c.providerId)).size;
      document.getElementById('kpi-providers').textContent = activeProviders;
      
      const freeModelsCount = models.filter(m => m.isTrueFree).length;
      const paidModelsCount = models.length - freeModelsCount;
      document.getElementById('kpi-models-free').textContent = freeModelsCount;
      document.getElementById('kpi-models-paid').textContent = paidModelsCount;

      document.getElementById('kpi-requests').textContent = eventsData.length;
      const fallbacks = eventsData.filter(e => (e.fallbackCount || e.fallbacks || 0) > 0).length;
      document.getElementById('kpi-fallbacks').textContent = fallbacks;
    }

    // TAB 1: RENDER HEALTH & EVENTS
    function renderHealthMatrix() {
      const container = document.getElementById('health-matrix-container');
      const configuredMap = new Map();
      for (const c of credentials) configuredMap.set(c.providerId, true);

      const allProviderIds = [...new Set([...presets.map(p => p.id), ...credentials.map(c => c.providerId)])];
      const healthMap = new Map();
      for (const h of healthData) healthMap.set(h.providerId, h);

      let html = '';
      for (const pid of allProviderIds) {
        const preset = presets.find(p => p.id === pid);
        const name = preset ? preset.name : pid;
        const isConfigured = configuredMap.has(pid);
        const stat = healthMap.get(pid);

        let dotClass = 'dot-gray';
        let statusText = t('statusUnconfigured');
        let successRate = 0;
        let latencyP50 = stat ? stat.p50LatencyMs || 0 : 0;
        let reqCount = stat ? stat.requestCount || 0 : 0;

        if (isConfigured) {
          if (!stat || stat.requestCount === 0) {
            dotClass = 'dot-green';
            statusText = t('statusHealthy');
            successRate = 100;
          } else if (stat.successRate >= 0.9) {
            dotClass = 'dot-green';
            statusText = t('statusHealthy');
            successRate = Math.round(stat.successRate * 100);
          } else if (stat.successRate >= 0.5) {
            dotClass = 'dot-yellow';
            statusText = t('statusCooldown');
            successRate = Math.round(stat.successRate * 100);
          } else {
            dotClass = 'dot-red';
            statusText = t('statusError');
            successRate = Math.round(stat.successRate * 100);
          }
        }

        html += \`
          <div class="health-item">
            <div class="health-head">
              <span class="health-name">
                <span class="status-dot \${dotClass}"></span>
                \${name}
              </span>
              <span class="badge \${isConfigured ? 'badge-green' : 'badge-gray'}">\${statusText}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: \${isConfigured ? successRate : 0}%;"></div>
            </div>
            <div class="health-metrics">
              <span>Success: \${isConfigured ? successRate + '%' : 'N/A'}</span>
              <span>P50: \${latencyP50 > 0 ? latencyP50 + 'ms' : '—'}</span>
              <span>Reqs: \${reqCount}</span>
            </div>
          </div>
        \`;
      }
      container.innerHTML = html;
    }

    function renderEvents() {
      const tbody = document.getElementById('events-tbody');
      if (!eventsData || eventsData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:20px;">' + t('noEvents') + '</td></tr>';
        return;
      }

      const recent = eventsData.slice(-20).reverse();
      let html = '';
      for (const ev of recent) {
        const timeStr = ev.occurredAt ? new Date(ev.occurredAt).toLocaleTimeString() : '—';
        const reqId = ev.requestId ? ev.requestId.slice(0, 8) + '...' : '—';
        const target = ev.requestedModel || 'auto:free';
        const served = (ev.providerId || '—') + ' / ' + (ev.modelId || '—');
        const fallbacks = ev.fallbackCount || ev.fallbacks || 0;
        const latency = ev.latencyMs ? ev.latencyMs + 'ms' : '—';
        const isOk = !ev.errorCode;

        html += \`
          <tr>
            <td style="color:var(--text-muted); font-family:var(--font-mono); font-size:12px;">\${timeStr}</td>
            <td style="font-family:var(--font-mono); font-size:11px; color:var(--text-dim);">\${reqId}</td>
            <td><code>\${target}</code></td>
            <td><strong>\${served}</strong></td>
            <td>
              \${fallbacks > 0 
                ? \`<span class="badge badge-yellow">⚠️ \${fallbacks} fallbacks</span>\` 
                : '<span class="badge badge-gray">Direct</span>'}
            </td>
            <td style="font-family:var(--font-mono);">\${latency}</td>
            <td>
              \${isOk 
                ? '<span class="badge badge-green">200 OK</span>' 
                : \`<span class="badge badge-red">\${ev.errorCode || 'Error'}</span>\`}
            </td>
          </tr>
        \`;
      }
      tbody.innerHTML = html;
    }

    // TAB 2: PROVIDER DIRECTORY
    function filterPresets(category) {
      activePresetFilter = category;
      document.getElementById('pill-all').classList.toggle('active', category === 'all');
      document.getElementById('pill-free').classList.toggle('active', category === 'free');
      document.getElementById('pill-comm').classList.toggle('active', category === 'commercial');
      renderPresets();
    }

    function handlePresetSearch() {
      renderPresets();
    }

    function renderPresets() {
      const container = document.getElementById('presets-container');
      const q = (document.getElementById('search-presets').value || '').toLowerCase().trim();
      const configuredMap = new Map();
      for (const c of credentials) configuredMap.set(c.providerId, true);

      let freeCount = 0;
      let commCount = 0;
      for (const p of presets) {
        if (p.category === 'commercial') commCount++;
        else freeCount++;
      }
      document.getElementById('cnt-all').textContent = presets.length;
      document.getElementById('cnt-free').textContent = freeCount;
      document.getElementById('cnt-comm').textContent = commCount;

      const filtered = presets.filter(p => {
        if (activePresetFilter === 'free' && p.category === 'commercial') return false;
        if (activePresetFilter === 'commercial' && p.category !== 'commercial') return false;
        if (q) {
          const matchName = p.name.toLowerCase().includes(q);
          const matchId = p.id.toLowerCase().includes(q);
          const matchDesc = (p.descriptionVi || '').toLowerCase().includes(q) || (p.descriptionEn || '').toLowerCase().includes(q);
          if (!matchName && !matchId && !matchDesc) return false;
        }
        return true;
      });

      filtered.sort((a, b) => {
        const aIsFree = a.category !== 'commercial';
        const bIsFree = b.category !== 'commercial';
        if (aIsFree && !bIsFree) return -1;
        if (!aIsFree && bIsFree) return 1;
        return a.name.localeCompare(b.name);
      });

      let html = '';
      for (const p of filtered) {
        const isConfigured = configuredMap.has(p.id);
        const desc = currentLang === 'vi' ? p.descriptionVi : p.descriptionEn;
        const isComm = p.category === 'commercial';
        const catBadge = isComm 
          ? '<span class="badge badge-purple">💎 Commercial</span>'
          : (p.category === 'local' ? '<span class="badge badge-blue">🏠 Local</span>' : '<span class="badge badge-green">🎁 Free Tier</span>');

        html += \`
          <div class="preset-card">
            <div>
              <div class="preset-header">
                <div>
                  <div class="preset-name">\${p.name}</div>
                  <div style="font-size:11px; color:var(--text-dim); font-family:var(--font-mono);">\${p.id}</div>
                </div>
                <div>\${catBadge}</div>
              </div>
              <div class="preset-desc">\${desc}</div>
              <div class="preset-models">
                \${(p.seedModels || []).slice(0, 3).map(m => \`<span class="badge badge-gray">\${m.modelId}</span>\`).join('')}
                \${(p.seedModels || []).length > 3 ? \`<span class="badge badge-gray">+\${p.seedModels.length - 3}</span>\` : ''}
              </div>
            </div>
            <div class="preset-actions">
              \${p.apiKeyUrl ? \`<a href="\${p.apiKeyUrl}" target="_blank" class="btn btn-sm">\${t('getKeyLink')}</a>\` : ''}
              <button class="btn btn-sm \${isConfigured ? 'btn-outline' : 'btn-primary'}" onclick="openAddKeyModal('\${p.id}')">
                \${isConfigured ? '✓ ' + t('connectedBadge') : '➕ ' + t('connectBtn')}
              </button>
            </div>
          </div>
        \`;
      }
      container.innerHTML = html;
    }

    // TAB 3: MODEL CATALOG (TRUE FREE VS PAID + SORT)
    function populateModelFilterProviders() {
      const sel = document.getElementById('model-filter-provider');
      const uniqueProviders = [...new Set(presets.map(p => p.id))].sort();
      let html = '<option value="all">' + t('allProvidersOpt') + '</option>';
      for (const pid of uniqueProviders) {
        const p = presets.find(x => x.id === pid);
        html += \`<option value="\${pid}">\${p ? p.name : pid}</option>\`;
      }
      sel.innerHTML = html;
    }

    function sortModels(field) {
      if (modelSortField === field) {
        modelSortAsc = !modelSortAsc;
      } else {
        modelSortField = field;
        modelSortAsc = true;
      }
      applyLanguage();
      renderModels();
    }

    function applyModelFilters() {
      renderModels();
    }

    function renderModels() {
      const tbody = document.getElementById('models-tbody');
      const freeOnly = document.getElementById('chk-free-only').checked;
      const pFilter = document.getElementById('model-filter-provider').value;
      const cFilter = document.getElementById('model-filter-cap').value;
      const q = (document.getElementById('search-models').value || '').toLowerCase().trim();

      let filtered = models.filter(m => {
        if (freeOnly && !m.isTrueFree) return false;
        if (pFilter !== 'all' && m.providerId !== pFilter) return false;
        if (cFilter !== 'all' && !m.capabilities.includes(cFilter)) return false;
        if (q) {
          const matchId = m.modelId.toLowerCase().includes(q);
          const matchProv = m.providerId.toLowerCase().includes(q);
          if (!matchId && !matchProv) return false;
        }
        return true;
      });

      // Sorting
      filtered.sort((a, b) => {
        let valA = a[modelSortField];
        let valB = b[modelSortField];
        if (typeof valA === 'boolean') {
          return modelSortAsc ? (valA === valB ? 0 : valA ? -1 : 1) : (valA === valB ? 0 : valA ? 1 : -1);
        }
        if (typeof valA === 'string') {
          return modelSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return modelSortAsc ? (valA - valB) : (valB - valA);
      });

      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px;">' + (currentLang === 'vi' ? 'Không tìm thấy model nào phù hợp.' : 'No matching models found.') + '</td></tr>';
        return;
      }

      let html = '';
      for (const m of filtered) {
        const costBadge = m.isTrueFree 
          ? '<span class="badge badge-green">🎁 100% Free</span>'
          : '<span class="badge badge-purple">💳 Pay-per-token</span>';

        html += \`
          <tr>
            <td><code>\${m.modelId}</code></td>
            <td><strong>\${m.providerId}</strong></td>
            <td>\${costBadge}</td>
            <td style="font-family:var(--font-mono);">\${m.priority}</td>
            <td>
              \${(m.capabilities || []).map(c => \`<span class="badge badge-gray">\${c}</span>\`).join(' ')}
            </td>
            <td>
              <span class="badge badge-blue">Auto</span>
            </td>
          </tr>
        \`;
      }
      tbody.innerHTML = html;
    }

    // TAB 4: CUSTOM COMBOS
    function renderCombos() {
      const container = document.getElementById('combos-container');
      if (combos.length === 0) {
        container.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:var(--text-muted); padding:30px;">' + (currentLang === 'vi' ? 'Chưa có combo nào. Hãy bấm Tạo Combo Mới!' : 'No combos configured. Click Create Combo!') + '</div>';
        return;
      }

      let html = '';
      for (const cb of combos) {
        const chainHtml = (cb.models || []).map((m, idx) => \`
          <div class="chain-step">
            <span style="color:var(--text-muted); font-size:11px;">#\${idx + 1}</span>
            <span>\${m}</span>
          </div>
        \`).join('<div class="chain-arrow">↓ fallback</div>');

        html += \`
          <div class="combo-card">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                  <h3 style="font-size:16px; font-weight:600; color:var(--accent);">\${cb.name}</h3>
                  <code style="font-size:11px; color:var(--text-muted);">combo:\${cb.comboId}</code>
                </div>
                <button class="btn btn-danger btn-sm" onclick="deleteCombo('\${cb.comboId}')">✕</button>
              </div>
              <div style="font-size:12px; color:var(--text-muted); margin-top:6px;">\${cb.description || ''}</div>
              <div class="combo-chain">
                \${chainHtml}
              </div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; border-top:1px solid var(--card-border); padding-top:10px;">
              <button class="btn btn-sm btn-primary" onclick="testCombo('\${cb.comboId}')">🧪 Test Combo</button>
            </div>
          </div>
        \`;
      }
      container.innerHTML = html;
    }

    function populatePlaygroundCombos() {
      const grp = document.getElementById('play-combos-group');
      let html = '';
      for (const cb of combos) {
        html += \`<option value="combo:\${cb.comboId}">combo:\${cb.comboId} (\${cb.name})</option>\`;
      }
      grp.innerHTML = html;
    }

    function testCombo(comboId) {
      switchTab('playground');
      document.getElementById('play-model-select').value = 'combo:' + comboId;
    }

    function populateComboAddSelect() {
      const sel = document.getElementById('combo-add-model-select');
      if (!sel) return;
      let html = '';
      // Group: True Free models first
      const freeMods = models.filter(m => m.isTrueFree);
      const paidMods = models.filter(m => !m.isTrueFree);

      html += '<optgroup label="🎁 Model 100% Miễn Phí">';
      for (const m of freeMods) {
        html += \`<option value="\${m.providerId}/\${m.modelId}">\${m.providerId}/\${m.modelId}</option>\`;
      }
      html += '</optgroup>';

      if (paidMods.length > 0) {
        html += '<optgroup label="💳 Model Thương Mại (Paid)">';
        for (const m of paidMods.slice(0, 50)) {
          html += \`<option value="\${m.providerId}/\${m.modelId}">\${m.providerId}/\${m.modelId}</option>\`;
        }
        html += '</optgroup>';
      }
      sel.innerHTML = html;
    }

    function openCreateComboModal() {
      document.getElementById('modal-create-combo').classList.add('active');
      document.getElementById('combo-input-id').value = '';
      document.getElementById('combo-input-name').value = '';
      document.getElementById('combo-input-desc').value = '';
      tempComboChain = [];
      renderTempComboChain();
      populateComboAddSelect();
    }

    function closeCreateComboModal() {
      document.getElementById('modal-create-combo').classList.remove('active');
    }

    function addModelToComboChain() {
      const sel = document.getElementById('combo-add-model-select');
      const val = sel.value;
      if (!val) return;
      if (!tempComboChain.includes(val)) {
        tempComboChain.push(val);
        renderTempComboChain();
      }
    }

    function removeModelFromComboChain(idx) {
      tempComboChain.splice(idx, 1);
      renderTempComboChain();
    }

    function renderTempComboChain() {
      const box = document.getElementById('combo-chain-list');
      if (tempComboChain.length === 0) {
        box.innerHTML = '<div style="color:var(--text-muted); font-size:12px; padding:6px;">Chưa chọn model nào. Hãy chọn model và bấm Thêm!</div>';
        return;
      }
      let html = '';
      for (let i = 0; i < tempComboChain.length; i++) {
        html += \`
          <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
            <span style="font-family:var(--font-mono); font-size:12px;">\${i + 1}. \${tempComboChain[i]}</span>
            <button class="btn btn-danger btn-sm" style="padding:1px 6px;" onclick="removeModelFromComboChain(\${i})">✕</button>
          </div>
        \`;
      }
      box.innerHTML = html;
    }

    async function submitCreateCombo() {
      const comboId = document.getElementById('combo-input-id').value.trim();
      const name = document.getElementById('combo-input-name').value.trim();
      const description = document.getElementById('combo-input-desc').value.trim();

      if (!comboId || !name) {
        alert(currentLang === 'vi' ? 'Vui lòng nhập ID và Tên Combo!' : 'Please enter Combo ID and Name!');
        return;
      }
      if (tempComboChain.length === 0) {
        alert(currentLang === 'vi' ? 'Vui lòng thêm ít nhất 1 model vào chuỗi!' : 'Please add at least 1 model to the chain!');
        return;
      }

      try {
        const res = await fetch('/v1/combos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            comboId,
            name,
            description,
            models: tempComboChain
          })
        });

        if (res.ok) {
          closeCreateComboModal();
          showToast(currentLang === 'vi' ? 'Tạo combo thành công!' : 'Combo created successfully!');
          await fetchCombos();
          renderCombos();
        } else {
          const err = await res.json();
          showToast(err.error?.message || 'Failed to save combo', true);
        }
      } catch (err) {
        showToast(err.message, true);
      }
    }

    async function deleteCombo(comboId) {
      if (!confirm(currentLang === 'vi' ? 'Bạn có chắc chắn muốn xóa combo này?' : 'Delete this combo?')) return;
      try {
        const res = await fetch(\`/v1/combos?comboId=\${encodeURIComponent(comboId)}\`, {
          method: 'DELETE'
        });
        if (res.ok) {
          showToast(currentLang === 'vi' ? 'Đã xóa combo!' : 'Combo deleted!');
          await fetchCombos();
          renderCombos();
        }
      } catch (err) {
        showToast(err.message, true);
      }
    }

    // TAB 5: KEY MANAGEMENT & 1-CLICK SYNC
    function renderCredentials() {
      const tbody = document.getElementById('creds-tbody');
      if (credentials.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:20px;">' + (currentLang === 'vi' ? 'Chưa có API key nào được cấu hình.' : 'No API keys configured yet.') + '</td></tr>';
        return;
      }

      let html = '';
      for (const c of credentials) {
        const p = presets.find(x => x.id === c.providerId);
        const name = p ? p.name : c.providerId;
        const updatedStr = c.updatedAt ? new Date(c.updatedAt).toLocaleDateString() : '—';

        html += \`
          <tr>
            <td>
              <div style="font-weight:600;">\${name}</div>
              <div style="font-size:11px; color:var(--text-dim); font-family:var(--font-mono);">\${c.providerId}</div>
            </td>
            <td style="font-family:var(--font-mono); color:var(--text-muted);">\${c.credentialId || 'default'}</td>
            <td style="color:var(--text-muted);">\${updatedStr}</td>
            <td style="text-align:right;">
              <button class="btn btn-danger btn-sm" onclick="deleteKey('\${c.providerId}', '\${c.credentialId}')">\${t('deleteBtn')}</button>
            </td>
          </tr>
        \`;
      }
      tbody.innerHTML = html;
    }

    async function deleteKey(providerId, credentialId) {
      if (!confirm(currentLang === 'vi' ? 'Bạn có chắc chắn muốn xóa key này?' : 'Are you sure you want to delete this key?')) return;
      try {
        const res = await fetch(\`/v1/credentials?providerId=\${encodeURIComponent(providerId)}&credentialId=\${encodeURIComponent(credentialId)}\`, {
          method: 'DELETE'
        });
        if (res.ok) {
          showToast(currentLang === 'vi' ? 'Đã xóa key!' : 'Key deleted!');
          await refreshAllData();
        } else {
          showToast('Failed to delete key', true);
        }
      } catch (err) {
        showToast(err.message, true);
      }
    }

    // MODAL: ADD KEY
    function populateModalProviders() {
      const sel = document.getElementById('modal-prov-select');
      let html = '';
      for (const p of presets) {
        html += \`<option value="\${p.id}">\${p.name} (\${p.category === 'commercial' ? 'Commercial' : 'Free'})</option>\`;
      }
      sel.innerHTML = html;
      onModalProviderChange();
    }

    function openAddKeyModal(preselectedProviderId) {
      document.getElementById('modal-add-key').classList.add('active');
      if (preselectedProviderId) {
        document.getElementById('modal-prov-select').value = preselectedProviderId;
      }
      onModalProviderChange();
      document.getElementById('modal-secret').value = '';
      document.getElementById('modal-secret').focus();
    }

    function closeAddKeyModal() {
      document.getElementById('modal-add-key').classList.remove('active');
    }

    function onModalProviderChange() {
      const pid = document.getElementById('modal-prov-select').value;
      const p = presets.find(x => x.id === pid);
      const hint = document.getElementById('modal-prov-hint');
      if (p) {
        const inst = currentLang === 'vi' ? p.keyInstructionsVi : p.keyInstructionsEn;
        hint.innerHTML = inst + (p.apiKeyUrl ? \` <a href="\${p.apiKeyUrl}" target="_blank" style="color:var(--accent); text-decoration:underline;">\${t('getKeyLink')}</a>\` : '');
      } else {
        hint.innerHTML = '';
      }
    }

    async function submitAddKey() {
      const providerId = document.getElementById('modal-prov-select').value;
      const secret = document.getElementById('modal-secret').value.trim();
      if (!secret) {
        alert(currentLang === 'vi' ? 'Vui lòng nhập API key!' : 'Please enter API key!');
        return;
      }

      try {
        const res = await fetch('/v1/credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerId, secret })
        });
        if (res.ok) {
          closeAddKeyModal();
          showToast(currentLang === 'vi' ? 'Đã lưu key & nạp model thành công!' : 'Key saved & models loaded!');
          await refreshAllData();
        } else {
          const err = await res.json();
          showToast(err.error?.message || 'Error saving key', true);
        }
      } catch (err) {
        showToast(err.message, true);
      }
    }

    // MODAL: 1-CLICK SYNC FROM 9ROUTER & OMNIROUTE
    function openSyncModal() {
      document.getElementById('modal-sync').classList.add('active');
      renderSyncSources();
    }

    function closeSyncModal() {
      document.getElementById('modal-sync').classList.remove('active');
    }

    function renderSyncSources() {
      const tbody = document.getElementById('sync-sources-tbody');
      if (detectedSources.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:16px;">' + (currentLang === 'vi' ? 'Không tìm thấy key nào.' : 'No sources found.') + '</td></tr>';
        return;
      }
      let html = '';
      for (let i = 0; i < detectedSources.length; i++) {
        const s = detectedSources[i];
        html += \`
          <tr>
            <td><input type="checkbox" class="sync-chk" value="\${s.providerId}" checked></td>
            <td><strong>\${s.name || s.providerId}</strong></td>
            <td><span class="badge \${s.source === 'omniroute' ? 'badge-blue' : 'badge-purple'}">\${s.source}</span></td>
            <td><code>\${s.maskedKey}</code></td>
          </tr>
        \`;
      }
      tbody.innerHTML = html;
    }

    function toggleSelectAllSync(master) {
      document.querySelectorAll('.sync-chk').forEach(c => c.checked = master.checked);
    }

    async function quickSyncAll() {
      showToast(currentLang === 'vi' ? 'Đang đồng bộ tất cả key...' : 'Syncing all keys...');
      try {
        const res = await fetch('/v1/import/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ syncAll: true })
        });
        if (res.ok) {
          const data = await res.json();
          showToast(currentLang === 'vi' ? \`Đã đồng bộ thành công \${data.count} keys!\` : \`Successfully synced \${data.count} keys!\`);
          await refreshAllData();
        } else {
          showToast('Sync failed', true);
        }
      } catch (err) {
        showToast(err.message, true);
      }
    }

    async function executeSyncSelected() {
      const selected = [];
      document.querySelectorAll('.sync-chk:checked').forEach(c => selected.push(c.value));
      if (selected.length === 0) {
        alert(currentLang === 'vi' ? 'Vui lòng chọn ít nhất một key!' : 'Please select at least one key!');
        return;
      }

      showToast(currentLang === 'vi' ? 'Đang đồng bộ...' : 'Syncing...');
      try {
        const res = await fetch('/v1/import/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerIds: selected })
        });
        if (res.ok) {
          const data = await res.json();
          closeSyncModal();
          showToast(currentLang === 'vi' ? \`Đã đồng bộ thành công \${data.count} keys!\` : \`Successfully synced \${data.count} keys!\`);
          await refreshAllData();
        } else {
          showToast('Sync failed', true);
        }
      } catch (err) {
        showToast(err.message, true);
      }
    }

    // TAB 6: TEST PLAYGROUND
    async function sendTestChat() {
      const model = document.getElementById('play-model-select').value;
      const prompt = document.getElementById('play-prompt').value.trim();
      const temp = parseFloat(document.getElementById('play-temp').value) || 0.7;
      const output = document.getElementById('play-output');
      if (!prompt) return;

      output.textContent = currentLang === 'vi' ? 'Đang kết nối và định tuyến request...' : 'Routing request...';

      try {
        const res = await fetch('/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            temperature: temp,
            stream: true,
            messages: [{ role: 'user', content: prompt }]
          })
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          output.textContent = 'Error ' + res.status + ': ' + (errJson.error?.message || res.statusText);
          return;
        }

        output.textContent = '';
        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\\n');
          buffer = lines.pop();

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;
            const dataStr = trimmed.replace(/^data:\s*/, '');
            if (dataStr === '[DONE]') break;
            try {
              const parsed = JSON.parse(dataStr);
              const delta = parsed.choices?.[0]?.delta?.content || '';
              output.textContent += delta;
            } catch (e) {}
          }
        }
        await refreshMonitoring();
      } catch (err) {
        output.textContent = 'Request failed: ' + err.message;
      }
    }

    // Toast Utility
    function showToast(msg, isError = false) {
      const el = document.getElementById('toast');
      el.textContent = msg;
      el.style.borderColor = isError ? 'var(--danger)' : 'var(--border-focus)';
      el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), 3500);
    }
  </script>
</body>
</html>`;
}
