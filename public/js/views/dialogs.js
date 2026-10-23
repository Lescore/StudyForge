import { api } from '../api.js';
import { state, refreshSubjects } from '../store.js';
import {
  $,
  $$,
  esc,
  openModal,
  toast,
  subjectOptions,
  deckOptions,
  todayISO,
  errorToast
} from '../ui.js';

function errorBox(message = '') {
  return `<div class="form-error" data-error ${message ? '' : 'hidden'}>${esc(message)}</div>`;
}

function showError(dialog, error) {
  const box = dialog.querySelector('[data-error]');
  if (!box) {
    errorToast(error);
    return;
  }
  box.textContent = error?.message || 'Speichern fehlgeschlagen.';
  box.hidden = false;
  box.scrollIntoView({ block: 'nearest' });
}

const CARD_TYPE_LABELS = {
  qa: 'Frage und Antwort',
  definition: 'Begriff und Definition',
  cloze: 'Lückentext',
  truefalse: 'Richtig oder falsch',
  mc: 'Multiple Choice',
  code: 'Code- und Syntaxfrage'
};

/* ------------------------------------------------------------------ Semester */
export function openSemesterDialog(semester = null, onSaved) {
  const isEdit = Boolean(semester);
  openModal({
    title: isEdit ? 'Semester bearbeiten' : 'Neues Semester',
    narrow: true,
    body: `<form id="semester-form">
      ${errorBox()}
      <div class="field"><label for="sem-name">Name <span class="required">*</span></label>
        <input class="input" id="sem-name" name="name" required value="${esc(semester?.name ?? '')}" placeholder="z. B. WS 2026/27"></div>
      <div class="form-row">
        <div class="field"><label for="sem-start">Beginn</label><input class="input" type="date" id="sem-start" name="start_date" value="${esc(semester?.start_date ?? '')}"></div>
        <div class="field"><label for="sem-end">Ende</label><input class="input" type="date" id="sem-end" name="end_date" value="${esc(semester?.end_date ?? '')}"></div>
      </div>
    </form>`,
    actions: [
      { label: 'Abbrechen' },
      {
        label: isEdit ? 'Speichern' : 'Semester anlegen',
        variant: 'primary',
        onClick: async (_close, dialog) => {
          const form = dialog.querySelector('#semester-form');
          const body = Object.fromEntries(new FormData(form));
          if (!body.name?.trim()) {
            showError(dialog, new Error('Bitte einen Namen angeben.'));
            return false;
          }
          try {
            const saved = isEdit ? await api.patch(`/semesters/${semester.id}`, body) : await api.post('/semesters', body);
            toast(isEdit ? 'Semester aktualisiert.' : 'Semester angelegt.', 'success');
            state.semesters = await api.get('/semesters');
            onSaved?.(saved);
          } catch (error) {
            showError(dialog, error);
            return false;
          }
        }
      }
    ]
  });
}

