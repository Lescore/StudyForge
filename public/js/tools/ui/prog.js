/**
 * Werkzeuge „Programmierung & Algorithmen“: Sortieren, Big-O, Datenstrukturen,
 * Regex-Tester und Git-Simulator.
 * Die Logik liegt in ../core/prog-*.js (ohne DOM, getestet); hier nur Oberfläche.
 */
import {
  esc, field, checkbox, segmented, layout, panel, resultList, steps, notice, explanation, toolActions,
  live, table, createStepper, readForm, writeForm, errorHtml, copyButton
} from '../kit.js';
import { ALGORITHMS as SORTS, LIMITS as SORT_LIMITS, parseList, randomList, sortFrames } from '../core/prog-sort.js';
import { CLASSES as BIGO, MAX_N, parseN, evaluate, display, durationText, formatSci } from '../core/prog-bigo.js';
import { Stack, Queue, LinkedList, BST, HashTable, TOMBSTONE, parseValue, parseIndex, parseKey, LIMITS as DS } from '../core/prog-ds.js';
import { LIMITS as RX, supportedFlags, segmentsFor } from '../core/prog-regex.js';
import { GitSim } from '../core/prog-git.js';

const PALETTE = ['indigo', 'teal', 'amber', 'rose', 'violet', 'green', 'orange', 'slate'];
const simBadge = '<span class="tool-badge-sim">Simulation</span>';

/* ================================================================ Sortieren */
function sortieren(container) {
  const defaults = { algo: 'quick', list: '38, 27, 43, 3, 9, 82, 10, 27, 55, 1', count: '12' };
  const examples = [
    { label: 'gemischt', values: { list: defaults.list } },
    { label: 'bereits sortiert', values: { list: '1, 2, 3, 4, 5, 6, 7, 8' } },
    { label: 'umgekehrt', values: { list: '8, 7, 6, 5, 4, 3, 2, 1' } },
    { label: 'mit Duplikaten und negativ', values: { list: '5, -3, 5, 0, -3, 12, 5, -8' } }
  ];
  container.innerHTML = layout(
    panel('Eingabe', `
      <div id="sort-form">
        ${field({ id: 'algo', label: 'Algorithmus', value: defaults.algo, options: Object.entries(SORTS) })}
        ${field({ id: 'list', label: 'Zahlen', value: defaults.list, mono: true, rows: 2, hint: `ganze Zahlen ${SORT_LIMITS.min} … ${SORT_LIMITS.max}, getrennt durch Komma oder Leerzeichen; höchstens ${SORT_LIMITS.maxLength}` })}
        <div class="row prog-random">
          ${field({ id: 'count', label: 'Anzahl', value: defaults.count, mono: true, attrs: `inputmode="numeric" data-no-live` })}
          <button type="button" class="btn btn-sm" id="sort-random">Zufallsliste erzeugen</button>
        </div>
        ${toolActions({ examples })}
      </div>
      ${explanation(`
        <ul>
          <li><strong>Bubble Sort</strong>: benachbarte Paare vergleichen und tauschen; große Werte „steigen auf“. O(n²), mit Abbruch bei sortierter Liste O(n). Stabil.</li>
          <li><strong>Selection Sort</strong>: jeweils das Minimum des Rests suchen und nach vorn tauschen. Immer O(n²) Vergleiche, aber höchstens n − 1 Vertauschungen. Nicht stabil.</li>
          <li><strong>Insertion Sort</strong>: Element für Element in den sortierten linken Teil einfügen (Verschieben = Schreibzugriffe). O(n²), fast sortiert nahezu O(n). Stabil.</li>
          <li><strong>Merge Sort</strong>: halbieren, rekursiv sortieren, mischen. Immer O(n log n), braucht O(n) Zusatzspeicher. Stabil.</li>
          <li><strong>Quick Sort</strong>: Pivot wählen und partitionieren. Hier Lomuto-Partitionierung mit dem <em>letzten Element</em> als Pivot: im Mittel O(n log n), bei bereits sortierter Eingabe O(n²). Nicht stabil.</li>
        </ul>
        <p>Die Zähler zählen Vergleiche zwischen Elementen, Vertauschungen und einzelne Schreibzugriffe ins Array.</p>`)}
    `),
    `<div id="sort-out"></div>`
  );
  let frames = [];
  const form = container.querySelector('#sort-form');
  const out = container.querySelector('#sort-out');
  const stepper = createStepper({ count: () => frames.length, show: (i) => showFrame(i), interval: 500, label: 'Sortierung' });
  out.innerHTML = panel('Visualisierung', `
    <div id="sort-error"></div>
    ${stepper.html}
    <div class="prog-bars-wrap"><div class="prog-bars" id="sort-bars" role="img" aria-label="Balkendiagramm des Arrays"></div></div>
    <div class="prog-legend small"><span class="prog-lg prog-lg-compare">verglichen</span><span class="prog-lg prog-lg-swap">getauscht/geschrieben</span><span class="prog-lg prog-lg-pivot">Pivot/Minimum/Schlüssel</span><span class="prog-lg prog-lg-sorted">an Endposition</span></div>
    <p class="prog-step-text" id="sort-text" aria-live="polite"></p>
    <div id="sort-counts"></div>`);
  stepper.mount(out);

  function showFrame(i) {
    const f = frames[i];
    if (!f) return;
    const bars = out.querySelector('#sort-bars');
    const n = f.array.length;
    const max = Math.max(1, ...f.array.map((v) => Math.max(v, 0)));
    const min = Math.min(0, ...f.array);
    const span = max - min || 1;
    const zero = ((0 - min) / span) * 100;
    const sorted = new Set(f.sorted);
    const showVals = n <= 30;
    bars.style.gridTemplateColumns = `repeat(${Math.max(n, 1)}, minmax(0, 1fr))`;
    bars.innerHTML = n
      ? f.array
          .map((v, k) => {
            const cls = [];
            if (f.range && (k < f.range[0] || k > f.range[1])) cls.push('dim');
            if (sorted.has(k)) cls.push('sorted');
            if (f.pivot === k) cls.push('pivot');
            if (f.compare?.includes(k)) cls.push('compare');
            if (f.swap?.includes(k) || f.write === k) cls.push('swap');
            const h = (Math.abs(v) / span) * 100;
            const pos = v >= 0 ? `bottom:${zero}%;height:${Math.max(h, 0.8)}%` : `top:${100 - zero}%;height:${Math.max(h, 0.8)}%`;
            return `<div class="prog-bar-col"><div class="prog-bar ${cls.join(' ')}" style="${pos}" title="a[${k}] = ${v}"></div>${showVals ? `<span class="prog-bar-val">${v}</span>` : ''}</div>`;
          })
          .join('')
      : '<p class="small subtle prog-empty">leere Liste</p>';
    bars.style.setProperty('--zero', `${zero}%`);
    out.querySelector('#sort-text').textContent = f.text;
    out.querySelector('#sort-counts').innerHTML = resultList([
      { label: 'Vergleiche', value: String(f.comparisons), copy: false },
      { label: 'Vertauschungen', value: String(f.swaps), copy: false },
      { label: 'Schreibzugriffe', value: String(f.writes), copy: false },
      { label: 'Array', value: `[${f.array.join(', ')}]` }
    ]);
  }

  const compute = () => {
    const v = readForm(form);
    const err = out.querySelector('#sort-error');
    try {
      const list = parseList(v.list);
      frames = sortFrames(v.algo, list);
      err.innerHTML = '';
    } catch (error) {
      err.innerHTML = errorHtml(error);
      return;
    }
    stepper.refresh(0);
  };
  let timer = null;
  form.addEventListener('input', (event) => {
    if (event.target.closest('[data-no-live]')) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(compute, 300);
  });
  form.addEventListener('change', (event) => {
    if (event.target.closest('[data-no-live]')) return;
    compute();
  });
  form.querySelector('#sort-random').addEventListener('click', () => {
    const raw = form.querySelector('#count').value.trim();
    const n = /^\d+$/.test(raw) ? Math.min(SORT_LIMITS.maxLength, Math.max(1, Number(raw))) : 12;
    form.querySelector('#count').value = String(n);
    form.querySelector('#list').value = randomList(n).join(', ');
    compute();
  });
  form.querySelectorAll('[data-tool-example]').forEach((b) =>
    b.addEventListener('click', () => {
      writeForm(form, { ...examples[Number(b.dataset.toolExample)].values });
      compute();
    })
  );
  form.querySelector('[data-tool-reset]').addEventListener('click', () => {
    writeForm(form, defaults);
    compute();
  });
  compute();
  return () => {
    window.clearTimeout(timer);
    stepper.destroy();
  };
}

