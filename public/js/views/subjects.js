import { api } from '../api.js';
import { state, refreshSubjects } from '../store.js';
import {
  esc,
  icon,
  toast,
  errorToast,
  confirmDialog,
  formatDate,
  relativeTime,
  deadlineLabel,
  daysUntil,
  emptyState
} from '../ui.js';
import { openSubjectDialog, openSemesterDialog, openGoalDialog } from './dialogs.js';

function subjectCard(subject) {
  return `<a class="subject-card" data-color="${esc(subject.color)}" href="#/faecher/${subject.id}">
    <div class="row-between">
      <div class="subject-name"><span class="subject-dot"></span>${esc(subject.name)}</div>
      <span class="badge">${subject.status === 'abgeschlossen' ? 'abgeschlossen' : subject.status === 'geplant' ? 'geplant' : 'aktiv'}</span>
    </div>
    <div class="progress-label mt-2"><span>${subject.topic_count > 0 ? `${subject.topics_done} von ${subject.topic_count} Themen verstanden` : `${subject.learned_cards} von ${subject.card_count} Karten begonnen`}</span><span>${subject.progress}%</span></div>
    <div class="progress" role="progressbar" aria-valuenow="${subject.progress}" aria-valuemin="0" aria-valuemax="100"><span style="width:${subject.progress}%;background:var(--subject-color)"></span></div>
    <div class="subject-stats">
      <span><strong>${subject.note_count}</strong> ${subject.note_count === 1 ? 'Notiz' : 'Notizen'}</span>
      <span><strong>${subject.card_count}</strong> ${subject.card_count === 1 ? 'Karte' : 'Karten'}</span>
      <span><strong>${subject.due_count}</strong> fällig</span>
      <span><strong>${subject.open_tasks}</strong> ${subject.open_tasks === 1 ? 'Aufgabe' : 'Aufgaben'}</span>
      ${subject.upcoming_exams ? `<span><strong>${subject.upcoming_exams}</strong> Prüfung${subject.upcoming_exams === 1 ? '' : 'en'}</span>` : ''}
    </div>
  </a>`;
}

