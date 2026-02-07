/* ===================================================================
   goals.js — Goal Tracking View
   =================================================================== */

registerView('goals', async function renderGoals() {
  const resp = await apiFetch('/api/goals');
  const goals = (resp && resp.goals) || [];

  const active    = goals.filter(g => g.status === 'active');
  const completed = goals.filter(g => g.status === 'completed');

  const html = `
    <div class="toolbar">
      <div style="flex:1;"></div>
      <button class="btn btn-primary" onclick="openGoalModal()">+ New Goal</button>
    </div>

    <!-- Summary -->
    <div class="stats-grid" style="margin-bottom: 24px;">
      <div class="card fade-in">
        <div class="card-title">Active Goals</div>
        <div class="stat-value color-primary">${active.length}</div>
      </div>
      <div class="card fade-in">
        <div class="card-title">Completed</div>
        <div class="stat-value color-success">${completed.length}</div>
      </div>
      <div class="card fade-in">
        <div class="card-title">Total</div>
        <div class="stat-value color-warning">${goals.length}</div>
      </div>
    </div>

    <!-- Active goals -->
    <div class="section-header">
      <span class="section-title">Active Goals</span>
    </div>
    <div id="activeGoals" style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 32px;">
      ${active.length ? active.map(renderGoalCard).join('') : '<div class="empty-state"><p>No active goals. Create one to get started!</p></div>'}
    </div>

    <!-- Completed goals -->
    ${completed.length ? `
      <div class="section-header">
        <span class="section-title">Completed</span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${completed.map(renderGoalCard).join('')}
      </div>
    ` : ''}

    <!-- Modal -->
    <div class="modal-overlay" id="goalModal">
      <div class="modal">
        <div class="modal-title" id="goalModalTitle">New Goal</div>
        <input type="hidden" id="goalEditId" value="">
        <div class="form-group">
          <label class="form-label">Title</label>
          <input class="form-input" id="goalTitle" placeholder="e.g. Ship v2.0 by March">
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea class="form-textarea" id="goalDesc" placeholder="What does success look like?"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Deadline</label>
          <input class="form-input" id="goalDeadline" type="date">
        </div>
        <div class="form-group">
          <label class="form-label">Progress (0-100)</label>
          <input class="form-input" id="goalProgress" type="number" min="0" max="100" value="0">
        </div>
        <div class="form-group">
          <label class="form-label">Milestones (one per line)</label>
          <textarea class="form-textarea" id="goalMilestones" placeholder="Research phase&#10;Build prototype&#10;Testing"></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="closeGoalModal()">Cancel</button>
          <button class="btn btn-primary" onclick="saveGoal()">Save Goal</button>
        </div>
      </div>
    </div>
  `;

  return html;
});

function renderGoalCard(g) {
  const progress = g.progress || 0;
  const isComplete = g.status === 'completed';
  const deadlineTag = g.deadline
    ? `<span class="tag tag-muted">${formatDate(g.deadline)}</span>`
    : '';
  const statusTag = isComplete
    ? '<span class="tag tag-success">Completed</span>'
    : '<span class="tag tag-primary">Active</span>';

  const milestones = (g.milestones || []).map((m, i) => {
    const done = typeof m === 'object' ? m.done : false;
    const text = typeof m === 'object' ? m.text : m;
    return `
      <div class="milestone-item ${done ? 'done' : ''}">
        <span class="milestone-check ${done ? 'checked' : ''}" onclick="toggleMilestone('${g.id}', ${i})">&#10003;</span>
        <span>${text}</span>
      </div>
    `;
  }).join('');

  return `
    <div class="card goal-card fade-in">
      <div class="card-header">
        <span class="section-title">${g.title}</span>
        <div style="display: flex; gap: 6px;">
          ${statusTag}
          ${deadlineTag}
        </div>
      </div>
      ${g.description ? `<p style="font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 8px;">${g.description}</p>` : ''}
      <div class="goal-meta">
        <span style="font-size: 0.8rem; color: var(--text-muted);">${progress}% complete</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${progress}%;"></div>
      </div>
      ${milestones ? `<div class="milestone-list">${milestones}</div>` : ''}
      <div style="margin-top: 14px; display: flex; gap: 8px;">
        <button class="btn btn-ghost btn-sm" onclick="editGoal('${g.id}')">Edit</button>
        ${!isComplete ? `<button class="btn btn-sm" style="background: var(--success-dim); color: var(--success);" onclick="completeGoal('${g.id}')">Mark Complete</button>` : ''}
        <button class="btn btn-danger btn-sm" onclick="deleteGoal('${g.id}')">Delete</button>
      </div>
    </div>
  `;
}

