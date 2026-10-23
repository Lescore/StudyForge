/**
 * Hashfunktionen über die Web Crypto API (crypto.subtle.digest) sowie
 * Hilfsfunktionen für Hex-Ausgabe und Hash-Vergleich.
 *
 * Reine Logik ohne DOM: `subtle` wird übergeben (Browser: globalThis.crypto.subtle,
 * Node: crypto.webcrypto.subtle).
 */
import { InputError } from './num.js';

export const MAX_FILE_BYTES = 512 * 1024 * 1024;

export const ALGORITHMS = {
  'SHA-256': { bits: 256, family: 'SHA-2', secure: true },
  'SHA-384': { bits: 384, family: 'SHA-2', secure: true },
  'SHA-512': { bits: 512, family: 'SHA-2', secure: true },
  'SHA-1': { bits: 160, family: 'SHA-1', secure: false }
};

/** Liefert die SubtleCrypto-Schnittstelle oder null (z. B. in unsicherem Kontext). */
export function getSubtle(scope = globalThis) {
  return scope?.crypto?.subtle ?? null;
}

export function toHex(data, { upper = false } = {}) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return upper ? s.toUpperCase() : s;
}

/** Hex in Gruppen (z. B. 8 Zeichen) zur besseren Lesbarkeit. */
export function groupHex(hex, size = 8) {
  const out = [];
  for (let i = 0; i < hex.length; i += size) out.push(hex.slice(i, i + size));
  return out.join(' ');
}

/** Normalisiert einen eingegebenen Hash: Leerraum und „:“ entfernen, Kleinbuchstaben. */
export function normalizeHash(text) {
  return String(text ?? '').replace(/[\s:]/g, '').toLowerCase();
}

/**
 * Vergleicht zwei Hashes (Groß-/Kleinschreibung und Leerzeichen egal).
 * Liefert Gleichheit, Hinweise und die erste abweichende Stelle.
 */
export function compareHashes(a, b) {
  const x = normalizeHash(a);
  const y = normalizeHash(b);
  if (!x || !y) throw new InputError('Bitte beide Hashwerte eingeben.');
  const notes = [];
  for (const [label, v] of [['Hash 1', x], ['Hash 2', y]]) {
    if (!/^[0-9a-f]+$/.test(v)) notes.push(`${label} enthält Zeichen, die keine Hex-Ziffern sind.`);
    else {
      const algo = guessAlgorithm(v);
      if (algo) notes.push(`${label}: ${v.length} Hex-Zeichen = ${v.length * 4} Bit (passt z. B. zu ${algo}).`);
    }
  }
  if (x.length !== y.length) notes.push(`Unterschiedliche Länge (${x.length} vs. ${y.length} Zeichen) – vermutlich verschiedene Verfahren.`);
  let firstDiff = -1;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    if (x[i] !== y[i]) {
      firstDiff = i;
      break;
    }
  }
  return { equal: x === y, a: x, b: y, firstDiff, notes };
}

export function guessAlgorithm(hex) {
  return { 32: 'MD5', 40: 'SHA-1', 64: 'SHA-256', 96: 'SHA-384', 128: 'SHA-512' }[hex.length] ?? null;
}

/** Hash über Bytes berechnen. */
export async function digest(subtle, algorithm, data) {
  if (!subtle) throw new InputError('Die Web Crypto API (crypto.subtle) ist in dieser Umgebung nicht verfügbar.');
  if (!ALGORITHMS[algorithm]) throw new InputError(`Nicht unterstütztes Verfahren „${algorithm}“.`);
  const buffer = await subtle.digest(algorithm, data);
  return toHex(buffer);
}

export async function digestText(subtle, algorithm, text) {
  return digest(subtle, algorithm, new TextEncoder().encode(String(text ?? '')));
}

export function checkFileSize(size) {
  if (size > MAX_FILE_BYTES) {
    throw new InputError(`Die Datei ist zu groß (${(size / 1024 / 1024).toFixed(1).replace('.', ',')} MiB). Höchstens 512 MiB, weil sie dafür komplett in den Arbeitsspeicher geladen wird.`);
  }
}
