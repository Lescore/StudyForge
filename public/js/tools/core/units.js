/**
 * Datenmengen, Datenraten und Zeiteinheiten – SI (Basis 1000) und IEC (Basis 1024).
 *
 * Jede Einheit ist als exakter Faktor in Bit angegeben. Alle Umrechnungen
 * laufen über Bit, damit Bit/Byte und SI/IEC nie vermischt werden.
 */
import { rat, mul, div, cmp, InputError, parseDecimal, fmt, toSignificant, formatDecimalText } from './num.js';

const k = 1000n;
const Ki = 1024n;

function unit(id, label, bits, system, kind = 'size') {
  return { id, label, bits: rat(bits), system, kind };
}

/** Datenmengen. `system`: 'bit' | 'si' | 'iec' – für die Erklärung. */
export const SIZE_UNITS = [
  unit('bit', 'Bit', 1n, 'bit'),
  unit('kbit', 'Kilobit (kbit)', k, 'si'),
  unit('Mbit', 'Megabit (Mbit)', k ** 2n, 'si'),
  unit('Gbit', 'Gigabit (Gbit)', k ** 3n, 'si'),
  unit('Tbit', 'Terabit (Tbit)', k ** 4n, 'si'),
  unit('Kibit', 'Kibibit (Kibit)', Ki, 'iec'),
  unit('Mibit', 'Mebibit (Mibit)', Ki ** 2n, 'iec'),
  unit('Gibit', 'Gibibit (Gibit)', Ki ** 3n, 'iec'),
  unit('B', 'Byte (B)', 8n, 'bit'),
  unit('kB', 'Kilobyte (kB)', 8n * k, 'si'),
  unit('MB', 'Megabyte (MB)', 8n * k ** 2n, 'si'),
  unit('GB', 'Gigabyte (GB)', 8n * k ** 3n, 'si'),
  unit('TB', 'Terabyte (TB)', 8n * k ** 4n, 'si'),
  unit('PB', 'Petabyte (PB)', 8n * k ** 5n, 'si'),
  unit('EB', 'Exabyte (EB)', 8n * k ** 6n, 'si'),
  unit('KiB', 'Kibibyte (KiB)', 8n * Ki, 'iec'),
  unit('MiB', 'Mebibyte (MiB)', 8n * Ki ** 2n, 'iec'),
  unit('GiB', 'Gibibyte (GiB)', 8n * Ki ** 3n, 'iec'),
  unit('TiB', 'Tebibyte (TiB)', 8n * Ki ** 4n, 'iec'),
  unit('PiB', 'Pebibyte (PiB)', 8n * Ki ** 5n, 'iec'),
  unit('EiB', 'Exbibyte (EiB)', 8n * Ki ** 6n, 'iec')
];

/** Datenraten pro Sekunde. */
export const RATE_UNITS = [
  ['bit/s', 'bit'],
  ['kbit/s', 'kbit'],
  ['Mbit/s', 'Mbit'],
  ['Gbit/s', 'Gbit'],
  ['Tbit/s', 'Tbit'],
  ['Kibit/s', 'Kibit'],
  ['Mibit/s', 'Mibit'],
  ['Gibit/s', 'Gibit'],
  ['B/s', 'B'],
  ['kB/s', 'kB'],
  ['MB/s', 'MB'],
  ['GB/s', 'GB'],
  ['TB/s', 'TB'],
  ['KiB/s', 'KiB'],
  ['MiB/s', 'MiB'],
  ['GiB/s', 'GiB'],
  ['TiB/s', 'TiB']
].map(([id, sizeId]) => {
  const size = SIZE_UNITS.find((u) => u.id === sizeId);
  return { id, label: id, bits: size.bits, system: size.system, kind: 'rate', sizeId };
});

export const TIME_UNITS = [
  { id: 'ms', label: 'Millisekunden', seconds: rat(1n, 1000n) },
  { id: 's', label: 'Sekunden', seconds: rat(1n) },
  { id: 'min', label: 'Minuten', seconds: rat(60n) },
  { id: 'h', label: 'Stunden', seconds: rat(3600n) },
  { id: 'd', label: 'Tage', seconds: rat(86400n) }
];

export function sizeUnit(id) {
  const found = SIZE_UNITS.find((u) => u.id === id);
  if (!found) throw new InputError(`Unbekannte Einheit „${id}“.`);
  return found;
}
export function rateUnit(id) {
  const found = RATE_UNITS.find((u) => u.id === id);
  if (!found) throw new InputError(`Unbekannte Datenrate „${id}“.`);
  return found;
}
export function timeUnit(id) {
  const found = TIME_UNITS.find((u) => u.id === id);
  if (!found) throw new InputError(`Unbekannte Zeiteinheit „${id}“.`);
  return found;
}

