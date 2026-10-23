/**
 * Zeichentabellen: ASCII-Steuerzeichen, Codepoint-Suche, UTF-8/UTF-16-Kodierung
 * einzelner Codepoints, Unicode-Blöcke und Graphem-Analyse.
 *
 * Bewusst unabhängig von utf8.js (eigenes Werkzeug „textcodierung“).
 * Reine Logik ohne DOM; Intl.Segmenter gibt es in Browsern und in Node.
 */
import { InputError } from './num.js';

export const MAX_CODEPOINT = 0x10ffff;
export const MAX_PAGE = 256;

/** Kürzel und Bedeutung der ASCII-Steuerzeichen 0–31 und 127. */
export const ASCII_CONTROL = {
  0: ['NUL', 'Nullzeichen'], 1: ['SOH', 'Start of Heading'], 2: ['STX', 'Start of Text'], 3: ['ETX', 'End of Text'],
  4: ['EOT', 'End of Transmission'], 5: ['ENQ', 'Enquiry'], 6: ['ACK', 'Acknowledge'], 7: ['BEL', 'Klingel (Bell)'],
  8: ['BS', 'Rückschritt (Backspace)'], 9: ['HT', 'Horizontaler Tabulator'], 10: ['LF', 'Zeilenvorschub (Line Feed)'],
  11: ['VT', 'Vertikaler Tabulator'], 12: ['FF', 'Seitenvorschub (Form Feed)'], 13: ['CR', 'Wagenrücklauf (Carriage Return)'],
  14: ['SO', 'Shift Out'], 15: ['SI', 'Shift In'], 16: ['DLE', 'Data Link Escape'], 17: ['DC1', 'Device Control 1 (XON)'],
  18: ['DC2', 'Device Control 2'], 19: ['DC3', 'Device Control 3 (XOFF)'], 20: ['DC4', 'Device Control 4'],
  21: ['NAK', 'Negative Acknowledge'], 22: ['SYN', 'Synchronous Idle'], 23: ['ETB', 'End of Transmission Block'],
  24: ['CAN', 'Cancel'], 25: ['EM', 'End of Medium'], 26: ['SUB', 'Substitute'], 27: ['ESC', 'Escape'],
  28: ['FS', 'File Separator'], 29: ['GS', 'Group Separator'], 30: ['RS', 'Record Separator'], 31: ['US', 'Unit Separator'],
  127: ['DEL', 'Löschen (Delete)']
};

/** Auswahl gängiger Unicode-Blöcke (Bereiche laut Unicode-Standard). */
export const BLOCKS = [
  { id: 'basic-latin', label: 'Basis-Latein (ASCII)', start: 0x0000, end: 0x007f },
  { id: 'latin1', label: 'Latin-1-Ergänzung', start: 0x0080, end: 0x00ff },
  { id: 'latin-ext-a', label: 'Lateinisch, erweitert-A', start: 0x0100, end: 0x017f },
  { id: 'combining', label: 'Kombinierende diakritische Zeichen', start: 0x0300, end: 0x036f },
  { id: 'greek', label: 'Griechisch und Koptisch', start: 0x0370, end: 0x03ff },
  { id: 'cyrillic', label: 'Kyrillisch', start: 0x0400, end: 0x04ff },
  { id: 'punctuation', label: 'Allgemeine Interpunktion', start: 0x2000, end: 0x206f },
  { id: 'currency', label: 'Währungszeichen', start: 0x20a0, end: 0x20cf },
  { id: 'letterlike', label: 'Buchstabenähnliche Symbole', start: 0x2100, end: 0x214f },
  { id: 'arrows', label: 'Pfeile', start: 0x2190, end: 0x21ff },
  { id: 'math', label: 'Mathematische Operatoren', start: 0x2200, end: 0x22ff },
  { id: 'box', label: 'Rahmenzeichen (Box Drawing)', start: 0x2500, end: 0x257f },
  { id: 'shapes', label: 'Geometrische Formen', start: 0x25a0, end: 0x25ff },
  { id: 'misc-symbols', label: 'Verschiedene Symbole', start: 0x2600, end: 0x26ff },
  { id: 'dingbats', label: 'Dingbats', start: 0x2700, end: 0x27bf },
  { id: 'pictographs', label: 'Verschiedene Symbole und Piktogramme', start: 0x1f300, end: 0x1f5ff },
  { id: 'emoticons', label: 'Emoticons (Emojis)', start: 0x1f600, end: 0x1f64f }
];

