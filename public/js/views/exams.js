import { api } from '../api.js';
import {
  esc,
  icon,
  toast,
  errorToast,
  confirmDialog,
  formatDate,
  daysUntil,
  deadlineLabel,
  emptyState
} from '../ui.js';
import { openExamDialog } from './dialogs.js';
import { eventTimeLabel, examPrefillFromEvent, openEventPicker } from './calendar.js';

const hiddenSuggestions = new Set();

/** Kalendertermin einer Prüfung als Objekt im Format der Kalender-API. */
function linkedEvent(exam) {
  if (!exam.calendar_event_id) return null;
  return {
    id: exam.calendar_event_id,
    summary: exam.calendar_summary,
    start: exam.calendar_start,
    end: exam.calendar_end,
    all_day: exam.calendar_all_day,
    location: exam.calendar_location,
    description: exam.calendar_description,
    status: exam.calendar_status
  };
}

/** Weicht der Kalendertermin von Datum/Uhrzeit der Prüfung ab? */
function calendarMismatch(exam, event) {
  const fromCalendar = examPrefillFromEvent(event);
  const dateDiffers = fromCalendar.date !== exam.date;
  const timeDiffers = Boolean(fromCalendar.start_time) && Boolean(exam.start_time) && fromCalendar.start_time !== exam.start_time;
  const timeMissing = Boolean(fromCalendar.start_time) && !exam.start_time;
  return dateDiffers || timeDiffers || timeMissing ? fromCalendar : null;
}

function calendarBlock(exam) {
  const event = linkedEvent(exam);
  if (!event) {
    return `<div class="exam-calendar exam-calendar-empty">
      <span class="small subtle">${icon('calendar')} Kein Kalendertermin verknüpft.</span>
      <button class="btn btn-sm" data-pick-event="${exam.id}">${icon('link')} Mit Kalendertermin verknüpfen</button>
    </div>`;
  }
  const mismatch = calendarMismatch(exam, event);
  return `<div class="exam-calendar">
    <div class="row-between" style="align-items:flex-start">
      <div style="min-width:0">
        <div class="tiny faint">${icon('link')} Verknüpfter Kalendertermin${exam.calendar_source_name ? ` · ${esc(exam.calendar_source_name)}` : ''}</div>
        <div class="list-title">${esc(event.summary || 'Ohne Titel')}</div>
        <div class="list-meta">
          <span>${esc(eventTimeLabel(event, { withDate: true }))}</span>
          ${event.location ? `<span>· ${esc(event.location)}</span>` : ''}
          ${event.status === 'CANCELLED' ? '<span class="badge badge-danger">im Kalender abgesagt</span>' : ''}
          ${exam.calendar_removed_at ? '<span class="badge badge-warning">in der Quelle nicht mehr enthalten</span>' : ''}
        </div>
      </div>
      <div class="row" style="gap:.3rem">
        <a class="btn btn-sm" href="#/kalender?termin=${event.id}">${icon('calendar')} Im Kalender öffnen</a>
        <button class="btn btn-sm btn-ghost" data-unlink-event="${event.id}" data-title="${esc(exam.title)}">Verknüpfung aufheben</button>
      </div>
    </div>
    ${mismatch
      ? `<div class="exam-calendar-mismatch small">
          ${icon('alert')} ${mismatch.date === exam.date && !exam.start_time
            ? `Der Kalendertermin nennt ${esc(mismatch.start_time)} Uhr – bei der Prüfung ist noch keine Uhrzeit eingetragen.`
            : `Der Kalendertermin liegt am ${esc(formatDate(mismatch.date))}${mismatch.start_time ? `, ${esc(mismatch.start_time)} Uhr` : ''} – die Prüfung ist auf ${exam.date ? esc(formatDate(exam.date)) : 'kein Datum'}${exam.start_time ? `, ${esc(exam.start_time)} Uhr` : ''} eingetragen.`}
          <button class="btn btn-sm" data-adopt-calendar="${exam.id}" data-date="${esc(mismatch.date)}" data-time="${esc(mismatch.start_time)}">${mismatch.date === exam.date ? 'Uhrzeit' : 'Datum und Uhrzeit'} aus Kalender übernehmen</button>
        </div>`
      : ''}
    ${exam.location && event.location && exam.location.trim() !== event.location.trim()
      ? `<div class="exam-calendar-mismatch small">
          ${icon('alert')} Ort laut Kalender: „${esc(event.location)}“ – bei der Prüfung eingetragen: „${esc(exam.location)}“.
          <button class="btn btn-sm" data-adopt-location="${exam.id}" data-location="${esc(event.location)}">Ort aus Kalender übernehmen</button>
        </div>`
      : ''}
    ${event.description
      ? `<details class="mt-1"><summary class="small" style="cursor:pointer;color:var(--accent)">Kalenderbeschreibung</summary><div class="small mt-1" style="white-space:pre-wrap">${esc(event.description)}</div></details>`
      : ''}
  </div>`;
}

