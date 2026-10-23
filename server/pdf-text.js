/**
 * Minimaler PDF-Textextraktor ohne externe Abhängigkeit.
 *
 * Deckt das ab, was StudyForge braucht: Text aus normalen PDF-Dokumenten
 * (FlateDecode/unkomprimiert, Standard- und ToUnicode-Zeichenzuordnungen),
 * damit Dokumente durchsuchbar werden. Er ist bewusst kein vollständiger
 * PDF-Renderer:
 * - verschlüsselte PDFs werden nicht entschlüsselt (klarer Hinweis),
 * - gescannte Seiten ohne Textebene liefern keinen Text (kein OCR),
 * - Text in Formular-XObjekten und exotische Filter werden übersprungen,
 * - die Lesereihenfolge folgt dem Inhaltsstrom; mehrspaltige Layouts können
 *   dadurch gemischt ankommen.
 */
import zlib from 'node:zlib';

const WS = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIM = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

const MAX_STREAM_BYTES = 16 * 1024 * 1024;
const MAX_TEXT_CHARS = 200_000;

class Name {
  constructor(value) {
    this.value = value;
  }
}

function isWs(code) {
  return WS.has(code);
}

function isDelim(code) {
  return DELIM.has(code);
}

function isNumberStart(code) {
  return (code >= 0x30 && code <= 0x39) || code === 0x2b || code === 0x2d || code === 0x2e;
}

/** Alle indirekten Objekte einlesen (auch ohne nutzbaren xref-Baum). */
function scanObjects(str, buffer) {
  const objects = new Map();
  const re = /(\d+)[\x00\t\n\f\r ]+(\d+)[\x00\t\n\f\r ]+obj\b/g;
  let guard = 0;
  let match;
  while ((match = re.exec(str)) !== null && guard < 100_000) {
    guard += 1;
    const number = Number(match[1]);
    const start = match.index + match[0].length;
    const endObj = str.indexOf('endobj', start);
    if (endObj === -1) break;
    const streamAt = str.indexOf('stream', start);
    if (streamAt !== -1 && streamAt < endObj) {
      const dict = str.slice(start, streamAt);
      let dataStart = streamAt + 6;
      if (str[dataStart] === '\r') dataStart += 1;
      if (str[dataStart] === '\n') dataStart += 1;
      let dataEnd = -1;
      let endStream = -1;
      const lengthMatch = /\/Length[\x00\t\n\f\r ]+(\d+)(?![\x00\t\n\f\r ]+\d+[\x00\t\n\f\r ]+R)/.exec(dict);
      if (lengthMatch) {
        const candidate = dataStart + Number(lengthMatch[1]);
        if (candidate <= buffer.length && /^[\x00\t\n\f\r ]*endstream/.test(str.slice(candidate, candidate + 32))) {
          dataEnd = candidate;
        }
      }
      if (dataEnd === -1) {
        endStream = str.indexOf('endstream', dataStart);
        if (endStream === -1) break;
        dataEnd = endStream;
        while (dataEnd > dataStart && (str[dataEnd - 1] === '\n' || str[dataEnd - 1] === '\r')) dataEnd -= 1;
      } else {
        endStream = str.indexOf('endstream', dataEnd);
      }
      objects.set(number, { dict, data: buffer.subarray(dataStart, Math.min(dataEnd, buffer.length)) });
      re.lastIndex = endStream === -1 ? dataEnd : endStream + 9;
    } else {
      objects.set(number, { dict: str.slice(start, endObj), data: null });
      re.lastIndex = endObj + 6;
    }
  }
  return objects;
}

function streamFilters(dict) {
  const match = /\/Filter\s*(\[[^\]]*\]|\/[A-Za-z0-9]+)/.exec(dict);
  if (!match) return [];
  return [...match[1].matchAll(/\/([A-Za-z0-9]+)/g)].map((entry) => entry[1]);
}

