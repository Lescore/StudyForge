/**
 * Kombinatorische Logikschaltungen: Modell, Prüfung (offene Eingänge, Zyklen,
 * unbenutzte Gatter), Auswertung und Wahrheitstabelle.
 *
 * Schaltung:
 *   { inputs: [{ id, name, value }],
 *     gates:  [{ id, type, label, inputs: ['in:ID' | 'g:ID' | ''], output: bool }] }
 * Reine Logik ohne DOM.
 */
import { InputError } from './num.js';
import { GATES, gateOutput, bitsOf } from './logic-expr.js';

export const MAX_INPUTS = 6;
export const MAX_GATES = 30;
export const GATE_TYPES = Object.keys(GATES);

export function defaultInputCount(type) {
  return type === 'NOT' ? 1 : 2;
}

export function validName(name) {
  return /^[A-Za-z_][A-Za-z0-9_]{0,11}$/.test(name);
}

/** Bezeichnung einer Signalquelle für Anzeige und Auswahlfelder. */
export function sourceLabel(circuit, ref) {
  if (!ref) return '– offen –';
  const [kind, id] = ref.split(':');
  if (kind === 'in') {
    const input = circuit.inputs.find((i) => i.id === id);
    return input ? `Eingang ${input.name}` : `fehlender Eingang (${id})`;
  }
  const gate = circuit.gates.find((g) => g.id === id);
  return gate ? `${gate.label} (${gate.type})` : `fehlendes Gatter (${id})`;
}

/**
 * Prüft die Schaltung. Fehler verhindern die vollständige Auswertung,
 * Hinweise nicht.
 */
export function analyzeCircuit(circuit) {
  const errors = [];
  const warnings = [];
  const gateById = new Map(circuit.gates.map((g) => [g.id, g]));
  const inputIds = new Set(circuit.inputs.map((i) => i.id));

  const names = new Map();
  for (const input of circuit.inputs) {
    if (!validName(input.name)) errors.push(`Eingangsname „${input.name}“ ist ungültig (Buchstabe am Anfang, dann Buchstaben/Ziffern/_, höchstens 12 Zeichen).`);
    if (names.has(input.name)) errors.push(`Der Name „${input.name}“ ist doppelt vergeben.`);
    names.set(input.name, true);
  }
  for (const gate of circuit.gates) {
    if (!validName(gate.label)) errors.push(`Gattername „${gate.label}“ ist ungültig (Buchstabe am Anfang, dann Buchstaben/Ziffern/_, höchstens 12 Zeichen).`);
    if (names.has(gate.label)) errors.push(`Der Name „${gate.label}“ ist doppelt vergeben.`);
    names.set(gate.label, true);
  }

  const open = [];
  gatesLoop: for (const gate of circuit.gates) {
    const spec = GATES[gate.type];
    if (!spec) {
      errors.push(`${gate.label}: unbekannter Gattertyp „${gate.type}“.`);
      continue;
    }
    if (gate.inputs.length < spec.min || (spec.max && gate.inputs.length > spec.max)) {
      errors.push(`${gate.label}: falsche Anzahl Eingänge für ${gate.type}.`);
    }
    for (let k = 0; k < gate.inputs.length; k += 1) {
      const ref = gate.inputs[k];
      if (!ref) {
        open.push(`${gate.label}, Eingang ${k + 1}`);
        continue;
      }
      const [kind, id] = ref.split(':');
      if ((kind === 'in' && !inputIds.has(id)) || (kind === 'g' && !gateById.has(id)) || (kind !== 'in' && kind !== 'g')) {
        errors.push(`${gate.label}, Eingang ${k + 1}: Die verbundene Quelle existiert nicht mehr.`);
        continue gatesLoop;
      }
      if (kind === 'g' && id === gate.id) errors.push(`${gate.label} ist mit sich selbst verbunden (Rückkopplung).`);
    }
  }
  if (open.length) errors.push(`Offene (unverbundene) Gattereingänge: ${open.join('; ')}.`);

  // Zyklen per Tiefensuche finden.
  const cycles = findCycles(circuit, gateById);
  for (const cycle of cycles) {
    if (cycle.length === 1) continue; // Selbstschleife bereits gemeldet
    errors.push(`Zyklus (Rückkopplung): ${cycle.map((id) => gateById.get(id).label).join(' → ')} → ${gateById.get(cycle[0]).label}. Eine kombinatorische Schaltung darf keine Rückkopplung enthalten.`);
  }

  const outputs = circuit.gates.filter((g) => g.output);
  if (!circuit.gates.length) errors.push('Die Schaltung enthält noch keine Gatter.');
  else if (!outputs.length) errors.push('Kein Gatter ist als Ausgang markiert.');
  if (!circuit.inputs.length) errors.push('Die Schaltung hat keine Eingänge.');

  // Unbenutzte Gatter und Eingänge (nur Hinweis).
  const usedRefs = new Set(circuit.gates.flatMap((g) => g.inputs).filter(Boolean));
  for (const gate of circuit.gates) {
    if (!gate.output && !usedRefs.has(`g:${gate.id}`)) warnings.push(`Gatter ${gate.label} wird nirgends verwendet und ist kein Ausgang.`);
  }
  for (const input of circuit.inputs) {
    if (!usedRefs.has(`in:${input.id}`)) warnings.push(`Eingang ${input.name} ist mit keinem Gatter verbunden.`);
  }

  const order = errors.length ? null : topoOrder(circuit, gateById);
  return { errors, warnings, order, valid: errors.length === 0, cycleIds: new Set(cycles.flat()) };
}

