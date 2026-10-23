import { api, qs } from '../api.js';
import {
  esc,
  icon,
  toast,
  errorToast,
  confirmDialog,
  promptDialog,
  openModal,
  todayISO,
  formatDate
} from '../ui.js';
import { openExamDialog } from './dialogs.js';

export const CATEGORY_LABELS = {
  termin: 'Termin',
  lehrveranstaltung: 'Lehrveranstaltung',
  pruefung: 'Prüfung',
  abgabe: 'Abgabe'
};

const VIEWS = { monat: 'Monat', woche: 'Woche', liste: 'Liste' };
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const VIEW_STORAGE_KEY = 'studyforge.calendar.view';

/* ------------------------------------------------------------------ Datum */
function pad(n) {
  return String(n).padStart(2, '0');
}

export function ymd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseYmd(value) {
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function startOfWeek(date) {
  const offset = (date.getDay() + 6) % 7;
  return addDays(date, -offset);
}

const timeFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
const shortDayFormat = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
const monthFormat = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });

/** Lokaler Beginn eines Termins (ganztägig: Mitternacht des Datums). */
export function eventStart(event) {
  return event.all_day ? parseYmd(event.start) : new Date(event.start);
}

export function eventEnd(event) {
  return event.all_day ? parseYmd(event.end) : new Date(event.end);
}

/** Lokale Tage (JJJJ-MM-TT), auf die ein Termin fällt. */
function eventDays(event) {
  const start = eventStart(event);
  let first = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  let endExclusive;
  if (event.all_day) {
    endExclusive = parseYmd(event.end);
  } else {
    const end = eventEnd(event);
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    endExclusive = end > start && end.getTime() === endDay.getTime() ? endDay : addDays(endDay, 1);
  }
  if (endExclusive <= first) endExclusive = addDays(first, 1);
  const days = [];
  for (let day = first; day < endExclusive && days.length < 62; day = addDays(day, 1)) days.push(ymd(day));
  return days;
}

export function eventTimeLabel(event, { withDate = false } = {}) {
  const start = eventStart(event);
  const end = eventEnd(event);
  if (event.all_day) {
    const last = addDays(end, -1);
    if (last > start) return `${formatDate(ymd(start), { short: true })} – ${formatDate(ymd(last), { short: true })} · ganztägig`;
    return `${withDate ? `${formatDate(ymd(start))} · ` : ''}ganztägig`;
  }
  const sameDay = ymd(start) === ymd(end) || end <= start;
  const startText = timeFormat.format(start);
  const endText = end > start ? timeFormat.format(end) : '';
  if (sameDay) {
    return `${withDate ? `${formatDate(ymd(start))} · ` : ''}${startText}${endText ? `–${endText}` : ''} Uhr`;
  }
  return `${formatDate(ymd(start), { short: true })} ${startText} – ${formatDate(ymd(end), { short: true })} ${endText} Uhr`;
}

/** Vorschlagswerte für eine Prüfung aus einem Termin (lokale Zeit). */
export function examPrefillFromEvent(event) {
  const start = eventStart(event);
  return {
    title: event.summary || 'Prüfung',
    date: ymd(start),
    start_time: event.all_day ? '' : `${pad(start.getHours())}:${pad(start.getMinutes())}`,
    location: event.location || '',
    summary: event.description || ''
  };
}

export function categoryBadge(category) {
  return `<span class="cal-cat" data-cat="${esc(category)}">${esc(CATEGORY_LABELS[category] || 'Termin')}</span>`;
}

function displayCategory(event) {
  return event.exam_id ? 'pruefung' : event.category;
}

function recurrenceLabel(rrule) {
  if (!rrule) return '';
  if (rrule === 'RDATE') return 'mehrere Einzeltermine';
  const parts = Object.fromEntries(rrule.split(';').map((part) => part.split('=')));
  const interval = Number(parts.INTERVAL || 1);
  const freq = {
    DAILY: interval > 1 ? `alle ${interval} Tage` : 'täglich',
    WEEKLY: interval > 1 ? `alle ${interval} Wochen` : 'wöchentlich',
    MONTHLY: interval > 1 ? `alle ${interval} Monate` : 'monatlich',
    YEARLY: interval > 1 ? `alle ${interval} Jahre` : 'jährlich'
  }[parts.FREQ] || 'wiederkehrend';
  let limit = '';
  if (parts.COUNT) limit = `, ${parts.COUNT}-mal`;
  else if (parts.UNTIL) {
    const until = parts.UNTIL;
    limit = `, bis ${until.slice(6, 8)}.${until.slice(4, 6)}.${until.slice(0, 4)}`;
  }
  return `${freq}${limit}`;
}

function alarmLabel(alarm) {
  if (alarm.at) return `am ${new Date(alarm.at).toLocaleString('de-DE')}`;
  const minutes = Number(alarm.minutesBefore) || 0;
  const ref = alarm.related === 'END' ? 'Ende' : 'Beginn';
  if (minutes === 0) return `zum ${ref}`;
  const abs = Math.abs(minutes);
  const text = abs % 1440 === 0 ? `${abs / 1440} Tag(e)` : abs % 60 === 0 ? `${abs / 60} Std.` : `${abs} Min.`;
  return minutes > 0 ? `${text} vor ${ref}` : `${text} nach ${ref}`;
}

/* ------------------------------------------------------------------ Ansicht */
function readStoredView() {
  try {
    const value = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return VIEWS[value] ? value : null;
  } catch {
    return null;
  }
}

function storeView(view) {
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    /* nur eine Komfortfunktion */
  }
}

function rangeFor(view, anchor) {
  if (view === 'woche') {
    const start = startOfWeek(anchor);
    return { start, end: addDays(start, 6), label: `${shortDayFormat.format(start)} – ${shortDayFormat.format(addDays(start, 6))} ${addDays(start, 6).getFullYear()}` };
  }
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  if (view === 'liste') return { start: monthStart, end: monthEnd, label: monthFormat.format(monthStart) };
  const start = startOfWeek(monthStart);
  return { start, end: addDays(start, 41), label: monthFormat.format(monthStart), monthStart };
}

