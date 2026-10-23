import fs from 'node:fs';
import path from 'node:path';
import {
  HttpError,
  clampText,
  newStoredName,
  normalize,
  nowISO,
  sanitizeFilename,
  sha256,
  textSnippet,
  toInt
} from './util.js';
import { refreshFileSearch, refreshNoteSearch, requireRow } from './api-shared.js';
import { TEXT_EXTENSIONS, indexFileText } from './file-text.js';

const MAX_UPLOAD = 64 * 1024 * 1024;

const MIME_BY_EXT = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.svg': 'image/svg+xml',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.ts': 'text/plain',
  '.java': 'text/plain',
  '.py': 'text/plain',
  '.c': 'text/plain',
  '.h': 'text/plain',
  '.cpp': 'text/plain',
  '.cs': 'text/plain',
  '.sql': 'text/plain',
  '.sh': 'text/plain',
  '.css': 'text/plain',
  '.yml': 'text/plain',
  '.yaml': 'text/plain',
  '.zip': 'application/zip',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

function mimeFor(originalName, provided) {
  const ext = path.extname(originalName).toLowerCase();
  const known = MIME_BY_EXT[ext];
  if (known) return known;
  if (provided && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(provided)) return provided;
  return 'application/octet-stream';
}

function dispositionType(file) {
  if (TEXT_EXTENSIONS.has(path.extname(file.original_name).toLowerCase())) return 'inline';
  if (['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.mime)) return 'inline';
  return 'attachment';
}

function contentDisposition(type, filename) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Entfernt den (potenziell langen) extrahierten Text aus API-Antworten. */
function fileRow(db, file, { query = '' } = {}) {
  const { content_text: contentText, search_blob: _searchBlob, ...rest } = file;
  const subject = file.subject_id ? db.prepare('SELECT name FROM subjects WHERE id = ?').get(file.subject_id) : null;
  const note = file.note_id ? db.prepare('SELECT title FROM notes WHERE id = ?').get(file.note_id) : null;
  return {
    ...rest,
    subject_name: subject?.name ?? null,
    note_title: note?.title ?? null,
    has_text: Boolean(contentText),
    text_chars: contentText ? contentText.length : 0,
    ...(query && contentText ? { snippet: textSnippet(contentText.slice(0, 50_000), query) } : {})
  };
}

export function registerFileRoutes(router) {
  router.add('GET', '/api/files', (ctx) => {
    const where = [];
    const params = [];
    const kind = ctx.query.get('kind');
    if (kind === 'document' || kind === 'attachment') {
      where.push('f.kind = ?');
      params.push(kind);
    }
    const subjectId = toInt(ctx.query.get('subject_id'));
    if (subjectId) {
      where.push('f.subject_id = ?');
      params.push(subjectId);
    }
    const noteId = toInt(ctx.query.get('note_id'));
    if (noteId) {
      where.push('f.note_id = ?');
      params.push(noteId);
    }
    const q = normalize(ctx.query.get('q') || '');
    if (q) {
      for (const word of q.split(' ').filter(Boolean).slice(0, 8)) {
        where.push('f.search_blob LIKE ?');
        params.push(`%${word}%`);
      }
    }
    const rows = ctx.db
      .prepare(
        `SELECT f.*, s.name AS subject_name, n.title AS note_title
         FROM files f LEFT JOIN subjects s ON s.id = f.subject_id LEFT JOIN notes n ON n.id = f.note_id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY f.created_at DESC LIMIT 1000`
      )
      .all(...params);
    ctx.json(200, rows.map((row) => fileRow(ctx.db, row, { query: q })));
  });

  router.add('GET', '/api/files/:id', (ctx) => {
    const file = requireRow(ctx.db, 'files', ctx.params.id, 'Datei');
    ctx.json(200, fileRow(ctx.db, file));
  });

  router.add('POST', '/api/files', async (ctx) => {
    const kind = ctx.query.get('kind') === 'attachment' ? 'attachment' : 'document';
    const filenameRaw = ctx.query.get('filename') || ctx.req.headers['x-filename'] || '';
    let decodedFilename = String(filenameRaw);
    try {
      decodedFilename = decodeURIComponent(decodedFilename);
    } catch {
      /* ungültige Prozentkodierung: Rohwert verwenden */
    }
    const originalName = sanitizeFilename(decodedFilename, '');
    if (!originalName) throw new HttpError(400, 'Bitte eine Datei mit Dateinamen auswählen.');
    const noteId = toInt(ctx.query.get('note_id'));
    if (noteId !== null) requireRow(ctx.db, 'notes', noteId, 'Notiz');
    const subjectId = toInt(ctx.query.get('subject_id'));
    if (subjectId !== null) requireRow(ctx.db, 'subjects', subjectId, 'Fach');
    if (kind === 'attachment' && !noteId) throw new HttpError(400, 'Anhänge müssen einer Notiz zugeordnet sein.');

    const contentLength = toInt(ctx.req.headers['content-length'], 0);
    if (contentLength > MAX_UPLOAD) throw new HttpError(413, 'Die Datei ist zu groß (max. 64 MB).');
    const buffer = await ctx.body(MAX_UPLOAD);
    if (!buffer.length) throw new HttpError(400, 'Die Datei ist leer.');
    if (buffer.length > MAX_UPLOAD) throw new HttpError(413, 'Die Datei ist zu groß (max. 64 MB).');

    const storedName = newStoredName(originalName);
    const mime = mimeFor(originalName, String(ctx.req.headers['content-type'] || '').split(';')[0]);
    const target = path.join(ctx.dirs.filesDir, storedName);
    fs.writeFileSync(target, buffer, { flag: 'wx' });
    const ts = nowISO();
    const title = kind === 'document' ? clampText(ctx.query.get('title') || originalName, 300, 'Titel') : '';
    const result = ctx.db
      .prepare(
        `INSERT INTO files (stored_name, original_name, mime, size, sha256, kind, title, description, topic, note_id, subject_id, created_at, search_blob)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '')`
      )
      .run(
        storedName,
        originalName,
        mime,
        buffer.length,
        sha256(buffer),
        kind,
        title,
        clampText(ctx.query.get('description'), 20000, 'Beschreibung'),
        clampText(ctx.query.get('topic'), 200, 'Thema'),
        noteId,
        subjectId,
        ts
      );
    const id = Number(result.lastInsertRowid);
    const indexing = indexFileText(ctx.db, ctx.dirs, id);
    if (noteId) refreshNoteSearch(ctx.db, noteId);
    const row = fileRow(ctx.db, ctx.db.prepare('SELECT * FROM files WHERE id = ?').get(id));
    ctx.json(201, { ...row, text_hint: indexing.reason });
  });

  router.add('PATCH', '/api/files/:id', async (ctx) => {
    const file = requireRow(ctx.db, 'files', ctx.params.id, 'Datei');
    const body = await ctx.jsonBody();
    let noteId = body.note_id !== undefined ? toInt(body.note_id) : file.note_id;
    if (noteId !== null) requireRow(ctx.db, 'notes', noteId, 'Notiz');
    let subjectId = body.subject_id !== undefined ? toInt(body.subject_id) : file.subject_id;
    if (subjectId !== null) requireRow(ctx.db, 'subjects', subjectId, 'Fach');
    ctx.db
      .prepare('UPDATE files SET title = ?, description = ?, topic = ?, note_id = ?, subject_id = ? WHERE id = ?')
      .run(
        body.title !== undefined ? clampText(body.title, 300, 'Titel') : file.title,
        body.description !== undefined ? clampText(body.description, 20000, 'Beschreibung') : file.description,
        body.topic !== undefined ? clampText(body.topic, 200, 'Thema') : file.topic,
        noteId,
        subjectId,
        file.id
      );
    refreshFileSearch(ctx.db, file.id);
    if (file.note_id) refreshNoteSearch(ctx.db, file.note_id);
    if (noteId && noteId !== file.note_id) refreshNoteSearch(ctx.db, noteId);
    ctx.json(200, fileRow(ctx.db, ctx.db.prepare('SELECT * FROM files WHERE id = ?').get(file.id)));
  });

  router.add('DELETE', '/api/files/:id', (ctx) => {
    const file = requireRow(ctx.db, 'files', ctx.params.id, 'Datei');
    const target = path.join(ctx.dirs.filesDir, path.basename(file.stored_name));
    if (!target.startsWith(ctx.dirs.filesDir + path.sep)) throw new HttpError(400, 'Ungültiger Dateipfad.');
    try {
      fs.unlinkSync(target);
    } catch {
      /* Datei bereits entfernt – Datensatz trotzdem löschen */
    }
    ctx.db.prepare('DELETE FROM files WHERE id = ?').run(file.id);
    if (file.note_id) refreshNoteSearch(ctx.db, file.note_id);
    ctx.json(200, { ok: true });
  });

  router.add('POST', '/api/files/:id/reindex', (ctx) => {
    const file = requireRow(ctx.db, 'files', ctx.params.id, 'Datei');
    const result = indexFileText(ctx.db, ctx.dirs, file.id);
    if (file.note_id) refreshNoteSearch(ctx.db, file.note_id);
    ctx.json(200, { ok: true, ...result, file: fileRow(ctx.db, ctx.db.prepare('SELECT * FROM files WHERE id = ?').get(file.id)) });
  });

  router.add('GET', '/api/files/:id/text', (ctx) => {
    const file = requireRow(ctx.db, 'files', ctx.params.id, 'Datei');
    ctx.json(200, { id: file.id, chars: file.content_text.length, text: file.content_text });
  });

  router.add('GET', '/api/files/:id/raw', (ctx) => {
    const file = requireRow(ctx.db, 'files', ctx.params.id, 'Datei');
    const target = path.resolve(ctx.dirs.filesDir, path.basename(file.stored_name));
    if (!target.startsWith(path.resolve(ctx.dirs.filesDir) + path.sep)) throw new HttpError(400, 'Ungültiger Dateipfad.');
    let stat;
    try {
      stat = fs.statSync(target);
    } catch {
      throw new HttpError(410, 'Die Datei fehlt im Datenverzeichnis. Bitte aus einem Backup wiederherstellen.');
    }
    const forceDownload = ctx.query.get('download') === '1';
    const type = forceDownload ? 'attachment' : dispositionType(file);
    const baseHeaders = {
      'Content-Type': TEXT_EXTENSIONS.has(path.extname(file.original_name).toLowerCase()) ? 'text/plain; charset=utf-8' : file.mime,
      'Content-Disposition': contentDisposition(type, file.original_name),
      'Cache-Control': 'private, max-age=0, must-revalidate',
      ETag: `"${file.sha256 || stat.size}"`,
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff'
    };

    if (ctx.req.headers['if-none-match'] === baseHeaders.ETag) {
      ctx.res.writeHead(304, baseHeaders);
      ctx.res.end();
      return;
    }

    const range = ctx.req.headers.range;
    if (range && /^bytes=\d*-\d*$/.test(range)) {
      const [startRaw, endRaw] = range.slice(6).split('-');
      let start = startRaw ? Number(startRaw) : 0;
      let end = endRaw ? Number(endRaw) : stat.size - 1;
      if (!startRaw && endRaw) {
        start = Math.max(0, stat.size - Number(endRaw));
        end = stat.size - 1;
      }
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= stat.size) {
        ctx.send(416, Buffer.from('Angefragter Bereich ist ungültig.'), { 'Content-Range': `bytes */${stat.size}` });
        return;
      }
      end = Math.min(end, stat.size - 1);
      const length = end - start + 1;
      ctx.res.writeHead(206, {
        ...baseHeaders,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Content-Length': length
      });
      fs.createReadStream(target, { start, end }).pipe(ctx.res);
      return;
    }

    ctx.res.writeHead(200, { ...baseHeaders, 'Content-Length': stat.size });
    fs.createReadStream(target).pipe(ctx.res);
  });

}
