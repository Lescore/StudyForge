import { api } from '../api.js';
import { state } from '../store.js';
import {
  esc,
  icon,
  toast,
  errorToast,
  typesetMath,
  subjectOptions,
  deckOptions,
  formatDate
} from '../ui.js';
import { renderMarkdown, renderCloze, plainText } from '../lib/markdown.js';

const TYPE_LABELS = {
  qa: 'Frage & Antwort',
  definition: 'Begriff & Definition',
  cloze: 'Lückentext',
  truefalse: 'Richtig oder falsch',
  mc: 'Multiple Choice',
  code: 'Code & Syntax'
};
const RATING_LABELS = { 1: 'Nicht gewusst', 2: 'Schwierig', 3: 'Gut', 4: 'Sicher' };

function scopeOptions(selected) {
  const options = [
    ['due', 'Fällig & neu', 'Alle Karten, die heute fällig oder noch neu sind.'],
    ['subject', 'Ein Fach', 'Alle Karten eines Fachs, fällige zuerst.'],
    ['deck', 'Ein Stapel', 'Gezielt einen Karteikartenstapel lernen.'],
    ['topic', 'Ein Thema', 'Nur Karten mit einem bestimmten Thema.'],
    ['hard', 'Schwierige Inhalte', 'Karten mit Fehlern oder hoher Schwierigkeit.'],
    ['goals', 'Offene Lernziele', 'Karten zu Themen, die noch nicht verstanden sind.'],
    ['mixed', 'Gemischt', 'Fällige und neue Karten aus allen Fächern.']
  ];
  return options
    .map(
      ([value, title, desc]) => `<div class="scope-option">
        <input type="radio" name="scope" id="scope-${value}" value="${value}"${selected === value ? ' checked' : ''}>
        <label for="scope-${value}"><span class="scope-title">${title}</span><span class="scope-desc">${desc}</span></label>
      </div>`
    )
    .join('');
}

