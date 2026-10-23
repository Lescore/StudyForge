/**
 * Boolesche Ausdrücke: eigener Tokenizer und Parser (kein eval), Auswertung,
 * Wahrheitstabellen, kanonische DNF/KNF und minimale DNF nach Quine-McCluskey.
 *
 * Reine Logik ohne DOM, damit sie unter Node getestet werden kann.
 */
import { InputError } from './num.js';

export const MAX_VARS = 4;
export const MAX_EXPR_LENGTH = 500;

/* ------------------------------------------------------------ Gatter */

/**
 * Gatterfunktionen für 1 bis n Eingänge. XOR mit mehr als zwei Eingängen ist
 * die Paritätsfunktion (1 bei ungerader Anzahl Einsen), XNOR deren Negation.
 */
export const GATES = {
  AND: { label: 'AND', symbol: '∧', min: 2, fn: (xs) => (xs.every((x) => x === 1) ? 1 : 0), desc: '1, wenn alle Eingänge 1 sind.' },
  OR: { label: 'OR', symbol: '∨', min: 2, fn: (xs) => (xs.some((x) => x === 1) ? 1 : 0), desc: '1, wenn mindestens ein Eingang 1 ist.' },
  NOT: { label: 'NOT', symbol: '¬', min: 1, max: 1, fn: (xs) => (xs[0] === 1 ? 0 : 1), desc: 'Kehrt den Eingang um.' },
  XOR: { label: 'XOR', symbol: '⊕', min: 2, fn: (xs) => xs.reduce((a, b) => a ^ b, 0), desc: '1, wenn eine ungerade Anzahl Eingänge 1 ist (bei zwei Eingängen: genau einer).' },
  NAND: { label: 'NAND', symbol: '↑', min: 2, fn: (xs) => (xs.every((x) => x === 1) ? 0 : 1), desc: 'Negiertes AND: 0 nur, wenn alle Eingänge 1 sind.' },
  NOR: { label: 'NOR', symbol: '↓', min: 2, fn: (xs) => (xs.some((x) => x === 1) ? 0 : 1), desc: 'Negiertes OR: 1 nur, wenn alle Eingänge 0 sind.' },
  XNOR: { label: 'XNOR', symbol: '⊙', min: 2, fn: (xs) => 1 - xs.reduce((a, b) => a ^ b, 0), desc: 'Negiertes XOR: 1 bei gerader Anzahl Einsen (bei zwei Eingängen: Gleichheit).' }
};

export function gateOutput(type, inputs) {
  const gate = GATES[type];
  if (!gate) throw new InputError(`Unbekanntes Gatter „${type}“.`);
  if (inputs.length < gate.min || (gate.max && inputs.length > gate.max)) {
    throw new InputError(`${type} braucht ${gate.max === gate.min ? gate.min : `mindestens ${gate.min}`} Eingang/Eingänge.`);
  }
  return gate.fn(inputs.map((x) => (x ? 1 : 0)));
}

/** Wahrheitstabelle eines einzelnen Gatters mit n Eingängen. */
export function gateTable(type, n) {
  const rows = [];
  for (let i = 0; i < 2 ** n; i += 1) {
    const inputs = bitsOf(i, n);
    rows.push({ index: i, inputs, out: gateOutput(type, inputs) });
  }
  return rows;
}

/** Bits einer Zahl, höchstwertiges zuerst (erste Variable = MSB). */
export function bitsOf(i, n) {
  const out = [];
  for (let b = n - 1; b >= 0; b -= 1) out.push((i >> b) & 1);
  return out;
}

/* ------------------------------------------------------------ Tokenizer */

const KEYWORDS = { AND: 'AND', OR: 'OR', NOT: 'NOT', XOR: 'XOR', NAND: 'NAND', NOR: 'NOR', XNOR: 'XNOR', UND: 'AND', ODER: 'OR', NICHT: 'NOT' };
const SYMBOLS = [
  ['&&', 'AND'], ['||', 'OR'],
  ['&', 'AND'], ['∧', 'AND'], ['·', 'AND'], ['*', 'AND'], ['⋅', 'AND'],
  ['|', 'OR'], ['∨', 'OR'], ['+', 'OR'],
  ['!', 'NOT'], ['¬', 'NOT'], ['~', 'NOT'],
  ['^', 'XOR'], ['⊕', 'XOR'],
  ['↑', 'NAND'], ['↓', 'NOR'], ['⊙', 'XNOR'], ['↔', 'XNOR'], ['≡', 'XNOR'],
  ['(', 'LPAREN'], [')', 'RPAREN'], ["'", 'PRIME'], ['’', 'PRIME'], ['′', 'PRIME']
];