/* ================================================================ Big-O */
function bigO(container) {
  const defaults = { n: '20', scale: 'log', ...Object.fromEntries(BIGO.map((c) => [`show_${c.id}`, c.id !== 'ofact'])) };
  const examples = [
    { label: 'n = 10', values: { n: '10' } },
    { label: 'n = 100 (2¹⁰⁰)', values: { n: '100' } },
    { label: 'n = 1 000 000', values: { n: '1000000', show_o2n: false, show_ofact: false } }
  ];
  container.innerHTML = layout(
    panel('Eingabe', `
      ${field({ id: 'n', label: 'Eingabegröße n', value: defaults.n, mono: true, attrs: 'inputmode="numeric"', hint: `1 bis ${MAX_N.toLocaleString('de-DE')}` })}
      ${segmented({ name: 'scale', label: 'y-Achse', value: defaults.scale, options: [['log', 'logarithmisch'], ['lin', 'linear']] })}
      <fieldset class="tool-seg"><legend>Klassen im Diagramm</legend><div class="prog-bigo-checks">${BIGO.map((c) => checkbox({ id: `show_${c.id}`, label: c.label, checked: defaults[`show_${c.id}`] })).join('')}</div></fieldset>
      ${toolActions({ examples })}
      ${notice('Theoretische Wachstumsmodelle, keine gemessenen Laufzeiten: Konstanten und niedrigere Terme werden ignoriert (3n² + 5n zählt als n²). Logarithmen zur Basis 2.', 'assumption')}
      ${explanation(`
        <p>Die O-Notation beschreibt, wie der Aufwand eines Algorithmus mit der Eingabegröße n <em>wächst</em> – als obere Schranke bis auf einen konstanten Faktor. Für kleine n kann ein „schlechterer“ Algorithmus mit kleiner Konstante schneller sein; für große n entscheidet die Klasse.</p>
        <p>Die Basis des Logarithmus ändert nur einen konstanten Faktor (log₂ n = log₁₀ n / log₁₀ 2) und spielt deshalb in der O-Notation keine Rolle.</p>
        <p>Die Spalte „bei 10⁹ Op./s“ ist eine reine Annahme zur Veranschaulichung (etwa eine einfache Operation pro Takt eines 1-GHz-Prozessors).</p>`)}
    `),
    '<div id="bigo-out"></div>'
  );
  const color = (i) => `var(--c-${PALETTE[i % PALETTE.length]})`;
  live(container, {
    output: '#bigo-out',
    defaults,
    examples,
    compute: (v) => {
      const n = parseN(v.n);
      const rows = BIGO.map((c, i) => {
        const val = evaluate(c.id, n);
        const d = display(val);
        return [
          { html: `<span class="prog-swatch" style="background:${color(i)}"></span><strong>${esc(c.label)}</strong><br><span class="small subtle">${esc(c.name)} – ${esc(c.example)}</span>` },
          { html: `<span class="prog-num">${esc(d.text)}</span>${d.sci ? `<br><span class="small subtle">${esc(d.sci)}</span>` : ''}${val.exact !== null && val.exact.toString().length > 15 ? `<br><span class="tiny faint">${val.exact.toString().length} Stellen</span>` : ''}` },
          durationText(val.log10)
        ];
      });
      return panel(`Operationsanzahl für n = ${n.toLocaleString('de-DE')}`, `
        ${table(['Klasse', 'f(n) Operationen', 'bei 10⁹ Op./s (Annahme)'], rows, { className: 'prog-bigo-table' })}
        <h3 class="prog-sub">Verlauf von 1 bis ${n.toLocaleString('de-DE')} (${v.scale === 'log' ? 'logarithmische' : 'lineare'} y-Achse)</h3>
        ${chart(n, v)}
        ${n < 2 ? notice('Für ein aussagekräftiges Diagramm n ≥ 2 wählen.', 'info') : ''}
        ${v.scale === 'lin' ? notice('Lineare Achse: Die schnell wachsenden Klassen drücken alle anderen an die Nulllinie – zum Vergleichen die logarithmische Achse nutzen oder Klassen abwählen.', 'info') : ''}
      `);
    }
  });

  function chart(n, v) {
    const shown = BIGO.map((c, i) => ({ ...c, i })).filter((c) => v[`show_${c.id}`]);
    if (!shown.length) return notice('Keine Klasse ausgewählt.', 'info');
    const W = 640;
    const H = 300;
    const L = 86;
    const B = 34;
    const T = 12;
    const R = 12;
    const pts = Math.min(160, Math.max(2, n));
    const xs = Array.from({ length: pts }, (_, k) => (pts === 1 ? 1 : Math.round(1 + ((n - 1) * k) / (pts - 1))));
    const series = shown.map((c) => ({ c, ys: xs.map((x) => Math.max(0, evaluate(c.id, x).log10)) }));
    const maxLog = Math.max(1, ...series.map((s) => Math.max(...s.ys)));
    const px = (x) => L + ((x - 1) / Math.max(1, n - 1)) * (W - L - R);
    const py = (lg) => {
      const f = v.scale === 'log' ? lg / maxLog : 10 ** (lg - maxLog);
      return T + (1 - f) * (H - T - B);
    };
    const ticks = [];
    if (v.scale === 'log') {
      const step = Math.max(1, Math.ceil(maxLog / 6));
      for (let e = 0; e <= maxLog + 1e-9; e += step) ticks.push([e, e === 0 ? '1' : { pow: e }]);
    } else {
      for (const f of [0, 0.25, 0.5, 0.75, 1]) ticks.push([f === 0 ? -Infinity : maxLog + Math.log10(f), f === 0 ? '0' : maxLog < 6 ? (f * 10 ** maxLog).toLocaleString('de-DE', { maximumFractionDigits: 1 }) : formatSci(maxLog + Math.log10(f), 2)]);
    }
    const yFor = (lg) => (lg === -Infinity ? H - B : py(lg));
    const xTicks = [1, Math.round((n + 1) / 2), n].filter((x, k, a) => a.indexOf(x) === k);
    return `<div class="prog-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Wachstumskurven der ausgewählten Komplexitätsklassen">
      ${ticks.map(([lg, label]) => `<line class="prog-grid" x1="${L}" x2="${W - R}" y1="${yFor(lg).toFixed(1)}" y2="${yFor(lg).toFixed(1)}"/><text class="prog-axis" x="${L - 6}" y="${(yFor(lg) + 4).toFixed(1)}" text-anchor="end">${typeof label === 'object' ? `10<tspan dy="-6" font-size="10">${label.pow}</tspan>` : esc(label)}</text>`).join('')}
      ${xTicks.map((x) => `<text class="prog-axis" x="${px(x).toFixed(1)}" y="${H - B + 16}" text-anchor="middle">${x.toLocaleString('de-DE')}</text>`).join('')}
      <text class="prog-axis" x="${(L + W - R) / 2}" y="${H - 4}" text-anchor="middle">n</text>
      <line class="prog-axis-line" x1="${L}" x2="${L}" y1="${T}" y2="${H - B}"/><line class="prog-axis-line" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>
      ${series.map((s) => `<polyline fill="none" stroke="${color(s.c.i)}" stroke-width="2.4" points="${s.ys.map((lg, k) => `${px(xs[k]).toFixed(1)},${py(lg).toFixed(1)}`).join(' ')}"/>`).join('')}
    </svg>
    <div class="prog-chart-legend small">${shown.map((c) => `<span><span class="prog-swatch" style="background:${color(c.i)}"></span>${esc(c.label)}</span>`).join('')}</div></div>`;
  }
}

