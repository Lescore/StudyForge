import path from 'node:path';
import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function nowISO() {
  return new Date().toISOString();
}

export function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

/**
 * Suchnormalisierung: Kleinschreibung, Akzente/Umlaute entfernen, ß -> ss.
 * Wird sowohl beim Speichern (search_blob) als auch bei der Suche verwendet,
 * damit "Grosse" auch "Grüße" findet.
 */
export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nur für Dateinamen: Akzente beibehalten, aber Sonderzeichen entfernen. */
export function sanitizeFilename(name, fallback = 'datei') {
  let base = String(name ?? '').replace(/\\/g, '/').split('/').pop() ?? '';
  base = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_').trim();
  base = base.replace(/^\.+/, '');
  base = base.replace(/\s+/g, ' ').trim();
  if (!base) base = fallback;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(base)) base = `_${base}`;
  if (base.length > 120) {
    const ext = path.extname(base).slice(0, 16);
    base = base.slice(0, 120 - ext.length) + ext;
  }
  return base;
}

export function safeExtension(filename) {
  const ext = path.extname(sanitizeFilename(filename, '')).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : '';
}

export function newStoredName(originalName) {
  return crypto.randomUUID() + safeExtension(originalName);
}

export function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function clampText(value, max, field, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new HttpError(400, `${field} darf nicht leer sein.`);
    return '';
  }
  if (typeof value !== 'string') throw new HttpError(400, `${field} muss Text sein.`);
  const trimmed = value.replace(/\r\n/g, '\n');
  if (required && trimmed.trim() === '') {
    throw new HttpError(400, `${field} darf nicht leer sein.`);
  }
  if (trimmed.length > max) {
    throw new HttpError(400, `${field} ist zu lang (max. ${max} Zeichen).`);
  }
  return trimmed;
}

export function toInt(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

export function parseJsonSafe(raw, fallback = null) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Entfernt HTML-Kommentare und Skript-Reste aus importierten Markdown-Daten nicht –
 *  Markdown wird im Frontend grundsätzlich escaped gerendert. Hier nur Größen prüfen. */
export function splitTags(input) {
  const list = Array.isArray(input) ? input : String(input ?? '').split(',');
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const tag = String(item ?? '').trim().replace(/^#/, '');
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    if (tag.length > 40) continue;
    seen.add(key);
    out.push(tag);
  }
  return out.slice(0, 30);
}

/** Parst [[Titel]]-Verweise aus Markdown. */
export function extractWikiLinks(content) {
  const titles = new Set();
  const re = /\[\[([^\[\]\n]{1,200})\]\]/g;
  let m;
  while ((m = re.exec(String(content ?? ''))) !== null) {
    const t = m[1].split('|')[0].trim();
    if (t) titles.add(t);
  }
  return [...titles];
}

export function isPlainDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function normalizeDate(value, field) {
  if (value === undefined || value === null || value === '') return null;
  if (!isPlainDate(value)) throw new HttpError(400, `${field} muss ein Datum im Format JJJJ-MM-TT sein.`);
  return value;
}

/**
 * Kurzer Textauszug um den ersten Treffer – für Suchergebnisse in Dokumenten.
 * Der Offset stammt aus dem normalisierten Text; bei ß/ss kann er minimal
 * abweichen, deshalb werden die Ränder zusätzlich an Wortgrenzen geschnitten.
 */
export function textSnippet(text, query, { radius = 90, max = 240 } = {}) {
  const source = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!source) return '';
  const words = normalize(query)
    .split(' ')
    .filter((word) => word.length > 1)
    .slice(0, 4);
  const plain = () => (source.length > max ? `${source.slice(0, max).trimEnd()}…` : source);
  if (!words.length) return plain();
  const folded = normalize(source);
  let at = -1;
  for (const word of words) {
    at = folded.indexOf(word);
    if (at !== -1) break;
  }
  if (at === -1) return plain();
  let start = Math.max(0, at - radius);
  let end = Math.min(source.length, at + Math.max(...words.map((word) => word.length)) + radius);
  if (start > 0) {
    const space = source.indexOf(' ', start);
    if (space !== -1 && space < at) start = space + 1;
  }
  if (end < source.length) {
    const space = source.lastIndexOf(' ', end);
    if (space > at) end = space;
  }
  return `${start > 0 ? '… ' : ''}${source.slice(start, end).trim()}${end < source.length ? ' …' : ''}`;
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function isoFileStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}
