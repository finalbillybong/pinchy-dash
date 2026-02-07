/* ===================================================================
   sessions.js — Sessions View with search, sort, filtering
   =================================================================== */

registerView('sessions', async function renderSessions() {
  const d = App.data || {};
  const sessions = d.sessions || [];

  const html = `
    <div class="toolbar">
      ${searchBoxHTML('Search sessions by ID, cost...', 'sessionSearch')}
      <div class="filter-chips">
        <button class="chip active" data-sort="date" onclick="sortSessions('date')">Newest</button>
        <button class="chip" data-sort="cost" onclick="sortSessions('cost')">Highest Cost</button>
        <button class="chip" data-sort="tokens" onclick="sortSessions('tokens')">Most Tokens</button>
      </div>
    </div>

    <!-- Summary bar -->
    <div class="stats-grid" style="margin-bottom: 20px;">
      <div class="card fade-in">
        <div class="card-title">Total Sessions</div>
        <div class="stat-value color-accent">${d.sessionCount || sessions.length}</div>
      </div>
      <div class="card fade-in">
        <div class="card-title">Today's Tokens</div>
        <div class="stat-value color-warning">${formatNumber(d.todayTokens || 0)}</div>
      </div>
      <div class="card fade-in">
        <div class="card-title">Today's Cost</div>
        <div class="stat-value color-primary">${formatCost(d.todayCost)}</div>
      </div>
    </div>

    <!-- Token distribution chart -->
    <div class="card fade-in" style="margin-bottom: 20px;">
      <div class="card-header">
        <span class="card-title">Token Distribution (Top 10)</span>
      </div>
      <div class="chart-wrap">
        <canvas id="sessionTokenBar"></canvas>
      </div>
    </div>

    <!-- Sessions list -->
    <div class="card fade-in">
      <div class="section-header">
        <span class="section-title">All Sessions</span>
        <span class="tag tag-muted" id="sessionCountBadge">${sessions.length} shown</span>
      </div>
      <div class="scroll-list data-list" id="sessionsList">
        ${renderSessionRows(sessions)}
      </div>
    </div>

    <!-- Session Extracts -->
    <div class="card fade-in" style="margin-top: 20px;" id="sessionExtractsCard">
      <div class="section-header">
        <span class="section-title">Session Extracts</span>
        <span class="tag tag-muted" id="extractCountBadge">Loading...</span>
      </div>
      <div class="scroll-list data-list" id="sessionExtractsList">
        <div class="loading-state"><div class="spinner"></div></div>
      </div>
    </div>

    <!-- Extract viewer modal -->
    <div class="modal-overlay" id="extractModal">
      <div class="modal" style="max-width: 720px; max-height: 80vh; overflow-y: auto;">
        <div class="modal-title" id="extractModalTitle">Session Extract</div>
        <div id="extractModalContent" class="memory-file-content" style="font-size: 0.88rem; line-height: 1.7;"></div>
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="document.getElementById('extractModal').classList.remove('open')">Close</button>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    // Token bar chart
    const top10 = sessions.slice(0, 10);
    createBarChart('sessionTokenBar', {
      labels: top10.map(s => (s.name || s.key).substring(0, 10) + '...'),
      data: top10.map(s => s.tokens),
      color: '#feca57',
      yPrefix: '',
    });

    // Wire up search
    const searchEl = document.getElementById('sessionSearch');
    if (searchEl) {
      searchEl.addEventListener('input', () => filterSessions());
    }

    // Load session extracts
    loadSessionExtracts();
  }, 50);

  return html;
});

async function loadSessionExtracts() {
  const listEl = document.getElementById('sessionExtractsList');
  const badge = document.getElementById('extractCountBadge');
  if (!listEl) return;

  const resp = await apiFetch('/api/workspace/sessions');
  if (!resp) {
    listEl.innerHTML = '<div class="empty-state"><p>Could not load session extracts.</p></div>';
    if (badge) badge.textContent = '0';
    return;
  }

  const extracts = resp.extracts || [];
  if (badge) badge.textContent = extracts.length + ' file(s)';

  if (extracts.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><p>No session extracts found in the OpenClaw workspace.</p></div>';
    return;
  }

  listEl.innerHTML = extracts.map(ex => `
    <div class="data-row" style="cursor:pointer;" onclick="openSessionExtract('${escapeAttr(ex.filename)}')">
      <div class="data-row-left">
        <span class="data-row-title">${escapeAttr(ex.filename)}</span>
        <span class="data-row-sub">${timeAgo(ex.modified)} &middot; ${ex.size > 1024 ? (ex.size / 1024).toFixed(1) + ' KB' : ex.size + ' B'}</span>
      </div>
      <div class="data-row-right">
        <span class="tag tag-muted" style="font-size:0.72rem;">View</span>
      </div>
    </div>
  `).join('');
}

async function openSessionExtract(filename) {
  const modal = document.getElementById('extractModal');
  const titleEl = document.getElementById('extractModalTitle');
  const contentEl = document.getElementById('extractModalContent');
  if (!modal || !contentEl) return;

  titleEl.textContent = filename;
  contentEl.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
  modal.classList.add('open');

  const resp = await apiFetch(`/api/workspace/sessions/${encodeURIComponent(filename)}`);
  if (!resp || !resp.content) {
    contentEl.innerHTML = '<div class="empty-state"><p>Could not load file.</p></div>';
    return;
  }

  // Use markdown renderer if available
  if (typeof renderMarkdown === 'function') {
    contentEl.innerHTML = renderMarkdown(resp.content);
  } else {
    contentEl.innerHTML = `<pre style="white-space:pre-wrap;font-size:0.85rem;line-height:1.6;">${escapeAttr(resp.content)}</pre>`;
  }
}

function renderSessionRows(sessions) {
  if (!sessions.length) {
    return '<div class="empty-state"><p>No sessions found</p></div>';
  }
  return sessions.map(s => `
    <div class="data-row" data-tokens="${s.tokens}" data-cost="${s.cost}" data-date="${s.updated}">
      <div class="data-row-left">
        <span class="data-row-title" title="${s.key}">${s.key}</span>
        <span class="data-row-sub">
          ${formatNumber(s.tokens)} tokens &middot; ${timeAgo(s.updated)}
        </span>
      </div>
      <div class="data-row-right">
        <span class="data-row-value">${formatCostPrecise(s.cost)}</span>
      </div>
    </div>
  `).join('');
}

// Client-side sort
window._sessionSortField = 'date';

function sortSessions(field) {
  window._sessionSortField = field;

  // Update chip active states
  document.querySelectorAll('.filter-chips .chip').forEach(c => {
    c.classList.toggle('active', c.dataset.sort === field);
  });

  filterSessions();
}

function filterSessions() {
  const d = App.data || {};
  let sessions = [...(d.sessions || [])];
  const query = (document.getElementById('sessionSearch')?.value || '').trim();

  // Filter by search
  if (query) {
    sessions = sessions.filter(s =>
      matchesSearch(s.key, query) ||
      matchesSearch(s.name, query) ||
      matchesSearch(String(s.cost), query)
    );
  }

  // Sort
  const field = window._sessionSortField || 'date';
  if (field === 'cost') {
    sessions.sort((a, b) => (b.cost || 0) - (a.cost || 0));
  } else if (field === 'tokens') {
    sessions.sort((a, b) => (b.tokens || 0) - (a.tokens || 0));
  } else {
    sessions.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  }

  const list = document.getElementById('sessionsList');
  if (list) list.innerHTML = renderSessionRows(sessions);

  const badge = document.getElementById('sessionCountBadge');
  if (badge) badge.textContent = sessions.length + ' shown';
}