/* ------------------------------------------------------------------ Fach */
export function openSubjectDialog(subject = null, onSaved) {
  const isEdit = Boolean(subject);
  const colors = [
    ['indigo', 'Indigo'], ['teal', 'Petrol'], ['amber', 'Bernstein'], ['rose', 'Rosé'],
    ['violet', 'Violett'], ['slate', 'Schiefer'], ['green', 'Grün'], ['orange', 'Orange']
  ];
  openModal({
    title: isEdit ? 'Fach bearbeiten' : 'Neues Fach',
    body: `<form id="subject-form">
      ${errorBox()}
      <div class="field"><label for="sub-name">Name <span class="required">*</span></label>
        <input class="input" id="sub-name" name="name" required value="${esc(subject?.name ?? '')}" placeholder="z. B. Netzwerktechnik"></div>
      <div class="field"><label for="sub-desc">Beschreibung</label>
        <textarea class="textarea" id="sub-desc" name="description" rows="3" placeholder="Worum geht es in diesem Fach?">${esc(subject?.description ?? '')}</textarea></div>
      <div class="form-row">
        <div class="field"><label for="sub-semester">Semester</label>
          <select class="select" id="sub-semester" name="semester_id">
            <option value="">Ohne Semester</option>
            ${state.semesters.map((sem) => `<option value="${sem.id}"${Number(subject?.semester_id) === sem.id ? ' selected' : ''}>${esc(sem.name)}</option>`).join('')}
          </select></div>
        <div class="field"><label for="sub-status">Status</label>
          <select class="select" id="sub-status" name="status">
            ${[['aktiv', 'Aktiv'], ['abgeschlossen', 'Abgeschlossen'], ['geplant', 'Geplant']].map(([value, label]) => `<option value="${value}"${(subject?.status ?? 'aktiv') === value ? ' selected' : ''}>${label}</option>`).join('')}
          </select></div>
        <div class="field"><label for="sub-color">Farbe</label>
          <select class="select" id="sub-color" name="color">
            ${colors.map(([value, label]) => `<option value="${value}"${(subject?.color ?? 'indigo') === value ? ' selected' : ''}>${label}</option>`).join('')}
          </select></div>
      </div>
    </form>`,
    actions: [
      { label: 'Abbrechen' },
      {
        label: isEdit ? 'Speichern' : 'Fach anlegen',
        variant: 'primary',
        onClick: async (_close, dialog) => {
          const form = dialog.querySelector('#subject-form');
          const body = Object.fromEntries(new FormData(form));
          if (!body.name?.trim()) {
            showError(dialog, new Error('Bitte einen Namen angeben.'));
            return false;
          }
          try {
            const saved = isEdit ? await api.patch(`/subjects/${subject.id}`, body) : await api.post('/subjects', body);
            await refreshSubjects();
            toast(isEdit ? 'Fach aktualisiert.' : 'Fach angelegt.', 'success');
            onSaved?.(saved);
          } catch (error) {
            showError(dialog, error);
            return false;
          }
        }
      }
    ]
  });
}

/* ------------------------------------------------------------------ Ordner */
export function openFolderDialog(folder = null, { parentId = null, subjectId = null, onSaved } = {}) {
  const isEdit = Boolean(folder);
  const folders = state.folders ?? [];
  openModal({
    title: isEdit ? 'Ordner umbenennen' : 'Neuer Ordner',
    narrow: true,
    body: `<form id="folder-form">
      ${errorBox()}
      <div class="field"><label for="folder-name">Name <span class="required">*</span></label>
        <input class="input" id="folder-name" name="name" value="${esc(folder?.name ?? '')}" placeholder="z. B. Vorlesungen"></div>
      
      <div class="field"><label for="folder-parent">Übergeordneter Ordner</label>
        <select class="select" id="folder-parent" name="parent_id">
          <option value="">Oberste Ebene</option>
          ${folders.filter((f) => !folder || f.id !== folder.id).map((f) => `<option value="${f.id}"${Number(folder?.parent_id ?? parentId) === f.id ? ' selected' : ''}>${esc(f.path || f.name)}</option>`).join('')}
        </select></div>
      <div class="field"><label for="folder-subject">Fach (optional)</label>
        <select class="select" id="folder-subject" name="subject_id"><option value="">Kein Fach</option>${subjectOptions(state.subjects, folder?.subject_id ?? subjectId, { includeEmpty: false })}</select></div>
      <p class="hint">Ordner lassen sich beliebig tief verschachteln. Notizen bleiben beim Löschen eines Ordners erhalten.</p>
    </form>`,
    actions: [
      { label: 'Abbrechen' },
      {
        label: isEdit ? 'Speichern' : 'Ordner anlegen',
        variant: 'primary',
        onClick: async (_close, dialog) => {
          const body = Object.fromEntries(new FormData(dialog.querySelector('#folder-form')));
          if (!body.name?.trim()) {
            showError(dialog, new Error('Bitte einen Namen angeben.'));
            return false;
          }
          try {
            const saved = isEdit ? await api.patch(`/folders/${folder.id}`, body) : await api.post('/folders', body);
            toast('Ordner gespeichert.', 'success');
            onSaved?.(saved);
          } catch (error) {
            showError(dialog, error);
            return false;
          }
        }
      }
    ]
  });
}

