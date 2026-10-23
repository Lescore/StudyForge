/**
 * Werkzeuge „Rechnerarchitektur & Logik“: Logikgatter, Schaltungssimulator,
 * ASCII-/Unicode-Tabelle und Speicherlayout.
 * Rechenlogik in ../core/logic-*.js, charset.js, memory-layout.js (ohne DOM, getestet).
 */
import { esc, field, segmented, layout, panel, resultList, steps, notice, explanation, toolActions, live, table, readForm, writeForm, errorHtml } from '../kit.js';
import {
  GATES, gateTable, gateOutput, analyzeExpression, implicantPattern, implicantText
} from '../core/logic-expr.js';
import {
  EXAMPLES as CIRCUITS, GATE_TYPES, MAX_INPUTS, MAX_GATES, analyzeCircuit, evaluateCircuit, circuitTruthTable, gateExpression, gateDepths
} from '../core/logic-circuit.js';
import {
  ASCII_CONTROL, BLOCKS, describeCodepoint, parseCodepointQuery, blockPage, parseHexCodepoint, analyzeText, uPlus, hex as hexPad
} from '../core/charset.js';
import {
  SIZES, TYPES, createMemory, parseAddress, parseBytes, writeBytes, encodeValue, writeValue, readValue, hexdump, hexdumpText, textBytes, isPrintable
} from '../core/memory-layout.js';
import { InputError } from '../core/num.js';

const IEC = { AND: '&', OR: '≥1', XOR: '=1', NOT: '1', NAND: '&', NOR: '≥1', XNOR: '=' };
const NEGATED = new Set(['NOT', 'NAND', 'NOR', 'XNOR']);
const sig = (v) => (v === 1 ? 'arch-s1' : v === 0 ? 'arch-s0' : 'arch-sx');
const sigText = (v) => (v === 1 ? '1' : v === 0 ? '0' : '?');

/** Schalter für eine Variable (echter Button mit aria-pressed). */
function switchButton(name, value, attrs) {
  return `<button type="button" class="arch-switch ${sig(value)}" aria-pressed="${value === 1}" ${attrs} aria-label="${esc(name)} umschalten, aktuell ${value}"><span class="arch-switch-name">${esc(name)}</span><span class="arch-switch-val">${value}</span></button>`;
}

/** Gattersymbol nach IEC 60617 (Rechteck mit Kennzeichen) als SVG. */
function gateSymbol(type, inputs, out, names) {
  const n = inputs.length;
  const h = Math.max(60, 22 * n + 16);
  const pinY = (k) => (h / (n + 1)) * (k + 1);
  const lines = inputs.map((v, k) => `<line x1="8" y1="${pinY(k)}" x2="60" y2="${pinY(k)}" class="arch-wire ${sig(v)}"/><text x="4" y="${pinY(k) - 5}" class="arch-svg-small">${esc(names[k])}=${v}</text>`).join('');
  const bubble = NEGATED.has(type) ? `<circle cx="146" cy="${h / 2}" r="6" class="arch-bubble"/>` : '';
  return `<svg class="arch-gate-svg" viewBox="0 0 220 ${h}" role="img" aria-label="${esc(type)}-Gatter, Ausgang ${out}">
    ${lines}
    <rect x="60" y="4" width="80" height="${h - 8}" rx="4" class="arch-gate-box"/>
    <text x="100" y="${h / 2 + 6}" text-anchor="middle" class="arch-svg-label">${esc(IEC[type])}</text>
    ${bubble}
    <line x1="${NEGATED.has(type) ? 152 : 140}" y1="${h / 2}" x2="196" y2="${h / 2}" class="arch-wire ${sig(out)}"/>
    <text x="200" y="${h / 2 + 5}" class="arch-svg-label arch-svg-out">${out}</text>
  </svg>`;
}

function truthTableHtml(names, rows, current, outName = 'Y') {
  return table([...names, outName], rows.map((r) => [...r.inputs.map(String), { html: `<strong class="${sig(r.out)}-text">${r.out}</strong>` }]), { className: 'arch-tt' })
    .replace(/<tbody>([\s\S]*)<\/tbody>/, (m, body) => {
      let i = -1;
      return `<tbody>${body.replace(/<tr>/g, () => {
        i += 1;
        return i === current ? '<tr class="highlight" aria-current="true">' : '<tr>';
      })}</tbody>`;
    });
}

/**
 * Ausgabeziel für live(), das nur bei geändertem HTML neu rendert. So gehen
 * Klicks auf Schalter nicht verloren, wenn ein blur/change-Ereignis eines
 * Eingabefelds zwischen mousedown und click eine (identische) Neuberechnung auslöst.
 */
function stableOutput(el) {
  let last = null;
  return {
    set innerHTML(html) {
      if (html === last) return;
      last = html;
      el.innerHTML = html;
    },
    get innerHTML() {
      return el.innerHTML;
    }
  };
}