export async function render(root, ctx) {
  const [decks, topics] = await Promise.all([api.get('/decks'), api.get('/topics')]);
  const selectedScope = ['due', 'subject', 'deck', 'topic', 'hard', 'goals', 'mixed'].includes(ctx.query.get('scope'))
    ? ctx.query.get('scope')
    : 'due';
  const selectedDeck = ctx.query.get('deck_id') || '';
  const selectedSubject = ctx.query.get('subject_id') || '';
  const selectedTopic = ctx.query.get('topic') || '';
  const autoStart = Boolean(ctx.query.get('deck_id') || ctx.query.get('subject_id') || ctx.query.get('autostart') === '1') && ctx.query.get('setup') !== '1';
  let timerId = null;
  let keyHandler = null;
  let sessionActive = false;

  const cleanup = () => {
    if (timerId) window.clearInterval(timerId);
    timerId = null;
    if (keyHandler) document.removeEventListener('keydown', keyHandler);
    keyHandler = null;
    sessionActive = false;
  };

  const config = () => ({
    scope: root.querySelector('input[name="scope"]:checked')?.value || 'due',
    subjectId: root.querySelector('#study-subject')?.value || '',
    deckId: root.querySelector('#study-deck')?.value || '',
    topic: root.querySelector('#study-topic')?.value.trim() || '',
    limit: Math.max(1, Math.min(200, Number(root.querySelector('#study-limit')?.value) || Number(state.settings.review_limit) || 20)),
    timerEnabled: Boolean(root.querySelector('#study-timer-enabled')?.checked),
    timerMinutes: Math.max(5, Math.min(120, Number(root.querySelector('#study-timer-minutes')?.value) || 25))
  });

  const showSetup = () => {
    cleanup();
    root.innerHTML = `<div class="study-setup">
      <div class="page-head">
        <div class="page-heading">
          <h1>Lernen</h1>
          <p class="page-sub">Eine ruhige Einheit ohne Ablenkung. Du entscheidest, wann eine Karte als verstanden gilt.</p>
        </div>
      </div>
      <div class="card">
        <div class="field"><span class="field-label">Was möchtest du lernen?</span>
          <div class="scope-grid" id="scope-grid">${scopeOptions(selectedScope)}</div>
        </div>
        <div class="form-row mt-2">
          <div class="field" id="subject-field"><label for="study-subject">Fach</label>
            <select class="select" id="study-subject">${subjectOptions(state.subjects, selectedSubject, { emptyLabel: 'Alle Fächer' })}</select></div>
          <div class="field" id="deck-field"><label for="study-deck">Stapel</label>
            <select class="select" id="study-deck">${deckOptions(decks, selectedDeck, { emptyLabel: 'Alle Stapel' })}</select></div>
          <div class="field" id="topic-field"><label for="study-topic">Thema</label>
            <input class="input" id="study-topic" list="study-topics" value="${esc(selectedTopic)}" placeholder="z. B. Subnetting">
            <datalist id="study-topics">${[...new Set(topics.map((topic) => topic.name))].map((name) => `<option value="${esc(name)}"></option>`).join('')}</datalist></div>
          <div class="field"><label for="study-limit">Karten pro Einheit</label>
            <input class="input" type="number" id="study-limit" min="1" max="200" value="${esc(state.settings.review_limit || '20')}"></div>
        </div>
        <div class="field">
          <label class="checkbox"><input type="checkbox" id="study-timer-enabled"${state.settings.timer_default === '1' ? ' checked' : ''}> Zeitlimit verwenden (optional)</label>
          <div class="row mt-1" id="timer-settings"${state.settings.timer_default === '1' ? '' : ' hidden'}>
            <input class="input" type="number" id="study-timer-minutes" min="5" max="120" value="${esc(state.settings.timer_minutes || '25')}" style="width:90px">
            <span class="small subtle">Minuten. Der Timer erzeugt keinen Druck – die Einheit endet einfach freundlich.</span>
          </div>
        </div>
        <div class="row-between mt-2">
          <span class="small subtle">Die Antwort wird erst auf deinen Wunsch aufgedeckt.</span>
          <button class="btn btn-primary btn-lg" id="start-study">${icon('play')} Lernen starten</button>
        </div>
      </div>
      <p class="small faint mt-2">Tastatur: <kbd>Leertaste</kbd> Antwort zeigen, <kbd>1</kbd>–<kbd>4</kbd> bewerten, <kbd>Esc</kbd> beenden. FSRS plant die nächste Wiederholung anhand deiner Bewertung.</p>
    </div>`;

    const syncFields = () => {
      const scope = root.querySelector('input[name="scope"]:checked')?.value;
      root.querySelector('#deck-field').hidden = scope !== 'deck';
      root.querySelector('#subject-field').hidden = !['subject', 'hard', 'mixed'].includes(scope);
      root.querySelector('#topic-field').hidden = scope !== 'topic';
    };
    root.querySelectorAll('input[name="scope"]').forEach((radio) => radio.addEventListener('change', syncFields));
    syncFields();
    root.querySelector('#study-timer-enabled').addEventListener('change', (event) => {
      root.querySelector('#timer-settings').hidden = !event.target.checked;
    });
    root.querySelector('#start-study').addEventListener('click', () => {
      const options = config();
      if (options.scope === 'deck' && !options.deckId) {
        toast('Bitte einen Stapel auswählen.', 'warning');
        return;
      }
      if (options.scope === 'subject' && !options.subjectId) {
        toast('Bitte ein Fach auswählen.', 'warning');
        return;
      }
      if (options.scope === 'topic' && !options.topic) {
        toast('Bitte ein Thema angeben.', 'warning');
        return;
      }
      startSession(options, { newSession: true });
    });

    if (autoStart) {
      const options = config();
      if (options.scope === 'deck' && !options.deckId) return;
      if (options.scope === 'subject' && !options.subjectId) return;
      startSession(options, { newSession: true });
    }
  };

  const lastConfig = { value: null };

  async function startSession(options, { newSession = false } = {}) {
    cleanup();
    const params = new URLSearchParams({ scope: options.scope, limit: String(options.limit) });
    if (options.subjectId) params.set('subject_id', options.subjectId);
    if (options.deckId) params.set('deck_id', options.deckId);
    if (options.topic) params.set('topic', options.topic);
    let queue;
    try {
      queue = await api.get(`/study/queue?${params.toString()}`);
    } catch (error) {
      errorToast(error);
      return;
    }
    lastConfig.value = options;
    if (!queue.cards.length) {
      root.innerHTML = `<div class="study-empty">
        <div class="card">
          <div class="empty" style="border:0;background:none">
            ${icon('check')}
            <h3>Nichts zu lernen in dieser Auswahl</h3>
            <p>${queue.totalAvailable === 0 ? 'Hier sind aktuell keine Karten fällig. Neue Karten kannst du jederzeit im Kartenbereich anlegen.' : 'Es konnten keine Karten geladen werden.'}</p>
            <div class="row" style="justify-content:center">
              <button class="btn" id="back-setup">Andere Auswahl</button>
              <a class="btn" href="#/karten">Zu den Karten</a>
            </div>
          </div>
        </div>
      </div>`;
      root.querySelector('#back-setup').addEventListener('click', showSetup);
      return;
    }

    const cards = queue.cards;
    const answers = [];
    let index = 0;
    let revealed = false;
    let selectedOption = null;
    let cardStartedAt = Date.now();
    let sessionStartedAt = Date.now();
    let finished = false;
    let remainingSeconds = options.timerEnabled ? options.timerMinutes * 60 : null;
    sessionActive = true;

    const shell = () => {
      root.innerHTML = `<div class="study-shell">
        <div class="study-top">
          <button class="btn btn-sm" id="exit-study">${icon('arrow-left')} Beenden</button>
          <div class="study-progress">
            <div class="progress-label"><span id="study-position">Karte 1 von ${cards.length}</span><span id="study-percent">0 %</span></div>
            <div class="progress"><span id="study-bar" style="width:0%"></span></div>
          </div>
          <span class="study-timer" id="study-timer"${remainingSeconds === null ? ' hidden' : ''}>${icon('clock')} <span id="study-timer-text">${formatSeconds(remainingSeconds ?? 0)}</span></span>
        </div>
        <div id="study-card-area"></div>
        <div class="rating-hint" id="study-hint">Leertaste zum Aufdecken · 1–4 zum Bewerten · Esc zum Beenden</div>
      </div>`;
      root.querySelector('#exit-study').addEventListener('click', () => endSession(true));
    };

    const updateProgress = () => {
      const position = root.querySelector('#study-position');
      if (!position) return;
      position.textContent = `Karte ${Math.min(index + 1, cards.length)} von ${cards.length}`;
      const percent = Math.round((index / cards.length) * 100);
      root.querySelector('#study-percent').textContent = `${percent} %`;
      root.querySelector('#study-bar').style.width = `${percent}%`;
    };

    const renderCard = () => {
      const card = cards[index];
      const area = root.querySelector('#study-card-area');
      if (!area) return;
      revealed = false;
      selectedOption = null;
      cardStartedAt = Date.now();
      updateProgress();
      area.innerHTML = `<article class="flashcard" aria-live="polite">
        <div class="card-meta">
          <span class="badge badge-accent">${esc(TYPE_LABELS[card.type] || card.type)}</span>
          ${card.deck_name ? `<span class="badge">${esc(card.deck_name)}</span>` : ''}
          ${card.subject_name ? `<span class="badge">${esc(card.subject_name)}</span>` : ''}
          ${card.topic ? `<span class="badge">${esc(card.topic)}</span>` : ''}
          ${card.memory ? `<span class="badge" title="Geschätzte Erinnerungswahrscheinlichkeit">Erinnerung ≈ ${card.memory.retrievability} %</span>` : ''}
        </div>
        <div class="flashcard-front" id="question-area">${questionHtml(card)}</div>
        <div id="answer-area"></div>
        <div id="study-actions"></div>
      </article>`;
      typesetMath(area);
      bindQuestion(card);
      renderActions(card);
    };

    const questionHtml = (card) => {
      if (card.type === 'cloze') return `<div class="markdown">${renderCloze(card.front, false)}</div>`;
      if (card.type === 'mc' || card.type === 'truefalse') {
        const options = card.options?.length ? card.options : ['Richtig', 'Falsch'];
        return `<div class="markdown">${renderMarkdown(card.front)}</div>
          <div class="mc-options" role="group" aria-label="Antwortmöglichkeiten">
            ${options.map((option, i) => `<button class="mc-option" data-option="${i}"><span class="mc-letter">${String.fromCharCode(65 + i)}</span><span>${esc(option)}</span></button>`).join('')}
          </div>`;
      }
      return `<div class="markdown">${renderMarkdown(card.front)}</div>`;
    };

    const bindQuestion = (card) => {
      root.querySelectorAll('[data-option]').forEach((button) => {
        button.addEventListener('click', () => {
          if (revealed) return;
          selectedOption = Number(button.dataset.option);
          root.querySelectorAll('[data-option]').forEach((other) => {
            other.classList.toggle('selected', other === button);
            other.style.borderColor = other === button ? 'var(--accent)' : '';
          });
          const actions = root.querySelector('#study-actions');
          if (actions && !actions.querySelector('[data-reveal]')) renderActions(card);
        });
      });
    };

    const renderActions = (card) => {
      const actions = root.querySelector('#study-actions');
      if (!actions) return;
      if (!revealed) {
        actions.innerHTML = `<button class="btn btn-primary btn-lg" data-reveal>Antwort zeigen</button>`;
        actions.querySelector('[data-reveal]').addEventListener('click', () => reveal(card));
      } else {
        actions.innerHTML = `<div class="stack">
          <div class="rating-grid" role="group" aria-label="Wie gut wusstest du es?">
            ${[1, 2, 3, 4]
              .map((rating) => {
                const preview = card.preview?.find((item) => item.rating === rating);
                return `<button class="rating-btn" data-rating="${rating}">
                  <span class="rating-label">${RATING_LABELS[rating]}</span>
                  <span class="rating-interval">${esc(preview?.intervalLabel || '')}</span>
                </button>`;
              })
              .join('')}
          </div>
          <div class="rating-hint">Die Zeitangabe ist die geplante nächste Wiederholung.</div>
        </div>`;
        actions.querySelectorAll('[data-rating]').forEach((button) => {
          button.addEventListener('click', () => rate(card, Number(button.dataset.rating)));
        });
      }
    };

    const reveal = (card) => {
      if (revealed) return;
      if ((card.type === 'mc' || card.type === 'truefalse') && selectedOption === null) {
        toast('Wähle zuerst eine Antwort – oder decke direkt auf.', 'warning');
      }
      revealed = true;
      const answer = root.querySelector('#answer-area');
      const options = card.options?.length ? card.options : ['Richtig', 'Falsch'];
      if (card.type === 'mc' || card.type === 'truefalse') {
        root.querySelectorAll('[data-option]').forEach((button) => {
          const value = Number(button.dataset.option);
          button.classList.toggle('correct', value === card.correct_index);
          button.classList.toggle('wrong', value === selectedOption && value !== card.correct_index);
          button.disabled = true;
        });
        answer.innerHTML = `<div class="flashcard-answer">
          <div class="small ${selectedOption === card.correct_index ? '' : 'subtle'}">
            ${selectedOption === null ? 'Keine Antwort ausgewählt.' : selectedOption === card.correct_index ? `${icon('check')} Richtig ausgewählt.` : `Richtige Antwort: <strong>${esc(options[card.correct_index] ?? '–')}</strong>`}
          </div>
          <div class="markdown mt-1">${renderMarkdown(card.back)}</div>
          ${card.explanation ? `<div class="markdown mt-1"><small class="subtle">${renderMarkdown(card.explanation)}</small></div>` : ''}
        </div>`;
      } else {
        answer.innerHTML = `<div class="flashcard-answer">
          ${card.type === 'cloze' ? `<div class="markdown small subtle mb-1">Vollständiger Text:</div><div class="markdown">${renderCloze(card.front, true)}</div>` : ''}
          <div class="markdown">${renderMarkdown(card.back)}</div>
          ${card.explanation ? `<div class="markdown mt-1"><small class="subtle">${renderMarkdown(card.explanation)}</small></div>` : ''}
        </div>`;
      }
      typesetMath(answer);
      renderActions(card);
    };

    const rate = async (card, rating) => {
      const buttons = root.querySelectorAll('[data-rating]');
      buttons.forEach((button) => (button.disabled = true));
      try {
        const result = await api.post(`/cards/${card.id}/review`, {
          rating,
          duration_ms: Date.now() - cardStartedAt
        });
        answers.push({
          card,
          rating,
          next: result.review,
          correct: (card.type === 'mc' || card.type === 'truefalse') && selectedOption !== null ? selectedOption === card.correct_index : null
        });
        index += 1;
        if (index >= cards.length) endSession(false);
        else renderCard();
      } catch (error) {
        errorToast(error);
        buttons.forEach((button) => (button.disabled = false));
      }
    };

    const endSession = (aborted) => {
      if (finished) return;
      finished = true;
      sessionActive = false;
      cleanup();
      renderSummary(answers, cards.length, aborted, Date.now() - sessionStartedAt, options);
    };

    const formatSeconds = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

    const startTimer = () => {
      if (remainingSeconds === null) return;
      timerId = window.setInterval(() => {
        remainingSeconds -= 1;
        const timerEl = root.querySelector('#study-timer-text');
        const timerBox = root.querySelector('#study-timer');
        if (!timerEl) return;
        timerEl.textContent = formatSeconds(Math.max(0, remainingSeconds));
        if (remainingSeconds <= 60) timerBox?.classList.add('low');
        if (remainingSeconds <= 0) {
          window.clearInterval(timerId);
          timerId = null;
          if (!finished) {
            toast('Zeitlimit erreicht. Kein Problem – schauen wir uns den Stand an.', 'info', 5000);
            endSession(true);
          }
        }
      }, 1000);
    };

    keyHandler = (event) => {
      if (!sessionActive) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        endSession(true);
      } else if (event.code === 'Space' && !revealed) {
        const tag = document.activeElement?.tagName;
        if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA') return;
        event.preventDefault();
        reveal(cards[index]);
      } else if (['1', '2', '3', '4'].includes(event.key) && revealed) {
        const card = cards[index];
        if (card) rate(card, Number(event.key));
      } else if (event.code === 'Space' && revealed) {
        event.preventDefault();
      }
    };
    document.addEventListener('keydown', keyHandler);

    shell();
    startTimer();
    renderCard();
    void newSession;
  }

  const renderSummary = (answers, totalCards, aborted, durationMs, options) => {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    answers.forEach((answer) => {
      counts[answer.rating] += 1;
    });
    const difficult = answers.filter((answer) => answer.rating <= 2);
    const nextDue = answers
      .map((answer) => answer.next?.next_due)
      .filter(Boolean)
      .sort()[0];
    const topics = [...new Set(difficult.map((answer) => answer.card.topic).filter(Boolean))];
    const seconds = Math.max(1, Math.round(durationMs / 1000));
    const minutes = Math.floor(seconds / 60);

    root.innerHTML = `<div class="study-summary">
      <div class="card">
        <div class="summary-hero">
          <div class="small subtle">${aborted ? 'Einheit beendet' : 'Einheit abgeschlossen'}</div>
          <div class="summary-number">${answers.length}</div>
          <div class="small subtle">${answers.length === 1 ? 'Karte bearbeitet' : 'Karten bearbeitet'} · ${minutes > 0 ? `${minutes} Min. ` : ''}${seconds % 60} Sek.</div>
          ${answers.length === 0 ? '<p class="mt-2 subtle">Du hast noch keine Karte bewertet. Beim nächsten Mal einfach starten, wenn es passt.</p>' : ''}
        </div>
        ${answers.length
          ? `<div class="grid grid-2">
              <div>
                <h3 style="font-size:.95rem">Bewertungen</h3>
                <div class="stack">
                  ${[4, 3, 2, 1].map((rating) => `<div class="summary-list-item"><span>${RATING_LABELS[rating]}</span><strong>${counts[rating]}</strong></div>`).join('')}
                </div>
              </div>
              <div>
                <h3 style="font-size:.95rem">Nächster Schritt</h3>
                <p class="small subtle">${
                  difficult.length
                    ? `Diese ${difficult.length === 1 ? 'Karte' : 'Karten'} sitzen noch nicht. Schaue dir die Erklärung an und plane eine kurze Wiederholung – lieber wenige Karten gründlich als viele oberflächlich.`
                    : answers.length
                      ? 'Starker Durchlauf. Die Karten kommen automatisch zum passenden Zeitpunkt wieder. Du musst nichts zusätzlich tun.'
                      : 'Starte eine neue Einheit, wenn du bereit bist.'
                }</p>
                ${topics.length ? `<p class="small subtle">Themen zum Nachlesen: ${topics.map((topic) => esc(topic)).join(', ')}.</p>` : ''}
                ${nextDue ? `<p class="small subtle">Nächste fällige Karte: ${esc(formatDate(nextDue))}.</p>` : ''}
              </div>
            </div>`
          : ''}
        ${difficult.length
          ? `<div class="divider"></div><h3 style="font-size:.95rem">Noch einmal ansehen</h3>
            <div class="summary-list">${difficult
              .map((answer) => `<div class="summary-list-item"><span>${esc(plainText(answer.card.front, 120))}</span><span class="badge">${RATING_LABELS[answer.rating]}</span></div>`)
              .join('')}</div>`
          : ''}
        <div class="row mt-3" style="justify-content:center;flex-wrap:wrap">
          <button class="btn btn-primary" id="study-again">${icon('play')} Noch eine Runde</button>
          <a class="btn" href="#/karten">Karten ansehen</a>
          <a class="btn" href="#/">Zum Dashboard</a>
          <button class="btn" id="study-new-setup">Andere Auswahl</button>
        </div>
        ${options.timerEnabled ? '<p class="small faint center mt-2">Zeitlimit war aktiv – beendet wurde trotzdem ohne Strafpunkte.</p>' : ''}
      </div>
    </div>`;
    root.querySelector('#study-again').addEventListener('click', () => startSession(options, { newSession: true }));
    root.querySelector('#study-new-setup').addEventListener('click', showSetup);
    void totalCards;
  };

  showSetup();
  return cleanup;
}

