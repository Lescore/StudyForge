/**
 * Text ↔ UTF-8-Bytes, mit eigener Validierung, damit Fehler mit genauer
 * Position und Ursache gemeldet werden können.
 */
import { InputError } from './num.js';

export const MAX_TEXT = 20000;
export const MAX_BYTES = 80000;

const encoder = new TextEncoder();

export function encodeUtf8(text) {
  if (String(text).length > MAX_TEXT) throw new InputError(`Text ist zu lang (höchstens ${MAX_TEXT} Zeichen).`);
  return encoder.encode(text);
}

/** Bytes, die ein Codepoint in UTF-8 belegt. */
export function utf8Length(cp) {
  return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
}

const hex = (n, len = 2) => n.toString(16).toUpperCase().padStart(len, '0');
const bin = (n) => n.toString(2).padStart(8, '0');

/** Analyse je Codepoint: Zeichen, U+XXXX, UTF-8-Bytes, UTF-16-Einheiten. */
export function analyzeText(text) {
  const bytes = encodeUtf8(text);
  const codepoints = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    const enc = encoder.encode(ch);
    codepoints.push({
      char: ch,
      cp,
      label: `U+${hex(cp, 4)}`,
      bytes: [...enc],
      utf16: ch.length,
      isSurrogate: cp >= 0xd800 && cp <= 0xdfff,
      outsideBmp: cp > 0xffff
    });
  }
  let graphemes = null;
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    graphemes = [...new Intl.Segmenter('de', { granularity: 'grapheme' }).segment(text)].length;
  }
  return {
    bytes,
    codepoints,
    counts: {
      graphemes,
      codepoints: codepoints.length,
      utf16Units: text.length,
      bytes: bytes.length
    },
    loneSurrogates: codepoints.filter((c) => c.isSurrogate).length
  };
}

/** Bitmuster eines Codepoints in UTF-8 mit markierten Präfix- und Datenbits. */
export function utf8BitLayout(cp) {
  const len = utf8Length(cp);
  const bytes = [...encoder.encode(String.fromCodePoint(cp))];
  const prefixLens = len === 1 ? [1] : [len + 1, ...Array(len - 1).fill(2)];
  return bytes.map((b, i) => ({ byte: b, bits: bin(b), prefix: bin(b).slice(0, prefixLens[i]), data: bin(b).slice(prefixLens[i]) }));
}

export function formatBytes(bytes, format = 'hex') {
  const list = [...bytes];
  if (format === 'hex') return list.map((b) => hex(b)).join(' ');
  if (format === 'bin') return list.map(bin).join(' ');
  if (format === 'dec') return list.join(' ');
  throw new InputError(`Unbekanntes Format „${format}“.`);
}

/**
 * Liest eine Bytefolge als Hex („48 65 6C“, „48656c“, „0x48,0x65“),
 * Binär („01001000 01100101“) oder Dezimal („72 101“).
 */
