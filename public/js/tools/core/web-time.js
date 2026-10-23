/**
 * Unix-Zeitstempel ↔ Datum mit Zeitzonen (Intl, IANA-Zonendatenbank des Browsers).
 * Unix-Zeit zählt Sekunden seit 1970-01-01T00:00:00Z und ignoriert Schaltsekunden
 * (jeder Tag hat genau 86 400 Sekunden).
 */
import { InputError } from './num.js';

export const MIN_MS = -62135596800000; // 0001-01-01T00:00:00Z
export const MAX_MS = Date.UTC(9999, 11, 31, 23, 59, 59, 999);
export const INT32_MAX = 2147483647;
export const UINT32_MAX = 4294967295;

const UNITS = {
  s: { label: 'Sekunden', num: 1000n, den: 1n },
  ms: { label: 'Millisekunden', num: 1n, den: 1n },
  us: { label: 'Mikrosekunden', num: 1n, den: 1000n },
  ns: { label: 'Nanosekunden', num: 1n, den: 1000000n }
};

/** Einheit anhand der Größenordnung raten (Beträge). */
export function detectUnit(absInt) {
  if (absInt < 100000000000n) return 's'; // < 1e11 s ≈ bis Jahr 5138
  if (absInt < 100000000000000n) return 'ms'; // < 1e14 ms ≈ bis Jahr 5138
  if (absInt < 100000000000000000n) return 'us';
  return 'ns';
}

/**
 * Zeitstempel-Text → Millisekunden. unit: 'auto' | 's' | 'ms' | 'us' | 'ns'.
 * Liefert { ms, unit, auto, subMs } (subMs: Anteil unter 1 ms wurde abgeschnitten).
 */
export function parseTimestamp(text, unit = 'auto') {
  const t = String(text).trim().replace(/[\s_']/g, '');
  const m = /^([+-]?)(\d{1,20})(?:[.,](\d{1,9}))?$/.exec(t);
  if (!m) throw new InputError('Bitte eine ganze Zahl (optional mit Nachkommastellen) eingeben, z. B. 1700000000.');
  const sign = m[1] === '-' ? -1n : 1n;
  const intPart = BigInt(m[2]);
  const frac = m[3] ?? '';
  const chosen = unit === 'auto' ? detectUnit(intPart) : unit;
  const u = UNITS[chosen];
  if (!u) throw new InputError('Unbekannte Einheit.');
  const scale = 10n ** BigInt(frac.length);
  const numerator = sign * (intPart * scale + BigInt(frac || '0')) * u.num;
  const denominator = scale * u.den;
  let ms = numerator / denominator;
  const rem = numerator % denominator;
  if (rem < 0n) ms -= 1n; // abrunden (Richtung −∞)
  if (ms < BigInt(MIN_MS) || ms > BigInt(MAX_MS)) {
    throw new InputError('Außerhalb des darstellbaren Bereichs (Jahr 1 bis 9999).');
  }
  return { ms: Number(ms), unit: chosen, unitLabel: u.label, auto: unit === 'auto', subMs: rem !== 0n };
}

export function assertTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    throw new InputError(`Unbekannte Zeitzone „${tz}“ (IANA-Name erwartet, z. B. Europe/Berlin).`);
  }
}

const partsCache = new Map();
function formatter(tz) {
  if (!partsCache.has(tz)) {
    partsCache.set(
      tz,
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        weekday: 'short',
        era: 'short'
      })
    );
  }
  return partsCache.get(tz);
}

