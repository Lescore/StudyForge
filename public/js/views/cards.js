import { api, downloadFromApi } from '../api.js';
import { state } from '../store.js';
import {
  esc,
  icon,
  toast,
  errorToast,
  confirmDialog,
  openModal,
  deckOptions,
  subjectOptions,
  formatDate,
  debounce,
  emptyState,
  relativeTime
} from '../ui.js';
import { openCardDialog, openDeckDialog } from './dialogs.js';

const TYPE_LABELS = {
  qa: 'Frage/Antwort',
  definition: 'Definition',
  cloze: 'Lückentext',
  truefalse: 'Richtig/Falsch',
  mc: 'Multiple Choice',
  code: 'Code'
};

function plain(value, max = 110) {
  const text = String(value ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~\[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function deckCard(deck) {
  return `<div class="deck-card">
    <div class="deck-top">
      <div style="min-width:0">
        <div class="deck-name">${esc(deck.name)}</div>
        <div class="deck-sub">${esc(deck.subject_name || 'Ohne Fach')}</div>
      </div>
      <div class="deck-actions">
        <button class="icon-btn" data-edit-deck="${deck.id}" aria-label="Stapel bearbeiten" title="Bearbeiten">${icon('edit')}</button>
        <button class="icon-btn" data-export-deck="${deck.id}" aria-label="Stapel exportieren" title="Exportieren">${icon('download')}</button>
        <button class="icon-btn danger" data-delete-deck="${deck.id}" data-name="${esc(deck.name)}" aria-label="Stapel löschen" title="Löschen">${icon('trash')}</button>
      </div>
    </div>
    <div class="row small">
      ${deck.due_count > 0 ? `<span class="badge badge-warning">${deck.due_count} fällig</span>` : '<span class="badge badge-success">nichts fällig</span>'}
      <span class="badge">${deck.card_count} ${deck.card_count === 1 ? 'Karte' : 'Karten'}</span>
      ${deck.new_count > 0 ? `<span class="badge badge-info">${deck.new_count} neu</span>` : ''}
      ${deck.suspended_count > 0 ? `<span class="badge">${deck.suspended_count} ausgesetzt</span>` : ''}
    </div>
    <div>
      <div class="progress-label"><span>Fortschritt</span><span>${deck.progress}%</span></div>
      <div class="progress" role="progressbar" aria-valuenow="${deck.progress}" aria-valuemin="0" aria-valuemax="100"><span style="width:${deck.progress}%"></span></div>
    </div>
    <div class="deck-foot">
      <a class="btn btn-sm btn-primary" href="#/lernen?scope=deck&deck_id=${deck.id}">${icon('play')} Lernen</a>
      <a class="btn btn-sm" href="#/karten?deck=${deck.id}">Karten ansehen</a>
    </div>
  </div>`;
}

function cardRow(card) {
  const due = card.reps === 0 ? 'neu' : card.due ? formatDate(card.due, { short: true }) : '–';
  return `<tr data-card-row="${card.id}">
    <td><div class="cell-main card-question">${esc(plain(card.front))}</div>
      <div class="tiny subtle">${esc(plain(card.back, 80))}</div></td>
    <td><span class="badge">${esc(TYPE_LABELS[card.type] || card.type)}</span></td>
    <td>${esc(card.deck_name || 'Kein Stapel')}</td>
    <td>${esc(card.topic || '–')}</td>
    <td class="nowrap">${card.suspended ? '<span class="badge">ausgesetzt</span>' : card.reps === 0 ? '<span class="badge badge-info">neu</span>' : `<span class="${card.hard ? 'badge badge-warning' : 'badge'}">${esc(due)}</span>`}</td>
    <td class="nowrap">${card.reps}×${card.lapses ? ` · ${card.lapses} Fehler` : ''}</td>
    <td class="actions">
      <button class="icon-btn" data-edit-card="${card.id}" aria-label="Karte bearbeiten" title="Bearbeiten">${icon('edit')}</button>
      <button class="icon-btn" data-history-card="${card.id}" aria-label="Verlauf anzeigen" title="Verlauf">${icon('clock')}</button>
      <button class="icon-btn" data-reset-card="${card.id}" aria-label="Karte zurücksetzen" title="Zurücksetzen">${icon('arrow-left')}</button>
      <button class="icon-btn ${card.suspended ? 'active' : ''}" data-suspend-card="${card.id}" aria-label="Karte aussetzen" title="${card.suspended ? 'Wieder aktivieren' : 'Aussetzen'}">${icon('offline')}</button>
      <button class="icon-btn danger" data-delete-card="${card.id}" aria-label="Karte löschen" title="Löschen">${icon('trash')}</button>
    </td>
  </tr>`;
}

export async function render(root, ctx) {
  const decks = await api.get('/decks');
  const initialDeck = ctx.query.get('deck') || '';
  const initialSearch = ctx.query.get('q') || '';
  const subjectFilter = ctx.query.get('subject_id') || '';
  const typeFilter = ctx.query.get('type') || '';

  const fetchCards = async (q = initialSearch, deckId = initialDeck, subjectId = subjectFilter) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (deckId) params.set('deck_id', deckId);
    if (subjectId) params.set('subject_id', subjectId);
    params.set('limit', '1000');
    return api.get(`/cards?${params.toString()}`);
  };
  const data = await fetchCards();
  let cards = data.cards;

  root.innerHTML = `
    <div class="page-head">
      <div class="page-heading">
        <h1>Karteikarten</h1>
        <p class="page-sub">Verteiltes Wiederholen mit FSRS – damit Wissen langfristig bleibt.</p>
      </div>
      <div class="page-actions">
        <button class="btn" id="import-cards">${icon('upload')} Karten importieren</button>
        <button class="btn" id="export-cards">${icon('download')} Exportieren</button>
        <button class="btn" id="new-deck">${icon('plus')} Stapel</button>
        <button class="btn btn-primary" id="new-card">${icon('plus')} Karte</button>
      </div>
    </div>

    <section class="mb-2">
      <div class="row-between mb-2">
        <h2 style="margin:0">Stapel</h2>
        <span class="small subtle">${decks.length} ${decks.length === 1 ? 'Stapel' : 'Stapel'}</span>
      </div>
      <div id="deck-container">
        ${decks.length
          ? `<div class="deck-grid">${decks.map(deckCard).join('')}</div>`
          : emptyState('Noch keine Stapel', 'Lege einen Stapel an, um Karteikarten nach Thema zu ordnen. Karten kannst du auch direkt aus einer Notiz erstellen.', '<button class="btn btn-primary" data-create-deck>Ersten Stapel anlegen</button>')}
      </div>
    </section>

    <section class="card flush">
      <div class="toolbar" style="padding:1rem 1rem 0;margin-bottom:.5rem">
        <div class="search-field">${icon('search')}
          <input class="input" id="card-search" type="search" placeholder="Karten durchsuchen …" value="${esc(initialSearch)}">
        </div>
        <select class="select" id="filter-deck" aria-label="Stapel filtern">
          <option value="">Alle Stapel</option>
          ${deckOptions(decks, initialDeck, { includeEmpty: false })}
        </select>
        <select class="select" id="filter-subject" aria-label="Fach filtern">
          <option value="">Alle Fächer</option>
          ${subjectOptions(state.subjects, subjectFilter, { includeEmpty: false })}
        </select>
        <select class="select" id="filter-type" aria-label="Typ filtern">
          <option value="">Alle Typen</option>
          ${Object.entries(TYPE_LABELS).map(([value, label]) => `<option value="${value}"${typeFilter === value ? ' selected' : ''}>${label}</option>`).join('')}
        </select>
        <span class="small faint" id="card-count"></span>
      </div>
      <div id="card-results"></div>
    </section>`;

  const results = root.querySelector('#card-results');
  const countEl = root.querySelector('#card-count');

  const applyTypeFilter = (list) => (typeFilter ? list.filter((card) => card.type === typeFilter) : list);

  const renderResults = () => {
    const visible = applyTypeFilter(cards);
    countEl.textContent = `${visible.length} ${visible.length === 1 ? 'Karte' : 'Karten'}${data.total > cards.length ? ` von ${data.total}` : ''}`;
    results.innerHTML = visible.length
      ? `<div class="table-wrap" style="border-left:0;border-right:0;border-bottom:0;border-radius:0">
          <table class="data">
            <thead><tr><th>Karte</th><th>Typ</th><th>Stapel</th><th>Thema</th><th>Fällig</th><th>Wiederholungen</th><th aria-label="Aktionen"></th></tr></thead>
            <tbody>${visible.map(cardRow).join('')}</tbody>
          </table>
        </div>`
      : emptyState('Keine Karten gefunden', 'Passe Suche oder Filter an oder erstelle eine neue Karte.', '<button class="btn btn-primary" data-create-card>Karte anlegen</button>');
    wireRows();
  };

  const reloadCards = async () => {
    const fresh = await fetchCards(root.querySelector('#card-search').value, root.querySelector('#filter-deck').value, root.querySelector('#filter-subject').value);
    cards = fresh.cards;
    renderResults();
  };

  const setQuery = (overrides = {}) => {
    const params = new URLSearchParams();
    const values = {
      deck: root.querySelector('#filter-deck').value,
      q: root.querySelector('#card-search').value,
      subject_id: root.querySelector('#filter-subject').value,
      type: root.querySelector('#filter-type').value,
      ...overrides
    };
    for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
    history.replaceState(null, '', `#/karten${params.toString() ? `?${params.toString()}` : ''}`);
  };

  const wireRows = () => {
    results.querySelectorAll('[data-edit-card]').forEach((button) => {
      button.addEventListener('click', async () => {
        const card = cards.find((item) => item.id === Number(button.dataset.editCard));
        if (card) openCardDialog(card, { onSaved: reloadCards });
      });
    });
    results.querySelectorAll('[data-history-card]').forEach((button) => {
      button.addEventListener('click', () => openHistory(Number(button.dataset.historyCard)));
    });
    results.querySelectorAll('[data-reset-card]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: 'Karte zurücksetzen?', message: 'Der Wiederholungsplan wird auf „neu“ gesetzt. Die Lernhistorie bleibt erhalten.', confirmLabel: 'Zurücksetzen' }))) return;
        try {
          await api.post(`/cards/${button.dataset.resetCard}/reset`, {});
          toast('Karte zurückgesetzt.', 'success');
          await reloadCards();
        } catch (error) {
          errorToast(error);
        }
      });
    });
    results.querySelectorAll('[data-suspend-card]').forEach((button) => {
      button.addEventListener('click', async () => {
        const card = cards.find((item) => item.id === Number(button.dataset.suspendCard));
        try {
          await api.patch(`/cards/${card.id}`, { suspended: !card.suspended });
          toast(card.suspended ? 'Karte wieder aktiviert.' : 'Karte ausgesetzt.', 'success');
          await reloadCards();
        } catch (error) {
          errorToast(error);
        }
      });
    });
    results.querySelectorAll('[data-delete-card]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: 'Karte löschen?', message: 'Die Karte und ihre Wiederholungshistorie werden dauerhaft gelöscht.', confirmLabel: 'Karte löschen', danger: true }))) return;
        try {
          await api.delete(`/cards/${button.dataset.deleteCard}`);
          toast('Karte gelöscht.', 'success');
          await reloadCards();
        } catch (error) {
          errorToast(error);
        }
      });
    });
    results.querySelectorAll('[data-create-card]').forEach((button) => {
      button.addEventListener('click', () => openNewCard());
    });
  };

  renderResults();

  const openNewCard = () =>
    openCardDialog(null, {
      deckId: root.querySelector('#filter-deck').value || null,
      onSaved: async () => {
        await reloadCards();
        const freshDecks = await api.get('/decks');
        updateDeckSection(freshDecks);
      }
    });

  const updateDeckSection = (freshDecks) => {
    const container = root.querySelector('#deck-container');
    if (container) {
      container.innerHTML = freshDecks.length
        ? `<div class="deck-grid">${freshDecks.map(deckCard).join('')}</div>`
        : emptyState('Noch keine Stapel', 'Lege einen Stapel an, um Karteikarten nach Thema zu ordnen.', '<button class="btn btn-primary" data-create-deck>Ersten Stapel anlegen</button>');
    }
    wireDeckActions(freshDecks);
    refreshDeckFilter(freshDecks);
    container?.querySelectorAll('[data-create-deck]').forEach((button) => {
      button.addEventListener('click', async () => updateDeckSection(await api.get('/decks')));
    });
  };

  const refreshDeckFilter = (freshDecks) => {
    const select = root.querySelector('#filter-deck');
    const value = select.value;
    select.innerHTML = `<option value="">Alle Stapel</option>${deckOptions(freshDecks, value, { includeEmpty: false })}`;
  };

  const wireDeckActions = (currentDecks) => {
    root.querySelectorAll('[data-edit-deck]').forEach((button) => {
      button.addEventListener('click', () => {
        const deck = currentDecks.find((item) => item.id === Number(button.dataset.editDeck));
        if (deck) openDeckDialog(deck, async () => updateDeckSection(await api.get('/decks')));
      });
    });
    root.querySelectorAll('[data-delete-deck]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: 'Stapel löschen?', message: `„${button.dataset.name}“ wird gelöscht. Die enthaltenen Karten bleiben erhalten und sind danach keinem Stapel zugeordnet.`, confirmLabel: 'Stapel löschen', danger: true }))) return;
        try {
          await api.delete(`/decks/${button.dataset.deleteDeck}`);
          toast('Stapel gelöscht. Karten bleiben erhalten.', 'success');
          updateDeckSection(await api.get('/decks'));
          await reloadCards();
        } catch (error) {
          errorToast(error);
        }
      });
    });
    root.querySelectorAll('[data-export-deck]').forEach((button) => {
      button.addEventListener('click', () => downloadFromApi(`/export/cards?deck_id=${button.dataset.exportDeck}`));
    });
  };
  wireDeckActions(decks);

  root.querySelector('#new-card').addEventListener('click', openNewCard);
  root.querySelector('#new-deck').addEventListener('click', () => openDeckDialog(null, async () => updateDeckSection(await api.get('/decks'))));
  root.querySelector('[data-create-deck]')?.addEventListener('click', () => openDeckDialog(null, async () => updateDeckSection(await api.get('/decks'))));
  root.querySelector('#export-cards').addEventListener('click', () => {
    const deckId = root.querySelector('#filter-deck').value;
    downloadFromApi(`/export/cards${deckId ? `?deck_id=${deckId}` : ''}`);
  });

  root.querySelector('#card-search').addEventListener(
    'input',
    debounce(async (event) => {
      setQuery({ q: event.target.value });
      try {
        await reloadCards();
      } catch (error) {
        errorToast(error);
      }
    }, 250)
  );
  ['#filter-deck', '#filter-subject', '#filter-type'].forEach((selector) => {
    root.querySelector(selector).addEventListener('change', async (event) => {
      const overrides = {};
      if (selector === '#filter-deck') overrides.deck = event.target.value;
      if (selector === '#filter-subject') overrides.subject_id = event.target.value;
      if (selector === '#filter-type') overrides.type = event.target.value;
      setQuery(overrides);
      try {
        if (selector === '#filter-type') {
          renderResults();
        } else {
          await reloadCards();
          renderResults();
        }
      } catch (error) {
        errorToast(error);
      }
    });
  });

  root.querySelector('#import-cards').addEventListener('click', () => openImport(decks, reloadCards));

  if (ctx.query.get('neu') === '1') {
    history.replaceState(null, '', `#/karten${ctx.query.get('q') ? `?q=${encodeURIComponent(ctx.query.get('q'))}` : ''}`);
    openNewCard();
  }
}