function shiftAnchor(view, anchor, direction) {
  if (view === 'woche') return addDays(anchor, 7 * direction);
  return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
}

function eventChip(event, { showTime = true } = {}) {
  const cancelled = event.status === 'CANCELLED';
  const time = event.all_day ? '' : timeFormat.format(eventStart(event));
  return `<button type="button" class="cal-event${cancelled ? ' cancelled' : ''}${event.removed_at ? ' removed' : ''}" data-cat="${esc(displayCategory(event))}" data-event-id="${event.id}"
      title="${esc(`${event.summary || 'Ohne Titel'} · ${eventTimeLabel(event)}${event.location ? ` · ${event.location}` : ''}`)}">
      ${event.exam_id ? icon('link', 'icon cal-link-icon') : ''}${showTime && time ? `<span class="cal-time">${esc(time)}</span>` : ''}<span class="cal-title">${esc(event.summary || 'Ohne Titel')}</span>
    </button>`;
}

function groupByDay(events) {
  const map = new Map();
  for (const event of events) {
    for (const day of eventDays(event)) {
      if (!map.has(day)) map.set(day, []);
      map.get(day).push(event);
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => (b.all_day - a.all_day) || eventStart(a) - eventStart(b));
  }
  return map;
}

function monthView(range, anchor, byDay) {
  const today = todayISO();
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const day = addDays(range.start, i);
    const key = ymd(day);
    const events = byDay.get(key) ?? [];
    const outside = day.getMonth() !== anchor.getMonth();
    const visible = events.slice(0, 3);
    cells.push(`<div class="cal-cell${outside ? ' outside' : ''}${key === today ? ' today' : ''}" data-day="${key}">
      <div class="cal-daynum"><span>${day.getDate()}</span></div>
      <div class="cal-cell-events">
        ${visible.map((event) => eventChip(event)).join('')}
        ${events.length > visible.length ? `<button type="button" class="cal-more" data-day-list="${key}">+${events.length - visible.length} weitere</button>` : ''}
      </div>
    </div>`);
  }
  return `<div class="cal-month" role="grid" aria-label="Monatsansicht">
    <div class="cal-weekdays">${WEEKDAYS.map((d) => `<div>${d}</div>`).join('')}</div>
    <div class="cal-grid">${cells.join('')}</div>
  </div>`;
}

function weekView(range, byDay) {
  const today = todayISO();
  const columns = [];
  for (let i = 0; i < 7; i += 1) {
    const day = addDays(range.start, i);
    const key = ymd(day);
    const events = byDay.get(key) ?? [];
    columns.push(`<section class="cal-week-day${key === today ? ' today' : ''}" aria-label="${esc(dayFormat.format(day))}">
      <header><span class="cal-wd">${WEEKDAYS[i]}</span><span class="cal-wdate">${day.getDate()}.${day.getMonth() + 1}.</span></header>
      <div class="cal-week-events">
        ${events.length
          ? events.map((event) => `<div class="cal-week-item">${event.all_day ? '<span class="tiny faint">ganztägig</span>' : `<span class="tiny faint">${esc(eventTimeLabel(event).replace(' Uhr', ''))}</span>`}${eventChip(event, { showTime: false })}${event.location ? `<span class="tiny faint truncate">${esc(event.location)}</span>` : ''}</div>`).join('')
          : '<span class="tiny faint">–</span>'}
      </div>
    </section>`);
  }
  return `<div class="cal-week">${columns.join('')}</div>`;
}

function listView(range, byDay) {
  const days = [];
  for (let day = range.start; day <= range.end; day = addDays(day, 1)) {
    const key = ymd(day);
    const events = byDay.get(key);
    if (!events?.length) continue;
    days.push(`<section class="cal-list-day${key === todayISO() ? ' today' : ''}">
      <h3>${esc(dayFormat.format(day))}</h3>
      <div class="item-list">
        ${events
          .map(
            (event) => `<button type="button" class="list-item cal-list-item" data-event-id="${event.id}">
              <span class="cal-bar" data-cat="${esc(displayCategory(event))}"></span>
              <span class="list-body">
                <span class="list-title${event.status === 'CANCELLED' ? ' cal-cancelled-text' : ''}">${esc(event.summary || 'Ohne Titel')}</span>
                <span class="list-meta">
                  <span>${esc(eventTimeLabel(event))}</span>
                  ${event.location ? `<span>· ${esc(event.location)}</span>` : ''}
                  ${categoryBadge(displayCategory(event))}
                  ${event.exam_id ? `<span class="badge badge-accent">${icon('link')} ${esc(event.exam_title)}</span>` : ''}
                  ${event.status === 'CANCELLED' ? '<span class="badge badge-danger">abgesagt</span>' : ''}
                  ${event.removed_at ? '<span class="badge badge-warning">in Quelle entfernt</span>' : ''}
                  ${event.rrule ? `<span class="badge">${esc(recurrenceLabel(event.rrule))}</span>` : ''}
                </span>
              </span>
            </button>`
          )
          .join('')}
      </div>
    </section>`);
  }
  return days.length
    ? `<div class="stack">${days.join('')}</div>`
    : '<div class="empty"><h3>Keine Termine in diesem Monat</h3><p>Mit den Pfeilen zu anderen Monaten wechseln oder einen Kalender importieren.</p></div>';
}

