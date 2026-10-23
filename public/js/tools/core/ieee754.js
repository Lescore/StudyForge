/**
 * IEEE 754 binary32 / binary64: Zerlegung in Vorzeichen, Exponent und
 * Mantisse sowie der exakte Dezimalwert der gespeicherten Zahl.
 */
import { InputError, rat, sub, toDecimal, parseDecimal, cmp } from './num.js';

export const FORMATS = {
  32: { bits: 32, expBits: 8, fracBits: 23, bias: 127, label: 'binary32 (float)' },
  64: { bits: 64, expBits: 11, fracBits: 52, bias: 1023, label: 'binary64 (double)' }
};

function format(width) {
  const f = FORMATS[Number(width)];
  if (!f) throw new InputError('Unterstützt werden 32 und 64 Bit.');
  return f;
}

/** Bitmuster (BigInt) aus einer Dezimaleingabe – gerundet wie die Hardware (round to nearest, ties to even). */
export function patternFromNumberText(input, width) {
  const f = format(width);
  const text = String(input ?? '').trim();
  const lower = text.toLowerCase().replace(/\s/g, '');
  let value;
  if (['nan', '+nan', '-nan'].includes(lower)) value = NaN;
  else if (['inf', '+inf', 'infinity', '+infinity', '∞', '+∞'].includes(lower)) value = Infinity;
  else if (['-inf', '-infinity', '-∞'].includes(lower)) value = -Infinity;
  else {
    parseDecimal(text, { label: 'Zahl' }); // nur zur Validierung mit deutscher Meldung
    value = Number(text.replace(/[\s_]/g, '').replace(',', '.'));
  }
  const buffer = new DataView(new ArrayBuffer(8));
  if (f.bits === 32) {
    buffer.setFloat32(0, value);
    return { pattern: BigInt(buffer.getUint32(0)), source: value };
  }
  buffer.setFloat64(0, value);
  return { pattern: buffer.getBigUint64(0), source: value };
}

/** Bitmuster aus Hex (z. B. 3F800000) oder Binär (0b…/nur 0/1 mit passender Länge). */
export function patternFromBits(input, width) {
  const f = format(width);
  let text = String(input ?? '').trim().replace(/[\s_]/g, '');
  if (!text) throw new InputError('Bitte ein Bitmuster eingeben.');
  let pattern;
  if (/^0b[01]+$/i.test(text) || (/^[01]+$/.test(text) && text.length === f.bits)) {
    text = text.replace(/^0b/i, '');
    if (text.length > f.bits) throw new InputError(`Zu viele Bits (${text.length}) für ${f.bits} Bit.`);
    pattern = BigInt(`0b${text}`);
  } else {
    text = text.replace(/^0x/i, '');
    if (!/^[0-9a-fA-F]+$/.test(text)) throw new InputError('Bitmuster bitte als Hex (z. B. 3F800000) oder als Binärfolge eingeben.');
    if (text.length > f.bits / 4) throw new InputError(`Zu viele Hex-Ziffern (${text.length}) für ${f.bits} Bit – höchstens ${f.bits / 4}.`);
    pattern = BigInt(`0x${text}`);
  }
  return { pattern };
}

/** Exakter Wert einer endlichen Gleitkommazahl als Bruch. */
function exactValue(sign, exponentField, fraction, f) {
  const F = BigInt(f.fracBits);
  let mantissa;
  let exp;
  if (exponentField === 0n) {
    mantissa = fraction; // subnormal: 0,fraction × 2^(1−bias)
    exp = 1 - f.bias - f.fracBits;
  } else {
    mantissa = (1n << F) | fraction;
    exp = Number(exponentField) - f.bias - f.fracBits;
  }
  let value = exp >= 0 ? rat(mantissa << BigInt(exp)) : rat(mantissa, 1n << BigInt(-exp));
  if (sign) value = rat(-value.n, value.d);
  return value;
}

export function decode(pattern, width) {
  const f = format(width);
  const F = BigInt(f.fracBits);
  const E = BigInt(f.expBits);
  const sign = Number(pattern >> BigInt(f.bits - 1)) & 1;
  const exponentField = (pattern >> F) & ((1n << E) - 1n);
  const fraction = pattern & ((1n << F) - 1n);
  const maxExp = (1n << E) - 1n;
  const bits = pattern.toString(2).padStart(f.bits, '0');
  const out = {
    format: f,
    pattern,
    hex: pattern.toString(16).toUpperCase().padStart(f.bits / 4, '0'),
    bits,
    signBit: bits.slice(0, 1),
    exponentBits: bits.slice(1, 1 + f.expBits),
    fractionBits: bits.slice(1 + f.expBits),
    sign,
    exponentField: Number(exponentField),
    fraction
  };
  if (exponentField === maxExp) {
    out.kind = fraction === 0n ? 'infinity' : 'nan';
    out.number = fraction === 0n ? (sign ? -Infinity : Infinity) : NaN;
    if (out.kind === 'nan') out.quiet = ((fraction >> (F - 1n)) & 1n) === 1n;
    return out;
  }
  if (exponentField === 0n) out.kind = fraction === 0n ? 'zero' : 'subnormal';
  else out.kind = 'normal';
  out.unbiasedExponent = out.kind === 'normal' ? Number(exponentField) - f.bias : 1 - f.bias;
  out.exact = exactValue(sign, exponentField, fraction, f);
  const view = new DataView(new ArrayBuffer(8));
  if (f.bits === 32) {
    view.setUint32(0, Number(pattern));
    out.number = view.getFloat32(0);
  } else {
    view.setBigUint64(0, pattern);
    out.number = view.getFloat64(0);
  }
  return out;
}

/** Abstand zur Eingabe: wie stark hat das Speichern gerundet? */
export function roundingError(input, decoded) {
  if (!decoded.exact) return null;
  let wanted;
  try {
    wanted = parseDecimal(input, { label: 'Zahl' });
  } catch {
    return null;
  }
  const error = sub(decoded.exact, wanted);
  return { error, exact: cmp(error, rat(0n)) === 0 };
}

/** Exakter Dezimalwert als Text (binäre Brüche sind immer endlich darstellbar). */
export function exactDecimal(value) {
  // Nenner ist eine Zweierpotenz 2^k → genau k Nachkommastellen genügen.
  const k = value.d.toString(2).length - 1;
  return toDecimal(value, k).text;
}

export function limits(width) {
  const f = format(width);
  const maxNormal = decode(((1n << BigInt(f.expBits)) - 2n) << BigInt(f.fracBits) | ((1n << BigInt(f.fracBits)) - 1n), f.bits);
  const minNormal = decode(1n << BigInt(f.fracBits), f.bits);
  const minSub = decode(1n, f.bits);
  const one = decode(BigInt(f.bias) << BigInt(f.fracBits), f.bits);
  const epsilon = rat(1n, 1n << BigInt(f.fracBits));
  return { maxNormal, minNormal, minSub, one, epsilon, digits: f.bits === 32 ? '≈ 7,22' : '≈ 15,95' };
}
