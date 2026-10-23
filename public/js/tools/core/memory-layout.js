/**
 * Simulierter Speicher (Uint8Array) mit Hexdump, Bytefolgen und typisierten
 * Werten in Little/Big Endian. Verändert ausschließlich das übergebene Array.
 *
 * Reine Logik ohne DOM.
 */
import { InputError } from './num.js';

export const SIZES = [64, 128, 256, 512, 1024, 2048, 4096];
export const MAX_SIZE = 4096;

export const TYPES = {
  u8: { label: 'uint8 (8 Bit, vorzeichenlos)', size: 1, kind: 'uint' },
  i8: { label: 'int8 (8 Bit, Zweierkomplement)', size: 1, kind: 'int' },
  u16: { label: 'uint16 (16 Bit, vorzeichenlos)', size: 2, kind: 'uint' },
  i16: { label: 'int16 (16 Bit, Zweierkomplement)', size: 2, kind: 'int' },
  u32: { label: 'uint32 (32 Bit, vorzeichenlos)', size: 4, kind: 'uint' },
  i32: { label: 'int32 (32 Bit, Zweierkomplement)', size: 4, kind: 'int' },
  u64: { label: 'uint64 (64 Bit, vorzeichenlos)', size: 8, kind: 'uint' },
  i64: { label: 'int64 (64 Bit, Zweierkomplement)', size: 8, kind: 'int' },
  f32: { label: 'float32 (IEEE 754, einfach)', size: 4, kind: 'float' },
  f64: { label: 'float64 (IEEE 754, doppelt)', size: 8, kind: 'float' }
};

export function createMemory(size) {
  const n = Number(size);
  if (!SIZES.includes(n)) throw new InputError(`Speichergröße muss eine von ${SIZES.join(', ')} Byte sein.`);
  return new Uint8Array(n);
}

/** Adresse dezimal oder hexadezimal (0x…). */
export function parseAddress(text, memSize, label = 'Adresse') {
  const t = String(text ?? '').trim();
  if (!t) throw new InputError(`${label}: Bitte eine Adresse eingeben.`);
  let v;
  if (/^0[xX][0-9a-fA-F]+$/.test(t)) v = parseInt(t.slice(2), 16);
  else if (/^[0-9]+$/.test(t)) v = parseInt(t, 10);
  else throw new InputError(`${label}: „${t}“ ist keine gültige Adresse (dezimal, z. B. 16, oder hexadezimal, z. B. 0x10).`);
  if (v >= memSize) throw new InputError(`${label} 0x${v.toString(16).toUpperCase()} (${v}) liegt außerhalb des Speichers (0x0 bis 0x${(memSize - 1).toString(16).toUpperCase()}).`);
  return v;
}

/**
 * Bytefolge lesen. Hex: „DE AD BE EF“, „0xDE,0xAD“ oder „DEADBEEF“.
 * Dezimal: „222 173 190 239“ (je 0–255).
 */
export function parseBytes(text, format = 'hex') {
  const t = String(text ?? '').trim();
  if (!t) throw new InputError('Bitte mindestens ein Byte eingeben.');
  const tokens = t.split(/[\s,;]+/).filter(Boolean);
  const bytes = [];
  for (const token of tokens) {
    if (format === 'hex') {
      const body = token.replace(/^0[xX]/, '');
      if (!/^[0-9a-fA-F]+$/.test(body)) throw new InputError(`„${token}“ ist kein gültiger Hex-Wert (erlaubt: 0–9, A–F).`);
      if (body.length > 2) {
        if (body.length % 2) throw new InputError(`„${token}“ hat eine ungerade Anzahl Hex-Ziffern – jedes Byte braucht genau zwei (z. B. 0A statt A).`);
        for (let i = 0; i < body.length; i += 2) bytes.push(parseInt(body.slice(i, i + 2), 16));
      } else bytes.push(parseInt(body, 16));
    } else {
      if (!/^[0-9]+$/.test(token)) throw new InputError(`„${token}“ ist keine ganze Dezimalzahl.`);
      const v = Number(token);
      if (v > 255) throw new InputError(`${token} passt nicht in ein Byte (0–255).`);
      bytes.push(v);
    }
    if (bytes.length > MAX_SIZE) throw new InputError(`Höchstens ${MAX_SIZE} Byte auf einmal.`);
  }
  return bytes;
}

function checkRange(mem, offset, length) {
  if (!Number.isInteger(offset) || offset < 0) throw new InputError('Ungültige Startadresse.');
  if (offset + length > mem.length) {
    const end = offset + length - 1;
    throw new InputError(`Bereich 0x${offset.toString(16).toUpperCase()}–0x${end.toString(16).toUpperCase()} (${length} Byte) reicht über das Speicherende (letzte Adresse 0x${(mem.length - 1).toString(16).toUpperCase()}). Es wurde nichts geschrieben bzw. gelesen.`);
  }
}

/** Schreibt Bytes ab offset – nur wenn alle hineinpassen. */
export function writeBytes(mem, offset, bytes) {
  checkRange(mem, offset, bytes.length);
  mem.set(bytes, offset);
  return { from: offset, to: offset + bytes.length - 1 };
}

const INT_LIMITS = (bits, signed) => (signed ? [-(1n << BigInt(bits - 1)), (1n << BigInt(bits - 1)) - 1n] : [0n, (1n << BigInt(bits)) - 1n]);