/* ------------------------------------------------------------------ Stapel */
export function openDeckDialog(deck = null, onSaved) {
  const isEdit = Boolean(deck);
  openModal({
    title: isEdit ? 'Stapel bearbeiten' : 'Neuer Karteikartenstapel',
    narrow: true,
    body: `<form id="deck-form">
      ${errorBox()}
      <div class="field"><label for="deck-name">Name <span class="required">*</span></label>
        <input class="input" id="deck-name" name="name" value="${esc(deck?.name ?? '')}" placeholder="z. B. OSI-Modell"></div>
      <div class="field"><label for="deck-subject">Fach</label>
        <select class="select" id="deck-subject" name="subject_id"><option value="">Kein Fach</option>${subjectOptions(state.subjects, deck?.subject_id, { includeEmpty: false })}</select></div>
      <div class="field"><label for="deck-desc">Beschreibung</label>
        <textarea class="textarea" id="deck-desc" name="description" rows="2">${esc(deck?.description ?? '')}</textarea></div>
    </form>`,
    actions: [
      { label: 'Abbrechen' },
      {
        label: isEdit ? 'Speichern' : 'Stapel anlegen',
        variant: 'primary',
        onClick: async (_close, dialog) => {
          const body = Object.fromEntries(new FormData(dialog.querySelector('#deck-form')));
          if (!body.name?.trim()) {
            showError(dialog, new Error('Bitte einen Namen angeben.'));
            return false;
          }
          try {
            const saved = isEdit ? await api.patch(`/decks/${deck.id}`, body) : await api.post('/decks', body);
            toast('Stapel gespeichert.', 'success');
            onSaved?.(saved);
          } catch (error) {
            showError(dialog, error);
            return false;
          }
        }
      }
    ]
  });
}

/* ------------------------------------------------------------------ Karte */
function cardTypeFields(card) {
  const type = card?.type ?? 'qa';
  const options = Array.isArray(card?.options) ? card.options : [];
  const mcOptions = options.length >= 2 ? options : ['', '', ''];
  return {
    qa: '',
    definition: `<p class="hint">Trage den Begriff auf die Vorderseite und die Definition auf die Rückseite.</p>`,
    code: `<p class="hint">Codebeispiele werden nur angezeigt und nie ausgeführt. Nutze auf der Rückseite Codeblöcke für Erklärungen.</p>`,
    cloze: `<p class="hint">Lücken im Text mit doppelten geschweiften Klammern markieren, z. B. <code>Die {{Netzwerkadresse}}</code> …</p>`,
    truefalse: `<div class="field"><span class="field-label">Richtige Antwort</span>
      <div class="radio-group">
        <label class="radio-option"><input type="radio" name="correct_index" value="0"${card?.correct_index === 0 ? ' checked' : ''}> Richtig</label>
        <label class="radio-option"><input type="radio" name="correct_index" value="1"${card?.correct_index === 1 ? ' checked' : ''}> Falsch</label>
      </div></div>`,
    mc: `<div class="field"><span class="field-label">Antwortmöglichkeiten <span class="required">*</span></span>
      <div id="mc-options" class="stack">
        ${mcOptions.map((option, index) => `<div class="row mc-option-input" data-index="${index}">
          <input type="radio" name="correct_index" value="${index}" aria-label="Richtige Antwort ${index + 1}"${card?.correct_index === index ? ' checked' : ''}>
          <input class="input" name="option_${index}" value="${esc(option)}" placeholder="Antwort ${index + 1}">
        </div>`).join('')}
      </div>
      <div class="row mt-1"><button type="button" class="btn btn-sm" id="add-mc-option">Antwort hinzufügen</button>
        <button type="button" class="btn btn-sm" id="remove-mc-option">Letzte entfernen</button></div>
      <p class="hint">Mindestens zwei Antworten, genau eine als richtig markieren.</p>
    </div>`
  }[type];
}