async function openHistory(cardId) {
  try {
    const [history, card] = await Promise.all([api.get(`/cards/${cardId}/history`), api.get(`/cards/${cardId}`)]);
    openModal({
      title: 'Wiederholungsverlauf',
      subtitle: plain(card.front, 140),
      wide: true,
      body: history.length
        ? `<div class="table-wrap"><table class="data"><thead><tr><th>Zeitpunkt</th><th>Bewertung</th><th>Intervall</th><th>Stabilität</th><th>Schwierigkeit</th></tr></thead><tbody>
            ${history
              .map((review) => `<tr>
                <td>${esc(formatDate(review.reviewed_at, { withTime: true }))}</td>
                <td>${esc(review.rating_label)}</td>
                <td>${review.scheduled_days < 1 ? `${Math.round(review.scheduled_days * 24 * 60)} Min` : `${Math.round(review.scheduled_days)} Tage`}</td>
                <td>${Number(review.new_stability).toFixed(2)}</td>
                <td>${Number(review.new_difficulty).toFixed(2)}</td>
              </tr>`)
              .join('')}</tbody></table></div>
            <p class="hint mt-2">FSRS berechnet aus deinen Bewertungen eine individuelle Vergessenskurve. „Stabilität“ ist die Zeit, in der die Erinnerung auf 90 % sinkt.</p>`
        : '<p class="subtle">Diese Karte wurde noch nicht wiederholt.</p>',
      actions: [{ label: 'Schließen' }]
    });
  } catch (error) {
    errorToast(error);
  }
}