/* ------------------------------------------------------------ Logikgatter */
function logikgatter(container) {
  const defaults = { lmode: 'expr', gtype: 'AND', gn: '2', expr: 'A AND B OR NOT C' };
  const examples = [
    { label: 'XOR aus AND/OR/NOT', values: { lmode: 'expr', expr: "A·B' + A'·B" } },
    { label: 'Mehrheitsfunktion', values: { lmode: 'expr', expr: 'A·B + A·C + B·C + A·B·C' } },
    { label: 'Quine-McCluskey (4 Var.)', values: { lmode: 'expr', expr: '(¬B ∧ ¬C) ∨ (C ∧ ¬D) ∨ (¬A ∧ B ∧ D) ∨ (¬B ∧ ¬D)' } },
    { label: 'NAND-Gatter, 3 Eingänge', values: { lmode: 'gate', gtype: 'NAND', gn: '3' } }
  ];
  let bits = [0, 0, 0, 0];
  container.innerHTML = layout(
    panel('Eingabe', `
      ${segmented({ name: 'lmode', label: 'Modus', value: defaults.lmode, options: [['expr', 'Boolescher Ausdruck'], ['gate', 'Einzelnes Gatter']] })}
      <div data-lg="gate">
        <div class="form-row">
          ${field({ id: 'gtype', label: 'Gatter', value: defaults.gtype, options: Object.keys(GATES).map((g) => [g, g]) })}
          ${field({ id: 'gn', label: 'Eingänge', value: defaults.gn, options: [['2', '2'], ['3', '3'], ['4', '4']] })}
        </div>
      </div>
      <div data-lg="expr">
        ${field({ id: 'expr', label: 'Ausdruck (Variablen A–Z, höchstens 4)', value: defaults.expr, mono: true, wide: true, attrs: 'maxlength="500"' })}
        <p class="hint">Operatoren: AND &amp; ∧ · * &nbsp;|&nbsp; OR | ∨ + &nbsp;|&nbsp; NOT ! ¬ ~ oder nachgestellt ' &nbsp;|&nbsp; XOR ^ ⊕ &nbsp;|&nbsp; NAND, NOR, XNOR &nbsp;|&nbsp; Klammern, Konstanten 0 und 1. Rangfolge: NOT vor AND/NAND vor XOR/XNOR vor OR/NOR; gleiche Stufe von links nach rechts.</p>
      </div>
      ${toolActions({ examples })}
      ${explanation(`
        <p><strong>Gatter:</strong> AND ist 1, wenn alle Eingänge 1 sind; OR, wenn mindestens einer 1 ist; NOT kehrt um; XOR ist bei zwei Eingängen 1, wenn genau einer 1 ist (bei mehr Eingängen: ungerade Anzahl Einsen). NAND, NOR und XNOR sind die Negationen davon. NAND und NOR sind jeweils <em>funktional vollständig</em>: Jede Schaltung lässt sich nur aus ihnen bauen.</p>
        <p><strong>Wahrheitstabelle:</strong> Bei n Variablen gibt es 2ⁿ Belegungen. Die Zeilennummer ist die Belegung als Binärzahl (erste Variable = höchstwertiges Bit).</p>
        <p><strong>Normalformen:</strong> Die kanonische DNF verodert alle Minterme (Zeilen mit Ergebnis 1), die kanonische KNF verundet alle Maxterme (Zeilen mit 0).</p>
        <p><strong>Quine-McCluskey:</strong> Minterme, die sich in genau einem Bit unterscheiden, werden schrittweise zusammengefasst, bis nur Primimplikanten übrig sind. Dann werden die wesentlichen Primimplikanten gewählt und die restlichen Minterme mit möglichst wenigen Termen (dann Literalen) überdeckt. Für bis zu 4 Variablen wird die Auswahl hier exakt durchsucht; das Ergebnis wird gegen die Wahrheitstabelle geprüft.</p>`)}
    `),
    '<div id="out"></div>'
  );

  const ctl = live(container, {
    output: stableOutput(container.querySelector('#out')),
    defaults,
    examples,
    compute: (v) => {
      container.querySelectorAll('[data-lg]').forEach((el) => (el.hidden = el.dataset.lg !== v.lmode));
      const gnSelect = container.querySelector('#gn');
      gnSelect.disabled = v.gtype === 'NOT';
      if (v.lmode === 'gate') {
        const n = v.gtype === 'NOT' ? 1 : Number(v.gn);
        const names = ['A', 'B', 'C', 'D'].slice(0, n);
        const ins = bits.slice(0, n);
        const out = gateOutput(v.gtype, ins);
        const index = ins.reduce((acc, b) => acc * 2 + b, 0);
        return panel(`${v.gtype}-Gatter`, `
          <div class="arch-switches" role="group" aria-label="Eingänge">${names.map((nm, k) => switchButton(nm, ins[k], `data-bit="${k}"`)).join('')}</div>
          <div class="arch-gate-view">${gateSymbol(v.gtype, ins, out, names)}</div>
          ${resultList([{ label: 'Ausgang Y', value: String(out), strong: true }, { label: 'Funktion', value: GATES[v.gtype].desc, mono: false, copy: false }])}
          ${truthTableHtml(names, gateTable(v.gtype, n), index)}
          <p class="small subtle">Hervorgehoben: aktuelle Belegung. Schalter mit Klick oder Leertaste umschalten.</p>`);
      }
      let r;
      try {
        r = analyzeExpression(v.expr);
      } catch (error) {
        if (error.position === undefined) throw error;
        const caret = `${' '.repeat(error.position)}^`;
        return `${errorHtml(error)}<pre class="mono-block arch-caret" aria-hidden="true">${esc(String(v.expr))}\n${caret}</pre>`;
      }
      const ins = bits.slice(0, r.vars.length);
      const env = Object.fromEntries(r.vars.map((nm, k) => [nm, ins[k]]));
      const index = ins.reduce((acc, b) => acc * 2 + b, 0);
      const out = r.rows[index].out;
      const allOk = r.verified.dnf && r.verified.knf && r.verified.minimal;
      const qm = r.minimal;
      return panel('Ergebnis', `
        ${r.vars.length ? `<div class="arch-switches" role="group" aria-label="Variablen">${r.vars.map((nm, k) => switchButton(nm, ins[k], `data-bit="${k}"`)).join('')}<span class="arch-eq">→</span><span class="arch-out ${sig(out)}" aria-live="polite">Y = ${out}</span></div>` : notice(`Der Ausdruck enthält keine Variablen; er ist konstant ${out}.`, 'info')}
        ${resultList([
          { label: 'Gelesen als', value: r.normalized },
          { label: 'Aktuell', value: `${r.vars.map((nm) => `${nm}=${env[nm]}`).join(', ') || '–'} → Y = ${out}`, copy: false },
          { label: 'Minterme', value: r.minterms.length ? `Σm(${r.minterms.join(', ')})` : 'keine (immer 0)' },
          { label: 'Maxterme', value: r.maxterms.length ? `ΠM(${r.maxterms.join(', ')})` : 'keine (immer 1)' },
          { label: 'Kanonische DNF', value: r.dnf },
          { label: 'Kanonische KNF', value: r.knf },
          { label: 'Minimale DNF', value: r.minimalText, strong: true }
        ])}
        ${allOk ? notice('Geprüft: Kanonische DNF, KNF und minimale DNF haben für alle Belegungen dieselbe Wahrheitstabelle wie der eingegebene Ausdruck.', 'success') : notice('Interner Prüffehler: Eine Normalform stimmt nicht mit der Wahrheitstabelle überein. Bitte melden.', 'error')}
        ${r.vars.length ? truthTableHtml(r.vars, r.rows, index) : ''}
        ${r.vars.length && r.minterms.length && r.maxterms.length ? steps([
          `Minterme (Zeilen mit Y = 1): ${r.minterms.join(', ')}`,
          ...qm.stages.map((stage, s) => ({ html: `Stufe ${s + 1}: ${stage.map((t) => `<code>${esc(implicantPattern(t, r.vars.length))}</code>`).join(' ')}` })),
          { html: `Primimplikanten: ${qm.primes.map((p) => `<code>${esc(implicantPattern(p, r.vars.length))}</code> = ${esc(implicantText(p, r.vars))} (deckt ${p.from.filter((m) => r.minterms.includes(m)).join(', ')})`).join('; ')}` },
          `Wesentliche Primimplikanten: ${qm.essential.length ? qm.essential.map((p) => implicantText(p, r.vars)).join(', ') : 'keine'}`,
          `Gewählte Überdeckung: ${r.minimalText} (${qm.terms.length} Term${qm.terms.length === 1 ? '' : 'e'})`
        ], { title: 'Rechenweg Quine-McCluskey', open: false }) : ''}`);
    }
  });
  container.addEventListener('click', (event) => {
    const button = event.target.closest('[data-bit]');
    if (!button) return;
    const k = Number(button.dataset.bit);
    bits[k] = 1 - bits[k];
    ctl.run();
    container.querySelector(`[data-bit="${k}"]`)?.focus();
  });
  container.querySelector('[data-tool-reset]').addEventListener('click', () => (bits = [0, 0, 0, 0]));
  return ctl.destroy;
}