export async function openCardDialog(card = null, { sourceNoteId = null, deckId = null, onSaved } = {}) {
  const isEdit = Boolean(card);
  let decks = [];
  try {
    decks = await api.get('/decks');
  } catch (error) {
    errorToast(error);
    return;
  }
  const initialType = card?.type ?? 'qa';
  const body = `<form id="card-form">
    ${errorBox()}
    <div class="form-row">
      <div class="field"><label for="card-type">Kartentyp</label>
        <select class="select" id="card-type" name="type">
          ${Object.entries(CARD_TYPE_LABELS).map(([value, label]) => `<option value="${value}"${initialType === value ? ' selected' : ''}>${label}</option>`).join('')}
        </select></div>
      <div class="field"><label for="card-deck">Stapel</label>
        ${decks.length
          ? `<select class="select" id="card-deck" name="deck_id">${deckOptions(decks, card?.deck_id ?? deckId, { emptyLabel: 'Kein Stapel' })}</select>`
          : `<input class="input" id="card-deck-new" name="new_deck_name" placeholder="Neuer Stapel, z. B. Allgemein">`}
      </div>
      <div class="field"><label for="card-topic">Thema</label>
        <input class="input" id="card-topic" name="topic" value="${esc(card?.topic ?? '')}" placeholder="z. B. Subnetting"></div>
    </div>
    <div class="field"><label for="card-front">Vorderseite <span class="required">*</span></label>
      <textarea class="textarea" id="card-front" name="front" rows="4" required placeholder="Frage, Begriff, Lückentext oder Code …">${esc(card?.front ?? '')}</textarea></div>
    <div class="field"><label for="card-back">Rückseite / Lösung <span class="required">*</span></label>
      <textarea class="textarea" id="card-back" name="back" rows="4" required placeholder="Antwort, Definition oder Erklärung …">${esc(card?.back ?? '')}</textarea></div>
    <div id="type-fields">${cardTypeFields(card)}</div>
    <div class="field"><label for="card-explanation">Zusätzliche Erklärung (optional)</label>
      <textarea class="textarea" id="card-explanation" name="explanation" rows="2">${esc(card?.explanation ?? '')}</textarea></div>
    <div class="field"><label for="card-tags">Schlagwörter (kommagetrennt)</label>
      <input class="input" id="card-tags" name="tags" value="${esc(Array.isArray(card?.tags) ? card.tags.join(', ') : card?.tags ?? '')}"></div>
    ${sourceNoteId ? `<input type="hidden" name="source_note_id" value="${sourceNoteId}"><p class="hint">Diese Karte wird mit der geöffneten Notiz verknüpft.</p>` : ''}
  </form>`;

  openModal({
    title: isEdit ? 'Karteikarte bearbeiten' : 'Neue Karteikarte',
    subtitle: 'Markdown und LaTeX ($…$) sind auf beiden Seiten möglich.',
    wide: true,
    body,
    actions: [
      { label: 'Abbrechen' },
      {
        label: isEdit ? 'Speichern' : 'Karte anlegen',
        variant: 'primary',
        onClick: async (_close, dialog) => {
          const form = dialog.querySelector('#card-form');
          const data = Object.fromEntries(new FormData(form));
          const type = data.type;
          const payload = {
            type,
            front: data.front,
            back: data.back,
            explanation: data.explanation,
            topic: data.topic,
            tags: data.tags,
            source_note_id: data.source_note_id || sourceNoteId || null,
            deck_id: data.deck_id || null
          };
          if (type === 'mc') {
            const count = dialog.querySelectorAll('#mc-options .mc-option-input').length;
            payload.options = Array.from({ length: count }, (_, i) => data[`option_${i}`] ?? '');
            payload.correct_index = data.correct_index !== undefined ? Number(data.correct_index) : null;
          }
          if (type === 'truefalse') payload.correct_index = data.correct_index !== undefined ? Number(data.correct_index) : null;
          try {
            if (!decks.length && data.new_deck_name?.trim()) {
              const deck = await api.post('/decks', { name: data.new_deck_name.trim(), subject_id: state.settings.last_subject_id || null });
              payload.deck_id = deck.id;
            }
            const saved = isEdit ? await api.patch(`/cards/${card.id}`, payload) : await api.post('/cards', payload);
            toast(isEdit ? 'Karte gespeichert.' : 'Karte angelegt.', 'success');
            onSaved?.(saved);
          } catch (error) {
            showError(dialog, error);
            return false;
          }
        }
      }
    ],
    onMount: (dialog) => {
      const typeSelect = dialog.querySelector('#card-type');
      const fields = dialog.querySelector('#type-fields');
      const sync = () => {
        fields.innerHTML = cardTypeFields({ type: typeSelect.value, options: card?.options, correct_index: card?.correct_index });
        bindMc();
      };
      typeSelect.addEventListener('change', sync);
      const bindMc = () => {
        const add = dialog.querySelector('#add-mc-option');
        const remove = dialog.querySelector('#remove-mc-option');
        if (!add) return;
        add.addEventListener('click', () => {
          const count = dialog.querySelectorAll('#mc-options .mc-option-input').length;
          if (count >= 8) {
            toast('Maximal acht Antwortmöglichkeiten.', 'warning');
            return;
          }
          const wrap = document.createElement('div');
          wrap.className = 'row mc-option-input';
          wrap.dataset.index = String(count);
          wrap.innerHTML = `<input type="radio" name="correct_index" value="${count}" aria-label="Richtige Antwort ${count + 1}">
            <input class="input" name="option_${count}" placeholder="Antwort ${count + 1}">`;
          dialog.querySelector('#mc-options').appendChild(wrap);
        });
        remove.addEventListener('click', () => {
          const rows = dialog.querySelectorAll('#mc-options .mc-option-input');
          if (rows.length <= 2) {
            toast('Mindestens zwei Antworten sind nötig.', 'warning');
            return;
          }
          rows[rows.length - 1].remove();
        });
      };
      bindMc();
      if (!decks.length) {
        const subject = state.settings.last_subject_id;
        if (subject) dialog.querySelector('#card-deck-new').value = '';
      }
    }
  });
}