function syntaxError(message, pos, input) {
  const error = new InputError(`Syntaxfehler an Position ${pos + 1}: ${message}`);
  error.position = pos;
  error.input = input;
  return error;
}

export function tokenize(input) {
  const text = String(input ?? '');
  if (text.length > MAX_EXPR_LENGTH) throw new InputError(`Ausdruck ist zu lang (höchstens ${MAX_EXPR_LENGTH} Zeichen).`);
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    const sym = SYMBOLS.find(([s]) => text.startsWith(s, i));
    if (sym) {
      tokens.push({ type: sym[1], text: sym[0], pos: i });
      i += sym[0].length;
      continue;
    }
    if (ch === '0' || ch === '1') {
      if (/[0-9]/.test(text[i + 1] ?? '')) throw syntaxError(`„${text.slice(i, i + 2)}…“ – als Konstanten sind nur 0 und 1 erlaubt.`, i, text);
      tokens.push({ type: 'CONST', value: ch === '1' ? 1 : 0, text: ch, pos: i });
      i += 1;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < text.length && /[A-Za-z0-9_]/.test(text[j])) j += 1;
      const word = text.slice(i, j);
      const kw = KEYWORDS[word.toUpperCase()];
      if (kw) tokens.push({ type: kw, text: word, pos: i });
      else tokens.push({ type: 'VAR', name: word, text: word, pos: i });
      i = j;
      continue;
    }
    if (/[0-9]/.test(ch)) throw syntaxError(`„${ch}“ – als Konstanten sind nur 0 und 1 erlaubt.`, i, text);
    throw syntaxError(`Unerwartetes Zeichen „${ch}“.`, i, text);
  }
  tokens.push({ type: 'END', text: '', pos: text.length });
  return tokens;
}

/* ------------------------------------------------------------ Parser */

// Rangfolge (schwach → stark): OR/NOR, XOR/XNOR, AND/NAND, NOT, nachgestelltes '
const LEVELS = [['OR', 'NOR'], ['XOR', 'XNOR'], ['AND', 'NAND']];

