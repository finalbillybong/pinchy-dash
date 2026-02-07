/* ===================================================================
   settings.js — Settings View: Configure Gateway token & URL
   =================================================================== */

registerView('settings', async function renderSettings() {
  const settings = await apiFetch('/api/settings');
  const url = (settings && settings.gateway_url) || '';
  const masked = (settings && settings.gateway_token_masked) || '';
  const hasToken = settings && settings.has_token;
  const srcUrl = (settings && settings.source_url) || 'config';
  const srcToken = (settings && settings.source_token) || 'config';

  // Currency settings
  const currentCurrency = (settings && settings.currency) || 'USD';
  const currentRate = (settings && settings.exchange_rate) || 1.0;
  const rateUpdated = (settings && settings.rate_updated) || '';

  const currencies = [
    { code: 'USD', name: 'US Dollar', symbol: '$' },
    { code: 'GBP', name: 'British Pound', symbol: '\u00a3' },
    { code: 'EUR', name: 'Euro', symbol: '\u20ac' },
    { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
    { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
    { code: 'JPY', name: 'Japanese Yen', symbol: '\u00a5' },
    { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
    { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
    { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
    { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
    { code: 'INR', name: 'Indian Rupee', symbol: '\u20b9' },
    { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
    { code: 'PLN', name: 'Polish Zloty', symbol: 'z\u0142' },
    { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
    { code: 'TRY', name: 'Turkish Lira', symbol: '\u20ba' },
  ];

  // Branding settings
  const botNameVal = (settings && settings.bot_name) || 'Pinchy';
  const hasCustomIcon = settings && settings.has_custom_icon;

  const html = `
    <div style="max-width: 640px;">
      <!-- Branding -->
      <div class="card fade-in" style="margin-bottom: 24px;">
        <div class="card-header">
          <span class="card-title">Branding</span>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 20px; line-height: 1.5;">
          Customise the dashboard name and icon. This appears in the sidebar, page title, and chat.
        </p>

        <div class="form-group">
          <label class="form-label">Bot Name</label>
          <input class="form-input" id="settingsBotName" type="text" maxlength="50" value="${escapeAttr(botNameVal)}" placeholder="Pinchy" autocomplete="off" />
          <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">What your agent is called (e.g. Pinchy, Jarvis, Alfred)</p>
        </div>

        <div class="form-group">
          <label class="form-label">Icon</label>
          <div style="display: flex; align-items: center; gap: 16px;">
            <div class="brand-icon-preview" id="brandIconPreview">
              ${hasCustomIcon ? `<img src="/api/settings/icon?t=${Date.now()}" alt="" class="brand-icon-preview-img" />` : `<span style="font-size: 2rem;">${App.branding.emoji}</span>`}
            </div>
            <div style="flex: 1;">
              <input type="file" id="settingsIconFile" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" style="display:none;" />
              <div style="display: flex; gap: 8px;">
                <button class="btn btn-ghost" id="btnChooseIcon" onclick="document.getElementById('settingsIconFile').click()">Choose Image</button>
                ${hasCustomIcon ? `<button class="btn btn-ghost" style="color: var(--accent);" onclick="removeIcon()">Remove</button>` : ''}
              </div>
              <p style="font-size: 0.72rem; color: var(--text-muted); margin-top: 6px;">PNG, JPG, GIF, WebP, or SVG. Max 512 KB. Square images work best.</p>
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 10px; margin-top: 20px;">
          <button class="btn btn-primary" id="btnSaveBranding" onclick="saveBranding()">Save Branding</button>
        </div>

        <div id="brandingMessage" style="margin-top: 16px; display: none;"></div>
      </div>

      <!-- Currency Settings -->
      <div class="card fade-in" style="margin-bottom: 24px;">
        <div class="card-header">
          <span class="card-title">Currency</span>
          <span class="tag tag-primary">${currentCurrency}</span>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 20px; line-height: 1.5;">
          All costs are calculated in USD by the collector. Choose your local currency and the dashboard will convert automatically using the exchange rate.
        </p>

        <div class="form-group">
          <label class="form-label">Display Currency</label>
          <select class="form-select" id="settingsCurrency">
            ${currencies.map(c => `<option value="${c.code}" ${c.code === currentCurrency ? 'selected' : ''}>${c.symbol} ${c.name} (${c.code})</option>`).join('')}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Exchange Rate (1 USD = ?)</label>
          <div style="display: flex; gap: 10px; align-items: flex-start;">
            <div style="flex: 1;">
              <input class="form-input" id="settingsExchangeRate" type="number" step="0.0001" min="0.0001" value="${currentRate}" />
              ${rateUpdated ? `<p style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px;">Last updated: ${formatDate(rateUpdated) || rateUpdated}</p>` : ''}
            </div>
            <button class="btn btn-ghost" id="btnFetchRate" onclick="fetchLiveRate()" style="white-space: nowrap; margin-top: 0;">Fetch Live Rate</button>
          </div>
        </div>

        <div style="display: flex; gap: 10px; margin-top: 20px;">
          <button class="btn btn-primary" onclick="saveCurrency()">Save Currency</button>
        </div>

        <div id="currencyMessage" style="margin-top: 16px; display: none;"></div>
      </div>

      <!-- Calendar -->
      <div class="card fade-in" style="margin-bottom: 24px;">
        <div class="card-header">
          <span class="card-title">Calendar</span>
          <span class="tag tag-muted" id="calendarBadge">${(App.data && App.data.calendar && App.data.calendar.length > 0) ? App.data.calendar.length + ' events' : 'No events'}</span>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 20px; line-height: 1.5;">
          ${botName()} can read calendar data from mounted .ics files or by asking your OpenClaw agent directly via the Gateway.
          Click Discover to find available calendars.
        </p>

        <div class="form-group" id="calendarPathGroup">
          <label class="form-label">Calendar Data Path <span style="color:var(--text-muted);font-weight:400;">(advanced — only needed for direct ICS mount)</span></label>
          <input class="form-input" id="settingsCalendarPath" type="text" 
                 value="${escapeAttr((settings && settings.calendar_path) || '/calendars')}" 
                 placeholder="/calendars" autocomplete="off" />
          <p style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px;">
            Path inside this container where calendar data is mounted. Leave blank to use the Gateway fallback.
          </p>
        </div>

        <div id="calendarDiscoverList" style="margin-bottom: 16px;">
          ${(settings && settings.enabled_calendars && settings.enabled_calendars.length > 0) ? `
            <div style="padding: 12px 14px; font-size: 0.85rem; color: var(--text-secondary); border: 1px solid var(--border-subtle); border-radius: 8px;">
              <strong>${settings.enabled_calendars.length} calendar(s) enabled:</strong>
              <span style="color: var(--text-muted); margin-left: 6px;">${settings.enabled_calendars.map(c => c.replace(/_/g, ' ')).join(', ')}</span>
            </div>
          ` : `
            <div style="padding: 16px; text-align: center; font-size: 0.85rem; color: var(--text-muted); border: 1px dashed var(--border-subtle); border-radius: 8px;">
              Click "Discover Calendars" to scan for available calendars.
            </div>
          `}
        </div>

        <div style="display: flex; gap: 10px;">
          <button class="btn btn-primary" id="btnCalendarDiscover" onclick="discoverCalendars()">${(settings && settings.enabled_calendars && settings.enabled_calendars.length > 0) ? 'Re-discover Calendars' : 'Discover Calendars'}</button>
          <button class="btn btn-ghost" id="btnCalendarSave" onclick="saveCalendarSettings()" style="display:none;">Save Selection</button>
        </div>

        <div id="calendarMessage" style="margin-top: 16px; display: none;"></div>
      </div>

      <!-- Gateway Settings -->
      <div class="card fade-in" style="margin-bottom: 24px;">
        <div class="card-header">
          <span class="card-title">OpenClaw Gateway</span>
          <span class="tag ${hasToken ? 'tag-success' : 'tag-warning'}">${hasToken ? (srcToken === 'env' ? 'Token from ENV' : 'Token set') : 'No token'}</span>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 20px; line-height: 1.5;">
          Configure the connection to your OpenClaw Gateway. This is needed for the Chat feature.
          Settings are saved to <code style="background: var(--bg-deep); padding: 1px 5px; border-radius: 4px; font-size: 0.82rem;">data/config.json</code> on the server.
        </p>

        <div class="form-group">
          <label class="form-label">
            Gateway URL
            ${srcUrl === 'env' ? '<span class="tag tag-muted" style="margin-left: 6px; font-size: 0.65rem;">FROM ENV</span>' : ''}
          </label>
          <input
            class="form-input"
            id="settingsGatewayUrl"
            type="url"
            placeholder="http://localhost:18789"
            value="${escapeAttr(url)}"
            ${srcUrl === 'env' ? 'disabled title="Set via OPENCLAW_GATEWAY_URL env var"' : ''}
          />
          <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">
            The address of your OpenClaw Gateway (e.g. http://localhost:18789)
          </p>
        </div>

        <div class="form-group">
          <label class="form-label">
            Gateway Token
            ${srcToken === 'env' ? '<span class="tag tag-muted" style="margin-left: 6px; font-size: 0.65rem;">FROM ENV</span>' : ''}
          </label>
          <div style="position: relative;">
            <input
              class="form-input"
              id="settingsGatewayToken"
              type="password"
              placeholder="${hasToken ? 'Token is set (enter new value to change)' : 'Paste your Gateway auth token here'}"
              autocomplete="off"
              ${srcToken === 'env' ? 'disabled title="Set via OPENCLAW_GATEWAY_TOKEN env var"' : ''}
            />
            <button
              class="settings-toggle-vis"
              id="toggleTokenVis"
              type="button"
              title="Show/hide token"
              style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px;"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>
          ${hasToken && srcToken !== 'env' ? `<p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Current: <code style="background: var(--bg-deep); padding: 1px 5px; border-radius: 4px; font-size: 0.78rem;">${masked}</code></p>` : ''}
        </div>

        <div style="display: flex; gap: 10px; margin-top: 24px;">
          <button class="btn btn-primary" id="btnSaveSettings" onclick="saveSettings()">Save Settings</button>
          <button class="btn btn-ghost" id="btnTestConnection" onclick="testConnection()">Test Connection</button>
        </div>

        <div id="settingsMessage" style="margin-top: 16px; display: none;"></div>
      </div>

      <!-- Navigation Order -->
      <div class="card fade-in" style="margin-bottom: 24px;">
        <div class="card-header">
          <span class="card-title">Navigation Order</span>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 16px; line-height: 1.5;">
          Drag items to reorder the sidebar menu. Changes are saved instantly.
        </p>
        <div id="navOrderList" class="nav-order-list"></div>
        <div style="margin-top: 12px;">
          <button class="btn btn-ghost" id="btnResetNavOrder" style="font-size: 0.8rem;">Reset to Default</button>
        </div>
      </div>

      <!-- Info card -->
      <div class="card fade-in">
        <div class="card-title" style="margin-bottom: 12px;">Setup Help</div>
        <div style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6;">
          <p style="margin-bottom: 10px;"><strong>1.</strong> Make sure the Chat Completions endpoint is enabled in your OpenClaw Gateway config:</p>
          <pre class="settings-code-block"><code>{ "gateway": { "http": { "endpoints": {
  "chatCompletions": { "enabled": true }
} } } }</code></pre>
          <p style="margin-bottom: 10px;"><strong>2.</strong> Find your Gateway auth token. Depending on your auth mode:</p>
          <ul style="margin-left: 20px; margin-bottom: 10px;">
            <li><code style="background: var(--bg-deep); padding: 1px 5px; border-radius: 4px; font-size: 0.82rem;">gateway.auth.token</code> in your config, or</li>
            <li><code style="background: var(--bg-deep); padding: 1px 5px; border-radius: 4px; font-size: 0.82rem;">OPENCLAW_GATEWAY_TOKEN</code> env var</li>
          </ul>
          <p style="margin-bottom: 10px;"><strong>3.</strong> Paste it above, click <strong>Save</strong>, then <strong>Test Connection</strong> to verify.</p>
          <p><strong>4.</strong> Head to the <a href="#chat" style="color: var(--primary); text-decoration: underline;">Chat</a> page and start talking to your agent.</p>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    const toggleBtn = document.getElementById('toggleTokenVis');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const input = document.getElementById('settingsGatewayToken');
        if (input) {
          input.type = input.type === 'password' ? 'text' : 'password';
        }
      });
    }

    // Auto-set rate to 1 when USD is selected
    const currencySelect = document.getElementById('settingsCurrency');
    if (currencySelect) {
      currencySelect.addEventListener('change', () => {
        if (currencySelect.value === 'USD') {
          document.getElementById('settingsExchangeRate').value = '1';
        }
      });
    }

    // Navigation order (drag to reorder)
    _initNavOrderEditor();

    // Icon file upload handler
    const iconInput = document.getElementById('settingsIconFile');
    if (iconInput) {
      iconInput.addEventListener('change', async () => {
        const file = iconInput.files[0];
        if (!file) return;
        if (file.size > 512 * 1024) {
          showBrandingMessage('File too large. Max 512 KB.', 'error');
          return;
        }
        const formData = new FormData();
        formData.append('icon', file);
        try {
          const resp = await fetch('/api/settings/icon', { method: 'POST', body: formData });
          const data = await resp.json();
          if (data.saved) {
            showBrandingMessage('Icon uploaded!', 'success');
            // Update preview
            const preview = document.getElementById('brandIconPreview');
            if (preview) preview.innerHTML = `<img src="/api/settings/icon?t=${Date.now()}" alt="" class="brand-icon-preview-img" />`;
            // Update App state and sidebar immediately
            App.branding.hasIcon = true;
            App.branding.iconUrl = '/api/settings/icon?t=' + Date.now();
            applyBranding();
          } else {
            showBrandingMessage(data.error || 'Upload failed.', 'error');
          }
        } catch (e) {
          showBrandingMessage('Upload failed: ' + e.message, 'error');
        }
        iconInput.value = '';
      });
    }

  }, 50);

  return html;
});

// ---------------------------------------------------------------------------
// Navigation order editor (drag to reorder, touch-friendly)
// ---------------------------------------------------------------------------

function _initNavOrderEditor() {
  const listEl = document.getElementById('navOrderList');
  const resetBtn = document.getElementById('btnResetNavOrder');
  if (!listEl) return;

  let order = getNavOrder();

  function render() {
    listEl.innerHTML = order.map((key, idx) => {
      const item = NAV_ITEMS[key];
      if (!item) return '';
      return `<div class="nav-order-item" data-key="${key}" draggable="true">
        <span class="nav-order-handle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="18" x2="16" y2="18"/>
          </svg>
        </span>
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;flex-shrink:0;">${item.icon}</svg>
        <span class="nav-order-label">${item.label}</span>
        <span class="nav-order-pos">${idx + 1}</span>
      </div>`;
    }).join('');

    // Drag & drop (desktop)
    let dragSrc = null;
    listEl.querySelectorAll('.nav-order-item').forEach(el => {
      el.addEventListener('dragstart', (e) => {
        dragSrc = el;
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        listEl.querySelectorAll('.nav-order-item').forEach(x => x.classList.remove('drag-over'));
      });
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        listEl.querySelectorAll('.nav-order-item').forEach(x => x.classList.remove('drag-over'));
        el.classList.add('drag-over');
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!dragSrc || dragSrc === el) return;
        const fromKey = dragSrc.dataset.key;
        const toKey = el.dataset.key;
        const fromIdx = order.indexOf(fromKey);
        const toIdx = order.indexOf(toKey);
        order.splice(fromIdx, 1);
        order.splice(toIdx, 0, fromKey);
        _applyOrder();
      });
    });

    // Touch drag support (mobile)
    _initTouchDrag(listEl, order, _applyOrder);
  }

  function _applyOrder() {
    saveNavOrder(order);
    renderSidebarNav();
    render(); // re-render to update position numbers
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      order = [...DEFAULT_NAV_ORDER];
      _applyOrder();
    });
  }

  render();
}