export function parseBytes(input, format = 'hex') {
  const text = String(input ?? '').trim();
  if (!text) return new Uint8Array();
  let tokens;
  if (format === 'hex') {
    const cleaned = text.replace(/0x/gi, '').replace(/[\s,;:]/g, '');
    if (!/^[0-9a-fA-F]*$/.test(cleaned)) {
      const bad = cleaned.match(/[^0-9a-fA-F]/)[0];
      throw new InputError(`Ungültiges Zeichen „${bad}“ in der Hex-Eingabe. Erlaubt sind 0–9, A–F und Trennzeichen.`);
    }
    if (cleaned.length % 2) throw new InputError(`Ungerade Anzahl Hex-Ziffern (${cleaned.length}). Jedes Byte braucht genau zwei Hex-Ziffern.`);
    tokens = cleaned.match(/../g).map((h) => parseInt(h, 16));
  } else if (format === 'bin') {
    const groups = text.split(/[\s,;]+/).filter(Boolean);
    const joined = groups.every((g) => g.length === 8) ? groups : null;
    const cleaned = text.replace(/[\s,;]/g, '');
    if (!/^[01]*$/.test(cleaned)) throw new InputError('Binäreingabe darf nur 0, 1 und Trennzeichen enthalten.');
    if (!joined && cleaned.length % 8) throw new InputError(`Die Anzahl der Bits (${cleaned.length}) ist kein Vielfaches von 8.`);
    tokens = (joined ?? cleaned.match(/.{8}/g)).map((b) => parseInt(b, 2));
  } else if (format === 'dec') {
    tokens = text.split(/[\s,;]+/).filter(Boolean).map((t, i) => {
      if (!/^\d+$/.test(t)) throw new InputError(`„${t}“ (Byte ${i + 1}) ist keine ganze Zahl.`);
      const n = Number(t);
      if (n > 255) throw new InputError(`${n} (Byte ${i + 1}) ist kein Byte – erlaubt sind 0 bis 255.`);
      return n;
    });
  } else throw new InputError(`Unbekanntes Format „${format}“.`);
  if (tokens.length > MAX_BYTES) throw new InputError(`Zu viele Bytes (höchstens ${MAX_BYTES}).`);
  return Uint8Array.from(tokens);
}

/**
 * Prüft eine Bytefolge streng nach UTF-8 (RFC 3629): keine Überlangen Formen,
 * keine Surrogates, nichts über U+10FFFF. Gibt den ersten Fehler mit Position zurück.
 */
export function validateUtf8(bytes) {
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    let need;
    let min;
    let cp;
    if (b < 0x80) {
      i += 1;
      continue;
    } else if (b >= 0xc2 && b <= 0xdf) {
      need = 1;
      cp = b & 0x1f;
      min = 0x80;
    } else if (b >= 0xe0 && b <= 0xef) {
      need = 2;
      cp = b & 0x0f;
      min = 0x800;
    } else if (b >= 0xf0 && b <= 0xf4) {
      need = 3;
      cp = b & 0x07;
      min = 0x10000;
    } else if (b >= 0x80 && b <= 0xbf) {
      return { ok: false, index: i, message: `Byte ${i + 1} (0x${hex(b)}) ist ein Folgebyte (10xxxxxx) ohne vorangehendes Startbyte.` };
    } else {
      return { ok: false, index: i, message: `Byte ${i + 1} (0x${hex(b)}) kommt in gültigem UTF-8 nie vor${b === 0xc0 || b === 0xc1 ? ' (wäre eine überlange Codierung)' : ''}.` };
    }
    for (let k = 1; k <= need; k++) {
      const next = bytes[i + k];
      if (next === undefined) return { ok: false, index: i, message: `Die Folge ab Byte ${i + 1} ist unvollständig: Es fehlen ${need - k + 1} Folgebyte(s).` };
      if ((next & 0xc0) !== 0x80) return { ok: false, index: i + k, message: `Byte ${i + k + 1} (0x${hex(next)}) müsste ein Folgebyte (10xxxxxx) sein.` };
      cp = (cp << 6) | (next & 0x3f);
    }
    if (cp < min) return { ok: false, index: i, message: `Überlange Codierung ab Byte ${i + 1}: U+${hex(cp, 4)} müsste kürzer codiert werden.` };
    if (cp >= 0xd800 && cp <= 0xdfff) return { ok: false, index: i, message: `Ab Byte ${i + 1} steht ein UTF-16-Surrogat (U+${hex(cp, 4)}) – in UTF-8 nicht erlaubt.` };
    if (cp > 0x10ffff) return { ok: false, index: i, message: `Ab Byte ${i + 1}: U+${hex(cp, 4)} liegt über U+10FFFF.` };
    i += need + 1;
  }
  return { ok: true };
}

export function decodeUtf8(bytes) {
  const check = validateUtf8(bytes);
  if (!check.ok) return { ok: false, ...check, lossy: new TextDecoder('utf-8').decode(bytes) };
  return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
}
