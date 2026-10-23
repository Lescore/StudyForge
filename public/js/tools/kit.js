/**
 * Gemeinsame Bausteine für die Informatik-Werkzeuge.
 *
 * Alle Funktionen, die HTML liefern, escapen Text selbst. Wo ausdrücklich
 * `{ html }` übergeben wird, muss der Aufrufer bereits escapt haben.
 */
import { esc, icon, toast } from '../ui.js';

export { esc, icon, toast };

const attr = (value) => esc(String(value ?? ''));

/**
 * Eingabefeld. `options` (Array von [value, label] oder Gruppen
 * { group, options }) macht daraus ein Select, `rows` ein Textarea.
 */
export function field({ id, label, value = '', type = 'text', hint = '', attrs = '', mono = false, options = null, rows = 0, wide = false }) {
  const cls = `${options ? 'select' : rows ? 'textarea' : 'input'}${mono ? ' mono' : ''}`;
  let control;
  if (options) {
    const opt = ([v, l]) => `<option value="${attr(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`;
    control = `<select class="${cls}" id="${attr(id)}" name="${attr(id)}" ${attrs}>${options
      .map((o) => (Array.isArray(o) ? opt(o) : `<optgroup label="${attr(o.group)}">${o.options.map(opt).join('')}</optgroup>`))
      .join('')}</select>`;
  } else if (rows) {
    control = `<textarea class="${cls}" id="${attr(id)}" name="${attr(id)}" rows="${rows}" spellcheck="false" ${attrs}>${esc(value)}</textarea>`;
  } else {
    control = `<input class="${cls}" id="${attr(id)}" name="${attr(id)}" type="${attr(type)}" value="${attr(value)}" autocomplete="off" spellcheck="false" ${attrs}>`;
  }
  return `<div class="field${wide ? ' field-wide' : ''}"><label for="${attr(id)}">${esc(label)}</label>${control}${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</div>`;
}

export function checkbox({ id, label, checked = false, attrs = '' }) {
  return `<label class="checkbox"><input type="checkbox" id="${attr(id)}" name="${attr(id)}"${checked ? ' checked' : ''} ${attrs}> ${esc(label)}</label>`;
}

/** Auswahl als Segmentschalter (Radio-Gruppe), tastaturbedienbar. */
export function segmented({ name, label, value, options }) {
  return `<fieldset class="tool-seg"><legend>${esc(label)}</legend><div class="radio-group">${options
    .map(([v, l]) => `<label class="radio-option"><input type="radio" name="${attr(name)}" value="${attr(v)}"${String(v) === String(value) ? ' checked' : ''}> ${esc(l)}</label>`)
    .join('')}</div></fieldset>`;
}

/**
 * Ergebnisliste. rows: [{ label, value, copy = true, mono = true, html = false, strong = false }]
 * `value` ist Text (wird escapt) oder bei html:true fertiges HTML.
 */
export function resultList(rows) {
  return `<dl class="tool-result">${rows
    .filter(Boolean)
    .map((row) => {
      const shown = row.html ? row.value : esc(row.value);
      const copyText = row.copyText ?? (row.html ? '' : row.value);
      return `<dt>${esc(row.label)}</dt><dd class="${row.mono === false ? '' : 'mono'}${row.strong ? ' strong' : ''}"><span class="tool-value">${shown}</span>${row.copy === false || !copyText ? '' : copyButton(copyText)}</dd>`;
    })
    .join('')}</dl>`;
}

export function copyButton(text, label = 'Kopieren') {
  return `<button type="button" class="icon-btn tool-copy" data-copy="${attr(text)}" aria-label="${attr(label)}" title="${attr(label)}">${COPY_ICON}</button>`;
}

const COPY_ICON = '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';

/** Rechenweg als nummerierte Liste. lines: Text oder { html }. */
export function steps(lines, { title = 'Rechenweg', open = true } = {}) {
  const items = lines.filter((l) => l !== null && l !== undefined && l !== '');
  if (!items.length) return '';
  return `<details class="tool-steps"${open ? ' open' : ''}><summary>${esc(title)}</summary><ol>${items
    .map((line) => `<li>${typeof line === 'object' ? line.html : esc(line)}</li>`)
    .join('')}</ol></details>`;
}

/** Hinweisbox. kind: 'info' | 'warning' | 'error' | 'success' | 'assumption' */
export function notice(text, kind = 'info', { html = false } = {}) {
  const labels = { assumption: 'Annahme', warning: 'Hinweis', error: 'Fehler', info: '', success: '' };
  const label = labels[kind] ? `<strong>${labels[kind]}:</strong> ` : '';
  return `<div class="tool-notice ${kind}" role="${kind === 'error' ? 'alert' : 'note'}">${label}${html ? text : esc(text)}</div>`;
}

