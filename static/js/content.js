/* ===================================================================
   content.js — Content Tracker View (Kanban-style)
   =================================================================== */

registerView('content', async function renderContent() {
  const resp = await apiFetch('/api/content');
  const items = (resp && resp.items) || [];

  const ideas     = items.filter(i => i.status === 'idea');
  const drafts    = items.filter(i => i.status === 'draft');
  const published = items.filter(i => i.status === 'published');

  const html = `
    <div class="toolbar">
      ${searchBoxHTML('Search content...', 'contentSearch')}
      <button class="btn btn-primary" onclick="openContentModal()">+ New Item</button>
    </div>

    <!-- Kanban board -->
    <div class="kanban-grid" id="kanbanGrid">
      <div class="kanban-column">
        <div class="kanban-column-title">
          <span class="tag tag-warning">Ideas</span>
          <span class="kanban-count">${ideas.length}</span>
        </div>
        <div class="kanban-items" data-status="idea">
          ${ideas.map(renderKanbanCard).join('') || '<div class="empty-state" style="padding: 20px;"><p style="font-size:0.8rem;">No ideas yet</p></div>'}
        </div>
      </div>

      <div class="kanban-column">
        <div class="kanban-column-title">
          <span class="tag tag-primary">Drafts</span>
          <span class="kanban-count">${drafts.length}</span>
        </div>
        <div class="kanban-items" data-status="draft">
          ${drafts.map(renderKanbanCard).join('') || '<div class="empty-state" style="padding: 20px;"><p style="font-size:0.8rem;">No drafts</p></div>'}
        </div>
      </div>

      <div class="kanban-column">
        <div class="kanban-column-title">
          <span class="tag tag-success">Published</span>
          <span class="kanban-count">${published.length}</span>
        </div>
        <div class="kanban-items" data-status="published">
          ${published.map(renderKanbanCard).join('') || '<div class="empty-state" style="padding: 20px;"><p style="font-size:0.8rem;">Nothing published</p></div>'}
        </div>
      </div>
    </div>

    <!-- Modal -->
    <div class="modal-overlay" id="contentModal">
      <div class="modal">
        <div class="modal-title" id="contentModalTitle">New Content</div>
        <input type="hidden" id="contentEditId" value="">
        <div class="form-group">
          <label class="form-label">Title</label>
          <input class="form-input" id="contentTitle" placeholder="e.g. Blog post about AI agents">
        </div>
        <div class="form-group">
          <label class="form-label">Type</label>
          <select class="form-select" id="contentType">
            <option value="article">Article</option>
            <option value="tutorial">Tutorial</option>
            <option value="video">Video</option>
            <option value="tweet">Tweet / Post</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-select" id="contentStatus">
            <option value="idea">Idea</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Tags (comma separated)</label>
          <input class="form-input" id="contentTags" placeholder="e.g. ai, openclaw, tutorial">
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea class="form-textarea" id="contentNotes" placeholder="Outline, key points, links..."></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="closeContentModal()">Cancel</button>
          <button class="btn btn-primary" onclick="saveContent()">Save</button>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    const searchEl = document.getElementById('contentSearch');
    if (searchEl) {
      searchEl.addEventListener('input', () => filterContent());
    }
  }, 50);

  return html;
});

function renderKanbanCard(item) {
  const tags = (item.tags || []).map(t =>
    `<span class="tag tag-muted" style="font-size:0.68rem;">${t}</span>`
  ).join('');

  const typeColors = {
    article: 'tag-primary',
    tutorial: 'tag-warning',
    video: 'tag-accent',
    tweet: 'tag-purple',
    other: 'tag-muted',
  };

  return `
    <div class="kanban-card" onclick="editContent('${item.id}')">
      <div class="kanban-card-title">${item.title}</div>
      <div class="kanban-card-meta">
        <span class="tag ${typeColors[item.type] || 'tag-muted'}" style="font-size:0.68rem;">${item.type || 'other'}</span>
        ${tags}
      </div>
      ${item.notes ? `<p style="font-size: 0.78rem; color: var(--text-muted); margin-top: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.notes}</p>` : ''}
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
        <span style="font-size: 0.72rem; color: var(--text-muted);">${timeAgo(item.updated || item.created)}</span>
        <button class="btn btn-danger btn-sm" style="padding:3px 8px; font-size:0.7rem;" onclick="event.stopPropagation(); deleteContent('${item.id}')">Del</button>
      </div>
    </div>
  `;
}

function openContentModal(item) {
  document.getElementById('contentEditId').value = item ? item.id : '';
  document.getElementById('contentModalTitle').textContent = item ? 'Edit Content' : 'New Content';
  document.getElementById('contentTitle').value = item ? item.title : '';
  document.getElementById('contentType').value = item ? (item.type || 'article') : 'article';
  document.getElementById('contentStatus').value = item ? (item.status || 'idea') : 'idea';
  document.getElementById('contentTags').value = item ? (item.tags || []).join(', ') : '';
  document.getElementById('contentNotes').value = item ? (item.notes || '') : '';

  document.getElementById('contentModal').classList.add('open');
}

function closeContentModal() {
  document.getElementById('contentModal').classList.remove('open');
}

async function saveContent() {
  const id = document.getElementById('contentEditId').value;
  const title = document.getElementById('contentTitle').value.trim();
  if (!title) return alert('Title is required');

  const body = {
    title,
    type: document.getElementById('contentType').value,
    status: document.getElementById('contentStatus').value,
    tags: document.getElementById('contentTags').value.split(',').map(t => t.trim()).filter(Boolean),
    notes: document.getElementById('contentNotes').value.trim(),
  };

  if (id) {
    await apiPut(`/api/content/${id}`, body);
  } else {
    await apiPost('/api/content', body);
  }

  closeContentModal();
  navigateTo('content');
}

async function editContent(id) {
  const resp = await apiFetch('/api/content');
  const item = ((resp && resp.items) || []).find(i => i.id === id);
  if (item) openContentModal(item);
}

async function deleteContent(id) {
  if (!confirm('Delete this content item?')) return;
  await apiDelete(`/api/content/${id}`);
  navigateTo('content');
}

function filterContent() {
  const query = (document.getElementById('contentSearch')?.value || '').trim().toLowerCase();
  document.querySelectorAll('.kanban-card').forEach(card => {
    const text = card.textContent.toLowerCase();
    card.style.display = text.includes(query) ? '' : 'none';
  });
}
