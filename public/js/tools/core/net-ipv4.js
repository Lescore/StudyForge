/**
 * IPv4-Grundfunktionen für die Netzwerk-Werkzeuge (Routing, Topologie, Header).
 * Adressen werden als vorzeichenlose 32-Bit-Zahl (0 … 2^32−1) behandelt.
 * Reine Logik ohne DOM.
 */
import { InputError } from './num.js';

/** Liest eine IPv4-Adresse in Punktschreibweise (genau vier Dezimal-Oktette). */
export function parseIPv4(text, label = 'IPv4-Adresse') {
  const raw = String(text ?? '').trim();
  if (!raw) throw new InputError(`${label}: Bitte eine IPv4-Adresse eingeben (z. B. 192.168.1.10).`);
  const parts = raw.split('.');
  if (parts.length !== 4) throw new InputError(`${label}: „${raw}“ ist keine IPv4-Adresse – es werden genau vier durch Punkte getrennte Zahlen erwartet.`);
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) throw new InputError(`${label}: „${part || '(leer)'}“ ist kein gültiges Oktett (0–255).`);
    if (part.length > 1 && part.startsWith('0')) throw new InputError(`${label}: Führende Nullen („${part}“) sind mehrdeutig (oktal?) – bitte ohne führende Null schreiben.`);
    const n = Number(part);
    if (n > 255) throw new InputError(`${label}: Oktett ${n} ist größer als 255.`);
    value = value * 256 + n;
  }
  return value;
}

export function isIPv4(text) {
  try {
    parseIPv4(text);
    return true;
  } catch {
    return false;
  }
}

export function formatIPv4(value) {
  const v = Number(value) >>> 0;
  return [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join('.');
}

/** Präfixlänge 0–32 als Zahl. */
export function parsePrefix(value, label = 'Präfixlänge', max = 32) {
  const raw = String(value ?? '').trim().replace(/^\//, '');
  if (!/^\d{1,3}$/.test(raw)) throw new InputError(`${label}: Bitte eine ganze Zahl zwischen 0 und ${max} eingeben.`);
  const p = Number(raw);
  if (p > max) throw new InputError(`${label}: ${p} ist zu groß (höchstens /${max}).`);
  return p;
}

/** Netzmaske als 32-Bit-Zahl. */
export function prefixMask(prefix) {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

export function networkOf(addr, prefix) {
  return (addr & prefixMask(prefix)) >>> 0;
}

export function inNetwork(addr, network, prefix) {
  return networkOf(addr, prefix) === networkOf(network, prefix);
}

/** „10.0.0.0/8“ → { addr, prefix }. Ohne „/“ wird `defaultPrefix` genommen (oder Fehler). */
export function parseCidr(text, { label = 'Netz', defaultPrefix = null } = {}) {
  const raw = String(text ?? '').trim();
  const [ip, prefixText, rest] = raw.split('/');
  if (rest !== undefined) throw new InputError(`${label}: „${raw}“ enthält mehr als einen Schrägstrich.`);
  const addr = parseIPv4(ip, label);
  if (prefixText === undefined) {
    if (defaultPrefix === null) throw new InputError(`${label}: Bitte mit Präfixlänge angeben, z. B. ${formatIPv4(addr)}/24.`);
    return { addr, prefix: defaultPrefix };
  }
  return { addr, prefix: parsePrefix(prefixText, `${label}: Präfixlänge`) };
}

export function maskText(prefix) {
  return formatIPv4(prefixMask(prefix));
}

/** Bitdarstellung mit Punkten zwischen den Oktetten. */
export function toBinary(addr) {
  return formatIPv4(addr)
    .split('.')
    .map((o) => Number(o).toString(2).padStart(8, '0'))
    .join('.');
}