export function errorHtml(error) {
  return notice(error?.message || String(error), 'error');
}

/** Ausklappbare fachliche Erklärung (HTML vom Aufrufer). */
export function explanation(html, { title = 'Kurz erklärt', open = false } = {}) {
  return `<details class="tool-explain"${open ? ' open' : ''}><summary>${esc(title)}</summary><div class="tool-explain-body">${html}</div></details>`;
}

/** Leiste mit Beispiel- und Zurücksetzen-Knöpfen. examples: [{ label }] */
export function toolActions({ examples = [], reset = true, extra = '' } = {}) {
  return `<div class="tool-actions row">${examples
    .map((example, i) => `<button type="button" class="btn btn-sm" data-tool-example="${i}">Beispiel: ${esc(example.label)}</button>`)
    .join('')}${reset ? '<button type="button" class="btn btn-sm btn-ghost" data-tool-reset>Zurücksetzen</button>' : ''}${extra}</div>`;
}

/** Karte für einen Werkzeugabschnitt. */
export function panel(title, body, { className = '' } = {}) {
  return `<section class="card tool-panel-card ${className}">${title ? `<h2 class="tool-panel-title">${esc(title)}</h2>` : ''}${body}</section>`;
}

/** Zweispaltiges Layout: Eingaben links, Ergebnis rechts (auf schmalen Bildschirmen untereinander). */
export function layout(inputs, output) {
  return `<div class="tool-layout"><div class="tool-inputs">${inputs}</div><div class="tool-output" aria-live="polite">${output}</div></div>`;
}

/** Werte aller benannten Eingaben eines Containers als Objekt (Checkboxen → boolean, Radios → gewählter Wert). */
export function readForm(root) {
  const values = {};
  for (const el of root.querySelectorAll('input[name], select[name], textarea[name]')) {
    if (el.type === 'checkbox') values[el.name] = el.checked;
    else if (el.type === 'radio') {
      if (el.checked) values[el.name] = el.value;
    } else values[el.name] = el.value;
  }
  return values;
}

/** Setzt Werte in benannte Eingaben (Gegenstück zu readForm). */
export function writeForm(root, values) {
  for (const [name, value] of Object.entries(values)) {
    const els = root.querySelectorAll(`[name="${CSS.escape(name)}"]`);
    for (const el of els) {
      if (el.type === 'checkbox') el.checked = Boolean(value);
      else if (el.type === 'radio') el.checked = el.value === String(value);
      else el.value = value;
    }
  }
}

/**
 * Live-Berechnung: ruft `compute(values)` bei jeder Eingabe auf und schreibt
 * das zurückgegebene HTML in `output`. Fehler erscheinen als Fehlerbox.
 * Verdrahtet außerdem Beispiele und Zurücksetzen (toolActions).
 * Gibt { run, reset } zurück.
 */
export function live(root, { output, compute, defaults = {}, examples = [], delay = 120 }) {
  const out = typeof output === 'string' ? root.querySelector(output) : output;
  let timer = null;
  const run = () => {
    window.clearTimeout(timer);
    try {
      out.innerHTML = compute(readForm(root)) ?? '';
    } catch (error) {
      out.innerHTML = errorHtml(error);
      if (!(error?.name === 'InputError' || error?.name === 'RangeError' || error?.name === 'SyntaxError')) console.error(error);
    }
  };
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(run, delay);
  };
  root.addEventListener('input', (event) => {
    if (event.target.closest('[data-no-live]')) return;
    schedule();
  });
  root.addEventListener('change', (event) => {
    if (event.target.closest('[data-no-live]')) return;
    run();
  });
  root.querySelectorAll('[data-tool-example]').forEach((button) => {
    button.addEventListener('click', () => {
      writeForm(root, { ...defaults, ...examples[Number(button.dataset.toolExample)].values });
      run();
    });
  });
  const reset = () => {
    writeForm(root, defaults);
    run();
  };
  root.querySelector('[data-tool-reset]')?.addEventListener('click', reset);
  run();
  return { run, reset, destroy: () => window.clearTimeout(timer) };
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    if (!ok) throw new Error('Kopieren wird von diesem Browser nicht unterstützt.');
  }
}

/** Ein Klick-Handler für alle Kopieren-Knöpfe innerhalb von `root` (wird von der Werkzeugseite einmal gesetzt). */
export function wireCopy(root) {
  root.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-copy]');
    if (!button || !root.contains(button)) return;
    try {
      await copyText(button.dataset.copy);
      toast('In die Zwischenablage kopiert.', 'success', 1800);
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}