/* ================================================================ Datenstrukturen */
function datenstrukturen(container) {
  let kind = 'stack';
  let log = [];
  let last = null; // letztes Operationsergebnis (für Hervorhebung)
  let ds = { stack: new Stack(), queue: new Queue(), list: new LinkedList(), bst: new BST(), hash: new HashTable(7) };
  let hashOpts = { m: 7, strategy: 'chaining', keyType: 'number' };
  const SAMPLES = {
    stack: () => new Stack([4, 8, 15]),
    queue: () => new Queue([4, 8, 15]),
    list: () => new LinkedList([3, 7, 12, 20]),
    bst: () => new BST([50, 30, 70, 20, 40, 60, 80, 65]),
    hash: () => {
      const t = new HashTable(hashOpts.m, { strategy: hashOpts.strategy });
      const keys = hashOpts.keyType === 'number' ? [10, 3, 17, 24, 8] : ['Anna', 'Ben', 'Lea', 'Tom', 'Mia'];
      keys.forEach((k) => t.insert(k));
      return t;
    }
  };
  const TITLES = { stack: 'Stack (LIFO)', queue: 'Queue (FIFO)', list: 'Verkettete Liste', bst: 'Binärer Suchbaum', hash: 'Hash-Tabelle' };

  container.innerHTML = `
    ${panel('', `${segmented({ name: 'kind', label: 'Datenstruktur', value: kind, options: Object.entries(TITLES) })}<p class="small subtle mb-0">Alle Operationen laufen nur im Browser auf dieser Darstellung.</p>`, { className: 'prog-ds-pick' })}
    ${layout('<div id="ds-controls"></div>', '<div id="ds-view"></div>')}`;
  const controls = container.querySelector('#ds-controls');
  const view = container.querySelector('#ds-view');

  const btn = (op, label, cls = '') => `<button type="button" class="btn btn-sm ${cls}" data-op="${op}">${esc(label)}</button>`;
  const CONTROL = {
    stack: () => `${field({ id: 'val', label: 'Wert', value: '42', mono: true, attrs: 'inputmode="numeric"' })}<div class="row">${btn('push', 'push', 'btn-primary')}${btn('pop', 'pop')}${btn('peek', 'peek')}</div>`,
    queue: () => `${field({ id: 'val', label: 'Wert', value: '42', mono: true, attrs: 'inputmode="numeric"' })}<div class="row">${btn('enqueue', 'enqueue', 'btn-primary')}${btn('dequeue', 'dequeue')}${btn('peek', 'peek')}</div>`,
    list: () => `<div class="form-row">${field({ id: 'val', label: 'Wert', value: '42', mono: true, attrs: 'inputmode="numeric"' })}${field({ id: 'idx', label: 'Index', value: '1', mono: true, attrs: 'inputmode="numeric"' })}</div>
      <div class="row">${btn('head', 'am Anfang einfügen', 'btn-primary')}${btn('tail', 'am Ende einfügen')}${btn('at', 'an Index einfügen')}</div>
      <div class="row mt-1">${btn('search', 'Wert suchen')}${btn('delval', 'Wert löschen')}${btn('delidx', 'Index löschen')}</div>`,
    bst: () => `${field({ id: 'val', label: 'Schlüssel', value: '45', mono: true, attrs: 'inputmode="numeric"' })}<div class="row">${btn('insert', 'einfügen', 'btn-primary')}${btn('search', 'suchen')}${btn('delete', 'löschen')}</div>`,
    hash: () => `<div class="form-row">
        ${field({ id: 'm', label: 'Größe m', value: String(hashOpts.m), options: Array.from({ length: DS.maxBuckets }, (_, i) => [String(i + 1), String(i + 1)]) })}
        ${field({ id: 'strategy', label: 'Kollisionen', value: hashOpts.strategy, options: [['chaining', 'Verkettung'], ['probing', 'lineares Sondieren']] })}
        ${field({ id: 'keyType', label: 'Schlüssel', value: hashOpts.keyType, options: [['number', 'Zahlen'], ['text', 'Texte']] })}
      </div>
      <p class="hint">Ändern von m, Kollisionsbehandlung oder Schlüsseltyp leert die Tabelle.</p>
      ${field({ id: 'val', label: 'Schlüssel', value: hashOpts.keyType === 'number' ? '31' : 'Max', mono: true })}
      <div class="row">${btn('insert', 'einfügen', 'btn-primary')}${btn('search', 'suchen')}${btn('delete', 'löschen')}</div>`
  };
  const EXPLAIN = {
    stack: '<p>Ein <strong>Stack</strong> (Stapel) arbeitet nach LIFO – Last In, First Out. push legt oben ab, pop entnimmt oben, peek liest oben ohne zu entnehmen. Alle drei O(1). Anwendungen: Aufrufstapel, Rückgängig, Klammerprüfung.</p>',
    queue: '<p>Eine <strong>Queue</strong> (Warteschlange) arbeitet nach FIFO – First In, First Out. enqueue hängt hinten an, dequeue entnimmt vorn. Mit Ringpuffer oder verketteter Liste O(1). Anwendungen: Druckaufträge, Breitensuche, Ready-Queue im Scheduler.</p>',
    list: '<p>Eine <strong>einfach verkettete Liste</strong> besteht aus Knoten mit Wert und Zeiger auf den Nachfolger; der letzte zeigt auf null. Einfügen/Löschen am Anfang O(1); Zugriff auf Index i und Suche O(n), weil von head aus gelaufen werden muss.</p>',
    bst: '<p>Im <strong>binären Suchbaum</strong> sind alle Schlüssel im linken Teilbaum kleiner, im rechten größer als der Knoten. <strong>Duplikate werden abgelehnt.</strong> Suchen, Einfügen und Löschen kosten O(Höhe): ausgeglichen O(log n), entartet (sortiert eingefügt) O(n).</p><p>Löschen mit zwei Kindern: Der Knoten übernimmt den <em>In-Order-Nachfolger</em> (kleinster Schlüssel im rechten Teilbaum), der dann an seiner alten Stelle entfernt wird. Höhe = Anzahl Kanten des längsten Wegs von der Wurzel (leerer Baum −1, nur Wurzel 0).</p>',
    hash: '<p>Eine <strong>Hash-Tabelle</strong> berechnet aus dem Schlüssel einen Platz. Hashfunktion hier: Zahl k → k mod m (für negative Zahlen in 0…m−1 verschoben); Text → Summe der Unicode-Codepoints mod m. Bewusst einfach – echte Hashfunktionen streuen besser.</p><p><strong>Verkettung</strong>: Jeder Bucket hält eine Liste. <strong>Lineares Sondieren</strong>: Bei Kollision den nächsten freien Platz (h+1, h+2 … mod m) nehmen; gelöschte Plätze werden als „Grabstein“ markiert, damit Suchen weiterlaufen. Der <strong>Belegungsfaktor</strong> α = n/m bestimmt den mittleren Aufwand; typischerweise wird ab α ≈ 0,7 vergrößert.</p>'
  };

  const drawControls = () => {
    controls.innerHTML = panel(TITLES[kind], `<div id="ds-form">${CONTROL[kind]()}
      <div class="tool-actions row"><button type="button" class="btn btn-sm" data-op="sample">Beispiel laden</button><button type="button" class="btn btn-sm btn-ghost" data-op="clear">Zurücksetzen</button></div></div>
      <div id="ds-msg"></div>
      ${explanation(EXPLAIN[kind])}`);
  };

  const box = (v, cls = '') => `<span class="prog-box ${cls}">${esc(String(v))}</span>`;
  const VIEW = {
    stack: () => {
      const s = ds.stack.items;
      const hi = last?.highlight;
      return `<div class="prog-stack">${s.length ? '' : '<p class="small subtle">leer</p>'}${[...s].map((v, i) => ({ v, i })).reverse().map(({ v, i }) => `<div class="prog-stack-row">${box(v, i === hi ? 'hl' : '')}${i === s.length - 1 ? '<span class="small subtle">← oben (top)</span>' : ''}</div>`).join('')}</div>`;
    },
    queue: () => {
      const q = ds.queue.items;
      const hi = last?.highlight;
      return q.length
        ? `<div class="prog-row-items"><span class="small subtle">vorn (front) →</span>${q.map((v, i) => box(v, i === hi ? 'hl' : '')).join('')}<span class="small subtle">← hinten (rear)</span></div>`
        : '<p class="small subtle">leer</p>';
    },
    list: () => {
      const l = ds.list.items;
      const path = new Set(last?.path ?? []);
      const hi = last?.highlight;
      return `<div class="prog-row-items"><span class="small subtle">head →</span>${l.map((v, i) => `${box(v, i === hi ? 'hl' : path.has(i) ? 'visited' : '')}<span class="prog-arrow" aria-hidden="true">→</span>`).join('')}<span class="prog-null">null</span></div>
        ${l.length ? `<p class="small subtle mt-1">Indizes: ${l.map((v, i) => `${i}:${v}`).join('  ')}</p>` : ''}`;
    },
    bst: () => {
      const t = ds.bst;
      const { nodes, edges } = t.layout();
      if (!nodes.length) return '<p class="small subtle">leerer Baum</p>';
      const path = new Set(last?.path ?? []);
      const hi = last?.highlight;
      const pos = new Map(nodes.map((n) => [n.key, n]));
      const depth = Math.max(...nodes.map((n) => n.y));
      const dx = 44;
      const dy = 56;
      const W = Math.max(1, nodes.length) * dx + 20;
      const H = (depth + 1) * dy + 10;
      const X = (n) => 10 + n.x * dx + dx / 2;
      const Y = (n) => 26 + n.y * dy;
      return `<div class="prog-tree-wrap"><svg class="prog-tree" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Binärer Suchbaum mit ${nodes.length} Knoten">
        ${edges.map(([a, b]) => `<line class="prog-edge${path.has(a) && path.has(b) ? ' on' : ''}" x1="${X(pos.get(a))}" y1="${Y(pos.get(a))}" x2="${X(pos.get(b))}" y2="${Y(pos.get(b))}"/>`).join('')}
        ${nodes.map((n) => `<g class="prog-node${n.key === hi ? ' hl' : path.has(n.key) ? ' visited' : ''}"><circle cx="${X(n)}" cy="${Y(n)}" r="17"/><text x="${X(n)}" y="${Y(n) + 4}" text-anchor="middle">${n.key}</text></g>`).join('')}
      </svg></div>
      ${resultList([
        { label: 'Knoten', value: String(t.count), copy: false },
        { label: 'Höhe', value: String(t.height()), copy: false },
        { label: 'In-Order', value: t.inorder().join(', ') },
        { label: 'Pre-Order', value: t.preorder().join(', ') },
        { label: 'Post-Order', value: t.postorder().join(', ') },
        { label: 'Level-Order', value: t.levelorder().join(', ') }
      ])}`;
    },
    hash: () => {
      const t = ds.hash;
      const probes = last?.probes ?? [];
      const hi = last?.highlight;
      const rows = t.buckets.map((b, i) => {
        const cls = i === hi ? 'hl' : probes.includes(i) ? 'visited' : '';
        let content;
        if (t.strategy === 'chaining') content = b.length ? b.map((k) => box(k)).join('<span class="prog-arrow" aria-hidden="true">→</span>') : '<span class="faint">leer</span>';
        else content = b === null ? '<span class="faint">leer</span>' : b === TOMBSTONE ? '<span class="prog-tomb">gelöscht</span>' : box(b);
        return `<div class="prog-bucket ${cls}"><span class="prog-bucket-i">${i}</span><div class="prog-bucket-c">${content}</div></div>`;
      });
      return `<div class="prog-buckets">${rows.join('')}</div>
        ${resultList([
          { label: 'Einträge n', value: String(t.count), copy: false },
          { label: 'Belegungsfaktor α', value: `${t.count}/${t.m} = ${t.loadFactor.toLocaleString('de-DE', { maximumFractionDigits: 3 })}`, copy: false },
          last?.explain ? { label: 'Hash-Rechnung', value: last.explain, copy: false } : null
        ])}
        ${t.loadFactor > 0.7 && t.strategy === 'probing' ? notice('Belegungsfaktor über 0,7: Beim linearen Sondieren werden die Suchwege lang (Clusterbildung).', 'warning') : ''}`;
    }
  };

  const drawView = () => {
    view.innerHTML = panel('Zustand', `${VIEW[kind]()}<h3 class="prog-sub mt-2">Protokoll</h3>${log.length ? `<ol class="prog-log" reversed>${log
      .slice()
      .reverse()
      .map((e) => `<li class="${e.ok ? '' : 'err'}"><span class="mono">${esc(e.op)}</span> – ${esc(e.message)}</li>`)
      .join('')}</ol>` : '<p class="small subtle">noch keine Operation</p>'}`);
  };
  const addLog = (op, r) => {
    log.push({ op: `${{ stack: 'Stack', queue: 'Queue', list: 'Liste', bst: 'BST', hash: 'Hash' }[kind]}: ${op}`, ok: r.ok, message: r.message });
    if (log.length > 60) log = log.slice(-60);
    last = r;
    const msg = controls.querySelector('#ds-msg');
    if (msg) msg.innerHTML = notice(r.message, r.ok ? 'success' : 'error');
  };

  const run = (op) => {
    const form = controls.querySelector('#ds-form');
    const v = readForm(form);
    const value = () => parseValue(v.val);
    const s = ds[kind];
    let r;
    try {
      if (op === 'sample') {
        ds[kind] = SAMPLES[kind]();
        r = { ok: true, message: 'Beispieldaten geladen.' };
      } else if (op === 'clear') {
        ds[kind] = kind === 'hash' ? new HashTable(hashOpts.m, { strategy: hashOpts.strategy }) : new { stack: Stack, queue: Queue, list: LinkedList, bst: BST }[kind]();
        r = { ok: true, message: 'Struktur geleert.' };
      } else if (kind === 'stack') r = op === 'push' ? s.push(value()) : op === 'pop' ? s.pop() : s.peek();
      else if (kind === 'queue') r = op === 'enqueue' ? s.enqueue(value()) : op === 'dequeue' ? s.dequeue() : s.peek();
      else if (kind === 'list') {
        if (op === 'head') r = s.insertHead(value());
        else if (op === 'tail') r = s.insertTail(value());
        else if (op === 'at') r = s.insertAt(parseIndex(v.idx, s.size), value());
        else if (op === 'search') r = s.search(value());
        else if (op === 'delval') r = s.deleteValue(value());
        else r = s.deleteAt(parseIndex(v.idx, Math.max(0, s.size - 1)));
      } else if (kind === 'bst') r = op === 'insert' ? s.insert(value()) : op === 'search' ? s.search(value()) : s.delete(value());
      else {
        const key = parseKey(v.val, hashOpts.keyType);
        r = op === 'insert' ? s.insert(key) : op === 'search' ? s.search(key) : s.delete(key);
      }
    } catch (error) {
      r = { ok: false, message: error.message };
    }
    const NAMES = { sample: 'Beispiel', clear: 'Zurücksetzen', head: 'einfügen am Anfang', tail: 'einfügen am Ende', at: `einfügen an Index ${v.idx}`, delval: 'löschen Wert', delidx: `löschen Index ${v.idx}` };
    const noValue = ['pop', 'dequeue', 'peek', 'sample', 'clear', 'delidx'].includes(op);
    const label = `${NAMES[op] ?? op}${noValue ? '' : ` ${String(v.val ?? '').trim()}`}`;
    addLog(label, r);
    drawView();
  };

  const wire = () => {
    controls.addEventListener('click', (event) => {
      const op = event.target.closest('[data-op]')?.dataset.op;
      if (op) run(op);
    });
    controls.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.target.id !== 'val') return;
      event.preventDefault();
      controls.querySelector('#ds-form .btn-primary')?.click();
    });
    controls.addEventListener('change', (event) => {
      if (kind !== 'hash' || !['m', 'strategy', 'keyType'].includes(event.target.id)) return;
      const v = readForm(controls);
      const typeChanged = v.keyType !== hashOpts.keyType;
      hashOpts = { m: Number(v.m), strategy: v.strategy, keyType: v.keyType };
      ds.hash = new HashTable(hashOpts.m, { strategy: hashOpts.strategy });
      last = null;
      log.push({ op: 'Hash-Tabelle', ok: true, message: `Neu angelegt: m = ${hashOpts.m}, ${hashOpts.strategy === 'chaining' ? 'Verkettung' : 'lineares Sondieren'}, Schlüssel: ${hashOpts.keyType === 'number' ? 'Zahlen' : 'Texte'}.` });
      if (typeChanged) controls.querySelector('#val').value = hashOpts.keyType === 'number' ? '31' : 'Max';
      drawView();
    });
  };
  container.querySelector('.prog-ds-pick').addEventListener('change', (event) => {
    if (event.target.name !== 'kind') return;
    kind = event.target.value;
    last = null;
    drawControls();
    drawView();
  });
  // Mit Beispieldaten starten, damit sofort etwas zu sehen ist
  ds = { stack: SAMPLES.stack(), queue: SAMPLES.queue(), list: SAMPLES.list(), bst: SAMPLES.bst(), hash: SAMPLES.hash() };
  drawControls();
  wire();
  drawView();
}

