import { api } from '../api.js';
import { state } from '../store.js';
import {
  esc,
  icon,
  relativeTime,
  formatDate,
  deadlineLabel,
  daysUntil,
  errorToast,
  toast,
  emptyState
} from '../ui.js';
import { openSubjectDialog } from './dialogs.js';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 11) return 'Guten Morgen';
  if (hour < 18) return 'Guten Tag';
  return 'Guten Abend';
}

function priorityBadge(priority) {
  if (priority === 'hoch') return '<span class="badge badge-danger">Hoch</span>';
  if (priority === 'niedrig') return '<span class="badge">Niedrig</span>';
  return '<span class="badge badge-info">Normal</span>';
}

function subjectCard(subject) {
  return `<a class="subject-card" data-color="${esc(subject.color)}" href="#/faecher/${subject.id}">
    <div class="subject-name"><span class="subject-dot"></span>${esc(subject.name)}</div>
    <div class="subject-meta">${esc(subject.semester_name || 'Ohne Semester')} · ${subject.topic_count > 0 ? `${subject.topics_done}/${subject.topic_count} Themen verstanden` : `${subject.learned_cards}/${subject.card_count} Karten begonnen`}</div>
    <div class="progress mt-2" role="progressbar" aria-valuenow="${subject.progress}" aria-valuemin="0" aria-valuemax="100" aria-label="Fortschritt ${esc(subject.name)}">
      <span style="width:${subject.progress}%; background:var(--subject-color)"></span>
    </div>
    <div class="subject-stats">
      <span><strong>${subject.note_count}</strong> Notizen</span>
      <span><strong>${subject.due_count}</strong> fällig</span>
      <span><strong>${subject.open_tasks}</strong> Aufgaben</span>
    </div>
  </a>`;
}

