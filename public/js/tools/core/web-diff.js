/**
 * Zeilenweiser Textvergleich nach Myers („An O(ND) Difference Algorithm“, 1986)
 * in der speichersparenden Variante mit „mittlerer Schlange“ (linearer Speicher).
 * Liefert eine kürzeste Editierfolge (minimale Anzahl eingefügter + gelöschter Zeilen).
 */
import { InputError } from './num.js';

export const DIFF_MAX_LINES = 5000;
export const DIFF_MAX_CHARS = 1000000;

/** Text in Zeilen zerlegen (\r\n, \r und \n). Ein abschließender Umbruch erzeugt keine leere Zusatzzeile. */
export function splitLines(text) {
  if (text === '') return [];
  const lines = String(text).split(/\r\n|\r|\n/);
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * Kern: Myers-Diff auf Ganzzahl-Arrays. Rückgabe: Liste von Operationen
 * { op: 'equal' | 'delete' | 'insert', a: Index in A (oder -1), b: Index in B (oder -1) }.
 */
export function myersDiff(a, b) {
  const ops = [];
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const vf = new Int32Array(2 * max + 4);
  const vb = new Int32Array(2 * max + 4);

  const middleSnake = (aS, aE, bS, bE) => {
    const N = aE - aS;
    const M = bE - bS;
    const delta = N - M;
    const odd = (delta & 1) !== 0;
    const D = Math.ceil((N + M) / 2);
    const off = D + 1;
    vf.fill(0, 0, 2 * D + 4);
    vb.fill(0, 0, 2 * D + 4);
    for (let d = 0; d <= D; d += 1) {
      for (let k = -d; k <= d; k += 2) {
        let x = k === -d || (k !== d && vf[off + k - 1] < vf[off + k + 1]) ? vf[off + k + 1] : vf[off + k - 1] + 1;
        let y = x - k;
        const x0 = x;
        const y0 = y;
        while (x < N && y < M && a[aS + x] === b[bS + y]) {
          x += 1;
          y += 1;
        }
        vf[off + k] = x;
        const kr = delta - k;
        if (odd && kr >= -(d - 1) && kr <= d - 1 && vf[off + k] + vb[off + kr] >= N) {
          return [aS + x0, bS + y0, aS + x, bS + y];
        }
      }
      for (let k = -d; k <= d; k += 2) {
        let x = k === -d || (k !== d && vb[off + k - 1] < vb[off + k + 1]) ? vb[off + k + 1] : vb[off + k - 1] + 1;
        let y = x - k;
        const x0 = x;
        const y0 = y;
        while (x < N && y < M && a[aE - 1 - x] === b[bE - 1 - y]) {
          x += 1;
          y += 1;
        }
        vb[off + k] = x;
        const kf = delta - k;
        if (!odd && kf >= -d && kf <= d && vb[off + k] + vf[off + kf] >= N) {
          return [aE - x, bE - y, aE - x0, bE - y0];
        }
      }
    }
    throw new Error('Diff: keine mittlere Schlange gefunden.');
  };

  const solve = (aS, aE, bS, bE) => {
    // gemeinsamer Anfang
    while (aS < aE && bS < bE && a[aS] === b[bS]) {
      ops.push({ op: 'equal', a: aS, b: bS });
      aS += 1;
      bS += 1;
    }
    // gemeinsames Ende (später anhängen)
    let tail = 0;
    while (aE > aS && bE > bS && a[aE - 1] === b[bE - 1]) {
      aE -= 1;
      bE -= 1;
      tail += 1;
    }
    if (aS === aE) {
      for (let j = bS; j < bE; j += 1) ops.push({ op: 'insert', a: -1, b: j });
    } else if (bS === bE) {
      for (let i = aS; i < aE; i += 1) ops.push({ op: 'delete', a: i, b: -1 });
    } else {
      const [x, y, u, v] = middleSnake(aS, aE, bS, bE);
      solve(aS, x, bS, y);
      for (let i = 0; i < u - x; i += 1) ops.push({ op: 'equal', a: x + i, b: y + i });
      solve(u, aE, v, bE);
    }
    for (let i = 0; i < tail; i += 1) ops.push({ op: 'equal', a: aE + i, b: bE + i });
  };

  solve(0, n, 0, m);
  // Löschungen vor Einfügungen innerhalb eines Änderungsblocks (übliche Darstellung)
  return normalizeOrder(ops);
}

function normalizeOrder(ops) {
  const out = [];
  let dels = [];
  let ins = [];
  const flush = () => {
    out.push(...dels, ...ins);
    dels = [];
    ins = [];
  };
  for (const o of ops) {
    if (o.op === 'equal') {
      flush();
      out.push(o);
    } else if (o.op === 'delete') dels.push(o);
    else ins.push(o);
  }
  flush();
  return out;
}

/**
 * Vergleicht zwei Texte zeilenweise.
 * Optionen: ignoreTrailing (Leerraum am Zeilenende), ignoreCase.
 */
export function diffText(left, right, { ignoreTrailing = false, ignoreCase = false } = {}) {
  if (left.length > DIFF_MAX_CHARS || right.length > DIFF_MAX_CHARS) {
    throw new InputError(`Text zu groß (höchstens ${DIFF_MAX_CHARS.toLocaleString('de-DE')} Zeichen je Seite).`);
  }
  const a = splitLines(left);
  const b = splitLines(right);
  if (a.length > DIFF_MAX_LINES || b.length > DIFF_MAX_LINES) {
    throw new InputError(`Zu viele Zeilen (${Math.max(a.length, b.length).toLocaleString('de-DE')}); höchstens ${DIFF_MAX_LINES.toLocaleString('de-DE')} je Seite.`);
  }
  const ids = new Map();
  const key = (line) => {
    let k = line;
    if (ignoreTrailing) k = k.replace(/[ \t]+$/, '');
    if (ignoreCase) k = k.toLowerCase();
    if (!ids.has(k)) ids.set(k, ids.size);
    return ids.get(k);
  };
  const ops = myersDiff(a.map(key), b.map(key));
  const stats = { added: 0, removed: 0, unchanged: 0 };
  for (const o of ops) {
    if (o.op === 'equal') stats.unchanged += 1;
    else if (o.op === 'insert') stats.added += 1;
    else stats.removed += 1;
  }
  return { a, b, ops, stats, identical: stats.added === 0 && stats.removed === 0 };
}

/** Zeilen für die Nebeneinander-Ansicht: gelöschte und eingefügte Zeilen eines Blocks werden gepaart. */
export function sideBySide(result) {
  const rows = [];
  const { ops, a, b } = result;
  for (let i = 0; i < ops.length; ) {
    const o = ops[i];
    if (o.op === 'equal') {
      rows.push({ kind: 'equal', left: { n: o.a + 1, text: a[o.a] }, right: { n: o.b + 1, text: b[o.b] } });
      i += 1;
      continue;
    }
    const dels = [];
    const ins = [];
    while (i < ops.length && ops[i].op !== 'equal') {
      if (ops[i].op === 'delete') dels.push(ops[i]);
      else ins.push(ops[i]);
      i += 1;
    }
    for (let j = 0; j < Math.max(dels.length, ins.length); j += 1) {
      const d = dels[j];
      const s = ins[j];
      rows.push({
        kind: d && s ? 'change' : d ? 'delete' : 'insert',
        left: d ? { n: d.a + 1, text: a[d.a] } : null,
        right: s ? { n: s.b + 1, text: b[s.b] } : null
      });
    }
  }
  return rows;
}

/** Vereinheitlichtes Format (wie `diff -u`) mit `context` Kontextzeilen. */
export function unifiedDiff(result, { context = 3, nameA = 'a', nameB = 'b' } = {}) {
  const { ops, a, b } = result;
  if (result.identical) return { text: '', hunks: [] };
  const changeIdx = ops.map((o, i) => (o.op === 'equal' ? -1 : i)).filter((i) => i >= 0);
  const hunks = [];
  let start = null;
  let end = null;
  for (const i of changeIdx) {
    if (start === null) {
      start = Math.max(0, i - context);
      end = Math.min(ops.length - 1, i + context);
    } else if (i - context <= end + 1) {
      end = Math.min(ops.length - 1, i + context);
    } else {
      hunks.push([start, end]);
      start = Math.max(0, i - context);
      end = Math.min(ops.length - 1, i + context);
    }
  }
  if (start !== null) hunks.push([start, end]);

  const lines = [`--- ${nameA}`, `+++ ${nameB}`];
  const out = [];
  for (const [s, e] of hunks) {
    const slice = ops.slice(s, e + 1);
    // Startzeilen: erste Zeile des Blocks in A bzw. B (1-basiert)
    let aStart = a.length + 1;
    let bStart = b.length + 1;
    for (let i = s; i < ops.length; i += 1) if (ops[i].a >= 0) { aStart = ops[i].a + 1; break; }
    for (let i = s; i < ops.length; i += 1) if (ops[i].b >= 0) { bStart = ops[i].b + 1; break; }
    const aLen = slice.filter((o) => o.op !== 'insert').length;
    const bLen = slice.filter((o) => o.op !== 'delete').length;
    if (aLen === 0) aStart -= 1; // Konvention: leerer Bereich zeigt auf die Zeile davor
    if (bLen === 0) bStart -= 1;
    if (!aLen && aStart < 0) aStart = 0;
    if (!bLen && bStart < 0) bStart = 0;
    const header = `@@ -${aStart}${aLen === 1 ? '' : `,${aLen}`} +${bStart}${bLen === 1 ? '' : `,${bLen}`} @@`;
    const body = slice.map((o) => (o.op === 'equal' ? { sign: ' ', text: a[o.a] } : o.op === 'delete' ? { sign: '-', text: a[o.a] } : { sign: '+', text: b[o.b] }));
    out.push({ header, lines: body });
    lines.push(header, ...body.map((l) => l.sign + l.text));
  }
  return { text: `${lines.join('\n')}\n`, hunks: out };
}
