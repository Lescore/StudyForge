import { api } from '../api.js';
import { state } from '../store.js';
import {
  esc,
  icon,
  toast,
  errorToast,
  confirmDialog,
  subjectOptions,
  todayISO,
  parseDate,
  formatDate,
  deadlineLabel,
  daysUntil,
  emptyState,
  relativeTime
} from '../ui.js';
import { openTaskDialog } from './dialogs.js';

function groupTasks(tasks) {
  const groups = new Map([
    ['overdue', { label: 'Überfällig', items: [] }],
    ['today', { label: 'Heute', items: [] }],
    ['week', { label: 'Diese Woche', items: [] }],
    ['later', { label: 'Später', items: [] }],
    ['none', { label: 'Ohne Datum', items: [] }],
    ['done', { label: 'Erledigt', items: [] }]
  ]);
  const today = parseDate(todayISO());
  for (const task of tasks) {
    if (task.status === 'erledigt') {
      groups.get('done').items.push(task);
      continue;
    }
    if (!task.due_date) {
      groups.get('none').items.push(task);
      continue;
    }
    const days = daysUntil(task.due_date);
    if (days < 0) groups.get('overdue').items.push(task);
    else if (days === 0) groups.get('today').items.push(task);
    else if (days <= 7) groups.get('week').items.push(task);
    else groups.get('later').items.push(task);
  }
  void today;
  return [...groups.values()].filter((group) => group.items.length);
}

function priorityBadge(priority) {
  if (priority === 'hoch') return '<span class="badge badge-danger">Hoch</span>';
  if (priority === 'niedrig') return '<span class="badge">Niedrig</span>';
  return '<span class="badge badge-info">Normal</span>';
}

function taskCard(task, notesById, filesById) {
  const done = task.status === 'erledigt';
  const noteLinks = (task.note_ids ?? []).map((id) => notesById.get(id)).filter(Boolean);
  const fileLinks = (task.file_ids ?? []).map((id) => filesById.get(id)).filter(Boolean);
  return `<article class="card" style="padding:.85rem" data-task="${task.id}">
    <div class="row" style="align-items:flex-start;flex-wrap:nowrap;gap:.6rem">
      <input type="checkbox" style="margin-top:.35rem;width:1.1rem;height:1.1rem;accent-color:var(--accent)" data-toggle-task="${task.id}" ${done ? 'checked' : ''} aria-label="Aufgabe ${done ? 'wieder öffnen' : 'erledigen'}: ${esc(task.title)}">
      <div style="flex:1;min-width:0">
        <div class="row-between">
          <div class="check-title ${done ? 'done' : ''}" style="font-weight:600;font-size:.95rem;${done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(task.title)}</div>
          <div class="row" style="gap:.2rem">
            <select class="select" data-task-status="${task.id}" aria-label="Status" style="width:auto;min-height:28px;font-size:.74rem;padding:.15rem .35rem">
              ${[['offen', 'Offen'], ['in_bearbeitung', 'In Bearbeitung'], ['erledigt', 'Erledigt']].map(([value, label]) => `<option value="${value}"${task.status === value ? ' selected' : ''}>${label}</option>`).join('')}
            </select>
            <button class="icon-btn" data-edit-task="${task.id}" aria-label="Aufgabe bearbeiten" title="Bearbeiten">${icon('edit')}</button>
            <button class="icon-btn danger" data-delete-task="${task.id}" data-title="${esc(task.title)}" aria-label="Aufgabe löschen" title="Löschen">${icon('trash')}</button>
          </div>
        </div>
        <div class="list-meta mt-1">
          ${task.subject_name ? `<span data-color="${esc(task.subject_color || 'slate')}" style="display:inline-flex;align-items:center;gap:.3rem"><span class="subject-dot"></span>${esc(task.subject_name)}</span>` : 'Ohne Fach'}
          ${task.topic ? `· ${esc(task.topic)}` : ''}
          ${priorityBadge(task.priority)}
          ${task.due_date ? `<span class="badge ${daysUntil(task.due_date) < 0 && !done ? 'badge-danger' : ''}">${icon('clock')} ${esc(deadlineLabel(task.due_date))}</span>` : ''}
          ${task.exam_title ? `<span class="badge">Prüfung: ${esc(task.exam_title)}</span>` : ''}
          ${done && task.completed_at ? `<span class="faint tiny">erledigt ${relativeTime(task.completed_at)}</span>` : ''}
        </div>
        ${task.description ? `<p class="small subtle" style="margin:.4rem 0 0">${esc(task.description.slice(0, 300))}${task.description.length > 300 ? '…' : ''}</p>` : ''}
        ${task.subtask_count ? `<div class="progress mt-2" style="max-width:260px"><span style="width:${Math.round((task.subtask_done / task.subtask_count) * 100)}%"></span></div>
          <div class="tiny subtle mt-1">${task.subtask_done} von ${task.subtask_count} Teilaufgaben erledigt</div>` : ''}
        <div class="stack mt-2" style="gap:.25rem">
          ${(task.subtasks ?? [])
            .map((sub) => `<div class="row" style="gap:.4rem"><label class="checkbox" style="font-size:.82rem;flex:1"><input type="checkbox" data-toggle-subtask="${sub.id}" ${sub.done ? 'checked' : ''}> <span style="${sub.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(sub.title)}</span></label>
              <button type="button" class="icon-btn" style="width:22px;height:22px" data-delete-subtask="${sub.id}" aria-label="Teilaufgabe löschen">${icon('close')}</button></div>`)
            .join('')}
        </div>
        <form class="row mt-1" data-add-subtask="${task.id}" style="gap:.3rem">
          <input class="input" name="title" placeholder="Teilaufgabe hinzufügen …" style="min-height:30px;font-size:.8rem;max-width:280px" aria-label="Neue Teilaufgabe">
          <button class="btn btn-sm" type="submit">${icon('plus')} Hinzufügen</button>
        </form>
        ${noteLinks.length || fileLinks.length
          ? `<div class="row mt-1" style="gap:.3rem">
              ${noteLinks.map((note) => `<a class="chip" href="#/notizen/${note.id}">${icon('notes')} ${esc(note.title)}</a>`).join('')}
              ${fileLinks.map((file) => `<a class="chip" href="/api/files/${file.id}/raw" target="_blank" rel="noopener">${icon('documents')} ${esc(file.title || file.original_name)}</a>`).join('')}
            </div>`
          : ''}
      </div>
    </div>
  </article>`;
}

