/* ===================================================================
   learning.js — Learning / Agent Memory View
   Reads directly from OpenClaw memory files (daily notes, topics, data)
   plus keeps the manual learning entry system as a secondary option.
   =================================================================== */

registerView('learning', async function renderLearning() {
  const html = `
    <div class="toolbar">
      ${searchBoxHTML('Search memory files...', 'learningSearch')}
      <div class="filter-chips">
        <button class="chip active" data-tab="daily" onclick="switchMemoryTab('daily')">Daily Notes</button>
        <button class="chip" data-tab="topic" onclick="switchMemoryTab('topic')">Topics</button>
        <button class="chip" data-tab="data" onclick="switchMemoryTab('data')">Data</button>
        <button class="chip" data-tab="manual" onclick="switchMemoryTab('manual')">Manual Entries</button>
      </div>
    </div>

    <!-- Memory tabs content -->
    <div id="memoryTabContent">
      <div class="loading-state"><div class="spinner"></div><p>Loading memory files...</p></div>
    </div>

    <!-- Modal for full file view -->
    <div class="modal-overlay" id="memoryModal">
      <div class="modal" style="max-width: 720px; max-height: 80vh; overflow-y: auto;">
        <div class="modal-title" id="memoryModalTitle">File</div>
        <div id="memoryModalContent" class="memory-file-content" style="font-size: 0.88rem; line-height: 1.7;"></div>
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="closeMemoryModal()">Close</button>
        </div>
      </div>
    </div>

    <!-- Modal for manual entry -->
    <div class="modal-overlay" id="learningModal">
      <div class="modal">
        <div class="modal-title">New Learning Entry</div>
        <div class="form-group">
          <label class="form-label">Type</label>
          <select class="form-select" id="learningType">
            <option value="lesson">Lesson</option>
            <option value="decision">Decision</option>
            <option value="observation">Observation</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Title</label>
          <input class="form-input" id="learningTitle" placeholder="What did you learn?">
        </div>
        <div class="form-group">
          <label class="form-label">Detail</label>
          <textarea class="form-textarea" id="learningDetail" placeholder="Context and details..."></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Outcome</label>
          <input class="form-input" id="learningOutcome" placeholder="What was the result?">
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="closeLearningModal()">Cancel</button>
          <button class="btn btn-primary" onclick="saveLearning()">Save Entry</button>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    const searchEl = document.getElementById('learningSearch');
    if (searchEl) {
      searchEl.addEventListener('input', () => filterMemoryList());
    }
    // Load initial tab
    switchMemoryTab('daily');
  }, 50);

  return html;
});

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
window._memoryTab = 'daily';
window._memoryFiles = [];

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------
async function switchMemoryTab(tab) {
  window._memoryTab = tab;
  document.querySelectorAll('.filter-chips .chip').forEach(c => {
    c.classList.toggle('active', c.dataset.tab === tab);
  });

  const container = document.getElementById('memoryTabContent');
  if (!container) return;

  if (tab === 'manual') {
    await renderManualEntries(container);
    return;
  }

  container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading...</p></div>';

  const resp = await apiFetch(`/api/memory?type=${tab}`);
  if (!resp) {
    container.innerHTML = '<div class="empty-state"><p>Could not load memory files. Check that the OpenClaw volume is mounted.</p></div>';
    return;
  }

  const files = resp.files || [];
  window._memoryFiles = files;
  const recent = resp.recent || [];

  if (files.length === 0) {
    container.innerHTML = `
      <div class="card fade-in">
        <div class="empty-state">
          <p>No ${tab} files found in OpenClaw memory.</p>
          <p style="font-size: 0.82rem; color: var(--text-muted); margin-top: 8px;">
            Memory files are stored at <code style="background:var(--bg-deep);padding:1px 4px;border-radius:4px;">/root/.openclaw/workspace/memory/</code> — 
            make sure the OpenClaw data volume is mounted.
          </p>
        </div>
      </div>`;
    return;
  }

  if (tab === 'daily') {
    renderDailyNotes(container, files, recent);
  } else if (tab === 'topic') {
    renderTopicFiles(container, files);
  } else if (tab === 'data') {
    renderDataFiles(container, files);
  }
}

// ---------------------------------------------------------------------------
// Daily Notes
// ---------------------------------------------------------------------------
function renderDailyNotes(container, files, recent) {
  // Merge with recent summaries for richer previews
  const recentMap = {};
  for (const r of recent) {
    recentMap[r.date] = r;
  }

  container.innerHTML = `
    <div class="card fade-in">
      <div class="section-header">
        <span class="section-title">Daily Session Notes</span>
        <span class="tag tag-muted">${files.length} file(s)</span>
      </div>
      <div class="scroll-list data-list" id="memoryFileList">
        ${files.map(f => {
          const summary = recentMap[f.id];
          const sections = summary ? summary.sections.slice(0, 4).join(' &middot; ') : '';
          const preview = summary ? summary.preview : '';
          return `
            <div class="data-row memory-row" data-filename="${escapeAttr(f.filename)}" onclick="openMemoryFile('${escapeAttr(f.filename)}', '${escapeAttr(f.id)}')">
              <div class="data-row-left">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
                  <span class="tag tag-primary" style="font-size:0.72rem;">${escapeAttr(f.id)}</span>
                  ${sections ? `<span style="font-size:0.78rem;color:var(--text-muted);">${sections}</span>` : ''}
                </div>
                ${preview ? `<div class="data-row-sub" style="max-width:500px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeAttr(preview)}</div>` : ''}
              </div>
              <div class="data-row-right">
                <span style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap;">${_formatFileSize(f.size)}</span>
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------
function renderTopicFiles(container, files) {
  container.innerHTML = `
    <div class="card fade-in">
      <div class="section-header">
        <span class="section-title">Topic Memories</span>
        <span class="tag tag-muted">${files.length} file(s)</span>
      </div>
      <div class="scroll-list data-list" id="memoryFileList">
        ${files.map(f => `
          <div class="data-row memory-row" data-filename="${escapeAttr(f.filename)}" onclick="openMemoryFile('${escapeAttr(f.filename)}', '${escapeAttr(f.id)}')">
            <div class="data-row-left">
              <span class="data-row-title">${_friendlyName(f.id)}</span>
              <span class="data-row-sub">${escapeAttr(f.filename)} &middot; ${timeAgo(f.modified)}</span>
            </div>
            <div class="data-row-right">
              <span style="font-size:0.75rem;color:var(--text-muted);">${_formatFileSize(f.size)}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Data files (JSON)
// ---------------------------------------------------------------------------
function renderDataFiles(container, files) {
  container.innerHTML = `
    <div class="card fade-in">
      <div class="section-header">
        <span class="section-title">Data Files</span>
        <span class="tag tag-muted">${files.length} file(s)</span>
      </div>
      <div class="scroll-list data-list" id="memoryFileList">
        ${files.map(f => `
          <div class="data-row memory-row" data-filename="${escapeAttr(f.filename)}" onclick="openMemoryFile('${escapeAttr(f.filename)}', '${escapeAttr(f.id)}')">
            <div class="data-row-left">
              <span class="data-row-title">${escapeAttr(f.filename)}</span>
              <span class="data-row-sub">${timeAgo(f.modified)}</span>
            </div>
            <div class="data-row-right">
              <span style="font-size:0.75rem;color:var(--text-muted);">${_formatFileSize(f.size)}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Manual entries (legacy)
// ---------------------------------------------------------------------------
async function renderManualEntries(container) {
  const resp = await apiFetch('/api/learning');
  const entries = ((resp && resp.entries) || []).slice().reverse();

  const decisions    = entries.filter(e => e.type === 'decision');
  const lessons      = entries.filter(e => e.type === 'lesson');
  const observations = entries.filter(e => e.type === 'observation');

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div class="filter-chips" style="margin:0;">
        <button class="chip ${window._manualFilter === 'all' || !window._manualFilter ? 'active' : ''}" data-mfilter="all" onclick="filterManualEntries('all')">All (${entries.length})</button>
        <button class="chip ${window._manualFilter === 'decision' ? 'active' : ''}" data-mfilter="decision" onclick="filterManualEntries('decision')">Decisions (${decisions.length})</button>
        <button class="chip ${window._manualFilter === 'lesson' ? 'active' : ''}" data-mfilter="lesson" onclick="filterManualEntries('lesson')">Lessons (${lessons.length})</button>
        <button class="chip ${window._manualFilter === 'observation' ? 'active' : ''}" data-mfilter="observation" onclick="filterManualEntries('observation')">Obs (${observations.length})</button>
      </div>
      <button class="btn btn-primary" onclick="openLearningModal()">+ New Entry</button>
    </div>
    <div class="card fade-in">
      <div class="scroll-list data-list" id="manualEntryList">
        ${_renderManualRows(entries)}
      </div>
    </div>`;
}

function _renderManualRows(entries) {
  if (!entries.length) {
    return '<div class="empty-state"><p>No manual learning entries yet. Add one to start tracking!</p></div>';
  }
  return entries.map(e => `
    <div class="data-row learning-row" data-type="${e.type}">
      <div class="data-row-left">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
          <span class="tag ${getTypeEmoji(e.type)}">${getTypeLabel(e.type)}</span>
          <span class="data-row-title">${escapeAttr(e.title)}</span>
        </div>
        ${e.detail ? `<div class="data-row-sub">${escapeAttr(e.detail)}</div>` : ''}
        ${e.outcome ? `<div class="data-row-sub" style="color: var(--success); margin-top: 2px;">Outcome: ${escapeAttr(e.outcome)}</div>` : ''}
      </div>
      <div class="data-row-right" style="flex-direction: column; align-items: flex-end; gap: 4px;">
        <span style="font-size: 0.78rem; color: var(--text-muted); white-space: nowrap;">${e.date}</span>
        <button class="btn btn-danger btn-sm" style="padding:3px 8px; font-size:0.7rem;" onclick="deleteLearning('${e.id}')">Del</button>
      </div>
    </div>
  `).join('');
}

// ---------------------------------------------------------------------------
// File viewer modal
// ---------------------------------------------------------------------------
async function openMemoryFile(filename, title) {
  const modal = document.getElementById('memoryModal');
  const titleEl = document.getElementById('memoryModalTitle');
  const contentEl = document.getElementById('memoryModalContent');
  if (!modal || !contentEl) return;

  titleEl.textContent = title || filename;
  contentEl.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
  modal.classList.add('open');

  const resp = await apiFetch(`/api/memory/${encodeURIComponent(filename)}`);
  if (!resp || !resp.content) {
    contentEl.innerHTML = '<div class="empty-state"><p>Could not load file.</p></div>';
    return;
  }

  if (resp.type === 'data') {
    // JSON — pretty print
    try {
      const parsed = JSON.parse(resp.content);
      contentEl.innerHTML = `<pre style="background:var(--bg-deep);padding:16px;border-radius:8px;overflow-x:auto;font-size:0.82rem;line-height:1.5;"><code>${escapeAttr(JSON.stringify(parsed, null, 2))}</code></pre>`;
    } catch {
      contentEl.innerHTML = `<pre style="background:var(--bg-deep);padding:16px;border-radius:8px;overflow-x:auto;font-size:0.82rem;"><code>${escapeAttr(resp.content)}</code></pre>`;
    }
  } else {
    // Markdown — render
    contentEl.innerHTML = renderMarkdown(resp.content);
  }
}

function closeMemoryModal() {
  const modal = document.getElementById('memoryModal');
  if (modal) modal.classList.remove('open');
}

// ---------------------------------------------------------------------------
// Markdown renderer (lightweight client-side)
// ---------------------------------------------------------------------------
function renderMarkdown(text) {
  if (!text) return '';
  const lines = text.split('\n');
  let html = '';
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeLines = [];
  let inTable = false;
  let tableRows = [];
  let inList = false;
  let listItems = [];

  function flushList() {
    if (listItems.length > 0) {
      html += '<ul class="md-list">' + listItems.join('') + '</ul>';
      listItems = [];
      inList = false;
    }
  }

  function flushTable() {
    if (tableRows.length > 0) {
      let tableHtml = '<div class="table-wrap"><table class="md-table">';
      tableRows.forEach((row, i) => {
        const cells = row.split('|').filter(c => c.trim() !== '');
        if (i === 0) {
          tableHtml += '<thead><tr>' + cells.map(c => `<th>${formatInline(c.trim())}</th>`).join('') + '</tr></thead><tbody>';
        } else if (i === 1 && row.match(/^[\s|:-]+$/)) {
          // separator row, skip
        } else {
          tableHtml += '<tr>' + cells.map(c => `<td>${formatInline(c.trim())}</td>`).join('') + '</tr>';
        }
      });
      tableHtml += '</tbody></table></div>';
      html += tableHtml;
      tableRows = [];
      inTable = false;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        html += `<pre class="md-code-block"><code>${escapeAttr(codeLines.join('\n'))}</code></pre>`;
        codeLines = [];
        inCodeBlock = false;
      } else {
        flushList();
        flushTable();
        inCodeBlock = true;
        codeBlockLang = line.trim().slice(3);
      }
      continue;
    }
    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Tables
    if (line.includes('|') && line.trim().startsWith('|')) {
      flushList();
      inTable = true;
      tableRows.push(line.trim());
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Headers
    const headerMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headerMatch) {
      flushList();
      const level = headerMatch[1].length;
      html += `<h${level} class="md-heading">${formatInline(headerMatch[2])}</h${level}>`;
      continue;
    }

    // Blockquotes
    if (line.trim().startsWith('> ')) {
      flushList();
      html += `<blockquote class="md-blockquote">${formatInline(line.trim().slice(2))}</blockquote>`;
      continue;
    }

    // Bullet lists
    if (line.trim().match(/^[-*]\s+/)) {
      inList = true;
      listItems.push(`<li>${formatInline(line.trim().replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    } else if (inList) {
      flushList();
    }

    // Horizontal rule
    if (line.trim().match(/^[-*_]{3,}$/)) {
      html += '<hr class="md-hr" />';
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      flushList();
      continue;
    }

    // Paragraph
    html += `<p class="md-paragraph">${formatInline(line)}</p>`;
  }

  // Flush remaining
  if (inCodeBlock) {
    html += `<pre class="md-code-block"><code>${escapeAttr(codeLines.join('\n'))}</code></pre>`;
  }
  flushList();
  flushTable();

  return html;
}

function formatInline(text) {
  if (!text) return '';
  // Escape HTML first
  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:var(--primary);">$1</a>');
  return text;
}

// ---------------------------------------------------------------------------
// Search and filter
// ---------------------------------------------------------------------------
function filterMemoryList() {
  const query = (document.getElementById('learningSearch')?.value || '').trim().toLowerCase();
  const rows = document.querySelectorAll('.memory-row, .learning-row');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = (!query || text.includes(query)) ? '' : 'none';
  });
}

window._manualFilter = 'all';

function filterManualEntries(type) {
  window._manualFilter = type;
  document.querySelectorAll('[data-mfilter]').forEach(c => {
    c.classList.toggle('active', c.dataset.mfilter === type);
  });
  document.querySelectorAll('.learning-row').forEach(row => {
    const rowType = row.dataset.type;
    row.style.display = (type === 'all' || rowType === type) ? '' : 'none';
  });
}

// ---------------------------------------------------------------------------
// Manual entry CRUD (kept for backward compatibility)
// ---------------------------------------------------------------------------
function openLearningModal() {
  document.getElementById('learningType').value = 'lesson';
  document.getElementById('learningTitle').value = '';
  document.getElementById('learningDetail').value = '';
  document.getElementById('learningOutcome').value = '';
  document.getElementById('learningModal').classList.add('open');
}

function closeLearningModal() {
  document.getElementById('learningModal').classList.remove('open');
}

async function saveLearning() {
  const title = document.getElementById('learningTitle').value.trim();
  if (!title) return alert('Title is required');

  await apiPost('/api/learning', {
    type: document.getElementById('learningType').value,
    title,
    detail: document.getElementById('learningDetail').value.trim(),
    outcome: document.getElementById('learningOutcome').value.trim(),
  });

  closeLearningModal();
  if (window._memoryTab === 'manual') {
    switchMemoryTab('manual');
  }
}

async function deleteLearning(id) {
  if (!confirm('Delete this learning entry?')) return;
  await apiDelete(`/api/learning/${id}`);
  if (window._memoryTab === 'manual') {
    switchMemoryTab('manual');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function _friendlyName(str) {
  return (str || '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function _formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
