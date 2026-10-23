/**
 * Adressräume, Adressbereiche und Struct-Layout (Alignment/Padding).
 */
import { InputError } from './num.js';

const big = (x) => BigInt(x);

export function checkAddressBits(bits) {
  const n = Number(bits);
  if (!Number.isInteger(n) || n < 1 || n > 128) throw new InputError('Die Adressbreite muss zwischen 1 und 128 Bit liegen.');
  return n;
}

export function checkWordBytes(word) {
  const n = Number(word);
  if (!Number.isInteger(n) || n < 1 || n > 64) throw new InputError('Die Größe einer Speicherstelle muss zwischen 1 und 64 Byte liegen.');
  return n;
}

/** Adressraum: 2^bits Speicherstellen zu je `wordBytes` Byte. */
export function addressSpace(bits, wordBytes = 1) {
  const n = checkAddressBits(bits);
  const w = checkWordBytes(wordBytes);
  const locations = 1n << big(n);
  return { bits: n, wordBytes: w, locations, bytes: locations * big(w), maxAddress: locations - 1n };
}

/** ⌈log2(x)⌉ für BigInt x ≥ 1. */
export function ceilLog2(x) {
  if (x <= 1n) return 0;
  return (x - 1n).toString(2).length;
}

/** Benötigte Adressbits für eine Speichergröße in Byte. */
export function bitsNeeded(sizeBytes, wordBytes = 1) {
  const w = big(checkWordBytes(wordBytes));
  if (sizeBytes <= 0n) throw new InputError('Die Speichergröße muss größer als 0 sein.');
  const locations = (sizeBytes + w - 1n) / w;
  const bits = ceilLog2(locations);
  return { locations, bits, partial: sizeBytes % w !== 0n, exactPowerOfTwo: (locations & (locations - 1n)) === 0n, capacityWithBits: (1n << big(bits)) * w };
}

