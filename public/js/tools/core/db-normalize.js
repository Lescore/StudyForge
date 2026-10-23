/**
 * Normalisierung relationaler Schemata: funktionale Abhängigkeiten (FDs),
 * Attributhüllen, Kandidatenschlüssel, minimale Überdeckung, 2NF/3NF/BCNF,
 * 3NF-Synthese sowie Tabellenoperationen (Projektion, natürlicher Verbund)
 * für die Beispiel-Zerlegungen. Ohne DOM, unter Node testbar.
 *
 * Attributmengen werden intern als Bitmasken dargestellt (Bit i = Attribut i).
 */
import { InputError } from './num.js';

export const MAX_ATTRIBUTES = 16;
export const MAX_FDS = 60;

const NAME_RE = /^[\p{L}\p{N}_.-]+$/u;

/* ------------------------------------------------------------ Bitmasken */

export const bit = (i) => 1 << i;
export function popcount(mask) {
  let n = 0;
  for (let m = mask; m; m &= m - 1) n += 1;
  return n;
}
const isSubset = (a, b) => (a & b) === a;

export function maskToNames(mask, attributes) {
  return attributes.filter((_, i) => mask & bit(i));
}
export function namesToMask(names, attributes) {
  let mask = 0;
  for (const name of names) {
    const i = attributes.indexOf(name);
    if (i === -1) throw new InputError(`Unbekanntes Attribut „${name}“.`);
    mask |= bit(i);
  }
  return mask;
}
export function setText(mask, attributes) {
  const names = maskToNames(mask, attributes);
  return names.length ? `{${names.join(', ')}}` : '∅';
}
export function fdText(fd, attributes) {
  return `${maskToNames(fd.lhs, attributes).join(', ') || '∅'} → ${maskToNames(fd.rhs, attributes).join(', ') || '∅'}`;
}

/* ------------------------------------------------------------ Eingabe */