function suggestionsBlock(suggestions) {
  const visible = suggestions.filter((item) => !hiddenSuggestions.has(`${item.exam_id}:${item.event_id}`));
  if (!visible.length) return '';
  return `<section class="card exam-suggestions">
    <div class="card-head">
      <h2>Mögliche Kalenderverknüpfungen</h2>
      <span class="badge">unverbindliche Vorschläge</span>
    </div>
    <p class="small subtle" style="margin-top:0">Gleiches Datum und ähnlicher Titel bzw. als Prüfung erkannter Termin. Verknüpft wird nur, wenn du es bestätigst – Prüfungsdaten bleiben unverändert.</p>
    <div class="item-list">
      ${visible
        .map(
          (item) => `<div class="list-item">
            <span class="list-body">
              <span class="list-title">${esc(item.exam_title)} ↔ ${esc(item.event_summary || 'Ohne Titel')}</span>
              <span class="list-meta">
                <span>${esc(eventTimeLabel({ start: item.event_start, end: item.event_start, all_day: item.event_all_day }, { withDate: true }))}</span>
                ${item.event_location ? `<span>· ${esc(item.event_location)}</span>` : ''}
                <span>· ${esc(item.source_name)}</span>
                <span class="faint">Grund: ${esc(item.reasons.join(', '))}</span>
              </span>
            </span>
            <span class="row" style="gap:.3rem">
              <button class="btn btn-sm btn-primary" data-accept-suggestion="${item.event_id}" data-exam="${item.exam_id}">Verknüpfen</button>
              <button class="btn btn-sm btn-ghost" data-hide-suggestion="${item.exam_id}:${item.event_id}">Ausblenden</button>
            </span>
          </div>`
        )
        .join('')}
    </div>
  </section>`;
}

function confidenceMeter(value) {
  const rating = Math.max(0, Math.min(5, Number(value) || 0));
  return `<span class="confidence" title="Eigene Einschätzung: ${rating} von 5" aria-label="Eigene Einschätzung: ${rating} von 5">
    ${[1, 2, 3, 4, 5].map((n) => `<span class="${n <= rating ? 'on' : ''}"></span>`).join('')}
  </span>`;
}