/** Liest eine Adresse oder Größe: dezimal, 0x…, auch mit Unterstrichen. */
export function parseAddress(input, label = 'Adresse') {
  const text = String(input ?? '').trim().replace(/[\s_']/g, '');
  if (!text) throw new InputError(`${label}: Bitte einen Wert eingeben.`);
  if (/^0x[0-9a-f]+$/i.test(text)) return BigInt(text);
  if (/^0b[01]+$/i.test(text)) return BigInt(text);
  if (/^\d+$/.test(text)) return BigInt(text);
  throw new InputError(`${label}: „${input}“ ist keine gültige Zahl (dezimal oder 0x… hexadezimal).`);
}

export function hexAddress(value, bits) {
  const digits = Math.ceil(checkAddressBits(bits) / 4);
  return `0x${value.toString(16).toUpperCase().padStart(digits, '0')}`;
}

/**
 * Teilt einen Bereich ab `start` in Blöcke der angegebenen Größen (in Byte bzw.
 * Speicherstellen) – z. B. für eine Speicherkarte (RAM, ROM, I/O).
 */
export function layoutRanges(start, sizes, bits) {
  const n = checkAddressBits(bits);
  const limit = 1n << big(n);
  if (start < 0n || start >= limit) throw new InputError(`Die Startadresse liegt außerhalb des ${n}-Bit-Adressraums.`);
  let cursor = start;
  return sizes.map(({ name, size }) => {
    if (size <= 0n) throw new InputError(`„${name}“: Die Größe muss größer als 0 sein.`);
    const first = cursor;
    const last = cursor + size - 1n;
    if (last >= limit) throw new InputError(`„${name}“ endet bei ${last}, das ist außerhalb des ${n}-Bit-Adressraums (höchste Adresse ${hexAddress(limit - 1n, n)}).`);
    cursor = last + 1n;
    return { name, size, first, last };
  });
}

/* ---------------------------------------------------------------- Struct-Layout */

/** Größen und Ausrichtungen gängiger C-Typen je Datenmodell (Annahmen, im UI ausgewiesen). */
export const ABIS = {
  lp64: {
    label: 'LP64 – 64-Bit Linux/macOS (x86-64, ARM64)',
    types: { char: [1, 1], bool: [1, 1], short: [2, 2], int: [4, 4], long: [8, 8], 'long long': [8, 8], float: [4, 4], double: [8, 8], pointer: [8, 8], int8_t: [1, 1], int16_t: [2, 2], int32_t: [4, 4], int64_t: [8, 8], uint8_t: [1, 1], uint16_t: [2, 2], uint32_t: [4, 4], uint64_t: [8, 8], size_t: [8, 8] }
  },
  llp64: {
    label: 'LLP64 – 64-Bit Windows (x64)',
    types: { char: [1, 1], bool: [1, 1], short: [2, 2], int: [4, 4], long: [4, 4], 'long long': [8, 8], float: [4, 4], double: [8, 8], pointer: [8, 8], int8_t: [1, 1], int16_t: [2, 2], int32_t: [4, 4], int64_t: [8, 8], uint8_t: [1, 1], uint16_t: [2, 2], uint32_t: [4, 4], uint64_t: [8, 8], size_t: [8, 8] }
  },
  ilp32: {
    label: 'ILP32 – 32-Bit x86 Linux (System V i386)',
    types: { char: [1, 1], bool: [1, 1], short: [2, 2], int: [4, 4], long: [4, 4], 'long long': [8, 4], float: [4, 4], double: [8, 4], pointer: [4, 4], int8_t: [1, 1], int16_t: [2, 2], int32_t: [4, 4], int64_t: [8, 4], uint8_t: [1, 1], uint16_t: [2, 2], uint32_t: [4, 4], uint64_t: [8, 4], size_t: [4, 4] }
  }
};

/**
 * Liest Felder, je Zeile: „typ name“, „typ name[anzahl]“, „typ* name“ oder
 * „name size=12 align=4“. Kommentare mit // und abschließende Semikolons sind erlaubt.
 */
export function parseFields(text, abi = 'lp64') {
  const model = ABIS[abi];
  if (!model) throw new InputError('Unbekanntes Datenmodell.');
  const fields = [];
  const lines = String(text ?? '').split('\n');
  if (lines.length > 200) throw new InputError('Höchstens 200 Felder.');
  lines.forEach((raw, index) => {
    const line = raw.replace(/\/\/.*$/, '').replace(/;\s*$/, '').trim();
    if (!line) return;
    const custom = /^([A-Za-z_]\w*)\s+size\s*=\s*(\d+)\s+align\s*=\s*(\d+)$/i.exec(line);
    if (custom) {
      const [, name, size, align] = custom;
      const a = Number(align);
      if (!a || a & (a - 1)) throw new InputError(`Zeile ${index + 1}: Die Ausrichtung muss eine Zweierpotenz sein.`);
      fields.push({ name, type: 'eigener Typ', size: Number(size), align: a, count: 1 });
      return;
    }
    const m = /^((?:unsigned\s+|signed\s+)?(?:long\s+long|[A-Za-z_]\w*))\s*(\*?)\s*([A-Za-z_]\w*)\s*(?:\[\s*(\d+)\s*\])?$/.exec(line);
    if (!m) throw new InputError(`Zeile ${index + 1}: „${raw.trim()}“ nicht verstanden. Beispiel: „int zahl“, „char name[16]“, „double* p“.`);
    const [, rawType, star, name, countText] = m;
    const baseType = rawType.replace(/^(unsigned|signed)\s+/, '').replace(/\s+/g, ' ');
    const typeKey = star ? 'pointer' : baseType;
    const spec = model.types[typeKey];
    if (!spec) throw new InputError(`Zeile ${index + 1}: Unbekannter Typ „${rawType}“. Bekannt: ${Object.keys(model.types).join(', ')} – oder „name size=… align=…“.`);
    const count = countText ? Number(countText) : 1;
    if (count < 1 || count > 1_000_000) throw new InputError(`Zeile ${index + 1}: Arraygröße 1 bis 1 000 000.`);
    fields.push({ name, type: `${rawType}${star}${countText ? `[${count}]` : ''}`, size: spec[0] * count, align: spec[1], count });
  });
  if (!fields.length) throw new InputError('Bitte mindestens ein Feld angeben.');
  return fields;
}

/** Berechnet Offsets, Padding und Gesamtgröße (C-Regeln; `pack` = maximale Ausrichtung wie #pragma pack(n)). */
export function structLayout(fields, { pack = 0 } = {}) {
  let offset = 0;
  let maxAlign = 1;
  const rows = fields.map((field) => {
    const align = pack ? Math.min(field.align, pack) : field.align;
    maxAlign = Math.max(maxAlign, align);
    const padding = (align - (offset % align)) % align;
    offset += padding;
    const row = { ...field, effectiveAlign: align, offset, padding };
    offset += field.size;
    return row;
  });
  const tail = (maxAlign - (offset % maxAlign)) % maxAlign;
  const size = offset + tail;
  const paddingTotal = rows.reduce((s, r) => s + r.padding, 0) + tail;
  return { rows, tailPadding: tail, size, align: maxAlign, paddingTotal, dataBytes: size - paddingTotal };
}

/** Vorschlag: Felder nach Ausrichtung absteigend sortieren (stabil) – minimiert Padding meist. */
export function optimizedOrder(fields, opts) {
  const sorted = fields.map((f, i) => ({ f, i })).sort((a, b) => b.f.align - a.f.align || a.i - b.i).map((x) => x.f);
  return structLayout(sorted, opts);
}