/** UTF-8-Bytes eines Codepoints (Surrogate sind nicht kodierbar). */
export function utf8Bytes(cp) {
  checkCodepoint(cp);
  if (isSurrogate(cp)) return null;
  if (cp < 0x80) return [cp];
  if (cp < 0x800) return [0xc0 | (cp >> 6), 0x80 | (cp & 0x3f)];
  if (cp < 0x10000) return [0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)];
  return [0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)];
}

/** UTF-16-Codeeinheiten (bei Codepoints über U+FFFF ein Surrogatpaar). */
export function utf16Units(cp) {
  checkCodepoint(cp);
  if (cp < 0x10000) return [cp];
  const v = cp - 0x10000;
  return [0xd800 | (v >> 10), 0xdc00 | (v & 0x3ff)];
}

export const isSurrogate = (cp) => cp >= 0xd800 && cp <= 0xdfff;

function checkCodepoint(cp) {
  if (!Number.isInteger(cp) || cp < 0 || cp > MAX_CODEPOINT) {
    throw new InputError(`Codepoint außerhalb des Unicode-Bereichs (U+0000 bis U+10FFFF).`);
  }
}

export const hex = (n, width = 2) => n.toString(16).toUpperCase().padStart(width, '0');
export const uPlus = (cp) => `U+${hex(cp, 4)}`;

const CATEGORIES = [
  ['Lu', 'Großbuchstabe'], ['Ll', 'Kleinbuchstabe'], ['Lt', 'Titelbuchstabe'], ['Lm', 'Modifikatorbuchstabe'], ['Lo', 'Anderer Buchstabe'],
  ['Mn', 'Kombinierendes Zeichen (ohne eigene Breite)'], ['Mc', 'Kombinierendes Zeichen (mit Breite)'], ['Me', 'Umschließendes Zeichen'],
  ['Nd', 'Dezimalziffer'], ['Nl', 'Buchstabenziffer'], ['No', 'Andere Ziffer'],
  ['Pc', 'Verbindungszeichen'], ['Pd', 'Bindestrich'], ['Ps', 'Öffnende Klammer'], ['Pe', 'Schließende Klammer'],
  ['Pi', 'Öffnendes Anführungszeichen'], ['Pf', 'Schließendes Anführungszeichen'], ['Po', 'Anderes Satzzeichen'],
  ['Sm', 'Mathematisches Symbol'], ['Sc', 'Währungssymbol'], ['Sk', 'Modifikatorsymbol'], ['So', 'Anderes Symbol'],
  ['Zs', 'Leerzeichen'], ['Zl', 'Zeilentrenner'], ['Zp', 'Absatztrenner'],
  ['Cc', 'Steuerzeichen'], ['Cf', 'Formatzeichen (unsichtbar)'], ['Co', 'Privater Bereich'], ['Cn', 'Nicht zugewiesen']
].map(([code, label]) => ({ code, label, re: new RegExp(`^\\p{gc=${code}}$`, 'u') }));

/** Allgemeine Unicode-Kategorie (laut Unicode-Daten der JavaScript-Laufzeit). */
export function category(cp) {
  if (isSurrogate(cp)) return { code: 'Cs', label: 'Surrogat (kein eigenständiges Zeichen)' };
  const ch = String.fromCodePoint(cp);
  return CATEGORIES.find((c) => c.re.test(ch)) ?? { code: '?', label: 'unbekannt' };
}

