/* ===================================================================
   calendar.js — Calendar View with day grouping
   =================================================================== */

registerView('calendar', async function renderCalendar() {
  const d = App.data || {};
  let events = (d.calendar && d.calendar.length > 0) ? d.calendar : [];
  let calSource = 'collector';
  let calError = '';

  // If collector hasn't populated events yet, fetch live from the API
  // (this uses Gateway chat fallback when no ICS mount is available)
  if (!events.length) {
    try {
      const live = await apiFetch('/api/calendars/events?days=7');
      if (live && live.events && live.events.length > 0) {
        events = live.events;
        calSource = live.source || 'live';
      } else if (live && live.source === 'none') {
        calError = 'No calendar data found. Check Settings to discover calendars.';
      }
    } catch (e) {
      calError = 'Failed to fetch calendar events.';
    }
  }

  // Group events by date
  const groups = {};
  events.forEach(e => {
    const key = e.date || 'Unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  });

  const groupKeys = Object.keys(groups);

  const html = `
    <div class="toolbar">
      ${searchBoxHTML('Search events...', 'calendarSearch')}
    </div>

    <!-- Summary -->
    <div class="stats-grid" style="margin-bottom: 24px;">
      <div class="card fade-in">
        <div class="card-title">Upcoming Events</div>
        <div class="stat-value color-primary">${events.length}</div>
      </div>
      <div class="card fade-in">
        <div class="card-title">Days with Events</div>
        <div class="stat-value color-warning">${groupKeys.length}</div>
      </div>
      <div class="card fade-in">
        <div class="card-title">Next Event</div>
        <div class="stat-value color-success" style="font-size: 1.2rem; letter-spacing: 0;">
          ${events.length ? (events[0].title || 'Untitled') : 'None'}
        </div>
        <div class="stat-trend">${events.length ? `${events[0].time || ''}` : ''}</div>
      </div>
    </div>

    <!-- Calendar list grouped by day -->
    <div class="card fade-in">
      <div id="calendarGroups">
        ${calError ? `
          <div class="empty-state" style="padding:24px;">
            <p style="margin-bottom:12px;">${calError}</p>
            <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
              <button class="btn btn-primary" id="calRetryBtn" style="font-size:0.85rem;">Retry</button>
              <a href="#settings" class="btn btn-ghost" style="font-size:0.85rem;text-decoration:none;">Calendar Settings</a>
            </div>
          </div>` : ''}
        ${groupKeys.length ? groupKeys.map(date => `
          <div class="day-group calendar-group" data-date="${date}">
            <div class="day-label">${date}</div>
            <div class="data-list">
              ${groups[date].map(e => `
                <div class="data-row calendar-event">
                  <div class="data-row-left">
                    <span class="data-row-title">${e.title || 'Untitled'}</span>
                    <span class="data-row-sub">
                      ${e.time || 'All day'}${e.end ? ' - ' + e.end : ''}
                    </span>
                  </div>
                  <div class="data-row-right">
                    ${e.calendar ? `<span class="tag tag-accent">${formatCalendarName(e.calendar)}</span>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('') : `${calError ? '' : '<div class="empty-state"><p>No upcoming events in the next 7 days</p></div>'}`}
      </div>
    </div>
  `;

  setTimeout(() => {
    const searchEl = document.getElementById('calendarSearch');
    if (searchEl) {
      searchEl.addEventListener('input', () => filterCalendar());
    }
    const retryBtn = document.getElementById('calRetryBtn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => navigateTo('calendar'));
    }
  }, 50);

  return html;
});

function formatCalendarName(name) {
  if (!name) return '';
  // Clean up calendar names like "personal_shared_by_becky" -> "Becky"
  const match = name.match(/shared_by_(\w+)/);
  if (match) return match[1].charAt(0).toUpperCase() + match[1].slice(1);
  return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function filterCalendar() {
  const query = (document.getElementById('calendarSearch')?.value || '').trim().toLowerCase();
  document.querySelectorAll('.calendar-event').forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(query) ? '' : 'none';
  });

  // Hide day groups that have no visible events
  document.querySelectorAll('.calendar-group').forEach(group => {
    const visibleEvents = group.querySelectorAll('.calendar-event:not([style*="display: none"])');
    group.style.display = visibleEvents.length ? '' : 'none';
  });
}