function examCard(exam, subjectTopics) {
  const days = daysUntil(exam.date);
  const countdown = days === null ? 'Kein Datum' : days < 0 ? 'vorbei' : days === 0 ? 'heute' : days === 1 ? 'morgen' : `in ${days} Tagen`;
  const topicLines = (exam.open_topics || '')
    .split('\n')
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);
  const practiceTopics = subjectTopics.filter((topic) => topic.status !== 'verstanden').slice(0, 6);
  const urgency = days !== null && days >= 0 && days <= 3 ? 'badge-danger' : days !== null && days < 0 ? 'badge' : 'badge-warning';
  return `<article class="card${exam.calendar_event_id ? ' exam-linked' : ''}" id="exam-${exam.id}">
    <div class="row-between" style="align-items:flex-start">
      <div style="min-width:0;flex:1">
        <div class="row" style="gap:.4rem">
          <h2 style="margin:0;font-size:1.1rem">${esc(exam.title)}</h2>
          <span class="badge ${urgency}">${esc(countdown)}</span>
        </div>
        <div class="list-meta mt-1">
          ${exam.subject_name ? `<span data-color="${esc(exam.subject_color || 'slate')}" style="display:inline-flex;align-items:center;gap:.3rem"><span class="subject-dot"></span>${esc(exam.subject_name)}</span>` : 'Ohne Fach'}
          ${exam.date ? `· ${esc(formatDate(exam.date))}` : ''}
          ${exam.start_time ? `· ${esc(exam.start_time)} Uhr` : ''}
          ${exam.location ? `· ${esc(exam.location)}` : ''}
          ${exam.calendar_event_id ? `<span class="badge badge-accent" title="Mit Kalendertermin verknüpft">${icon('link')} Kalender</span>` : ''}
          ${exam.open_tasks ? `· ${exam.open_tasks} offene ${exam.open_tasks === 1 ? 'Aufgabe' : 'Aufgaben'}` : ''}
        </div>
      </div>
      <div class="row" style="gap:.2rem">
        <button class="icon-btn" data-edit-exam="${exam.id}" aria-label="Prüfung bearbeiten" title="Bearbeiten">${icon('edit')}</button>
        <button class="icon-btn danger" data-delete-exam="${exam.id}" data-title="${esc(exam.title)}" aria-label="Prüfung löschen" title="Löschen">${icon('trash')}</button>
      </div>
    </div>

    ${calendarBlock(exam)}

    <div class="row-between mt-2 small">
      <span class="subtle">Eigene Einschätzung:</span>
      <span class="row" style="gap:.4rem">${confidenceMeter(exam.confidence)} <span class="tiny faint">${exam.confidence ? `${exam.confidence} / 5` : 'noch offen'}</span></span>
    </div>

    ${practiceTopics.length || topicLines.length || exam.open_tasks
      ? `<div class="mt-2">
          <div class="tiny faint mb-1">Noch lernen</div>
          <div class="topic-chips">
            ${practiceTopics.map((topic) => `<span class="topic-chip status-${esc(topic.status)}"><span class="subject-dot" data-color="${esc(exam.subject_color || 'slate')}"></span>${esc(topic.name)}</span>`).join('')}
            ${topicLines.map((line) => `<span class="topic-chip">${esc(line)}</span>`).join('')}
            ${exam.open_tasks ? `<a class="topic-chip" href="#/aufgaben?exam_id=${exam.id}">${icon('tasks')} ${exam.open_tasks} offene Aufgaben</a>` : ''}
          </div>
        </div>`
      : ''}

    <details class="mt-2">
      <summary class="small" style="cursor:pointer;color:var(--accent)">Prüfungsstoff, Lernziele und Notizen</summary>
      <div class="grid grid-2 mt-2" style="gap:.8rem">
        <div>
          <div class="tiny faint mb-1">Prüfungsstoff</div>
          <div class="small" style="white-space:pre-wrap">${exam.topics ? esc(exam.topics) : '<span class="subtle">Noch nicht erfasst.</span>'}</div>
        </div>
        <div>
          <div class="tiny faint mb-1">Eigene Lernziele</div>
          <div class="small" style="white-space:pre-wrap">${exam.goals ? esc(exam.goals) : '<span class="subtle">Noch keine Lernziele.</span>'}</div>
        </div>
      </div>
      ${exam.summary ? `<div class="mt-2"><div class="tiny faint mb-1">Zusammenfassung</div><div class="small" style="white-space:pre-wrap">${esc(exam.summary)}</div></div>` : ''}
      <div class="row mt-2">
        <a class="btn btn-sm" href="#/notizen?neu=1">Notiz zur Prüfung</a>
        <a class="btn btn-sm" href="#/karten?neu=1">Karte anlegen</a>
        <a class="btn btn-sm" href="#/lernen?scope=subject${exam.subject_id ? `&subject_id=${exam.subject_id}` : ''}">Fach lernen</a>
      </div>
    </details>
  </article>`;
}