function localDateOf(iso) {
  const date = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function deadlines(data) {
  const exams = data.upcomingExams.map((exam) => ({
    kind: 'Prüfung',
    title: exam.title,
    date: exam.date,
    subject: exam.subject_name,
    href: '#/pruefungen',
    icon: 'exams'
  }));
  const tasks = data.openTasks
    .filter((task) => task.due_date)
    .map((task) => ({
      kind: 'Aufgabe',
      title: task.title,
      date: task.due_date,
      subject: task.subject_name,
      href: '#/aufgaben',
      icon: 'tasks'
    }));
  const events = (data.upcomingEvents ?? []).map((event) => ({
    kind: event.category === 'abgabe' ? 'Abgabe' : 'Prüfung',
    title: event.summary || 'Ohne Titel',
    // Ganztägig: Datum; sonst lokales Datum des UTC-Zeitpunkts.
    date: event.all_day ? event.start : localDateOf(event.start),
    subject: 'aus dem Kalender',
    href: `#/kalender?termin=${event.id}`,
    icon: 'calendar'
  }));
  return [...exams, ...tasks, ...events]
    .filter((item) => item.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, 6);
}

export async function render(root, ctx) {
  let data;
  try {
    data = await api.get('/dashboard');
  } catch (error) {
    root.innerHTML = `<div class="empty">${icon('alert')}<h3>Dashboard nicht verfügbar</h3><p>${esc(error.message)}</p></div>`;
    return;
  }

  const dateText = new Date().toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const upcoming = deadlines(data);
  const hasSubjects = data.subjects.length > 0;
  const dueTotal = data.dueCards;

  root.innerHTML = `
    <div class="welcome">
      <div>
        <h1>${greeting()}.</h1>
        <div class="welcome-date">${esc(dateText.charAt(0).toUpperCase() + dateText.slice(1))} · dein Lernstand auf einen Blick</div>
      </div>
      <div class="page-actions">
        <a class="btn" href="#/notizen?neu=1">${icon('plus')} Notiz</a>
        <a class="btn" href="#/karten?neu=1">${icon('plus')} Karte</a>
        <a class="btn" href="#/aufgaben?neu=1">${icon('plus')} Aufgabe</a>
      </div>
    </div>

    ${!hasSubjects ? `<div class="card mb-2" style="border-left:4px solid var(--accent)">
      <div class="row-between">
        <div>
          <h2 style="margin-bottom:.2rem">Noch kein Fach angelegt</h2>
          <p class="subtle small" style="margin:0">Lege zuerst deine Studienstruktur an. Notizen, Karten, Dokumente und Aufgaben lassen sich danach einem Fach zuordnen.</p>
        </div>
        <div class="row">
          <button class="btn btn-primary" id="create-first-subject">Erstes Fach anlegen</button>
          <a class="btn" href="#/faecher">Fächer verwalten</a>
        </div>
      </div>
    </div>` : ''}

    <div class="dashboard-grid">
      <div class="dashboard-col">
        <section class="card">
          <div class="due-card">
            <div>
              <div class="due-number">${dueTotal}</div>
              <div class="due-label">${dueTotal === 1 ? 'fällige Karte' : 'fällige Karten'}</div>
            </div>
            <div class="subtle small">
              ${data.newCards} neue ${data.newCards === 1 ? 'Karte' : 'Karten'} noch nie gelernt
            </div>
            <div class="due-actions">
              <a class="btn btn-primary" href="#/lernen">${icon('play')} Jetzt lernen</a>
              <a class="btn btn-sm" href="#/lernen?scope=hard">Nur Schwierige</a>
            </div>
          </div>
          ${data.dueDecks.length
            ? `<div class="divider"></div>
              <div class="stack">
                <div class="tiny faint">Fällig nach Stapel</div>
                ${data.dueDecks.map((deck) => `<a class="list-item" href="#/karten?deck=${deck.id}" style="padding:.35rem 0">
                  <span class="dot"></span>
                  <span class="list-body"><span class="list-title">${esc(deck.name)}</span>
                    <span class="list-meta">${esc(deck.subject_name || 'Ohne Fach')}</span></span>
                  <span class="badge badge-warning">${deck.due_count}</span>
                </a>`).join('')}
              </div>`
            : `<div class="divider"></div><p class="small subtle" style="margin:0">Nichts fällig. Du kannst trotzdem neue Karten lernen oder deine Notizen vertiefen.</p>`}
        </section>

        <section class="card">
          <div class="card-head">
            <h2>Weiterlernen</h2>
            <div class="card-actions"><a class="btn btn-sm btn-ghost" href="#/notizen">Alle Notizen</a></div>
          </div>
          ${data.recent.length
            ? `<div class="item-list">${data.recent
                .map((note) => `<a class="list-item" href="#/notizen/${note.id}">
                  <span class="list-body">
                    <span class="list-title">${esc(note.title)}</span>
                    <span class="list-meta"><span data-color="${esc(note.subject_color || 'slate')}" style="display:inline-flex;align-items:center;gap:.35rem"><span class="subject-dot"></span>${esc(note.subject_name || 'Ohne Fach')}</span>
                      ${note.topic ? `· ${esc(note.topic)}` : ''} · ${relativeTime(note.updated_at)}</span>
                  </span>
                  ${icon('chevron')}
                </a>`).join('')}</div>`
            : emptyState('Noch keine Notizen', 'Schreibe deine erste Zusammenfassung – Markdown, Formeln und Code inklusive.', '<a class="btn btn-primary" href="#/notizen?neu=1">Erste Notiz schreiben</a>')}
        </section>

        <section class="card">
          <div class="card-head">
            <h2>Meine Fächer</h2>
            <div class="card-actions"><a class="btn btn-sm btn-ghost" href="#/faecher">Verwalten</a></div>
          </div>
          ${hasSubjects
            ? `<div class="subject-grid">${data.subjects.slice(0, 8).map(subjectCard).join('')}</div>`
            : emptyState('Fächer fehlen', 'Erstelle Fächer, um Notizen, Karten und Termine zu bündeln.', '<button class="btn btn-primary" data-create-subject>Fach anlegen</button>')}
        </section>

        <section class="card">
          <div class="card-head">
            <h2>Themen im Blick</h2>
            <div class="card-actions"><a class="btn btn-sm btn-ghost" href="#/faecher">Zu den Fächern</a></div>
          </div>
          <div class="row-between mb-1">
            <div class="row small subtle">
              <span class="badge">${data.topicStats.offen} offen</span>
              <span class="badge badge-warning">${data.topicStats.ueben} üben</span>
              <span class="badge badge-success">${data.topicStats.verstanden} verstanden</span>
            </div>
          </div>
          ${data.practiceTopics.length || data.understoodTopics.length
            ? `<div class="grid" style="gap:.9rem">
                <div>
                  <div class="tiny faint mb-1">Das solltest du noch üben</div>
                  <div class="topic-chips">${data.practiceTopics.map((topic) => `<a class="topic-chip status-${esc(topic.status)}" data-color="${esc(topic.subject_color || 'slate')}" href="#/faecher/${topic.subject_id ?? ''}">
                    <span class="subject-dot"></span>${esc(topic.name)}
                    <span class="faint">· ${topic.status === 'ueben' ? 'üben' : 'offen'}</span>
                  </a>`).join('') || '<span class="small subtle">Nichts offen – pflege neue Themen in deinen Fächern.</span>'}</div>
                </div>
                <div>
                  <div class="tiny faint mb-1">Bereits verstanden</div>
                  <div class="topic-chips">${data.understoodTopics.map((topic) => `<span class="topic-chip status-verstanden"><span class="subject-dot" data-color="${esc(topic.subject_color || 'slate')}"></span>${esc(topic.name)}</span>`).join('') || '<span class="small subtle">Noch keine Themen als verstanden markiert.</span>'}</div>
                </div>
              </div>`
            : emptyState('Noch keine Themen erfasst', 'Lege in einem Fach Themen an und markiere ihren Lernstatus. So siehst du jederzeit, was sitzt und was noch Übung braucht.', '<a class="btn" href="#/faecher">Themen anlegen</a>')}
        </section>
      </div>

      <div class="dashboard-col">
        <section class="card">
          <div class="card-head">
            <h2>Offene Aufgaben</h2>
            <div class="card-actions"><a class="btn btn-sm btn-ghost" href="#/aufgaben">Alle</a></div>
          </div>
          ${data.openTasks.length
            ? `<div>${data.openTasks
                .map((task) => `<div class="check-row" data-task-row="${task.id}">
                  <input type="checkbox" aria-label="Aufgabe erledigen: ${esc(task.title)}" data-complete-task="${task.id}">
                  <div style="flex:1;min-width:0">
                    <div class="check-title">${esc(task.title)}</div>
                    <div class="list-meta">
                      ${task.subject_name ? esc(task.subject_name) : 'Ohne Fach'}
                      ${task.due_date ? `· <span class="${daysUntil(task.due_date) < 0 ? 'badge badge-danger' : ''}">${esc(deadlineLabel(task.due_date))}</span>` : ''}
                      ${priorityBadge(task.priority)}
                    </div>
                  </div>
                </div>`).join('')}</div>`
            : `<p class="small subtle" style="margin:0">Keine offenen Aufgaben. ${data.dueTaskCount ? `${data.dueTaskCount} überfällig.` : ''}</p>`}
          <div class="mt-2"><a class="btn btn-sm" href="#/aufgaben?neu=1">${icon('plus')} Aufgabe hinzufügen</a></div>
        </section>

        <section class="card">
          <div class="card-head">
            <h2>Nächste Termine</h2>
            <div class="card-actions"><a class="btn btn-sm btn-ghost" href="#/pruefungen">Prüfungen</a></div>
          </div>
          ${upcoming.length
            ? `<div class="stack">${upcoming
                .map((item) => {
                  const days = daysUntil(item.date);
                  const urgent = days !== null && days <= 3;
                  return `<a class="list-item" href="${item.href}" style="padding:.4rem 0">
                    <span class="${urgent ? 'badge badge-danger' : 'badge'}">${esc(item.kind)}</span>
                    <span class="list-body">
                      <span class="list-title">${esc(item.title)}</span>
                      <span class="list-meta">${esc(item.subject || 'Ohne Fach')} · ${esc(formatDate(item.date, { short: true }))} · ${esc(deadlineLabel(item.date))}</span>
                    </span>
                  </a>`;
                })
                .join('')}</div>`
            : `<p class="small subtle" style="margin:0">Keine anstehenden Termine. Trage Prüfungen oder Fälligkeiten ein, um den Überblick zu behalten.</p>`}
        </section>

        <section class="card">
          <div class="card-head"><h2>Schnellzugriff</h2></div>
          <div class="quick-actions">
            <a class="quick-action" href="#/notizen?neu=1">${icon('notes')}Notiz schreiben</a>
            <a class="quick-action" href="#/karten?neu=1">${icon('cards')}Karte anlegen</a>
            <a class="quick-action" href="#/aufgaben?neu=1">${icon('tasks')}Aufgabe notieren</a>
            <a class="quick-action" href="#/dokumente?upload=1">${icon('upload')}Dokument ablegen</a>
            <a class="quick-action" href="#/werkzeuge?tab=netzwerk">${icon('tools')}Subnetting üben</a>
            <a class="quick-action" href="#/vorlagen">${icon('templates')}Vorlage nutzen</a>
          </div>
        </section>

        ${data.reviews7d > 0 ? `<div class="card" style="padding:.8rem 1rem">
          <div class="row small subtle">
            ${icon('check')}
            <span>${data.reviews7d} Kartenwiederholungen in den letzten 7 Tagen. Kein Streak, kein Druck – nur dein Fortschritt.</span>
          </div>
        </div>` : ''}
      </div>
    </div>`;

  const createSubject = () => openSubjectDialog(null, () => render(root, ctx));
  root.querySelector('#create-first-subject')?.addEventListener('click', createSubject);
  root.querySelectorAll('[data-create-subject]').forEach((button) => button.addEventListener('click', createSubject));

  root.querySelectorAll('[data-complete-task]').forEach((checkbox) => {
    checkbox.addEventListener('change', async () => {
      try {
        await api.patch(`/tasks/${checkbox.dataset.completeTask}`, { status: 'erledigt' });
        toast('Aufgabe erledigt.', 'success');
        await render(root, ctx);
      } catch (error) {
        checkbox.checked = false;
        errorToast(error);
      }
    });
  });

  void state;
}