/* ------------------------------------------------------------ Logikschaltung */
function logikschaltung(container) {
  let circuit = CIRCUITS.halbaddierer.build();
  let nextId = 100;
  const exampleButtons = Object.entries(CIRCUITS).map(([id, ex]) => `<button type="button" class="btn btn-sm" data-circuit="${id}">Beispiel: ${esc(ex.label)}</button>`).join('');
  container.innerHTML = `
    <div class="row arch-sim-head"><span class="tool-badge-sim">Simulation</span><span class="small subtle">Rein rechnerische Simulation im Browser – die Schaltung existiert nur im Arbeitsspeicher dieser Seite und wird nicht gespeichert.</span></div>
    <div class="tool-actions row">${exampleButtons}<button type="button" class="btn btn-sm btn-ghost" data-circuit="empty">Leere Schaltung</button><button type="button" class="btn btn-sm btn-ghost" data-tool-reset>Zurücksetzen</button></div>
    ${layout(
      `<div class="arch-col">${panel('Eingänge', '<div id="arch-inputs" class="stack"></div><button type="button" class="btn btn-sm mt-1" id="arch-add-input">+ Eingang</button>')}
       ${panel('Gatter', '<div id="arch-gates" class="stack"></div><button type="button" class="btn btn-sm mt-1" id="arch-add-gate">+ Gatter</button>')}</div>`,
      `<div id="arch-view" class="arch-col"></div>`
    )}
    ${explanation(`
      <p>Eine <strong>kombinatorische Schaltung</strong> berechnet ihre Ausgänge allein aus den aktuellen Eingängen – ohne Speicher. Deshalb darf es keine Rückkopplung (Zyklus) geben; Schaltungen mit Rückkopplung (z. B. Flipflops) sind <em>sequenziell</em> und werden hier nicht simuliert.</p>
      <p><strong>Halbaddierer:</strong> S = A ⊕ B, C = A · B. <strong>Volladdierer:</strong> zwei Halbaddierer plus OR für den Übertrag. <strong>Multiplexer 2:1:</strong> Y = D0 · ¬Sel + D1 · Sel.</p>
      <p>Jeder Gattereingang muss mit genau einer Quelle (Eingang oder Ausgang eines anderen Gatters) verbunden sein. Signalfarben: grün = 1, grau = 0, gelb = unbestimmt (offener Eingang oder Zyklus).</p>`)}`;

  const inputsEl = container.querySelector('#arch-inputs');
  const gatesEl = container.querySelector('#arch-gates');
  const view = container.querySelector('#arch-view');

  const sourceOptions = (gate) => {
    const opts = [['', '– offen –'], ...circuit.inputs.map((i) => [`in:${i.id}`, `Eingang ${i.name}`]), ...circuit.gates.filter((g) => g.id !== gate.id).map((g) => [`g:${g.id}`, `${g.label} (${g.type})`])];
    return opts;
  };

  const renderEditor = () => {
    const active = document.activeElement?.id;
    inputsEl.innerHTML = circuit.inputs.length ? circuit.inputs.map((input) => `
      <div class="arch-input-row">
        ${field({ id: `in-name-${input.id}`, label: 'Name', value: input.name, mono: true, attrs: `data-in-name="${input.id}" maxlength="12"` })}
        ${switchButton(input.name, input.value, `data-in-toggle="${input.id}" id="in-toggle-${input.id}"`)}
        <button type="button" class="icon-btn" id="in-del-${input.id}" data-in-del="${input.id}" aria-label="Eingang ${esc(input.name)} entfernen" title="Entfernen">✕</button>
      </div>`).join('') : '<p class="small subtle">Keine Eingänge.</p>';
    gatesEl.innerHTML = circuit.gates.length ? circuit.gates.map((gate) => `
      <div class="arch-gate-card" data-gate="${gate.id}">
        <div class="arch-gate-top">
          ${field({ id: `g-label-${gate.id}`, label: 'Name', value: gate.label, mono: true, attrs: `data-g-label="${gate.id}" maxlength="12"` })}
          ${field({ id: `g-type-${gate.id}`, label: 'Typ', value: gate.type, options: GATE_TYPES.map((t) => [t, t]), attrs: `data-g-type="${gate.id}"` })}
          ${field({ id: `g-n-${gate.id}`, label: 'Eingänge', value: String(gate.inputs.length), options: gate.type === 'NOT' ? [['1', '1']] : [['2', '2'], ['3', '3'], ['4', '4']], attrs: `data-g-n="${gate.id}"${gate.type === 'NOT' ? ' disabled' : ''}` })}
          <span class="arch-gate-out" data-gate-value="${gate.id}" aria-live="polite">?</span>
          <button type="button" class="icon-btn" id="g-del-${gate.id}" data-g-del="${gate.id}" aria-label="Gatter ${esc(gate.label)} entfernen" title="Entfernen">✕</button>
        </div>
        <div class="arch-gate-ins">
          ${gate.inputs.map((ref, k) => field({ id: `g-in-${gate.id}-${k}`, label: `Eingang ${k + 1}`, value: ref, options: sourceOptions(gate), attrs: `data-g-in="${gate.id}" data-k="${k}"` })).join('')}
        </div>
        <label class="checkbox"><input type="checkbox" id="g-out-${gate.id}" data-g-out="${gate.id}"${gate.output ? ' checked' : ''}> Als Ausgang markieren</label>
      </div>`).join('') : '<p class="small subtle">Noch keine Gatter – füge eines hinzu.</p>';
    container.querySelector('#arch-add-input').disabled = circuit.inputs.length >= MAX_INPUTS;
    container.querySelector('#arch-add-gate').disabled = circuit.gates.length >= MAX_GATES;
    if (active) container.querySelector(`#${CSS.escape(active)}`)?.focus();
  };

  const renderView = () => {
    const check = analyzeCircuit(circuit);
    const ev = evaluateCircuit(circuit);
    for (const gate of circuit.gates) {
      const el = gatesEl.querySelector(`[data-gate-value="${gate.id}"]`);
      if (el) {
        const v = ev.gates.get(gate.id);
        el.className = `arch-gate-out ${sig(v)}`;
        el.textContent = sigText(v);
        el.setAttribute('aria-label', `Ausgang ${gate.label}: ${v === null ? 'unbestimmt' : v}`);
      }
    }
    const outputs = circuit.gates.filter((g) => g.output);
    let tt = '';
    if (check.valid) {
      try {
        const t = circuitTruthTable(circuit);
        const current = circuit.inputs.reduce((acc, i) => acc * 2 + (i.value ? 1 : 0), 0);
        const rows = t.rows.map((r, idx) => `<tr${idx === current ? ' class="highlight" aria-current="true"' : ''}>${r.inputs.map((b) => `<td>${b}</td>`).join('')}${r.outputs.map((b) => `<td><strong class="${sig(b)}-text">${b}</strong></td>`).join('')}</tr>`).join('');
        tt = `<div class="table-wrap"><table class="data tool-table arch-tt"><thead><tr>${t.inputs.map((n) => `<th>${esc(n)}</th>`).join('')}${t.outputs.map((n) => `<th class="arch-th-out">${esc(n)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
      } catch (error) {
        tt = errorHtml(error);
      }
    }
    view.innerHTML = `
      ${panel('Zustand', `
        ${check.errors.length ? `<div class="tool-notice error" role="alert"><strong>Fehler:</strong><ul class="arch-list">${check.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : notice('Schaltung ist vollständig verbunden und kombinatorisch (keine Zyklen).', 'success')}
        ${check.warnings.length ? `<div class="tool-notice warning" role="note"><strong>Hinweis:</strong><ul class="arch-list">${check.warnings.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
        ${outputs.length ? resultList(outputs.map((g) => ({ label: `${g.label} =`, value: `${gateExpression(circuit, g.id)}  →  ${sigText(ev.gates.get(g.id))}`, copyText: gateExpression(circuit, g.id), strong: true }))) : ''}
      `)}
      ${panel('Schaltplan (schematisch)', schematic(circuit, ev))}
      ${check.valid ? panel('Wahrheitstabelle der Schaltung', `${tt}<p class="small subtle">Hervorgehoben: aktuelle Belegung der Eingänge.</p>`) : ''}`;
  };

  const refresh = (editor = true) => {
    if (editor) renderEditor();
    renderView();
  };
  const gateById = (id) => circuit.gates.find((g) => g.id === id);

  container.addEventListener('input', (event) => {
    const t = event.target;
    if (t.dataset.inName) {
      circuit.inputs.find((i) => i.id === t.dataset.inName).name = t.value.trim();
      renderView();
    } else if (t.dataset.gLabel) {
      gateById(t.dataset.gLabel).label = t.value.trim();
      renderView();
    }
  });
  container.addEventListener('change', (event) => {
    const t = event.target;
    if (t.dataset.inName || t.dataset.gLabel) refresh(); // Auswahllisten mit neuen Namen
    else if (t.dataset.gType) {
      const gate = gateById(t.dataset.gType);
      gate.type = t.value;
      if (gate.type === 'NOT') gate.inputs = gate.inputs.slice(0, 1);
      else if (gate.inputs.length < 2) gate.inputs = [...gate.inputs, ''].slice(0, 2);
      refresh();
    } else if (t.dataset.gN) {
      const gate = gateById(t.dataset.gN);
      const n = Number(t.value);
      gate.inputs = Array.from({ length: n }, (_, k) => gate.inputs[k] ?? '');
      refresh();
    } else if (t.dataset.gIn) {
      gateById(t.dataset.gIn).inputs[Number(t.dataset.k)] = t.value;
      refresh(false);
    } else if (t.dataset.gOut) {
      gateById(t.dataset.gOut).output = t.checked;
      refresh(false);
    }
  });
  container.addEventListener('click', (event) => {
    const t = event.target.closest('button');
    if (!t) return;
    if (t.dataset.inToggle) {
      const input = circuit.inputs.find((i) => i.id === t.dataset.inToggle);
      input.value = input.value ? 0 : 1;
      t.outerHTML = switchButton(input.name, input.value, `data-in-toggle="${input.id}" id="in-toggle-${input.id}"`);
      container.querySelector(`#in-toggle-${CSS.escape(input.id)}`).focus();
      renderView();
    } else if (t.dataset.inDel) {
      const id = t.dataset.inDel;
      circuit.inputs = circuit.inputs.filter((i) => i.id !== id);
      circuit.gates.forEach((g) => (g.inputs = g.inputs.map((r) => (r === `in:${id}` ? '' : r))));
      refresh();
    } else if (t.dataset.gDel) {
      const id = t.dataset.gDel;
      circuit.gates = circuit.gates.filter((g) => g.id !== id);
      circuit.gates.forEach((g) => (g.inputs = g.inputs.map((r) => (r === `g:${id}` ? '' : r))));
      refresh();
    } else if (t.id === 'arch-add-input' && circuit.inputs.length < MAX_INPUTS) {
      const used = new Set([...circuit.inputs.map((i) => i.name), ...circuit.gates.map((g) => g.label)]);
      const name = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((c) => !used.has(c)) ?? `E${nextId}`;
      const id = `i${nextId++}`;
      circuit.inputs.push({ id, name, value: 0 });
      refresh();
      container.querySelector(`#in-name-${id}`)?.focus();
    } else if (t.id === 'arch-add-gate' && circuit.gates.length < MAX_GATES) {
      const used = new Set([...circuit.inputs.map((i) => i.name), ...circuit.gates.map((g) => g.label)]);
      let k = circuit.gates.length + 1;
      while (used.has(`G${k}`)) k += 1;
      const id = `g${nextId++}`;
      circuit.gates.push({ id, type: 'AND', label: `G${k}`, inputs: ['', ''], output: false });
      refresh();
      container.querySelector(`#g-type-${id}`)?.focus();
    } else if (t.dataset.circuit) {
      circuit = t.dataset.circuit === 'empty' ? { inputs: [{ id: 'i1', name: 'A', value: 0 }, { id: 'i2', name: 'B', value: 0 }], gates: [] } : CIRCUITS[t.dataset.circuit].build();
      refresh();
    } else if (t.hasAttribute('data-tool-reset')) {
      circuit = CIRCUITS.halbaddierer.build();
      refresh();
    }
  });
  refresh();
}

/** Schematische Darstellung: Spalten nach Logiktiefe, Verbindungen als Kurven. */
function schematic(circuit, ev) {
  if (!circuit.gates.length && !circuit.inputs.length) return '<p class="small subtle">Leer.</p>';
  const depth = gateDepths(circuit);
  const cols = [circuit.inputs.map((i) => ({ kind: 'in', item: i }))];
  for (const g of circuit.gates) {
    const d = depth.get(g.id);
    while (cols.length <= d) cols.push([]);
    cols[d].push({ kind: 'g', item: g });
  }
  const colW = 130;
  const pad = 14;
  const nodeH = (node) => (node.kind === 'in' ? 28 : Math.max(36, 14 * node.item.inputs.length + 12));
  const pos = new Map();
  let height = 0;
  cols.forEach((col, c) => {
    let y = pad;
    for (const node of col) {
      const h = nodeH(node);
      pos.set(`${node.kind}:${node.item.id}`, { x: pad + c * colW, y, h, node });
      y += h + 18;
    }
    height = Math.max(height, y);
  });
  const width = pad * 2 + (cols.length - 1) * colW + 210;
  const wires = [];
  const boxes = [];
  for (const p of pos.values()) {
    const { node } = p;
    if (node.kind === 'in') {
      const v = node.item.value ? 1 : 0;
      boxes.push(`<g><rect x="${p.x}" y="${p.y}" width="56" height="${p.h}" rx="14" class="arch-node-in ${sig(v)}"/><text x="${p.x + 28}" y="${p.y + 18}" text-anchor="middle" class="arch-svg-small arch-svg-strong">${esc(node.item.name)}=${v}</text></g>`);
      continue;
    }
    const g = node.item;
    const v = ev.gates.get(g.id);
    const n = g.inputs.length;
    const gx = p.x + 20;
    g.inputs.forEach((ref, k) => {
      const py = p.y + (p.h / (n + 1)) * (k + 1);
      if (!ref) {
        wires.push(`<line x1="${gx - 14}" y1="${py}" x2="${gx}" y2="${py}" class="arch-wire arch-sx" stroke-dasharray="3 3"/><circle cx="${gx - 14}" cy="${py}" r="3" class="arch-open"/>`);
        return;
      }
      const src = pos.get(ref);
      if (!src) return;
      const sx = src.node.kind === 'in' ? src.x + 56 : src.x + 20 + 66 + (NEGATED.has(src.node.item.type) ? 8 : 0);
      const sy = src.y + src.h / 2;
      const sv = src.node.kind === 'in' ? (src.node.item.value ? 1 : 0) : ev.gates.get(src.node.item.id);
      const back = sx >= gx;
      const midX = back ? Math.max(sx, gx) + 30 : (sx + gx) / 2;
      const path = back
        ? `M${sx},${sy} C${midX},${sy} ${midX},${Math.min(sy, py) - 30} ${(sx + gx) / 2},${Math.min(sy, py) - 30} S${gx - 30},${py} ${gx},${py}`
        : `M${sx},${sy} C${midX},${sy} ${midX},${py} ${gx},${py}`;
      wires.push(`<path d="${path}" class="arch-wire ${sig(sv)}${back ? ' arch-wire-back' : ''}"/>`);
    });
    const bubble = NEGATED.has(g.type) ? `<circle cx="${gx + 66 + 4}" cy="${p.y + p.h / 2}" r="4" class="arch-bubble"/>` : '';
    const outX = gx + 66 + (NEGATED.has(g.type) ? 8 : 0);
    boxes.push(`<g>
      <rect x="${gx}" y="${p.y}" width="66" height="${p.h}" rx="4" class="arch-gate-box"/>
      <text x="${gx + 33}" y="${p.y + p.h / 2 + 2}" text-anchor="middle" class="arch-svg-label">${esc(IEC[g.type])}</text>
      <text x="${gx + 33}" y="${p.y + p.h - 4}" text-anchor="middle" class="arch-svg-tiny">${esc(g.label)}</text>
      ${bubble}
      ${g.output ? `<line x1="${outX}" y1="${p.y + p.h / 2}" x2="${outX + 22}" y2="${p.y + p.h / 2}" class="arch-wire ${sig(v)}"/><text x="${outX + 25}" y="${p.y + p.h / 2 + 4}" class="arch-svg-small arch-svg-strong">${esc(g.label)}=${sigText(v)}</text>` : ''}
    </g>`);
  }
  return `<div class="arch-schematic"><svg viewBox="0 0 ${width} ${Math.max(height, 60)}" width="${width}" role="img" aria-label="Schaltplan mit ${circuit.inputs.length} Eingängen und ${circuit.gates.length} Gattern">${wires.join('')}${boxes.join('')}</svg></div>
    <p class="small subtle">Rechteckige Symbole nach IEC 60617 (&amp; = AND, ≥1 = OR, =1 = XOR, 1 = NOT/Puffer; Kreis = Negation). Grün = 1, grau = 0, gelb gestrichelt = offen/unbestimmt.</p>`;
}

/* ------------------------------------------------------------ Zeichentabelle */
function zeichentabelle(container) {
  const defaults = { cmode: 'search', query: 'é', block: 'greek', start: '2190', end: '21FF', psize: '128', ctrlOnly: false, text: '\u00e9e\u0301👍🏽👩‍💻🇩🇪' };
  const examples = [
    { label: 'U+20AC (€)', values: { cmode: 'search', query: 'U+20AC' } },
    { label: 'Dezimal 65', values: { cmode: 'search', query: '65' } },
    { label: 'Emoji 😀', values: { cmode: 'search', query: '😀' } },
    { label: 'é: 1 oder 2 Codepoints', values: { cmode: 'graphem', text: '\u00e9 / e\u0301' } },
    { label: 'Emoji-Sequenzen', values: { cmode: 'graphem', text: '👍🏽👩‍💻🇩🇪' } },
    { label: 'Pfeile', values: { cmode: 'blocks', block: 'arrows' } }
  ];
  let page = 0;
  let lastBlockKey = '';
  container.innerHTML = layout(
    panel('Eingabe', `
      ${segmented({ name: 'cmode', label: 'Ansicht', value: defaults.cmode, options: [['search', 'Zeichen suchen'], ['ascii', 'ASCII-Tabelle'], ['blocks', 'Unicode-Blöcke'], ['graphem', 'Text zerlegen']] })}
      <div data-cm="search">
        ${field({ id: 'query', label: 'Zeichen, Codepoint oder Zahl', value: defaults.query, mono: true, attrs: 'maxlength="200"', hint: 'z. B. é, U+00E9, 0xE9, 233 oder &#233; – mehrere Zeichen werden einzeln gezeigt (höchstens 20).' })}
      </div>
      <div data-cm="ascii">${'<label class="checkbox"><input type="checkbox" id="ctrlOnly" name="ctrlOnly"> Nur Steuerzeichen zeigen</label>'}</div>
      <div data-cm="blocks">
        ${field({ id: 'block', label: 'Block', value: defaults.block, options: [...BLOCKS.map((b) => [b.id, `${b.label} (${uPlus(b.start)}–${uPlus(b.end)})`]), ['custom', 'Eigener Bereich …']] })}
        <div class="form-row" data-custom-range>
          ${field({ id: 'start', label: 'Von (hex)', value: defaults.start, mono: true })}
          ${field({ id: 'end', label: 'Bis (hex)', value: defaults.end, mono: true })}
        </div>
        ${field({ id: 'psize', label: 'Zeichen pro Seite', value: defaults.psize, options: [['64', '64'], ['128', '128'], ['256', '256']] })}
      </div>
      <div data-cm="graphem">
        ${field({ id: 'text', label: 'Text', value: defaults.text, rows: 3, attrs: 'maxlength="500"' })}
      </div>
      ${toolActions({ examples })}
      ${explanation(`
        <p><strong>Codepoint:</strong> die Nummer eines Zeichens in Unicode, geschrieben als U+ und Hex (U+00E9 = é). Der Bereich reicht von U+0000 bis U+10FFFF.</p>
        <p><strong>UTF-8:</strong> speichert einen Codepoint in 1 bis 4 Bytes. ASCII (U+0000–U+007F) bleibt 1 Byte, Umlaute brauchen 2, das Euro-Zeichen 3, Emojis 4 Byte.</p>
        <p><strong>UTF-16:</strong> nutzt 16-Bit-Einheiten; Codepoints über U+FFFF brauchen ein <em>Surrogatpaar</em> (zwei Einheiten). JavaScripts <code>"…".length</code> zählt diese Einheiten.</p>
        <p><strong>Graphem (sichtbares Zeichen):</strong> Was man als ein Zeichen wahrnimmt, kann aus mehreren Codepoints bestehen: „é“ als ein Codepoint (U+00E9) oder als e + kombinierender Akut (U+0065 U+0301); Emojis mit Hautfarbe, Familien-Emojis mit Zero Width Joiner (U+200D) oder Flaggen aus zwei Regionalindikatoren. Normalisierung (NFC/NFD) macht zusammengesetzte und zerlegte Schreibweisen vergleichbar.</p>
        <p>Die Darstellung hängt von den installierten Schriften ab; fehlende Zeichen erscheinen als Kästchen.</p>`)}
    `),
    '<div id="out"></div>'
  );

  const cellLabel = (d) => (d.kind === 'char' ? esc(d.text) : d.kind === 'combining' ? esc(d.text) : `<span class="arch-ctrl">${esc(d.text || '·')}</span>`);

  const ctl = live(container, {
    output: stableOutput(container.querySelector('#out')),
    defaults,
    examples,
    compute: (v) => {
      container.querySelectorAll('[data-cm]').forEach((el) => (el.hidden = el.dataset.cm !== v.cmode));
      container.querySelector('[data-custom-range]').hidden = v.block !== 'custom';
      if (v.cmode === 'ascii') {
        const rows = [];
        for (let cp = 0; cp < 128; cp += 1) {
          const ctrl = ASCII_CONTROL[cp];
          if (v.ctrlOnly && !ctrl) continue;
          rows.push([String(cp), `0x${hexPad(cp)}`, cp.toString(2).padStart(7, '0'), ctrl ? { html: `<span class="arch-ctrl">${ctrl[0]}</span>` } : cp === 32 ? { html: '<span class="arch-ctrl">SP</span>' } : String.fromCharCode(cp), ctrl ? ctrl[1] : cp === 32 ? 'Leerzeichen' : '']);
        }
        return panel(`ASCII (${v.ctrlOnly ? '33 Steuerzeichen' : '0–127'})`, `
          ${table(['Dez', 'Hex', 'Binär (7 Bit)', 'Zeichen', 'Bedeutung'], rows, { className: 'arch-ascii' })}
          <p class="small subtle">ASCII ist ein 7-Bit-Code. 0–31 und 127 sind Steuerzeichen; Zeilenende: Unix LF (0x0A), Windows CR LF (0x0D 0x0A).</p>`);
      }
      if (v.cmode === 'blocks') {
        let start;
        let end;
        let title;
        if (v.block === 'custom') {
          start = parseHexCodepoint(v.start, 'Von');
          end = parseHexCodepoint(v.end, 'Bis');
          title = `${uPlus(start)} bis ${uPlus(end)}`;
        } else {
          const b = BLOCKS.find((x) => x.id === v.block) ?? BLOCKS[0];
          start = b.start;
          end = b.end;
          title = b.label;
        }
        const key = `${start}-${end}-${v.psize}`;
        if (key !== lastBlockKey) {
          page = 0;
          lastBlockKey = key;
        }
        const p = blockPage(start, end, page, Number(v.psize));
        page = p.page;
        return panel(title, `
          <div class="row arch-pager">
            <button type="button" class="btn btn-sm" data-page="-1"${p.page === 0 ? ' disabled' : ''}>◀ Zurück</button>
            <span class="small">Seite ${p.page + 1} von ${p.pages} · ${uPlus(p.from)}–${uPlus(p.to)} · ${p.total.toLocaleString('de-DE')} Codepoints</span>
            <button type="button" class="btn btn-sm" data-page="1"${p.page >= p.pages - 1 ? ' disabled' : ''}>Vor ▶</button>
          </div>
          <div class="arch-grid">${p.cells.map((c) => `<button type="button" class="arch-cell arch-cell-${c.display.kind}" data-cp="${c.cp}" title="${uPlus(c.cp)}" aria-label="${uPlus(c.cp)}"><span class="arch-cell-ch">${cellLabel(c.display)}</span><span class="arch-cell-cp">${hexPad(c.cp, 4)}</span></button>`).join('')}</div>
          <p class="small subtle">Klick auf ein Zeichen zeigt alle Details. Leere Felder: nicht zugewiesen, Leer-/Formatzeichen oder private Nutzung.</p>`);
      }
      if (v.cmode === 'graphem') {
        const r = analyzeText(v.text);
        if (!r.graphemeCount) return notice('Bitte einen Text eingeben.', 'info');
        return panel('Zerlegung', `
          ${resultList([
            { label: 'Sichtbare Zeichen (Grapheme)', value: String(r.graphemeCount), strong: true, copy: false },
            { label: 'Codepoints', value: String(r.codepointCount), copy: false },
            { label: 'UTF-16-Einheiten (JS .length)', value: String(r.utf16Count), copy: false },
            { label: 'UTF-8-Bytes', value: String(r.utf8Count), copy: false },
            { label: 'NFC / NFD', value: `${[...r.nfc].length} / ${[...r.nfd].length} Codepoints${r.nfc === v.text ? ' (Text ist bereits NFC)' : ' (Text ist nicht NFC-normalisiert)'}`, copy: false }
          ])}
          ${r.segmenter ? '' : notice('Intl.Segmenter fehlt in diesem Browser – Grapheme werden ersatzweise als einzelne Codepoints gezählt.', 'warning')}
          <div class="arch-graphemes">${r.graphemes.map((g) => `
            <div class="arch-grapheme">
              <div class="arch-grapheme-ch">${esc(g.text.trim() ? g.text : '␠')}</div>
              <div class="small subtle">${g.codepoints.length} Codepoint${g.codepoints.length === 1 ? '' : 's'} · ${g.utf8Count} Byte UTF-8 · ${g.utf16Count} UTF-16</div>
              <ul class="arch-cps">${g.codepoints.map((c) => `<li><code>${c.uplus}</code> <span class="mono small">${c.utf8.map((b) => hexPad(b)).join(' ')}</span>${c.role ? ` <span class="small subtle">– ${esc(c.role)}</span>` : ''}</li>`).join('')}</ul>
            </div>`).join('')}</div>`);
      }
      // Suche
      const q = parseCodepointQuery(v.query);
      const cps = q.codepoints.slice(0, 20);
      const first = describeCodepoint(cps[0]);
      return `${q.ambiguousDigit ? notice(`„${v.query.trim()}“ wird als Zeichen (Ziffer) gesucht. Für den Codepoint ${v.query.trim()} gib U+${hexPad(Number(v.query.trim()), 4)} oder 0x${hexPad(Number(v.query.trim()))} ein.`, 'info') : ''}
        ${q.codepoints.length > 20 ? notice(`Es werden nur die ersten 20 von ${q.codepoints.length} Codepoints gezeigt.`, 'info') : ''}
        ${cps.map((cp) => {
          const d = describeCodepoint(cp);
          return panel(`${d.uplus}`, `
            <div class="arch-bigchar ${d.display.kind === 'char' ? '' : 'arch-ctrl'}">${d.display.text ? esc(d.display.text) : '(nicht darstellbar)'}</div>
            ${resultList([
              { label: 'Codepoint', value: d.uplus },
              { label: 'Dezimal', value: d.dec },
              { label: 'Hexadezimal', value: d.hex },
              { label: 'Binär', value: d.bin },
              { label: 'UTF-8 (Hex)', value: d.utf8Hex, strong: true },
              d.utf8 ? { label: 'UTF-8 (Binär)', value: d.utf8Bin } : null,
              { label: 'UTF-16', value: d.utf16Hex },
              { label: 'HTML', value: d.htmlEntity },
              { label: 'JavaScript', value: d.jsEscape },
              { label: 'Kategorie', value: `${d.category.code} – ${d.category.label}`, mono: false, copy: false },
              d.control ? { label: 'Steuerzeichen', value: `${d.control[0]} – ${d.control[1]}`, mono: false, copy: false } : null
            ])}`);
        }).join('')}
        ${first.utf8 ? steps(utf8Steps(first), { title: `UTF-8-Kodierung von ${first.uplus} Schritt für Schritt`, open: false }) : ''}`;
    }
  });
  container.addEventListener('click', (event) => {
    const pager = event.target.closest('[data-page]');
    if (pager) {
      page += Number(pager.dataset.page);
      ctl.run();
      container.querySelector(`[data-page="${pager.dataset.page}"]:not([disabled])`)?.focus();
      return;
    }
    const cell = event.target.closest('[data-cp]');
    if (cell) {
      writeForm(container, { cmode: 'search', query: uPlus(Number(cell.dataset.cp)) });
      ctl.run();
      container.querySelector('#query').focus();
    }
  });
  container.querySelector('[data-tool-reset]').addEventListener('click', () => {
    page = 0;
  });
  return ctl.destroy;
}

function utf8Steps(d) {
  const cp = d.cp;
  const n = d.utf8.length;
  const ranges = ['U+0000–U+007F → 1 Byte: 0xxxxxxx', 'U+0080–U+07FF → 2 Byte: 110xxxxx 10xxxxxx', 'U+0800–U+FFFF → 3 Byte: 1110xxxx 10xxxxxx 10xxxxxx', 'U+10000–U+10FFFF → 4 Byte: 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx'];
  const payload = [7, 11, 16, 21][n - 1];
  const bits = cp.toString(2).padStart(payload, '0');
  return [
    `${d.uplus} = ${cp} (dezimal)`,
    `Bereich: ${ranges[n - 1]}`,
    `${payload} Nutzbits: ${bits}`,
    `Auf die Bytes verteilt: ${d.utf8Bin}`,
    `Als Hex: ${d.utf8Hex}`
  ];
}

/* ------------------------------------------------------------ Speicherlayout */
function speicherlayout(container) {
  const defaults = { size: '256', boff: '0x00', bfmt: 'hex', bdata: 'DE AD BE EF', woff: '0x10', wtype: 'u32', wend: 'le', wval: '0x12345678', roff: '0x10', rtype: 'u32', rend: 'le' };
  let mem = createMemory(256);
  let mark = null; // { from, to, kind: 'write' | 'read' }
  let message = '';
  container.innerHTML = `
    <div class="row arch-sim-head"><span class="tool-badge-sim">Simulation</span><span class="small subtle">Verändert wird ausschließlich ein interner Simulationsspeicher (ein Uint8Array in dieser Seite) – niemals realer Prozess- oder Arbeitsspeicher. Nichts wird gespeichert.</span></div>
    ${layout(
      `<div class="arch-col">${panel('Speicher', `
        <div id="arch-mem-size">${field({ id: 'size', label: 'Größe', value: defaults.size, options: SIZES.map((s) => [String(s), `${s} Byte (0x0–0x${(s - 1).toString(16).toUpperCase()})`]), hint: 'Ändern der Größe leert den Speicher.' })}</div>
        <div class="row arch-mem-actions">
          <button type="button" class="btn btn-sm btn-danger" id="arch-clear">Speicher leeren</button>
          <button type="button" class="btn btn-sm btn-ghost" data-tool-reset>Zurücksetzen</button>
        </div>
        <div class="tool-actions row">
          <button type="button" class="btn btn-sm" data-mem-example="int">Beispiel: 0x12345678 LE vs. BE</button>
          <button type="button" class="btn btn-sm" data-mem-example="text">Beispiel: Text „Hallo“</button>
          <button type="button" class="btn btn-sm" data-mem-example="float">Beispiel: float 3,14</button>
        </div>`)}
      ${panel('Bytes schreiben', `
        <div id="arch-wb">
          <div class="form-row">
            ${field({ id: 'boff', label: 'Startadresse', value: defaults.boff, mono: true })}
            ${field({ id: 'bfmt', label: 'Format', value: defaults.bfmt, options: [['hex', 'Hex (DE AD …)'], ['dec', 'Dezimal (222 173 …)'], ['text', 'Text (UTF-8)']] })}
          </div>
          ${field({ id: 'bdata', label: 'Daten', value: defaults.bdata, mono: true, rows: 2 })}
          <button type="button" class="btn btn-sm btn-primary" id="arch-wb-go">Bytes schreiben</button>
        </div>`)}
      ${panel('Wert schreiben', `
        <div id="arch-wv">
          <div class="form-row">
            ${field({ id: 'woff', label: 'Adresse', value: defaults.woff, mono: true })}
            ${field({ id: 'wtype', label: 'Datentyp', value: defaults.wtype, options: Object.entries(TYPES).map(([k, t]) => [k, t.label]) })}
          </div>
          ${segmented({ name: 'wend', label: 'Byte-Reihenfolge', value: defaults.wend, options: [['le', 'Little Endian'], ['be', 'Big Endian']] })}
          ${field({ id: 'wval', label: 'Wert', value: defaults.wval, mono: true, hint: 'Ganzzahl dezimal oder 0x…; Float z. B. 3,14, NaN, Infinity' })}
          <div id="arch-wv-preview" class="small mono" aria-live="polite"></div>
          <button type="button" class="btn btn-sm btn-primary" id="arch-wv-go">Wert schreiben</button>
        </div>`)}
      ${panel('Wert lesen', `
        <div id="arch-rv">
          <div class="form-row">
            ${field({ id: 'roff', label: 'Adresse', value: defaults.roff, mono: true })}
            ${field({ id: 'rtype', label: 'Datentyp', value: defaults.rtype, options: Object.entries(TYPES).map(([k, t]) => [k, t.label]) })}
          </div>
          ${segmented({ name: 'rend', label: 'Byte-Reihenfolge', value: defaults.rend, options: [['le', 'Little Endian'], ['be', 'Big Endian']] })}
          <button type="button" class="btn btn-sm btn-primary" id="arch-rv-go">Wert lesen</button>
        </div>`)}
      ${explanation(`
        <p>Der Speicher ist eine Folge von Bytes mit fortlaufenden Adressen. Mehrbytige Werte (16/32/64 Bit) belegen mehrere aufeinanderfolgende Adressen.</p>
        <p><strong>Little Endian</strong> (x86, ARM meist): das niederwertigste Byte liegt an der kleinsten Adresse – 0x12345678 steht als 78 56 34 12 im Speicher. <strong>Big Endian</strong> (Netzwerk-Byte-Reihenfolge): höchstwertiges Byte zuerst – 12 34 56 78.</p>
        <p>Vorzeichenbehaftete Ganzzahlen nutzen das Zweierkomplement; float32/float64 sind IEEE-754-Gleitkommazahlen (float32 rundet: 0,1 ist nicht exakt darstellbar).</p>
        <p>Der <strong>Hexdump</strong> zeigt je Zeile 16 Byte mit Startadresse; rechts die ASCII-Deutung (nicht druckbare Bytes als Punkt).</p>`)}</div>`,
      '<div id="arch-mem-out" class="arch-col"></div>'
    )}`;

  const out = container.querySelector('#arch-mem-out');
  const preview = container.querySelector('#arch-wv-preview');
  const val = () => readForm(container);

  const render = () => {
    const lines = hexdump(mem);
    const inMark = (a) => mark && a >= mark.from && a <= mark.to;
    const head = `<tr><th scope="col">Adresse</th>${Array.from({ length: 16 }, (_, k) => `<th scope="col">${hexPad(k, 1)}</th>`).join('')}<th scope="col">ASCII</th></tr>`;
    const body = lines.map((l) => `<tr><th scope="row">${l.addrHex}</th>${l.bytes.map((b, k) => {
      const a = l.addr + k;
      return `<td class="${inMark(a) ? `arch-mark-${mark.kind}` : ''}${b ? '' : ' arch-zero'}" title="0x${a.toString(16).toUpperCase()} = ${b}">${hexPad(b)}</td>`;
    }).join('')}<td class="arch-ascii-col">${l.bytes.map((b, k) => `<span class="${inMark(l.addr + k) ? `arch-mark-${mark.kind}` : ''}">${esc(isPrintable(b) ? String.fromCharCode(b) : '.')}</span>`).join('')}</td></tr>`).join('');
    const used = mem.reduce((s, b) => s + (b ? 1 : 0), 0);
    out.innerHTML = `
      ${message}
      ${panel(`Hexdump (${mem.length} Byte)`, `
        <div class="table-wrap arch-hexwrap"><table class="data tool-table arch-hex"><thead>${head}</thead><tbody>${body}</tbody></table></div>
        <div class="row-between arch-hex-foot"><span class="small subtle">${used} von ${mem.length} Byte ungleich 0${mark ? ` · markiert: 0x${mark.from.toString(16).toUpperCase()}–0x${mark.to.toString(16).toUpperCase()} (${mark.kind === 'write' ? 'geschrieben' : 'gelesen'})` : ''}</span>
        <button type="button" class="btn btn-sm" data-copy="${esc(hexdumpText(mem))}">Hexdump kopieren</button></div>`)}`;
  };

  const byteBoxes = (bytes, from) => `<div class="arch-bytes">${bytes.map((b, k) => `<div class="arch-byte"><span class="mono">${hexPad(b)}</span><small>0x${(from + k).toString(16).toUpperCase()}</small></div>`).join('')}</div>`;

  const act = (fn) => {
    try {
      message = fn();
    } catch (error) {
      message = errorHtml(error);
      if (error?.name !== 'InputError') console.error(error);
    }
    render();
  };

  const updatePreview = () => {
    const v = val();
    try {
      const enc = encodeValue(v.wtype, v.wval, v.wend === 'le');
      preview.textContent = `Bytes (${v.wend === 'le' ? 'LE' : 'BE'}): ${enc.bytes.map((b) => hexPad(b)).join(' ')}${enc.rounded ? ` · gespeichert wird ${enc.stored}` : ''}${enc.overflow ? ' · Überlauf zu ∞' : ''}`;
      preview.classList.remove('arch-preview-err');
    } catch (error) {
      preview.textContent = error.message;
      preview.classList.add('arch-preview-err');
    }
  };

  const doWriteBytes = () => act(() => {
    const v = val();
    const off = parseAddress(v.boff, mem.length, 'Startadresse');
    const bytes = v.bfmt === 'text' ? textBytes(v.bdata) : parseBytes(v.bdata, v.bfmt);
    if (!bytes.length) throw new InputError('Keine Daten zum Schreiben.');
    const r = writeBytes(mem, off, bytes);
    mark = { ...r, kind: 'write' };
    return panel('Geschrieben', `${notice(`${bytes.length} Byte ab 0x${off.toString(16).toUpperCase()} geschrieben (bis 0x${r.to.toString(16).toUpperCase()}).`, 'success')}${byteBoxes(bytes.slice(0, 64), off)}${bytes.length > 64 ? '<p class="small subtle">… (nur die ersten 64 Byte gezeigt)</p>' : ''}`);
  });
  const doWriteValue = () => act(() => {
    const v = val();
    const off = parseAddress(v.woff, mem.length, 'Adresse');
    const le = v.wend === 'le';
    const r = writeValue(mem, off, v.wtype, v.wval, le);
    mark = { from: r.from, to: r.to, kind: 'write' };
    const other = encodeValue(v.wtype, v.wval, !le).bytes;
    return panel('Wert geschrieben', `
      ${resultList([
        { label: 'Typ', value: TYPES[v.wtype].label, mono: false, copy: false },
        { label: 'Wert', value: String(r.stored) },
        { label: `Bytes (${le ? 'Little' : 'Big'} Endian)`, value: r.bytes.map((b) => hexPad(b)).join(' '), strong: true },
        { label: `zum Vergleich ${le ? 'Big' : 'Little'} Endian`, value: other.map((b) => hexPad(b)).join(' ') }
      ])}
      ${byteBoxes(r.bytes, off)}
      ${r.rounded ? notice(`Der Wert ist als ${v.wtype} nicht exakt darstellbar; gespeichert wird ${r.stored}.`, 'warning') : ''}
      ${r.overflow ? notice('Der Wert ist zu groß für float32 und wird zu Unendlich.', 'warning') : ''}
      ${off % TYPES[v.wtype].size ? notice(`Adresse 0x${off.toString(16).toUpperCase()} ist nicht auf ${TYPES[v.wtype].size} Byte ausgerichtet (unaligned). Manche Prozessoren erlauben solche Zugriffe nicht oder nur langsamer.`, 'info') : ''}`);
  });
  const doRead = () => act(() => {
    const v = val();
    const off = parseAddress(v.roff, mem.length, 'Adresse');
    const le = v.rend === 'le';
    const r = readValue(mem, off, v.rtype, le);
    const o = readValue(mem, off, v.rtype, !le);
    mark = { from: r.from, to: r.to, kind: 'read' };
    return panel('Gelesen', `
      ${resultList([
        { label: `Wert (${le ? 'Little' : 'Big'} Endian)`, value: r.value, strong: true },
        { label: 'Bytes im Speicher', value: r.bytes.map((b) => hexPad(b)).join(' ') },
        TYPES[v.rtype].kind === 'float' ? null : { label: 'als Hex-Zahl', value: r.hexValue },
        { label: `als ${le ? 'Big' : 'Little'} Endian gelesen`, value: o.value }
      ])}
      ${byteBoxes(r.bytes, off)}
      ${steps([
        `Bytes an 0x${off.toString(16).toUpperCase()}–0x${r.to.toString(16).toUpperCase()}: ${r.bytes.map((b) => hexPad(b)).join(' ')}`,
        le ? `Little Endian: Reihenfolge umdrehen → ${[...r.bytes].reverse().map((b) => hexPad(b)).join(' ')}` : 'Big Endian: Reihenfolge bleibt.',
        TYPES[v.rtype].kind === 'float' ? `Als IEEE-754-${TYPES[v.rtype].size === 4 ? 'float32' : 'float64'} gedeutet: ${r.value}` : `${r.hexValue} als ${TYPES[v.rtype].label} = ${r.value}`
      ])}`);
  });

  container.querySelector('#arch-wb-go').addEventListener('click', doWriteBytes);
  container.querySelector('#arch-wv-go').addEventListener('click', doWriteValue);
  container.querySelector('#arch-rv-go').addEventListener('click', doRead);
  container.querySelector('#arch-wv').addEventListener('input', updatePreview);
  container.querySelector('#arch-wv').addEventListener('change', updatePreview);
  container.querySelector('#size').addEventListener('change', (event) => act(() => {
    mem = createMemory(Number(event.target.value));
    mark = null;
    return notice(`Neuer, leerer Speicher mit ${mem.length} Byte angelegt.`, 'info');
  }));
  container.querySelector('#arch-clear').addEventListener('click', () => act(() => {
    mem.fill(0);
    mark = null;
    return notice('Speicher geleert (alle Bytes 0).', 'info');
  }));
  container.querySelector('[data-tool-reset]').addEventListener('click', () => {
    writeForm(container, defaults);
    mem = createMemory(256);
    mark = null;
    message = '';
    updatePreview();
    render();
  });
  container.querySelectorAll('[data-mem-example]').forEach((b) => b.addEventListener('click', () => {
    const kind = b.dataset.memExample;
    if (kind === 'int') {
      mem.fill(0);
      writeValue(mem, 0x00, 'u32', '0x12345678', true);
      writeValue(mem, 0x10, 'u32', '0x12345678', false);
      writeForm(container, { roff: '0x00', rtype: 'u32', rend: 'le', woff: '0x10', wtype: 'u32', wend: 'be', wval: '0x12345678' });
      mark = { from: 0, to: 0x13, kind: 'write' };
      message = notice('0x12345678 wurde an 0x00 als Little Endian (78 56 34 12) und an 0x10 als Big Endian (12 34 56 78) geschrieben. Lies beide Adressen mit beiden Byte-Reihenfolgen.', 'info');
    } else if (kind === 'text') {
      writeForm(container, { boff: '0x20', bfmt: 'text', bdata: 'Hallo' });
      doWriteBytes();
      return;
    } else {
      writeForm(container, { woff: '0x40', wtype: 'f32', wend: 'le', wval: '3,14', roff: '0x40', rtype: 'f32', rend: 'le' });
      doWriteValue();
      updatePreview();
      return;
    }
    updatePreview();
    render();
  }));
  updatePreview();
  render();
}

const TOOLS = { logikgatter, logikschaltung, zeichentabelle, speicherlayout };

export function render(toolId, container, ctx) {
  const tool = TOOLS[toolId];
  if (!tool) throw new Error(`Unbekanntes Werkzeug: ${toolId}`);
  return tool(container, ctx);
}