export async function render(root, ctx) {
  const view = ctx.query.get('view') || 'open';
  const subjectFilter = ctx.query.get('subject_id') || '';
  const searchQuery = ctx.query.get('q') || '';

  const params = new URLSearchParams();
  if (view === 'open') params.set('open', '1');
  else if (view === 'done') params.set('status', 'erledigt');
  if (subjectFilter) params.set('subject_id', subjectFilter);
  if (searchQuery) params.set('q', searchQuery);

  const [tasks, notes, files] = await Promise.all([
    api.get(`/tasks?${params.toString()}`),
    api.get('/notes?limit=500&sort=updated').catch(() => ({ notes: [] })),
    api.get('/files?kind=document').catch(() => [])
  ]);
  const notesById = new Map((notes.notes ?? notes).map((note) => [note.id, note]));
  const filesById = new Map(files.map((file) => [file.id, file]));
  const groups = groupTasks(tasks);

  root.innerHTML = `
    <div class="page-head">
      <div class="page-heading">
        <h1>Aufgaben</h1>
        <p class="page-sub">Übungsblätter, Vorbereitung und offene Schritte – ohne Projektmanagement-Ballast.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="new-task">${icon('plus')} Aufgabe erstellen</button>
      </div>
    </div>

    <div class="card mb-2" style="padding:.7rem">
      <form class="row" id="quick-task" style="flex-wrap:nowrap">
        <input class="input" id="quick-task-title" placeholder="Schnell eine Aufgabe notieren …" aria-label="Neue Aufgabe" style="flex:1">
        <select class="select" id="quick-task-subject" aria-label="Fach" style="max-width:180px">
          <option value="">Kein Fach</option>${subjectOptions(state.subjects, state.settings.last_subject_id, { includeEmpty: false })}
        </select>
        <button class="btn btn-primary" type="submit">${icon('plus')} Hinzufügen</button>
      </form>
    </div>

    <div class="toolbar">
      <div class="row" role="group" aria-label="Aufgabenfilter">
        <a class="chip${view === 'open' ? ' active' : ''}" href="#/aufgaben?view=open">Offen</a>
        <a class="chip${view === 'done' ? ' active' : ''}" href="#/aufgaben?view=done">Erledigt</a>
        <a class="chip${view === 'all' ? ' active' : ''}" href="#/aufgaben?view=all">Alle</a>
      </div>
      <div class="search-field" style="margin-left:auto">${icon('search')}
        <input class="input" id="task-search" type="search" placeholder="Aufgaben durchsuchen …" value="${esc(searchQuery)}">
      </div>
      <select class="select" id="task-subject-filter" aria-label="Fach filtern">
        <option value="">Alle Fächer</option>
        ${subjectOptions(state.subjects, subjectFilter, { includeEmpty: false })}
      </select>
      <span class="small faint">${tasks.length} ${tasks.length === 1 ? 'Aufgabe' : 'Aufgaben'}</span>
    </div>

    <div id="task-groups">
      ${groups.length
        ? groups
            .map(
              (group) => `<section class="mb-2">
                <h2 style="font-size:.82rem;text-transform:uppercase;letter-spacing:.07em;color:${group.label === 'Überfällig' ? 'var(--danger)' : 'var(--muted)'};margin:.4rem 0 .5rem">${esc(group.label)} <span class="faint">${group.items.length}</span></h2>
                <div class="stack">${group.items.map((task) => taskCard(task, notesById, filesById)).join('')}</div>
              </section>`
            )
            .join('')
        : emptyState(
            view === 'done' ? 'Noch nichts erledigt' : 'Keine Aufgaben',
            view === 'done' ? 'Erledigte Aufgaben sammeln sich hier.' : 'Notiere deine nächsten Schritte – klein anfangen reicht.',
            view === 'done' ? '' : '<button class="btn btn-primary" data-new-task>Erste Aufgabe erstellen</button>'
          )}
    </div>`;

  const rerender = async () => {
    const hashQuery = location.hash.split('?')[1] || '';
    await render(root, { ...ctx, query: new URLSearchParams(hashQuery) });
  };

  const setFilter = (key, value) => {
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    if (value) params.set(key, value);
    else params.delete(key);
    history.replaceState(null, '', `#/aufgaben${params.toString() ? `?${params.toString()}` : ''}`);
    rerender();
  };

  const openEditor = (task = null) =>
    openTaskDialog(task, {
      subjectId: subjectFilter || null,
      onSaved: rerender
    });

  root.querySelector('#new-task').addEventListener('click', () => openEditor());
  root.querySelector('[data-new-task]')?.addEventListener('click', () => openEditor());
  root.querySelector('#quick-task').addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = root.querySelector('#quick-task-title').value.trim();
    if (!title) return;
    try {
      await api.post('/tasks', {
        title,
        subject_id: root.querySelector('#quick-task-subject').value || null
      });
      toast('Aufgabe angelegt.', 'success');
      await rerender();
    } catch (error) {
      errorToast(error);
    }
  });
  root.querySelector('#task-search').addEventListener('input', (event) => {
    window.clearTimeout(root._taskSearchTimer);
    root._taskSearchTimer = window.setTimeout(() => setFilter('q', event.target.value.trim()), 300);
  });
  root.querySelector('#task-subject-filter').addEventListener('change', (event) => setFilter('subject_id', event.target.value));

  root.querySelectorAll('[data-toggle-task]').forEach((checkbox) => {
    checkbox.addEventListener('change', async () => {
      try {
        await api.patch(`/tasks/${checkbox.dataset.toggleTask}`, { status: checkbox.checked ? 'erledigt' : 'offen' });
        await rerender();
      } catch (error) {
        checkbox.checked = !checkbox.checked;
        errorToast(error);
      }
    });
  });
  root.querySelectorAll('[data-task-status]').forEach((select) => {
    select.addEventListener('change', async () => {
      try {
        await api.patch(`/tasks/${select.dataset.taskStatus}`, { status: select.value });
        await rerender();
      } catch (error) {
        errorToast(error);
      }
    });
  });
  root.querySelectorAll('[data-edit-task]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        const task = await api.get(`/tasks/${button.dataset.editTask}`);
        openEditor(task);
      } catch (error) {
        errorToast(error);
      }
    });
  });
  root.querySelectorAll('[data-delete-task]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Aufgabe löschen?', message: `„${button.dataset.title}“ wird dauerhaft gelöscht.`, confirmLabel: 'Löschen', danger: true }))) return;
      try {
        await api.delete(`/tasks/${button.dataset.deleteTask}`);
        toast('Aufgabe gelöscht.', 'success');
        await rerender();
      } catch (error) {
        errorToast(error);
      }
    });
  });
  root.querySelectorAll('[data-toggle-subtask]').forEach((checkbox) => {
    checkbox.addEventListener('change', async () => {
      try {
        await api.patch(`/subtasks/${checkbox.dataset.toggleSubtask}`, { done: checkbox.checked });
        await rerender();
      } catch (error) {
        checkbox.checked = !checkbox.checked;
        errorToast(error);
      }
    });
  });
  root.querySelectorAll('[data-delete-subtask]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      try {
        await api.delete(`/subtasks/${button.dataset.deleteSubtask}`);
        await rerender();
      } catch (error) {
        errorToast(error);
      }
    });
  });
  root.querySelectorAll('[data-add-subtask]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = form.querySelector('input[name="title"]');
      if (!input.value.trim()) return;
      try {
        await api.post(`/tasks/${form.dataset.addSubtask}/subtasks`, { title: input.value.trim() });
        await rerender();
      } catch (error) {
        errorToast(error);
      }
    });
  });

  if (ctx.query.get('neu') === '1') {
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    params.delete('neu');
    history.replaceState(null, '', `#/aufgaben${params.toString() ? `?${params.toString()}` : ''}`);
    openEditor();
  }

  void formatDate;
}
