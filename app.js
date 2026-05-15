const STORAGE_KEY = 'live-caption-pm-dashboard-v1';
const STATUS_ORDER = ['Done', 'In Progress', 'Blocked', 'Not Started'];
const STATUS_COLORS = {
  'Done': '#15a46d',
  'In Progress': '#3566e8',
  'Blocked': '#d94242',
  'Not Started': '#c6cbd6'
};

let state = null;

function byId(id) { return document.getElementById(id); }
function uniq(values) { return [...new Set(values.filter(Boolean))]; }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

async function loadProject() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return JSON.parse(saved);
  const response = await fetch('data/project.json');
  if (!response.ok) throw new Error('Could not load project.json');
  return response.json();
}

function saveProject() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function taskStatusCounts(tasks) {
  return STATUS_ORDER.reduce((acc, status) => {
    acc[status] = tasks.filter(t => t.Status === status).length;
    return acc;
  }, {});
}

function completionPercent(tasks) {
  if (!tasks.length) return 0;
  return Math.round((tasks.filter(t => t.Status === 'Done').length / tasks.length) * 100);
}

function activeTasks(tasks) {
  return tasks.filter(t => ['In Progress', 'Blocked'].includes(t.Status));
}

function overdueTasks(tasks) {
  const today = todayISO();
  return tasks.filter(t => t['Due Date'] && t.Status !== 'Done' && t['Due Date'] < today);
}

function renderHeader() {
  byId('subtitle').textContent = state.meta.subtitle;
  byId('currentMilestone').textContent = state.meta.currentMilestone;
  byId('lastUpdated').textContent = `Last updated ${state.meta.lastUpdated}`;
}

function renderStats() {
  const tasks = state.tasks;
  const stats = [
    { label: 'Overall complete', value: `${completionPercent(tasks)}%`, sub: `${tasks.filter(t => t.Status === 'Done').length}/${tasks.length} tasks done` },
    { label: 'In progress', value: activeTasks(tasks).length, sub: 'Keep this under 3' },
    { label: 'Blocked', value: tasks.filter(t => t.Status === 'Blocked').length, sub: 'Needs attention first' },
    { label: 'Overdue', value: overdueTasks(tasks).length, sub: 'Check due dates weekly' }
  ];
  byId('stats').innerHTML = stats.map(s => `
    <article class="stat-card">
      <span>${escapeHtml(s.label)}</span>
      <strong>${escapeHtml(s.value)}</strong>
      <small>${escapeHtml(s.sub)}</small>
    </article>
  `).join('');
}

function renderDonut() {
  const counts = taskStatusCounts(state.tasks);
  const total = state.tasks.length || 1;
  let current = 0;
  const segments = STATUS_ORDER.map(status => {
    const count = counts[status] || 0;
    const start = current;
    current += (count / total) * 100;
    return `${STATUS_COLORS[status]} ${start}% ${current}%`;
  }).join(', ');
  byId('donut').style.background = `conic-gradient(${segments})`;
  byId('donut').innerHTML = `<span>${completionPercent(state.tasks)}%</span><small>done</small>`;
  byId('statusLegend').innerHTML = STATUS_ORDER.map(status => `
    <div class="legend-row">
      <i style="background:${STATUS_COLORS[status]}"></i>
      <span>${escapeHtml(status)}</span>
      <strong>${counts[status] || 0}</strong>
    </div>
  `).join('');
}

function renderPhaseBars() {
  const phases = uniq(state.tasks.map(t => t.Phase));
  byId('phaseBars').innerHTML = phases.map(phase => {
    const tasks = state.tasks.filter(t => t.Phase === phase);
    const percent = completionPercent(tasks);
    const active = tasks.filter(t => t.Status === 'In Progress').length;
    return `
      <div class="bar-row">
        <div class="bar-label">
          <span>${escapeHtml(phase)}</span>
          <strong>${percent}%</strong>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${percent}%"></div></div>
        <small>${tasks.filter(t => t.Status === 'Done').length}/${tasks.length} done · ${active} active</small>
      </div>
    `;
  }).join('');
}

function renderPipeline() {
  byId('pipeline').innerHTML = state.pipeline.map((item, index) => `
    <div class="pipe-step">
      <div class="pipe-number">${index + 1}</div>
      <span>${escapeHtml(item.stage)}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.description)}</p>
    </div>
  `).join('');
}

function renderTargets() {
  byId('targets').innerHTML = state.targets.map(target => `
    <div class="target ${target.status.toLowerCase().replaceAll(' ', '-')}">
      <div>
        <strong>${escapeHtml(target.name)}</strong>
        <p>${escapeHtml(target.metric)}</p>
      </div>
      <span>${escapeHtml(target.status)}</span>
      <small>${escapeHtml(target.due)}</small>
    </div>
  `).join('');
}