function sourcesCard(sources) {
  return `<section class="card" id="cal-sources">
    <div class="card-head"><h2>Kalenderquellen</h2></div>
    <div class="cal-dropzone" data-dropzone tabindex="0" role="button" aria-label=".ics-Datei auswählen oder hierher ziehen">
      ${icon('upload')}
      <span><strong>.ics-Datei hierher ziehen</strong> oder <span class="link-like">auswählen</span></span>
      <span class="tiny faint">Mehrere Dateien möglich · bis 5 MB je Datei · bleibt lokal</span>
    </div>
    ${sources.length
      ? `<div class="stack mt-2">${sources
          .map(
            (source) => `<div class="row-between cal-source">
              <div class="list-body">
                <div class="list-title">${esc(source.name)}</div>
                <div class="list-meta">
                  <span>${source.event_count} ${source.event_count === 1 ? 'Termin' : 'Termine'}</span>
                  ${source.linked_exams ? `<span>· ${source.linked_exams} mit Prüfungen verknüpft</span>` : ''}
                  ${source.removed_events ? `<span class="badge badge-warning">${source.removed_events} in Quelle entfernt</span>` : ''}
                  <span>· zuletzt importiert ${esc(source.last_import_at ? new Date(source.last_import_at).toLocaleString('de-DE') : '–')}</span>
                  ${source.filename ? `<span class="mono tiny">${esc(source.filename)}</span>` : ''}
                </div>
              </div>
              <div class="row" style="gap:.2rem">
                <button class="icon-btn" data-rename-source="${source.id}" data-name="${esc(source.name)}" aria-label="Quelle umbenennen" title="Umbenennen">${icon('edit')}</button>
                <button class="icon-btn danger" data-delete-source="${source.id}" data-name="${esc(source.name)}" data-linked="${source.linked_exams}" data-count="${source.event_count}" aria-label="Quelle entfernen" title="Quelle entfernen">${icon('trash')}</button>
              </div>
            </div>`
          )
          .join('')}</div>`
      : ''}
    <p class="hint mt-2" style="margin-bottom:0">Erneuter Import derselben Datei aktualisiert die Quelle: geänderte Termine werden übernommen, Verknüpfungen mit Prüfungen bleiben erhalten, Prüfungen werden nie verändert oder gelöscht.</p>
  </section>`;
}