function _initTouchDrag(listEl, order, applyCallback) {
  let touchItem = null;
  let touchClone = null;
  let startY = 0;
  let startIdx = 0;

  listEl.addEventListener('touchstart', (e) => {
    const item = e.target.closest('.nav-order-item');
    if (!item) return;
    touchItem = item;
    startY = e.touches[0].clientY;
    startIdx = [...listEl.children].indexOf(item);
    touchClone = item.cloneNode(true);
    touchClone.classList.add('nav-order-ghost');
    touchClone.style.position = 'fixed';
    touchClone.style.left = item.getBoundingClientRect().left + 'px';
    touchClone.style.top = item.getBoundingClientRect().top + 'px';
    touchClone.style.width = item.offsetWidth + 'px';
    touchClone.style.zIndex = '9999';
    touchClone.style.pointerEvents = 'none';
    document.body.appendChild(touchClone);
    item.style.opacity = '0.3';
  }, { passive: true });

  listEl.addEventListener('touchmove', (e) => {
    if (!touchItem || !touchClone) return;
    e.preventDefault();
    const y = e.touches[0].clientY;
    touchClone.style.top = (touchItem.getBoundingClientRect().top + (y - startY)) + 'px';

    // Highlight drop target
    listEl.querySelectorAll('.nav-order-item').forEach(el => el.classList.remove('drag-over'));
    const target = document.elementFromPoint(e.touches[0].clientX, y);
    const over = target?.closest('.nav-order-item');
    if (over && over !== touchItem) over.classList.add('drag-over');
  }, { passive: false });

  listEl.addEventListener('touchend', (e) => {
    if (!touchItem) return;
    touchItem.style.opacity = '';
    if (touchClone) touchClone.remove();
    touchClone = null;

    // Find where we dropped
    const items = [...listEl.querySelectorAll('.nav-order-item')];
    const overEl = items.find(el => el.classList.contains('drag-over'));
    items.forEach(el => el.classList.remove('drag-over'));

    if (overEl && overEl !== touchItem) {
      const fromKey = touchItem.dataset.key;
      const toKey = overEl.dataset.key;
      const fromIdx = order.indexOf(fromKey);
      const toIdx = order.indexOf(toKey);
      order.splice(fromIdx, 1);
      order.splice(toIdx, 0, fromKey);
      applyCallback();
    }

    touchItem = null;
  });
}

