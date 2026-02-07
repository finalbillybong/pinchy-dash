/* ===================================================================
   agent.js — Agent View: View and edit IDENTITY.md and soul.md
   =================================================================== */

registerView('agent', async function renderAgent() {
  // Fetch both files in parallel
  const [identity, soul] = await Promise.all([
    apiFetch('/api/workspace/identity'),
    apiFetch('/api/workspace/soul'),
  ]);

  const identityFound = identity && identity.found;
  const soulFound = soul && soul.found;
  const identityRaw = identityFound ? identity.raw : '';
  const soulRaw = soulFound ? soul.raw : '';

  const html = `
    <div class="stats-grid" style="margin-bottom: 24px;">
      <div class="card fade-in">
        <div class="card-title">Agent Name</div>
        <div class="stat-value color-primary" style="font-size:1.3rem;letter-spacing:0;">
          ${identity && identity.name ? _escHtml(identity.name) : 'Unknown'}
        </div>
      </div>
      <div class="card fade-in">
        <div class="card-title">IDENTITY.md</div>
        <div class="stat-value ${identityFound ? 'color-success' : 'color-warning'}">
          ${identityFound ? 'Found' : 'Not found'}
        </div>
      </div>
      <div class="card fade-in">
        <div class="card-title">soul.md</div>
        <div class="stat-value ${soulFound ? 'color-success' : 'color-warning'}">
          ${soulFound ? 'Found' : 'Not found'}
        </div>
      </div>
    </div>

    <!-- IDENTITY.md -->
    <div class="card fade-in" style="margin-bottom: 24px;">
      <div class="card-header">
        <span class="card-title">IDENTITY.md</span>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost" id="identityEditBtn" style="font-size:0.8rem;">${identityFound ? 'Edit' : 'Create'}</button>
        </div>
      </div>
      <div id="identityView">
        ${identityFound
          ? `<div class="markdown-body" style="padding:16px 0;font-size:0.88rem;line-height:1.7;color:var(--text-secondary);">${renderMarkdown(identityRaw)}</div>`
          : `<div class="empty-state"><p>No IDENTITY.md file found in the workspace. Click "Create" to make one.</p></div>`
        }
      </div>
      <div id="identityEditor" style="display:none;">
        <textarea id="identityTextarea" class="form-input" style="width:100%;min-height:300px;font-family:'Consolas','Monaco','Courier New',monospace;font-size:0.82rem;line-height:1.6;resize:vertical;box-sizing:border-box;">${_escHtml(identityRaw)}</textarea>
        <div style="display:flex;gap:10px;margin-top:12px;">
          <button class="btn btn-primary" id="identitySaveBtn">Save</button>
          <button class="btn btn-ghost" id="identityCancelBtn">Cancel</button>
        </div>
        <div id="identityMsg" style="margin-top:12px;display:none;"></div>
      </div>
    </div>

    <!-- soul.md -->
    <div class="card fade-in" style="margin-bottom: 24px;">
      <div class="card-header">
        <span class="card-title">soul.md</span>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost" id="soulEditBtn" style="font-size:0.8rem;">${soulFound ? 'Edit' : 'Create'}</button>
        </div>
      </div>
      <div id="soulView">
        ${soulFound
          ? `<div class="markdown-body" style="padding:16px 0;font-size:0.88rem;line-height:1.7;color:var(--text-secondary);">${renderMarkdown(soulRaw)}</div>`
          : `<div class="empty-state"><p>No soul.md file found in the workspace. Click "Create" to make one.</p></div>`
        }
      </div>
      <div id="soulEditor" style="display:none;">
        <textarea id="soulTextarea" class="form-input" style="width:100%;min-height:300px;font-family:'Consolas','Monaco','Courier New',monospace;font-size:0.82rem;line-height:1.6;resize:vertical;box-sizing:border-box;">${_escHtml(soulRaw)}</textarea>
        <div style="display:flex;gap:10px;margin-top:12px;">
          <button class="btn btn-primary" id="soulSaveBtn">Save</button>
          <button class="btn btn-ghost" id="soulCancelBtn">Cancel</button>
        </div>
        <div id="soulMsg" style="margin-top:12px;display:none;"></div>
      </div>
    </div>
  `;

  setTimeout(() => {
    _setupEditor('identity', '/api/workspace/identity');
    _setupEditor('soul', '/api/workspace/soul');
  }, 50);

  return html;
});

