/**
 * Zahlensysteme (Basis 2 bis 36) mit BigInt – ganze Zahlen ohne
 * Präzisionsverlust, Nachkommastellen exakt als Bruch.
 */
import { InputError, rat, gcd } from './num.js';

export const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const MAX_INPUT_DIGITS = 2000;
export const BASE_NAMES = { 2: 'Binär', 8: 'Oktal', 10: 'Dezimal', 16: 'Hexadezimal' };

export function checkBase(base) {
  const b = Number(base);
  if (!Number.isInteger(b) || b < 2 || b > 36) throw new InputError('Die Basis muss eine ganze Zahl von 2 bis 36 sein.');
  return b;
}

const PREFIXES = { '0b': 2, '0o': 8, '0x': 16 };

/**
 * Liest eine Zahl in Basis `base`. Erlaubt Vorzeichen, Leerzeichen/Unterstriche als
 * Gruppierung, „.“ oder „,“ als Trennzeichen für Nachkommastellen und passende
 * Präfixe (0b, 0o, 0x). Ergebnis: { negative, intDigits, fracDigits, value (Bruch) }.
 */
export function parseInBase(input, base) {
  base = checkBase(base);
  let text = String(input ?? '').trim().replace(/[\s_]/g, '');
  if (!text) throw new InputError('Bitte eine Zahl eingeben.');
  let negative = false;
  if (text[0] === '-' || text[0] === '+') {
    negative = text[0] === '-';
    text = text.slice(1);
  }
  const prefix = text.slice(0, 2).toLowerCase();
  if (PREFIXES[prefix]) {
    if (PREFIXES[prefix] !== base) {
      throw new InputError(`Das Präfix „${text.slice(0, 2)}“ passt nicht zur gewählten Basis ${base}.`);
    }
    text = text.slice(2);
  }
  const parts = text.split(/[.,]/);
  if (parts.length > 2) throw new InputError('Die Zahl enthält mehr als ein Komma bzw. einen Punkt.');
  const [intDigits, fracDigits = ''] = parts;
  if (!intDigits && !fracDigits) throw new InputError('Bitte eine Zahl eingeben.');
  if (intDigits.length + fracDigits.length > MAX_INPUT_DIGITS) throw new InputError(`Höchstens ${MAX_INPUT_DIGITS} Ziffern.`);

  const all = (intDigits + fracDigits).toUpperCase();
  for (let i = 0; i < all.length; i++) {
    const digit = DIGITS.indexOf(all[i]);
    if (digit < 0 || digit >= base) {
      const pos = i < intDigits.length ? i + 1 : i + 2;
      const allowed = base <= 10 ? `0–${base - 1}` : `0–9 und A–${DIGITS[base - 1]}`;
      throw new InputError(`Ungültige Ziffer „${all[i]}“ an Position ${pos}: In Basis ${base} sind nur ${allowed} erlaubt.`);
    }
  }
  const B = BigInt(base);
  let intValue = 0n;
  for (const ch of intDigits.toUpperCase()) intValue = intValue * B + BigInt(DIGITS.indexOf(ch));
  let fracNum = 0n;
  for (const ch of fracDigits.toUpperCase()) fracNum = fracNum * B + BigInt(DIGITS.indexOf(ch));
  const fracDen = B ** BigInt(fracDigits.length);
  let value = rat(intValue * fracDen + fracNum, fracDen);
  if (negative) value = rat(-value.n, value.d);
  return { negative, intDigits: intDigits.toUpperCase() || '0', fracDigits: fracDigits.toUpperCase(), intValue, value };
}

export function bigintToBase(value, base) {
  base = checkBase(base);
  return value < 0n ? `-${(-value).toString(base).toUpperCase()}` : value.toString(base).toUpperCase();
}

/**
 * Wandelt einen Bruch in Basis `base` mit höchstens `precision` Nachkommastellen.
 * Liefert auch, ob die Darstellung exakt ist bzw. periodisch wäre.
 */
export function ratToBase(value, base, precision = 20) {
  base = checkBase(base);
  if (!Number.isInteger(precision) || precision < 0 || precision > 200) throw new InputError('Genauigkeit: 0 bis 200 Nachkommastellen.');
  const negative = value.n < 0n;
  const n = negative ? -value.n : value.n;
  const intPart = n / value.d;
  let rem = n % value.d;
  const B = BigInt(base);
  let frac = '';
  const fracSteps = [];
  for (let i = 0; i < precision && rem !== 0n; i++) {
    const product = rem * B;
    const digit = product / value.d;
    fracSteps.push({ before: rat(rem, value.d), product: rat(product, value.d), digit: Number(digit) });
    frac += DIGITS[Number(digit)];
    rem = product % value.d;
  }
  const exact = rem === 0n;
  return {
    text: `${negative && (intPart || frac) ? '-' : ''}${intPart.toString(base).toUpperCase()}${frac ? `.${frac}` : ''}`,
    intPart,
    frac,
    exact,
    terminates: terminatesInBase(value, base),
    fracSteps
  };
}

/** Ein Bruch hat in Basis b eine endliche Darstellung, wenn der Nenner nur Primfaktoren von b enthält. */
export function terminatesInBase(value, base) {
  let d = value.d;
  let g = gcd(d, BigInt(base));
  while (g > 1n) {
    while (d % g === 0n) d /= g;
    g = gcd(d, BigInt(base));
  }
  return d === 1n;
}

/** Schritte „fortgesetzte Division“ für den ganzzahligen Teil (begrenzt). */
export function divisionSteps(intValue, base, limit = 64) {
  const B = BigInt(checkBase(base));
  const stepsOut = [];
  let x = intValue < 0n ? -intValue : intValue;
  if (x === 0n) return { steps: [{ dividend: 0n, quotient: 0n, remainder: 0n }], truncated: false };
  while (x > 0n && stepsOut.length < limit) {
    stepsOut.push({ dividend: x, quotient: x / B, remainder: x % B });
    x /= B;
  }
  return { steps: stepsOut, truncated: x > 0n };
}

/** Stellenwerte der Eingabe: Ziffer × Basis^Position (begrenzt auf `limit` Ziffern). */
export function positionalTerms(intDigits, fracDigits, base, limit = 24) {
  const terms = [];
  const total = intDigits.length + fracDigits.length;
  for (let i = 0; i < intDigits.length; i++) {
    terms.push({ digit: intDigits[i], value: DIGITS.indexOf(intDigits[i]), power: intDigits.length - 1 - i });
  }
  for (let i = 0; i < fracDigits.length; i++) {
    terms.push({ digit: fracDigits[i], value: DIGITS.indexOf(fracDigits[i]), power: -(i + 1) });
  }
  return { terms: terms.slice(0, limit), truncated: total > limit };
}

/** Komplette Umrechnung für die Oberfläche. */
export function convertBase(input, fromBase, toBase, precision = 20) {
  const parsed = parseInBase(input, fromBase);
  const result = ratToBase(parsed.value, toBase, precision);
  const others = [2, 8, 10, 16].map((b) => ({ base: b, ...ratToBase(parsed.value, b, precision) }));
  return { parsed, result, others };
}