function showSettingsMessage(text, type) {
  const el = document.getElementById('settingsMessage');
  if (!el) return;
  const colors = {
    success: { bg: 'var(--success-dim)', border: 'rgba(29,209,161,0.25)', color: 'var(--success)' },
    error:   { bg: 'var(--accent-dim)',  border: 'rgba(255,107,107,0.25)', color: 'var(--accent)' },
    info:    { bg: 'var(--primary-dim)', border: 'rgba(72,219,251,0.25)',  color: 'var(--primary)' },
  };
  const c = colors[type] || colors.info;
  el.style.display = 'block';
  el.style.padding = '12px 16px';
  el.style.borderRadius = '8px';
  el.style.fontSize = '0.85rem';
  el.style.background = c.bg;
  el.style.border = `1px solid ${c.border}`;
  el.style.color = c.color;
  el.textContent = text;
}

async function saveSettings() {
  const urlEl = document.getElementById('settingsGatewayUrl');
  const tokenEl = document.getElementById('settingsGatewayToken');
  const btn = document.getElementById('btnSaveSettings');

  const body = {};
  if (urlEl && !urlEl.disabled) {
    body.gateway_url = urlEl.value.trim();
  }
  if (tokenEl && !tokenEl.disabled && tokenEl.value) {
    body.gateway_token = tokenEl.value.trim();
  }

  if (Object.keys(body).length === 0) {
    showSettingsMessage('Nothing to save — fields are set via environment variables.', 'info');
    return;
  }

  if (btn) btn.disabled = true;
  const resp = await apiPost('/api/settings', body);
  if (btn) btn.disabled = false;

  if (resp && resp.saved) {
    showSettingsMessage('Settings saved successfully.', 'success');
    // Clear the token input (it's saved, don't leave it visible)
    if (tokenEl) tokenEl.value = '';
    // Update the placeholder to indicate the token is now set
    if (tokenEl && !tokenEl.disabled) {
      tokenEl.placeholder = 'Token is set (enter new value to change)';
    }
    // Update the badge in-place instead of a full re-render
    const badge = document.querySelector('.card-header .tag.tag-success, .card-header .tag.tag-warning');
    if (badge && body.gateway_token) {
      badge.className = 'tag tag-success';
      badge.textContent = 'Token set';
    }
  } else {
    showSettingsMessage((resp && resp.error) || 'Failed to save settings.', 'error');
  }
}