function openGoalModal(goal) {
  document.getElementById('goalEditId').value = goal ? goal.id : '';
  document.getElementById('goalModalTitle').textContent = goal ? 'Edit Goal' : 'New Goal';
  document.getElementById('goalTitle').value = goal ? goal.title : '';
  document.getElementById('goalDesc').value = goal ? (goal.description || '') : '';
  document.getElementById('goalDeadline').value = goal ? (goal.deadline || '') : '';
  document.getElementById('goalProgress').value = goal ? (goal.progress || 0) : 0;

  const milestones = (goal && goal.milestones) || [];
  document.getElementById('goalMilestones').value = milestones
    .map(m => typeof m === 'object' ? m.text : m)
    .join('\n');

  document.getElementById('goalModal').classList.add('open');
}

function closeGoalModal() {
  document.getElementById('goalModal').classList.remove('open');
}

async function saveGoal() {
  const id = document.getElementById('goalEditId').value;
  const title = document.getElementById('goalTitle').value.trim();
  if (!title) return alert('Title is required');

  const milestoneLines = document.getElementById('goalMilestones').value.split('\n').filter(l => l.trim());
  const body = {
    title,
    description: document.getElementById('goalDesc').value.trim(),
    deadline: document.getElementById('goalDeadline').value,
    progress: parseInt(document.getElementById('goalProgress').value) || 0,
    milestones: milestoneLines.map(text => ({ text: text.trim(), done: false })),
  };

  if (id) {
    // Preserve milestone done states
    const resp = await apiFetch('/api/goals');
    const existing = ((resp && resp.goals) || []).find(g => g.id === id);
    if (existing && existing.milestones) {
      body.milestones = milestoneLines.map((text, i) => ({
        text: text.trim(),
        done: (existing.milestones[i] && typeof existing.milestones[i] === 'object')
          ? existing.milestones[i].done
          : false,
      }));
    }
    await apiPut(`/api/goals/${id}`, body);
  } else {
    await apiPost('/api/goals', body);
  }

  closeGoalModal();
  navigateTo('goals');
}

async function editGoal(id) {
  const resp = await apiFetch('/api/goals');
  const goal = ((resp && resp.goals) || []).find(g => g.id === id);
  if (goal) openGoalModal(goal);
}

async function completeGoal(id) {
  await apiPut(`/api/goals/${id}`, { status: 'completed', progress: 100 });
  navigateTo('goals');
}

async function deleteGoal(id) {
  if (!confirm('Delete this goal?')) return;
  await apiDelete(`/api/goals/${id}`);
  navigateTo('goals');
}

async function toggleMilestone(goalId, milestoneIdx) {
  const resp = await apiFetch('/api/goals');
  const goal = ((resp && resp.goals) || []).find(g => g.id === goalId);
  if (!goal) return;

  const milestones = goal.milestones || [];
  if (milestones[milestoneIdx]) {
    if (typeof milestones[milestoneIdx] === 'object') {
      milestones[milestoneIdx].done = !milestones[milestoneIdx].done;
    } else {
      milestones[milestoneIdx] = { text: milestones[milestoneIdx], done: true };
    }
  }

  // Recalc progress from milestones
  const doneCount = milestones.filter(m => typeof m === 'object' && m.done).length;
  const progress = milestones.length ? Math.round((doneCount / milestones.length) * 100) : goal.progress;

  await apiPut(`/api/goals/${goalId}`, { milestones, progress });
  navigateTo('goals');
}