export async function render(root, ctx) {
  const query = ctx.query;
  const view = VIEWS[query.get('ansicht')] ? query.get('ansicht') : readStoredView() || 'monat';
  const sourceFilter = query.get('quelle') || '';
  const categoryFilter = query.get('art') || '';
  const focusEventId = Number(query.get('termin')) || null;

  let anchor = query.get('datum') && /^\d{4}-\d{2}-\d{2}$/.test(query.get('datum')) ? parseYmd(query.get('datum')) : parseYmd(todayISO());
  let focusEvent = null;
  if (focusEventId) {
    try {
      focusEvent = await api.get(`/calendar/events/${focusEventId}`);
      if (!query.get('datum')) anchor = eventStart(focusEvent);
    } catch (error) {
      errorToast(error);
    }
  }

  const range = rangeFor(view, anchor);
  const [sources, events] = await Promise.all([
    api.get('/calendar/sources'),
    api.get(`/calendar/events${qs({ from: ymd(range.start), to: ymd(range.end), source_id: sourceFilter, category: categoryFilter })}`)
  ]);
  const byDay = groupByDay(events);

  const navigate = (patch) => {
    const params = {
      ansicht: view,
      datum: ymd(anchor),
      quelle: sourceFilter,
      art: categoryFilter,
      ...patch
    };
    window.location.hash = `#/kalender${qs(params)}`;
  };

  root.innerHTML = `<div class="cal-page">
    <div class="page-head">
      <div class="page-heading">
        <h1>Kalender</h1>
        <p class="page-sub">Importierte Termine aus .ics-Dateien – lokal gespeichert, mit Prüfungen verknüpfbar.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="cal-import">${icon('upload')} ICS importieren</button>
        <input type="file" id="cal-file" accept=".ics,.ical,.ifb,text/calendar" multiple hidden>
      </div>
    </div>

    ${sources.length
      ? `<div class="toolbar cal-toolbar">
          <div class="view-switch" role="group" aria-label="Ansicht">
            ${Object.entries(VIEWS).map(([key, label]) => `<button type="button" data-view="${key}" class="${key === view ? 'active' : ''}" aria-pressed="${key === view}">${label}</button>`).join('')}
          </div>
          <div class="row" style="gap:.25rem">
            <button class="icon-btn" id="cal-prev" aria-label="Zurück" title="Zurück"><svg class="icon" style="transform:rotate(180deg)" aria-hidden="true"><use href="#i-chevron"/></svg></button>
            <button class="btn btn-sm" id="cal-today">Heute</button>
            <button class="icon-btn" id="cal-next" aria-label="Weiter" title="Weiter">${icon('chevron')}</button>
          </div>
          <h2 class="cal-period">${esc(range.label)}</h2>
          <span class="spacer"></span>
          <select class="select" id="cal-filter-source" aria-label="Quelle filtern">
            <option value="">Alle Quellen</option>
            ${sources.map((source) => `<option value="${source.id}"${String(source.id) === sourceFilter ? ' selected' : ''}>${esc(source.name)}</option>`).join('')}
          </select>
          <select class="select" id="cal-filter-category" aria-label="Terminart filtern">
            <option value="">Alle Arten</option>
            ${Object.entries(CATEGORY_LABELS).map(([key, label]) => `<option value="${key}"${key === categoryFilter ? ' selected' : ''}>${label}</option>`).join('')}
          </select>
        </div>
        <div class="cal-legend small">
          ${Object.keys(CATEGORY_LABELS).map((key) => categoryBadge(key)).join('')}
          <span class="subtle">${icon('link')} mit Prüfung verknüpft</span>
        </div>
        <div class="cal-body">
          ${view === 'woche' ? weekView(range, byDay) : view === 'liste' ? listView(range, byDay) : monthView(range, anchor, byDay)}
        </div>
        <div class="mt-3">${sourcesCard(sources)}</div>`
      : `<div class="empty cal-empty">
          ${icon('calendar')}
          <h3>Noch kein Kalender importiert</h3>
          <p>Exportiere deinen Stundenplan oder Prüfungskalender als <strong>.ics</strong>-Datei (z. B. aus Outlook, Google Kalender, Thunderbird oder dem Hochschulportal) und ziehe sie hierher.</p>
          <div class="cal-dropzone" data-dropzone tabindex="0" role="button" aria-label=".ics-Datei auswählen oder hierher ziehen">
            ${icon('upload')}
            <span><strong>.ics-Datei hierher ziehen</strong> oder <span class="link-like">auswählen</span></span>
            <span class="tiny faint">Vor dem Speichern siehst du eine Vorschau aller erkannten Termine.</span>
          </div>
        </div>`}
  </div>`;
  // Alle Listener hängen an .cal-page – das Element wird bei jedem Rendern ersetzt.
  const page = root.querySelector('.cal-page');

  const rerender = () => render(root, ctx);
  const fileInput = root.querySelector('#cal-file');
  const runImport = async (files) => {
    const list = [...files];
    if (!list.length) return;
    const changed = await importCalendarFiles(list);
    if (changed) await rerender();
  };

  root.querySelector('#cal-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    runImport(fileInput.files);
    fileInput.value = '';
  });

  root.querySelectorAll('[data-dropzone]').forEach((zone) => {
    zone.addEventListener('click', () => fileInput.click());
    zone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        fileInput.click();
      }
    });
  });

  // Drag-and-drop auf die gesamte Kalenderseite.
  let dragDepth = 0;
  const hasFiles = (event) => [...(event.dataTransfer?.types ?? [])].includes('Files');
  const onDragEnter = (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth += 1;
    page.classList.add('cal-dragging');
  };
  const onDragOver = (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) page.classList.remove('cal-dragging');
  };
  const onDrop = (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth = 0;
    page.classList.remove('cal-dragging');
    runImport(event.dataTransfer.files);
  };
  page.addEventListener('dragenter', onDragEnter);
  page.addEventListener('dragover', onDragOver);
  page.addEventListener('dragleave', onDragLeave);
  page.addEventListener('drop', onDrop);

  root.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      storeView(button.dataset.view);
      navigate({ ansicht: button.dataset.view });
    });
  });
  root.querySelector('#cal-prev')?.addEventListener('click', () => navigate({ datum: ymd(shiftAnchor(view, anchor, -1)) }));
  root.querySelector('#cal-next')?.addEventListener('click', () => navigate({ datum: ymd(shiftAnchor(view, anchor, 1)) }));
  root.querySelector('#cal-today')?.addEventListener('click', () => navigate({ datum: todayISO() }));
  root.querySelector('#cal-filter-source')?.addEventListener('change', (event) => navigate({ quelle: event.target.value }));
  root.querySelector('#cal-filter-category')?.addEventListener('change', (event) => navigate({ art: event.target.value }));

  page.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-event-id]');
    if (chip) {
      openEventDetail(Number(chip.dataset.eventId), { onChange: rerender });
      return;
    }
    const more = event.target.closest('[data-day-list]');
    if (more) {
      const day = more.dataset.dayList;
      openDayList(day, byDay.get(day) ?? [], rerender);
    }
  });

  root.querySelectorAll('[data-rename-source]').forEach((button) => {
    button.addEventListener('click', async () => {
      const name = await promptDialog({ title: 'Quelle umbenennen', label: 'Name', value: button.dataset.name });
      if (!name) return;
      try {
        await api.patch(`/calendar/sources/${button.dataset.renameSource}`, { name });
        toast('Quelle umbenannt.', 'success');
        await rerender();
      } catch (error) {
        errorToast(error);
      }
    });
  });

  root.querySelectorAll('[data-delete-source]').forEach((button) => {
    button.addEventListener('click', async () => {
      const linked = Number(button.dataset.linked) || 0;
      const message = [
        `„${button.dataset.name}“ und ${button.dataset.count} importierte Termine werden aus StudyForge entfernt.`,
        linked
          ? `${linked} Prüfung(en) verlieren nur ihre Kalenderverknüpfung – die Prüfungen selbst, Notizen und Lernstände bleiben vollständig erhalten.`
          : 'Prüfungen, Notizen und Lernstände sind davon nicht betroffen.',
        'Die ursprüngliche .ics-Datei wird nicht verändert.'
      ].join('\n\n');
      if (!(await confirmDialog({ title: 'Kalenderquelle entfernen?', message, confirmLabel: 'Quelle entfernen', danger: true }))) return;
      try {
        const result = await api.delete(`/calendar/sources/${button.dataset.deleteSource}`);
        toast(`Quelle entfernt (${result.removedEvents} Termine${result.unlinkedExams ? `, ${result.unlinkedExams} Verknüpfung(en) gelöst` : ''}).`, 'success');
        await rerender();
      } catch (error) {
        errorToast(error);
      }
    });
  });

  if (focusEvent) {
    // Termin nur einmal öffnen – Parameter aus der Adresse entfernen, ohne neu zu rendern.
    const params = new URLSearchParams(query);
    params.delete('termin');
    params.set('datum', ymd(anchor));
    window.history.replaceState(null, '', `#/kalender?${params.toString()}`);
    openEventDetail(focusEvent.id, { onChange: rerender });
  }
}

function openDayList(day, events, onChange) {
  const { close, body } = openModal({
    title: dayFormat.format(parseYmd(day)),
    narrow: true,
    body: `<div class="stack">${events.map((event) => `<div>${eventChip(event)}<div class="tiny faint">${esc(eventTimeLabel(event))}${event.location ? ` · ${esc(event.location)}` : ''}</div></div>`).join('')}</div>`,
    actions: [{ label: 'Schließen' }]
  });
  body.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-event-id]');
    if (!chip) return;
    close();
    openEventDetail(Number(chip.dataset.eventId), { onChange });
  });
}