async function testConnection() {
  const btn = document.getElementById('btnTestConnection');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Testing...';
  }

  showSettingsMessage('Testing connection to Gateway...', 'info');

  const resp = await apiPost('/api/settings/test', {});

  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Test Connection';
  }

  if (resp && resp.ok) {
    showSettingsMessage(resp.message || 'Connection successful!', 'success');
  } else {
    showSettingsMessage((resp && resp.error) || 'Connection test failed.', 'error');
  }
}

// ---------------------------------------------------------------------------
// Currency settings
// ---------------------------------------------------------------------------

function showCurrencyMessage(text, type) {
  const el = document.getElementById('currencyMessage');
  if (!el) return;
  const colors = {
    success: { bg: 'var(--success-dim)', border: 'rgba(29,209,161,0.25)', color: 'var(--success)' },
    error:   { bg: 'var(--accent-dim)',  border: 'rgba(255,107,107,0.25)', color: 'var(--accent)' },
    info:    { bg: 'var(--primary-dim)', border: 'rgba(72,219,251,0.25)',  color: 'var(--primary)' },
  };
  const c = colors[type] || colors.info;
  el.style.display = 'block';
  el.style.padding = '12px 16px';
  el.style.borderRadius = '8px';
  el.style.fontSize = '0.85rem';
  el.style.background = c.bg;
  el.style.border = `1px solid ${c.border}`;
  el.style.color = c.color;
  el.textContent = text;
}

