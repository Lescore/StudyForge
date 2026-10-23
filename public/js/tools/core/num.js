/**
 * Exakte Arithmetik mit Brüchen aus BigInt.
 *
 * Datenmengen, Raten und Zeiten werden als Bruch {n, d} gerechnet, damit
 * z. B. 1 MiB = 1 048 576 Byte oder 0,1 + 0,2 ohne Gleitkommafehler bleiben.
 * Gerundet wird erst bei der Ausgabe – und die Ausgabe sagt, ob gerundet wurde.
 *
 * Reine Logik ohne DOM, damit sie unter Node getestet werden kann.
 */

export class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InputError';
  }
}

const abs = (x) => (x < 0n ? -x : x);

export function gcd(a, b) {
  a = abs(a);
  b = abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function rat(n, d = 1n) {
  n = BigInt(n);
  d = BigInt(d);
  if (d === 0n) throw new InputError('Division durch null.');
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}

export const ZERO = rat(0n);
export const ONE = rat(1n);

export const add = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a, b) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a, b) => rat(a.n * b.n, a.d * b.d);
export function div(a, b) {
  if (b.n === 0n) throw new InputError('Division durch null.');
  return rat(a.n * b.d, a.d * b.n);
}
export const cmp = (a, b) => {
  const diff = a.n * b.d - b.n * a.d;
  return diff < 0n ? -1 : diff > 0n ? 1 : 0;
};
export const isZero = (a) => a.n === 0n;
export const isNeg = (a) => a.n < 0n;
export const isInteger = (a) => a.d === 1n;
export const neg = (a) => rat(-a.n, a.d);
export const minRat = (...xs) => xs.reduce((m, x) => (cmp(x, m) < 0 ? x : m));
export const maxRat = (...xs) => xs.reduce((m, x) => (cmp(x, m) > 0 ? x : m));

export function pow10(k) {
  return 10n ** BigInt(k);
}

export function powRat(a, k) {
  if (!Number.isInteger(k) || k < 0) throw new InputError('Nur ganzzahlige, nicht negative Exponenten.');
  return rat(a.n ** BigInt(k), a.d ** BigInt(k));
}

/** Ganzzahlige Teile: floor und ceil für positive wie negative Brüche. */
export function floorRat(a) {
  const q = a.n / a.d;
  return a.n < 0n && q * a.d !== a.n ? q - 1n : q;
}
export function ceilRat(a) {
  const q = a.n / a.d;
  return a.n > 0n && q * a.d !== a.n ? q + 1n : q;
}

/**
 * Liest eine Dezimalzahl als exakten Bruch.
 * Erlaubt: Komma oder Punkt als Dezimaltrennzeichen, Leerzeichen und
 * Unterstriche als Zifferngruppierung, Exponent (1e9, 2,5E-3).
 * Nicht erlaubt: Tausenderpunkte (1.000.000 ist mehrdeutig).
 */
