/**
 * JSON prüfen, formatieren und komprimieren – mit eigenem Parser (RFC 8259).
 * Vorteile gegenüber JSON.parse: genaue Fehlerposition (Zeile/Spalte) mit
 * deutscher Meldung, Zahlen und Escapes bleiben exakt erhalten (keine
 * Rundung großer Zahlen), doppelte Schlüssel werden erkannt.
 */
import { InputError } from './num.js';

export const JSON_MAX_CHARS = 2 * 1024 * 1024;
const MAX_DEPTH = 1000;

export class JsonSyntaxError extends Error {
  constructor(message, offset, text) {
    const { line, column } = lineColumn(text, offset);
    super(`${message} (Zeile ${line}, Spalte ${column})`);
    this.name = 'SyntaxError';
    this.reason = message;
    this.offset = offset;
    this.line = line;
    this.column = column;
  }
}

/** Zeile/Spalte (1-basiert) zu einem Zeichenindex; Spalte zählt Unicode-Codepoints. */
export function lineColumn(text, offset) {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < text.length; i += 1) {
    if (text[i] === '\n') {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, column: [...text.slice(lineStart, offset)].length + 1 };
}

const NUMBER_RE = /-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/y;
const WS = new Set([' ', '\t', '\n', '\r']);

function describe(ch) {
  if (ch === undefined) return 'das Ende der Eingabe';
  if (ch === '\n') return 'einen Zeilenumbruch';
  return `„${ch}“`;
}

/**
 * Parst JSON in einen Syntaxbaum:
 *  { type: 'object', entries: [{ key, rawKey, value }] } | { type: 'array', items }
 *  { type: 'string', raw, value } | { type: 'number', raw } | { type: 'literal', raw }
 * Zusätzlich: stats und warnings (z. B. doppelte Schlüssel).
 */