/* ================================================================ Regex */
function regex(container) {
  const flagsSupported = supportedFlags();
  const FLAG_INFO = { g: 'global – alle Treffer', i: 'ignoreCase', m: 'multiline – ^/$ je Zeile', s: 'dotAll – . passt auch auf \\n', u: 'unicode', v: 'unicodeSets', y: 'sticky – nur ab lastIndex', d: 'hasIndices – Gruppenpositionen' };
  const flagList = ['g', 'i', 'm', 's', 'u', 'y', 'd', 'v'].filter((f) => flagsSupported.includes(f));
  const defaults = { pattern: '(?<jahr>\\d{4})-(?<monat>\\d{2})-(?<tag>\\d{2})', text: 'Abgabe am 2026-11-15, Klausur am 2027-02-03.\nUngültig: 2026-1-5', replacement: '$<tag>.$<monat>.$<jahr>', withReplace: true, ...Object.fromEntries(flagList.map((f) => [`f_${f}`, f === 'g'])) };
  const examples = [
    { label: 'Datum mit benannten Gruppen', values: {} },
    { label: 'E-Mail-ähnlich', values: { pattern: '[\\w.+-]+@([\\w-]+\\.)+[A-Za-z]{2,}', text: 'Kontakt: anna.muster@example.com, info@example.org oder kaputt@localhost', replacement: '<$&>', f_i: true } },
    { label: 'Wortgrenzen (Null-Längen-Treffer)', values: { pattern: '\\b', text: 'Hallo Welt', replacement: '|', withReplace: true } },
    { label: 'Katastrophales Backtracking', values: { pattern: '(a+)+$', text: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!', withReplace: false } }
  ];
  container.innerHTML = layout(
    panel('Eingabe', `
      ${field({ id: 'pattern', label: 'Muster (ohne /…/)', value: defaults.pattern, mono: true, attrs: `maxlength="${RX.pattern}"` })}
      <fieldset class="tool-seg"><legend>Flags</legend><div class="prog-flags">${flagList.map((f) => `<label class="checkbox" title="${esc(FLAG_INFO[f])}"><input type="checkbox" name="f_${f}" id="f_${f}"${defaults[`f_${f}`] ? ' checked' : ''}> <code>${f}</code> <span class="tiny subtle">${esc(FLAG_INFO[f])}</span></label>`).join('')}</div></fieldset>
      ${field({ id: 'text', label: 'Testtext', value: defaults.text, mono: true, rows: 5, attrs: `maxlength="${RX.text}"` })}
      ${checkbox({ id: 'withReplace', label: 'Ersetzen-Vorschau anzeigen', checked: defaults.withReplace })}
      ${field({ id: 'replacement', label: 'Ersetzung', value: defaults.replacement, mono: true, hint: '$1 … für Gruppen, $<name> für benannte Gruppen, $& für den ganzen Treffer' })}
      ${toolActions({ examples })}
      ${explanation(`
        <p>Getestet wird mit der <strong>JavaScript-RegExp</strong> dieses Browsers – andere Sprachen (PCRE, Python, Java, POSIX) weichen in Details ab, z. B. bei Lookbehind, Unicode-Klassen oder benannten Gruppen.</p>
        <p>Ohne Flag <code>g</code> (oder <code>y</code>) wird nur der erste Treffer gesucht. Leere Treffer (z. B. <code>\\b</code> oder <code>x*</code>) werden angezeigt und die Suche rückt danach um ein Zeichen weiter (mit <code>u</code>/<code>v</code> um einen Codepoint).</p>
        <p><strong>Katastrophales Backtracking</strong>: Verschachtelte Wiederholungen wie <code>(a+)+$</code> probieren bei einem Fehlschlag exponentiell viele Aufteilungen. Deshalb läuft der Test in einem eigenen Hintergrund-Thread (Web Worker) und wird nach 1 Sekunde abgebrochen.</p>
        <p>Grenzen: Muster ≤ ${RX.pattern.toLocaleString('de-DE')} Zeichen, Text ≤ ${RX.text.toLocaleString('de-DE')} Zeichen, höchstens ${RX.matches.toLocaleString('de-DE')} angezeigte Treffer.</p>`)}
    `),
    '<div id="rx-out"></div>'
  );
  const out = container.querySelector('#rx-out');
  const TIMEOUT = 1000;
  let worker = null;
  let pending = null; // { id, timer }
  let seq = 0;
  let lastValues = null;

  const stopWorker = () => {
    if (pending) window.clearTimeout(pending.timer);
    pending = null;
    if (worker) worker.terminate();
    worker = null;
  };
  const getWorker = () => {
    if (!worker) {
      worker = new Worker(new URL('../core/prog-regex-worker.js', import.meta.url), { type: 'module' });
      worker.addEventListener('message', (event) => {
        if (!pending || event.data.id !== pending.id) return;
        window.clearTimeout(pending.timer);
        pending = null;
        showResult(event.data);
      });
      worker.addEventListener('error', (event) => {
        event.preventDefault();
        stopWorker();
        out.innerHTML = panel('Ergebnis', notice('Der Regex-Worker konnte nicht gestartet werden.', 'error'));
      });
    }
    return worker;
  };

  const showResult = (data) => {
    const v = lastValues;
    if (!data.ok) {
      out.innerHTML = panel('Ergebnis', notice(data.error, 'error'));
      return;
    }
    const { matches, truncated, flags, source } = data.result;
    const text = v.text;
    const segs = segmentsFor(text, matches);
    const highlighted = segs.map((s) => (s.match === null ? esc(s.text) : s.empty ? `<mark class="prog-empty-match" title="Treffer ${s.match + 1}: leer an Position ${matches[s.match].index}"></mark>` : `<mark title="Treffer ${s.match + 1}">${esc(s.text)}</mark>`)).join('');
    const groupCell = (m) => {
      const parts = m.groups.map((g) => `<span class="prog-grp">${g.n}: ${g.value === null ? '<em class="faint">nicht beteiligt</em>' : `„${esc(g.value)}“`}${g.start !== null ? ` <span class="faint">@${g.start}</span>` : ''}</span>`);
      if (m.named) parts.push(...Object.entries(m.named).map(([k, val]) => `<span class="prog-grp">&lt;${esc(k)}&gt;: ${val === null ? '<em class="faint">nicht beteiligt</em>' : `„${esc(val)}“`}</span>`));
      return parts.join('') || '<span class="faint">–</span>';
    };
    const showTable = matches.slice(0, 200);
    out.innerHTML = panel('Ergebnis', `
      ${resultList([
        { label: 'Regulärer Ausdruck', value: `/${source}/${flags}` },
        { label: 'Treffer', value: `${matches.length.toLocaleString('de-DE')}${truncated ? ` (Grenze von ${RX.matches.toLocaleString('de-DE')} erreicht – weitere nicht angezeigt)` : ''}`, copy: false, strong: true },
        { label: 'Laufzeit', value: `${data.ms} ms (im Worker)`, copy: false, mono: false }
      ])}
      ${!flags.includes('g') && !flags.includes('y') ? notice('Ohne Flag g wird nur der erste Treffer gesucht.', 'info') : ''}
      <h3 class="prog-sub mt-2">Treffer im Text</h3>
      <div class="mono-block mono-wrap prog-rx-text">${highlighted || '<span class="faint">(leerer Text)</span>'}</div>
      ${matches.length ? `<h3 class="prog-sub mt-2">Trefferliste${matches.length > showTable.length ? ` (erste ${showTable.length})` : ''}</h3>${table(['Nr.', 'Index', 'Länge', 'Treffer', 'Gruppen'], showTable.map((m, i) => [i + 1, m.index, m.length, { html: m.length ? `„${esc(m.text)}“` : '<em class="faint">leer</em>' }, { html: groupCell(m) }]), { className: 'prog-rx-table' })}` : notice('Kein Treffer.', 'info')}
      ${data.replaced !== null && data.replaced !== undefined ? `<h3 class="prog-sub mt-2">Ersetzen-Vorschau <span class="small subtle">(String.prototype.replace)</span></h3><div class="mono-block mono-wrap">${esc(data.replaced.length > 20000 ? `${data.replaced.slice(0, 20000)} …` : data.replaced)}</div><div class="row mt-1">${copyButton(data.replaced, 'Ersetzungsergebnis kopieren')}<span class="small subtle">Ergebnis kopieren</span></div>` : ''}
    `);
  };

  const run = (v) => {
    lastValues = v;
    const flags = flagList.filter((f) => v[`f_${f}`]).join('');
    if (v.pattern.length > RX.pattern) throw Object.assign(new Error(`Das Muster ist zu lang (höchstens ${RX.pattern} Zeichen).`), { name: 'InputError' });
    if (v.text.length > RX.text) throw Object.assign(new Error(`Der Testtext ist zu lang (höchstens ${RX.text.toLocaleString('de-DE')} Zeichen).`), { name: 'InputError' });
    if (pending) stopWorker(); // laufende Auswertung abbrechen
    seq += 1;
    const id = seq;
    const w = getWorker();
    pending = {
      id,
      timer: window.setTimeout(() => {
        stopWorker();
        out.innerHTML = panel('Ergebnis', notice(`Abgebrochen: Die Auswertung dauerte länger als ${TIMEOUT / 1000} Sekunde. Wahrscheinlich katastrophales Backtracking – verschachtelte Wiederholungen wie (a+)+ oder (a|a)* vermeiden, Wiederholungen eindeutiger machen (z. B. a+$ statt (a+)+$) oder den Text kürzen.`, 'error'));
      }, TIMEOUT)
    };
    w.postMessage({ id, pattern: v.pattern, flags, text: v.text, replacement: v.replacement, withReplace: Boolean(v.withReplace) });
    return out.innerHTML || panel('Ergebnis', '<p class="small subtle">Wird ausgewertet …</p>');
  };
  const ctl = live(container.querySelector('.tool-inputs'), {
    output: document.createElement('div'),
    defaults,
    examples,
    delay: 250,
    compute: (v) => {
      try {
        run(v);
      } catch (error) {
        out.innerHTML = panel('Ergebnis', errorHtml(error));
      }
      return '';
    }
  });
  return () => {
    ctl.destroy();
    stopWorker();
  };
}

/* ================================================================ Git */
const GIT_SCENARIOS = [
  { label: 'Fast-Forward-Merge', commands: ['git switch -c feature', 'git commit -m "Login-Formular"', 'git commit -m "Validierung"', 'git switch main', 'git merge feature'] },
  { label: 'Echter Merge', commands: ['git switch -c feature', 'git commit -m "Feature A"', 'git switch main', 'git commit -m "Hotfix"', 'git merge feature'] },
  { label: 'Rebase', commands: ['git switch -c feature', 'git commit -m "F1"', 'git commit -m "F2"', 'git switch main', 'git commit -m "M1"', 'git switch feature', 'git rebase main'] },
  { label: 'Detached HEAD', commands: ['git commit -m "Zweiter Commit"', 'git checkout c1', 'git commit -m "Experiment"'] }
];

function gitSimulator(container) {
  const g = new GitSim();
  container.innerHTML = `
    ${panel('', `<div class="prog-git-head"><div>${notice('Nur simuliert: Es werden keine Dateien verändert und keine Git-Befehle auf deinem System ausgeführt. Commits enthalten keine Dateien, daher gibt es keine Konflikte. Commit-IDs (c1, c2 …) sind fortlaufende Kurz-IDs statt echter SHA-1-Hashes.', 'info')}</div>${simBadge}</div>`)}
    ${layout(
      panel('Befehle', `
        <form id="git-form" class="prog-git-cmd" autocomplete="off">
          <label for="git-line" class="sr-only">Git-Befehl</label>
          <span class="prog-prompt mono" aria-hidden="true">$</span>
          <input class="input mono" id="git-line" placeholder='git commit -m "Nachricht"' maxlength="200" spellcheck="false" autocomplete="off">
          <button type="submit" class="btn btn-sm btn-primary">Ausführen</button>
        </form>
        <p class="hint">Beispiele: <code>git branch feature</code>, <code>git checkout -b feature</code>, <code>git switch main</code>, <code>git merge feature</code>, <code>git rebase main</code>, <code>git log --oneline</code>, <code>git help</code>. Pfeiltaste ↑ holt den letzten Befehl zurück.</p>
        <div class="prog-git-buttons">
          <div class="row">${field({ id: 'g-msg', label: 'Commit-Nachricht', value: 'Neue Funktion', mono: true })}<button type="button" class="btn btn-sm" data-git="commit">Commit</button></div>
          <div class="row">${field({ id: 'g-branch', label: 'Neuer Branch', value: 'feature', mono: true })}<button type="button" class="btn btn-sm" data-git="branch">Anlegen</button><button type="button" class="btn btn-sm" data-git="checkout-b">Anlegen + wechseln</button></div>
          <div class="row"><div class="field"><label for="g-target">Branch</label><select class="select" id="g-target"></select></div><button type="button" class="btn btn-sm" data-git="switch">Wechseln</button><button type="button" class="btn btn-sm" data-git="merge">Hierher mergen</button><button type="button" class="btn btn-sm" data-git="rebase">Rebase auf</button></div>
        </div>
        <div class="tool-actions row">
          <button type="button" class="btn btn-sm" data-git="undo">↶ Rückgängig</button>
          <button type="button" class="btn btn-sm btn-ghost" data-git="reset">Neustart</button>
        </div>
        <div class="tool-actions row">${GIT_SCENARIOS.map((s, i) => `<button type="button" class="btn btn-sm" data-scenario="${i}">Szenario: ${esc(s.label)}</button>`).join('')}</div>
        ${explanation(`
          <p>Ein <strong>Branch</strong> ist nur ein beweglicher Zeiger auf einen Commit; <strong>HEAD</strong> zeigt auf den aktuellen Branch (oder bei „detached HEAD“ direkt auf einen Commit).</p>
          <p><strong>Merge</strong>: Ist der aktuelle Branch Vorfahre des anderen, wird nur der Zeiger vorgerückt (<em>Fast-Forward</em>). Sonst entsteht ein <em>Merge-Commit</em> mit zwei Eltern. <code>--no-ff</code> erzwingt einen Merge-Commit.</p>
          <p><strong>Rebase</strong>: Die eigenen Commits ab der gemeinsamen Basis werden als <em>neue</em> Commits (neue IDs) auf das Ziel gesetzt – die Geschichte wird linear. Die alten Commits sind danach nicht mehr erreichbar (hier ausgegraut). Bereits geteilte Branches deshalb nicht rebasen.</p>`)}
      `),
      '<div id="git-out"></div>'
    )}`;
  const out = container.querySelector('#git-out');
  const line = container.querySelector('#git-line');
  let recall = [];
  let recallIndex = -1;

  const graph = () => {
    const s = g.state;
    const ids = Object.values(s.commits).sort((a, b) => b.seq - a.seq);
    const reach = g.reachable();
    const head = g.headId();
    const laneOf = (c) => Math.max(0, s.lanes.indexOf(c.lane));
    const RH = 36;
    const LW = 26;
    const lanes = s.lanes.length;
    const W = lanes * LW + 14;
    const H = ids.length * RH;
    const row = new Map(ids.map((c, i) => [c.id, i]));
    const X = (c) => 14 + laneOf(c) * LW;
    const Y = (c) => row.get(c.id) * RH + RH / 2;
    const edges = [];
    for (const c of ids) {
      for (const p of c.parents) {
        const pc = s.commits[p];
        const x1 = X(c);
        const y1 = Y(c);
        const x2 = X(pc);
        const y2 = Y(pc);
        const faded = !reach.has(c.id);
        const d = x1 === x2 ? `M${x1} ${y1} L${x2} ${y2}` : `M${x1} ${y1} C${x1} ${y1 + RH * 0.8} ${x2} ${y2 - RH * 0.8} ${x2} ${y2}`;
        edges.push(`<path class="prog-git-edge${faded ? ' faded' : ''}" d="${d}" style="stroke:var(--c-${PALETTE[laneOf(c) % PALETTE.length]})"/>`);
      }
    }
    const nodes = ids.map((c) => {
      const color = `var(--c-${PALETTE[laneOf(c) % PALETTE.length]})`;
      const faded = !reach.has(c.id);
      return `<g class="prog-git-node${faded ? ' faded' : ''}${c.id === head ? ' head' : ''}"><circle cx="${X(c)}" cy="${Y(c)}" r="${c.id === head ? 9 : 7}" style="stroke:${color};fill:${c.parents.length > 1 ? 'var(--surface)' : color}"/></g>`;
    });
    const labels = ids.map((c) => {
      const faded = !reach.has(c.id);
      const branchNames = Object.entries(s.branches).filter(([, id]) => id === c.id).map(([n]) => n);
      const chips = [];
      if (c.id === head) chips.push(`<span class="prog-git-chip head">HEAD${s.head.branch ? ` → ${esc(s.head.branch)}` : ' (losgelöst)'}</span>`);
      for (const n of branchNames) if (!(c.id === head && s.head.branch === n)) chips.push(`<span class="prog-git-chip">${esc(n)}</span>`);
      return `<div class="prog-git-row${faded ? ' faded' : ''}" style="height:${RH}px"><span class="prog-git-id mono">${c.id}</span>${chips.join('')}<span class="prog-git-msg">${esc(c.message)}</span>${c.rebasedFrom ? `<span class="tiny faint">(neu aus ${c.rebasedFrom})</span>` : ''}${faded ? '<span class="tiny faint">unerreichbar</span>' : ''}${c.parents.length > 1 ? '<span class="tiny faint">Merge</span>' : ''}</div>`;
    });
    return `<div class="prog-git-graph"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${edges.join('')}${nodes.join('')}</svg><div class="prog-git-labels">${labels.join('')}</div></div>`;
  };

  const render = () => {
    const s = g.state;
    const select = container.querySelector('#g-target');
    const prev = select.value;
    const names = Object.keys(s.branches).sort();
    select.innerHTML = names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    if (names.includes(prev)) select.value = prev;
    container.querySelector('[data-git="undo"]').disabled = !g.past.length;
    const hist = g.history.slice(-40);
    out.innerHTML = `${panel('Commit-Graph', `
        ${resultList([
          { label: 'HEAD', value: s.head.branch ? `→ ${s.head.branch} (${g.headId()})` : `losgelöst bei ${s.head.detached}`, copy: false },
          { label: 'Branches', value: names.map((n) => `${n} → ${s.branches[n]}`).join(', '), copy: false }
        ])}
        <p class="small subtle mt-1">Neueste Commits oben. Gefüllter Kreis = Commit, Ring = Merge-Commit, ausgegraut = unerreichbar.</p>
        ${graph()}`)}
      ${panel('Verlauf (simuliertes Terminal)', hist.length ? `<div class="prog-term" role="log">${hist
        .map((h) => `<div class="prog-term-entry${h.undone ? ' undone' : ''}"><div class="prog-term-cmd"><span aria-hidden="true">$ </span>${esc(h.command)}${h.undone ? ' <span class="tiny">(rückgängig gemacht)</span>' : ''}</div>${h.output.length ? `<pre class="prog-term-out${h.ok ? '' : ' err'}">${esc(h.output.join('\n'))}</pre>` : ''}</div>`)
        .join('')}</div>` : '<p class="small subtle">Noch keine Befehle. Start: ein Commit c1 auf main.</p>')}`;
    const term = out.querySelector('.prog-term');
    if (term) term.scrollTop = term.scrollHeight;
  };

  const exec = (cmd) => {
    g.run(cmd);
    recall.push(cmd);
    recallIndex = recall.length;
    render();
  };
  container.querySelector('#git-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const cmd = line.value.trim();
    if (!cmd) return;
    exec(cmd);
    line.value = '';
  });
  line.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp' && recall.length) {
      recallIndex = Math.max(0, recallIndex - 1);
      line.value = recall[recallIndex];
      event.preventDefault();
    } else if (event.key === 'ArrowDown' && recall.length) {
      recallIndex = Math.min(recall.length, recallIndex + 1);
      line.value = recall[recallIndex] ?? '';
      event.preventDefault();
    }
  });
  const quote = (text) => `"${String(text).replace(/"/g, "'")}"`;
  container.addEventListener('click', (event) => {
    const b = event.target.closest('[data-git], [data-scenario]');
    if (!b) return;
    if (b.dataset.scenario !== undefined) {
      g.reset();
      for (const cmd of GIT_SCENARIOS[Number(b.dataset.scenario)].commands) g.run(cmd);
      render();
      return;
    }
    const target = container.querySelector('#g-target').value;
    const action = b.dataset.git;
    if (action === 'commit') exec(`git commit -m ${quote(container.querySelector('#g-msg').value.trim())}`);
    else if (action === 'branch') exec(`git branch ${container.querySelector('#g-branch').value.trim()}`);
    else if (action === 'checkout-b') exec(`git checkout -b ${container.querySelector('#g-branch').value.trim()}`);
    else if (action === 'switch') exec(`git switch ${target}`);
    else if (action === 'merge') exec(`git merge ${target}`);
    else if (action === 'rebase') exec(`git rebase ${target}`);
    else if (action === 'undo') {
      g.undo();
      render();
    } else if (action === 'reset') {
      g.reset();
      recall = [];
      render();
    }
  });
  render();
}

const TOOLS = {
  sortieren,
  'big-o': bigO,
  datenstrukturen,
  regex,
  'git-simulator': gitSimulator
};

export function render(toolId, container, ctx) {
  const tool = TOOLS[toolId];
  if (!tool) throw new Error(`Unbekanntes Werkzeug: ${toolId}`);
  return tool(container, ctx);
}