function _setupEditor(prefix, endpoint) {
  const editBtn = document.getElementById(`${prefix}EditBtn`);
  const saveBtn = document.getElementById(`${prefix}SaveBtn`);
  const cancelBtn = document.getElementById(`${prefix}CancelBtn`);
  const view = document.getElementById(`${prefix}View`);
  const editor = document.getElementById(`${prefix}Editor`);
  const textarea = document.getElementById(`${prefix}Textarea`);
  const msg = document.getElementById(`${prefix}Msg`);

  if (!editBtn) return;

  editBtn.addEventListener('click', () => {
    view.style.display = 'none';
    editor.style.display = 'block';
    editBtn.style.display = 'none';
    textarea.focus();
  });

  cancelBtn.addEventListener('click', () => {
    view.style.display = '';
    editor.style.display = 'none';
    editBtn.style.display = '';
    if (msg) msg.style.display = 'none';
  });

  saveBtn.addEventListener('click', async () => {
    const content = textarea.value;
    if (!content.trim()) {
      _showEditorMsg(msg, 'Content cannot be empty.', 'error');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    const resp = await apiPost(endpoint, { content });
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';

    if (resp && resp.saved) {
      _showEditorMsg(msg, 'Saved successfully!', 'success');
      // Refresh the view after a moment
      setTimeout(() => navigateTo('agent'), 800);
    } else {
      const err = (resp && resp.error) || 'Failed to save. Is the volume mounted read-write?';
      _showEditorMsg(msg, err, 'error');
    }
  });
}

function _showEditorMsg(el, text, type) {
  if (!el) return;
  const colors = {
    success: { bg: 'var(--success-dim)', border: 'rgba(29,209,161,0.25)', color: 'var(--success)' },
    error:   { bg: 'var(--accent-dim)',  border: 'rgba(255,107,107,0.25)', color: 'var(--accent)' },
  };
  const c = colors[type] || colors.error;
  el.style.display = 'block';
  el.style.padding = '12px 16px';
  el.style.borderRadius = '8px';
  el.style.fontSize = '0.85rem';
  el.style.background = c.bg;
  el.style.border = `1px solid ${c.border}`;
  el.style.color = c.color;
  el.textContent = text;
}

/* Simple markdown renderer — handles headers, bold, italic, code, lists, links */
function renderMarkdown(md) {
  if (!md) return '';
  return md
    .split('\n')
    .map(line => {
      // Headings
      if (line.startsWith('### ')) return `<h4 style="margin:16px 0 8px;color:var(--text-primary);font-size:0.95rem;">${_inlineMd(line.slice(4))}</h4>`;
      if (line.startsWith('## ')) return `<h3 style="margin:20px 0 8px;color:var(--text-primary);font-size:1.05rem;">${_inlineMd(line.slice(3))}</h3>`;
      if (line.startsWith('# ')) return `<h2 style="margin:20px 0 10px;color:var(--text-primary);font-size:1.15rem;">${_inlineMd(line.slice(2))}</h2>`;
      // List items
      if (/^[-*]\s/.test(line)) return `<div style="padding:2px 0 2px 16px;position:relative;"><span style="position:absolute;left:0;">•</span>${_inlineMd(line.slice(2))}</div>`;
      // Empty lines
      if (!line.trim()) return '<div style="height:8px;"></div>';
      // Normal paragraph
      return `<div style="padding:2px 0;">${_inlineMd(line)}</div>`;
    })
    .join('');
}

function _inlineMd(text) {
  return _escHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text-primary);">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:var(--bg-deep);padding:1px 5px;border-radius:4px;font-size:0.82rem;">$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" style="color:var(--primary);">$1</a>');
}

function _escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