/* ------------------------------------------------------------------ Aufgabe */
export async function openTaskDialog(task = null, { onSaved, examId = null, subjectId = null } = {}) {
  const isEdit = Boolean(task);
  let notes = [];
  let documents = [];
  try {
    const [notesResponse, filesResponse] = await Promise.all([
      api.get('/notes?limit=100&sort=updated'),
      api.get('/files?kind=document')
    ]);
    notes = Array.isArray(notesResponse) ? notesResponse : notesResponse?.notes ?? [];
    documents = Array.isArray(filesResponse) ? filesResponse : [];
  } catch {
    /* Verknüpfungen sind optional */
  }
  openModal({
    title: isEdit ? 'Aufgabe bearbeiten' : 'Neue Aufgabe',
    wide: true,
    body: `<form id="task-form">
      ${errorBox()}
      <div class="field"><label for="task-title">Titel <span class="required">*</span></label>
        <input class="input" id="task-title" name="title" required value="${esc(task?.title ?? '')}" placeholder="z. B. Übungsblatt 4 rechnen"></div>
      <div class="field"><label for="task-desc">Beschreibung</label>
        <textarea class="textarea" id="task-desc" name="description" rows="3">${esc(task?.description ?? '')}</textarea></div>
      <div class="form-row">
        <div class="field"><label for="task-subject">Fach</label>
          <select class="select" id="task-subject" name="subject_id"><option value="">Kein Fach</option>${subjectOptions(state.subjects, task?.subject_id ?? subjectId, { includeEmpty: false })}</select></div>
        <div class="field"><label for="task-topic">Thema</label>
          <input class="input" id="task-topic" name="topic" value="${esc(task?.topic ?? '')}"></div>
        <div class="field"><label for="task-priority">Priorität</label>
          <select class="select" id="task-priority" name="priority">
            ${[['niedrig', 'Niedrig'], ['normal', 'Normal'], ['hoch', 'Hoch']].map(([v, l]) => `<option value="${v}"${(task?.priority ?? 'normal') === v ? ' selected' : ''}>${l}</option>`).join('')}
          </select></div>
        <div class="field"><label for="task-due">Fällig am</label>
          <input class="input" type="date" id="task-due" name="due_date" value="${esc(task?.due_date ?? '')}"></div>
        <div class="field"><label for="task-status">Status</label>
          <select class="select" id="task-status" name="status">
            ${[['offen', 'Offen'], ['in_bearbeitung', 'In Bearbeitung'], ['erledigt', 'Erledigt']].map(([v, l]) => `<option value="${v}"${(task?.status ?? 'offen') === v ? ' selected' : ''}>${l}</option>`).join('')}
          </select></div>
      </div>
      <input type="hidden" name="exam_id" value="${esc(task?.exam_id ?? examId ?? '')}">
      ${notes.length ? `<div class="field"><span class="field-label">Verknüpfte Notizen</span>
        <div class="stack" style="max-height:130px; overflow:auto; border:1px solid var(--border); border-radius:8px; padding:.4rem .6rem">
          ${notes.map((note) => `<label class="checkbox"><input type="checkbox" name="note_${note.id}"${(task?.note_ids ?? []).includes(note.id) ? ' checked' : ''}> ${esc(note.title)}</label>`).join('')}
        </div></div>` : ''}
      ${documents.length ? `<div class="field"><span class="field-label">Verknüpfte Dokumente</span>
        <div class="stack" style="max-height:130px; overflow:auto; border:1px solid var(--border); border-radius:8px; padding:.4rem .6rem">
          ${documents.slice(0, 80).map((doc) => `<label class="checkbox"><input type="checkbox" name="file_${doc.id}"${(task?.file_ids ?? []).includes(doc.id) ? ' checked' : ''}> ${esc(doc.title || doc.original_name)}</label>`).join('')}
        </div></div>` : ''}
      ${isEdit ? `<p class="hint">Teilaufgaben verwaltest du direkt in der Aufgabenliste.</p>` : `<div class="field"><label for="task-subtasks">Teilaufgaben (eine pro Zeile)</label>
        <textarea class="textarea" id="task-subtasks" name="subtasks" rows="2" placeholder="z. B. Aufgabe 1 lesen&#10;Aufgabe 2 rechnen"></textarea></div>`}
    </form>`,
    actions: [
      { label: 'Abbrechen' },
      {
        label: isEdit ? 'Speichern' : 'Aufgabe anlegen',
        variant: 'primary',
        onClick: async (_close, dialog) => {
          const form = dialog.querySelector('#task-form');
          const data = Object.fromEntries(new FormData(form));
          const fetchedNoteIds = new Set(notes.map((note) => note.id));
          const fetchedFileIds = new Set(documents.map((doc) => doc.id));
          const payload = {
            title: data.title,
            description: data.description,
            subject_id: data.subject_id || null,
            topic: data.topic,
            priority: data.priority,
            due_date: data.due_date || null,
            status: data.status,
            exam_id: data.exam_id ? Number(data.exam_id) : null,
            note_ids: [
              ...(task?.note_ids ?? []).filter((id) => !fetchedNoteIds.has(id)),
              ...notes.filter((note) => data[`note_${note.id}`]).map((note) => note.id)
            ],
            file_ids: [
              ...(task?.file_ids ?? []).filter((id) => !fetchedFileIds.has(id)),
              ...documents.filter((doc) => data[`file_${doc.id}`]).map((doc) => doc.id)
            ]
          };
          if (!isEdit) {
            payload.subtasks = String(data.subtasks || '')
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
              .map((title) => ({ title }));
          }
          try {
            const saved = isEdit ? await api.patch(`/tasks/${task.id}`, payload) : await api.post('/tasks', payload);
            toast('Aufgabe gespeichert.', 'success');
            onSaved?.(saved);
          } catch (error) {
            showError(dialog, error);
            return false;
          }
        }
      }
    ]
  });
}