/** Darstellbarkeit: Steuerzeichen, Kombinationszeichen und Leerraum sichtbar machen. */
export function displayChar(cp) {
  if (isSurrogate(cp)) return { text: '', kind: 'surrogate' };
  if (ASCII_CONTROL[cp]) return { text: ASCII_CONTROL[cp][0], kind: 'control' };
  const cat = category(cp).code;
  if (cat === 'Cc') return { text: hex(cp, 2), kind: 'control' };
  if (cat === 'Cn') return { text: '', kind: 'unassigned' };
  if (cat === 'Co') return { text: '', kind: 'private' };
  if (cat === 'Zs' || cat === 'Zl' || cat === 'Zp' || cat === 'Cf') return { text: cp === 0x20 ? 'SP' : '', kind: 'space' };
  if (cat === 'Mn' || cat === 'Me' || cat === 'Mc') return { text: `◌${String.fromCodePoint(cp)}`, kind: 'combining' };
  return { text: String.fromCodePoint(cp), kind: 'char' };
}

/** Alle Darstellungen eines Codepoints. */
export function describeCodepoint(cp) {
  checkCodepoint(cp);
  const bytes = utf8Bytes(cp);
  const units = utf16Units(cp);
  return {
    cp,
    uplus: uPlus(cp),
    dec: String(cp),
    hex: `0x${hex(cp, 2)}`,
    bin: cp.toString(2),
    utf8: bytes,
    utf8Hex: bytes ? bytes.map((b) => hex(b)).join(' ') : '– (Surrogat, nicht einzeln kodierbar)',
    utf8Bin: bytes ? bytes.map((b) => b.toString(2).padStart(8, '0')).join(' ') : '',
    utf16Hex: units.map((u) => hex(u, 4)).join(' '),
    htmlEntity: `&#x${hex(cp, 1)};`,
    jsEscape: cp > 0xffff ? `\\u{${hex(cp, 1)}}` : `\\u${hex(cp, 4)}`,
    category: category(cp),
    control: ASCII_CONTROL[cp] ?? null,
    display: displayChar(cp)
  };
}

/**
 * Suche: „U+00E9“, „0xE9“, „233“ (dezimal), „&#233;“/„&#xE9;“ oder
 * direkt eingegebene Zeichen (alle Codepoints des Textes).
 */