/* ------------------------------------------------------------------ Details */
export async function openEventDetail(eventId, { onChange } = {}) {
  let event;
  let exams;
  try {
    [event, exams] = await Promise.all([api.get(`/calendar/events/${eventId}`), api.get('/exams')]);
  } catch (error) {
    errorToast(error);
    return;
  }
  const changed = async () => {
    try {
      await onChange?.();
    } catch {
      /* Ansicht wird beim nächsten Aufruf aktualisiert */
    }
  };

  const linkedExam = event.exam_id ? exams.find((exam) => exam.id === event.exam_id) : null;
  const linkable = exams.filter((exam) => exam.id !== event.exam_id);
  const attendees = event.attendees ?? [];
  const alarms = event.alarms ?? [];

  const { close, body } = openModal({
    title: event.summary || 'Termin ohne Titel',
    subtitle: `${eventTimeLabel(event, { withDate: true })} · Quelle: ${event.source_name}`,
    wide: true,
    body: `
      <div class="row" style="gap:.35rem;flex-wrap:wrap">
        ${categoryBadge(displayCategory(event))}
        ${event.status === 'CANCELLED' ? '<span class="badge badge-danger">abgesagt</span>' : ''}
        ${event.status === 'TENTATIVE' ? '<span class="badge">vorläufig</span>' : ''}
        ${event.rrule ? `<span class="badge">${esc(recurrenceLabel(event.rrule))}</span>` : ''}
        ${event.is_exception ? '<span class="badge badge-info">geänderter Einzeltermin einer Serie</span>' : ''}
        ${event.removed_at ? '<span class="badge badge-warning">in der Quelle nicht mehr enthalten</span>' : ''}
      </div>
      ${event.removed_at
        ? `<p class="form-error" style="margin-top:.6rem">Dieser Termin fehlte beim letzten Import der Quelle. Er bleibt erhalten, weil eine Prüfung darauf verweist. Die Prüfung wird nicht automatisch gelöscht.</p>`
        : ''}
      <dl class="cal-detail">
        <dt>Zeit</dt><dd>${esc(eventTimeLabel(event, { withDate: true }))}${event.tzid && event.tzid !== 'UTC' ? ` <span class="tiny faint">(${esc(event.tzid)})</span>` : ''}</dd>
        ${event.location ? `<dt>Ort</dt><dd>${esc(event.location)}</dd>` : ''}
        ${event.description ? `<dt>Beschreibung</dt><dd class="cal-description">${esc(event.description)}</dd>` : ''}
        ${event.organizer ? `<dt>Organisator</dt><dd>${esc(event.organizer)}</dd>` : ''}
        ${attendees.length
          ? `<dt>Teilnehmende</dt><dd>${attendees.slice(0, 20).map((person) => esc(person.name || person.email)).join(', ')}${attendees.length > 20 ? ` und ${attendees.length - 20} weitere` : ''}</dd>`
          : ''}
        ${alarms.length ? `<dt>Erinnerung</dt><dd>${alarms.map((alarm) => esc(alarmLabel(alarm))).join(', ')} <span class="tiny faint">(nur Anzeige – StudyForge sendet keine Benachrichtigungen)</span></dd>` : ''}
        ${event.categories ? `<dt>Kategorien</dt><dd>${esc(event.categories)}</dd>` : ''}
        <dt>Terminart</dt>
        <dd>
          <select class="select" id="event-category" style="max-width:260px">
            <option value="auto"${event.category_manual ? '' : ' selected'}>Automatisch (${esc(CATEGORY_LABELS[event.category] || 'Termin')})</option>
            ${Object.entries(CATEGORY_LABELS).map(([key, label]) => `<option value="${key}"${event.category_manual && event.category === key ? ' selected' : ''}>${label}</option>`).join('')}
          </select>
          <span class="hint">Eigene Einordnung bleibt bei erneutem Import erhalten.</span>
        </dd>
      </dl>

      <section class="cal-exam-link">
        <h3>${icon('exams')} Prüfung</h3>
        ${linkedExam
          ? `<div class="row-between">
              <div>
                <div class="list-title">${icon('link')} ${esc(linkedExam.title)}</div>
                <div class="list-meta">${linkedExam.date ? esc(formatDate(linkedExam.date)) : 'ohne Datum'}${linkedExam.start_time ? ` · ${esc(linkedExam.start_time)} Uhr` : ''}${linkedExam.subject_name ? ` · ${esc(linkedExam.subject_name)}` : ''}</div>
              </div>
              <div class="row">
                <a class="btn btn-sm" href="#/pruefungen?pruefung=${linkedExam.id}" data-close>Zur Prüfung</a>
                <button class="btn btn-sm" id="event-unlink">Verknüpfung aufheben</button>
              </div>
            </div>`
          : '<p class="small subtle" style="margin:0 0 .5rem">Dieser Termin ist mit keiner Prüfung verknüpft.</p>'}
        <div class="row mt-2" style="align-items:flex-end">
          ${linkable.length
            ? `<div class="field" style="flex:1;min-width:220px;margin:0">
                <label for="event-exam-select">${linkedExam ? 'Stattdessen verknüpfen mit' : 'Mit vorhandener Prüfung verknüpfen'}</label>
                <select class="select" id="event-exam-select">
                  <option value="">Prüfung wählen …</option>
                  ${linkable
                    .map((exam) => `<option value="${exam.id}">${esc(exam.title)}${exam.date ? ` (${esc(formatDate(exam.date, { short: true }))})` : ''}${exam.calendar_event_id ? ' – bereits mit anderem Termin verknüpft' : ''}</option>`)
                    .join('')}
                </select>
              </div>
              <button class="btn btn-sm" id="event-link">${icon('link')} Verknüpfen</button>`
            : ''}
          ${linkedExam ? '' : `<button class="btn btn-sm btn-primary" id="event-create-exam">${icon('plus')} Neue Prüfung aus Termin</button>`}
        </div>
      </section>
      <p class="tiny faint mt-2" style="margin-bottom:0">UID: <span class="mono">${esc(event.uid)}</span>${event.last_modified ? ` · zuletzt geändert (Quelle): ${esc(new Date(event.last_modified).toLocaleString('de-DE'))}` : ''}</p>`,
    actions: [
      ...(event.removed_at ? [{ label: 'Termin entfernen', variant: 'danger', keepOpen: true, onClick: async () => removeEvent() }] : []),
      { label: 'Schließen' }
    ]
  });

  async function removeEvent() {
    const ok = await confirmDialog({
      title: 'Termin entfernen?',
      message: `Der Termin wird aus StudyForge entfernt.${linkedExam ? `\n\nDie Prüfung „${linkedExam.title}“ bleibt erhalten, nur die Verknüpfung entfällt.` : ''}`,
      confirmLabel: 'Entfernen',
      danger: true
    });
    if (!ok) return false;
    await api.delete(`/calendar/events/${event.id}`);
    toast('Termin entfernt.', 'success');
    close();
    await changed();
    return true;
  }

  body.querySelector('[data-close]')?.addEventListener('click', () => close());

  body.querySelector('#event-category').addEventListener('change', async (changeEvent) => {
    try {
      const value = changeEvent.target.value;
      await api.patch(`/calendar/events/${event.id}`, { category: value === 'auto' ? 'auto' : value });
      toast('Terminart gespeichert.', 'success');
      await changed();
    } catch (error) {
      errorToast(error);
    }
  });

  body.querySelector('#event-unlink')?.addEventListener('click', async () => {
    try {
      await api.delete(`/calendar/events/${event.id}/link`);
      toast('Verknüpfung aufgehoben. Prüfung und Termin bleiben erhalten.', 'success');
      close();
      await changed();
    } catch (error) {
      errorToast(error);
    }
  });

  body.querySelector('#event-link')?.addEventListener('click', async () => {
    const examId = Number(body.querySelector('#event-exam-select').value);
    if (!examId) {
      toast('Bitte zuerst eine Prüfung auswählen.', 'warning');
      return;
    }
    const exam = exams.find((item) => item.id === examId);
    let replace = false;
    if (linkedExam || exam?.calendar_event_id) {
      const parts = [];
      if (linkedExam) parts.push(`Die Verknüpfung mit „${linkedExam.title}“ wird gelöst.`);
      if (exam?.calendar_event_id) parts.push(`„${exam.title}“ ist bereits mit einem anderen Termin verknüpft; diese Verknüpfung wird ersetzt.`);
      parts.push('Prüfungsinhalte, Datum und Lernstände werden nicht verändert.');
      replace = await confirmDialog({ title: 'Verknüpfung ändern?', message: parts.join('\n\n'), confirmLabel: 'Ändern' });
      if (!replace) return;
    }
    try {
      await api.post(`/calendar/events/${event.id}/link`, { exam_id: examId, replace });
      toast(`Mit „${exam?.title ?? 'Prüfung'}“ verknüpft.`, 'success');
      close();
      await changed();
    } catch (error) {
      errorToast(error);
    }
  });

  body.querySelector('#event-create-exam')?.addEventListener('click', () => {
    close();
    openExamDialog(null, {
      prefill: examPrefillFromEvent(event),
      calendarEvent: event,
      onSaved: async (saved) => {
        toast(`Prüfung „${saved.title}“ angelegt und mit dem Termin verknüpft.`, 'success');
        await changed();
      }
    });
  });
}

