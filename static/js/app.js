/* ===================================================================
   app.js — SPA Router, Navigation, Shared Utilities
   =================================================================== */

// ---------------------------------------------------------------------------
// Shared State
// ---------------------------------------------------------------------------
const App = {
  data: null,        // Collector data from /api/data
  history: null,     // Cost history from /api/history
  currentView: null, // Active view name
  refreshTimer: null,
  currency: {        // Currency display settings
    code: 'USD',
    symbol: '$',
    rate: 1.0,       // Exchange rate from USD
  },
  branding: {        // Custom branding
    name: 'Pinchy',
    hasIcon: false,
    iconUrl: null,    // '/api/settings/icon' if custom icon exists
    emoji: '\uD83E\uDD9E', // default crab emoji 🦞
  },
};

// ---------------------------------------------------------------------------
// Navigation config (default order, icons, labels)
// ---------------------------------------------------------------------------

const NAV_ITEMS = {
  chat:      { label: 'Chat',      icon: '<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>' },
  dashboard: { label: 'Dashboard', icon: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>' },
  agent:     { label: 'Agent',     icon: '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>' },
  calendar:  { label: 'Calendar',  icon: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>' },
  learning:  { label: 'Learning',  icon: '<path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>' },
  goals:     { label: 'Goals',     icon: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>' },
  content:   { label: 'Content',   icon: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>' },
  sessions:  { label: 'Sessions',  icon: '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>' },
};

const DEFAULT_NAV_ORDER = ['chat', 'dashboard', 'agent', 'calendar', 'learning', 'goals', 'content', 'sessions'];

function getNavOrder() {
  try {
    const saved = localStorage.getItem('pinchy_nav_order');
    if (saved) {
      const order = JSON.parse(saved);
      // Validate: must contain all known keys
      const allKeys = Object.keys(NAV_ITEMS);
      if (Array.isArray(order) && allKeys.every(k => order.includes(k))) {
        return order;
      }
    }
  } catch { /* corrupt data, use default */ }
  return [...DEFAULT_NAV_ORDER];
}

function saveNavOrder(order) {
  localStorage.setItem('pinchy_nav_order', JSON.stringify(order));
}

function renderSidebarNav() {
  const nav = document.getElementById('sidebarNav');
  if (!nav) return;
  const order = getNavOrder();
  nav.innerHTML = order.map(key => {
    const item = NAV_ITEMS[key];
    if (!item) return '';
    return `<a href="#${key}" class="nav-item" data-view="${key}">
      <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${item.icon}</svg>
      <span class="nav-label">${item.label}</span>
    </a>`;
  }).join('');
}

// Currency symbol map
const CURRENCY_SYMBOLS = {
  USD: '$', GBP: '\u00a3', EUR: '\u20ac', CAD: 'C$', AUD: 'A$',
  JPY: '\u00a5', CHF: 'CHF ', SEK: 'kr', NOK: 'kr', DKK: 'kr',
  NZD: 'NZ$', ZAR: 'R', INR: '\u20b9', BRL: 'R$', MXN: 'MX$',
  PLN: 'z\u0142', CZK: 'K\u010d', HUF: 'Ft', TRY: '\u20ba',
};

// ---------------------------------------------------------------------------
// API Helpers
// ---------------------------------------------------------------------------

async function apiFetch(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`API error (${url}):`, err);
    return null;
  }
}

async function apiPost(url, body) {
  return apiFetch(url, { method: 'POST', body: JSON.stringify(body) });
}

async function apiPut(url, body) {
  return apiFetch(url, { method: 'PUT', body: JSON.stringify(body) });
}

async function apiDelete(url) {
  return apiFetch(url, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Formatting Helpers
// ---------------------------------------------------------------------------

function formatNumber(n) {
  if (n == null) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function currencySymbol() {
  return App.currency.symbol || CURRENCY_SYMBOLS[App.currency.code] || App.currency.code + ' ';
}

function convertCost(usdAmount) {
  return (usdAmount || 0) * (App.currency.rate || 1);
}

function formatCost(n) {
  const sym = currencySymbol();
  if (n == null) return sym + '0.00';
  return sym + convertCost(n).toFixed(2);
}

function formatCostPrecise(n) {
  const sym = currencySymbol();
  if (n == null) return sym + '0.000';
  return sym + convertCost(n).toFixed(3);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return '';
  }
}

function uptimeStr(ms) {
  if (!ms) return '--';
  const hours = Math.floor(ms / 3600000);
  const mins  = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function getTypeEmoji(type) {
  const map = { decision: 'tag-accent', lesson: 'tag-warning', observation: 'tag-purple' };
  return map[type] || 'tag-muted';
}

function getTypeLabel(type) {
  const map = { decision: 'Decision', lesson: 'Lesson', observation: 'Observation' };
  return map[type] || type || 'Note';
}

// ---------------------------------------------------------------------------
// Search helper
// ---------------------------------------------------------------------------

function matchesSearch(text, query) {
  if (!query) return true;
  return (text || '').toLowerCase().includes(query.toLowerCase());
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function searchBoxHTML(placeholder = 'Search...', id = 'searchInput') {
  return `
    <div class="search-box">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input type="text" id="${id}" placeholder="${placeholder}" autocomplete="off">
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Data Loading
// ---------------------------------------------------------------------------

async function loadDashboardData() {
  const [data, history, settings] = await Promise.all([
    apiFetch('/api/data'),
    apiFetch('/api/history'),
    apiFetch('/api/settings'),
  ]);
  App.data = data || {};
  App.history = history || { daily: {} };

  // Load currency settings
  if (settings) {
    const code = settings.currency || 'USD';
    App.currency.code = code;
    App.currency.symbol = CURRENCY_SYMBOLS[code] || code + ' ';
    App.currency.rate = settings.exchange_rate || 1.0;
    // Branding
    App.branding.name = settings.bot_name || 'Pinchy';
    App.branding.hasIcon = !!settings.has_custom_icon;
    App.branding.iconUrl = settings.has_custom_icon ? '/api/settings/icon?t=' + Date.now() : null;
  }

  updateAgentBadge();
  updateRefreshTime();
  applyBranding();
  return App.data;
}

function updateRefreshTime() {
  const el = document.getElementById('refreshTime');
  if (el) el.textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function updateAgentBadge() {
  const badge = document.getElementById('agentBadge');
  if (!badge) return;
  const dot = badge.querySelector('.status-dot');
  const text = badge.querySelector('.status-text');

  if (App.data && App.data.agentStatus) {
    const s = App.data.agentStatus;
    if (s.running) {
      dot.className = 'status-dot online';
      text.textContent = 'Agent Online';
    } else {
      dot.className = 'status-dot warning';
      text.textContent = 'Agent Offline';
    }
  } else if (App.data && App.data.uptimeMs) {
    dot.className = 'status-dot online';
    text.textContent = `Up ${uptimeStr(App.data.uptimeMs)}`;
  } else {
    dot.className = 'status-dot offline';
    text.textContent = 'No data';
  }
}

// ---------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------

function applyBranding() {
  // Sidebar brand name
  const brandText = document.querySelector('.brand-text');
  if (brandText) brandText.textContent = App.branding.name;

  // Sidebar brand icon
  const brandIcon = document.querySelector('.brand-icon');
  if (brandIcon) {
    if (App.branding.hasIcon && App.branding.iconUrl) {
      brandIcon.innerHTML = `<img src="${App.branding.iconUrl}" alt="" class="brand-icon-img" />`;
    } else {
      brandIcon.textContent = App.branding.emoji;
    }
  }

  // Page title
  document.title = App.branding.name + ' Dashboard';
}

/** Returns HTML for the bot's avatar — used in chat bubbles */
function botAvatarHTML() {
  if (App.branding.hasIcon && App.branding.iconUrl) {
    return `<div class="chat-avatar"><img src="${App.branding.iconUrl}" alt="" class="chat-avatar-img" /></div>`;
  }
  return `<div class="chat-avatar">${App.branding.emoji}</div>`;
}

/** Returns the bot name for display */
function botName() {
  return App.branding.name || 'Pinchy';
}

// ---------------------------------------------------------------------------
// SPA Router
// ---------------------------------------------------------------------------

const views = {};

function registerView(name, renderFn) {
  views[name] = renderFn;
}

async function navigateTo(viewName) {
  if (!viewName || !views[viewName]) viewName = 'chat';

  // Destroy charts from previous view
  if (typeof destroyAllCharts === 'function') destroyAllCharts();

  App.currentView = viewName;

  // Update nav highlights
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === viewName);
  });

  // Update page title
  const titles = {
    dashboard: 'Dashboard',
    sessions: 'Sessions',
    chat: 'Chat',
    goals: 'Goals',
    content: 'Content',
    learning: 'Learning Log',
    calendar: 'Calendar',
    agent: 'Agent',
    settings: 'Settings',
  };
  document.getElementById('pageTitle').textContent = titles[viewName] || viewName;

  // Render view
  const container = document.getElementById('viewContainer');
  container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading...</p></div>';

  try {
    await loadDashboardData();
    const html = await views[viewName]();
    container.innerHTML = html;
    container.classList.add('fade-in');
    // Re-trigger animation
    void container.offsetWidth;
  } catch (err) {
    console.error('View render error:', err);
    container.innerHTML = `<div class="empty-state"><p>Error loading view: ${err.message}</p></div>`;
  }
}

/**
 * Background-only refresh: updates App.data / App.history and sidebar badges
 * without destroying or re-rendering the current view's DOM.
 */
async function backgroundRefresh() {
  try {
    await loadDashboardData();
  } catch {
    // silent — background refresh should never disrupt the user
  }
}

function handleHashChange() {
  const hash = window.location.hash.replace('#', '') || 'chat';
  navigateTo(hash);
}

// ---------------------------------------------------------------------------
// Mobile sidebar toggle
// ---------------------------------------------------------------------------

function setupMobileNav() {
  const toggle = document.getElementById('mobileToggle');
  const sidebar = document.getElementById('sidebar');
  if (!toggle || !sidebar) return;

  // Create backdrop element
  let backdrop = document.querySelector('.sidebar-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);
  }

  function openSidebar() {
    sidebar.classList.add('open');
    backdrop.classList.add('visible');
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    backdrop.classList.remove('visible');
  }

  toggle.addEventListener('click', () => {
    if (sidebar.classList.contains('open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });

  // Close sidebar when clicking backdrop
  backdrop.addEventListener('click', closeSidebar);

  // Close sidebar when clicking a nav item on mobile
  sidebar.addEventListener('click', (e) => {
    if (e.target.closest('.nav-item') && window.innerWidth <= 768) {
      closeSidebar();
    }
  });
}

// ---------------------------------------------------------------------------
// Onboarding (Multi-step wizard)
// ---------------------------------------------------------------------------

const _onboarding = {
  step: 1,
  connected: false,
  calendarEvents: [],
  calendarOk: false,
};

async function checkOnboarding() {
  const settings = await apiFetch('/api/settings');
  if (!settings) return; // API unavailable, skip

  // If server says onboarding is already complete, skip
  if (settings.onboarding_complete) return;

  // If gateway URL is set (from env or config), no onboarding needed
  if (settings.gateway_url) return;

  showOnboarding(settings);
}

function showOnboarding(settings) {
  const overlay = document.getElementById('onboardingOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';

  _onboarding.step = 1;
  _onboarding.settings = settings;

  // If token is already from env, note it
  _onboarding.tokenFromEnv = settings.has_token && settings.source_token === 'env';

  _renderOnboardingStep();
}

function _renderOnboardingStep() {
  const body = document.getElementById('onboardingBody');
  const titleEl = document.getElementById('onboardingTitle');
  const subtitleEl = document.getElementById('onboardingSubtitle');
  if (!body) return;

  const step = _onboarding.step;

  // Update step indicators
  document.querySelectorAll('.onboarding-step').forEach(el => {
    const s = parseInt(el.dataset.step);
    el.classList.remove('active', 'done');
    if (s === step) el.classList.add('active');
    else if (s < step) el.classList.add('done');
  });
  document.querySelectorAll('.onboarding-step-line').forEach((el, i) => {
    el.classList.toggle('done', i + 1 < step);
  });

  if (step === 1) _renderStep1(body, titleEl, subtitleEl);
  else if (step === 2) _renderStep3(body, titleEl, subtitleEl);
  else if (step === 3) _renderStep4(body, titleEl, subtitleEl);
}

// --- Step 1: Gateway Connection ---
function _renderStep1(body, titleEl, subtitleEl) {
  titleEl.textContent = 'Connect to OpenClaw';
  subtitleEl.textContent = 'Enter your OpenClaw Gateway URL and token.';

  body.innerHTML = `
    <div class="form-group">
      <label class="form-label">Gateway URL</label>
      <input class="form-input" id="obUrl" type="url" placeholder="http://192.168.x.x:18789" autocomplete="off" />
      <p style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">
        Your OpenClaw Gateway address, e.g. <code style="background:var(--bg-card);padding:1px 4px;border-radius:3px;">http://192.168.1.100:18789</code>
      </p>
    </div>
    <div class="form-group">
      <label class="form-label">Gateway Token <span style="color:var(--text-muted);font-weight:400;">${_onboarding.tokenFromEnv ? '(auto-detected from ENV)' : '(optional if auto-detected)'}</span></label>
      <input class="form-input" id="obToken" type="password" placeholder="${_onboarding.tokenFromEnv ? 'Token auto-detected from environment' : 'Paste your Gateway auth token'}" autocomplete="off" ${_onboarding.tokenFromEnv ? 'disabled' : ''} />
    </div>
    <div id="obMsg" style="display:none;margin-bottom:16px;"></div>
    <div style="display:flex;gap:10px;">
      <button class="btn btn-primary" id="obConnectBtn" style="flex:1;">Test & Continue</button>
      <button class="btn btn-ghost" id="obSkipBtn">Skip setup</button>
    </div>
  `;

  const connectBtn = document.getElementById('obConnectBtn');
  const skipBtn = document.getElementById('obSkipBtn');

  skipBtn.addEventListener('click', () => _finishOnboarding(true));

  connectBtn.addEventListener('click', async () => {
    const url = (document.getElementById('obUrl').value || '').trim();
    if (!url) return _obMsg('Please enter your Gateway URL.', 'error');
    if (!url.startsWith('http://') && !url.startsWith('https://'))
      return _obMsg('URL must start with http:// or https://', 'error');

    connectBtn.disabled = true;
    connectBtn.textContent = 'Connecting...';
    _obMsg('Saving and testing connection...', 'info');

    const saveBody = { gateway_url: url };
    const tokenVal = document.getElementById('obToken').value.trim();
    if (tokenVal && !_onboarding.tokenFromEnv) saveBody.gateway_token = tokenVal;

    const saveResp = await apiPost('/api/settings', saveBody);
    if (!saveResp || !saveResp.saved) {
      _obMsg('Failed to save settings.', 'error');
      connectBtn.disabled = false;
      connectBtn.textContent = 'Test & Continue';
      return;
    }

    const testResp = await apiPost('/api/settings/test', {});
    connectBtn.disabled = false;
    connectBtn.textContent = 'Test & Continue';

    if (testResp && testResp.ok) {
      _onboarding.connected = true;
      _obMsg('Connected successfully!', 'success');
      setTimeout(() => { _onboarding.step = 2; _renderOnboardingStep(); }, 600);
    } else {
      const err = (testResp && testResp.error) || 'Could not connect.';
      _obMsg('Settings saved. ' + err, 'error');
      // Allow continuing anyway — skip to calendar step
      skipBtn.textContent = 'Continue anyway';
      skipBtn.onclick = () => { _onboarding.step = 2; _renderOnboardingStep(); };
    }
  });

  // Enter key
  ['obUrl', 'obToken'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); connectBtn.click(); }
    });
  });
}

// --- Step 2 (Calendar Discovery, was Step 3) ---
function _renderStep3(body, titleEl, subtitleEl) {
  titleEl.textContent = 'Calendar Setup';
  subtitleEl.textContent = 'Discover calendars from your OpenClaw mount.';

  body.innerHTML = `
    <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:16px;">
      ${botName()} can read calendar data from mounted .ics files or by asking your OpenClaw agent directly.
    </p>
    <div id="obCalendarList" style="margin-bottom:12px;">
      <div style="padding:12px;text-align:center;font-size:0.85rem;color:var(--text-muted);">
        <div class="spinner" style="margin:0 auto 8px;"></div>
        Scanning for calendars...
      </div>
    </div>
    <div id="obMsg" style="display:none;margin-bottom:16px;margin-top:12px;"></div>
    <div style="display:flex;gap:10px;margin-top:16px;">
      <button class="btn btn-ghost" id="obBackBtn">Back</button>
      <button class="btn btn-primary" id="obNextBtn" style="flex:1;" disabled>Continue</button>
      <button class="btn btn-ghost" id="obSkipBtn">Skip</button>
    </div>
  `;

  document.getElementById('obBackBtn').addEventListener('click', () => { _onboarding.step = 1; _renderOnboardingStep(); });
  document.getElementById('obSkipBtn').addEventListener('click', () => { _onboarding.step = 3; _renderOnboardingStep(); });

  const nextBtn = document.getElementById('obNextBtn');
  nextBtn.addEventListener('click', async () => {
    // Save enabled calendars
    const checked = document.querySelectorAll('.ob-cal-checkbox:checked');
    const enabled = Array.from(checked).map(cb => cb.value);
    await apiPost('/api/settings', { enabled_calendars: enabled });
    _onboarding.calendarOk = enabled.length > 0;
    _onboarding.calendarEvents = enabled;
    _onboarding.step = 3;
    _renderOnboardingStep();
  });

  // Auto-discover calendars
  _discoverOnboardingCalendars();
}

async function _discoverOnboardingCalendars() {
  const listEl = document.getElementById('obCalendarList');
  const nextBtn = document.getElementById('obNextBtn');
  if (!listEl) return;

  const resp = await apiFetch('/api/calendars/discover');
  if (!resp || !resp.found) {
    listEl.innerHTML = `
      <div style="padding:16px;text-align:center;font-size:0.85rem;color:var(--text-muted);border:1px dashed var(--border-subtle);border-radius:8px;">
        <p style="margin-bottom:8px;"><strong>No calendars found</strong></p>
        <p>Could not find calendar files or reach your OpenClaw agent.</p>
        <p style="margin-top:8px;font-size:0.78rem;">You can set this up later in Settings if you have a Calendar Data volume mount, or once the Gateway is connected.</p>
      </div>
    `;
    if (nextBtn) nextBtn.disabled = false; // let them skip
    _obMsg('You can set this up later in Settings.', 'info');
    return;
  }

  const isGateway = resp.source === 'gateway';
  const calendars = resp.calendars || [];
  listEl.innerHTML = `
    ${isGateway ? `<div style="padding:8px 14px;font-size:0.78rem;color:var(--primary);background:var(--primary-dim);border-radius:8px 8px 0 0;border:1px solid rgba(72,219,251,0.15);border-bottom:none;">Calendars discovered via your OpenClaw agent (no direct mount needed)</div>` : ''}
    <div style="border:1px solid var(--border-subtle);border-radius:${isGateway ? '0 0 8px 8px' : '8px'};overflow:hidden;">
      ${calendars.map(cal => `
        <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border-subtle);cursor:pointer;transition:background 0.15s;" 
               onmouseover="this.style.background='var(--bg-card)'" onmouseout="this.style.background='transparent'">
          <input type="checkbox" class="ob-cal-checkbox" value="${escapeAttr(cal.id)}" checked 
                 style="width:18px;height:18px;accent-color:var(--primary);" />
          <div style="flex:1;">
            <div style="font-weight:500;font-size:0.88rem;">${escapeAttr(cal.name)}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);">${cal.event_count === '?' ? 'via agent' : cal.event_count + ' event file(s)'}</div>
          </div>
          ${cal.color ? `<div style="width:12px;height:12px;border-radius:50%;background:${escapeAttr(cal.color)};"></div>` : ''}
        </label>
      `).join('')}
    </div>
  `;

  _obMsg(`Found ${calendars.length} calendar(s)${isGateway ? ' via your agent' : ''}!`, 'success');
  if (nextBtn) nextBtn.disabled = false;
}

// --- Step 4: Done ---
function _renderStep4(body, titleEl, subtitleEl) {
  titleEl.textContent = 'You\'re All Set!';
  subtitleEl.textContent = botName() + ' is ready to go.';

  body.innerHTML = `
    <div class="onboarding-summary">
      <div class="onboarding-summary-row">
        <span class="label">Gateway</span>
        <span class="value ${_onboarding.connected ? 'ok' : 'warn'}">${_onboarding.connected ? 'Connected' : 'Not tested'}</span>
      </div>
      <div class="onboarding-summary-row">
        <span class="label">Calendar</span>
        <span class="value ${_onboarding.calendarOk ? 'ok' : 'warn'}">${_onboarding.calendarOk ? _onboarding.calendarEvents.length + ' calendar(s) enabled' : 'Not configured'}</span>
      </div>
    </div>
    <p style="font-size:0.85rem;color:var(--text-muted);margin:16px 0;">
      You can change all of these in <a href="#settings" style="color:var(--primary);">Settings</a> at any time.
    </p>
    <button class="btn btn-primary" id="obFinishBtn" style="width:100%;">Launch Dashboard</button>
  `;

  document.getElementById('obFinishBtn').addEventListener('click', () => _finishOnboarding(false));
}

// --- Helpers ---
function _obMsg(text, type) {
  const el = document.getElementById('obMsg');
  if (!el) return;
  const colors = {
    success: { bg: 'var(--success-dim)', border: 'rgba(29,209,161,0.25)', color: 'var(--success)' },
    error:   { bg: 'var(--accent-dim)',  border: 'rgba(255,107,107,0.25)', color: 'var(--accent)' },
    info:    { bg: 'var(--primary-dim)', border: 'rgba(72,219,251,0.25)',  color: 'var(--primary)' },
  };
  const c = colors[type] || colors.info;
  el.style.display = 'block';
  el.style.padding = '10px 14px';
  el.style.borderRadius = '8px';
  el.style.fontSize = '0.85rem';
  el.style.background = c.bg;
  el.style.border = `1px solid ${c.border}`;
  el.style.color = c.color;
  el.textContent = text;
}

async function _finishOnboarding(skipped) {
  // Mark onboarding complete server-side
  await apiPost('/api/settings', { onboarding_complete: true });
  const overlay = document.getElementById('onboardingOverlay');
  if (overlay) overlay.style.display = 'none';
  navigateTo(App.currentView || 'chat');
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  renderSidebarNav();
  setupMobileNav();

  // Refresh button
  document.getElementById('btnRefresh')?.addEventListener('click', () => {
    navigateTo(App.currentView);
  });

  // Listen for hash changes
  window.addEventListener('hashchange', handleHashChange);

  // Initial route
  handleHashChange();

  // Check if onboarding is needed
  checkOnboarding();

  // Close any modal by clicking its overlay backdrop
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay') &&
        e.target.classList.contains('open')) {
      e.target.classList.remove('open');
    }
  });

  // Auto-refresh every 60 seconds — background only (no DOM destruction)
  // This prevents flash and keeps modals open
  App.refreshTimer = setInterval(() => {
    if (!App.currentView) return;
    backgroundRefresh();
  }, 60000);
});