export function parse(input) {
  const text = String(input ?? '');
  if (!text.trim()) throw new InputError('Bitte einen booleschen Ausdruck eingeben, z. B. A AND NOT B.');
  const tokens = tokenize(text);
  let p = 0;
  let depth = 0;
  const peek = () => tokens[p];
  const describe = (t) => (t.type === 'END' ? 'Ende des Ausdrucks' : `„${t.text}“`);

  const parseLevel = (level) => {
    if (level === LEVELS.length) return parseUnary();
    let left = parseLevel(level + 1);
    while (LEVELS[level].includes(peek().type)) {
      const op = tokens[p];
      p += 1;
      if (peek().type === 'END' || peek().type === 'RPAREN' || ['AND', 'OR', 'XOR', 'NAND', 'NOR', 'XNOR', 'PRIME'].includes(peek().type)) {
        throw syntaxError(`Nach „${op.text}“ fehlt ein Operand (gefunden: ${describe(peek())}).`, peek().pos, text);
      }
      const right = parseLevel(level + 1);
      left = { type: 'bin', op: op.type, left, right };
    }
    return left;
  };

  const parseUnary = () => {
    const t = peek();
    if (t.type === 'NOT') {
      p += 1;
      if (peek().type === 'END') throw syntaxError(`Nach „${t.text}“ fehlt ein Operand.`, peek().pos, text);
      return { type: 'not', arg: parseUnary() };
    }
    let node = parsePrimary();
    while (peek().type === 'PRIME') {
      p += 1;
      node = { type: 'not', arg: node };
    }
    return node;
  };

  const parsePrimary = () => {
    const t = peek();
    if (t.type === 'VAR') {
      p += 1;
      return { type: 'var', name: t.name };
    }
    if (t.type === 'CONST') {
      p += 1;
      return { type: 'const', value: t.value };
    }
    if (t.type === 'LPAREN') {
      p += 1;
      depth += 1;
      if (depth > 100) throw syntaxError('Zu tief verschachtelte Klammern.', t.pos, text);
      if (peek().type === 'RPAREN') throw syntaxError('Leere Klammern.', peek().pos, text);
      const inner = parseLevel(0);
      if (peek().type !== 'RPAREN') throw syntaxError(`Schließende Klammer „)“ fehlt (zur Klammer an Position ${t.pos + 1}), gefunden: ${describe(peek())}.`, peek().pos, text);
      p += 1;
      depth -= 1;
      return inner;
    }
    if (t.type === 'END') throw syntaxError('Ausdruck endet unerwartet – es fehlt ein Operand.', t.pos, text);
    if (t.type === 'RPAREN') throw syntaxError('Schließende Klammer ohne passende öffnende Klammer oder fehlender Operand davor.', t.pos, text);
    if (t.type === 'PRIME') throw syntaxError('Das nachgestellte \' (Negation) braucht einen Operanden davor.', t.pos, text);
    throw syntaxError(`Operator ${describe(t)} an dieser Stelle unerwartet – davor fehlt ein Operand.`, t.pos, text);
  };

  const ast = parseLevel(0);
  const rest = peek();
  if (rest.type !== 'END') {
    if (rest.type === 'RPAREN') throw syntaxError('Schließende Klammer „)“ ohne passende öffnende Klammer.', rest.pos, text);
    throw syntaxError(`Zwischen den Operanden fehlt ein Operator vor ${describe(rest)} (z. B. AND oder ·). Mehrbuchstabige Namen wie „AB“ gelten als eine Variable.`, rest.pos, text);
  }
  return ast;
}

/** Variablen eines Ausdrucks in alphabetischer Reihenfolge. */
export function variablesOf(ast) {
  const set = new Set();
  const walk = (n) => {
    if (n.type === 'var') set.add(n.name);
    else if (n.type === 'not') walk(n.arg);
    else if (n.type === 'bin') {
      walk(n.left);
      walk(n.right);
    }
  };
  walk(ast);
  return [...set].sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'variant' }) || (a < b ? -1 : 1));
}

export function evaluate(ast, env) {
  switch (ast.type) {
    case 'const':
      return ast.value;
    case 'var': {
      const v = env[ast.name];
      if (v === undefined) throw new InputError(`Variable „${ast.name}“ hat keinen Wert.`);
      return v ? 1 : 0;
    }
    case 'not':
      return 1 - evaluate(ast.arg, env);
    case 'bin': {
      const a = evaluate(ast.left, env);
      const b = evaluate(ast.right, env);
      return gateOutput(ast.op, [a, b]);
    }
    default:
      throw new Error(`Unbekannter Knoten ${ast.type}`);
  }
}

const OP_TEXT = { AND: '·', OR: '+', XOR: '⊕', NAND: 'NAND', NOR: 'NOR', XNOR: 'XNOR' };
const PREC = { OR: 0, NOR: 0, XOR: 1, XNOR: 1, AND: 2, NAND: 2 };

/** Ausdruck als Text in einheitlicher Schreibweise (·, +, ⊕, ¬), Klammern nur wo nötig. */
export function toText(ast) {
  const go = (n, parentPrec, isRight) => {
    if (n.type === 'const') return String(n.value);
    if (n.type === 'var') return n.name;
    if (n.type === 'not') {
      const inner = go(n.arg, 3, false);
      return `¬${n.arg.type === 'bin' ? `(${inner})` : inner}`;
    }
    const prec = PREC[n.op];
    const s = `${go(n.left, prec, false)} ${OP_TEXT[n.op]} ${go(n.right, prec, true)}`;
    // Rechter Operand gleicher Stufe braucht Klammern (Linksassoziativität).
    return prec < parentPrec || (isRight && prec === parentPrec) ? `(${s})` : s;
  };
  return go(ast, -1, false);
}

/* ------------------------------------------------------------ Wahrheitstabellen */