async function saveCurrency() {
  const currencyEl = document.getElementById('settingsCurrency');
  const rateEl = document.getElementById('settingsExchangeRate');

  const currency = currencyEl ? currencyEl.value : 'USD';
  const rate = rateEl ? parseFloat(rateEl.value) : 1.0;

  if (!rate || rate <= 0) {
    showCurrencyMessage('Exchange rate must be a positive number.', 'error');
    return;
  }

  const resp = await apiPost('/api/settings', {
    currency: currency,
    exchange_rate: rate,
    rate_updated: new Date().toISOString(),
  });

  if (resp && resp.saved) {
    // Update the in-memory state immediately
    App.currency.code = currency;
    App.currency.symbol = CURRENCY_SYMBOLS[currency] || currency + ' ';
    App.currency.rate = rate;
    showCurrencyMessage(`Currency set to ${currency} (1 USD = ${rate} ${currency}). All costs will update on next page load.`, 'success');
  } else {
    showCurrencyMessage((resp && resp.error) || 'Failed to save currency settings.', 'error');
  }
}

// ---------------------------------------------------------------------------
// Calendar sync
// ---------------------------------------------------------------------------

function showCalendarMessage(text, type) {
  const el = document.getElementById('calendarMessage');
  if (!el) return;
  const colors = {
    success: { bg: 'var(--success-dim)', border: 'rgba(29,209,161,0.25)', color: 'var(--success)' },
    error:   { bg: 'var(--accent-dim)',  border: 'rgba(255,107,107,0.25)', color: 'var(--accent)' },
    info:    { bg: 'var(--primary-dim)', border: 'rgba(72,219,251,0.25)',  color: 'var(--primary)' },
  };
  const c = colors[type] || colors.info;
  el.style.display = 'block';
  el.style.padding = '12px 16px';
  el.style.borderRadius = '8px';
  el.style.fontSize = '0.85rem';
  el.style.background = c.bg;
  el.style.border = `1px solid ${c.border}`;
  el.style.color = c.color;
  el.textContent = text;
}

