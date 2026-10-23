/**
 * Ganzzahlen fester Bitbreite: Darstellungen, Zweierkomplement, Arithmetik
 * mit Überlauferkennung, Bitoperationen und Shifts. Alles mit BigInt.
 */
import { InputError } from './num.js';

export const WIDTHS = [8, 16, 32, 64];

export function checkWidth(width) {
  const w = Number(width);
  if (!Number.isInteger(w) || w < 1 || w > 128) throw new InputError('Die Bitbreite muss zwischen 1 und 128 liegen.');
  return w;
}

export function ranges(width) {
  const w = BigInt(checkWidth(width));
  return {
    unsignedMin: 0n,
    unsignedMax: (1n << w) - 1n,
    signedMin: -(1n << (w - 1n)),
    signedMax: (1n << (w - 1n)) - 1n
  };
}

/**
 * Liest eine ganze Zahl: dezimal (mit Vorzeichen), 0x…, 0b…, 0o…;
 * Leerzeichen/Unterstriche zur Gruppierung sind erlaubt.
 */
export function parseInteger(input, label = 'Wert') {
  let text = String(input ?? '').trim().replace(/[\s_]/g, '');
  if (!text) throw new InputError(`${label}: Bitte eine ganze Zahl eingeben.`);
  let negative = false;
  if (text[0] === '-' || text[0] === '+') {
    negative = text[0] === '-';
    text = text.slice(1);
  }
  let value;
  const lower = text.toLowerCase();
  const patterns = [
    ['0x', /^[0-9a-f]+$/, 'hexadezimal (0–9, A–F)'],
    ['0b', /^[01]+$/, 'binär (nur 0 und 1)'],
    ['0o', /^[0-7]+$/, 'oktal (0–7)']
  ];
  const match = patterns.find(([prefix]) => lower.startsWith(prefix));
  if (match) {
    const digits = lower.slice(2);
    if (!match[1].test(digits)) throw new InputError(`${label}: „${input}“ ist nicht gültig ${match[2]}.`);
    value = BigInt(`${match[0]}${digits}`);
  } else {
    if (!/^\d+$/.test(text)) {
      throw new InputError(`${label}: „${String(input).trim()}“ ist keine ganze Zahl. Erlaubt: Dezimal (z. B. -42), 0x2A, 0b101010, 0o52.`);
    }
    value = BigInt(text);
  }
  if (value > 1n << 130n) throw new InputError(`${label}: Zahl ist zu groß.`);
  return negative ? -value : value;
}

/**
 * Bringt einen Wert in das Bitmuster der Breite w. Negative Werte werden als
 * Zweierkomplement gespeichert. Wirft, wenn der Wert weder vorzeichenlos noch
 * vorzeichenbehaftet in w Bit passt.
 */
export function toPattern(value, width, label = 'Wert') {
  const w = checkWidth(width);
  const r = ranges(w);
  if (value < r.signedMin || value > r.unsignedMax) {
    throw new InputError(`${label} ${value} passt nicht in ${w} Bit (erlaubt: ${r.signedMin} bis ${r.unsignedMax}).`);
  }
  return BigInt.asUintN(w, value);
}

export const asSigned = (pattern, width) => BigInt.asIntN(checkWidth(width), pattern);
export const asUnsigned = (pattern, width) => BigInt.asUintN(checkWidth(width), pattern);

export function bitString(pattern, width) {
  return pattern.toString(2).padStart(checkWidth(width), '0');
}

/** Gruppiert eine Bitfolge in Nibbles (4) und Bytes (8). */
export function groupBits(bits) {
  const out = [];
  for (let i = 0; i < bits.length; i += 4) out.push(bits.slice(i, i + 4));
  return out.reduce((acc, nibble, i) => acc + (i === 0 ? '' : i % 2 === 0 ? '  ' : ' ') + nibble, '');
}

export function hexString(pattern, width) {
  return pattern.toString(16).toUpperCase().padStart(Math.ceil(checkWidth(width) / 4), '0');
}

export function octString(pattern) {
  return pattern.toString(8);
}

/** Bytes in Speicherreihenfolge. */
export function toBytes(pattern, width, endian = 'big') {
  const count = Math.ceil(checkWidth(width) / 8);
  const bytes = [];
  for (let i = count - 1; i >= 0; i--) bytes.push(Number((pattern >> BigInt(i * 8)) & 0xffn));
  return endian === 'little' ? bytes.reverse() : bytes;
}