function findCycles(circuit, gateById) {
  const state = new Map(); // 0 = unbesucht, 1 = in Bearbeitung, 2 = fertig
  const stack = [];
  const cycles = [];
  const seen = new Set();
  const visit = (id) => {
    state.set(id, 1);
    stack.push(id);
    for (const ref of gateById.get(id).inputs) {
      if (!ref?.startsWith('g:')) continue;
      const next = ref.slice(2);
      if (!gateById.has(next)) continue;
      if (state.get(next) === 1) {
        const cycle = stack.slice(stack.indexOf(next));
        const key = [...cycle].sort().join(',');
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push(cycle);
        }
      } else if (!state.get(next)) visit(next);
    }
    stack.pop();
    state.set(id, 2);
  };
  for (const gate of circuit.gates) if (!state.get(gate.id)) visit(gate.id);
  return cycles;
}

function topoOrder(circuit, gateById) {
  const order = [];
  const done = new Set();
  const visit = (id) => {
    if (done.has(id)) return;
    for (const ref of gateById.get(id).inputs) if (ref.startsWith('g:')) visit(ref.slice(2));
    done.add(id);
    order.push(id);
  };
  circuit.gates.forEach((g) => visit(g.id));
  return order;
}

/**
 * Wertet die Schaltung für eine Belegung aus. Bei ungültigen Schaltungen
 * werden nur die eindeutig bestimmbaren Signale berechnet, die übrigen sind null.
 */
export function evaluateCircuit(circuit, values = null) {
  const inputValues = new Map(circuit.inputs.map((i, k) => [i.id, values ? values[k] : i.value ? 1 : 0]));
  const gateById = new Map(circuit.gates.map((g) => [g.id, g]));
  const result = new Map();
  const visiting = new Set();
  const signal = (ref) => {
    if (!ref) return null;
    const [kind, id] = ref.split(':');
    if (kind === 'in') return inputValues.has(id) ? inputValues.get(id) : null;
    return gateValue(id);
  };
  const gateValue = (id) => {
    if (result.has(id)) return result.get(id);
    const gate = gateById.get(id);
    if (!gate || visiting.has(id)) return null; // Zyklus oder fehlend → unbestimmt
    visiting.add(id);
    const ins = gate.inputs.map(signal);
    visiting.delete(id);
    let out = null;
    const spec = GATES[gate.type];
    const countOk = spec && gate.inputs.length >= spec.min && (!spec.max || gate.inputs.length <= spec.max);
    if (countOk && ins.every((v) => v === 0 || v === 1)) out = gateOutput(gate.type, ins);
    result.set(id, out);
    return out;
  };
  // Gatter in Zyklen bleiben unbestimmt: erst Zyklusmitglieder ermitteln.
  const { cycleIds } = analyzeCircuit(circuit);
  for (const id of cycleIds) result.set(id, null);
  circuit.gates.forEach((g) => gateValue(g.id));
  return { inputs: inputValues, gates: result };
}

/** Wahrheitstabelle aller markierten Ausgänge. Nur für gültige Schaltungen. */
export function circuitTruthTable(circuit) {
  const check = analyzeCircuit(circuit);
  if (!check.valid) throw new InputError('Die Wahrheitstabelle lässt sich erst berechnen, wenn die Schaltung keine Fehler mehr hat.');
  const n = circuit.inputs.length;
  if (n > MAX_INPUTS) throw new InputError(`Höchstens ${MAX_INPUTS} Eingänge für die Wahrheitstabelle.`);
  const outputs = circuit.gates.filter((g) => g.output);
  const rows = [];
  for (let i = 0; i < 2 ** n; i += 1) {
    const inputs = bitsOf(i, n);
    const { gates } = evaluateCircuit(circuit, inputs);
    rows.push({ index: i, inputs, outputs: outputs.map((g) => gates.get(g.id)) });
  }
  return { inputs: circuit.inputs.map((i) => i.name), outputs: outputs.map((g) => g.label), rows };
}