/**
 * Wahrheitstabelle für die gegebenen Variablen (erste = höchstwertiges Bit).
 * Zeile i entspricht der Belegung mit Binärwert i.
 */
export function truthTable(ast, vars = variablesOf(ast)) {
  if (vars.length > MAX_VARS) {
    throw new InputError(`Höchstens ${MAX_VARS} Variablen erlaubt – gefunden: ${vars.length} (${vars.join(', ')}).`);
  }
  const rows = [];
  for (let i = 0; i < 2 ** vars.length; i += 1) {
    const inputs = bitsOf(i, vars.length);
    const env = Object.fromEntries(vars.map((v, k) => [v, inputs[k]]));
    rows.push({ index: i, inputs, out: evaluate(ast, env) });
  }
  return rows;
}

export function mintermsOf(rows) {
  return rows.filter((r) => r.out === 1).map((r) => r.index);
}
export function maxtermsOf(rows) {
  return rows.filter((r) => r.out === 0).map((r) => r.index);
}

const lit = (name, positive) => (positive ? name : `¬${name}`);

/** Kanonische DNF: Disjunktion aller Minterme. */
export function canonicalDNF(vars, minterms) {
  if (!minterms.length) return '0';
  if (!vars.length) return '1';
  return minterms.map((m) => bitsOf(m, vars.length).map((b, k) => lit(vars[k], b === 1)).join('·')).join(' + ');
}

/** Kanonische KNF: Konjunktion aller Maxterme (Literal negiert, wo die Variable 1 ist). */
export function canonicalKNF(vars, maxterms) {
  if (!maxterms.length) return '1';
  if (!vars.length) return '0';
  return maxterms.map((m) => `(${bitsOf(m, vars.length).map((b, k) => lit(vars[k], b === 0)).join(' + ')})`).join('·');
}

/* ------------------------------------------------------------ Quine-McCluskey */

/**
 * Ein Implikant ist { value, mask }: Bits in `mask` sind „egal“ (-),
 * die übrigen Bits müssen `value` entsprechen.
 */
const popcount = (x) => {
  let c = 0;
  while (x) {
    c += x & 1;
    x >>= 1;
  }
  return c;
};

export function implicantCovers(imp, m) {
  return (m & ~imp.mask) === (imp.value & ~imp.mask);
}

export function implicantPattern(imp, n) {
  let s = '';
  for (let b = n - 1; b >= 0; b -= 1) s += (imp.mask >> b) & 1 ? '-' : (imp.value >> b) & 1 ? '1' : '0';
  return s;
}

export function implicantText(imp, vars) {
  const n = vars.length;
  const parts = [];
  for (let b = n - 1, k = 0; b >= 0; b -= 1, k += 1) {
    if ((imp.mask >> b) & 1) continue;
    parts.push(lit(vars[k], ((imp.value >> b) & 1) === 1));
  }
  return parts.length ? parts.join('·') : '1';
}

const literalCount = (imp, n) => n - popcount(imp.mask);

/**
 * Primimplikanten nach Quine-McCluskey (Zusammenfassen von Termen, die sich in
 * genau einem Bit unterscheiden). Liefert auch die Zwischenstufen für den Rechenweg.
 */
export function primeImplicants(n, minterms, dontCares = []) {
  const all = [...new Set([...minterms, ...dontCares])].sort((a, b) => a - b);
  let current = all.map((m) => ({ value: m, mask: 0, from: [m] }));
  const primes = [];
  const stages = [];
  while (current.length) {
    stages.push(current.map((c) => ({ ...c })));
    const used = new Set();
    const next = new Map();
    for (let i = 0; i < current.length; i += 1) {
      for (let j = i + 1; j < current.length; j += 1) {
        const a = current[i];
        const b = current[j];
        if (a.mask !== b.mask) continue;
        const diff = a.value ^ b.value;
        if (popcount(diff) !== 1) continue;
        used.add(i);
        used.add(j);
        const mask = a.mask | diff;
        const value = a.value & ~mask;
        const key = `${value}/${mask}`;
        if (!next.has(key)) next.set(key, { value, mask, from: [...new Set([...a.from, ...b.from])].sort((x, y) => x - y) });
      }
    }
    current.forEach((c, i) => {
      if (!used.has(i) && !primes.some((p) => p.value === c.value && p.mask === c.mask)) primes.push(c);
    });
    current = [...next.values()];
  }
  primes.sort((a, b) => literalCount(a, n) - literalCount(b, n) || a.value - b.value);
  return { primes, stages };
}