/** Alle Darstellungen eines Bitmusters. */
export function describe(pattern, width) {
  const w = checkWidth(width);
  const bits = bitString(pattern, w);
  const signed = asSigned(pattern, w);
  return {
    width: w,
    pattern,
    unsigned: pattern,
    signed,
    bits,
    grouped: groupBits(bits),
    hex: hexString(pattern, w),
    oct: octString(pattern),
    bytesBig: toBytes(pattern, w, 'big'),
    bytesLittle: toBytes(pattern, w, 'little'),
    setBits: [...bits].filter((b) => b === '1').length,
    signBit: bits[0] === '1',
    leadingZeros: bits.indexOf('1') === -1 ? w : bits.indexOf('1')
  };
}

export function toggleBit(pattern, width, index) {
  const w = checkWidth(width);
  if (!Number.isInteger(index) || index < 0 || index >= w) throw new InputError(`Bit ${index} gibt es bei ${w} Bit nicht.`);
  return pattern ^ (1n << BigInt(index));
}

/** Zweierkomplement eines (negativen) Werts mit Zwischenschritten. */
export function twosComplementSteps(value, width) {
  const w = checkWidth(width);
  const r = ranges(w);
  if (value < r.signedMin || value > r.signedMax) {
    throw new InputError(`${value} liegt außerhalb des vorzeichenbehafteten Bereichs von ${w} Bit (${r.signedMin} bis ${r.signedMax}).`);
  }
  if (value >= 0n) return { negative: false, result: bitString(value, w) };
  const magnitude = -value;
  if (magnitude === 1n << BigInt(w - 1)) {
    return {
      negative: true,
      special: true,
      magnitude: bitString(magnitude, w),
      result: bitString(BigInt.asUintN(w, value), w)
    };
  }
  const magBits = bitString(magnitude, w);
  const inverted = [...magBits].map((b) => (b === '1' ? '0' : '1')).join('');
  return {
    negative: true,
    magnitude: magBits,
    inverted,
    result: bitString(BigInt.asUintN(w, value), w)
  };
}

export const OPERATIONS = {
  add: { label: 'Addition (A + B)', binary: true },
  sub: { label: 'Subtraktion (A − B)', binary: true },
  mul: { label: 'Multiplikation (A × B)', binary: true },
  div: { label: 'Division mit Rest (A ÷ B)', binary: true },
  and: { label: 'AND (A & B)', binary: true },
  or: { label: 'OR (A | B)', binary: true },
  xor: { label: 'XOR (A ^ B)', binary: true },
  not: { label: 'NOT (~A)', binary: false },
  neg: { label: 'Negation (−A, Zweierkomplement)', binary: false },
  shl: { label: 'Linksshift (A << n)', binary: false, shift: true },
  shr: { label: 'Logischer Rechtsshift (A >>> n)', binary: false, shift: true },
  sar: { label: 'Arithmetischer Rechtsshift (A >> n)', binary: false, shift: true }
};

/**
 * Führt eine Operation in fester Bitbreite aus.
 * mode: 'unsigned' | 'signed' – nur für Division und Bewertung relevant;
 * Überlauf wird immer für beide Interpretationen gemeldet.
 */