/* ------------------------------------------------------------------ Termin-Auswahl für Prüfungen */
export async function openEventPicker(exam, { onLinked } = {}) {
  let events;
  try {
    events = await api.get('/calendar/events?unlinked=1&limit=5000');
  } catch (error) {
    errorToast(error);
    return;
  }
  if (!events.length) {
    toast('Keine freien Kalendertermine vorhanden. Zuerst unter „Kalender“ eine .ics-Datei importieren.', 'warning', 6000);
    return;
  }
  const reference = exam.date ? parseYmd(exam.date).getTime() : Date.now();
  const sorted = [...events]
    .filter((event) => !event.removed_at)
    .sort((a, b) => {
      const priority = (event) => (event.category === 'pruefung' ? 0 : event.category === 'abgabe' ? 1 : 2);
      return priority(a) - priority(b) || Math.abs(eventStart(a) - reference) - Math.abs(eventStart(b) - reference);
    });

  const renderList = (filter) => {
    const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
    const list = sorted
      .filter((event) => {
        const text = `${event.summary} ${event.location} ${event.source_name}`.toLowerCase();
        return words.every((word) => text.includes(word));
      })
      .slice(0, 60);
    return list.length
      ? list
          .map(
            (event) => `<button type="button" class="list-item cal-list-item" data-pick="${event.id}">
              <span class="cal-bar" data-cat="${esc(event.category)}"></span>
              <span class="list-body">
                <span class="list-title">${esc(event.summary || 'Ohne Titel')}</span>
                <span class="list-meta"><span>${esc(eventTimeLabel(event, { withDate: true }))}</span>${event.location ? `<span>· ${esc(event.location)}</span>` : ''}${categoryBadge(event.category)}<span class="faint">${esc(event.source_name)}</span></span>
              </span>
            </button>`
          )
          .join('')
      : '<p class="small subtle">Keine passenden Termine.</p>';
  };

  const { close, body } = openModal({
    title: 'Kalendertermin verknüpfen',
    subtitle: `Für „${exam.title}“ – Prüfungsdaten werden dabei nicht verändert.`,
    wide: true,
    body: `<div class="field"><label for="picker-q">Suchen</label><input class="input" id="picker-q" placeholder="Titel, Ort oder Quelle"></div>
      <div class="item-list cal-picker" id="picker-list">${renderList('')}</div>`,
    actions: [{ label: 'Abbrechen' }]
  });
  const listEl = body.querySelector('#picker-list');
  body.querySelector('#picker-q').addEventListener('input', (inputEvent) => {
    listEl.innerHTML = renderList(inputEvent.target.value);
  });
  listEl.addEventListener('click', async (clickEvent) => {
    const button = clickEvent.target.closest('[data-pick]');
    if (!button) return;
    try {
      await api.post(`/calendar/events/${button.dataset.pick}/link`, { exam_id: exam.id });
      toast('Kalendertermin verknüpft.', 'success');
      close();
      await onLinked?.();
    } catch (error) {
      errorToast(error);
    }
  });
}

