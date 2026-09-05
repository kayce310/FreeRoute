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

    /* Combos Grid & Cards */
    .combos-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
      gap: 14px;
    }
    .combo-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 10px;
      transition: all 0.2s;
      cursor: default;
      min-height: 180px;
    }
    .combo-card:hover {
      border-color: var(--border-focus);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
    }
    .combo-card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
    }
    .combo-card-meta {
      flex: 1;
      min-width: 0;
    }
    .combo-card-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.3;
    }
    .combo-card-id {
      display: inline-block;
      font-size: 11px;
      color: var(--accent);
      font-family: var(--font-mono);
      background: rgba(99, 102, 241, 0.08);
      border: 1px solid rgba(99, 102, 241, 0.18);
      border-radius: 4px;
      padding: 1px 6px;
      margin-top: 4px;
      font-weight: 500;
    }
    .combo-card-desc {
      font-size: 11px;
      color: var(--text-muted);
      line-height: 1.4;
      min-height: 32px;
      max-height: 32px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      margin-top: 2px;
    }
    .combo-badge-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      padding-top: 2px;
    }
    .combo-model-badge {
      background: var(--bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 2px 8px;
      font-size: 11px;
      color: var(--text-muted);
      font-family: var(--font-mono);
      cursor: pointer;
      transition: all 0.15s;
      user-select: none;
    }
    .combo-model-badge:hover {
      border-color: var(--accent);
      color: var(--accent);
    }
    .combo-expand-toggle {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 500;
      color: var(--text-muted);
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--card-border);
      cursor: pointer;
      padding: 2px 8px;
      border-radius: 4px;
      transition: all 0.15s;
    }
    .combo-expand-toggle:hover {
      color: var(--accent);
      border-color: var(--accent);
      background: rgba(99, 102, 241, 0.08);
    }
    .combo-expand-toggle .toggle-icon {
      font-size: 9px;
      transition: transform 0.2s;
    }
    .combo-expand-toggle.open .toggle-icon { transform: rotate(180deg); }
    .combo-chain-collapse {
      display: none;
      background: var(--bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-sm);
      padding: 8px 10px;
      font-family: var(--font-mono);
      font-size: 11px;
      line-height: 1.6;
      max-height: 180px;
      overflow-y: auto;
      margin-top: 4px;
    }
    .combo-chain-collapse.open { display: block; }
    .chain-step {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 2px 0;
    }
    .chain-arrow {
      color: var(--accent);
      font-size: 10px;
      padding-left: 4px;
      opacity: 0.7;
    }
    .combo-card-actions {
      display: flex;
      gap: 6px;
      border-top: 1px solid var(--card-border);
      padding-top: 10px;
      margin-top: auto;
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

    /* Fixed-height auto-scrolling Routing Stream Box */
    .stream-scroll-box {
      max-height: 380px;
      overflow-y: auto;
      scroll-behavior: smooth;
      border: 1px solid var(--card-border);
      border-radius: var(--radius-sm);
      background: rgba(9, 13, 22, 0.6);
      position: relative;
    }
    .stream-scroll-box thead th {
      position: sticky;
      top: 0;
      background: #111827;
      z-index: 5;
      box-shadow: 0 1px 0 var(--card-border);
    }
    @keyframes streamPulse {
      0% { background: rgba(99, 102, 241, 0.25); }
      100% { background: transparent; }
    }
    .newest-stream-row {
      animation: streamPulse 2s ease-out;
    }

    /* Dedicated Vertical Streaming Console Layout */
    .play-layout {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .play-response-card {
      background: #090d16;
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.4);
    }
    .play-response-header {
      background: rgba(255, 255, 255, 0.03);
      border-bottom: 1px solid var(--card-border);
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .play-response-body {
      padding: 18px 20px;
      font-family: var(--font-mono);
      font-size: 13px;
      line-height: 1.7;
      color: #e2e8f0;
      min-height: 280px;
      max-height: 520px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-word;
      scroll-behavior: smooth;
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

    /* 9router Style Combo Modal */
    .combo-modal-wrap {
      max-width: 900px !important;
      width: 95vw !important;
      max-height: 92vh !important;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .combo-modal-body {
      overflow-y: auto;
      overflow-x: hidden;
      flex: 1;
      min-height: 0;
      padding-right: 4px;
    }
    .combo-quick-templates {
      display: flex;
      gap: 8px;
      align-items: center;
      background: rgba(56, 189, 248, 0.05);
      border: 1px solid rgba(56, 189, 248, 0.2);
      padding: 8px 12px;
      border-radius: 8px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
    .combo-modal-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 14px;
      min-height: 0;
      flex: 1;
    }
    .combo-modal-grid > div {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
    }
    .combo-pill-btn {
      border: 1px solid var(--card-border);
      background: var(--card-bg);
      color: var(--text-dim);
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }
    .combo-pill-btn:hover {
      border-color: var(--accent);
      color: var(--text-primary);
    }
    .combo-pill-btn.active {
      background: var(--accent);
      color: #050b14;
      font-weight: 600;
      border-color: var(--accent);
    }
    .combo-picker-box {
      border: 1px solid var(--card-border);
      border-radius: 8px;
      flex: 1;
      min-height: 200px;
      max-height: calc(55vh - 180px);
      overflow-y: auto;
      overflow-x: hidden;
      padding: 6px;
      background: rgba(0, 0, 0, 0.25);
    }
    .combo-picker-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 10px;
      border-radius: 6px;
      margin-bottom: 4px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      transition: all 0.2s;
      min-width: 0;
    }
    .combo-picker-card:hover {
      border-color: var(--accent);
      transform: translateX(2px);
    }
    .chain-box {
      border: 1px solid var(--card-border);
      border-radius: 8px;
      flex: 1;
      min-height: 200px;
      max-height: calc(55vh - 180px);
      overflow-y: auto;
      overflow-x: hidden;
      padding: 6px;
      background: rgba(0, 0, 0, 0.25);
    }
    .chain-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 7px 10px;
      border-radius: 6px;
      margin-bottom: 5px;
      background: var(--card-bg);
      border: 1px solid rgba(255, 255, 255, 0.08);
      transition: all 0.15s;
      min-width: 0;
    }
    .chain-card:hover {
      border-color: var(--accent);
    }
    .chain-btn-move {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--card-border);
      border-radius: 4px;
      padding: 2px 7px;
      font-size: 10px;
      cursor: pointer;
      color: var(--text-primary);
      transition: all 0.15s;
    }
    .chain-btn-move:hover:not(:disabled) {
      background: var(--accent);
      color: #050b14;
    }
    @media (max-width: 768px) {
      .combo-modal-grid { grid-template-columns: 1fr; }
      .combo-picker-box, .chain-box { max-height: 250px; }
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
          <div id="kpi-keys-sub" style="font-size:11px; color:var(--text-muted); margin-top:4px;">0 khóa hoạt động</div>
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
      <div class="kpi-card">
        <div>
          <div class="kpi-label" id="kpi-lbl-tokens">Tổng Token Đã Dùng</div>
          <div class="kpi-value" id="kpi-tokens">—</div>
          <div id="kpi-tokens-sub" style="font-size:11px; color:var(--text-muted); margin-top:4px;">↑ prompt · ↓ completion</div>
        </div>
        <div class="kpi-icon">🪙</div>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="tabs-nav">
      <button class="tab-btn active" onclick="switchTab('monitor')" id="tab-btn-monitor">📡 Giám Sát Sức Khỏe</button>
      <button class="tab-btn" onclick="switchTab('directory')" id="tab-btn-directory">🌐 Danh Mục Provider</button>
      <button class="tab-btn" onclick="switchTab('models')" id="tab-btn-models">📚 Danh Sách Model</button>
      <button class="tab-btn" onclick="switchTab('combos')" id="tab-btn-combos">🔀 Chuỗi Fallback (Combos)</button>
      <button class="tab-btn" onclick="switchTab('credentials')" id="tab-btn-credentials">🔑 Quản Lý API Key</button>
      <button class="tab-btn" onclick="switchTab('playground')" id="tab-btn-playground">🧪 Test Playground</button>
      <button class="tab-btn" onclick="switchTab('guide')" id="tab-btn-guide">📖 Hướng Dẫn An Toàn</button>
    </div>

    <!-- TAB 1: MONITOR & HEALTH MATRIX -->
    <div class="tab-pane active" id="pane-monitor">
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <span id="title-recent-stream">Dòng Sự Kiện Định Tuyến Gần Đây (Routing Stream)</span>
            <span class="badge badge-gray" id="stream-count-badge" style="font-size:11px; margin-left:6px;">0 sự kiện</span>
          </div>
          <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" style="padding:3px 10px; font-size:11px;" onclick="scrollToLatestEvent()" id="btn-scroll-latest" title="Cuộn ngay tới sự kiện mới nhất trên timeline">
              🔽 <span id="lbl-scroll-latest">Mới nhất</span>
            </button>
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; color:var(--text-muted); font-size:12px; user-select:none;">
              <input type="checkbox" id="chk-stream-autoscroll" checked>
              <span id="lbl-stream-autoscroll">Tự động cuộn theo timeline</span>
            </label>
            <div style="font-size:12px; color:var(--text-muted);" id="lbl-live-polling">
              🟢 Tự động cập nhật mỗi 10s
            </div>
          </div>
        </div>
        <div class="stream-scroll-box" id="stream-scroll-container">
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
                <th id="th-ev-tokin" style="text-align:right;">Token In</th>
                <th id="th-ev-tokout" style="text-align:right;">Token Out</th>
              </tr>
            </thead>
            <tbody id="events-tbody">
              <tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:20px;" id="lbl-no-events">Chưa có sự kiện nào. Hãy gửi request qua cổng http://127.0.0.1:8787/v1!</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <span id="title-health-matrix">Lưới Sức Khỏe Nhà Cung Cấp (Provider Health Matrix)</span>
          </div>
        </div>
        <div class="health-matrix" id="health-matrix-container">
          <!-- Rendered dynamically -->
        </div>
      </div>

      <!-- Token Stats Card -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            🪙 <span id="title-token-stats">Thống Kê Token Tiêu Thụ</span>
            <span class="badge badge-gray" id="token-stats-count" style="font-size:11px; margin-left:6px;">0 provider</span>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th id="th-tok-provider">Nhà Cung Cấp</th>
                <th style="text-align:right" id="th-tok-count">Số Yêu Cầu</th>
                <th style="text-align:right" id="th-tok-prompt">Prompt Tokens</th>
                <th style="text-align:right" id="th-tok-completion">Completion Tokens</th>
                <th style="text-align:right" id="th-tok-total">Tổng Token (với biểu đồ)</th>
              </tr>
            </thead>
            <tbody id="token-stats-body">
              <tr><td colspan="5" style="text-align:center;color:var(--text-muted)">Chưa có dữ liệu token</td></tr>
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

    <!-- TAB 3: MODEL CATALOG (WITH SORTING & FILTERING & COMBOS) -->
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
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" onclick="exportKeysBackup()" id="btn-export-keys" title="Xuất file JSON sao lưu khóa API">📥 Xuất Backup JSON</button>
            <button class="btn btn-outline btn-sm" onclick="triggerImportBackup()" id="btn-import-keys" title="Nhập khóa API từ file JSON sao lưu">📤 Nhập từ JSON</button>
            <input type="file" id="backup-file-input" accept=".json" style="display:none;" onchange="handleBackupFileSelect(this)">
            <button class="btn btn-success btn-sm" onclick="openSyncModal()" id="btn-sync-local">⚡ Nhập Từ 9router & OmniRoute</button>
            <button class="btn btn-primary btn-sm" onclick="openAddKeyModal()" id="btn-add-key-sub">➕ Thêm Key Mới</button>
          </div>
        </div>
        <div class="alert-box alert-info" id="creds-sec-note" style="margin-bottom:16px;">
          <strong>🛡️ An Toàn Tuyệt Đối & Tách Biệt GitHub:</strong> Tất cả khóa API được mã hóa AES-256-GCM và lưu trữ độc lập trong file SQLite cục bộ (<code>data/freeroute.sqlite</code>). File này được cấu hình trong <code>.gitignore</code>, hoàn toàn tách biệt với mã nguồn và không bao giờ bị đẩy lên GitHub!
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
          <div>
            <div class="card-title" id="title-play">Thử Nghiệm Định Tuyến Prompt (Streaming Console)</div>
            <div style="font-size:12px; color:var(--text-muted); margin-top:3px;" id="desc-play">
              Kiểm tra trực tiếp tốc độ streaming và khả năng tự động Fallback khi model gặp sự cố.
            </div>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <span class="badge badge-blue" id="play-target-badge" style="font-family:var(--font-mono);">auto:code</span>
          </div>
        </div>

        <div class="play-layout">
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">
            <div class="form-group" style="margin-bottom:0;">
              <label id="lbl-play-model" style="font-weight:600;">Hồ Sơ / Model / Combo Mục Tiêu</label>
              <select class="form-control" id="play-model-select" onchange="onPlayModelChange()">
                <optgroup label="Hồ Sơ Tự Động (Auto Profiles)" id="optgrp-play-auto">
                  <option value="auto:free" id="opt-play-free">auto:free (Ưu tiên mô hình miễn phí)</option>
                  <option value="auto:fast" id="opt-play-fast">auto:fast (Tối ưu tốc độ cao Cerebras/Groq)</option>
                  <option value="auto:code" id="opt-play-code" selected>auto:code (Lập trình & Tools)</option>
                  <option value="auto:long-context" id="opt-play-long">auto:long-context (Ngữ cảnh dài Gemini 1M+)</option>
                </optgroup>
                <optgroup label="Custom Combos" id="play-combos-group">
                  <!-- Populated dynamically -->
                </optgroup>
              </select>
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label id="lbl-play-temp" style="font-weight:600;">Nhiệt Độ (Temperature): <span id="temp-val">0.7</span> <span id="temp-hint" style="font-size:11px; color:var(--accent); font-weight:normal;">(Cân bằng / Chat)</span></label>
              <input type="range" min="0" max="1" step="0.1" value="0.7" class="form-control" id="play-temp" oninput="updateTempDisplay(this.value)">
              <div id="temp-desc" style="font-size:11px; color:var(--text-muted); margin-top:5px; line-height:1.4;"></div>
            </div>
          </div>

          <div class="form-group" style="margin-bottom:0;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <label id="lbl-play-prompt" style="font-weight:600; margin-bottom:0;">Prompt Thử Nghiệm</label>
              <span id="lbl-play-shortcut" style="font-size:11px; color:var(--text-dim);">Nhấn <kbd style="background:var(--card-border); padding:2px 6px; border-radius:4px; font-family:var(--font-mono); color:var(--text);">Ctrl + Enter</kbd> để gửi</span>
            </div>
            <textarea class="form-control" id="play-prompt" rows="3" placeholder="Nhập câu hỏi tại đây..." style="font-family:var(--font); resize:vertical;">Giải thích ngắn gọn cơ chế Fallback của FreeRoute trong 2 câu.</textarea>
          </div>

          <div style="display:flex; gap:10px; align-items:center;">
            <button class="btn btn-primary" onclick="sendTestChat()" id="btn-play-send" style="padding:9px 20px;">🚀 Gửi Thử Nghiệm (Streaming)</button>
            <button class="btn btn-outline" onclick="clearPlayOutput()" id="btn-play-clear" style="padding:9px 16px;">🗑️ Xóa Màn Hình</button>
          </div>

          <!-- VERTICAL STREAMING CONSOLE -->
          <div class="play-response-card">
            <div class="play-response-header">
              <div style="display:flex; align-items:center; gap:10px;">
                <span id="play-stream-status" class="badge badge-gray">⚪ Chờ gửi prompt...</span>
                <span id="play-stream-latency" style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono);"></span>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <button class="btn btn-outline btn-sm" onclick="copyPlayResponse()" id="btn-play-copy">📋 Sao chép kết quả</button>
              </div>
            </div>
            <div class="play-response-body" id="play-output">Chờ gửi prompt... Nhấn "🚀 Gửi Thử Nghiệm" hoặc tổ hợp phím Ctrl + Enter để bắt đầu stream trực tiếp.</div>
          </div>
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
              <th id="th-sync-status">Trạng Thái</th>
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

  <!-- MODAL: CREATE / EDIT CUSTOM COMBO (9ROUTER STYLE) -->
  <div class="modal-overlay" id="modal-create-combo">
    <div class="modal combo-modal-wrap">
      <div class="modal-title">
        <span id="modal-combo-title">🔀 Quản Lý Chuỗi Fallback (Custom Combo)</span>
        <button class="btn btn-sm" onclick="closeCreateComboModal()">✕</button>
      </div>

      <div class="combo-modal-body">
        <!-- Quick Templates -->
        <div class="combo-quick-templates">
          <span style="font-size:11px; font-weight:600; color:var(--text-muted);" id="lbl-combo-templates">⚡ Mẫu gợi ý sẵn (1-Click):</span>
          <button type="button" class="btn btn-outline btn-sm" style="font-size:11px; padding:2px 8px;" onclick="applyComboTemplate('coding')" id="btn-tpl-coding">💻 Coding & Copilot IDE</button>
          <button type="button" class="btn btn-outline btn-sm" style="font-size:11px; padding:2px 8px;" onclick="applyComboTemplate('speed')" id="btn-tpl-speed">⚡ Siêu Tốc (Cerebras/Groq)</button>
          <button type="button" class="btn btn-outline btn-sm" style="font-size:11px; padding:2px 8px;" onclick="applyComboTemplate('chat')" id="btn-tpl-chat">💬 Hội Thoại Thông Minh</button>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:12px;">
          <div class="form-group" style="margin-bottom:0;">
            <label id="lbl-combo-id">Mã Combo ID (dùng làm model: "combo:xxx")</label>
            <input type="text" class="form-control" id="combo-input-id" placeholder="vd: my-coding-chain">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label id="lbl-combo-name">Tên Combo Hiển Thị</label>
            <input type="text" class="form-control" id="combo-input-name" placeholder="vd: Siêu Tốc & Lập Trình Dự Phòng">
          </div>
        </div>

        <div class="form-group" style="margin-bottom:12px;">
          <label id="lbl-combo-desc">Mô Tả</label>
          <input type="text" class="form-control" id="combo-input-desc" placeholder="vd: Chuỗi fallback ưu tiên cho VS Code Copilot và Cursor khi lập trình">
        </div>

        <div class="combo-modal-grid">
          <!-- CỘT TRÁI: TÌM KIẾM VÀ CHỌN MODEL -->
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span style="font-weight:600; font-size:12px;" id="lbl-picker-heading">📦 Danh Sách Model Có Sẵn</span>
              <span style="font-size:11px; color:var(--text-muted);" id="lbl-picker-count"></span>
            </div>
            <input type="text" class="form-control" id="combo-picker-search" placeholder="🔍 Tìm theo model hoặc provider..." oninput="filterComboPickerModels()" style="margin-bottom:6px; font-size:12px;">
            <div style="display:flex; gap:4px; margin-bottom:6px; flex-wrap:wrap;">
              <button type="button" class="combo-pill-btn active" id="cpill-all" onclick="setComboPickerFilter('all')">Tất cả</button>
              <button type="button" class="combo-pill-btn" id="cpill-combos" onclick="setComboPickerFilter('combos')">🔀 Combos</button>
              <button type="button" class="combo-pill-btn" id="cpill-free" onclick="setComboPickerFilter('free')">🎁 100% Free</button>
              <button type="button" class="combo-pill-btn" id="cpill-tools" onclick="setComboPickerFilter('tools')">🔧 Tools (IDE)</button>
              <button type="button" class="combo-pill-btn" id="cpill-vision" onclick="setComboPickerFilter('vision')">👁️ Vision</button>
            </div>
            <select class="form-control" id="combo-picker-prov-select" onchange="filterComboPickerModels()" style="margin-bottom:8px; font-size:11px; padding:4px 8px;">
              <option value="">-- Tất cả Nhà Cung Cấp (Providers) --</option>
            </select>
            <div class="combo-picker-box" id="combo-picker-list">
              <!-- Rendered dynamically -->
            </div>
          </div>

          <!-- CỘT PHẢI: CHUỖI FALLBACK THỨ TỰ ƯU TIÊN -->
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span style="font-weight:600; font-size:12px;" id="lbl-chain-heading">🔀 Chuỗi Fallback (Thứ Tự Ưu Tiên)</span>
              <button type="button" class="btn btn-outline btn-sm" style="font-size:10px; padding:1px 6px;" onclick="clearTempComboChain()" id="btn-chain-clear">Xóa hết</button>
            </div>
            <div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;" id="desc-chain-help">
              Model #1 sẽ được gọi trước. Nếu gặp lỗi/rate-limit, tự động chuyển sang #2, #3...
            </div>
            <div class="chain-box" id="combo-chain-list">
              <!-- Rendered dynamically -->
            </div>
            <div id="combo-tools-status" style="margin-top:8px; font-size:11px;"></div>
          </div>
        </div>
      </div>

      <div class="modal-actions" style="margin-top:16px;">
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
    let providerKeyCounts = {};
    let totalKeyCount = 0;
    let healthData = [];
    let eventsData = [];
    let detectedSources = [];
    let activePresetFilter = 'all';
    let modelSortField = 'priority';
    let modelSortAsc = false;
    let tempComboChain = [];
    let lastStreamEventId = null;

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
        syncBannerNew: (n) => 'Phát hiện ' + n + ' khóa API mới từ OmniRoute & 9router chưa được nhập vào FreeRoute!',
        syncBanner: (n) => 'Phát hiện ' + n + ' khóa API từ OmniRoute & 9router trên máy này.',
        syncAllNow: 'Đồng bộ tất cả ngay',
        syncReview: 'Xem chi tiết',
        syncStatusImported: '✅ Đã có',
        syncStatusNew: '✨ Mới',
        thSyncStatus: 'Trạng Thái',
        kpiProviders: 'Nhà Cung Cấp Đã Kết Nối',
        kpiProvidersSub: (n) => n + ' khóa đang hoạt động',
        kpiModelsFree: '🎁 Model 100% Miễn Phí',
        kpiModelsPaid: '💳 Model Thương Mại (Paid)',
        kpiRequests: 'Yêu Cầu Đã Xử Lý',
        kpiFallbacks: 'Chuyển Vùng Cứu Nguy',
        tabMonitor: '📡 Giám Sát Sức Khỏe',
        tabDirectory: '🌐 Danh Mục Provider',
        tabModels: '📚 Danh Sách Model',
                tabCombos: '🔀 Chuỗi Fallback (Combos)',
        playCombosOptgroup: 'Chuỗi Dự Phòng (Custom Combos)',
        playDesc: 'Kiểm tra trực tiếp tốc độ streaming và khả năng tự động Fallback khi model gặp sự cố.',
        playShortcutHint: 'Nhấn <kbd style="background:var(--card-border); padding:2px 6px; border-radius:4px; font-family:var(--font-mono); color:var(--text);">Ctrl + Enter</kbd> để gửi',
        playNothingToCopy: 'Chưa có nội dung để sao chép!',
        modalComboTitleCreate: '➕ Tạo Custom Routing Combo Mới',
        modalComboTitleEdit: (id) => '✏️ Sửa Chuỗi Fallback: ' + id,
        lblComboTemplates: '⚡ Mẫu gợi ý sẵn (1-Click):',
        tplCoding: '💻 Coding & Copilot IDE',
        tplSpeed: '⚡ Siêu Tốc (Cerebras/Groq)',
        tplChat: '💬 Hội Thoại Thông Minh',
        lblComboId: 'Mã Combo ID (dùng làm model: "combo:xxx")',
        comboIdPlaceholder: 'vd: my-coding-chain',
        lblComboName: 'Tên Combo Hiển Thị',
        comboNamePlaceholder: 'vd: Siêu Tốc & Lập Trình Dự Phòng',
        lblComboDesc: 'Mô Tả',
        comboDescPlaceholder: 'vd: Chuỗi fallback ưu tiên cho VS Code Copilot và Cursor khi lập trình',
        lblPickerHeading: '📦 Danh Sách Model Có Sẵn',
        pickerSearchPlaceholder: '🔍 Tìm theo model hoặc provider...',
        cpillAll: 'Tất cả',
        cpillCombos: '🔀 Combos',
        cpillFree: '🎁 100% Free',
        cpillTools: '🔧 Tools (IDE)',
        cpillVision: '👁️ Vision',
        lblChainHeading: '🔀 Chuỗi Fallback (Thứ Tự Ưu Tiên)',
        btnChainClear: 'Xóa hết',
        descChainHelp: 'Model #1 sẽ được gọi trước. Nếu gặp lỗi/rate-limit, tự động chuyển sang #2, #3...',
        btnComboCancel: 'Hủy',
        btnComboSave: 'Lưu Combo',
        chainEmpty: 'Chuỗi đang trống. Hãy chọn combo hoặc model từ bảng bên trái hoặc bấm mẫu 1-Click ở trên!',
        rankPrimary: '★ #1 Ưu Tiên Chính',
        rankFallback: (i) => '#' + (i + 1) + ' Dự Phòng ' + i,
        toolsStatus100: (c, t) => '✓ 100% mục (' + c + '/' + t + ') hỗ trợ Function Calling / Tools (Sẵn sàng cho VS Code Copilot & Cursor).',
        toolsStatusPartial: (c, t) => 'ℹ️ ' + c + '/' + t + ' mục hỗ trợ Tools. Khi IDE gọi function tools, FreeRoute sẽ tự động định tuyến tới các model/combo có Tools.',
        toolsStatusNone: '⚠️ Chưa có mục nào hỗ trợ Tools. Nếu dùng cho IDE Copilot/Agent, hãy thêm model có biểu tượng 🔧 Tools (vd: Gemini, Groq Qwen, OpenRouter...).',
        kpiTokens: 'Tổng Token Đã Dùng',
        tokenStatsTitle: 'Thống Kê Token Tiêu Thụ',
        thTokProvider: 'Nhà Cung Cấp',
        thTokCount: 'Số Yêu Cầu',
        thTokPrompt: 'Prompt Tokens',
        thTokCompletion: 'Completion Tokens',
        thTokTotal: 'Tổng Token (với biểu đồ)',
        noTokenData: 'Chưa có dữ liệu token',
        guideHead: '🛡️ Cẩm Nang Kết Nối & Bảo Vệ Tài Khoản An Toàn Tuyệt Đối',

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
        thTokIn: 'Token In',
        thTokOut: 'Token Out',
        noEvents: 'Chưa có sự kiện nào. Hãy gửi request qua cổng http://127.0.0.1:8787/v1!',
        searchProviders: '🔍 Tìm nhà cung cấp...',
        pillAll: 'Tất cả',
        pillFree: '🎁 Miễn phí & Mã nguồn mở',
        pillComm: '💎 Thương mại (Pay-as-you-go)',
        getKeyLink: 'Lấy Key ↗',
        connectBtn: 'Kết nối',
        connectedBadge: 'Đã kết nối',
        badgeKeys: (n) => n + ' Keys',
        badgeNotConnected: 'Chưa có Key',
        btnManageKeys: (n) => '🔑 Quản lý (' + n + ' keys)',
        btnAddKeyShort: '+ Thêm',
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
        titleCatalogCombos: '🔀 Chuỗi Fallback Dự Phòng & Profile Khuyên Dùng Cho IDE / Tool',
        descCatalogCombos: 'Cấu hình các Model ID này vào VS Code Copilot, Cursor, Continue.dev... để tận hưởng tự động chuyển vùng fallback khi có sự cố.',
        btnGotoCombos: '⚙️ Quản Lý / Tạo Combo Mới',
        btnCopyId: '📋 Sao Chép ID',
        btnTestCombo: '🧪 Thử Nghiệm',
        titleCombos: 'Chuỗi Định Tuyến Dự Phòng Tùy Biến (Custom Combos)',
        descCombos: 'Tự thiết lập chuỗi Fallback theo ý muốn. Khi model trước gặp sự cố hoặc hết quota, FreeRoute sẽ tự động chuyển sang model kế tiếp!',
        btnCreateCombo: '➕ Tạo Combo Mới',
        btnEditCombo: '✏️ Sửa',
        keysTitle: 'Khóa API Đã Lưu (Mã Hóa AES-256-GCM)',
        credsSecNote: '<strong>🛡️ An Toàn Tuyệt Đối & Tách Biệt GitHub:</strong> Tất cả khóa API được mã hóa AES-256-GCM và lưu trữ độc lập trong file SQLite cục bộ (<code>data/freeroute.sqlite</code>). File này được cấu hình trong <code>.gitignore</code>, hoàn toàn tách biệt với mã nguồn và không bao giờ bị đẩy lên GitHub!',
        thUpdated: 'Cập Nhật',
        thAction: 'Hành Động',
        deleteBtn: 'Xóa',
        playTitle: 'Thử Nghiệm Định Tuyến Prompt',
        lblPlayModel: 'Hồ Sơ / Model / Combo Mục Tiêu',
        lblPlayTemp: 'Nhiệt Độ (Temperature):',
        lblPlayPrompt: 'Prompt Thử Nghiệm',
        lblPlayRes: 'Kết quả phản hồi:',
        playSend: '🚀 Gửi Thử Nghiệm (Streaming)',
        playWaiting: 'Chờ gửi prompt...',
        playRouting: 'Đang kết nối và định tuyến request...',
        playPromptPlaceholder: 'Nhập câu hỏi tại đây...',
        playPromptDefault: 'Giải thích ngắn gọn cơ chế Fallback của FreeRoute trong 2 câu.',
        optgrpAuto: 'Hồ Sơ Tự Động (Auto Profiles)',
        optAutoFree: 'auto:free (Ưu tiên mô hình miễn phí)',
        optAutoFast: 'auto:fast (Tối ưu tốc độ cao Cerebras/Groq)',
        optAutoCode: 'auto:code (Lập trình & Tools)',
        optAutoLong: 'auto:long-context (Ngữ cảnh dài Gemini 1M+)',
        tempHintCode: '(Chính xác / Viết Code)',
        tempHintChat: '(Cân bằng / Trò chuyện)',
        tempHintCreative: '(Sáng tạo cao / Ý tưởng mới)',
        tempExplanation: '💡 <strong>Nhiệt độ (0.0 - 1.0):</strong> Điều chỉnh độ sáng tạo của AI:<br>• <strong>0.0:</strong> Rất chặt chẽ, nhất quán tuyệt đối (tối ưu cho Viết Code, Giải Toán, Xuất JSON).<br>• <strong>0.7 (Mặc định):</strong> Cân bằng tự nhiên giữa sáng tạo và mạch lạc (phù hợp cho Trò chuyện & Hỏi đáp).<br>• <strong>1.0:</strong> Tối đa hóa liên tưởng từ vựng & ý tưởng mới (dùng cho Brainstorming, Sáng tác).',
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
        statusUnconfigured: 'Chưa kết nối',
        streamAutoScroll: 'Tự động cuộn theo timeline',
        badgeLatest: 'Mới nhất',
        btnScrollLatest: 'Mới nhất',
        streamCountBadge: (n) => n + ' sự kiện',
        btnSetupKey: 'Thiết lập ➔',
        btnManageKey: 'Quản lý ➔',
        playStatusWaiting: '⚪ Chờ gửi prompt...',
        playStatusStreaming: '🟢 Đang stream phản hồi...',
        playStatusDone: '✅ Phản hồi hoàn tất',
        playStatusError: '❌ Gặp sự cố',
        btnCopyOutput: '📋 Sao chép kết quả',
        btnClearOutput: '🗑️ Xóa Màn Hình',
        btnExportBackup: '📥 Xuất Backup JSON',
        btnImportBackup: '📤 Nhập từ JSON',
        playConsoleInitial: 'Chờ gửi prompt... Nhấn "🚀 Gửi Thử Nghiệm" hoặc tổ hợp phím Ctrl + Enter để bắt đầu stream trực tiếp.'
      },
      en: {
        langBtn: '🇬🇧 English',
        subtitle: 'Local-first LLM router, quota-aware fallback, zero lock-in',
        refresh: '🔄 Refresh',
        addKey: '➕ Add API Key',
        syncKey: '⚡ Import Stored Keys',
        syncBannerNew: (n) => 'Detected ' + n + ' new API keys from OmniRoute & 9router ready to import!',
        syncBanner: (n) => 'Detected ' + n + ' API keys from OmniRoute & 9router on this machine.',
        syncAllNow: 'Sync all now',
        syncReview: 'Review details',
        syncStatusImported: '✅ Imported',
        syncStatusNew: '✨ New',
        thSyncStatus: 'Status',
        kpiProviders: 'Configured Providers',
        kpiProvidersSub: (n) => n + ' active API keys',
        kpiModelsFree: '🎁 100% Free Models',
        kpiModelsPaid: '💳 Commercial Models',
        kpiRequests: 'Requests Handled',
        kpiFallbacks: 'Fallbacks Recovered',
        tabMonitor: '📡 Health & Monitor',
        tabDirectory: '🌐 Provider Directory',
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
        thTokIn: 'Token In',
        thTokOut: 'Token Out',
        noEvents: 'No events yet. Send requests to http://127.0.0.1:8787/v1!',
        searchProviders: '🔍 Search providers...',
        pillAll: 'All',
        pillFree: '🎁 Free & Open Source',
        pillComm: '💎 Commercial (Pay-as-you-go)',
        getKeyLink: 'Get Key ↗',
        connectBtn: 'Connect',
        connectedBadge: 'Connected',
        badgeKeys: (n) => n + ' Keys',
        badgeNotConnected: 'Not Connected',
        btnManageKeys: (n) => '🔑 Manage (' + n + ' keys)',
        btnAddKeyShort: '+ Add',
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
        titleCatalogCombos: '🔀 Recommended Fallback Chains & Auto Profiles for IDEs / Tools',
        descCatalogCombos: 'Use these Model IDs in VS Code Copilot, Cursor, Continue.dev... to automatically failover to secondary models when errors or rate limits occur.',
        btnGotoCombos: '⚙️ Manage / Create Combos',
        btnCopyId: '📋 Copy ID',
        btnTestCombo: '🧪 Test Model',
        titleCombos: 'Custom Fallback Routing Chains (Combos)',
        descCombos: 'Define your own priority chains. When the primary model fails or hits quota limits, FreeRoute transparently routes to the next model in sequence!',
        btnCreateCombo: '➕ Create Combo',
        btnEditCombo: '✏️ Edit',
        keysTitle: 'Stored API Keys (Encrypted with AES-256-GCM)',
        credsSecNote: '<strong>🛡️ Security Guaranteed & GitHub-Safe:</strong> All API keys are encrypted with AES-256-GCM and stored locally in <code>data/freeroute.sqlite</code>. This file is excluded in <code>.gitignore</code> and will NEVER be leaked or committed to GitHub!',
        thUpdated: 'Updated',
        thAction: 'Action',
        deleteBtn: 'Delete',
        playTitle: 'Prompt Routing Test Playground',
        lblPlayModel: 'Target Profile / Model / Combo',
        lblPlayTemp: 'Temperature:',
        lblPlayPrompt: 'Test Prompt',
        lblPlayRes: 'Streamed Response:',
        playSend: '🚀 Send Request (Streaming)',
        playWaiting: 'Waiting for prompt...',
        playRouting: 'Connecting & routing request...',
        playPromptPlaceholder: 'Enter your prompt here...',
        playPromptDefault: "Briefly explain FreeRoute's Fallback mechanism in 2 sentences.",
        optgrpAuto: 'Auto Profiles',
        optAutoFree: 'auto:free (Prioritize 100% Free Models)',
        optAutoFast: 'auto:fast (Ultra-fast Cerebras/Groq)',
        optAutoCode: 'auto:code (Coding & Agentic Tools)',
        optAutoLong: 'auto:long-context (Gemini 1M+ Long Context)',
        tempHintCode: '(Precise / Coding)',
        tempHintChat: '(Balanced / Chat)',
        tempHintCreative: '(Creative / Brainstorm)',
        tempExplanation: '🌡️ <strong>Temperature (0.0 - 1.0):</strong> Controls randomness & creativity of the AI response:<br>▸ <strong>0.0:</strong> Deterministic & strictly factual (best for Coding, Math, JSON extraction).<br>▸ <strong>0.7 (Default):</strong> Balanced coherence & creativity (ideal for General Chat & Q&A).<br>▸ <strong>1.0:</strong> Highly imaginative & divergent (great for Brainstorming & Creative writing).',
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
        statusUnconfigured: 'Not Configured',
        streamAutoScroll: 'Auto-scroll timeline',
        badgeLatest: 'Latest',
        btnScrollLatest: 'Latest',
        streamCountBadge: (n) => n + ' events',
        btnSetupKey: 'Configure →',
        btnManageKey: 'Manage →',
        playStatusWaiting: '⏳ Waiting for prompt...',
        playStatusStreaming: '🔄 Streaming response...',
        playStatusDone: '✅ Stream completed',
        playStatusError: '❌ Request error',
        btnCopyOutput: '📋 Copy response',
        btnClearOutput: '🗑️ Clear',
        btnExportBackup: '📥 Export Backup JSON',
        btnImportBackup: '📤 Import from JSON',
        playConsoleInitial: 'Waiting for prompt... Click "🚀 Send Request" or press Ctrl + Enter to stream live.',
        playCombosOptgroup: '🔗 Fallback Chains (Custom Combos)',
        playDesc: 'Test streaming speed and automatic Fallback behavior when a model encounters an error.',
        playShortcutHint: 'Press <kbd style="background:var(--card-border); padding:2px 6px; border-radius:4px; font-family:var(--font-mono); color:var(--text);">Ctrl + Enter</kbd> to send',
        playNothingToCopy: 'Nothing to copy yet!',
        modalComboTitleCreate: '✨ Create New Custom Routing Combo',
        modalComboTitleEdit: (id) => '✏️ Edit Fallback Chain: ' + id,
        lblComboTemplates: '⚡ Quick-start Templates (1-Click):',
        tplCoding: '💻 Coding & Copilot IDE',
        tplSpeed: '⚡ Ultra-Fast (Cerebras/Groq)',
        tplChat: '💬 Smart Conversation',
        lblComboId: 'Combo ID (use as model: "combo:xxx")',
        comboIdPlaceholder: 'e.g. my-coding-chain',
        lblComboName: 'Display Name',
        comboNamePlaceholder: 'e.g. Ultra-Fast & Coding Fallback',
        lblComboDesc: 'Description',
        comboDescPlaceholder: 'e.g. Priority fallback chain for VS Code Copilot and Cursor',
        lblPickerHeading: '📦 Available Models',
        pickerSearchPlaceholder: '🔍 Search by model or provider...',
        cpillAll: 'All',
        cpillCombos: '🔗 Combos',
        cpillFree: '🆓 100% Free',
        cpillTools: '🛠️ Tools (IDE)',
        cpillVision: '👁️ Vision',
        lblChainHeading: '🔗 Fallback Chain (Priority Order)',
        btnChainClear: 'Clear all',
        descChainHelp: 'Model #1 is called first. On error/rate-limit, automatically falls back to #2, #3...',
        btnComboCancel: 'Cancel',
        btnComboSave: 'Save Combo',
        chainEmpty: 'Chain is empty. Pick a combo or model from the table on the left, or click a 1-Click template above!',
        rankPrimary: '⭐ #1 Primary',
        rankFallback: (i) => '#' + (i + 1) + ' Fallback ' + i,
        toolsStatus100: (c, t) => '✅ 100% (' + c + '/' + t + ') support Function Calling / Tools (Ready for VS Code Copilot & Cursor).',
        toolsStatusPartial: (c, t) => '⚠️ ' + c + '/' + t + ' entries support Tools. FreeRoute will route tool calls to capable models automatically.',
        toolsStatusNone: '❌ No entries support Tools. For IDE Copilot/Agent use, add models with 🛠️ Tools support (e.g. Gemini, Groq Qwen, OpenRouter...).',
        kpiTokens: 'Total Tokens Used',
        tokenStatsTitle: 'Token Consumption Stats',
        thTokProvider: 'Provider',
        thTokCount: 'Requests',
        thTokPrompt: 'Prompt Tokens',
        thTokCompletion: 'Completion Tokens',
        thTokTotal: 'Total Tokens (with chart)',
        noTokenData: 'No token data yet',
        guideHead: '🛡️ Connection Guide & Account Safety Best Practices'
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
      await Promise.all([
        fetchPresets(),
        refreshAllData()
      ]);
      void fetchImportSources();
      setInterval(refreshMonitoring, 10000);
      const promptEl = document.getElementById('play-prompt');
      if (promptEl) {
        promptEl.addEventListener('keydown', (e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            sendTestChat();
          }
        });
      }
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
      const hdrAddKey = document.getElementById('hdr-add-key-btn');
      if (hdrAddKey) hdrAddKey.textContent = t('addKey');
      document.getElementById('hdr-sync-btn').textContent = t('syncKey');

      document.getElementById('kpi-lbl-providers').textContent = t('kpiProviders');
      const kpiSub = document.getElementById('kpi-keys-sub');
      if (kpiSub) kpiSub.textContent = t('kpiProvidersSub', totalKeyCount);
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
      const lblStreamAuto = document.getElementById('lbl-stream-autoscroll');
      if (lblStreamAuto) lblStreamAuto.textContent = t('streamAutoScroll');
      const lblScrollLatest = document.getElementById('lbl-scroll-latest');
      if (lblScrollLatest) lblScrollLatest.textContent = t('btnScrollLatest');

      document.getElementById('th-ev-time').textContent = t('thTime');
      document.getElementById('th-ev-reqid').textContent = t('thReqId');
      document.getElementById('th-ev-target').textContent = t('thTarget');
      document.getElementById('th-ev-served').textContent = t('thServed');
      document.getElementById('th-ev-fallbacks').textContent = t('thFallbacks');
      document.getElementById('th-ev-latency').textContent = t('thLatency');
      document.getElementById('th-ev-status').textContent = t('thStatus');
      const thTokInEl = document.getElementById('th-ev-tokin');
      if (thTokInEl) thTokInEl.textContent = t('thTokIn');
      const thTokOutEl = document.getElementById('th-ev-tokout');
      if (thTokOutEl) thTokOutEl.textContent = t('thTokOut');

      document.getElementById('search-presets').placeholder = t('searchProviders');
      document.getElementById('search-models').placeholder = t('searchModels');
      document.getElementById('lbl-free-only').textContent = t('lblFreeOnly');

      document.getElementById('th-model-id').innerHTML = t('thModelId') + ' ' + (modelSortField === 'modelId' ? (modelSortAsc ? '▲' : '▼') : '⇕');
      document.getElementById('th-model-provider').innerHTML = t('thProvider') + ' ' + (modelSortField === 'providerId' ? (modelSortAsc ? '▲' : '▼') : '⇕');
      document.getElementById('th-model-tier').innerHTML = t('thTier') + ' ' + (modelSortField === 'isTrueFree' ? (modelSortAsc ? '▲' : '▼') : '⇕');
      document.getElementById('th-model-priority').innerHTML = t('thPriority') + ' ' + (modelSortField === 'priority' ? (modelSortAsc ? '▲' : '▼') : '⇕');
      document.getElementById('th-model-caps').textContent = t('thCaps');
      document.getElementById('th-model-pref').textContent = t('thPref');

      const titleCat = document.getElementById('title-catalog-combos');
      if (titleCat) titleCat.textContent = t('titleCatalogCombos');
      const descCat = document.getElementById('desc-catalog-combos');
      if (descCat) descCat.textContent = t('descCatalogCombos');
      const btnGoCombos = document.getElementById('btn-goto-combos');
      if (btnGoCombos) btnGoCombos.textContent = t('btnGotoCombos');

      document.getElementById('title-combos').textContent = t('titleCombos');
      document.getElementById('desc-combos').textContent = t('descCombos');
      document.getElementById('btn-create-combo').textContent = t('btnCreateCombo');

      document.getElementById('title-keys-heading').textContent = t('keysTitle');
      const credsNote = document.getElementById('creds-sec-note');
      if (credsNote) credsNote.innerHTML = t('credsSecNote');
      const btnExport = document.getElementById('btn-export-keys');
      if (btnExport) btnExport.textContent = t('btnExportBackup');
      const btnImport = document.getElementById('btn-import-keys');
      if (btnImport) btnImport.textContent = t('btnImportBackup');
      document.getElementById('btn-sync-local').textContent = t('syncKey');
      document.getElementById('btn-add-key-sub').textContent = t('addKey');
      document.getElementById('th-k-updated').textContent = t('thUpdated');
      document.getElementById('th-k-action').textContent = t('thAction');

      document.getElementById('title-play').textContent = t('playTitle');
      document.getElementById('lbl-play-model').textContent = t('lblPlayModel');
      document.getElementById('lbl-play-prompt').textContent = t('lblPlayPrompt');
      document.getElementById('btn-play-send').textContent = t('playSend');
      const btnPlayCopy = document.getElementById('btn-play-copy');
      if (btnPlayCopy) btnPlayCopy.textContent = t('btnCopyOutput');
      const btnPlayClear = document.getElementById('btn-play-clear');
      if (btnPlayClear) btnPlayClear.textContent = t('btnClearOutput');

      const optgrpAuto = document.getElementById('optgrp-play-auto');
      if (optgrpAuto) optgrpAuto.label = t('optgrpAuto');
      const optFree = document.getElementById('opt-play-free');
      if (optFree) optFree.textContent = t('optAutoFree');
      const optFast = document.getElementById('opt-play-fast');
      if (optFast) optFast.textContent = t('optAutoFast');
      const optCode = document.getElementById('opt-play-code');
      if (optCode) optCode.textContent = t('optAutoCode');
      const optLong = document.getElementById('opt-play-long');
      if (optLong) optLong.textContent = t('optAutoLong');

      const promptInput = document.getElementById('play-prompt');
      if (promptInput) {
        promptInput.placeholder = t('playPromptPlaceholder');
        if (promptInput.value === 'Giải thích ngắn gọn cơ chế Fallback của FreeRoute trong 2 câu.' || promptInput.value === "Briefly explain FreeRoute's Fallback mechanism in 2 sentences.") {
          promptInput.value = t('playPromptDefault');
        }
      }

      const tempVal = document.getElementById('play-temp') ? document.getElementById('play-temp').value : 0.7;
      updateTempDisplay(tempVal);

      document.getElementById('modal-add-title').textContent = t('modalAddTitle');
      document.getElementById('lbl-modal-prov').textContent = t('modalProvLabel');
      document.getElementById('lbl-modal-secret').textContent = t('modalSecretLabel');
      document.getElementById('btn-modal-cancel').textContent = t('modalCancel');
      document.getElementById('btn-modal-save').textContent = t('modalSave');

      document.getElementById('modal-sync-title').textContent = t('modalSyncTitle');
      document.getElementById('modal-sync-desc').textContent = t('modalSyncDesc');
      const thSyncStat = document.getElementById('th-sync-status');
      if (thSyncStat) thSyncStat.textContent = t('thSyncStatus');
      document.getElementById('btn-sync-cancel').textContent = t('modalCancel');
      document.getElementById('btn-sync-confirm').textContent = t('syncConfirm');
      document.getElementById('sync-quick-btn').textContent = t('syncAllNow');
      document.getElementById('sync-review-btn').textContent = t('syncReview');
      const descPlayEl = document.getElementById('desc-play');
      if (descPlayEl) descPlayEl.textContent = t('playDesc');
      const lblShortcut = document.getElementById('lbl-play-shortcut');
      if (lblShortcut) lblShortcut.innerHTML = t('playShortcutHint');
      const playCombosGrp = document.getElementById('play-combos-group');
      if (playCombosGrp) playCombosGrp.label = t('playCombosOptgroup');

      // Update test playground response initial placeholder / status
      const playOutputEl = document.getElementById('play-output');
      if (playOutputEl) {
        if (playOutputEl.textContent === I18N.vi.playConsoleInitial || playOutputEl.textContent === I18N.en.playConsoleInitial) {
          playOutputEl.textContent = t('playConsoleInitial');
        }
      }
      const playStatEl = document.getElementById('play-stream-status');
      if (playStatEl) {
        if (playStatEl.textContent === I18N.vi.playStatusWaiting || playStatEl.textContent === I18N.en.playStatusWaiting) {
          playStatEl.textContent = t('playStatusWaiting');
        } else if (playStatEl.textContent === I18N.vi.playStatusDone || playStatEl.textContent === I18N.en.playStatusDone) {
          playStatEl.textContent = t('playStatusDone');
        } else if (playStatEl.textContent === I18N.vi.playStatusError || playStatEl.textContent === I18N.en.playStatusError) {
          playStatEl.textContent = t('playStatusError');
        }
      }

      // Update Token Stats headers & KPI
      const kpiTokLbl = document.getElementById('kpi-lbl-tokens');
      if (kpiTokLbl) kpiTokLbl.textContent = t('kpiTokens');
      const titleTokStats = document.getElementById('title-token-stats');
      if (titleTokStats) titleTokStats.textContent = t('tokenStatsTitle');
      const thTokProv = document.getElementById('th-tok-provider');
      if (thTokProv) thTokProv.textContent = t('thTokProvider');
      const thTokCnt = document.getElementById('th-tok-count');
      if (thTokCnt) thTokCnt.textContent = t('thTokCount');
      const thTokPr = document.getElementById('th-tok-prompt');
      if (thTokPr) thTokPr.textContent = t('thTokPrompt');
      const thTokComp = document.getElementById('th-tok-completion');
      if (thTokComp) thTokComp.textContent = t('thTokCompletion');
      const thTokTot = document.getElementById('th-tok-total');
      if (thTokTot) thTokTot.textContent = t('thTokTotal');
      const guideHeadEl = document.getElementById('guide-head');
      if (guideHeadEl) guideHeadEl.textContent = t('guideHead');

      // Update Modal Combo static & placeholder texts
      const titleComboModal = document.getElementById('modal-combo-title');
      if (titleComboModal) {
        if (!comboEditingId) titleComboModal.textContent = t('modalComboTitleCreate');
        else titleComboModal.textContent = t('modalComboTitleEdit', comboEditingId);
      }
      const lblTemplates = document.getElementById('lbl-combo-templates');
      if (lblTemplates) lblTemplates.textContent = t('lblComboTemplates');
      const btnTplCoding = document.getElementById('btn-tpl-coding');
      if (btnTplCoding) btnTplCoding.textContent = t('tplCoding');
      const btnTplSpeed = document.getElementById('btn-tpl-speed');
      if (btnTplSpeed) btnTplSpeed.textContent = t('tplSpeed');
      const btnTplChat = document.getElementById('btn-tpl-chat');
      if (btnTplChat) btnTplChat.textContent = t('tplChat');
      const lblComboId = document.getElementById('lbl-combo-id');
      if (lblComboId) lblComboId.textContent = t('lblComboId');
      const inputComboId = document.getElementById('combo-input-id');
      if (inputComboId) inputComboId.placeholder = t('comboIdPlaceholder');
      const lblComboName = document.getElementById('lbl-combo-name');
      if (lblComboName) lblComboName.textContent = t('lblComboName');
      const inputComboName = document.getElementById('combo-input-name');
      if (inputComboName) inputComboName.placeholder = t('comboNamePlaceholder');
      const lblComboDesc = document.getElementById('lbl-combo-desc');
      if (lblComboDesc) lblComboDesc.textContent = t('lblComboDesc');
      const inputComboDesc = document.getElementById('combo-input-desc');
      if (inputComboDesc) inputComboDesc.placeholder = t('comboDescPlaceholder');
      const lblPickHead = document.getElementById('lbl-picker-heading');
      if (lblPickHead) lblPickHead.textContent = t('lblPickerHeading');
      const inputPickSearch = document.getElementById('combo-picker-search');
      if (inputPickSearch) inputPickSearch.placeholder = t('pickerSearchPlaceholder');
      const cpAll = document.getElementById('cpill-all');
      if (cpAll) cpAll.textContent = t('cpillAll');
      const cpCombos = document.getElementById('cpill-combos');
      if (cpCombos) cpCombos.textContent = t('cpillCombos');
      const cpFree = document.getElementById('cpill-free');
      if (cpFree) cpFree.textContent = t('cpillFree');
      const cpTools = document.getElementById('cpill-tools');
      if (cpTools) cpTools.textContent = t('cpillTools');
      const cpVision = document.getElementById('cpill-vision');
      if (cpVision) cpVision.textContent = t('cpillVision');
      const lblChainHead = document.getElementById('lbl-chain-heading');
      if (lblChainHead) lblChainHead.textContent = t('lblChainHeading');
      const btnChainClr = document.getElementById('btn-chain-clear');
      if (btnChainClr) btnChainClr.textContent = t('btnChainClear');
      const descChainHelp = document.getElementById('desc-chain-help');
      if (descChainHelp) descChainHelp.textContent = t('descChainHelp');
      const btnComboCncl = document.getElementById('btn-combo-cancel');
      if (btnComboCncl) btnComboCncl.textContent = t('btnComboCancel');
      const btnComboSv = document.getElementById('btn-combo-save');
      if (btnComboSv) btnComboSv.textContent = t('btnComboSave');

    }

    function updateTempDisplay(val) {
      const num = parseFloat(val);
      const valEl = document.getElementById('temp-val');
      const hintEl = document.getElementById('temp-hint');
      const descEl = document.getElementById('temp-desc');
      if (valEl) valEl.textContent = val;
      if (hintEl) {
        if (num <= 0.3) {
          hintEl.textContent = t('tempHintCode');
          hintEl.style.color = '#38bdf8';
        } else if (num <= 0.7) {
          hintEl.textContent = t('tempHintChat');
          hintEl.style.color = 'var(--accent)';
        } else {
          hintEl.textContent = t('tempHintCreative');
          hintEl.style.color = '#fbbf24';
        }
      }
      if (descEl) descEl.innerHTML = t('tempExplanation');
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
          const newKeys = detectedSources.filter(s => !s.alreadyImported);
          const bannerEl = document.getElementById('sync-banner');
          const hdrBtn = document.getElementById('hdr-sync-btn');
          if (newKeys.length > 0) {
            bannerEl.style.display = 'flex';
            if (hdrBtn) hdrBtn.style.display = 'inline-flex';
            document.getElementById('sync-banner-msg').textContent = t('syncBannerNew', newKeys.length);
          } else {
            bannerEl.style.display = 'none';
            if (hdrBtn) hdrBtn.style.display = 'none';
          }
        }
      } catch (err) {
        console.error('Failed to detect sources:', err);
      }
    }

    async function fetchCredentials() {
      try {
        const [cRes, aRes] = await Promise.all([
          fetch('/v1/credentials'),
          fetch('/v1/auth/status')
        ]);
        if (cRes.ok) {
          const json = await cRes.json();
          credentials = json.data || [];
        }
        if (aRes.ok) {
          const aJson = await aRes.json();
          providerKeyCounts = aJson.providerKeyCounts || {};
          totalKeyCount = aJson.keyCount || credentials.length;
        } else {
          providerKeyCounts = {};
          for (const c of credentials) {
            providerKeyCounts[c.providerId] = (providerKeyCounts[c.providerId] || 0) + 1;
          }
          totalKeyCount = credentials.length;
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
          populateComboPickerProviders();
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
      const activeProviders = Object.keys(providerKeyCounts).length || new Set(credentials.map(c => c.providerId)).size;
      document.getElementById('kpi-providers').textContent = activeProviders;
      const subEl = document.getElementById('kpi-keys-sub');
      if (subEl) {
        subEl.textContent = t('kpiProvidersSub', totalKeyCount || credentials.length);
      }
      
      const freeModelsCount = models.filter(m => m.isTrueFree).length;
      const paidModelsCount = models.length - freeModelsCount;
      document.getElementById('kpi-models-free').textContent = freeModelsCount;
      document.getElementById('kpi-models-paid').textContent = paidModelsCount;

      document.getElementById('kpi-requests').textContent = eventsData.length;
      const fallbacks = eventsData.filter(e => (e.fallbackCount || e.fallbacks || 0) > 0).length;
      document.getElementById('kpi-fallbacks').textContent = fallbacks;

      // Token stats
      fetch('/v1/stats/tokens').then(r => r.ok ? r.json() : null).then(stats => {
        if (!stats) return;
        const total = stats.totalTokens || 0;
        const prompt = stats.promptTokens || 0;
        const completion = stats.completionTokens || 0;
        document.getElementById('kpi-tokens').textContent = total >= 1_000_000
          ? (total / 1_000_000).toFixed(2) + 'M'
          : total >= 1_000 ? (total / 1_000).toFixed(1) + 'K' : String(total);
        const sub = document.getElementById('kpi-tokens-sub');
        if (sub) sub.textContent = '\u2191 ' + (prompt >= 1000 ? (prompt/1000).toFixed(1)+'K' : prompt) + ' prompt \u00b7 \u2193 ' + (completion >= 1000 ? (completion/1000).toFixed(1)+'K' : completion) + ' completion';

        // Render per-provider token table
        const tbody = document.getElementById('token-stats-body');
        const countEl = document.getElementById('token-stats-count');
        if (tbody) {
          const entries = Object.entries(stats.byProvider || {});
          if (countEl) countEl.textContent = entries.length + ' provider';
          const empty = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">Ch\u01b0a c\u00f3 d\u1eef li\u1ec7u token</td></tr>';
          const rows = entries.sort((a, b) => (b[1].totalTokens || 0) - (a[1].totalTokens || 0)).map(([pid, s]) => {
            const pct = total > 0 ? Math.round((s.totalTokens / total) * 100) : 0;
            const fmt = (n) => n >= 1000 ? (n/1000).toFixed(1)+'K' : String(n);
            return '<tr>' +
              '<td><span class="badge badge-gray">' + pid + '</span></td>' +
              '<td style="text-align:right">' + s.count + '</td>' +
              '<td style="text-align:right">' + fmt(s.promptTokens) + '</td>' +
              '<td style="text-align:right">' + fmt(s.completionTokens) + '</td>' +
              '<td style="text-align:right">' + fmt(s.totalTokens) +
              '<div style="background:var(--surface-2);border-radius:4px;height:4px;margin-top:3px;overflow:hidden">' +
              '<div style="background:var(--primary);height:100%;width:' + pct + '%"></div>' +
              '</div></td>' +
              '</tr>';
          });
          tbody.innerHTML = entries.length === 0 ? empty : rows.join('');
        }
      }).catch(() => {});
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

    function scrollToLatestEvent() {
      const box = document.getElementById('stream-scroll-container');
      if (box) {
        box.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }

    function renderEvents() {
      const tbody = document.getElementById('events-tbody');
      const countBadge = document.getElementById('stream-count-badge');
      if (countBadge) {
        countBadge.textContent = t('streamCountBadge', eventsData ? eventsData.length : 0);
      }
      if (!eventsData || eventsData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:20px;">' + t('noEvents') + '</td></tr>';
        return;
      }

      // Sort by timeline DESC (newest at top)
      const sortedDesc = [...eventsData].sort((a, b) => {
        const timeA = new Date(a.occurredAt || 0).getTime();
        const timeB = new Date(b.occurredAt || 0).getTime();
        return timeB - timeA;
      });

      // Take the most recent 30 events
      const recent = sortedDesc.slice(0, 30);
      let html = '';
      for (let i = 0; i < recent.length; i++) {
        const ev = recent[i];
        const isLatest = (i === 0);
        const timeStr = ev.occurredAt ? new Date(ev.occurredAt).toLocaleTimeString() : '—';
        const reqId = ev.requestId ? ev.requestId.slice(0, 8) + '...' : '—';
        const target = ev.profile || ev.requestedModel || 'auto:free';
        const served = (ev.providerId || '—') + ' / ' + (ev.modelId || '—');
        const fallbacks = ev.fallbackCount || ev.fallbacks || 0;
        const latency = ev.latencyMs ? ev.latencyMs + 'ms' : '—';
        const isOk = !ev.errorCode;

        html += \`
          <tr class="\${isLatest ? 'newest-stream-row' : ''}">
            <td style="color:var(--text-muted); font-family:var(--font-mono); font-size:12px; white-space:nowrap;">
              \${timeStr} \${isLatest ? '<span class="badge badge-green" style="font-size:9px; padding:1px 5px; margin-left:4px; font-weight:bold;">⚡ ' + t('badgeLatest') + '</span>' : ''}
            </td>
            <td style="font-family:var(--font-mono); font-size:11px; color:var(--text-dim);"><code>\${reqId}</code></td>
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
            <td style="font-family:var(--font-mono); font-size:11px; text-align:right;">
              \${ev.promptTokens != null ? ev.promptTokens : '—'}
            </td>
            <td style="font-family:var(--font-mono); font-size:11px; text-align:right;">
              \${ev.completionTokens != null ? ev.completionTokens : '—'}
            </td>
          </tr>
        \`;
      }
      tbody.innerHTML = html;

      const latestReqId = recent.length > 0 ? recent[recent.length - 1].requestId : null;
      const isNewEvent = latestReqId && latestReqId !== lastStreamEventId;
      const isInitial = lastStreamEventId === null;
      lastStreamEventId = latestReqId;

      const chk = document.getElementById('chk-stream-autoscroll');
      const box = document.getElementById('stream-scroll-container');
      if (box && (!chk || chk.checked) && (isNewEvent || isInitial)) {
        setTimeout(() => {
          box.scrollTo({ top: 0, behavior: 'smooth' });
        }, 50);
      }
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

    function goToCredentialsFor(providerId) {
      switchTab('credentials');
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
        const keyCount = providerKeyCounts[p.id] || (configuredMap.has(p.id) ? 1 : 0);
        const isConfigured = keyCount > 0;
        const desc = currentLang === 'vi' ? p.descriptionVi : p.descriptionEn;
        const isComm = p.category === 'commercial';
        const catBadge = isComm 
          ? '<span class="badge badge-purple">💎 Commercial</span>'
          : (p.category === 'local' ? '<span class="badge badge-blue">🏠 Local</span>' : '<span class="badge badge-green">🎁 Free Tier</span>');

        const keyBadge = isConfigured
          ? \`<span class="badge badge-green" style="font-weight:600;">🟢 \${t('badgeKeys', keyCount)}</span>\`
          : \`<span class="badge badge-gray">⚪ \${t('badgeNotConnected')}</span>\`;

        html += \`
          <div class="preset-card">
            <div>
              <div class="preset-header">
                <div>
                  <div class="preset-name">\${p.name}</div>
                  <div style="font-size:11px; color:var(--text-dim); font-family:var(--font-mono);">\${p.id}</div>
                </div>
                <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
                  \${catBadge}
                  \${keyBadge}
                </div>
              </div>
              <div class="preset-desc">\${desc}</div>
              <div class="preset-models">
                \${(p.seedModels || []).slice(0, 3).map(m => \`<span class="badge badge-gray">\${m.modelId}</span>\`).join('')}
                \${(p.seedModels || []).length > 3 ? \`<span class="badge badge-gray">+\${p.seedModels.length - 3}</span>\` : ''}
              </div>
            </div>
            <div class="preset-actions">
              \${p.apiKeyUrl ? \`<a href="\${p.apiKeyUrl}" target="_blank" class="btn btn-sm btn-outline" style="font-size:11px;">\${t('getKeyLink')}</a>\` : '<span style="font-size:11px; color:var(--text-dim);">Local / Free</span>'}
              \${isConfigured 
                ? \`<button class="btn btn-sm btn-outline" onclick="switchTab('credentials')">⚙️ \${t('btnManageKey')}</button>\`
                : \`<button class="btn btn-sm btn-outline" onclick="openAddKeyModal('\${p.id}')">\${t('btnSetupKey')}</button>\`
              }
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

    // UTILS: CLIPBOARD & PLAYGROUND SELECTION
    function copyToClipboard(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          showToast((currentLang === 'vi' ? 'Đã sao chép: ' : 'Copied: ') + text);
        }).catch(() => {
          prompt(currentLang === 'vi' ? 'Sao chép giá trị này:' : 'Copy this value:', text);
        });
      } else {
        prompt(currentLang === 'vi' ? 'Sao chép giá trị này:' : 'Copy this value:', text);
      }
    }

    function testModelId(modelId) {
      switchTab('playground');
      const sel = document.getElementById('play-model-select');
      if (sel) {
        let optExists = false;
        for (let i = 0; i < sel.options.length; i++) {
          if (sel.options[i].value === modelId) {
            sel.selectedIndex = i;
            optExists = true;
            break;
          }
        }
        if (!optExists) {
          const opt = document.createElement('option');
          opt.value = modelId;
          opt.textContent = modelId;
          sel.appendChild(opt);
          sel.value = modelId;
        }
        onPlayModelChange();
      }
      const p = document.getElementById('play-prompt');
      if (p) {
        p.focus();
      }
    }

    // TAB 4 & TAB 3: CUSTOM COMBOS & AUTO PROFILES SHOWCASE
    function renderCombos() {
      // 1. Render Tab 4: Custom Combos Manager
      const container = document.getElementById('combos-container');
      if (container) {
        if (combos.length === 0) {
          container.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:var(--text-muted); padding:30px;">' + (currentLang === 'vi' ? 'Chưa có combo nào. Hãy bấm Tạo Combo Mới!' : 'No combos configured. Click Create Combo!') + '</div>';
        } else {
          let html = '';
          for (const cb of combos) {
            const cbModels = cb.models || [];
            const modelCount = cbModels.length;
            const safeId = 'chain_' + cb.comboId.replace(/[^a-z0-9]/gi, '_');
            const chainHtml = cbModels.map((m, idx) => \`
              <div class="chain-step">
                <span style="color:var(--text-muted); font-size:10px; min-width:22px;">#\${idx + 1}</span>
                <span>\${m}</span>
              </div>
              \${idx < cbModels.length - 1 ? '<div class="chain-arrow">↓</div>' : ''}
            \`).join('');

            html += \`
              <div class="combo-card">
                <div>
                  <div class="combo-card-header">
                    <div class="combo-card-meta">
                      <div class="combo-card-name" title="\${cb.name}">\${cb.name}</div>
                      <div class="combo-card-id">combo:\${cb.comboId}</div>
                    </div>
                    <button class="btn btn-danger btn-sm" style="padding:2px 7px; font-size:12px; flex-shrink:0;" onclick="event.stopPropagation(); deleteCombo('\${cb.comboId}')" title="\${currentLang === 'vi' ? 'Xóa Combo' : 'Delete Combo'}">✕</button>
                  </div>
                  <div class="combo-card-desc" style="\${!cb.description ? 'opacity:0.35; font-style:italic;' : ''}">
                    \${cb.description || (currentLang === 'vi' ? 'Chưa có mô tả' : 'No description')}
                  </div>
                  <div class="combo-badge-row">
                    <span class="badge badge-blue">📦 \${modelCount} model\${modelCount !== 1 ? 's' : ''}</span>
                    <button class="combo-expand-toggle" id="toggle_\${safeId}" onclick="toggleComboChain('\${safeId}')">
                      <span>\${currentLang === 'vi' ? 'Xem chuỗi' : 'View chain'}</span>
                      <span class="toggle-icon">▼</span>
                    </button>
                  </div>
                  <div class="combo-chain-collapse" id="\${safeId}">
                    \${chainHtml}
                  </div>
                </div>
                <div class="combo-card-actions">
                  <button class="btn btn-sm btn-outline" style="flex:1; font-size:11px;" onclick="copyComboId('\${cb.comboId}')">📋 Copy ID</button>
                  <button class="btn btn-sm btn-outline" style="flex:1; font-size:11px;" onclick="openCreateComboModal('\${cb.comboId}')">✏️ Sửa</button>
                  <button class="btn btn-sm btn-primary" style="flex:1; font-size:11px;" onclick="testCombo('\${cb.comboId}')">🧪 Test</button>
                </div>
              </div>
            \`;
          }
          container.innerHTML = html;
        }
      }

      // 2. Render Tab 3: Model Catalog Combos & Auto Profiles Showcase
      const catalogContainer = document.getElementById('catalog-combos-container');
      if (catalogContainer) {
        const autoProfiles = [
          {
            id: 'auto:code',
            name: currentLang === 'vi' ? 'L\\u1eadp Tr\\u00ecnh & Tools (Coding & Agents)' : 'Coding & Function Calling',
            desc: currentLang === 'vi' ? 'Chu\\u1ed7i \\u0111\\u1ecbnh tuy\\u1ebfn t\\u1ed1i \\u01b0u nh\\u1ea5t cho VS Code Copilot, Cursor, Continue.dev, Roo Code.' : 'Top priority fallback chain for coding agents, function calling and tools.',
            badge: currentLang === 'vi' ? 'Khuy\\u00ean d\\u00f9ng cho IDE' : 'Recommended for IDEs',
            steps: ['groq/llama-3.3-70b-versatile', 'cerebras/llama-3.3-70b', 'gemini/gemini-2.5-flash', 'openrouter/qwen/qwen-2.5-coder-32b-instruct:free']
          },
          {
            id: 'auto:free',
            name: currentLang === 'vi' ? '100% Mi\\u1ec5n Ph\\u00ed (Zero Cost)' : '100% Free Fallback',
            desc: currentLang === 'vi' ? 'T\\u1ef1 \\u0111\\u1ed9ng ch\\u1ecdn model mi\\u1ec5n ph\\u00ed c\\u00f3 tr\\u1ea1ng th\\u00e1i t\\u1ed1t nh\\u1ea5t t\\u1eeb Groq, Gemini, OpenRouter, Cerebras.' : 'Automatically selects the best-health model from completely free tiers.',
            badge: currentLang === 'vi' ? 'Mi\\u1ec5n ph\\u00ed' : '100% Free',
            steps: ['gemini/gemini-2.5-flash', 'groq/llama-3.3-70b-versatile', 'cerebras/llama-3.3-70b', 'openrouter:free']
          },
          {
            id: 'auto:fast',
            name: currentLang === 'vi' ? 'Si\\u00eau T\\u1ed1c \\u0110\\u1ed9 (Ultra Fast 500-1800 tps)' : 'Ultra-Fast Inference (500-1800 tps)',
            desc: currentLang === 'vi' ? 'T\\u1ed1i \\u01b0u \\u0111\\u1ed9 tr\\u1ec5 th\\u1ea5p nh\\u1ea5t cho autocomplete v\\u00e0 inline chat t\\u1ee9c th\\u00ec.' : 'Optimized for minimum latency, ideal for inline completion and rapid chat.',
            badge: currentLang === 'vi' ? 'T\\u1ed1c \\u0111\\u1ed9' : 'Ultra Fast',
            steps: ['cerebras/llama-3.3-70b', 'groq/llama-3.1-8b-instant', 'cerebras/llama-3.1-8b']
          },
          {
            id: 'auto:long-context',
            name: currentLang === 'vi' ? 'Ng\\u1eef C\\u1ea3nh Si\\u00eau L\\u1edbn (Long Context 1M+)' : 'Massive Context (1M+ Tokens)',
            desc: currentLang === 'vi' ? '\\u0110\\u1ecdc to\\u00e0n b\\u1ed9 codebase ho\\u1eb7c t\\u00e0i li\\u1ec7u kh\\u1ed5ng l\\u1ed3 v\\u1edbi Gemini Flash 1M tokens.' : 'Process entire code repositories and massive books with 1M+ context window.',
            badge: currentLang === 'vi' ? 'Ng\\u1eef c\\u1ea3nh' : '1M+ Context',
            steps: ['gemini/gemini-2.5-flash (1M)', 'openrouter/google/gemini-2.0-flash-exp:free', 'openrouter/minimax/minimax-m2.7:free']
          }
        ];

        let catHtml = '';
        // Render Auto Profiles
        for (const ap of autoProfiles) {
          const chainSteps = ap.steps.map((s, idx) => \`
            <div class="chain-step">
              <span style="color:var(--text-muted); font-size:11px;">#\${idx + 1}</span>
              <span>\${s}</span>
            </div>
          \`).join('<div class="chain-arrow">↓ fallback</div>');

          catHtml += \`
            <div class="combo-card" style="border-left: 3px solid var(--accent);">
              <div>
                <div class="combo-card-header">
                  <div class="combo-card-meta">
                    <div class="combo-card-name" style="color:var(--accent);">\${ap.name}</div>
                    <div class="combo-card-id">\${ap.id}</div>
                  </div>
                  <span class="badge badge-blue">\${ap.badge}</span>
                </div>
                <div class="combo-card-desc">\${ap.desc}</div>
                <div class="combo-chain" style="margin-top:8px;">
                  \${chainSteps}
                </div>
              </div>
              <div class="combo-card-actions">
                <button class="btn btn-sm btn-outline" style="flex:1;" onclick="copyToClipboard('\${ap.id}')">📋 \${t('btnCopyId') || 'Copy ID'}</button>
                <button class="btn btn-sm btn-primary" style="flex:1;" onclick="testModelId('\${ap.id}')">🧪 \${t('btnTestCombo') || 'Test'}</button>
              </div>
            </div>
          \`;
        }

        // Render Custom Combos in Tab 3
        for (const cb of combos) {
          const chainHtml = (cb.models || []).map((m, idx) => \`
            <div class="chain-step">
              <span style="color:var(--text-muted); font-size:11px;">#\${idx + 1}</span>
              <span>\${m}</span>
            </div>
          \`).join('<div class="chain-arrow">↓ fallback</div>');

          catHtml += \`
            <div class="combo-card">
              <div>
                <div class="combo-card-header">
                  <div class="combo-card-meta">
                    <div class="combo-card-name">\${cb.name}</div>
                    <div class="combo-card-id">combo:\${cb.comboId}</div>
                  </div>
                  <span class="badge badge-green">Custom Combo</span>
                </div>
                <div class="combo-card-desc" style="\${!cb.description ? 'opacity:0.35; font-style:italic;' : ''}">
                  \${cb.description || (currentLang === 'vi' ? 'Chưa có mô tả' : 'No description')}
                </div>
                <div class="combo-chain" style="margin-top:8px;">
                  \${chainHtml}
                </div>
              </div>
              <div class="combo-card-actions">
                <button class="btn btn-sm btn-outline" style="flex:1;" onclick="copyComboId('\${cb.comboId}')">📋 \${t('btnCopyId') || 'Copy ID'}</button>
                <button class="btn btn-sm btn-primary" style="flex:1;" onclick="testCombo('\${cb.comboId}')">🧪 \${t('btnTestCombo') || 'Test'}</button>
              </div>
            </div>
          \`;
        }

        catalogContainer.innerHTML = catHtml;
      }
    }

    function populatePlaygroundCombos() {
      const grp = document.getElementById('play-combos-group');
      let html = '';
      for (const cb of combos) {
        let label = cb.name;
        if (cb.comboId === 'smart-chat') {
          label = currentLang === 'vi' ? 'Hội Thoại Thông Minh Tối Ưu' : 'Best Free Chat';
        }
        html += \`<option value="combo:\${cb.comboId}">combo:\${cb.comboId} (\${label})</option>\`;
      }
      grp.innerHTML = html;
    }

    // Utility: Copy to Clipboard with fallback
    function copyToClipboard(text, msg = '') {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          showToast(msg || ((currentLang === 'vi' ? 'Đã sao chép: ' : 'Copied: ') + text));
        }).catch(() => fallbackCopy(text, msg));
      } else {
        fallbackCopy(text, msg);
      }
    }

    function fallbackCopy(text, msg = '') {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast(msg || ((currentLang === 'vi' ? 'Đã sao chép: ' : 'Copied: ') + text));
      } catch (e) {
        showToast((currentLang === 'vi' ? 'Không thể sao chép: ' : 'Failed to copy: ') + text, true);
      }
    }

    function copyComboId(comboId) {
      const fullId = 'combo:' + comboId;
      copyToClipboard(fullId, (currentLang === 'vi' ? 'Đã sao chép ID: ' : 'Copied ID: ') + fullId);
    }

    function toggleComboChain(safeId) {
      const chain = document.getElementById(safeId);
      const toggle = document.getElementById('toggle_' + safeId);
      if (!chain || !toggle) return;
      const isOpen = chain.classList.toggle('open');
      toggle.classList.toggle('open', isOpen);
      const label = toggle.querySelector('span:first-child');
      if (label) {
        label.textContent = isOpen ? (currentLang === 'vi' ? 'Ẩn chuỗi' : 'Hide chain') : (currentLang === 'vi' ? 'Xem chuỗi' : 'View chain');
      }
    }

    function testCombo(comboId) {
      const targetModel = 'combo:' + comboId;
      testModelId(targetModel);
      showToast((currentLang === 'vi' ? 'Đã chọn combo: ' : 'Selected combo: ') + targetModel);
    }

    let comboEditingId = null;
    let comboPickerActiveFilter = 'all';

    function openCreateComboModal(editComboId = null) {
      comboEditingId = editComboId;
      const modal = document.getElementById('modal-create-combo');
      const idInput = document.getElementById('combo-input-id');
      const nameInput = document.getElementById('combo-input-name');
      const descInput = document.getElementById('combo-input-desc');
      const titleEl = document.getElementById('modal-combo-title');

      if (editComboId) {
        const cb = combos.find(c => c.comboId === editComboId);
        if (cb) {
          idInput.value = cb.comboId;
          idInput.disabled = true;
          nameInput.value = cb.name || '';
          descInput.value = cb.description || '';
          tempComboChain = [...(cb.models || [])];
          if (titleEl) titleEl.textContent = (currentLang === 'vi' ? '✏️ Sửa Chuỗi Fallback: ' : '✏️ Edit Fallback Combo: ') + cb.comboId;
        }
      } else {
        idInput.value = '';
        idInput.disabled = false;
        nameInput.value = '';
        descInput.value = '';
        tempComboChain = [];
        if (titleEl) titleEl.textContent = currentLang === 'vi' ? '➕ Tạo Custom Routing Combo Mới' : '➕ Create New Fallback Combo';
      }

      modal.classList.add('active');
      populateComboPickerProviders();
      filterComboPickerModels();
      renderTempComboChain();
    }

    function closeCreateComboModal() {
      document.getElementById('modal-create-combo').classList.remove('active');
      comboEditingId = null;
    }

    function populateComboPickerProviders() {
      const sel = document.getElementById('combo-picker-prov-select');
      if (!sel) return;
      const provSet = new Set(models.map(m => m.providerId));
      let html = '<option value="">-- ' + (currentLang === 'vi' ? 'Tất cả Nhà Cung Cấp' : 'All Providers') + ' --</option>';
      html += '<option value="__combos__">🔀 ' + (currentLang === 'vi' ? 'Custom Combos (Ưu tiên)' : 'Custom Combos (Priority)') + '</option>';
      for (const p of Array.from(provSet).sort()) {
        const pr = presets.find(x => x.id === p);
        const name = pr ? pr.name : p;
        html += \`<option value="\${p}">\${name} (\${p})</option>\`;
      }
      sel.innerHTML = html;
    }

    function setComboPickerFilter(f) {
      comboPickerActiveFilter = f;
      ['all', 'combos', 'free', 'tools', 'vision'].forEach(type => {
        const btn = document.getElementById('cpill-' + type);
        if (btn) {
          if (type === f) btn.classList.add('active');
          else btn.classList.remove('active');
        }
      });
      filterComboPickerModels();
    }

    function filterComboPickerModels() {
      const search = (document.getElementById('combo-picker-search')?.value || '').trim().toLowerCase();
      const prov = document.getElementById('combo-picker-prov-select')?.value || '';
      const listEl = document.getElementById('combo-picker-list');
      const countEl = document.getElementById('lbl-picker-count');
      if (!listEl) return;

      // 1. Lọc danh sách Combos (Ưu tiên hiển thị combo)
      let availableCombos = [];
      if (prov === '' || prov === '__combos__') {
        availableCombos = combos.filter(cb => {
          // Không cho phép chọn chính combo đang chỉnh sửa (tránh self-loop)
          if (comboEditingId && cb.comboId === comboEditingId) return false;
          if (search) {
            const key = ('combo:' + cb.comboId).toLowerCase();
            const name = (cb.name || '').toLowerCase();
            const desc = (cb.description || '').toLowerCase();
            if (!key.includes(search) && !name.includes(search) && !desc.includes(search)) return false;
          }
          return true;
        });
      }

      // 2. Lọc danh sách Models thông thường theo provider và tính năng
      let filteredModels = [];
      if (prov !== '__combos__' && comboPickerActiveFilter !== 'combos') {
        filteredModels = models.filter(m => {
          if (prov && m.providerId !== prov) return false;
          if (comboPickerActiveFilter === 'free' && !m.isTrueFree) return false;
          if (comboPickerActiveFilter === 'tools' && !(m.capabilities || []).includes('tools')) return false;
          if (comboPickerActiveFilter === 'vision' && !(m.capabilities || []).includes('vision')) return false;
          if (search) {
            const key = \`\${m.providerId}/\${m.modelId}\`.toLowerCase();
            const pPreset = presets.find(x => x.id === m.providerId);
            const pName = (pPreset?.name || '').toLowerCase();
            if (!key.includes(search) && !pName.includes(search)) return false;
          }
          return true;
        });
      }

      const totalItems = availableCombos.length + filteredModels.length;
      if (countEl) {
        countEl.textContent = \`\${availableCombos.length} combos • \${filteredModels.length} models\`;
      }

      if (totalItems === 0) {
        listEl.innerHTML = \`<div style="color:var(--text-muted); font-size:11px; padding:16px; text-align:center;">\${currentLang === 'vi' ? 'Không tìm thấy combo hoặc model phù hợp.' : 'No matching combos or models found.'}</div>\`;
        return;
      }

      let html = '';

      // --- SECTION 1: ƯU TIÊN HIỂN THỊ COMBOS LÊN ĐẦU ---
      if (availableCombos.length > 0) {
        html += \`
          <div style="position:sticky; top:0; z-index:2; background:var(--card-bg); border-left:3px solid var(--accent); padding:4px 8px; margin:2px 0 6px; display:flex; align-items:center; justify-content:space-between; border-radius:0 4px 4px 0;">
            <span style="font-size:11px; font-weight:700; color:var(--accent); letter-spacing:0.5px;">🔀 \${currentLang === 'vi' ? 'CUSTOM COMBOS (ƯU TIÊN)' : 'CUSTOM COMBOS (PRIORITY)'}</span>
            <span class="badge badge-purple" style="font-size:9px; padding:1px 5px;">\${availableCombos.length}</span>
          </div>
        \`;
        for (const cb of availableCombos) {
          const comboKey = 'combo:' + cb.comboId;
          const inChain = tempComboChain.includes(comboKey);
          const modelCount = (cb.models || []).length;
          html += \`
            <div class="combo-picker-card" style="border:1px solid rgba(99, 102, 241, 0.25); background:rgba(99, 102, 241, 0.04); margin-bottom:6px;">
              <div style="min-width:0; flex:1; margin-right:8px;">
                <div style="display:flex; align-items:center; gap:6px;">
                  <span style="font-size:12px; font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    \${cb.name}
                  </span>
                  <span class="badge badge-purple" style="font-size:9px; padding:0 4px; flex-shrink:0;">🔀 Combo</span>
                </div>
                <div style="display:flex; align-items:center; gap:6px; margin-top:2px;">
                  <code style="font-size:11px; color:var(--accent);">\${comboKey}</code>
                  <span style="font-size:10px; color:var(--text-muted);">• \${modelCount} models</span>
                </div>
                \${cb.description ? \`<div style="font-size:10px; color:var(--text-dim); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">\${cb.description}</div>\` : ''}
              </div>
              \${inChain
                ? \`<button type="button" class="btn btn-outline btn-sm" style="font-size:10px; padding:2px 8px; opacity:0.6;" disabled>✓ \${currentLang === 'vi' ? 'Đã thêm' : 'Added'}</button>\`
                : \`<button type="button" class="btn btn-primary btn-sm" style="font-size:10px; padding:2px 8px;" onclick="addModelToComboChain('\${comboKey}')">+ \${currentLang === 'vi' ? 'Thêm' : 'Add'}</button>\`
              }
            </div>
          \`;
        }
      }

      // --- SECTION 2: PHÂN LOẠI MODEL THEO PROVIDER ---
      if (filteredModels.length > 0) {
        const provGroups = new Map();
        for (const m of filteredModels) {
          if (!provGroups.has(m.providerId)) {
            provGroups.set(m.providerId, []);
          }
          provGroups.get(m.providerId).push(m);
        }

        const sortedProvIds = Array.from(provGroups.keys()).sort((a, b) => {
          const nameA = (presets.find(p => p.id === a)?.name || a).toLowerCase();
          const nameB = (presets.find(p => p.id === b)?.name || b).toLowerCase();
          return nameA.localeCompare(nameB);
        });

        for (const provId of sortedProvIds) {
          const provModels = provGroups.get(provId);
          const pr = presets.find(p => p.id === provId);
          const provName = pr ? pr.name : provId;

          html += \`
            <div style="position:sticky; top:0; z-index:1; background:var(--card-bg); border-left:3px solid var(--border-focus); padding:4px 8px; margin:10px 0 4px; display:flex; align-items:center; justify-content:space-between; border-radius:0 4px 4px 0;">
              <span style="font-size:11px; font-weight:700; color:var(--text); letter-spacing:0.3px;">🏢 \${provName} <span style="font-size:10px; font-weight:normal; color:var(--text-muted);">(\${provId})</span></span>
              <span class="badge badge-gray" style="font-size:9px; padding:1px 5px;">\${provModels.length} models</span>
            </div>
          \`;

          for (const m of provModels.slice(0, 50)) {
            const key = \`\${m.providerId}/\${m.modelId}\`;
            const inChain = tempComboChain.includes(key);
            const hasTools = (m.capabilities || []).includes('tools');
            const hasVision = (m.capabilities || []).includes('vision');
            const isFree = m.isTrueFree;

            html += \`
              <div class="combo-picker-card">
                <div style="min-width:0; flex:1; margin-right:8px;">
                  <div style="font-size:12px; font-weight:600; font-family:var(--font-mono); color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    \${m.modelId}
                  </div>
                  <div style="display:flex; align-items:center; gap:4px; margin-top:2px; flex-wrap:wrap;">
                    <span style="font-size:10px; color:var(--text-dim);">\${m.providerId}</span>
                    \${isFree ? '<span class="badge badge-green" style="font-size:9px; padding:0 4px;">100% Free</span>' : ''}
                    \${hasTools ? '<span class="badge badge-blue" style="font-size:9px; padding:0 4px;">🔧 Tools</span>' : ''}
                    \${hasVision ? '<span class="badge badge-yellow" style="font-size:9px; padding:0 4px;">👁️</span>' : ''}
                  </div>
                </div>
                \${inChain 
                  ? \`<button type="button" class="btn btn-outline btn-sm" style="font-size:10px; padding:2px 8px; opacity:0.6;" disabled>✓ \${currentLang === 'vi' ? 'Đã thêm' : 'Added'}</button>\`
                  : \`<button type="button" class="btn btn-primary btn-sm" style="font-size:10px; padding:2px 8px;" onclick="addModelToComboChain('\${key}')">+ \${currentLang === 'vi' ? 'Thêm' : 'Add'}</button>\`
                }
              </div>
            \`;
          }
        }
      }

      listEl.innerHTML = html;
    }

    function addModelToComboChain(val) {
      if (!val) return;
      if (!tempComboChain.includes(val)) {
        tempComboChain.push(val);
        renderTempComboChain();
        filterComboPickerModels();
      }
    }

    function removeModelFromComboChain(idx) {
      tempComboChain.splice(idx, 1);
      renderTempComboChain();
      filterComboPickerModels();
    }

    function moveModelInComboChain(idx, dir) {
      const targetIdx = idx + dir;
      if (targetIdx < 0 || targetIdx >= tempComboChain.length) return;
      const item = tempComboChain.splice(idx, 1)[0];
      tempComboChain.splice(targetIdx, 0, item);
      renderTempComboChain();
    }

    function clearTempComboChain() {
      if (tempComboChain.length === 0) return;
      tempComboChain = [];
      renderTempComboChain();
      filterComboPickerModels();
    }

    function applyComboTemplate(type) {
      if (type === 'coding') {
        const codingCandidates = [
          'gemini/gemini-2.5-flash',
          'gemini/gemini-3.6-flash',
          'groq/qwen/qwen3.8-27b',
          'openrouter/google/gemini-2.0-flash-exp:free',
          'groq/llama-3.3-70b-versatile'
        ];
        tempComboChain = codingCandidates.filter(c => {
          const [p, ...rest] = c.split('/');
          const mid = rest.join('/');
          return models.some(m => m.providerId === p && m.modelId === mid);
        });
        if (tempComboChain.length === 0) {
          tempComboChain = ['gemini/gemini-2.5-flash', 'gemini/gemini-3.6-flash'];
        }
      } else if (type === 'speed') {
        const speedCandidates = [
          'cerebras/llama3.1-8b',
          'groq/llama-3.1-8b-instant',
          'cerebras/llama-3.3-70b',
          'groq/llama-3.3-70b-versatile',
          'gemini/gemini-2.5-flash'
        ];
        tempComboChain = speedCandidates.filter(c => {
          const [p, ...rest] = c.split('/');
          const mid = rest.join('/');
          return models.some(m => m.providerId === p && m.modelId === mid);
        });
        if (tempComboChain.length === 0) {
          tempComboChain = ['groq/llama-3.1-8b-instant', 'gemini/gemini-2.5-flash'];
        }
      } else if (type === 'chat') {
        const chatCandidates = [
          'api-airforce/chatgpt-4o-latest',
          'gemini/gemini-2.5-flash',
          'openrouter/meta-llama/llama-3.3-70b-instruct:free',
          'groq/llama-3.3-70b-versatile'
        ];
        tempComboChain = chatCandidates.filter(c => {
          const [p, ...rest] = c.split('/');
          const mid = rest.join('/');
          return models.some(m => m.providerId === p && m.modelId === mid);
        });
        if (tempComboChain.length === 0) {
          tempComboChain = ['gemini/gemini-2.5-flash'];
        }
      }
      renderTempComboChain();
      filterComboPickerModels();
    }

    function renderTempComboChain() {
      const box = document.getElementById('combo-chain-list');
      const statusEl = document.getElementById('combo-tools-status');
      if (!box) return;

      if (tempComboChain.length === 0) {
        box.innerHTML = \`<div style="color:var(--text-muted); font-size:12px; padding:24px 12px; text-align:center;">
          \${currentLang === 'vi' ? 'Chuỗi đang trống. Hãy chọn combo hoặc model từ bảng bên trái hoặc bấm mẫu 1-Click ở trên!' : 'Chain is empty. Choose combos or models from the left panel or click a 1-Click template above!'}
        </div>\`;
        if (statusEl) statusEl.innerHTML = '';
        return;
      }

      let html = '';
      let toolSupportCount = 0;

      for (let i = 0; i < tempComboChain.length; i++) {
        const fullId = tempComboChain[i];
        const isCombo = fullId.startsWith('combo:');
        let displayName = fullId;
        let subText = '';
        let hasTools = false;
        let isFree = false;
        let hasVision = false;

        if (isCombo) {
          const cId = fullId.slice('combo:'.length);
          const cbObj = combos.find(c => c.comboId === cId);
          displayName = cbObj ? cbObj.name : cId;
          subText = \`combo:\${cId} • \${(cbObj?.models || []).length} models\`;
          if (cbObj && cbObj.models) {
            hasTools = cbObj.models.some(mId => {
              const [p, ...rest] = mId.split('/');
              const mod = rest.join('/');
              return models.some(m => m.providerId === p && m.modelId === mod && (m.capabilities || []).includes('tools'));
            });
          }
        } else {
          const [prov, ...rest] = fullId.split('/');
          const modId = rest.join('/');
          const mObj = models.find(m => m.providerId === prov && m.modelId === modId);
          displayName = modId || fullId;
          subText = prov;
          hasTools = (mObj?.capabilities || []).includes('tools');
          hasVision = (mObj?.capabilities || []).includes('vision');
          isFree = mObj?.isTrueFree;
        }

        if (hasTools) toolSupportCount++;

        const isPrimary = i === 0;
        const rankLabel = isPrimary 
          ? (currentLang === 'vi' ? '★ #1 Ưu Tiên Chính' : '★ #1 Primary') 
          : (currentLang === 'vi' ? \`#\${i + 1} Dự Phòng \${i}\` : \`#\${i + 1} Fallback \${i}\`);
        const rankColor = isPrimary ? 'var(--accent)' : 'var(--text-muted)';
        const rankBg = isPrimary ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.05)';

        html += \`
          <div class="chain-card" style="\${isCombo ? 'border-left: 3px solid #a855f7;' : ''}">
            <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1;">
              <span style="font-size:10px; font-weight:700; color:\${rankColor}; background:\${rankBg}; padding:2px 6px; border-radius:4px; white-space:nowrap;">
                \${rankLabel}
              </span>
              <div style="min-width:0; flex:1;">
                <div style="font-size:12px; font-weight:600; font-family:\${isCombo ? 'var(--font-sans)' : 'var(--font-mono)'}; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                  \${displayName}
                </div>
                <div style="display:flex; align-items:center; gap:4px; margin-top:2px; flex-wrap:wrap;">
                  \${isCombo 
                    ? \`<span class="badge badge-purple" style="font-size:9px; padding:0 4px;">🔀 Combo</span><span style="font-size:10px; color:var(--text-dim); font-family:var(--font-mono);">\${subText}</span>\` 
                    : \`<span style="font-size:10px; color:var(--text-dim);">\${subText}</span>\`}
                  \${isFree ? '<span class="badge badge-green" style="font-size:9px; padding:0 3px;">Free</span>' : ''}
                  \${hasTools ? '<span class="badge badge-blue" style="font-size:9px; padding:0 3px;">🔧 Tools</span>' : '<span style="font-size:9px; color:var(--text-dim);">(No Tools)</span>'}
                  \${hasVision ? '<span class="badge badge-yellow" style="font-size:9px; padding:0 3px;">👁️</span>' : ''}
                </div>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:3px; margin-left:6px; flex-shrink:0;">
              <button type="button" class="chain-btn-move" title="\${currentLang === 'vi' ? 'Đẩy lên trước' : 'Move up'}" onclick="moveModelInComboChain(\${i}, -1)" \${i === 0 ? 'disabled style="opacity:0.25; cursor:not-allowed;"' : ''}>▲</button>
              <button type="button" class="chain-btn-move" title="\${currentLang === 'vi' ? 'Đẩy xuống sau' : 'Move down'}" onclick="moveModelInComboChain(\${i}, 1)" \${i === tempComboChain.length - 1 ? 'disabled style="opacity:0.25; cursor:not-allowed;"' : ''}>▼</button>
              <button type="button" class="btn btn-danger btn-sm" style="padding:1px 6px; font-size:11px; margin-left:4px;" title="\${currentLang === 'vi' ? 'Xóa khỏi chuỗi' : 'Remove'}" onclick="removeModelFromComboChain(\${i})">✕</button>
            </div>
          </div>
        \`;
      }
      box.innerHTML = html;

      if (statusEl) {
        if (toolSupportCount === tempComboChain.length) {
          statusEl.innerHTML = \`<span style="color:var(--success); font-weight:600;">✓ 100% mục (\${toolSupportCount}/\${tempComboChain.length}) hỗ trợ Function Calling / Tools (Sẵn sàng cho VS Code Copilot & Cursor).</span>\`;
        } else if (toolSupportCount > 0) {
          statusEl.innerHTML = \`<span style="color:var(--warning); font-weight:600;">ℹ️ \${toolSupportCount}/\${tempComboChain.length} mục hỗ trợ Tools. Khi IDE gọi function tools, FreeRoute sẽ tự động định tuyến tới các model/combo có Tools.</span>\`;
        } else {
          statusEl.innerHTML = \`<span style="color:var(--error); font-weight:600;">⚠️ Chưa có mục nào hỗ trợ Tools. Nếu dùng cho IDE Copilot/Agent, hãy thêm model có biểu tượng 🔧 Tools (vd: Gemini, Groq Qwen, OpenRouter...).</span>\`;
        }
      }
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
          showToast(currentLang === 'vi' ? 'Lưu combo thành công!' : 'Combo saved successfully!');
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
        const pKeys = providerKeyCounts[c.providerId] || 1;

        html += \`
          <tr>
            <td>
              <div style="font-weight:600; display:flex; align-items:center; gap:8px;">
                \${name}
                <span class=\"badge badge-green\" style=\"font-size:10px;\">\${pKeys} \${currentLang === 'vi' ? 'Khóa' : 'Keys'}</span>
              </div>
              <div style="font-size:11px; color:var(--text-dim); font-family:var(--font-mono);">\${c.providerId}</div>
            </td>
            <td style="font-family:var(--font-mono); color:var(--text-muted);">
              <code>\${c.credentialId || 'default'}</code>
            </td>
            <td style="color:var(--text-muted); font-size:12px;">\${updatedStr}</td>
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

    async function exportKeysBackup() {
      try {
        const res = await fetch('/v1/credentials/export');
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          showToast(err.error?.message || 'Export failed', true);
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const dateStr = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = \`freeroute-keys-backup-\${dateStr}.json\`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(currentLang === 'vi' ? 'Đã xuất file sao lưu JSON thành công!' : 'Key backup exported successfully!');
      } catch (err) {
        showToast(err.message, true);
      }
    }

    function triggerImportBackup() {
      const input = document.getElementById('backup-file-input');
      if (input) {
        input.value = '';
        input.click();
      }
    }

    async function handleBackupFileSelect(input) {
      if (!input.files || input.files.length === 0) return;
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const text = e.target.result;
          const json = JSON.parse(text);
          showToast(currentLang === 'vi' ? 'Đang nạp file backup...' : 'Restoring backup...');
          const res = await fetch('/v1/credentials/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(json)
          });
          if (res.ok) {
            const data = await res.json();
            showToast(currentLang === 'vi' ? \`Đã khôi phục thành công \${data.count} khóa API!\` : \`Successfully restored \${data.count} API keys!\`);
            await refreshAllData();
          } else {
            const err = await res.json();
            showToast(err.error?.message || 'Restore failed', true);
          }
        } catch (err) {
          showToast('Lỗi đọc file JSON: ' + err.message, true);
        }
      };
      reader.readAsText(file);
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
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:16px;">' + (currentLang === 'vi' ? 'Không tìm thấy key nào.' : 'No sources found.') + '</td></tr>';
        return;
      }
      let html = '';
      for (let i = 0; i < detectedSources.length; i++) {
        const s = detectedSources[i];
        const isImported = Boolean(s.alreadyImported);
        const statusBadge = isImported
          ? \`<span class="badge badge-gray">\${t('syncStatusImported')}</span>\`
          : \`<span class="badge badge-green">\${t('syncStatusNew')}</span>\`;
        html += \`
          <tr style="\${isImported ? 'opacity:0.6;' : ''}">
            <td><input type="checkbox" class="sync-chk" value="\${s.providerId}" \${isImported ? '' : 'checked'}></td>
            <td><strong>\${s.name || s.providerId}</strong></td>
            <td><span class="badge \${s.source === 'omniroute' ? 'badge-blue' : 'badge-purple'}">\${s.source}</span></td>
            <td><code>\${s.maskedKey}</code></td>
            <td>\${statusBadge}</td>
          </tr>
        \`;
      }
      tbody.innerHTML = html;
    }

    function toggleSelectAllSync(master) {
      document.querySelectorAll('.sync-chk').forEach(c => c.checked = master.checked);
    }

    async function quickSyncAll() {
      const newKeys = detectedSources.filter(s => !s.alreadyImported);
      if (newKeys.length === 0) {
        showToast(currentLang === 'vi' ? 'Tất cả các key từ máy đã được đồng bộ vào FreeRoute!' : 'All local keys are already synced into FreeRoute!');
        return;
      }

      showToast(currentLang === 'vi' ? 'Đang đồng bộ tất cả key mới...' : 'Syncing all new keys...');
      try {
        const res = await fetch('/v1/import/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ syncAll: true, onlyNew: true })
        });
        if (res.ok) {
          const data = await res.json();
          showToast(currentLang === 'vi' ? \`Đã đồng bộ thành công \${data.count} keys!\` : \`Successfully synced \${data.count} keys!\`);
          await fetchImportSources();
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
    function onPlayModelChange() {
      const sel = document.getElementById('play-model-select');
      const badge = document.getElementById('play-target-badge');
      if (sel && badge) {
        badge.textContent = sel.value;
      }
    }

    function clearPlayOutput() {
      const output = document.getElementById('play-output');
      const statusEl = document.getElementById('play-stream-status');
      const latEl = document.getElementById('play-stream-latency');
      if (output) output.textContent = t('playConsoleInitial');
      if (statusEl) {
        statusEl.className = 'badge badge-gray';
        statusEl.textContent = t('playStatusWaiting');
      }
      if (latEl) latEl.textContent = '';
    }

    function copyPlayResponse() {
      const output = document.getElementById('play-output');
      if (!output) return;
      const text = output.innerText || output.textContent || '';
      if (!text || text === t('playConsoleInitial')) {
        showToast(t('playNothingToCopy'), true);
        return;
      }
      copyToClipboard(text);
    }

    async function sendTestChat() {
      const model = document.getElementById('play-model-select').value;
      const prompt = document.getElementById('play-prompt').value.trim();
      const temp = parseFloat(document.getElementById('play-temp').value) || 0.7;
      const output = document.getElementById('play-output');
      const statusEl = document.getElementById('play-stream-status');
      const latEl = document.getElementById('play-stream-latency');
      const sendBtn = document.getElementById('btn-play-send');

      if (!prompt) return;

      sendBtn.disabled = true;
      if (statusEl) {
        statusEl.className = 'badge badge-yellow';
        statusEl.textContent = t('playStatusStreaming');
      }
      output.textContent = '';
      if (latEl) latEl.textContent = '...';

      const startTime = performance.now();
      let firstTokenTime = null;

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
          if (statusEl) {
            statusEl.className = 'badge badge-red';
            statusEl.textContent = t('playStatusError');
          }
          sendBtn.disabled = false;
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!firstTokenTime) {
            firstTokenTime = performance.now();
            const ttft = Math.round(firstTokenTime - startTime);
            if (latEl) latEl.textContent = 'TTFT: ' + ttft + 'ms';
          }
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
              if (delta) {
                output.textContent += delta;
                output.scrollTop = output.scrollHeight;
              }
            } catch (e) {}
          }
        }

        const totalTime = ((performance.now() - startTime) / 1000).toFixed(2);
        const ttft = firstTokenTime ? Math.round(firstTokenTime - startTime) : Math.round(performance.now() - startTime);
        if (latEl) latEl.textContent = 'TTFT: ' + ttft + 'ms • Total: ' + totalTime + 's';
        if (statusEl) {
          statusEl.className = 'badge badge-green';
          statusEl.textContent = t('playStatusDone');
        }
        await refreshMonitoring();
      } catch (err) {
        output.textContent = 'Request failed: ' + err.message;
        if (statusEl) {
          statusEl.className = 'badge badge-red';
          statusEl.textContent = t('playStatusError');
        }
      } finally {
        sendBtn.disabled = false;
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