async function discoverCalendars() {
  const btn = document.getElementById('btnCalendarDiscover');
  const listEl = document.getElementById('calendarDiscoverList');
  if (btn) { btn.disabled = true; btn.textContent = 'Scanning...'; }
  showCalendarMessage('Scanning for calendar data...', 'info');

  // Save calendar path first if changed
  const pathEl = document.getElementById('settingsCalendarPath');
  if (pathEl) {
    await apiPost('/api/settings', { calendar_path: pathEl.value.trim() });
  }

  const resp = await apiFetch('/api/calendars/discover');
  if (btn) { btn.disabled = false; btn.textContent = 'Discover Calendars'; }

  if (!resp || !resp.found) {
    listEl.innerHTML = `
      <div style="padding:16px;text-align:center;font-size:0.85rem;color:var(--text-muted);border:1px dashed var(--border-subtle);border-radius:8px;">
        <p style="margin-bottom:8px;"><strong>No calendars found</strong></p>
        <p>Could not find .ics files or reach your OpenClaw agent.</p>
        <p style="margin-top:8px;font-size:0.78rem;">Either mount a Calendar Data Path volume, or make sure your Gateway is connected so ${botName()} can ask your agent directly.</p>
      </div>`;
    showCalendarMessage('No calendars found. Check Gateway connection or volume mount.', 'error');
    return;
  }

  const isGateway = resp.source === 'gateway';
  const calendars = resp.calendars || [];
  // Load current enabled list
  const settings = await apiFetch('/api/settings');
  const enabled = (settings && settings.enabled_calendars) || [];
  const allEnabled = enabled.length === 0; // if none specified, all are enabled

  // Hide the path input when using gateway (not relevant)
  const pathGroup = document.getElementById('calendarPathGroup');
  if (pathGroup && isGateway) pathGroup.style.display = 'none';

  listEl.innerHTML = `
    ${isGateway ? `<div style="padding:8px 14px;font-size:0.78rem;color:var(--primary);background:var(--primary-dim);border-radius:8px 8px 0 0;border:1px solid rgba(72,219,251,0.15);border-bottom:none;">Calendars discovered via your OpenClaw agent (no direct mount needed)</div>` : ''}
    <div style="border:1px solid var(--border-subtle);border-radius:${isGateway ? '0 0 8px 8px' : '8px'};overflow:hidden;">
      ${calendars.map(cal => {
        const isChecked = allEnabled || enabled.includes(cal.id);
        return `
          <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border-subtle);cursor:pointer;transition:background 0.15s;"
                 onmouseover="this.style.background='var(--bg-card)'" onmouseout="this.style.background='transparent'">
            <input type="checkbox" class="settings-cal-checkbox" value="${escapeAttr(cal.id)}" ${isChecked ? 'checked' : ''}
                   style="width:18px;height:18px;accent-color:var(--primary);" />
            <div style="flex:1;">
              <div style="font-weight:500;font-size:0.88rem;">${escapeAttr(cal.name)}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">${cal.event_count === '?' ? 'via agent' : cal.event_count + ' event file(s)'}</div>
            </div>
            ${cal.color ? `<div style="width:12px;height:12px;border-radius:50%;background:${escapeAttr(cal.color)};flex-shrink:0;"></div>` : ''}
          </label>`;
      }).join('')}
    </div>`;

  showCalendarMessage(`Found ${calendars.length} calendar(s)${isGateway ? ' via your agent' : ''}. Toggle the ones you want to display, then Save.`, 'success');

  // Show save button
  const saveBtn = document.getElementById('btnCalendarSave');
  if (saveBtn) saveBtn.style.display = '';
}

