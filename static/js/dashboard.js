/* ===================================================================
   dashboard.js — Main Dashboard / Home View
   =================================================================== */

registerView('dashboard', async function renderDashboard() {
  const d = App.data || {};
  const sessions = d.sessions || [];
  const history = d.history || [];
  const learning = d.learning || [];
  const calendar = d.calendar || [];

  // Agent status
  const agent = d.agentStatus || {};
  const isOnline = agent.running || !!d.uptimeMs;
  const statusClass = isOnline ? 'tag-success' : 'tag-muted';
  const statusLabel = isOnline ? 'Online' : 'Offline';

  // Cost trend arrow
  const costChange = d.costChange || 0;
  const trendClass = costChange >= 0 ? 'up' : 'down';
  const trendArrow = costChange >= 0 ? '&#9650;' : '&#9660;';
  const trendText = `${trendArrow} ${formatCost(Math.abs(costChange))} vs yesterday`;

  // Token budget (default 5M, configurable later)
  const tokenBudget = d.tokenBudget || 5_000_000;
  const totalTokens = d.totalTokens || 0;
  const tokensRemaining = Math.max(0, tokenBudget - totalTokens);
  const tokenPct = Math.min(100, Math.round((totalTokens / tokenBudget) * 100));

  // Top sessions for the mini-list
  const topSessions = sessions.slice(0, 5);

  // Learning preview (last 3)
  const recentLearning = learning.slice(-3).reverse();

  // Calendar preview (next 3)
  const nextEvents = calendar.slice(0, 3);

  const html = `
    <!-- Stat Cards -->
    <div class="stats-grid">
      <div class="card fade-in">
        <div class="card-title">Today's Cost</div>
        <div class="stat-value color-primary">${formatCost(d.todayCost)}</div>
        <div class="stat-trend ${trendClass}">${trendText}</div>
      </div>

      <div class="card fade-in">
        <div class="card-title">Total Tokens</div>
        <div class="stat-value color-warning">${formatNumber(totalTokens)}</div>
        <div class="stat-trend">${formatNumber(d.todayTokens || 0)} today</div>
      </div>

      <div class="card fade-in">
        <div class="card-title">Sessions</div>
        <div class="stat-value color-accent">${d.sessionCount || 0}</div>
        <div class="stat-trend">Active sessions</div>
      </div>

      <div class="card fade-in">
        <div class="card-title">Agent Status</div>
        <div class="stat-value color-success">${uptimeStr(d.uptimeMs)}</div>
        <div class="stat-trend">
          <span class="tag ${statusClass}">${statusLabel}</span>
        </div>
      </div>
    </div>

    <!-- Charts Row -->
    <div class="charts-grid">
      <div class="card fade-in">
        <div class="card-header">
          <span class="card-title">Token Usage</span>
          <span class="tag tag-primary">${tokenPct}% used</span>
        </div>
        <div class="chart-wrap">
          <canvas id="tokenDonut"></canvas>
        </div>
      </div>

      <div class="card fade-in">
        <div class="card-header">
          <span class="card-title">7-Day Cost Trend</span>
        </div>
        <div class="chart-wrap">
          <canvas id="costLine"></canvas>
        </div>
      </div>
    </div>

    <!-- Bottom Row: Sessions + Sidebar -->
    <div class="charts-grid">
      <div class="card fade-in">
        <div class="section-header">
          <span class="section-title">Recent Sessions</span>
          <a href="#sessions" class="btn btn-ghost btn-sm">View All</a>
        </div>
        <div class="data-list">
          ${topSessions.length ? topSessions.map(s => `
            <div class="data-row">
              <div class="data-row-left">
                <span class="data-row-title">${s.name || s.key}</span>
                <span class="data-row-sub">${formatNumber(s.tokens)} tokens &middot; ${timeAgo(s.updated)}</span>
              </div>
              <div class="data-row-right">
                <span class="data-row-value">${formatCostPrecise(s.cost)}</span>
              </div>
            </div>
          `).join('') : '<div class="empty-state"><p>No sessions yet</p></div>'}
        </div>
      </div>

      <div class="card fade-in">
        <div class="section-header">
          <span class="section-title">Quick Look</span>
        </div>

        <!-- Agent capabilities mini -->
        <div style="margin-bottom: 20px;" id="dashToolsSkills">
          <div class="card-title" style="margin-bottom: 10px;">Agent Capabilities</div>
          <div style="display: flex; gap: 16px; font-size: 0.88rem; color: var(--text-secondary);">
            <div id="dashToolsCount" style="display:flex;align-items:center;gap:6px;">
              <span style="color:var(--primary);font-weight:600;">--</span> tools
            </div>
            <div id="dashSkillsCount" style="display:flex;align-items:center;gap:6px;">
              <span style="color:var(--warning);font-weight:600;">--</span> skills
            </div>
          </div>
        </div>

        <!-- Upcoming events mini -->
        <div style="margin-bottom: 20px;">
          <div class="card-title" style="margin-bottom: 10px;">Upcoming Events</div>
          ${nextEvents.length ? nextEvents.map(e => `
            <div class="data-row" style="padding: 8px 0;">
              <div class="data-row-left">
                <span class="data-row-title" style="font-size: 0.85rem;">${e.title || 'Untitled'}</span>
                <span class="data-row-sub">${e.date} ${e.time}${e.end ? ' - ' + e.end : ''}</span>
              </div>
            </div>
          `).join('') : '<div class="data-row-sub">No upcoming events</div>'}
          <a href="#calendar" style="display: inline-block; margin-top: 6px; font-size: 0.78rem; color: var(--primary);">View Calendar &rarr;</a>
        </div>

        <!-- Recent learning mini -->
        <div>
          <div class="card-title" style="margin-bottom: 10px;">Recent Learnings</div>
          ${recentLearning.length ? recentLearning.map(e => `
            <div class="data-row" style="padding: 8px 0;">
              <div class="data-row-left">
                <span class="data-row-title" style="font-size: 0.85rem;">
                  <span class="tag ${getTypeEmoji(e.type)}" style="margin-right: 6px;">${getTypeLabel(e.type)}</span>
                  ${e.title}
                </span>
              </div>
            </div>
          `).join('') : '<div class="data-row-sub">No entries yet</div>'}
          <a href="#learning" style="display: inline-block; margin-top: 6px; font-size: 0.78rem; color: var(--primary);">View All &rarr;</a>
        </div>
      </div>
    </div>
  `;

  // Render HTML first, then init charts on next frame
  setTimeout(() => {
    // Token donut
    createDonutChart('tokenDonut', {
      data: [totalTokens, tokensRemaining],
      labels: ['Used', 'Remaining'],
      colors: ['#48dbfb', 'rgba(255,255,255,0.06)'],
      centerText: formatNumber(totalTokens),
    });

    // Cost line chart (convert to user's currency)
    const labels = history.map(h => h.day);
    const costs  = history.map(h => convertCost(h.cost));
    createLineChart('costLine', {
      labels,
      data: costs,
      color: '#ff6b6b',
      fillColor: 'rgba(255, 107, 107, 0.15)',
      yPrefix: currencySymbol(),
    });

    // Load tools and skills counts asynchronously
    loadDashboardCapabilities();
  }, 50);

  return html;
});

async function loadDashboardCapabilities() {
  const [toolsResp, skillsResp] = await Promise.all([
    apiFetch('/api/workspace/tools'),
    apiFetch('/api/workspace/skills'),
  ]);
  const toolsCount = (toolsResp && toolsResp.count) || 0;
  const skillsCount = (skillsResp && skillsResp.count) || 0;

  const toolsEl = document.getElementById('dashToolsCount');
  const skillsEl = document.getElementById('dashSkillsCount');
  if (toolsEl) toolsEl.innerHTML = `<span style="color:var(--primary);font-weight:600;">${toolsCount}</span> tools`;
  if (skillsEl) skillsEl.innerHTML = `<span style="color:var(--warning);font-weight:600;">${skillsCount}</span> skills`;
}