/* ------------------------------------------------------------------ Prüfung */
/**
 * Prüfung anlegen/bearbeiten. Mit `calendarEvent` (und `prefill`) wird die
 * Prüfung aus einem Kalendertermin erstellt und automatisch mit ihm verknüpft;
 * alle übernommenen Angaben sind vor dem Speichern bearbeitbar.
 */
export function openExamDialog(exam = null, { onSaved, subjectId = null, prefill = null, calendarEvent = null } = {}) {
  const isEdit = Boolean(exam);
  const values = { ...(prefill ?? {}), ...(exam ?? {}) };
  openModal({
    title: isEdit ? 'Prüfung bearbeiten' : calendarEvent ? 'Prüfung aus Kalendertermin' : 'Neue Prüfung',
    wide: true,
    subtitle: calendarEvent
      ? `Übernommen aus „${calendarEvent.summary || 'Termin'}“ – vor dem Speichern anpassbar.`
      : 'Keine Prognosen – nur deine eigenen Angaben und offenen Themen.',
    body: `<form id="exam-form">
      ${errorBox()}
      ${calendarEvent ? `<p class="hint" style="margin-top:0">Die neue Prüfung wird automatisch mit dem Kalendertermin verknüpft. Der Termin selbst bleibt unverändert.</p>` : ''}
      <div class="form-row">
        <div class="field"><label for="exam-title">Titel <span class="required">*</span></label>
          <input class="input" id="exam-title" name="title" required value="${esc(values.title ?? '')}" placeholder="z. B. Netzwerktechnik Klausur"></div>
        <div class="field"><label for="exam-subject">Fach</label>
          <select class="select" id="exam-subject" name="subject_id"><option value="">Kein Fach</option>${subjectOptions(state.subjects, exam?.subject_id ?? subjectId, { includeEmpty: false })}</select></div>
        <div class="field"><label for="exam-date">Datum</label>
          <input class="input" type="date" id="exam-date" name="date" value="${esc(values.date ?? '')}"></div>
        <div class="field"><label for="exam-time">Uhrzeit</label>
          <input class="input" type="time" id="exam-time" name="start_time" value="${esc(values.start_time ?? '')}"></div>
        <div class="field"><label for="exam-confidence">Eigene Einschätzung</label>
          <select class="select" id="exam-confidence" name="confidence">
            ${[0, 1, 2, 3, 4, 5].map((n) => `<option value="${n}"${(exam?.confidence ?? 0) === n ? ' selected' : ''}>${n === 0 ? 'Noch offen' : `${n} von 5`}</option>`).join('')}
          </select></div>
      </div>
      <div class="field"><label for="exam-location">Ort</label>
        <input class="input" id="exam-location" name="location" value="${esc(values.location ?? '')}" placeholder="z. B. Hörsaal 3, Gebäude B"></div>
      <div class="field"><label for="exam-topics">Prüfungsstoff</label>
        <textarea class="textarea" id="exam-topics" name="topics" rows="3" placeholder="Kapitel, Themen, Seiten …">${esc(exam?.topics ?? '')}</textarea></div>
      <div class="field"><label for="exam-goals">Eigene Lernziele</label>
        <textarea class="textarea" id="exam-goals" name="goals" rows="3">${esc(exam?.goals ?? '')}</textarea></div>
      <div class="field"><label for="exam-open">Offene / schwierige Themen</label>
        <textarea class="textarea" id="exam-open" name="open_topics" rows="3" placeholder="Was muss ich noch üben?">${esc(exam?.open_topics ?? '')}</textarea></div>
      <div class="field"><label for="exam-summary">Zusammenfassung / Notizen</label>
        <textarea class="textarea" id="exam-summary" name="summary" rows="4">${esc(values.summary ?? '')}</textarea></div>
      <p class="hint">Tipp: Eigene Lernziele lassen sich zusätzlich unter Fächer → Themen &amp; Lernziele verwalten.</p>
    </form>`,
    actions: [
      { label: 'Abbrechen' },
      {
        label: isEdit ? 'Speichern' : calendarEvent ? 'Prüfung anlegen und verknüpfen' : 'Prüfung anlegen',
        variant: 'primary',
        onClick: async (_close, dialog) => {
          const data = Object.fromEntries(new FormData(dialog.querySelector('#exam-form')));
          if (!data.title?.trim()) {
            showError(dialog, new Error('Bitte einen Titel angeben.'));
            return false;
          }
          try {
            const payload = {
              ...data,
              subject_id: data.subject_id || null,
              confidence: Number(data.confidence || 0),
              date: data.date || null,
              start_time: data.start_time || null
            };
            const saved = isEdit
              ? await api.patch(`/exams/${exam.id}`, payload)
              : calendarEvent
                ? await api.post(`/calendar/events/${calendarEvent.id}/exam`, payload)
                : await api.post('/exams', payload);
            if (!calendarEvent) toast('Prüfung gespeichert.', 'success');
            onSaved?.(saved);
          } catch (error) {
            showError(dialog, error);
            return false;
          }
        }
      }
    ]
  });
}