function decodeStreamBytes(object) {
  if (!object?.data) return null;
  let data = object.data;
  for (const filter of streamFilters(object.dict)) {
    if (filter === 'FlateDecode' || filter === 'Fl') {
      try {
        data = zlib.inflateSync(data, { maxOutputLength: MAX_STREAM_BYTES });
      } catch {
        try {
          data = zlib.inflateRawSync(data, { maxOutputLength: MAX_STREAM_BYTES });
        } catch {
          return null;
        }
      }
    } else if (filter === 'ASCIIHexDecode' || filter === 'AHx') {
      const text = data.toString('latin1').replace(/>[\s\S]*$/, '').replace(/[^0-9A-Fa-f]/g, '');
      data = Buffer.from(text.length % 2 ? `${text}0` : text, 'hex');
    } else {
      // Nicht unterstützte Filter (z. B. JPXDecode): lieber kein Text als falscher Text.
      return null;
    }
  }
  return data;
}

/** Liest den Wert hinter /Key als Referenz, Namen oder Inline-Dictionary. */
function dictValue(dict, key) {
  const re = new RegExp(`/${key}(?![A-Za-z0-9])`);
  const match = re.exec(dict);
  if (!match) return null;
  let i = match.index + match[0].length;
  while (i < dict.length && isWs(dict.charCodeAt(i))) i += 1;
  if (dict.startsWith('<<', i)) {
    const end = sliceBalancedEnd(dict, i);
    if (end === -1) return null;
    return { dict: dict.slice(i, end) };
  }
  const rest = dict.slice(i, i + 80);
  const ref = /^(\d+)\s+(\d+)\s+R\b/.exec(rest);
  if (ref) return { ref: Number(ref[1]) };
  const name = /^\/([A-Za-z0-9.+#-]+)/.exec(rest);
  if (name) return { name: name[1] };
  return null;
}

/** Endindex (exklusiv) eines balancierten << ... >>-Blocks. */
function sliceBalancedEnd(text, start) {
  let depth = 0;
  let i = start;
  while (i < text.length) {
    if (text.startsWith('<<', i)) {
      depth += 1;
      i += 2;
      continue;
    }
    if (text.startsWith('>>', i)) {
      depth -= 1;
      i += 2;
      if (depth === 0) return i;
      continue;
    }
    i += 1;
  }
  return -1;
}

function hexToText(hex) {
  const clean = hex.length % 2 ? `${hex}0` : hex;
  if (clean.length === 2) return String.fromCharCode(parseInt(clean, 16));
  let out = '';
  for (let i = 0; i + 4 <= clean.length; i += 4) out += String.fromCharCode(parseInt(clean.slice(i, i + 4), 16));
  if (clean.length % 4 === 2) out += String.fromCharCode(parseInt(clean.slice(-2), 16));
  return out;
}

/** Parst eine ToUnicode-CMap (bfchar/bfrange/codespace). */
function parseCMap(text) {
  const map = new Map();
  let codeBytes = 0;
  for (const block of text.matchAll(/begincodespacerange([\s\S]*?)endcodespacerange/g)) {
    for (const entry of block[1].matchAll(/<([0-9A-Fa-f]+)>/g)) {
      codeBytes = Math.max(codeBytes, Math.ceil(entry[1].length / 2));
    }
  }
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const entry of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) {
      const key = entry[1].toUpperCase();
      map.set(key, hexToText(entry[2]));
      codeBytes = Math.max(codeBytes, Math.ceil(key.length / 2));
    }
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const body = block[1];
    const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<([0-9A-Fa-f]*)>|\[([\s\S]*?)\])/g;
    let entry;
    while ((entry = re.exec(body)) !== null) {
      const low = parseInt(entry[1], 16);
      const high = parseInt(entry[2], 16);
      if (!Number.isFinite(low) || !Number.isFinite(high) || high < low) continue;
      const width = Math.max(1, Math.ceil(entry[1].length / 2));
      codeBytes = Math.max(codeBytes, width);
      if (entry[4] !== undefined) {
        const base = entry[4] ? parseInt(entry[4], 16) : 0;
        for (let code = low; code <= high && code - low < 65536; code += 1) {
          const key = code.toString(16).toUpperCase().padStart(width * 2, '0');
          map.set(key, String.fromCharCode(base + (code - low)));
        }
      } else {
        const targets = [...(entry[5] || '').matchAll(/<([0-9A-Fa-f]*)>/g)].map((m) => m[1]);
        for (let index = 0; index < targets.length && low + index <= high; index += 1) {
          const key = (low + index).toString(16).toUpperCase().padStart(width * 2, '0');
          map.set(key, hexToText(targets[index]));
        }
      }
    }
  }
  if (!codeBytes) {
    for (const key of map.keys()) codeBytes = Math.max(codeBytes, Math.ceil(key.length / 2));
  }
  return { map, codeBytes: codeBytes || 1 };
}