/**
 * Schrittsteuerung für Simulationen.
 * Liefert HTML über stepper.html und verdrahtet sich mit stepper.mount(root).
 *   const stepper = createStepper({ count: () => frames.length, show: (i) => …, interval: 800 });
 *   container.innerHTML = `… ${stepper.html} …`; stepper.mount(container);
 * Tasten (wenn der Fokus in der Steuerung liegt): ← → Schritt, Leertaste Start/Pause, Pos1 Neustart.
 */
export function createStepper({ count, show, interval = 900, label = 'Simulation' }) {
  let index = 0;
  let timer = null;
  let root = null;
  const id = `stepper-${Math.random().toString(36).slice(2, 8)}`;
  const html = `<div class="stepper" id="${id}" role="group" aria-label="${attr(label)} steuern">
      <button type="button" class="btn btn-sm" data-step="restart" title="Neustart (Pos1)">⏮ Neustart</button>
      <button type="button" class="btn btn-sm" data-step="back" title="Schritt zurück (←)">◀ Zurück</button>
      <button type="button" class="btn btn-sm btn-primary" data-step="play" title="Abspielen/Pause (Leertaste)">▶ Abspielen</button>
      <button type="button" class="btn btn-sm" data-step="forward" title="Schritt vor (→)">Vor ▶</button>
      <label class="stepper-speed small subtle">Tempo <select class="select" data-step="speed" data-no-live>
        <option value="1600">langsam</option><option value="${interval}" selected>normal</option><option value="300">schnell</option>
      </select></label>
      <span class="stepper-status small subtle" aria-live="polite"></span>
    </div>`;
  let speed = interval;

  const total = () => Math.max(1, count());
  const update = () => {
    if (!root) return;
    index = Math.max(0, Math.min(index, total() - 1));
    show(index);
    const status = root.querySelector('.stepper-status');
    if (status) status.textContent = `Schritt ${index + 1} von ${total()}${timer ? ' · läuft' : ''}`;
    const play = root.querySelector('[data-step="play"]');
    if (play) play.textContent = timer ? '⏸ Pause' : index >= total() - 1 ? '↻ Von vorn' : '▶ Abspielen';
    root.querySelector('[data-step="back"]').disabled = index === 0;
    root.querySelector('[data-step="forward"]').disabled = index >= total() - 1;
  };
  const stop = () => {
    window.clearInterval(timer);
    timer = null;
  };
  const tick = () => {
    if (index >= total() - 1) {
      stop();
      update();
      return;
    }
    index += 1;
    update();
  };
  const play = () => {
    if (timer) {
      stop();
      update();
      return;
    }
    if (index >= total() - 1) index = 0;
    timer = window.setInterval(tick, speed);
    update();
  };
  const api = {
    html,
    get index() {
      return index;
    },
    mount(container) {
      root = container.querySelector(`#${id}`);
      root.addEventListener('click', (event) => {
        const action = event.target.closest('[data-step]')?.dataset.step;
        if (action === 'restart') api.goto(0);
        else if (action === 'back') api.goto(index - 1);
        else if (action === 'forward') api.goto(index + 1);
        else if (action === 'play') play();
      });
      root.querySelector('[data-step="speed"]').addEventListener('change', (event) => {
        speed = Number(event.target.value);
        if (timer) {
          stop();
          play();
        }
      });
      root.addEventListener('keydown', (event) => {
        if (event.target.tagName === 'SELECT') return;
        if (event.key === 'ArrowRight') api.goto(index + 1);
        else if (event.key === 'ArrowLeft') api.goto(index - 1);
        else if (event.key === 'Home') api.goto(0);
        else if (event.key === ' ') play();
        else return;
        event.preventDefault();
      });
      update();
    },
    goto(i) {
      stop();
      index = i;
      update();
    },
    /** Nach Änderung der Schrittliste (z. B. neue Eingabe) neu anzeigen. */
    refresh(i = 0) {
      stop();
      index = i;
      update();
    },
    destroy: stop
  };
  return api;
}

/** Tabelle aus Kopfzeile und Zeilen (Text wird escapt, { html } erlaubt). */
export function table(head, rows, { className = '' } = {}) {
  const cell = (c, tag) => `<${tag}>${c !== null && typeof c === 'object' ? c.html : esc(c ?? '')}</${tag}>`;
  return `<div class="table-wrap"><table class="data tool-table ${className}"><thead><tr>${head.map((h) => cell(h, 'th')).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => cell(c, 'td')).join('')}</tr>`)
    .join('')}</tbody></table></div>`;
}

/** Eingaben auf eine Länge begrenzen, bevor teure Logik läuft. */
export function limitLength(text, max, label = 'Eingabe') {
  if (String(text).length > max) {
    const error = new Error(`${label} ist zu lang (höchstens ${max.toLocaleString('de-DE')} Zeichen).`);
    error.name = 'InputError';
    throw error;
  }
  return text;
}