export function parseDecimal(input, { label = 'Wert', allowNegative = true, maxDigits = 400 } = {}) {
  const raw = String(input ?? '').trim();
  if (!raw) throw new InputError(`${label}: Bitte eine Zahl eingeben.`);
  const cleaned = raw.replace(/[\s_  ']/g, '').replace(',', '.');
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(cleaned);
  if (!match || (!match[2] && !match[3])) {
    if ((cleaned.match(/[.,]/g) ?? []).length > 1 || /\d,\d{3}\./.test(raw)) {
      throw new InputError(`${label}: „${raw}“ enthält mehrere Trennzeichen. Bitte ohne Tausenderpunkte eingeben (z. B. 1000000 oder 1 000 000).`);
    }
    throw new InputError(`${label}: „${raw}“ ist keine gültige Zahl.`);
  }
  const [, sign, intPart = '', fracPart = '', expPart] = match;
  if (intPart.length + fracPart.length > maxDigits) throw new InputError(`${label}: Zu viele Ziffern (höchstens ${maxDigits}).`);
  const exp = expPart ? Number(expPart) : 0;
  if (!Number.isSafeInteger(exp) || Math.abs(exp) > 400) throw new InputError(`${label}: Exponent zu groß (höchstens ±400).`);
  let n = BigInt((intPart || '0') + fracPart);
  let d = pow10(fracPart.length);
  if (exp > 0) n *= pow10(exp);
  else if (exp < 0) d *= pow10(-exp);
  if (sign === '-') n = -n;
  const value = rat(n, d);
  if (!allowNegative && value.n < 0n) throw new InputError(`${label}: Negative Werte sind hier nicht sinnvoll.`);
  return value;
}

/**
 * Wandelt einen Bruch in eine Dezimalzeichenkette mit höchstens `maxFrac`
 * Nachkommastellen (kaufmännisch gerundet). `exact` gibt an, ob die Ausgabe
 * den Wert ohne Rundung darstellt.
 */
export function toDecimal(a, maxFrac = 10) {
  const negative = a.n < 0n;
  const n = abs(a.n);
  const scale = pow10(maxFrac);
  let scaled = (n * scale) / a.d;
  const remainder = (n * scale) % a.d;
  const exact = remainder === 0n;
  if (remainder * 2n >= a.d) scaled += 1n;
  let intPart = (scaled / scale).toString();
  let frac = maxFrac ? (scaled % scale).toString().padStart(maxFrac, '0').replace(/0+$/, '') : '';
  const isZeroResult = scaled === 0n;
  const text = `${negative && !isZeroResult ? '-' : ''}${intPart}${frac ? `.${frac}` : ''}`;
  return { text, exact };
}

/** Ob ein Bruch eine endliche Dezimaldarstellung hat (Nenner nur mit Faktoren 2 und 5). */
export function hasFiniteDecimal(a) {
  let d = a.d;
  while (d % 2n === 0n) d /= 2n;
  while (d % 5n === 0n) d /= 5n;
  return d === 1n;
}

/**
 * Lesbare Dezimaldarstellung mit signifikanten Stellen: große und kleine
 * Werte werden nicht abgeschnitten, sondern bekommen genug Nachkommastellen.
 */
export function toSignificant(a, sig = 12) {
  if (a.n === 0n) return { text: '0', exact: true };
  const n = abs(a.n);
  const intDigits = (n / a.d).toString().length;
  let frac;
  if (n >= a.d) frac = Math.max(0, sig - intDigits);
  else {
    // Führende Nullen nach dem Komma zählen.
    let zeros = 0;
    let x = n * 10n;
    while (x < a.d && zeros < 400) {
      x *= 10n;
      zeros += 1;
    }
    frac = zeros + sig;
  }
  return toDecimal(a, Math.min(frac, 400));
}

/** Gruppiert Ziffern mit schmalem Leerzeichen und nutzt das deutsche Dezimalkomma. */
export function formatDecimalText(text, { group = true } = {}) {
  const negative = text.startsWith('-');
  const body = negative ? text.slice(1) : text;
  const [intPart, frac] = body.split('.');
  const grouped = group ? groupDigits(intPart) : intPart;
  return `${negative ? '−' : ''}${grouped}${frac ? `,${frac}` : ''}`;
}

export function groupDigits(digits, size = 3, sep = ' ') {
  if (digits.length <= 4) return digits;
  const out = [];
  for (let i = digits.length; i > 0; i -= size) out.unshift(digits.slice(Math.max(0, i - size), i));
  return out.join(sep);
}

/** Formatiert einen Bruch für die Anzeige; „≈“ wenn gerundet. */
export function fmt(a, { sig = 12, maxFrac, approxMark = true } = {}) {
  const { text, exact } = maxFrac !== undefined ? toDecimal(a, maxFrac) : toSignificant(a, sig);
  return `${!exact && approxMark ? '≈ ' : ''}${formatDecimalText(text)}`;
}

export function toNumber(a) {
  // Für Diagramme/Schätzungen; nie für exakte Ergebnisse verwenden.
  const sign = a.n < 0n ? -1 : 1;
  const n = abs(a.n);
  const shift = Math.max(0, Math.max(n.toString().length, a.d.toString().length) - 300);
  const scale = 10n ** BigInt(shift);
  return (sign * Number(n / scale)) / Number(a.d / scale || 1n);
}

export function fromInt(x) {
  return rat(BigInt(x));
}
