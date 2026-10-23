import fs from 'node:fs';
import path from 'node:path';
import { extractPdfText } from './pdf-text.js';
import { refreshFileSearch } from './api-shared.js';

export const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.json',
  '.xml',
  '.js',
  '.mjs',
  '.ts',
  '.java',
  '.py',
  '.c',
  '.h',
  '.cpp',
  '.cs',
  '.sql',
  '.sh',
  '.css',
  '.yml',
  '.yaml'
]);

const MAX_TEXT_CHARS = 200_000;

function capText(text) {
  const cleaned = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .trim();
  if (cleaned.length <= MAX_TEXT_CHARS) return { text: cleaned, truncated: false };
  return { text: `${cleaned.slice(0, MAX_TEXT_CHARS)}…`, truncated: true };
}

/**
 * Liefert durchsuchbaren Text für eine Datei. PDFs werden lokal ausgelesen,
 * Textformate direkt übernommen; alles andere bleibt ohne Text.
 */
export function extractDocumentText(buffer, originalName, mime = '') {
  const ext = path.extname(String(originalName || '')).toLowerCase();
  if (mime === 'application/pdf' || ext === '.pdf') {
    return extractPdfText(buffer);
  }
  if (TEXT_EXTENSIONS.has(ext)) {
    if (buffer.length > 8 * 1024 * 1024) {
      return { text: '', chars: 0, truncated: false, pages: 0, encrypted: false, reason: 'Textdatei größer als 8 MB; nicht indiziert.' };
    }
    const raw = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const { text, truncated } = capText(raw);
    return {
      text,
      chars: text.length,
      truncated,
      pages: 0,
      encrypted: false,
      reason: text ? null : 'Die Datei enthält keinen Text.'
    };
  }
  return { text: '', chars: 0, truncated: false, pages: 0, encrypted: false, reason: 'Für dieses Format gibt es keine Textextraktion.' };
}

/**
 * Liest den Text einer gespeicherten Datei neu ein und aktualisiert den Suchindex.
 * @returns {{indexed: boolean, chars: number, reason: string|null, truncated?: boolean, pages?: number}}
 */
export function indexFileText(db, dirs, fileId) {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
  if (!file) return { indexed: false, chars: 0, reason: 'Datei wurde nicht gefunden.' };
  const target = path.resolve(dirs.filesDir, path.basename(file.stored_name));
  if (!target.startsWith(path.resolve(dirs.filesDir) + path.sep)) {
    return { indexed: false, chars: 0, reason: 'Ungültiger Dateipfad.' };
  }
  let buffer;
  try {
    buffer = fs.readFileSync(target);
  } catch {
    return { indexed: false, chars: 0, reason: 'Die Datei fehlt im Datenverzeichnis.' };
  }
  const result = extractDocumentText(buffer, file.original_name, file.mime);
  db.prepare('UPDATE files SET content_text = ? WHERE id = ?').run(result.text, file.id);
  refreshFileSearch(db, file.id);
  return {
    indexed: Boolean(result.text),
    chars: result.text.length,
    reason: result.reason,
    truncated: result.truncated,
    pages: result.pages
  };
}

/**
 * Indiziert PDFs/Textdateien nach, die noch keinen Text haben (z. B. nach dem
 * Import eines älteren Backups). Läuft beim Start einmalig und blockiert nicht.
 */
export function reindexMissingText(db, dirs, { limit = 100 } = {}) {
  const rows = db
    .prepare("SELECT id FROM files WHERE content_text = '' AND (mime = 'application/pdf' OR original_name LIKE '%.pdf') ORDER BY id LIMIT ?")
    .all(limit);
  let indexed = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const result = indexFileText(db, dirs, row.id);
      if (result.chars > 0) indexed += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  return { attempted: rows.length, indexed, failed };
}