/** Wanduhrzeit einer Zeitzone zu einem Zeitpunkt. */
export function zonedParts(ms, tz) {
  const parts = Object.fromEntries(formatter(tz).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  let year = Number(parts.year);
  if (parts.era === 'BC' || parts.era === 'B') year = 1 - year;
  const date = new Date(ms);
  return {
    year,
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    millisecond: ((date.getTime() % 1000) + 1000) % 1000,
    weekdayShort: parts.weekday
  };
}

/** Versatz der Zone zu UTC in Millisekunden (auf Sekunden genau). */
export function offsetMs(ms, tz) {
  const p = zonedParts(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const fixedUtc = new Date(asUtc);
  fixedUtc.setUTCFullYear(p.year); // Jahre < 100 korrekt behandeln
  return fixedUtc.getTime() - (ms - p.millisecond);
}

const pad = (n, w = 2) => String(Math.abs(n)).padStart(w, '0');

export function offsetText(off, { colon = true } = {}) {
  const sign = off < 0 ? '-' : '+';
  const total = Math.round(Math.abs(off) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${sign}${pad(h)}${colon ? ':' : ''}${pad(m)}${s ? `${colon ? ':' : ''}${pad(s)}` : ''}`;
}

const DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DAYS_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function weekdayIndex(y, m, d) {
  const date = new Date(Date.UTC(2000, m - 1, d));
  date.setUTCFullYear(y);
  return date.getUTCDay();
}

/** ISO-8601-Kalenderwoche (Woche mit dem ersten Donnerstag ist KW 1). */
export function isoWeek(y, m, d) {
  const utc = (yy, mm, dd) => {
    const x = new Date(Date.UTC(2000, mm - 1, dd));
    x.setUTCFullYear(yy, mm - 1, dd);
    return x;
  };
  const date = utc(y, m, d);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7) + 3); // Donnerstag dieser Woche
  const weekYear = date.getUTCFullYear();
  const first = utc(weekYear, 1, 4);
  first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7) + 3); // Donnerstag der KW 1
  return { week: 1 + Math.round((date - first) / (7 * 86400000)), year: weekYear };
}

export function dayOfYear(y, m, d) {
  const a = new Date(Date.UTC(2000, m - 1, d));
  a.setUTCFullYear(y);
  const b = new Date(Date.UTC(2000, 0, 1));
  b.setUTCFullYear(y);
  return Math.round((a - b) / 86400000) + 1;
}

/** Alle Darstellungen eines Zeitpunkts in einer Zeitzone. */
export function describeInstant(ms, tz) {
  assertTimeZone(tz);
  const p = zonedParts(ms, tz);
  const off = offsetMs(ms, tz);
  const frac = p.millisecond ? `.${pad(p.millisecond, 3)}` : '';
  const date = `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
  const time = `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
  const wd = weekdayIndex(p.year, p.month, p.day);
  const week = isoWeek(p.year, p.month, p.day);
  return {
    tz,
    parts: p,
    offset: off,
    offsetText: offsetText(off),
    iso: `${date}T${time}${frac}${offsetText(off)}`,
    rfc2822: `${DAYS_EN[wd]}, ${pad(p.day)} ${MONTHS_EN[p.month - 1]} ${pad(p.year, 4)} ${time} ${offsetText(off, { colon: false }).slice(0, 5)}`,
    weekday: DAYS_DE[wd],
    isoWeek: week,
    dayOfYear: dayOfYear(p.year, p.month, p.day),
    readable: new Intl.DateTimeFormat('de-DE', { timeZone: tz, dateStyle: 'full', timeStyle: 'long' }).format(new Date(ms))
  };
}

export function isoUtc(ms) {
  return new Date(ms).toISOString();
}

/** HTTP-Datum (IMF-fixdate, RFC 9110) – immer GMT. */
export function httpDate(ms) {
  return new Date(Math.floor(ms / 1000) * 1000).toUTCString();
}

/** Relative Zeit („vor 3 Tagen“) – Monate/Jahre gemittelt, daher gerundet. */
export function relativeTime(ms, now) {
  const diff = ms - now;
  const abs = Math.abs(diff);
  const units = [
    ['year', 365.2425 * 86400000],
    ['month', 30.436875 * 86400000],
    ['week', 7 * 86400000],
    ['day', 86400000],
    ['hour', 3600000],
    ['minute', 60000],
    ['second', 1000]
  ];
  const rtf = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (abs >= size || unit === 'second') return rtf.format(Math.round(diff / size), unit);
  }
  return '';
}

const ISO_RE = /^([+-]?\d{4,6})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?\s*(Z|z|[+-]\d{2}(?::?\d{2})?)?$/;

function daysInMonth(y, m) {
  const d = new Date(Date.UTC(2000, m, 0));
  d.setUTCFullYear(y, m, 0);
  return d.getUTCDate();
}

/** Prüft Felder einer Datumsangabe; wirft verständliche Fehler. */
export function validateFields(f) {
  if (f.year < 1 || f.year > 9999) throw new InputError('Jahr muss zwischen 1 und 9999 liegen.');
  if (f.month < 1 || f.month > 12) throw new InputError('Monat muss zwischen 01 und 12 liegen.');
  const dim = daysInMonth(f.year, f.month);
  if (f.day < 1 || f.day > dim) throw new InputError(`Tag ${f.day} gibt es im Monat ${pad(f.month)}/${f.year} nicht (höchstens ${dim}).`);
  if (f.hour > 23) throw new InputError('Stunde muss zwischen 00 und 23 liegen.');
  if (f.minute > 59) throw new InputError('Minute muss zwischen 00 und 59 liegen.');
  if (f.second === 60) throw new InputError('Sekunde 60 (Schaltsekunde) kann die Unix-Zeit nicht darstellen – Unix-Zeit kennt keine Schaltsekunden.');
  if (f.second > 59) throw new InputError('Sekunde muss zwischen 00 und 59 liegen.');
}

function utcFromFields(f) {
  const d = new Date(Date.UTC(2000, f.month - 1, f.day, f.hour, f.minute, f.second, f.millisecond));
  d.setUTCFullYear(f.year);
  return d.getTime();
}

/**
 * Wanduhrzeit in einer Zone → Zeitpunkt. Erkennt Lücken (Umstellung auf
 * Sommerzeit) und doppelte Zeiten (Rückstellung).
 * Rückgabe: { ms, status: 'ok' | 'gap' | 'ambiguous', alternatives }
 */
export function zonedToUtc(f, tz) {
  assertTimeZone(tz);
  validateFields(f);
  const guess = utcFromFields(f);
  const offsets = [...new Set([offsetMs(guess - 86400000, tz), offsetMs(guess, tz), offsetMs(guess + 86400000, tz)])];
  const matches = [];
  for (const off of offsets) {
    const t = guess - off;
    const p = zonedParts(t, tz);
    if (p.year === f.year && p.month === f.month && p.day === f.day && p.hour === f.hour && p.minute === f.minute && p.second === f.second) {
      if (!matches.includes(t)) matches.push(t);
    }
  }
  matches.sort((a, b) => a - b);
  if (matches.length === 1) return { ms: matches[0], status: 'ok', alternatives: [] };
  if (matches.length > 1) return { ms: matches[0], status: 'ambiguous', alternatives: matches };
  // Lücke: mit dem Versatz VOR der Umstellung rechnen (wie Temporal „compatible“)
  const before = offsetMs(guess - 86400000, tz);
  return { ms: guess - before, status: 'gap', alternatives: [] };
}

/**
 * ISO-8601-Text → Zeitpunkt. Ohne Versatzangabe gilt die Zeitzone `tz` (Annahme).
 * Rückgabe wie zonedToUtc plus { fields, hasOffset }.
 */
export function parseIsoDate(text, tz) {
  const m = ISO_RE.exec(String(text).trim());
  if (!m) throw new InputError('Erwartet wird ISO 8601, z. B. 2026-10-23, 2026-10-23T14:30, 2026-10-23T14:30:00Z oder 2026-10-23T14:30:00+02:00.');
  const f = {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4] ?? 0),
    minute: Number(m[5] ?? 0),
    second: Number(m[6] ?? 0),
    millisecond: m[7] ? Number(m[7].padEnd(3, '0').slice(0, 3)) : 0
  };
  validateFields(f);
  if (m[8]) {
    let off = 0;
    if (!/^z$/i.test(m[8])) {
      const om = /^([+-])(\d{2}):?(\d{2})?$/.exec(m[8]);
      const h = Number(om[2]);
      const min = Number(om[3] ?? 0);
      if (h > 23 || min > 59) throw new InputError('Ungültiger Versatz (Stunden 00–23, Minuten 00–59).');
      off = (om[1] === '-' ? -1 : 1) * (h * 3600000 + min * 60000);
    }
    return { ms: utcFromFields(f) - off, status: 'ok', alternatives: [], fields: f, hasOffset: true, offset: off };
  }
  return { ...zonedToUtc(f, tz), fields: f, hasOffset: false };
}

/** Sekunden (abgerundet) – passt in 32-Bit vorzeichenbehaftet? */
export function epochInfo(ms) {
  const seconds = Math.floor(ms / 1000);
  return {
    seconds,
    millis: ms,
    int32: seconds >= -2147483648 && seconds <= INT32_MAX,
    uint32: seconds >= 0 && seconds <= UINT32_MAX
  };
}