function renderAnnotations() {
  byId('annotations').innerHTML = state.annotations.slice().reverse().map(note => `
    <div class="note ${escapeHtml(note.type || 'note')}">
      <span>${escapeHtml(note.date)}</span>
      <strong>${escapeHtml(note.title)}</strong>
      <p>${escapeHtml(note.body)}</p>
    </div>
  `).join('');
}

function renderRisks() {
  byId('risks').innerHTML = state.risks.map(risk => `
    <div class="risk ${escapeHtml(risk.level.toLowerCase())}">
      <span>${escapeHtml(risk.level)}</span>
      <strong>${escapeHtml(risk.risk)}</strong>
      <p>${escapeHtml(risk.mitigation)}</p>
    </div>
  `).join('');
}

function populateFilters() {
  const phases = uniq(state.tasks.map(t => t.Phase));
  byId('phaseFilter').innerHTML = '<option value="all">All phases</option>' + phases.map(p => `<option>${escapeHtml(p)}</option>`).join('');
  byId('statusFilter').innerHTML = '<option value="all">All statuses</option>' + STATUS_ORDER.map(s => `<option>${escapeHtml(s)}</option>`).join('');
}

function filteredTasks() {
  const search = byId('search').value.trim().toLowerCase();
  const phase = byId('phaseFilter').value;
  const status = byId('statusFilter').value;
  return state.tasks.filter(task => {
    const haystack = `${task.ID} ${task.Task} ${task.Workstream} ${task.Phase} ${task['Next action']} ${task.Notes}`.toLowerCase();
    return (!search || haystack.includes(search)) &&
      (phase === 'all' || task.Phase === phase) &&
      (status === 'all' || task.Status === status);
  });
}

function renderTaskBoard() {
  const tasks = filteredTasks();
  const grouped = STATUS_ORDER.map(status => [status, tasks.filter(t => t.Status === status)]);
  byId('taskBoard').innerHTML = grouped.map(([status, list]) => `
    <div class="task-column">
      <h3><span>${escapeHtml(status)}</span><small>${list.length}</small></h3>
      ${list.map(task => taskCard(task)).join('') || '<p class="empty">No tasks here.</p>'}
    </div>
  `).join('');

  document.querySelectorAll('[data-status-change]').forEach(select => {
    select.addEventListener('change', event => {
      const task = state.tasks.find(t => t.ID === event.target.dataset.id);
      if (!task) return;
      task.Status = event.target.value;
      task.Notes = task.Notes || '';
      saveProject();
      renderAll(false);
    });
  });
}

function taskCard(task) {
  return `
    <article class="task-card priority-${escapeHtml((task.Priority || '').slice(0, 2).toLowerCase())}">
      <div class="task-head">
        <span>${escapeHtml(task.ID)}</span>
        <strong>${escapeHtml(task.Priority)}</strong>
      </div>
      <h4>${escapeHtml(task.Task)}</h4>
      <p>${escapeHtml(task['Why it matters'])}</p>
      <div class="task-meta">
        <span>${escapeHtml(task.Workstream)}</span>
        <span>Due ${escapeHtml(task['Due Date'] || 'TBD')}</span>
        <span>${escapeHtml(task['Effort hrs'] || '?')}h</span>
      </div>
      <div class="next-action"><b>Next:</b> ${escapeHtml(task['Next action'] || 'No next action set.')}</div>
      <label class="status-edit">Status
        <select data-status-change data-id="${escapeHtml(task.ID)}">
          ${STATUS_ORDER.map(s => `<option ${task.Status === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
        </select>
      </label>
    </article>
  `;
}

function renderAll(rebuildFilters = true) {
  renderHeader();
  renderStats();
  renderDonut();
  renderPhaseBars();
  renderPipeline();
  renderTargets();
  renderAnnotations();
  renderRisks();
  if (rebuildFilters) populateFilters();
  renderTaskBoard();
}

function download(filename, data, mime) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function setupEvents() {
  ['search', 'phaseFilter', 'statusFilter'].forEach(id => byId(id).addEventListener('input', () => renderTaskBoard()));
  byId('annotationForm').addEventListener('submit', event => {
    event.preventDefault();
    state.annotations.push({
      date: todayISO(),
      title: byId('annotationTitle').value.trim(),
      body: byId('annotationBody').value.trim(),
      type: 'note'
    });
    byId('annotationTitle').value = '';
    byId('annotationBody').value = '';
    state.meta.lastUpdated = todayISO();
    saveProject();
    renderAll(false);
  });
  byId('resetData').addEventListener('click', () => {
    if (!confirm('Reset your local dashboard edits and reload the starter project data?')) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });
  byId('exportData').addEventListener('click', () => {
    download(`live-caption-dashboard-${todayISO()}.json`, JSON.stringify(state, null, 2), 'application/json');
  });
}

loadProject()
  .then(project => {
    state = project;
    renderAll();
    setupEvents();
  })
  .catch(error => {
    document.body.innerHTML = `<main><article class="card"><h1>Could not load dashboard</h1><p>${escapeHtml(error.message)}</p></article></main>`;
  });