async function saveCalendarSettings() {
  const checked = document.querySelectorAll('.settings-cal-checkbox:checked');
  const enabled = Array.from(checked).map(cb => cb.value);

  const pathEl = document.getElementById('settingsCalendarPath');
  const body = { enabled_calendars: enabled };
  if (pathEl) body.calendar_path = pathEl.value.trim();

  const resp = await apiPost('/api/settings', body);
  if (resp && resp.saved) {
    showCalendarMessage(`Saved! ${enabled.length} calendar(s) enabled. Refreshing events...`, 'success');
    // Trigger an immediate collector run so events appear right away
    try { await apiPost('/api/collect', {}); } catch { /* non-critical */ }
    // Wait a moment for the collector to finish, then refresh data
    setTimeout(async () => {
      try { await loadDashboardData(); } catch { /* silent */ }
      showCalendarMessage(`Saved! ${enabled.length} calendar(s) enabled. Events updated.`, 'success');
    }, 5000);
  } else {
    showCalendarMessage((resp && resp.error) || 'Failed to save calendar settings.', 'error');
  }
}

async function fetchLiveRate() {
  const currencyEl = document.getElementById('settingsCurrency');
  const currency = currencyEl ? currencyEl.value : 'USD';
  const btn = document.getElementById('btnFetchRate');

  if (currency === 'USD') {
    document.getElementById('settingsExchangeRate').value = '1';
    showCurrencyMessage('USD selected — rate is 1.0 (no conversion needed).', 'info');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Fetching...';
  }
  showCurrencyMessage(`Fetching live ${currency}/USD rate...`, 'info');

  const resp = await apiPost('/api/settings/rates', { currency });

  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Fetch Live Rate';
  }

  if (resp && resp.exchange_rate) {
    const rateEl = document.getElementById('settingsExchangeRate');
    if (rateEl) rateEl.value = resp.exchange_rate;

    // Update in-memory
    App.currency.code = currency;
    App.currency.symbol = CURRENCY_SYMBOLS[currency] || currency + ' ';
    App.currency.rate = resp.exchange_rate;

    showCurrencyMessage(`Rate fetched and saved: 1 USD = ${resp.exchange_rate} ${currency}`, 'success');
  } else {
    showCurrencyMessage((resp && resp.error) || 'Failed to fetch exchange rate.', 'error');
  }
}