/* ------------------------------------------------------------------ Import */
function previewStatus(statuses, duplicateOf) {
  const labels = {
    insert: ['neu', 'badge-success'],
    update: ['wird aktualisiert', 'badge-info'],
    unchanged: ['unverändert', ''],
    older: ['älter als Bestand – übersprungen', 'badge-warning'],
    duplicate: [`Duplikat${duplicateOf ? ` (bereits in „${duplicateOf}“)` : ''} – übersprungen`, 'badge-warning']
  };
  return Object.entries(statuses)
    .map(([key, count]) => {
      const [label, cls] = labels[key] ?? [key, ''];
      return `<span class="badge ${cls}">${count > 1 ? `${count}× ` : ''}${esc(label)}</span>`;
    })
    .join(' ');
}

function previewBody(preview, file, index, total) {
  const c = preview.counts;
  const items = preview.items.slice(0, 300);
  const sourceOptions = [
    `<option value="new"${preview.sourceId ? '' : ' selected'}>Neue Kalenderquelle anlegen</option>`,
    ...preview.sources.map((source) => `<option value="${source.id}"${preview.sourceId === source.id ? ' selected' : ''}>Bestehende Quelle aktualisieren: ${esc(source.name)} (${source.event_count} Termine)</option>`)
  ].join('');
  const nothingToDo = c.insert + c.update + c.remove + c.keepLinked === 0;
  return `
    ${total > 1 ? `<p class="tiny faint" style="margin:0 0 .4rem">Datei ${index + 1} von ${total}</p>` : ''}
    <div class="row" style="gap:.35rem;flex-wrap:wrap">
      <span class="badge badge-accent">${c.items} ${c.items === 1 ? 'Termin' : 'Termine'}${c.instances !== c.items ? ` · ${c.instances} Vorkommen` : ''}</span>
      ${c.insert ? `<span class="badge badge-success">${c.insert} neu</span>` : ''}
      ${c.update ? `<span class="badge badge-info">${c.update} aktualisiert</span>` : ''}
      ${c.unchanged ? `<span class="badge">${c.unchanged} unverändert</span>` : ''}
      ${c.older ? `<span class="badge badge-warning">${c.older} älter als Bestand</span>` : ''}
      ${c.duplicate ? `<span class="badge badge-warning">${c.duplicate} Duplikate</span>` : ''}
      ${c.remove ? `<span class="badge badge-danger">${c.remove} nicht mehr in der Datei – werden entfernt</span>` : ''}
      ${c.keepLinked ? `<span class="badge badge-warning">${c.keepLinked} nicht mehr in der Datei – bleiben wegen Prüfungsverknüpfung erhalten</span>` : ''}
      <span class="badge">${esc(preview.encoding)}</span>
    </div>

    ${preview.errors.length
      ? `<div class="form-error mt-2"><strong>${preview.errors.length} Problem(e) beim Lesen:</strong><ul class="cal-problems">${preview.errors.slice(0, 20).map((text) => `<li>${esc(text)}</li>`).join('')}</ul>
          ${preview.recovered ? '<div>Nur die oben aufgeführten fehlerhaften Stellen werden ausgelassen; alle übrigen Termine wurden vollständig gelesen.</div>' : ''}</div>`
      : ''}
    ${preview.warnings.length ? `<ul class="hint cal-problems">${preview.warnings.slice(0, 12).map((text) => `<li>${esc(text)}</li>`).join('')}</ul>` : ''}

    <div class="form-row mt-2">
      <div class="field"><label for="import-target">Ziel</label>
        <select class="select" id="import-target">${sourceOptions}</select>
        ${preview.suggestedSource ? `<span class="hint">Erkannt als erneuter Import von „${esc(preview.suggestedSource.name)}“ (${esc(preview.suggestedSource.reasons.join(', '))}).</span>` : ''}
      </div>
      <div class="field" id="import-name-field"${preview.sourceId ? ' hidden' : ''}><label for="import-name">Name der neuen Quelle</label>
        <input class="input" id="import-name" value="${esc(preview.calendarName || file.name.replace(/\.(ics|ical|ifb)$/i, ''))}"></div>
    </div>

    <div class="table-wrap cal-preview">
      <table class="data">
        <thead><tr><th>Beginn</th><th>Titel</th><th>Ort</th><th>Art</th><th>Wiederholung</th><th>Status</th></tr></thead>
        <tbody>
          ${items
            .map(
              (item) => `<tr${item.status === 'CANCELLED' ? ' class="cal-cancelled-text"' : ''}>
                <td class="nowrap">${esc(eventTimeLabel({ start: item.start, end: item.end || item.start, all_day: item.allDay }, { withDate: true }))}</td>
                <td class="cell-main">${esc(item.summary || 'Ohne Titel')}${item.status === 'CANCELLED' ? ' <span class="badge badge-danger">abgesagt</span>' : ''}</td>
                <td>${esc(item.location || '')}</td>
                <td>${categoryBadge(item.category)}</td>
                <td class="small">${item.rrule ? `${esc(recurrenceLabel(item.rrule))} · ${item.occurrences} Vorkommen${item.exceptions ? `, ${item.exceptions} geändert` : ''}` : '–'}</td>
                <td>${previewStatus(item.statuses, item.duplicateOf)}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>
    ${preview.items.length > items.length ? `<p class="hint">${preview.items.length - items.length} weitere Termine werden importiert, aber hier nicht angezeigt.</p>` : ''}
    <p class="hint" style="margin-bottom:0">Wiederkehrende Termine werden für den Zeitraum ${esc(formatDate(preview.window.start.slice(0, 10), { short: true }))} bis ${esc(formatDate(preview.window.end.slice(0, 10), { short: true }))} übernommen. Die Originaldatei wird nicht verändert.</p>
    ${!c.instances
      ? '<p class="form-error mt-2" style="margin-bottom:0">In dieser Datei wurde kein importierbarer Termin gefunden. Es wird nichts gespeichert.</p>'
      : nothingToDo
        ? '<p class="form-success mt-2" style="margin-bottom:0">Alle Termine sind bereits auf dem aktuellen Stand – es gibt nichts zu ändern.</p>'
        : ''}`;
}

/**
 * Zeigt für jede Datei eine Vorschau und importiert erst nach Bestätigung.
 * Gibt true zurück, wenn mindestens eine Datei gespeichert wurde.
 */
export async function importCalendarFiles(files) {
  const results = [];
  let changed = false;
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    if (!/\.(ics|ical|ifb)$/i.test(file.name) && file.type !== 'text/calendar') {
      results.push({ file: file.name, error: 'Keine .ics-Datei – übersprungen.' });
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      results.push({ file: file.name, error: 'Datei größer als 5 MB – übersprungen.' });
      continue;
    }
    let buffer;
    try {
      buffer = await file.arrayBuffer();
    } catch {
      results.push({ file: file.name, error: 'Datei konnte nicht gelesen werden.' });
      continue;
    }
    let preview;
    try {
      preview = await api.post(`/calendar/preview${qs({ filename: file.name })}`, buffer, { headers: { 'Content-Type': 'text/calendar' } });
    } catch (error) {
      results.push({ file: file.name, error: error.message });
      continue;
    }
    const decision = await showPreview(preview, file, buffer, index, files.length);
    if (decision.action === 'cancel') {
      results.push({ file: file.name, skipped: true });
      for (const rest of files.slice(index + 1)) results.push({ file: rest.name, skipped: true });
      break;
    }
    if (decision.action === 'skip') {
      results.push({ file: file.name, skipped: true });
      continue;
    }
    results.push({ file: file.name, result: decision.result });
    changed = true;
  }
  if (results.length) showImportSummary(results);
  return changed;
}

function showPreview(initialPreview, file, buffer, index, total) {
  return new Promise((resolve) => {
    let preview = initialPreview;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const remaining = total - index - 1;
    const { close, body } = openModal({
      title: 'Kalenderimport – Vorschau',
      subtitle: file.name,
      wide: true,
      className: 'cal-import-modal',
      body: previewBody(preview, file, index, total),
      actions: [
        { label: remaining ? 'Gesamten Import abbrechen' : 'Abbrechen', onClick: () => finish({ action: 'cancel' }) },
        ...(remaining || !preview.counts.instances
          ? [{ label: remaining ? 'Diese Datei überspringen' : 'Schließen', variant: preview.counts.instances ? undefined : 'primary', onClick: () => finish({ action: 'skip' }) }]
          : []),
        ...(preview.counts.instances ? [{
          label: 'Importieren',
          variant: 'primary',
          onClick: async (_close, dialog) => {
            if (!preview.counts.instances) {
              toast('Die Datei enthält keine importierbaren Termine.', 'warning');
              return false;
            }
            const target = dialog.querySelector('#import-target').value;
            const name = dialog.querySelector('#import-name')?.value.trim() || '';
            const result = await api.post(
              `/calendar/import${qs({ filename: file.name, source_id: target, name: target === 'new' ? name : '' })}`,
              buffer,
              { headers: { 'Content-Type': 'text/calendar' } }
            );
            finish({ action: 'import', result });
          }
        }] : [])
      ],
      onClose: () => finish({ action: 'cancel' })
    });

    const wireTarget = () => {
      body.querySelector('#import-target').addEventListener('change', async (event) => {
        const value = event.target.value;
        try {
          preview = await api.post(`/calendar/preview${qs({ filename: file.name, source_id: value })}`, buffer, {
            headers: { 'Content-Type': 'text/calendar' }
          });
          const name = body.querySelector('#import-name')?.value;
          body.innerHTML = previewBody(preview, file, index, total);
          if (name && body.querySelector('#import-name')) body.querySelector('#import-name').value = name;
          wireTarget();
        } catch (error) {
          errorToast(error);
        }
      });
    };
    wireTarget();
    void close;
  });
}

function showImportSummary(results) {
  const rows = results.map((entry) => {
    if (entry.error) return `<li><strong>${esc(entry.file)}</strong>: <span class="danger-text">${esc(entry.error)}</span></li>`;
    if (entry.skipped) return `<li><strong>${esc(entry.file)}</strong>: nicht importiert (abgebrochen bzw. übersprungen) – nichts gespeichert.</li>`;
    const r = entry.result;
    const parts = [
      r.insert ? `${r.insert} neu` : '',
      r.update ? `${r.update} aktualisiert` : '',
      r.unchanged ? `${r.unchanged} unverändert` : '',
      r.older ? `${r.older} älter (übersprungen)` : '',
      r.duplicate ? `${r.duplicate} Duplikate übersprungen` : '',
      r.remove ? `${r.remove} entfernt` : '',
      r.keepLinked ? `${r.keepLinked} wegen Prüfungsverknüpfung behalten` : ''
    ].filter(Boolean);
    const problems = (r.errors ?? []).length;
    return `<li><strong>${esc(entry.file)}</strong> → „${esc(r.source?.name ?? '')}“: ${esc(parts.join(', ') || 'keine Änderungen')}${problems ? ` · <span class="danger-text">${problems} fehlerhafte Stelle(n) ausgelassen</span>` : ''}</li>`;
  });
  const anyImported = results.some((entry) => entry.result);
  const anyError = results.some((entry) => entry.error);
  openModal({
    title: anyImported ? 'Kalenderimport abgeschlossen' : 'Kalenderimport',
    narrow: true,
    body: `<ul class="cal-summary">${rows.join('')}</ul>${anyError ? '<p class="hint">Fehlerhafte Dateien wurden nicht verändert und nicht gespeichert.</p>' : ''}`,
    actions: [{ label: 'OK', variant: 'primary' }]
  });
}