const SYM = { AND: '·', OR: '+', XOR: '⊕', NAND: 'NAND', NOR: 'NOR', XNOR: 'XNOR' };

/** Boolescher Ausdruck eines Gatters, rekursiv aus den Quellen zusammengesetzt. */
export function gateExpression(circuit, gateId, depth = 0) {
  const gate = circuit.gates.find((g) => g.id === gateId);
  if (!gate || depth > MAX_GATES) return '?';
  const part = (ref) => {
    if (!ref) return '?';
    const [kind, id] = ref.split(':');
    if (kind === 'in') return circuit.inputs.find((i) => i.id === id)?.name ?? '?';
    const inner = gateExpression(circuit, id, depth + 1);
    const sub = circuit.gates.find((g) => g.id === id);
    return sub && sub.type !== 'NOT' && gate.inputs.length > 1 ? `(${inner})` : inner;
  };
  if (gate.type === 'NOT') {
    const ref = gate.inputs[0];
    const inner = part(ref);
    return ref?.startsWith('g:') && !inner.startsWith('(') && !inner.startsWith('¬') ? `¬(${inner})` : `¬${inner}`;
  }
  return gate.inputs.map(part).join(` ${SYM[gate.type]} `);
}

/** Tiefe (Spalte) jedes Gatters für die schematische Darstellung. */
export function gateDepths(circuit) {
  const gateById = new Map(circuit.gates.map((g) => [g.id, g]));
  const depth = new Map();
  const visiting = new Set();
  const calc = (id) => {
    if (depth.has(id)) return depth.get(id);
    if (visiting.has(id)) return null;
    visiting.add(id);
    let d = 1;
    for (const ref of gateById.get(id).inputs) {
      if (!ref?.startsWith('g:') || !gateById.has(ref.slice(2))) continue;
      const sub = calc(ref.slice(2));
      if (sub === null) {
        visiting.delete(id);
        return null;
      }
      d = Math.max(d, sub + 1);
    }
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };
  let maxDepth = 1;
  for (const g of circuit.gates) {
    const d = calc(g.id);
    if (d) maxDepth = Math.max(maxDepth, d);
  }
  // Gatter in Zyklen ganz rechts anordnen.
  for (const g of circuit.gates) if (!depth.has(g.id)) depth.set(g.id, maxDepth + 1);
  return depth;
}

/* ------------------------------------------------------------ Beispiele */

function make(inputs, gates) {
  return {
    inputs: inputs.map((name, k) => ({ id: `i${k + 1}`, name, value: 0 })),
    gates: gates.map(([label, type, ins, output = false], k) => ({ id: `g${k + 1}`, type, label, inputs: ins, output }))
  };
}

export const EXAMPLES = {
  halbaddierer: {
    label: 'Halbaddierer',
    build: () => make(['A', 'B'], [
      ['S', 'XOR', ['in:i1', 'in:i2'], true],
      ['C', 'AND', ['in:i1', 'in:i2'], true]
    ])
  },
  volladdierer: {
    label: 'Volladdierer',
    build: () => make(['A', 'B', 'Cin'], [
      ['X1', 'XOR', ['in:i1', 'in:i2']],
      ['S', 'XOR', ['g:g1', 'in:i3'], true],
      ['A1', 'AND', ['in:i1', 'in:i2']],
      ['A2', 'AND', ['g:g1', 'in:i3']],
      ['Cout', 'OR', ['g:g3', 'g:g4'], true]
    ])
  },
  mux: {
    label: 'Multiplexer 2:1',
    build: () => make(['D0', 'D1', 'Sel'], [
      ['NS', 'NOT', ['in:i3']],
      ['U0', 'AND', ['in:i1', 'g:g1']],
      ['U1', 'AND', ['in:i2', 'in:i3']],
      ['Y', 'OR', ['g:g2', 'g:g3'], true]
    ])
  },
  fehler: {
    label: 'Fehlerhafte Schaltung',
    build: () => make(['A', 'B'], [
      ['G1', 'AND', ['in:i1', 'g:g2']],
      ['G2', 'OR', ['g:g1', 'in:i2'], true],
      ['G3', 'NOT', ['']]
    ])
  }
};