// ---------------------------------------------------------------------------
// Branding settings
// ---------------------------------------------------------------------------

function showBrandingMessage(text, type) {
  const el = document.getElementById('brandingMessage');
  if (!el) return;
  const colors = {
    success: { bg: 'var(--success-dim)', border: 'rgba(29,209,161,0.25)', color: 'var(--success)' },
    error:   { bg: 'var(--accent-dim)',  border: 'rgba(255,107,107,0.25)', color: 'var(--accent)' },
    info:    { bg: 'var(--primary-dim)', border: 'rgba(72,219,251,0.25)',  color: 'var(--primary)' },
  };
  const c = colors[type] || colors.info;
  el.style.display = 'block';
  el.style.padding = '12px 16px';
  el.style.borderRadius = '8px';
  el.style.fontSize = '0.85rem';
  el.style.background = c.bg;
  el.style.border = `1px solid ${c.border}`;
  el.style.color = c.color;
  el.textContent = text;
}

async function saveBranding() {
  const nameEl = document.getElementById('settingsBotName');
  const name = (nameEl?.value || '').trim();

  if (!name) {
    showBrandingMessage('Bot name cannot be empty.', 'error');
    return;
  }

  const resp = await apiPost('/api/settings', { bot_name: name });
  if (resp && resp.saved) {
    App.branding.name = name;
    applyBranding();
    showBrandingMessage(`Name set to "${name}".`, 'success');
  } else {
    showBrandingMessage((resp && resp.error) || 'Failed to save.', 'error');
  }
}

async function removeIcon() {
  const resp = await apiFetch('/api/settings/icon', { method: 'DELETE' });
  if (resp && resp.deleted) {
    App.branding.hasIcon = false;
    App.branding.iconUrl = null;
    applyBranding();
    showBrandingMessage('Icon removed. Using default emoji.', 'success');
    // Update preview
    const preview = document.getElementById('brandIconPreview');
    if (preview) preview.innerHTML = `<span style="font-size: 2rem;">${App.branding.emoji}</span>`;
  } else {
    showBrandingMessage('Failed to remove icon.', 'error');
  }
}