export function parseCodepointQuery(query) {
  const raw = String(query ?? '');
  const q = raw.trim();
  if (!raw) throw new InputError('Bitte ein Zeichen, einen Codepoint (U+00E9) oder eine Zahl eingeben.');
  if (raw.length > 200) throw new InputError('Eingabe ist zu lang (höchstens 200 Zeichen).');
  const num = (text, base) => {
    const v = parseInt(text, base);
    if (!Number.isFinite(v) || v > MAX_CODEPOINT) throw new InputError(`„${q}“ liegt außerhalb des Unicode-Bereichs (höchstens U+10FFFF = 1 114 111).`);
    return v;
  };
  let m;
  if ((m = /^(?:U\+|u\+)([0-9a-fA-F]{1,8})$/.exec(q))) return { kind: 'U+', codepoints: [num(m[1], 16)] };
  if ((m = /^0[xX]([0-9a-fA-F]{1,8})$/.exec(q))) return { kind: 'hex', codepoints: [num(m[1], 16)] };
  if ((m = /^&#[xX]([0-9a-fA-F]{1,8});?$/.exec(q))) return { kind: 'entity', codepoints: [num(m[1], 16)] };
  if ((m = /^&#([0-9]{1,8});?$/.exec(q))) return { kind: 'entity', codepoints: [num(m[1], 10)] };
  if (/^[0-9]{2,8}$/.test(q)) return { kind: 'dec', codepoints: [num(q, 10)] };
  // Einzelne Ziffer: als Zeichen interpretieren, aber auf Mehrdeutigkeit hinweisen.
  const cps = [...raw].map((ch) => ch.codePointAt(0));
  return { kind: 'text', codepoints: cps, ambiguousDigit: /^[0-9]$/.test(q) };
}

/** Eine Seite eines Unicode-Bereichs. */
export function blockPage(start, end, page = 0, pageSize = 128) {
  checkCodepoint(start);
  checkCodepoint(end);
  if (end < start) throw new InputError('Das Bereichsende liegt vor dem Anfang.');
  const size = Math.min(Math.max(16, pageSize), MAX_PAGE);
  const total = end - start + 1;
  const pages = Math.ceil(total / size);
  const p = Math.min(Math.max(0, page), pages - 1);
  const from = start + p * size;
  const to = Math.min(end, from + size - 1);
  const cells = [];
  for (let cp = from; cp <= to; cp += 1) cells.push({ cp, display: displayChar(cp) });
  return { from, to, page: p, pages, total, cells };
}

export function parseHexCodepoint(text, label) {
  const t = String(text ?? '').trim().replace(/^(U\+|0x)/i, '');
  if (!/^[0-9a-fA-F]{1,6}$/.test(t)) throw new InputError(`${label}: Bitte einen Hex-Codepoint eingeben (z. B. 2190 oder U+2190).`);
  const v = parseInt(t, 16);
  if (v > MAX_CODEPOINT) throw new InputError(`${label}: höchstens U+10FFFF.`);
  return v;
}

const SPECIAL = {
  0x200d: 'Zero Width Joiner (ZWJ) – verbindet Emojis zu einem Zeichen',
  0xfe0f: 'Variation Selector-16 – Emoji-Darstellung erzwingen',
  0xfe0e: 'Variation Selector-15 – Textdarstellung erzwingen',
  0x20e3: 'Combining Enclosing Keycap',
  0x200b: 'Zero Width Space'
};

/** Rolle eines Codepoints innerhalb eines Graphems (für die Erklärung). */
export function codepointRole(cp) {
  if (SPECIAL[cp]) return SPECIAL[cp];
  if (cp >= 0x1f3fb && cp <= 0x1f3ff) return `Hautfarben-Modifikator (Fitzpatrick Typ ${['1–2', '3', '4', '5', '6'][cp - 0x1f3fb]})`;
  if (cp >= 0x1f1e6 && cp <= 0x1f1ff) return `Regionalindikator ${String.fromCharCode(65 + cp - 0x1f1e6)} (zwei ergeben eine Flagge)`;
  if (cp >= 0xe0020 && cp <= 0xe007f) return 'Tag-Zeichen (für Unterflaggen)';
  const cat = category(cp).code;
  if (cat === 'Mn' || cat === 'Me' || cat === 'Mc') return 'Kombinierendes Zeichen (gehört zum vorherigen Zeichen)';
  return '';
}

/** Zerlegt Text in Grapheme (sichtbare Zeichen) samt Codepoints und Bytes. */
export function analyzeText(text, { maxLength = 500 } = {}) {
  const t = String(text ?? '');
  if (t.length > maxLength) throw new InputError(`Text ist zu lang (höchstens ${maxLength} UTF-16-Einheiten).`);
  const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('de', { granularity: 'grapheme' }) : null;
  const graphemes = segmenter ? [...segmenter.segment(t)].map((s) => s.segment) : [...t];
  let bytes = 0;
  const items = graphemes.map((g) => {
    const cps = [...g].map((ch) => ch.codePointAt(0));
    const parts = cps.map((cp) => {
      const b = utf8Bytes(cp) ?? [0xef, 0xbf, 0xbd]; // einzelnes Surrogat → Ersatzzeichen (wie TextEncoder)
      return { cp, uplus: uPlus(cp), utf8: b, role: codepointRole(cp), display: displayChar(cp) };
    });
    const count = parts.reduce((s, p) => s + p.utf8.length, 0);
    bytes += count;
    return { text: g, codepoints: parts, utf8Count: count, utf16Count: g.length };
  });
  return {
    graphemes: items,
    graphemeCount: items.length,
    codepointCount: items.reduce((s, g) => s + g.codepoints.length, 0),
    utf16Count: t.length,
    utf8Count: bytes,
    segmenter: Boolean(segmenter),
    nfc: t.normalize('NFC'),
    nfd: t.normalize('NFD')
  };
}