function fontInfo(objects, fontObject) {
  if (!fontObject) return null;
  const subtype = /\/Subtype\s*\/Type0\b/.test(fontObject.dict);
  const toUnicode = dictValue(fontObject.dict, 'ToUnicode');
  if (!toUnicode?.ref) return { map: null, codeBytes: subtype ? 2 : 1 };
  const cmapObject = objects.get(toUnicode.ref);
  if (!cmapObject) return { map: null, codeBytes: subtype ? 2 : 1 };
  const bytes = decodeStreamBytes(cmapObject);
  if (!bytes) return { map: null, codeBytes: subtype ? 2 : 1 };
  const parsed = parseCMap(bytes.toString('latin1'));
  return { map: parsed.map, codeBytes: subtype ? Math.max(2, parsed.codeBytes) : parsed.codeBytes };
}

/** Schriften einer Seite: Name -> {map, codeBytes}. */
function pageFonts(objects, pageDict) {
  const fonts = new Map();
  const resources = dictValue(pageDict, 'Resources');
  let resourcesDict = null;
  if (resources?.dict) resourcesDict = resources.dict;
  else if (resources?.ref) resourcesDict = objects.get(resources.ref)?.dict ?? null;
  if (!resourcesDict) return fonts;
  const fontEntry = dictValue(resourcesDict, 'Font');
  let fontDict = null;
  if (fontEntry?.dict) fontDict = fontEntry.dict;
  else if (fontEntry?.ref) fontDict = objects.get(fontEntry.ref)?.dict ?? null;
  if (!fontDict) return fonts;
  for (const entry of fontDict.matchAll(/\/([A-Za-z0-9.+#-]+)\s+(\d+)\s+\d+\s+R/g)) {
    const info = fontInfo(objects, objects.get(Number(entry[2])));
    if (info) fonts.set(entry[1], info);
  }
  return fonts;
}

function decodeShowString(bytes, font) {
  if (!font || !font.map || font.map.size === 0) {
    // Ohne Zeichenzuordnung: Standardkodierung ist meist Latin-1/WinAnsi.
    if (font?.codeBytes === 2) return '';
    return bytes.toString('latin1').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  }
  const width = font.codeBytes || 1;
  let out = '';
  for (let i = 0; i + width <= bytes.length; i += width) {
    const key = bytes.subarray(i, i + width).toString('hex').toUpperCase();
    const value = font.map.get(key);
    if (value !== undefined) out += value;
    else if (width === 1) out += String.fromCharCode(bytes[i]);
  }
  return out;
}

function readLiteralString(text, start) {
  const bytes = [];
  let depth = 1;
  let i = start + 1;
  while (i < text.length && depth > 0) {
    const ch = text[i];
    if (ch === '\\') {
      const next = text[i + 1];
      if (next === undefined) {
        i += 1;
        continue;
      }
      if (next === 'n') bytes.push(0x0a);
      else if (next === 'r') bytes.push(0x0d);
      else if (next === 't') bytes.push(0x09);
      else if (next === 'b') bytes.push(0x08);
      else if (next === 'f') bytes.push(0x0c);
      else if (next === '(' || next === ')' || next === '\\') bytes.push(next.charCodeAt(0));
      else if (next === '\n') {
        /* Zeilenumbruch im String ignorieren */
      } else if (next === '\r') {
        if (text[i + 2] === '\n') i += 1;
      } else if (next >= '0' && next <= '7') {
        let oct = next;
        let extra = 0;
        while (extra < 2 && text[i + 2 + extra] >= '0' && text[i + 2 + extra] <= '7') {
          oct += text[i + 2 + extra];
          extra += 1;
        }
        bytes.push(parseInt(oct, 8) & 0xff);
        i += extra;
      } else bytes.push(next.charCodeAt(0) & 0xff);
      i += 2;
      continue;
    }
    if (ch === '(') {
      depth += 1;
      bytes.push(0x28);
      i += 1;
      continue;
    }
    if (ch === ')') {
      depth -= 1;
      if (depth === 0) {
        i += 1;
        break;
      }
      bytes.push(0x29);
      i += 1;
      continue;
    }
    const code = text.charCodeAt(i);
    bytes.push(code & 0xff);
    i += 1;
  }
  return { value: Buffer.from(bytes), next: i };
}

function readHexString(text, start) {
  const end = text.indexOf('>', start + 1);
  const stop = end === -1 ? text.length : end;
  const raw = text.slice(start + 1, stop).replace(/[^0-9A-Fa-f]/g, '');
  return { value: Buffer.from(raw.length % 2 ? `${raw}0` : raw, 'hex'), next: stop < text.length ? stop + 1 : stop };
}

function readName(text, start) {
  let i = start + 1;
  while (i < text.length && !isWs(text.charCodeAt(i)) && !isDelim(text.charCodeAt(i))) i += 1;
  return { value: new Name(text.slice(start + 1, i).replace(/#([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))), next: i };
}

/** Liest ein einfaches Objekt (Zahl, String, Name, Array) aus einem Inhaltsstrom. */
function readObject(text, start) {
  const code = text.charCodeAt(start);
  if (code === 0x28) return readLiteralString(text, start);
  if (code === 0x3c) {
    if (text[start + 1] === '<') {
      const end = sliceBalancedEnd(text, start);
      return { value: { dict: true }, next: end === -1 ? text.length : end };
    }
    return readHexString(text, start);
  }
  if (code === 0x2f) return readName(text, start);
  if (code === 0x5b) {
    const items = [];
    let i = start + 1;
    while (i < text.length) {
      while (i < text.length && isWs(text.charCodeAt(i))) i += 1;
      if (text[i] === ']') return { value: items, next: i + 1 };
      const item = readObject(text, i);
      if (!item) return { value: items, next: i + 1 };
      items.push(item.value);
      i = item.next;
    }
    return { value: items, next: i };
  }
  if (isNumberStart(code)) {
    const match = /^[+-]?(?:\d+\.?\d*|\.\d+)/.exec(text.slice(start, start + 40));
    if (match) return { value: Number(match[0]), next: start + match[0].length };
  }
  return null;
}

/** Textinhalt eines dekodierten Seiteninhaltsstroms. */
function contentText(bytes, fonts) {
  const text = bytes.toString('latin1');
  const pieces = [];
  let stack = [];
  let font = null;
  let pendingSpace = false;
  let lastY = null;
  let i = 0;

  const pushSpace = () => {
    if (pieces.length && !/\s$/.test(pieces[pieces.length - 1])) pieces.push(' ');
  };
  const newline = () => {
    if (pieces.length && !/\n$/.test(pieces[pieces.length - 1])) pieces.push('\n');
  };
  const show = (raw) => {
    if (!Buffer.isBuffer(raw)) return;
    const decoded = decodeShowString(raw, font);
    if (!decoded.trim()) {
      if (decoded) pendingSpace = true;
      return;
    }
    if (pendingSpace) {
      pushSpace();
      pendingSpace = false;
    }
    pieces.push(decoded);
  };

  while (i < text.length) {
    const code = text.charCodeAt(i);
    if (code === 0x25) {
      while (i < text.length && text[i] !== '\n' && text[i] !== '\r') i += 1;
      continue;
    }
    if (isWs(code)) {
      i += 1;
      continue;
    }
    if (code === 0x5d) {
      i += 1;
      continue;
    }
    if (isDelim(code) || isNumberStart(code)) {
      const parsed = readObject(text, i);
      if (parsed) {
        stack.push(parsed.value);
        i = parsed.next;
        continue;
      }
      i += 1;
      continue;
    }
    // Operator
    let j = i;
    while (j < text.length && !isWs(text.charCodeAt(j)) && !isDelim(text.charCodeAt(j))) j += 1;
    if (j === i) {
      i += 1;
      continue;
    }
    const operator = text.slice(i, j);
    i = j;
    if (operator === 'BI') {
      // Inline-Bild: Binärdaten bis EI überspringen, damit keine Zufallstexte entstehen.
      const end = text.indexOf('EI', i);
      i = end === -1 ? text.length : end + 2;
      stack = [];
      continue;
    }
    if (operator === 'Tf') {
      const name = stack[stack.length - 2];
      if (name instanceof Name) font = fonts.get(name.value) ?? null;
    } else if (operator === 'Tj') {
      show(stack[stack.length - 1]);
    } else if (operator === 'TJ') {
      const array = stack[stack.length - 1];
      if (Array.isArray(array)) {
        for (const item of array) {
          if (Buffer.isBuffer(item)) show(item);
          else if (typeof item === 'number' && item < -120) pendingSpace = true;
        }
      }
    } else if (operator === "'" || operator === '"') {
      newline();
      show(stack[stack.length - 1]);
    } else if (operator === 'T*') {
      newline();
    } else if (operator === 'Td' || operator === 'TD') {
      const ty = stack[stack.length - 1];
      const tx = stack[stack.length - 2];
      if (typeof ty === 'number' && Math.abs(ty) > 0.01) newline();
      else if (typeof tx === 'number' && tx > 0.5) pendingSpace = true;
    } else if (operator === 'Tm') {
      const values = stack[stack.length - 1];
      if (Array.isArray(values) && values.length === 6 && typeof values[5] === 'number') {
        if (lastY === null || Math.abs(values[5] - lastY) > 0.5) newline();
        else if (Math.abs(values[4]) > 0.5) pendingSpace = true;
        lastY = values[5];
      }
    }
    stack = [];
  }
  return pieces.join('');
}

function cleanText(raw, maxChars) {
  const text = raw
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u0080-\u009f\ufffd]/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

/**
 * Extrahiert durchsuchbaren Text aus einem PDF.
 * @param {Buffer} buffer
 * @param {{maxChars?: number, maxPages?: number}} options
 * @returns {{text: string, pages: number, chars: number, truncated: boolean, encrypted: boolean, reason: string|null}}
 */
export function extractPdfText(buffer, { maxChars = MAX_TEXT_CHARS, maxPages = 400 } = {}) {
  const empty = (reason, extra = {}) => ({
    text: '',
    pages: 0,
    chars: 0,
    truncated: false,
    encrypted: false,
    reason,
    ...extra
  });
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return empty('Die Datei ist zu klein für ein PDF.');
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') return empty('Das ist kein PDF (Kopfzeile %PDF- fehlt).');
  if (buffer.length > 64 * 1024 * 1024) return empty('Das PDF ist größer als 64 MB und wird nicht indiziert.');

  const str = buffer.toString('latin1');
  if (/\/Encrypt\b/.test(str)) {
    return empty('Das PDF ist verschlüsselt; der Text kann nicht gelesen werden.', { encrypted: true });
  }

  const objects = scanObjects(str, buffer);
  const pageNumbers = [...objects.entries()]
    .filter(([, object]) => /\/Type\s*\/Page(?![a-zA-Z])/.test(object.dict))
    .map(([number]) => number)
    .sort((a, b) => a - b)
    .slice(0, maxPages);

  if (!pageNumbers.length) return empty('Im PDF wurden keine Seiten gefunden.');

  const chunks = [];
  let used = 0;
  let truncated = false;
  for (const number of pageNumbers) {
    if (truncated) break;
    const page = objects.get(number);
    const contents = dictValue(page.dict, 'Contents');
    const refs = contents?.ref ? [contents.ref] : contents?.dict ? [] : [];
    if (!refs.length) {
      const arrayMatch = /\/Contents\s*\[([^\]]*)\]/.exec(page.dict);
      if (arrayMatch) {
        for (const entry of arrayMatch[1].matchAll(/(\d+)\s+\d+\s+R/g)) refs.push(Number(entry[1]));
      }
    }
    const fonts = pageFonts(objects, page.dict);
    let pageText = '';
    for (const ref of refs) {
      const decoded = decodeStreamBytes(objects.get(ref));
      if (!decoded) continue;
      pageText += contentText(decoded, fonts);
      if (pageText.length > maxChars) break;
    }
    if (pageText.trim()) {
      chunks.push(pageText);
      used += pageText.length;
      if (used >= maxChars) {
        truncated = true;
        break;
      }
    }
  }

  const text = cleanText(chunks.join('\n'), maxChars);
  if (!text) {
    return {
      text: '',
      pages: pageNumbers.length,
      chars: 0,
      truncated: false,
      encrypted: false,
      reason: 'Das PDF enthält keine Textebene (vermutlich gescannt). Ohne OCR ist keine Volltextsuche möglich.'
    };
  }
  return { text, pages: pageNumbers.length, chars: text.length, truncated, encrypted: false, reason: null };
}