/**
 * Minimale DNF: erst wesentliche Primimplikanten, dann exakte Suche nach der
 * kleinsten Überdeckung (weniger Terme, dann weniger Literale).
 */
export function minimizeDNF(n, minterms, dontCares = []) {
  if (n > MAX_VARS) throw new InputError(`Vereinfachung nur für höchstens ${MAX_VARS} Variablen.`);
  const ms = [...new Set(minterms)].sort((a, b) => a - b);
  if (!ms.length) return { terms: [], primes: [], essential: [], stages: [], constant: 0 };
  const { primes, stages } = primeImplicants(n, ms, dontCares);
  const coverOf = (imp) => ms.filter((m) => implicantCovers(imp, m));
  const essential = [];
  for (const m of ms) {
    const covering = primes.filter((p) => implicantCovers(p, m));
    if (covering.length === 1 && !essential.includes(covering[0])) essential.push(covering[0]);
  }
  const covered = new Set(essential.flatMap(coverOf));
  const remaining = ms.filter((m) => !covered.has(m));
  const candidates = primes.filter((p) => !essential.includes(p));

  let best = null;
  const cost = (sel) => [sel.length, sel.reduce((s, p) => s + literalCount(p, n), 0)];
  const better = (a, b) => !b || a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  const search = (uncovered, chosen) => {
    if (best && chosen.length > best.cost[0]) return;
    if (!uncovered.length) {
      const c = cost(chosen);
      if (better(c, best?.cost)) best = { chosen: [...chosen], cost: c };
      return;
    }
    // Minterm mit den wenigsten Kandidaten zuerst verzweigen.
    let pick = null;
    let options = null;
    for (const m of uncovered) {
      const opts = candidates.filter((p) => implicantCovers(p, m));
      if (!options || opts.length < options.length) {
        pick = m;
        options = opts;
      }
    }
    void pick;
    for (const p of options) {
      search(uncovered.filter((m) => !implicantCovers(p, m)), [...chosen, p]);
    }
  };
  search(remaining, []);
  const rank = { 1: 0, 0: 1, '-': 2 };
  const key = (t) => [...implicantPattern(t, n)].map((c) => rank[c]).join('');
  const terms = [...essential, ...(best ? best.chosen : [])].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const isOne = terms.length === 1 && terms[0].mask === (1 << n) - 1;
  return { terms, primes, essential, stages, constant: isOne ? 1 : null };
}

export function dnfText(terms, vars) {
  if (!terms.length) return '0';
  return terms.map((t) => implicantText(t, vars)).join(' + ');
}

/**
 * Komplettanalyse eines Ausdrucks: Variablen, Tabelle, Minterme/Maxterme,
 * kanonische Formen und minimale DNF – inklusive Verifikation, dass die
 * minimale DNF dieselbe Wahrheitstabelle hat.
 */
export function analyzeExpression(input) {
  const ast = parse(input);
  const vars = variablesOf(ast);
  const rows = truthTable(ast, vars);
  const minterms = mintermsOf(rows);
  const maxterms = maxtermsOf(rows);
  const minimal = minimizeDNF(vars.length, minterms);
  const minimalText = dnfText(minimal.terms, vars);
  const dnf = canonicalDNF(vars, minterms);
  const knf = canonicalKNF(vars, maxterms);
  const verify = (text) => sameTable(parse(text), ast, vars);
  return {
    ast,
    normalized: toText(ast),
    vars,
    rows,
    minterms,
    maxterms,
    dnf,
    knf,
    minimal,
    minimalText,
    verified: { dnf: verify(dnf), knf: verify(knf), minimal: verify(minimalText) }
  };
}

/** Vergleicht zwei Ausdrücke über alle Belegungen der gegebenen Variablen. */
export function sameTable(a, b, vars) {
  const ta = truthTable(a, vars);
  const tb = truthTable(b, vars);
  return ta.every((r, i) => r.out === tb[i].out);
}