async function renderList(root, ctx) {
  const [subjects, semesters] = await Promise.all([api.get('/subjects'), api.get('/semesters')]);
  state.subjects = subjects;
  state.semesters = semesters;
  const bySemester = new Map();
  for (const semester of semesters) bySemester.set(semester.id, []);
  const unassigned = [];
  for (const subject of subjects) {
    if (subject.semester_id && bySemester.has(subject.semester_id)) bySemester.get(subject.semester_id).push(subject);
    else unassigned.push(subject);
  }

  root.innerHTML = `
    <div class="page-head">
      <div class="page-heading">
        <h1>Fächer &amp; Semester</h1>
        <p class="page-sub">Deine Studienstruktur – frei anpassbar, ohne vorgegebene Fächer.</p>
      </div>
      <div class="page-actions">
        <button class="btn" id="new-semester">${icon('plus')} Semester</button>
        <button class="btn btn-primary" id="new-subject">${icon('plus')} Fach</button>
      </div>
    </div>

    ${subjects.length
      ? `${semesters
          .map((semester) => {
            const list = bySemester.get(semester.id) ?? [];
            return `<section class="semester-block">
              <div class="semester-head">
                <h2>${esc(semester.name)}</h2>
                <span class="semester-dates">${semester.start_date || semester.end_date ? `${formatDate(semester.start_date, { short: true })} – ${formatDate(semester.end_date, { short: true })}` : ''}</span>
                <span class="faint small">${list.length} ${list.length === 1 ? 'Fach' : 'Fächer'}</span>
                <div class="row" style="margin-left:auto;gap:.1rem">
                  <button class="icon-btn" data-edit-semester="${semester.id}" aria-label="Semester bearbeiten" title="Bearbeiten">${icon('edit')}</button>
                  <button class="icon-btn danger" data-delete-semester="${semester.id}" data-name="${esc(semester.name)}" aria-label="Semester löschen" title="Löschen">${icon('trash')}</button>
                </div>
              </div>
              ${list.length ? `<div class="subject-grid">${list.map(subjectCard).join('')}</div>` : '<p class="small subtle" style="margin:0">Noch kein Fach in diesem Semester.</p>'}
            </section>`;
          })
          .join('')}
        ${unassigned.length
          ? `<section class="semester-block">
              <div class="semester-head"><h2>Ohne Semester</h2><span class="faint small">${unassigned.length}</span></div>
              <div class="subject-grid">${unassigned.map(subjectCard).join('')}</div>
            </section>`
          : ''}`
      : emptyState(
          'Deine Studienstruktur beginnt hier',
          'Lege ein Semester und dein erstes Fach an. Danach kannst du Notizen, Karten, Dokumente und Prüfungen zuordnen.',
          '<button class="btn btn-primary" data-new-subject>Erstes Fach anlegen</button>'
        )}

    <div class="card mt-2">
      <div class="row small subtle">${icon('offline')}<span>Lernfortschritt basiert auf Themen, die du als „verstanden“ markierst. Gibt es keine Themen, zählt der Anteil begonnener Karten. Keine erfundenen Werte.</span></div>
    </div>`;

  const reload = async () => {
    await refreshSubjects();
    await render(root, ctx);
  };
  root.querySelector('#new-subject').addEventListener('click', () => openSubjectDialog(null, reload));
  root.querySelector('[data-new-subject]')?.addEventListener('click', () => openSubjectDialog(null, reload));
  root.querySelector('#new-semester').addEventListener('click', () => openSemesterDialog(null, reload));
  root.querySelectorAll('[data-edit-semester]').forEach((button) => {
    button.addEventListener('click', () => {
      const semester = semesters.find((item) => item.id === Number(button.dataset.editSemester));
      if (semester) openSemesterDialog(semester, reload);
    });
  });
  root.querySelectorAll('[data-delete-semester]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Semester löschen?', message: `„${button.dataset.name}“ wird gelöscht. Die Fächer bleiben erhalten und sind danach ohne Semester.`, confirmLabel: 'Semester löschen', danger: true }))) return;
      try {
        await api.delete(`/semesters/${button.dataset.deleteSemester}`);
        toast('Semester gelöscht. Fächer bleiben erhalten.', 'success');
        await reload();
      } catch (error) {
        errorToast(error);
      }
    });
  });
}