/** Faktor einer Einheit als Text, z. B. „1 MiB = 1 048 576 Byte = 2^20 Byte“. */
export function unitDefinition(u) {
  const bytes = div(u.bits, rat(8n));
  const base = u.id.includes('bit') || u.id === 'bit' ? `${fmt(u.bits)} Bit` : `${fmt(bytes)} Byte`;
  const prefixes = { k: '10^3', M: '10^6', G: '10^9', T: '10^12', P: '10^15', E: '10^18', Ki: '2^10', Mi: '2^20', Gi: '2^30', Ti: '2^40', Pi: '2^50', Ei: '2^60' };
  const prefix = u.id.replace(/(bit|B)(\/s)?$/, '');
  const power = prefixes[prefix];
  const unitName = u.id.includes('bit') ? 'Bit' : 'Byte';
  return `1 ${u.id.replace('/s', '')} = ${base}${power ? ` = ${power} ${unitName}` : ''}`;
}

/** Rechnet einen Wert von einer Daten- (oder Raten-)Einheit in eine andere um – exakt. */
export function convert(value, fromUnit, toUnit) {
  if ((fromUnit.kind === 'rate') !== (toUnit.kind === 'rate')) {
    throw new InputError('Datenmenge und Datenrate lassen sich nicht direkt ineinander umrechnen.');
  }
  return div(mul(value, fromUnit.bits), toUnit.bits);
}

/**
 * Wandelt eine Eingabe in alle Einheiten derselben Art um.
 * Ergebnis: Liste mit exakten Werten und Rechenweg.
 */
export function convertAll(input, fromId) {
  const isRate = fromId.includes('/s');
  const from = isRate ? rateUnit(fromId) : sizeUnit(fromId);
  const value = parseDecimal(input, { label: 'Wert', allowNegative: false });
  const bits = mul(value, from.bits);
  const list = (isRate ? RATE_UNITS : SIZE_UNITS).map((u) => ({ unit: u, value: div(bits, u.bits) }));
  return { from, value, bits, list };
}

/** Passt eine Bitmenge in die „schönste“ Einheit eines Systems ein (Wert ≥ 1, möglichst groß). */
export function bestUnit(bits, system = 'si', { bytes = true, rate = false } = {}) {
  const pool = (rate ? RATE_UNITS : SIZE_UNITS).filter((u) => {
    const isByte = !u.id.includes('bit');
    if (isByte !== bytes) return false;
    return u.system === system || u.system === 'bit';
  });
  let best = pool[0];
  for (const u of pool) if (cmp(bits, u.bits) >= 0 && cmp(u.bits, best.bits) > 0) best = u;
  return { unit: best, value: div(bits, best.bits) };
}

export function formatSize(bits, system = 'si', opts = {}) {
  const { unit: u, value } = bestUnit(bits, system, opts);
  return `${fmt(value, { sig: opts.sig ?? 6 })} ${u.id}`;
}

/** Zerlegt Sekunden (Bruch) in Tage, Stunden, Minuten, Sekunden. */
export function formatDuration(seconds) {
  const { text } = toSignificant(seconds, 15);
  const total = Number(text);
  if (!Number.isFinite(total)) return 'unendlich';
  if (total < 1) {
    if (total === 0) return '0 s';
    if (total < 0.001) return `${formatDecimalText(toSignificant(mul(seconds, rat(1000000n)), 4).text)} µs`;
    return `${formatDecimalText(toSignificant(mul(seconds, rat(1000n)), 4).text)} ms`;
  }
  const parts = [];
  let rest = total;
  const years = Math.floor(rest / (365 * 86400));
  if (years >= 1) {
    parts.push(`${years.toLocaleString('de-DE')} J.`);
    rest -= years * 365 * 86400;
  }
  const days = Math.floor(rest / 86400);
  rest -= days * 86400;
  const hours = Math.floor(rest / 3600);
  rest -= hours * 3600;
  const minutes = Math.floor(rest / 60);
  rest -= minutes * 60;
  if (days) parts.push(`${days} d`);
  if (hours) parts.push(`${hours} h`);
  if (minutes) parts.push(`${minutes} min`);
  if (years < 1) {
    const secText = rest >= 10 || parts.length ? Math.round(rest * 10) / 10 : Math.round(rest * 1000) / 1000;
    if (secText || !parts.length) parts.push(`${String(secText).replace('.', ',')} s`);
  }
  return parts.join(' ');
}