/** Wert eines Typs in Bytes umwandeln (ohne in den Speicher zu schreiben). */
export function encodeValue(type, text, littleEndian) {
  const spec = TYPES[type];
  if (!spec) throw new InputError(`Unbekannter Datentyp „${type}“.`);
  const t = String(text ?? '').trim().replace(/[\s_]/g, '');
  if (!t) throw new InputError('Bitte einen Wert eingeben.');
  const buf = new ArrayBuffer(spec.size);
  const view = new DataView(buf);
  if (spec.kind === 'float') {
    const lower = t.toLowerCase();
    let v;
    if (['nan'].includes(lower)) v = NaN;
    else if (['inf', 'infinity', '+inf', '+infinity'].includes(lower)) v = Infinity;
    else if (['-inf', '-infinity'].includes(lower)) v = -Infinity;
    else {
      const norm = t.replace(',', '.');
      if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(norm)) throw new InputError(`„${text}“ ist keine gültige Gleitkommazahl.`);
      v = Number(norm);
    }
    if (spec.size === 4) view.setFloat32(0, v, littleEndian);
    else view.setFloat64(0, v, littleEndian);
    const stored = spec.size === 4 ? view.getFloat32(0, littleEndian) : v;
    return { bytes: [...new Uint8Array(buf)], rounded: Number.isFinite(v) && stored !== v, stored, overflow: Number.isFinite(v) && !Number.isFinite(stored) };
  }
  let v;
  if (/^[+-]?0[xX][0-9a-fA-F]+$/.test(t)) {
    const neg = t.startsWith('-');
    v = BigInt(t.replace(/^[+-]/, ''));
    if (neg) v = -v;
  } else if (/^[+-]?[0-9]+$/.test(t)) v = BigInt(t);
  else throw new InputError(`„${text}“ ist keine ganze Zahl (dezimal oder 0x…).`);
  const bits = spec.size * 8;
  const [min, max] = INT_LIMITS(bits, spec.kind === 'int');
  if (v < min || v > max) throw new InputError(`${v} liegt außerhalb des Wertebereichs von ${type} (${min} bis ${max}).`);
  const u = v < 0n ? (1n << BigInt(bits)) + v : v;
  const bytes = [];
  for (let i = 0; i < spec.size; i += 1) bytes.push(Number((u >> BigInt(8 * i)) & 0xffn));
  if (!littleEndian) bytes.reverse();
  return { bytes, rounded: false, stored: v };
}

export function writeValue(mem, offset, type, text, littleEndian) {
  const enc = encodeValue(type, text, littleEndian);
  writeBytes(mem, offset, enc.bytes);
  return { ...enc, from: offset, to: offset + enc.bytes.length - 1 };
}

/** Liest einen Wert ab offset und liefert ihn als Text (exakt, ohne Number-Rundung bei 64 Bit). */
export function readValue(mem, offset, type, littleEndian) {
  const spec = TYPES[type];
  if (!spec) throw new InputError(`Unbekannter Datentyp „${type}“.`);
  checkRange(mem, offset, spec.size);
  const bytes = [...mem.slice(offset, offset + spec.size)];
  const view = new DataView(new Uint8Array(bytes).buffer);
  let value;
  if (spec.kind === 'float') {
    const f = spec.size === 4 ? view.getFloat32(0, littleEndian) : view.getFloat64(0, littleEndian);
    value = Number.isNaN(f) ? 'NaN' : f === Infinity ? '+∞' : f === -Infinity ? '−∞' : Object.is(f, -0) ? '-0' : String(f);
  } else {
    const ordered = littleEndian ? [...bytes].reverse() : bytes;
    let u = 0n;
    for (const b of ordered) u = (u << 8n) | BigInt(b);
    const bits = BigInt(spec.size * 8);
    if (spec.kind === 'int' && u >> (bits - 1n)) u -= 1n << bits;
    value = u.toString();
  }
  const ordered = littleEndian ? [...bytes].reverse() : bytes;
  return { value, bytes, from: offset, to: offset + spec.size - 1, hexValue: `0x${ordered.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join('')}` };
}

export const isPrintable = (b) => b >= 0x20 && b <= 0x7e;

/** Hexdump-Zeilen à 16 Byte. */
export function hexdump(mem, { from = 0, to = mem.length - 1 } = {}) {
  const lines = [];
  const start = from - (from % 16);
  for (let addr = start; addr <= to; addr += 16) {
    const bytes = [...mem.slice(addr, Math.min(addr + 16, mem.length))];
    lines.push({
      addr,
      addrHex: addr.toString(16).toUpperCase().padStart(mem.length > 0x1000 ? 5 : 4, '0'),
      bytes,
      ascii: bytes.map((b) => (isPrintable(b) ? String.fromCharCode(b) : '.')).join('')
    });
  }
  return lines;
}

/** Hexdump als reiner Text (wie `xxd`/`hexdump -C`). */
export function hexdumpText(mem, opts) {
  return hexdump(mem, opts)
    .map((l) => `${l.addrHex}  ${l.bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ').padEnd(47)}  |${l.ascii}|`)
    .join('\n');
}

/** Text als ASCII/UTF-8-Bytes (für das Beispiel „Zeichenkette ablegen“). */
export function textBytes(text) {
  return [...new TextEncoder().encode(String(text))];
}