async function renderDetail(root, ctx) {
  let subject;
  try {
    subject = await api.get(`/subjects/${ctx.id}`);
  } catch (error) {
    root.innerHTML = `<div class="empty">${icon('alert')}<h3>Fach nicht gefunden</h3><p>${esc(error.message)}</p><a class="btn" href="#/faecher">Zur Übersicht</a></div>`;
    return;
  }
  const [notes, documents] = await Promise.all([
    api.get(`/notes?subject_id=${subject.id}&limit=5`).catch(() => ({ notes: [] })),
    api.get(`/files?kind=document&subject_id=${subject.id}`).catch(() => [])
  ]);
  const topicCounts = { offen: 0, ueben: 0, verstanden: 0 };
  subject.topics.forEach((topic) => {
    topicCounts[topic.status] = (topicCounts[topic.status] || 0) + 1;
  });

  root.innerHTML = `
    <div class="page-head subject-detail-head" data-color="${esc(subject.color)}">
      <div class="page-heading">
        <div class="breadcrumb"><a href="#/faecher">Fächer</a><span>/</span><span>${esc(subject.name)}</span></div>
        <h1>${esc(subject.name)}</h1>
        <p class="page-sub">${esc(subject.semester_name || 'Ohne Semester')} · ${subject.status === 'abgeschlossen' ? 'Abgeschlossen' : subject.status === 'geplant' ? 'Geplant' : 'Aktiv'}${subject.description ? ` · ${esc(subject.description.slice(0, 140))}${subject.description.length > 140 ? '…' : ''}` : ''}</p>
      </div>
      <div class="page-actions">
        <a class="btn" href="#/lernen?scope=subject&subject_id=${subject.id}">${icon('play')} Fach lernen</a>
        <button class="btn" id="edit-subject">${icon('edit')} Bearbeiten</button>
        <button class="btn btn-danger" id="delete-subject">${icon('trash')} Löschen</button>
      </div>
    </div>

    <div class="grid grid-2 mb-2">
      <section class="card">
        <div class="card-head"><h2>Fortschritt</h2><div class="card-actions"><span class="badge badge-accent">${subject.progress}%</span></div></div>
        <div class="progress mb-2"><span style="width:${subject.progress}%; background:var(--subject-color)"></span></div>
        <div class="stat-grid">
          <div class="stat"><div class="stat-value">${subject.note_count}</div><div class="stat-label">Notizen</div></div>
          <div class="stat"><div class="stat-value">${subject.card_count}</div><div class="stat-label">Karten</div></div>
          <div class="stat"><div class="stat-value">${subject.due_count}</div><div class="stat-label">fällig</div></div>
          <div class="stat"><div class="stat-value">${subject.open_tasks}</div><div class="stat-label">offene Aufgaben</div></div>
          <div class="stat"><div class="stat-value">${documents.length}</div><div class="stat-label">Dokumente</div></div>
        </div>
        ${subject.description ? `<div class="markdown mt-2 small">${esc(subject.description).replace(/\n/g, '<br>')}</div>` : ''}
        <div class="row mt-2">
          <a class="btn btn-sm" href="#/notizen?subject_id=${subject.id}">Notizen</a>
          <a class="btn btn-sm" href="#/karten?subject_id=${subject.id}">Karten</a>
          <a class="btn btn-sm" href="#/dokumente?subject_id=${subject.id}">Dokumente</a>
          <a class="btn btn-sm" href="#/aufgaben?view=all&subject_id=${subject.id}">Aufgaben</a>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>Prüfungen &amp; Termine</h2>
          <div class="card-actions"><a class="btn btn-sm btn-ghost" href="#/pruefungen">Alle</a></div></div>
        ${subject.exams.length
          ? `<div class="stack">${subject.exams
              .map((exam) => `<div class="row-between" style="border-bottom:1px solid var(--border);padding-bottom:.4rem">
                <div><div style="font-weight:550;font-size:.88rem">${esc(exam.title)}</div>
                  <div class="list-meta">${exam.date ? `${esc(formatDate(exam.date))} · ${esc(deadlineLabel(exam.date))}` : 'Kein Datum'}</div></div>
                <span class="badge">${exam.confidence ? `${exam.confidence}/5` : 'offen'}</span>
              </div>`)
              .join('')}</div>`
          : '<p class="small subtle" style="margin:0">Noch keine Prüfung für dieses Fach eingetragen.</p>'}
        <div class="mt-2"><a class="btn btn-sm" href="#/pruefungen">Prüfung eintragen</a></div>
      </section>
    </div>

    <div class="grid grid-2 mb-2">
      <section class="card">
        <div class="card-head"><h2>Themen &amp; Verständnis</h2>
          <div class="card-actions"><span class="tiny subtle">${topicCounts.verstanden} verstanden · ${topicCounts.ueben} üben · ${topicCounts.offen} offen</span></div></div>
        <form class="row mb-2" id="add-topic">
          <input class="input" id="topic-name" placeholder="Neues Thema, z. B. Subnetting" aria-label="Neues Thema" style="flex:1">
          <button class="btn btn-sm" type="submit">${icon('plus')} Hinzufügen</button>
        </form>
        <div class="topic-list" id="topic-list">
          ${subject.topics.length
            ? subject.topics
                .map(
                  (topic) => `<div class="topic-row" data-topic-row="${topic.id}">
                    <span class="topic-name">${esc(topic.name)}</span>
                    <div class="status-seg" role="group" aria-label="Lernstatus für ${esc(topic.name)}">
                      ${[['offen', 'offen'], ['ueben', 'üben'], ['verstanden', 'verstanden']]
                        .map(([value, label]) => `<button data-topic-status="${topic.id}" data-status="${value}" class="${topic.status === value ? 'active' : ''}">${label}</button>`)
                        .join('')}
                    </div>
                    <button class="icon-btn danger" style="width:26px;height:26px" data-delete-topic="${topic.id}" aria-label="Thema löschen">${icon('trash')}</button>
                  </div>`
                )
                .join('')
            : '<p class="small subtle" style="margin:0">Noch keine Themen. Lege sie an, um deinen Lernstand ehrlich zu verfolgen.</p>'}
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>Lernziele</h2>
          <div class="card-actions"><button class="btn btn-sm" id="add-goal">${icon('plus')} Ziel</button></div></div>
        <div class="goal-list">
          ${subject.goals.length
            ? subject.goals
                .map(
                  (goal) => `<div class="check-row ${goal.status === 'erledigt' ? 'done' : ''}">
                    <input type="checkbox" data-goal-toggle="${goal.id}" ${goal.status === 'erledigt' ? 'checked' : ''} aria-label="Lernziel ${esc(goal.title)}">
                    <div style="flex:1;min-width:0">
                      <div class="check-title">${esc(goal.title)}</div>
                      <div class="list-meta">${goal.due_date ? esc(deadlineLabel(goal.due_date)) : 'kein Termin'}${goal.description ? ` · ${esc(goal.description.slice(0, 100))}` : ''}</div>
                    </div>
                    <button class="icon-btn" style="width:26px;height:26px" data-edit-goal="${goal.id}" aria-label="Lernziel bearbeiten">${icon('edit')}</button>
                    <button class="icon-btn danger" style="width:26px;height:26px" data-delete-goal="${goal.id}" aria-label="Lernziel löschen">${icon('trash')}</button>
                  </div>`
                )
                .join('')
            : '<p class="small subtle" style="margin:0">Noch keine Lernziele. Formuliere, was du am Ende können möchtest.</p>'}
        </div>
        <div class="mt-2"><a class="btn btn-sm" href="#/lernen?scope=goals">${icon('play')} Offene Lernziele lernen</a></div>
      </section>
    </div>

    <section class="card">
      <div class="card-head"><h2>Zuletzt bearbeitet</h2><div class="card-actions"><a class="btn btn-sm btn-ghost" href="#/notizen?subject_id=${subject.id}">Alle Notizen</a></div></div>
      ${notes.notes?.length
        ? `<div class="item-list">${notes.notes
            .map((note) => `<a class="list-item" href="#/notizen/${note.id}"><span class="list-body"><span class="list-title">${esc(note.title)}</span>
              <span class="list-meta">${relativeTime(note.updated_at)}${note.topic ? ` · ${esc(note.topic)}` : ''}</span></span>${icon('chevron')}</a>`)
            .join('')}</div>`
        : '<p class="small subtle" style="margin:0">Noch keine Notizen in diesem Fach.</p>'}
    </section>`;

  const reload = async () => {
    await refreshSubjects();
    await renderDetail(root, ctx);
  };

  root.querySelector('#edit-subject').addEventListener('click', () => openSubjectDialog(subject, reload));
  root.querySelector('#delete-subject').addEventListener('click', async () => {
    const lost = [
      subject.topics.length ? `${subject.topics.length} ${subject.topics.length === 1 ? 'Thema' : 'Themen'} mit Lernstatus` : '',
      subject.goals.length ? `${subject.goals.length} ${subject.goals.length === 1 ? 'Lernziel' : 'Lernziele'}` : ''
    ].filter(Boolean);
    const kept = [
      subject.note_count ? `${subject.note_count} ${subject.note_count === 1 ? 'Notiz' : 'Notizen'}` : '',
      subject.card_count ? `${subject.card_count} ${subject.card_count === 1 ? 'Karte' : 'Karten'}` : '',
      documents.length ? `${documents.length} ${documents.length === 1 ? 'Dokument' : 'Dokumente'}` : '',
      subject.open_tasks ? `${subject.open_tasks} offene ${subject.open_tasks === 1 ? 'Aufgabe' : 'Aufgaben'}` : '',
      subject.exams.length ? `${subject.exams.length} ${subject.exams.length === 1 ? 'Prüfung' : 'Prüfungen'}` : ''
    ].filter(Boolean);
    const message = [
      `„${subject.name}“ wird gelöscht.`,
      lost.length ? `Mitgelöscht werden: ${lost.join(', ')}.` : '',
      `${kept.length ? `Erhalten bleiben ${kept.join(', ')} sowie alle anderen Inhalte` : 'Notizen, Karten, Dokumente, Aufgaben und Prüfungen bleiben erhalten'} – sie sind danach keinem Fach mehr zugeordnet.`
    ].filter(Boolean).join('\n\n');
    if (!(await confirmDialog({ title: 'Fach löschen?', message, confirmLabel: 'Fach löschen', danger: true }))) return;
    try {
      await api.delete(`/subjects/${subject.id}`);
      if (String(state.settings.last_subject_id) === String(subject.id)) state.settings.last_subject_id = '';
      await refreshSubjects();
      toast('Fach gelöscht.', 'success');
      window.location.hash = '#/faecher';
    } catch (error) {
      errorToast(error);
    }
  });

  root.querySelector('#add-topic').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = root.querySelector('#topic-name');
    if (!input.value.trim()) return;
    try {
      await api.post('/topics', { subject_id: subject.id, name: input.value.trim() });
      toast('Thema angelegt.', 'success');
      await reload();
    } catch (error) {
      errorToast(error);
    }
  });
  root.querySelectorAll('[data-topic-status]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await api.patch(`/topics/${button.dataset.topicStatus}`, { status: button.dataset.status });
        await reload();
      } catch (error) {
        errorToast(error);
      }
    });
  });
  root.querySelectorAll('[data-delete-topic]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Thema löschen?', message: 'Der Lernstatus zu diesem Thema wird entfernt. Karten und Notizen bleiben erhalten.', confirmLabel: 'Löschen', danger: true }))) return;
      try {
        await api.delete(`/topics/${button.dataset.deleteTopic}`);
        await reload();
      } catch (error) {
        errorToast(error);
      }
    });
  });

  root.querySelector('#add-goal').addEventListener('click', () => openGoalDialog(null, { subjectId: subject.id, onSaved: reload }));
  root.querySelectorAll('[data-edit-goal]').forEach((button) => {
    button.addEventListener('click', () => {
      const goal = subject.goals.find((item) => item.id === Number(button.dataset.editGoal));
      if (goal) openGoalDialog(goal, { onSaved: reload });
    });
  });
  root.querySelectorAll('[data-goal-toggle]').forEach((checkbox) => {
    checkbox.addEventListener('change', async () => {
      try {
        await api.patch(`/goals/${checkbox.dataset.goalToggle}`, { status: checkbox.checked ? 'erledigt' : 'offen' });
        await reload();
      } catch (error) {
        checkbox.checked = !checkbox.checked;
        errorToast(error);
      }
    });
  });
  root.querySelectorAll('[data-delete-goal]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Lernziel löschen?', message: 'Das Lernziel wird entfernt.', confirmLabel: 'Löschen', danger: true }))) return;
      try {
        await api.delete(`/goals/${button.dataset.deleteGoal}`);
        await reload();
      } catch (error) {
        errorToast(error);
      }
    });
  });

  void daysUntil;
  void relativeTime;
}

export async function render(root, ctx) {
  if (ctx.id) return renderDetail(root, ctx);
  return renderList(root, ctx);
}