/* ------------------------------------------------------------------ Lernziel */
export function openGoalDialog(goal = null, { onSaved, subjectId = null } = {}) {
  const isEdit = Boolean(goal);
  openModal({
    title: isEdit ? 'Lernziel bearbeiten' : 'Neues Lernziel',
    narrow: true,
    body: `<form id="goal-form">
      ${errorBox()}
      <div class="field"><label for="goal-title">Lernziel <span class="required">*</span></label>
        <input class="input" id="goal-title" name="title" value="${esc(goal?.title ?? '')}" placeholder="z. B. Subnetting sicher beherrschen"></div>
      <div class="field"><label for="goal-subject">Fach</label>
        <select class="select" id="goal-subject" name="subject_id"><option value="">Kein Fach</option>${subjectOptions(state.subjects, goal?.subject_id ?? subjectId, { includeEmpty: false })}</select></div>
      <div class="field"><label for="goal-desc">Beschreibung</label>
        <textarea class="textarea" id="goal-desc" name="description" rows="2">${esc(goal?.description ?? '')}</textarea></div>
      <div class="form-row">
        <div class="field"><label for="goal-due">Bis wann?</label><input class="input" type="date" id="goal-due" name="due_date" value="${esc(goal?.due_date ?? '')}"></div>
        <div class="field"><label for="goal-status">Status</label>
          <select class="select" id="goal-status" name="status">
            <option value="offen"${(goal?.status ?? 'offen') === 'offen' ? ' selected' : ''}>Offen</option>
            <option value="erledigt"${(goal?.status ?? '') === 'erledigt' ? ' selected' : ''}>Erreicht</option>
          </select></div>
      </div>
    </form>`,
    actions: [
      { label: 'Abbrechen' },
      {
        label: 'Speichern',
        variant: 'primary',
        onClick: async (_close, dialog) => {
          const data = Object.fromEntries(new FormData(dialog.querySelector('#goal-form')));
          if (!data.title?.trim()) {
            showError(dialog, new Error('Bitte ein Lernziel angeben.'));
            return false;
          }
          try {
            const payload = { ...data, subject_id: data.subject_id || null, due_date: data.due_date || null };
            const saved = isEdit ? await api.patch(`/goals/${goal.id}`, payload) : await api.post('/goals', payload);
            toast('Lernziel gespeichert.', 'success');
            onSaved?.(saved);
          } catch (error) {
            showError(dialog, error);
            return false;
          }
        }
      }
    ]
  });
}

export { todayISO, $, $$ };