export function compute(op, aValue, bValue, width, { mode = 'signed', shift = 1 } = {}) {
  const w = checkWidth(width);
  const W = BigInt(w);
  const mask = (1n << W) - 1n;
  const r = ranges(w);
  const info = OPERATIONS[op];
  if (!info) throw new InputError(`Unbekannte Operation „${op}“.`);
  const a = toPattern(aValue, w, 'A');
  const b = info.binary ? toPattern(bValue, w, 'B') : 0n;
  const aS = asSigned(a, w);
  const bS = asSigned(b, w);
  const out = { op, width: w, a, b, aSigned: aS, bSigned: bS, flags: {}, notes: [] };
  const finish = (pattern) => {
    out.result = pattern & mask;
    out.resultSigned = asSigned(out.result, w);
    return out;
  };

  switch (op) {
    case 'add': {
      const fullU = a + b;
      const fullS = aS + bS;
      // Überträge Bit für Bit (für die Darstellung)
      let carry = 0n;
      const carries = [];
      for (let i = 0n; i < W; i++) {
        const sum = ((a >> i) & 1n) + ((b >> i) & 1n) + carry;
        carry = sum >> 1n;
        carries.unshift(Number(carry));
      }
      out.carries = carries.join('');
      out.flags.carry = fullU > r.unsignedMax;
      out.flags.overflow = fullS > r.signedMax || fullS < r.signedMin;
      out.exactUnsigned = fullU;
      out.exactSigned = fullS;
      return finish(fullU);
    }
    case 'sub': {
      const fullU = a - b;
      const fullS = aS - bS;
      out.flags.borrow = a < b;
      out.flags.overflow = fullS > r.signedMax || fullS < r.signedMin;
      out.exactUnsigned = fullU;
      out.exactSigned = fullS;
      out.complementOfB = (~b + 1n) & mask;
      return finish(fullU);
    }
    case 'mul': {
      const fullU = a * b;
      const fullS = aS * bS;
      out.flags.carry = fullU > r.unsignedMax;
      out.flags.overflow = fullS > r.signedMax || fullS < r.signedMin;
      out.exactUnsigned = fullU;
      out.exactSigned = fullS;
      out.fullProduct = mode === 'signed' ? BigInt.asUintN(2 * w, fullS) : fullU;
      return finish(mode === 'signed' ? fullS : fullU);
    }
    case 'div': {
      if (b === 0n) throw new InputError('Division durch null ist nicht definiert.');
      if (mode === 'signed') {
        if (aS === r.signedMin && bS === -1n) {
          out.flags.overflow = true;
          out.notes.push(`${r.signedMin} ÷ (−1) = ${-r.signedMin} passt nicht in ${w} Bit (vorzeichenbehaftet) – Überlauf. In C ist das undefiniertes Verhalten, x86 löst eine Ausnahme aus.`);
          out.remainder = 0n;
          return finish(r.signedMin);
        }
        const q = aS / bS; // BigInt rundet Richtung null – wie C/Java
        out.remainder = aS - q * bS;
        out.notes.push('Vorzeichenbehaftete Division rundet Richtung null (wie C, Java, JavaScript-BigInt); der Rest hat das Vorzeichen von A.');
        out.flags.overflow = false;
        return finish(q);
      }
      out.remainder = a % b;
      out.flags.overflow = false;
      return finish(a / b);
    }
    case 'and':
      return finish(a & b);
    case 'or':
      return finish(a | b);
    case 'xor':
      return finish(a ^ b);
    case 'not':
      out.notes.push('NOT kehrt jedes Bit um. Vorzeichenbehaftet gilt: ~A = −A − 1.');
      return finish(~a);
    case 'neg': {
      out.flags.overflow = aS === r.signedMin;
      if (out.flags.overflow) out.notes.push(`−(${r.signedMin}) ist in ${w} Bit nicht darstellbar: Das Ergebnis ist wieder ${r.signedMin}.`);
      return finish(-a);
    }
    case 'shl':
    case 'shr':
    case 'sar': {
      const n = Number(shift);
      if (!Number.isInteger(n) || n < 0 || n > w) throw new InputError(`Die Verschiebung muss zwischen 0 und ${w} liegen.`);
      const N = BigInt(n);
      out.shift = n;
      if (op === 'shl') {
        out.shiftedOut = n ? bitString(a, w).slice(0, n) : '';
        const result = (a << N) & mask;
        out.flags.carry = n > 0 && ((a >> (W - N)) & 1n) === 1n;
        out.flags.overflow = n > 0 && aS * (1n << N) !== asSigned(result, w);
        out.notes.push(`Linksshift um n entspricht einer Multiplikation mit 2^${n}, solange keine gesetzten Bits (bzw. das Vorzeichen) herausgeschoben werden.`);
        return finish(result);
      }
      out.shiftedOut = n ? bitString(a, w).slice(w - n) : '';
      if (op === 'shr') {
        out.notes.push('Logischer Rechtsshift füllt links mit Nullen auf – passend für vorzeichenlose Zahlen (Java/JavaScript: >>>).');
        return finish(a >> N);
      }
      out.notes.push('Arithmetischer Rechtsshift füllt links mit dem Vorzeichenbit auf – entspricht einer Division durch 2^n, die bei negativen Zahlen Richtung −∞ rundet.');
      return finish(BigInt.asUintN(w, aS >> N));
    }
    default:
      throw new InputError(`Unbekannte Operation „${op}“.`);
  }
}