export function parseJson(text) {
  if (typeof text !== 'string') throw new InputError('Eingabe muss Text sein.');
  if (text.length > JSON_MAX_CHARS) throw new InputError(`Eingabe zu groß (höchstens ${JSON_MAX_CHARS.toLocaleString('de-DE')} Zeichen).`);
  let i = 0;
  const warnings = [];
  const stats = { objects: 0, arrays: 0, keys: 0, strings: 0, numbers: 0, literals: 0, maxDepth: 0 };
  const fail = (message, at = i) => {
    throw new JsonSyntaxError(message, at, text);
  };
  const skip = () => {
    while (i < text.length && WS.has(text[i])) i += 1;
    if (text[i] === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) fail('Kommentare sind in JSON nicht erlaubt');
  };

  const parseString = () => {
    const start = i;
    i += 1; // "
    let value = '';
    for (;;) {
      if (i >= text.length) fail('Zeichenkette wird nicht geschlossen – es fehlt ein "', start);
      const ch = text[i];
      if (ch === '"') {
        i += 1;
        break;
      }
      if (ch === '\\') {
        const esc = text[i + 1];
        const map = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        if (esc in map) {
          value += map[esc];
          i += 2;
        } else if (esc === 'u') {
          const hex = text.slice(i + 2, i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('Ungültige Unicode-Escape-Sequenz – nach \\u müssen 4 Hexziffern folgen');
          value += String.fromCharCode(parseInt(hex, 16));
          i += 6;
        } else {
          fail(`Ungültige Escape-Sequenz \\${esc ?? ''} – erlaubt sind \\" \\\\ \\/ \\b \\f \\n \\r \\t \\uXXXX`);
        }
        continue;
      }
      if (ch.charCodeAt(0) < 0x20) fail('Steuerzeichen (z. B. Zeilenumbruch oder Tabulator) müssen in Zeichenketten escapt werden (\\n, \\t)');
      value += ch;
      i += 1;
    }
    stats.strings += 1;
    return { type: 'string', raw: text.slice(start, i), value };
  };

  const parseNumber = () => {
    const start = i;
    NUMBER_RE.lastIndex = i;
    const m = NUMBER_RE.exec(text);
    if (!m || !m[0] || m[0] === '-') fail('Ungültige Zahl');
    const after = text[i + m[0].length];
    if (/^-?0[0-9]/.test(text.slice(i, i + 3))) fail('Führende Nullen sind bei Zahlen nicht erlaubt', start);
    if (after === '.' || after === 'e' || after === 'E') fail('Ungültige Zahl (nach Punkt bzw. Exponent fehlen Ziffern)', start);
    i += m[0].length;
    stats.numbers += 1;
    const raw = m[0];
    if (!/[.eE]/.test(raw) && Math.abs(Number(raw)) > Number.MAX_SAFE_INTEGER) {
      warnings.push(`Die Zahl ${raw.length > 30 ? `${raw.slice(0, 30)}…` : raw} ist größer als 2^53 − 1. JavaScript (JSON.parse) würde sie ungenau einlesen; hier bleibt sie unverändert.`);
    }
    return { type: 'number', raw };
  };

  const parseValue = (depth) => {
    if (depth > MAX_DEPTH) fail(`Zu tief verschachtelt (mehr als ${MAX_DEPTH} Ebenen)`);
    stats.maxDepth = Math.max(stats.maxDepth, depth);
    skip();
    const ch = text[i];
    if (ch === '{') return parseObject(depth);
    if (ch === '[') return parseArray(depth);
    if (ch === '"') return parseString();
    if (ch === "'") fail('Zeichenketten müssen in doppelten Anführungszeichen (") stehen, nicht in einfachen');
    if (ch === '-' || (ch >= '0' && ch <= '9')) return parseNumber();
    for (const lit of ['true', 'false', 'null']) {
      if (text.startsWith(lit, i)) {
        i += lit.length;
        stats.literals += 1;
        return { type: 'literal', raw: lit };
      }
    }
    const word = /^[A-Za-z_]+/.exec(text.slice(i, i + 20))?.[0];
    if (word && ['True', 'False', 'None', 'NULL', 'Null', 'undefined', 'NaN', 'Infinity', 'TRUE', 'FALSE'].includes(word)) {
      fail(`„${word}“ ist kein JSON-Wert – erlaubt sind true, false und null (kleingeschrieben); NaN/Infinity gibt es nicht`);
    }
    if (ch === undefined) fail('Unerwartetes Ende – hier fehlt ein Wert');
    fail(`Unerwartetes Zeichen ${describe(ch)} – erwartet wird ein Wert (Objekt, Array, Zeichenkette, Zahl, true, false oder null)`);
    return null;
  };

  const parseObject = (depth) => {
    const open = i;
    i += 1;
    stats.objects += 1;
    const entries = [];
    const seen = new Set();
    skip();
    if (text[i] === '}') {
      i += 1;
      return { type: 'object', entries };
    }
    for (;;) {
      skip();
      if (text[i] === '}') fail('Nach dem letzten Eintrag darf kein Komma stehen');
      if (text[i] !== '"') {
        if (text[i] === undefined) fail(`Objekt (geöffnet bei Zeile ${lineColumn(text, open).line}) wird nicht geschlossen – es fehlt }`);
        if (text[i] === "'") fail('Schlüssel müssen in doppelten Anführungszeichen (") stehen, nicht in einfachen');
        fail(`Erwartet wird ein Schlüssel in doppelten Anführungszeichen, gefunden ${describe(text[i])}`);
      }
      const keyNode = parseString();
      stats.strings -= 1;
      stats.keys += 1;
      if (seen.has(keyNode.value)) warnings.push(`Doppelter Schlüssel „${keyNode.value.slice(0, 40)}“ – JSON.parse übernimmt nur den letzten Wert.`);
      seen.add(keyNode.value);
      skip();
      if (text[i] !== ':') fail(`Nach dem Schlüssel fehlt ein Doppelpunkt, gefunden ${describe(text[i])}`);
      i += 1;
      const value = parseValue(depth + 1);
      entries.push({ key: keyNode.value, rawKey: keyNode.raw, value });
      skip();
      if (text[i] === ',') {
        i += 1;
        continue;
      }
      if (text[i] === '}') {
        i += 1;
        return { type: 'object', entries };
      }
      if (text[i] === undefined) fail(`Objekt (geöffnet bei Zeile ${lineColumn(text, open).line}) wird nicht geschlossen – es fehlt }`);
      fail(`Erwartet wird „,“ oder „}“, gefunden ${describe(text[i])}`);
    }
  };

  const parseArray = (depth) => {
    const open = i;
    i += 1;
    stats.arrays += 1;
    const items = [];
    skip();
    if (text[i] === ']') {
      i += 1;
      return { type: 'array', items };
    }
    for (;;) {
      skip();
      if (text[i] === ']') fail('Nach dem letzten Element darf kein Komma stehen');
      items.push(parseValue(depth + 1));
      skip();
      if (text[i] === ',') {
        i += 1;
        continue;
      }
      if (text[i] === ']') {
        i += 1;
        return { type: 'array', items };
      }
      if (text[i] === undefined) fail(`Array (geöffnet bei Zeile ${lineColumn(text, open).line}) wird nicht geschlossen – es fehlt ]`);
      fail(`Erwartet wird „,“ oder „]“, gefunden ${describe(text[i])}`);
    }
  };

  if (text.charCodeAt(0) === 0xfeff) fail('Die Eingabe beginnt mit einem Byte-Order-Mark (BOM) – in JSON nicht erlaubt', 0);
  skip();
  if (i >= text.length) fail('Die Eingabe ist leer');
  const root = parseValue(0);
  skip();
  if (i < text.length) fail(`Nach dem JSON-Wert folgt noch ${describe(text[i])} – erlaubt ist genau ein Wert`);
  return { root, warnings: [...new Set(warnings)], stats };
}

/**
 * Serialisiert den Syntaxbaum. indent: Zahl (Leerzeichen), '\t' oder 0 (kompakt).
 * sortKeys sortiert Schlüssel nach UTF-16-Codeeinheiten (wie Array.prototype.sort).
 */
export function stringifyJson(node, { indent = 2, sortKeys = false } = {}) {
  const unit = indent === '\t' ? '\t' : ' '.repeat(Number(indent) || 0);
  const pretty = unit.length > 0;
  const out = [];
  const write = (n, level) => {
    if (n.type === 'object') {
      if (!n.entries.length) return out.push('{}');
      let entries = n.entries;
      if (sortKeys) entries = [...entries].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      out.push('{');
      entries.forEach((e, idx) => {
        if (pretty) out.push('\n', unit.repeat(level + 1));
        out.push(e.rawKey, pretty ? ': ' : ':');
        write(e.value, level + 1);
        if (idx < entries.length - 1) out.push(',');
      });
      if (pretty) out.push('\n', unit.repeat(level));
      return out.push('}');
    }
    if (n.type === 'array') {
      if (!n.items.length) return out.push('[]');
      out.push('[');
      n.items.forEach((item, idx) => {
        if (pretty) out.push('\n', unit.repeat(level + 1));
        write(item, level + 1);
        if (idx < n.items.length - 1) out.push(',');
      });
      if (pretty) out.push('\n', unit.repeat(level));
      return out.push(']');
    }
    return out.push(n.raw);
  };
  write(node, 0);
  return out.join('');
}

/** Anzahl UTF-8-Bytes eines JS-Strings (einzelne Surrogates zählen wie U+FFFD: 3 Byte). */
export function utf8Length(text) {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

export function codePointLength(text) {
  let n = 0;
  for (const _ of text) n += 1;
  return n;
}

/** Alles in einem: prüfen und formatieren. mode: 'format' | 'minify' */
export function processJson(text, { mode = 'format', indent = 2, sortKeys = false } = {}) {
  const { root, warnings, stats } = parseJson(text);
  const output = stringifyJson(root, { indent: mode === 'minify' ? 0 : indent, sortKeys });
  return {
    output,
    warnings,
    stats,
    rootType: root.type === 'literal' ? root.raw : root.type,
    input: { chars: codePointLength(text), units: text.length, bytes: utf8Length(text) },
    result: { chars: codePointLength(output), bytes: utf8Length(output) }
  };
}