export async function render(root, ctx) {
  const [exams, topics, suggestions] = await Promise.all([
    api.get('/exams'),
    api.get('/topics'),
    api.get('/calendar/suggestions').catch(() => [])
  ]);
  const topicsBySubject = new Map();
  for (const topic of topics) {
    if (!topicsBySubject.has(topic.subject_id)) topicsBySubject.set(topic.subject_id, []);
    topicsBySubject.get(topic.subject_id).push(topic);
  }

  const upcoming = exams.filter((exam) => !exam.date || (daysUntil(exam.date) ?? 0) >= 0);
  const past = exams.filter((exam) => exam.date && (daysUntil(exam.date) ?? 0) < 0);

  root.innerHTML = `
    <div class="page-head">
      <div class="page-heading">
        <h1>Prüfungen</h1>
        <p class="page-sub">Termine, Stoff und offene Themen – ohne erfundene Erfolgsprognosen.</p>
      </div>
      <div class="page-actions">
        <a class="btn" href="#/vorlagen">${icon('templates')} Vorbereitung</a>
        <button class="btn btn-primary" id="new-exam">${icon('plus')} Prüfung eintragen</button>
      </div>
    </div>

    ${suggestionsBlock(suggestions)}

    ${upcoming.length
      ? `<div class="stack">${upcoming
          .map((exam) => examCard(exam, topicsBySubject.get(exam.subject_id) ?? []))
          .join('')}</div>`
      : emptyState(
          'Keine Prüfung eingetragen',
          'Trage Prüfungstermin, Stoff und deine Lernziele ein. Die App zeigt dann, welche Themen noch offen sind – ohne Prognosen.',
          '<button class="btn btn-primary" data-new-exam>Prüfung eintragen</button>'
        )}

    ${past.length
      ? `<details class="mt-3">
          <summary class="small subtle" style="cursor:pointer">Vergangene Prüfungen anzeigen (${past.length})</summary>
          <div class="stack mt-2">${past.map((exam) => examCard(exam, topicsBySubject.get(exam.subject_id) ?? [])).join('')}</div>
        </details>`
      : ''}`;

  const rerender = async () => {
    await render(root, ctx);
  };
  const openEditor = (exam = null) => openExamDialog(exam, { onSaved: rerender });

  root.querySelector('#new-exam').addEventListener('click', () => openEditor());
  root.querySelector('[data-new-exam]')?.addEventListener('click', () => openEditor());

  root.querySelectorAll('[data-edit-exam]').forEach((button) => {
    button.addEventListener('click', () => {
      const exam = exams.find((item) => item.id === Number(button.dataset.editExam));
      if (exam) openEditor(exam);
    });
  });
  root.querySelectorAll('[data-delete-exam]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Prüfung löschen?', message: `„${button.dataset.title}“ und die Verknüpfung zu Aufgaben werden entfernt. Notizen bleiben erhalten.`, confirmLabel: 'Löschen', danger: true }))) return;
      try {
        await api.delete(`/exams/${button.dataset.deleteExam}`);
        toast('Prüfung gelöscht.', 'success');
        await rerender();
      } catch (error) {
        errorToast(error);
      }
    });
  });

  root.querySelectorAll('[data-pick-event]').forEach((button) => {
    button.addEventListener('click', () => {
      const exam = exams.find((item) => item.id === Number(button.dataset.pickEvent));
      if (exam) openEventPicker(exam, { onLinked: rerender });
    });
  });

  root.querySelectorAll('[data-unlink-event]').forEach((button) => {
    button.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Verknüpfung aufheben?',
        message: `Die Prüfung „${button.dataset.title}“ und der Kalendertermin bleiben beide erhalten – nur die Verbindung wird gelöst.`,
        confirmLabel: 'Aufheben'
      });
      if (!ok) return;
      try {
        await api.delete(`/calendar/events/${button.dataset.unlinkEvent}/link`);
        toast('Verknüpfung aufgehoben.', 'success');
        await rerender();
      } catch (error) {
        errorToast(error);
      }
    });
  });

  root.querySelectorAll('[data-adopt-calendar]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await api.patch(`/exams/${button.dataset.adoptCalendar}`, { date: button.dataset.date, start_time: button.dataset.time || null });
        toast('Datum und Uhrzeit aus dem Kalender übernommen.', 'success');
        await rerender();
      } catch (error) {
        errorToast(error);
      }
    });
  });

  root.querySelectorAll('[data-adopt-location]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await api.patch(`/exams/${button.dataset.adoptLocation}`, { location: button.dataset.location });
        toast('Ort aus dem Kalender übernommen.', 'success');
        await rerender();
      } catch (error) {
        errorToast(error);
      }
    });
  });

  root.querySelectorAll('[data-accept-suggestion]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await api.post(`/calendar/events/${button.dataset.acceptSuggestion}/link`, { exam_id: Number(button.dataset.exam) });
        toast('Prüfung mit Kalendertermin verknüpft.', 'success');
        await rerender();
      } catch (error) {
        errorToast(error);
      }
    });
  });

  root.querySelectorAll('[data-hide-suggestion]').forEach((button) => {
    button.addEventListener('click', async () => {
      hiddenSuggestions.add(button.dataset.hideSuggestion);
      await rerender();
    });
  });

  // #/pruefungen?pruefung=ID – zur Prüfung springen (z. B. aus dem Kalender).
  const focusId = Number(ctx.query?.get('pruefung'));
  if (focusId) {
    const card = root.querySelector(`#exam-${focusId}`);
    if (card) {
      card.closest('details')?.setAttribute('open', '');
      card.classList.add('exam-focus');
      window.setTimeout(() => card.scrollIntoView({ block: 'center' }), 60);
    }
  }

  void deadlineLabel;
}