function openImport(decks, onDone) {
  const { body } = openModal({
    title: 'Karten importieren',
    subtitle: 'JSON-Datei im StudyForge-Kartenformat.',
    body: `<div class="field"><label for="import-deck">Ziel-Stapel</label>
        ${decks.length
          ? `<select class="select" id="import-deck">${deckOptions(decks, decks[0]?.id, { includeEmpty: false })}</select>`
          : `<input class="input" id="import-deck-new" placeholder="Name für neuen Stapel" value="Import">`}
      </div>
      <div class="field"><label for="import-file">Kartendatei (.json)</label>
        <input class="input" type="file" id="import-file" accept="application/json,.json"></div>
      <div class="form-error" data-error hidden></div>
      <p class="hint">Der Import fügt Karten hinzu und setzt ihren Planungsstand auf „neu“. Vorhandene Karten werden nicht verändert.</p>`,
    actions: [
      { label: 'Abbrechen' },
      {
        label: 'Importieren',
        variant: 'primary',
        onClick: async (_close, dialog) => {
          const file = dialog.querySelector('#import-file').files[0];
          const errorBox = dialog.querySelector('[data-error]');
          if (!file) {
            errorBox.textContent = 'Bitte eine Datei auswählen.';
            errorBox.hidden = false;
            return false;
          }
          try {
            let deckId = dialog.querySelector('#import-deck')?.value;
            const newName = dialog.querySelector('#import-deck-new')?.value?.trim();
            if (!deckId && newName) {
              const deck = await api.post('/decks', { name: newName, subject_id: state.settings.last_subject_id || null });
              deckId = deck.id;
            }
            if (!deckId) {
              errorBox.textContent = 'Bitte einen Ziel-Stapel auswählen.';
              errorBox.hidden = false;
              return false;
            }
            const text = await file.text();
            const result = await api.raw(`/import/cards?deck_id=${deckId}`, { method: 'POST', body: text, headers: { 'Content-Type': 'application/json' } });
            toast(`${result.imported} Karten importiert${result.skipped ? `, ${result.skipped} übersprungen` : ''}.`, 'success');
            if (result.errors?.length) toast(result.errors[0], 'warning', 7000);
            window.location.reload();
            void onDone;
          } catch (error) {
            errorBox.textContent = error.message;
            errorBox.hidden = false;
            return false;
          }
        }
      }
    ]
  });
  void body;
}

void relativeTime;