function splitNames(text) {
  return String(text)
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Attributliste „A, B, C“ (Komma, Semikolon oder Leerzeichen getrennt). */
export function parseAttributes(text) {
  const names = [];
  for (const name of splitNames(text)) {
    if (!NAME_RE.test(name)) throw new InputError(`Ungültiger Attributname „${name}“ (erlaubt: Buchstaben, Ziffern, _ . -).`);
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

/**
 * FDs zeilenweise: „MatrNr -> Name, Studiengang“ (auch → oder =>).
 * Fehlen Attribute in `attributes`, werden sie ergänzt, wenn `extend` gilt, sonst Fehler.
 */
export function parseFds(text, attributes, { extend = false } = {}) {
  const fds = [];
  const lines = String(text).split(/\r?\n/);
  lines.forEach((raw, idx) => {
    const line = raw.replace(/(#|\/\/).*$/, '').trim();
    if (!line) return;
    const parts = line.split(/->|→|=>/);
    if (parts.length !== 2) throw new InputError(`Zeile ${idx + 1}: Erwartet wird genau ein Pfeil, z. B. „A, B -> C“.`);
    const side = (part, label) => {
      const names = splitNames(part);
      if (!names.length) throw new InputError(`Zeile ${idx + 1}: Die ${label} Seite ist leer.`);
      for (const name of names) {
        if (!NAME_RE.test(name)) throw new InputError(`Zeile ${idx + 1}: Ungültiger Attributname „${name}“.`);
        if (!attributes.includes(name)) {
          if (!extend) throw new InputError(`Zeile ${idx + 1}: Attribut „${name}“ steht nicht in der Attributliste.`);
          attributes.push(name);
        }
      }
      return names;
    };
    const lhs = side(parts[0], 'linke');
    const rhs = side(parts[1], 'rechte');
    if (attributes.length > MAX_ATTRIBUTES) throw new InputError(`Höchstens ${MAX_ATTRIBUTES} Attribute (für die exakte Schlüsselsuche).`);
    fds.push({ lhs: namesToMask(lhs, attributes), rhs: namesToMask(rhs, attributes), line: idx + 1 });
  });
  if (fds.length > MAX_FDS) throw new InputError(`Höchstens ${MAX_FDS} funktionale Abhängigkeiten.`);
  return fds;
}

/* ------------------------------------------------------------ Hülle & Schlüssel */

/** Attributhülle X⁺ mit Protokoll der angewandten FDs. */
export function closure(mask, fds, { trace = false } = {}) {
  let result = mask;
  const log = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const fd of fds) {
      if (isSubset(fd.lhs, result) && !isSubset(fd.rhs, result)) {
        const added = fd.rhs & ~result;
        result |= fd.rhs;
        changed = true;
        if (trace) log.push({ fd, added, result });
      }
    }
  }
  return trace ? { mask: result, log } : result;
}

/** Alle Kandidatenschlüssel (exakt, minimal). */
export function candidateKeys(attributeCount, fds) {
  if (attributeCount > MAX_ATTRIBUTES) throw new InputError(`Höchstens ${MAX_ATTRIBUTES} Attribute.`);
  const all = attributeCount === 0 ? 0 : (2 ** attributeCount) - 1;
  let rhsUnion = 0;
  let lhsUnion = 0;
  for (const fd of fds) {
    rhsUnion |= fd.rhs & ~fd.lhs;
    lhsUnion |= fd.lhs;
  }
  // Attribute, die nie (nichttrivial) rechts stehen, gehören zu jedem Schlüssel.
  const core = all & ~rhsUnion;
  if (closure(core, fds) === all) return [core];
  // Attribute, die nur rechts stehen, gehören zu keinem Schlüssel.
  const optional = [];
  for (let i = 0; i < attributeCount; i += 1) if (!(core & bit(i)) && lhsUnion & bit(i)) optional.push(i);
  const subsets = [];
  for (let s = 1; s < 2 ** optional.length; s += 1) subsets.push(s);
  subsets.sort((a, b) => popcount(a) - popcount(b) || a - b);
  const keys = [];
  for (const s of subsets) {
    let mask = core;
    optional.forEach((attr, j) => {
      if (s & bit(j)) mask |= bit(attr);
    });
    if (keys.some((k) => isSubset(k, mask))) continue;
    if (closure(mask, fds) === all) keys.push(mask);
  }
  return keys;
}

/** FDs mit einelementiger rechter Seite, ohne triviale Anteile. */
export function splitFds(fds) {
  const out = [];
  for (const fd of fds) {
    const rhs = fd.rhs & ~fd.lhs;
    for (let i = 0; i < 31; i += 1) {
      if (rhs & bit(i) && !out.some((o) => o.lhs === fd.lhs && o.rhs === bit(i))) out.push({ lhs: fd.lhs, rhs: bit(i), line: fd.line });
    }
  }
  return out;
}

/** Minimale (kanonische) Überdeckung: rechts einelementig, links reduziert, ohne redundante FDs. */
export function minimalCover(fds) {
  let list = splitFds(fds);
  // Linksreduktion
  list = list.map((fd) => {
    let lhs = fd.lhs;
    for (let i = 0; i < 31; i += 1) {
      if (lhs & bit(i) && popcount(lhs) > 1) {
        const reduced = lhs & ~bit(i);
        if (isSubset(fd.rhs, closure(reduced, list))) lhs = reduced;
      }
    }
    return { ...fd, lhs };
  });
  // Doppelte entfernen
  list = list.filter((fd, i) => list.findIndex((o) => o.lhs === fd.lhs && o.rhs === fd.rhs) === i);
  // Rechtsreduktion (redundante FDs)
  for (let i = 0; i < list.length; ) {
    const rest = list.filter((_, j) => j !== i);
    if (isSubset(list[i].rhs, closure(list[i].lhs, rest))) list = rest;
    else i += 1;
  }
  return list;
}

/** FDs mit gleicher linker Seite zusammenfassen (nur für die Anzeige). */
export function mergeByLhs(fds) {
  const map = new Map();
  for (const fd of fds) map.set(fd.lhs, (map.get(fd.lhs) ?? 0) | fd.rhs);
  return [...map].map(([lhs, rhs]) => ({ lhs, rhs }));
}

/**
 * FDs auf eine Teilmenge von Attributen projizieren (über Hüllen aller Teilmengen).
 * Exponentiell – nur für kleine Relationen (≤ 12 Attribute) gedacht.
 */
export function projectFds(fds, subsetMask) {
  const members = [];
  for (let i = 0; i < 31; i += 1) if (subsetMask & bit(i)) members.push(i);
  if (members.length > 12) throw new InputError('Projektion nur für höchstens 12 Attribute.');
  const out = [];
  for (let s = 1; s < 2 ** members.length; s += 1) {
    let lhs = 0;
    members.forEach((attr, j) => {
      if (s & bit(j)) lhs |= bit(attr);
    });
    const rhs = closure(lhs, fds) & subsetMask & ~lhs;
    if (rhs) out.push({ lhs, rhs });
  }
  return minimalCover(out);
}

/* ------------------------------------------------------------ Normalformen */

/**
 * Vollständige Analyse eines Relationenschemas.
 * Ergebnis: keys, prime, nonPrime, cover, nf2/nf3/bcnf ({ ok, violations }), highest, synthesis.
 */
export function analyzeSchema(attributes, fds) {
  const n = attributes.length;
  if (!n) throw new InputError('Bitte mindestens ein Attribut angeben.');
  const all = (2 ** n) - 1;
  const keys = candidateKeys(n, fds);
  const prime = keys.reduce((m, k) => m | k, 0);
  const nonPrime = all & ~prime;
  const single = splitFds(fds);
  const isSuperkey = (mask) => closure(mask, fds) === all;

  // 2NF: kein Nichtschlüsselattribut hängt von einer echten Teilmenge eines Schlüssels ab.
  const nf2 = [];
  for (const key of keys) {
    if (popcount(key) < 2) continue;
    const reported = new Map(); // Attribut → schon über kleinere Teilmenge gemeldet
    const parts = [];
    for (let s = key; s; s = (s - 1) & key) if (s !== key) parts.push(s);
    parts.sort((a, b) => popcount(a) - popcount(b) || a - b);
    for (const part of parts) {
      let dependent = closure(part, fds) & nonPrime & ~part;
      for (const [attr, from] of reported) if (dependent & attr && isSubset(from, part)) dependent &= ~attr;
      if (!dependent) continue;
      for (let i = 0; i < n; i += 1) if (dependent & bit(i)) reported.set(bit(i), part);
      nf2.push({ lhs: part, rhs: dependent, key, kind: 'partiell' });
    }
  }

  // 3NF und BCNF: Prüfung der gegebenen FDs (rechts einelementig) genügt.
  const nf3 = [];
  const bcnf = [];
  for (const fd of single) {
    if (isSuperkey(fd.lhs)) continue;
    const partialKey = keys.find((k) => isSubset(fd.lhs, k) && fd.lhs !== k);
    bcnf.push({ ...fd, kind: fd.rhs & prime ? 'prim' : partialKey ? 'partiell' : 'transitiv' });
    if (!(fd.rhs & prime)) nf3.push({ ...fd, kind: partialKey ? 'partiell' : 'transitiv', key: partialKey ?? null });
  }
  const highest = nf2.length ? '1NF' : nf3.length ? '2NF' : bcnf.length ? '3NF' : 'BCNF';
  const cover = minimalCover(fds);
  return {
    attributes,
    all,
    keys,
    prime,
    nonPrime,
    cover,
    nf2: { ok: nf2.length === 0, violations: nf2 },
    nf3: { ok: nf3.length === 0, violations: nf3 },
    bcnf: { ok: bcnf.length === 0, violations: bcnf },
    highest,
    synthesis: synthesize3NF(n, fds, cover, keys)
  };
}

/** 3NF-Synthesealgorithmus (verlustfrei, abhängigkeitserhaltend). */
export function synthesize3NF(n, fds, cover = minimalCover(fds), keys = candidateKeys(n, fds)) {
  let relations = mergeByLhs(cover).map(({ lhs, rhs }) => ({ attrs: lhs | rhs, key: lhs }));
  relations = relations.filter((r, i) => !relations.some((o, j) => j !== i && isSubset(r.attrs, o.attrs) && (r.attrs !== o.attrs || j < i)));
  if (keys.length && !relations.some((r) => keys.some((k) => isSubset(k, r.attrs)))) relations.push({ attrs: keys[0], key: keys[0], keyRelation: true });
  if (!relations.length) {
    const all = (2 ** n) - 1;
    relations.push({ attrs: all, key: keys[0] ?? all });
  }
  return relations;
}

/** Bequeme Gesamtfunktion für die Oberfläche (Texteingaben). */
export function analyzeText({ attributes: attrText = '', fds: fdText = '', closureOf = '' }) {
  const attributes = parseAttributes(attrText);
  if (attributes.length > MAX_ATTRIBUTES) throw new InputError(`Höchstens ${MAX_ATTRIBUTES} Attribute (für die exakte Schlüsselsuche).`);
  const fds = parseFds(fdText, attributes, { extend: attributes.length === 0 });
  if (!attributes.length) throw new InputError('Bitte Attribute oder funktionale Abhängigkeiten angeben.');
  const result = analyzeSchema(attributes, fds);
  result.fds = fds;
  const query = parseAttributes(closureOf);
  if (query.length) {
    const mask = namesToMask(query, attributes);
    result.closureQuery = { start: mask, ...closure(mask, fds, { trace: true }) };
  }
  return result;
}

/* ------------------------------------------------------------ Tabellenoperationen */

/** Projektion π_cols(rows) mit Duplikatbeseitigung (Reihenfolge des ersten Auftretens). */
export function project(rows, cols) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const picked = Object.fromEntries(cols.map((c) => [c, row[c] ?? null]));
    const sig = JSON.stringify(cols.map((c) => picked[c]));
    if (!seen.has(sig)) {
      seen.add(sig);
      out.push(picked);
    }
  }
  return out;
}

/** Natürlicher Verbund zweier Tabellen (Zeilen als Objekte). */
export function naturalJoin(a, b) {
  if (!a.length || !b.length) return [];
  const common = Object.keys(a[0]).filter((k) => k in b[0]);
  const out = [];
  for (const x of a) for (const y of b) if (common.every((c) => x[c] === y[c])) out.push({ ...x, ...y });
  return out;
}

/** Prüft, ob die FD lhs → rhs in den Daten gilt. Liefert verletzende Wertepaare. */
export function fdViolations(rows, lhs, rhs) {
  const seen = new Map();
  const violations = [];
  for (const row of rows) {
    const k = JSON.stringify(lhs.map((c) => row[c]));
    const v = JSON.stringify(rhs.map((c) => row[c]));
    if (seen.has(k) && seen.get(k) !== v) violations.push({ lhs: k, a: seen.get(k), b: v });
    else seen.set(k, v);
  }
  return violations;
}

/** Wie oft kommt jeder Wert von `cols` vor? (Redundanz → Änderungsanomalie) */
export function valueCounts(rows, cols) {
  const map = new Map();
  for (const row of rows) {
    const k = cols.map((c) => row[c]).join(' | ');
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

/** Wiederholungsgruppe auflösen (UNF → 1NF). */
export function flattenGroup(rows, groupName) {
  const out = [];
  for (const row of rows) {
    const { [groupName]: group, ...rest } = row;
    for (const item of group) out.push({ ...rest, ...item });
  }
  return out;
}
