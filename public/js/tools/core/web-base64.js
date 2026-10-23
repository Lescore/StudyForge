/**
 * Base64 (RFC 4648, Abschnitt 4) und Base64url (Abschnitt 5) – eigene
 * Implementierung auf Byte-Ebene, damit Text als UTF-8 korrekt behandelt wird
 * (btoa/atob arbeiten nur mit Latin-1) und Fehler genau gemeldet werden können.
 */
import { InputError } from './num.js';

const STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const URLSAFE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export const BASE64_MAX_BYTES = 10 * 1024 * 1024;

export function utf8Encode(text) {
  return new TextEncoder().encode(text);
}

/** UTF-8 dekodieren; ungültige Folgen → { ok: false }. */
export function utf8Decode(bytes) {
  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, text: new TextDecoder('utf-8').decode(bytes) };
  }
}

/** Bytes → Base64. urlSafe: Alphabet - und _; padding: „=“ anhängen. */
export function encodeBytes(bytes, { urlSafe = false, padding = true } = {}) {
  if (bytes.length > BASE64_MAX_BYTES) throw new InputError(`Höchstens ${BASE64_MAX_BYTES / 1024 / 1024} MiB.`);
  const abc = urlSafe ? URLSAFE : STD;
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += abc[(n >> 18) & 63] + abc[(n >> 12) & 63] + abc[(n >> 6) & 63] + abc[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += abc[(n >> 18) & 63] + abc[(n >> 12) & 63] + (padding ? '==' : '');
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += abc[(n >> 18) & 63] + abc[(n >> 12) & 63] + abc[(n >> 6) & 63] + (padding ? '=' : '');
  }
  return out;
}

export function encodeText(text, options) {
  return encodeBytes(utf8Encode(text), options);
}

/**
 * Base64/Base64url → Bytes. Leerraum (z. B. Zeilenumbrüche nach 76 Zeichen, MIME)
 * wird ignoriert. Beide Alphabete werden erkannt, Mischungen gemeldet.
 * Rückgabe: { bytes, variant, padded, warnings }
 */
export function decodeToBytes(input, { strictPadding = false } = {}) {
  const raw = String(input);
  if (raw.length > BASE64_MAX_BYTES * 2) throw new InputError('Eingabe zu groß.');
  const warnings = [];
  let clean = '';
  const positions = [];
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') continue;
    clean += ch;
    positions.push(i + 1);
  }
  if (!clean) throw new InputError('Keine Base64-Zeichen gefunden.');
  if (clean.length !== raw.trim().length && /\S\s+\S/.test(raw)) warnings.push('Leerraum/Zeilenumbrüche innerhalb der Eingabe wurden ignoriert.');
  const firstPad = clean.indexOf('=');
  const body = firstPad === -1 ? clean : clean.slice(0, firstPad);
  const pad = firstPad === -1 ? '' : clean.slice(firstPad);
  if (!/^=*$/.test(pad)) {
    const bad = firstPad + pad.search(/[^=]/);
    throw new InputError(`„=“ darf nur am Ende stehen (Füllzeichen) – danach folgt noch „${clean[bad]}“ an Position ${positions[bad]}.`);
  }
  if (pad.length > 2) throw new InputError('Zu viele Füllzeichen „=“ (höchstens zwei).');
  const hasStd = /[+/]/.test(body);
  const hasUrl = /[-_]/.test(body);
  if (hasStd && hasUrl) throw new InputError('Die Eingabe mischt das Standard-Alphabet (+ /) und das URL-Alphabet (- _).');
  const abc = hasUrl ? URLSAFE : STD;
  for (let i = 0; i < body.length; i += 1) {
    if (abc.indexOf(body[i]) === -1) {
      throw new InputError(`Ungültiges Zeichen „${body[i]}“ an Position ${positions[i]} – erlaubt sind A–Z, a–z, 0–9, ${hasUrl ? '- und _' : '+ und /'} sowie „=“ am Ende.`);
    }
  }
  const mod = body.length % 4;
  if (mod === 1) throw new InputError(`Ungültige Länge: ${body.length} Zeichen ohne Füllzeichen. Ein einzelnes Restzeichen kann kein ganzes Byte darstellen (Text abgeschnitten?).`);
  if (pad.length) {
    if (mod === 0 || pad.length !== 4 - mod) throw new InputError(`Falsche Anzahl Füllzeichen: Bei ${body.length} Zeichen sind ${mod === 0 ? 'keine' : 4 - mod} „=“ nötig, gefunden ${pad.length}.`);
  } else if (mod !== 0) {
    if (strictPadding) throw new InputError('Füllzeichen „=“ fehlen.');
    warnings.push(`Ohne Füllzeichen (Padding) – üblich bei Base64url; ergänzt wären es ${4 - mod} „=“.`);
  }
  const outLen = Math.floor((body.length * 6) / 8);
  const bytes = new Uint8Array(outLen);
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < body.length; i += 1) {
    acc = (acc << 6) | abc.indexOf(body[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[o++] = (acc >> bits) & 0xff;
      acc &= (1 << bits) - 1;
    }
  }
  if (bits && acc !== 0) warnings.push('Die letzten Füllbits sind nicht null (nicht kanonische Codierung) – die Daten wurden trotzdem dekodiert.');
  return { bytes, variant: hasUrl ? 'base64url' : 'base64', padded: Boolean(pad.length), warnings };
}

/** Länge der Base64-Ausgabe für n Bytes. */
export function encodedLength(n, padding = true) {
  return padding ? 4 * Math.ceil(n / 3) : Math.ceil((n * 4) / 3);
}

export function bytesToHex(bytes, max = 64) {
  const shown = Array.from(bytes.slice(0, max), (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  return bytes.length > max ? `${shown} …` : shown;
}

/** Grobe Dateityp-Erkennung über „magische Bytes“ (nur Hinweis!). */
export function sniffType(bytes) {
  const starts = (...sig) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x89, 0x50, 0x4e, 0x47)) return { mime: 'image/png', ext: 'png' };
  if (starts(0xff, 0xd8, 0xff)) return { mime: 'image/jpeg', ext: 'jpg' };
  if (starts(0x47, 0x49, 0x46, 0x38)) return { mime: 'image/gif', ext: 'gif' };
  if (starts(0x25, 0x50, 0x44, 0x46)) return { mime: 'application/pdf', ext: 'pdf' };
  if (starts(0x50, 0x4b, 0x03, 0x04)) return { mime: 'application/zip', ext: 'zip' };
  if (starts(0x1f, 0x8b)) return { mime: 'application/gzip', ext: 'gz' };
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45) return { mime: 'image/webp', ext: 'webp' };
  return null;
}
