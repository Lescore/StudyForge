/**
 * Reguläre Ausdrücke (native JavaScript-RegExp) – Treffer sammeln mit Grenzen.
 * Wird im Web Worker (prog-regex-worker.js) ausgeführt, damit katastrophales
 * Backtracking die Oberfläche nicht blockiert; hier nur reine Logik ohne DOM.
 */

export const LIMITS = { pattern: 1000, text: 100000, matches: 1000, replacement: 1000 };
export const KNOWN_FLAGS = ['d', 'g', 'i', 'm', 's', 'u', 'v', 'y'];

export class RegexInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InputError';
  }
}

/** Welche Flags unterstützt diese JavaScript-Umgebung? */
export function supportedFlags() {
  return KNOWN_FLAGS.filter((flag) => {
    try {
      new RegExp('', flag);
      return true;
    } catch {
      return false;
    }
  });
}

/** Prüft Eingaben und erzeugt das RegExp-Objekt. SyntaxError-Texte werden übernommen. */
export function buildRegex(pattern, flags) {
  const p = String(pattern ?? '');
  const f = String(flags ?? '');
  if (p.length > LIMITS.pattern) throw new RegexInputError(`Das Muster ist zu lang (höchstens ${LIMITS.pattern} Zeichen).`);
  for (const ch of f) {
    if (!KNOWN_FLAGS.includes(ch)) throw new RegexInputError(`Unbekanntes Flag „${ch}“.`);
  }
  if (new Set(f).size !== f.length) throw new RegexInputError('Ein Flag ist doppelt angegeben.');
  try {
    return new RegExp(p, f);
  } catch (error) {
    const e = new RegexInputError(`Ungültiges Muster: ${error.message}`);
    e.syntax = error.message;
    throw e;
  }
}

/** Nächste Position nach einem Null-Längen-Treffer (bei u/v ganze Codepoints überspringen). */
function advance(text, index, unicode) {
  if (!unicode || index + 1 >= text.length) return index + 1;
  const code = text.charCodeAt(index);
  if (code >= 0xd800 && code <= 0xdbff) {
    const next = text.charCodeAt(index + 1);
    if (next >= 0xdc00 && next <= 0xdfff) return index + 2;
  }
  return index + 1;
}

/**
 * Sammelt Treffer. Ohne g/y wird – wie bei exec – nur der erste Treffer gesucht.
 * Ergebnis: { matches: [{ index, length, text, groups: [{ n, value, start }], named: {…} }],
 *             truncated, total (gezählt bis zur Grenze) }
 */
export function collectMatches(pattern, flags, text, { maxMatches = LIMITS.matches } = {}) {
  const t = String(text ?? '');
  if (t.length > LIMITS.text) throw new RegexInputError(`Der Testtext ist zu lang (höchstens ${LIMITS.text.toLocaleString('de-DE')} Zeichen).`);
  const re = buildRegex(pattern, flags);
  const all = re.global || re.sticky;
  const unicode = re.unicode || Boolean(re.unicodeSets);
  const matches = [];
  let truncated = false;
  re.lastIndex = 0;
  for (;;) {
    const m = re.exec(t);
    if (!m) break;
    if (matches.length >= maxMatches) {
      truncated = true;
      break;
    }
    const groups = [];
    for (let i = 1; i < m.length; i += 1) {
      groups.push({ n: i, value: m[i] === undefined ? null : m[i], start: m.indices?.[i]?.[0] ?? null });
    }
    const named = m.groups ? Object.fromEntries(Object.entries(m.groups).map(([k, v]) => [k, v === undefined ? null : v])) : null;
    matches.push({ index: m.index, length: m[0].length, text: m[0], groups, named });
    if (!all) break;
    // Null-Längen-Treffer: lastIndex selbst weiterschalten, sonst Endlosschleife.
    if (m[0].length === 0) re.lastIndex = advance(t, re.lastIndex, unicode);
    if (re.lastIndex > t.length) break;
  }
  return { matches, truncated, flags: re.flags, source: re.source };
}

/** Ersetzen-Vorschau mit nativer String.prototype.replace (Ersetzungsmuster $1, $<name>, $&). */
export function replacePreview(pattern, flags, text, replacement) {
  const r = String(replacement ?? '');
  if (r.length > LIMITS.replacement) throw new RegexInputError(`Die Ersetzung ist zu lang (höchstens ${LIMITS.replacement} Zeichen).`);
  const t = String(text ?? '');
  if (t.length > LIMITS.text) throw new RegexInputError(`Der Testtext ist zu lang (höchstens ${LIMITS.text.toLocaleString('de-DE')} Zeichen).`);
  const re = buildRegex(pattern, flags);
  const out = t.replace(re, r);
  if (out.length > 1_000_000) throw new RegexInputError('Das Ergebnis der Ersetzung wäre zu lang (über 1 000 000 Zeichen).');
  return out;
}

/** Text in Abschnitte zerlegen: [{ text, match: Index|null }] – für sichere Hervorhebung. */
export function segmentsFor(text, matches) {
  const out = [];
  let pos = 0;
  matches.forEach((m, i) => {
    if (m.index > pos) out.push({ text: text.slice(pos, m.index), match: null });
    if (m.index >= pos) {
      out.push({ text: text.slice(m.index, m.index + m.length), match: i, empty: m.length === 0 });
      pos = m.index + m.length;
    }
  });
  if (pos < text.length) out.push({ text: text.slice(pos), match: null });
  return out;
}
