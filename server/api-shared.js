import { HttpError, normalize, nowISO, clampText, toInt } from './util.js';

export const CARD_TYPES = ['qa', 'definition', 'cloze', 'truefalse', 'mc', 'code'];
export const TASK_STATUS = ['offen', 'in_bearbeitung', 'erledigt'];
export const TASK_PRIORITY = ['niedrig', 'normal', 'hoch'];
export const TOPIC_STATUS = ['offen', 'ueben', 'verstanden'];
export const SUBJECT_STATUS = ['aktiv', 'abgeschlossen', 'geplant'];
export const SUBJECT_COLORS = ['indigo', 'teal', 'amber', 'rose', 'violet', 'slate', 'green', 'orange'];

export function getSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function settingNumber(settings, key, fallback) {
  const n = Number(settings[key]);
  return Number.isFinite(n) ? n : fallback;
}

export function requireRow(db, table, id, label) {
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(toInt(id));
  if (!row) throw new HttpError(404, `${label} wurde nicht gefunden.`);
  return row;
}

export function oneOf(value, allowed, field, fallback = null) {
  if (value === undefined || value === null || value === '') {
    if (fallback !== null) return fallback;
    throw new HttpError(400, `${field} ist erforderlich.`);
  }
  if (!allowed.includes(value)) throw new HttpError(400, `${field} hat einen ungültigen Wert.`);
  return value;
}

export function noteTags(db, noteId) {
  return db
    .prepare('SELECT t.name FROM tags t JOIN note_tags nt ON nt.tag_id = t.id WHERE nt.note_id = ? ORDER BY t.name')
    .all(noteId)
    .map((r) => r.name);
}

export function setNoteTags(db, noteId, tags) {
  db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(noteId);
  const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
  const findTag = db.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE');
  const link = db.prepare('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)');
  for (const tag of tags) {
    insertTag.run(tag);
    const found = findTag.get(tag);
    if (found) link.run(noteId, found.id);
  }
  db.prepare('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM note_tags)').run();
}

export function noteAttachmentNames(db, noteId) {
  return db.prepare('SELECT original_name FROM files WHERE note_id = ?').all(noteId).map((r) => r.original_name);
}

export function refreshNoteSearch(db, noteId) {
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId);
  if (!note) return;
  const tags = noteTags(db, noteId).join(' ');
  const files = noteAttachmentNames(db, noteId).join(' ');
  const subject = db.prepare('SELECT name FROM subjects WHERE id = ?').get(note.subject_id)?.name ?? '';
  const blob = normalize([note.title, note.content, note.topic, subject, tags, files].join('\n'));
  db.prepare('UPDATE notes SET search_blob = ? WHERE id = ?').run(blob, noteId);
}

export function refreshFileSearch(db, fileId) {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
  if (!file) return;
  const subject = db.prepare('SELECT name FROM subjects WHERE id = ?').get(file.subject_id)?.name ?? '';
  const blob = normalize([file.title, file.original_name, file.description, file.topic, subject, file.content_text].join('\n'));
  db.prepare('UPDATE files SET search_blob = ? WHERE id = ?').run(blob, fileId);
}

/** [[Titel]] -> note_links; Verweise auf nicht existierende Notizen bleiben als Text. */
export function refreshNoteLinks(db, noteId, content) {
  db.prepare('DELETE FROM note_links WHERE source_id = ?').run(noteId);
  const re = /\[\[([^\[\]\n]{1,200})\]\]/g;
  const seen = new Set();
  let m;
  const find = db.prepare('SELECT id FROM notes WHERE title = ? COLLATE NOCASE AND deleted_at IS NULL AND id != ? LIMIT 1');
  while ((m = re.exec(content)) !== null) {
    const title = m[1].split('|')[0].trim();
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    const target = find.get(title, noteId);
    if (target) {
      db.prepare('INSERT OR IGNORE INTO note_links (source_id, target_id) VALUES (?, ?)').run(noteId, target.id);
    }
  }
}

export function serializeNote(db, note, { full = false } = {}) {
  const tags = noteTags(db, note.id);
  const subject = note.subject_id
    ? db.prepare('SELECT id, name, color FROM subjects WHERE id = ?').get(note.subject_id)
    : null;
  const folder = note.folder_id ? db.prepare('SELECT id, name FROM folders WHERE id = ?').get(note.folder_id) : null;
  const attachmentCount = db.prepare('SELECT COUNT(*) AS c FROM files WHERE note_id = ?').get(note.id).c;
  const out = {
    ...note,
    tags,
    subject,
    folder,
    attachmentCount,
    pinned: !!note.pinned,
    favorite: !!note.favorite,
    excerpt: String(note.content || '').replace(/[#*`>\-\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220)
  };
  if (!full) delete out.content;
  if (full) {
    out.attachments = db.prepare('SELECT * FROM files WHERE note_id = ? ORDER BY id').all(note.id);
    out.versions = db
      .prepare('SELECT id, title, created_at, LENGTH(content) AS size FROM note_versions WHERE note_id = ? ORDER BY created_at DESC LIMIT 30')
      .all(note.id);
    out.links = db
      .prepare(
        `SELECT n.id, n.title FROM note_links l JOIN notes n ON n.id = l.target_id WHERE l.source_id = ? AND n.deleted_at IS NULL`
      )
      .all(note.id);
    out.backlinks = db
      .prepare(
        `SELECT n.id, n.title FROM note_links l JOIN notes n ON n.id = l.source_id WHERE l.target_id = ? AND n.deleted_at IS NULL`
      )
      .all(note.id);
    out.folderPath = folderPath(db, note.folder_id);
  }
  return out;
}

export function folderPath(db, folderId) {
  const parts = [];
  let current = folderId;
  let guard = 0;
  while (current && guard < 50) {
    const folder = db.prepare('SELECT id, name, parent_id FROM folders WHERE id = ?').get(current);
    if (!folder) break;
    parts.unshift(folder.name);
    current = folder.parent_id;
    guard += 1;
  }
  return parts.join(' / ');
}

export function noteListRow(db, row) {
  const tags = noteTags(db, row.id);
  return {
    ...row,
    tags,
    excerpt: String(row.content || '').replace(/[#*`>\-\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220),
    subject: row.subject_id ? db.prepare('SELECT name, color FROM subjects WHERE id = ?').get(row.subject_id) : null,
    attachmentCount: db.prepare('SELECT COUNT(*) AS c FROM files WHERE note_id = ?').get(row.id).c
  };
}

export function buildNoteSearchQuery({ q, subjectId, folderId, tag, favorite, trash, folderIds }) {
  const where = [];
  const params = [];
  if (trash) where.push('n.deleted_at IS NOT NULL');
  else where.push('n.deleted_at IS NULL');
  if (subjectId) {
    where.push('n.subject_id = ?');
    params.push(subjectId);
  }
  if (folderIds && folderIds.length) {
    where.push(`n.folder_id IN (${folderIds.map(() => '?').join(',')})`);
    params.push(...folderIds);
  } else if (folderId) {
    where.push('n.folder_id = ?');
    params.push(folderId);
  }
  if (favorite) where.push('n.favorite = 1');
  if (tag) {
    where.push('EXISTS (SELECT 1 FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.note_id = n.id AND t.name = ? COLLATE NOCASE)');
    params.push(tag);
  }
  const normalized = normalize(q);
  if (normalized) {
    const words = normalized.split(' ').filter(Boolean).slice(0, 8);
    for (const word of words) {
      where.push('n.search_blob LIKE ?');
      params.push(`%${word}%`);
    }
  }
  return { where, params };
}

export function assertTitle(value, field, max = 200) {
  const text = clampText(value, max, field);
  if (!text.trim()) throw new HttpError(400, `${field} darf nicht leer sein.`);
  return text.trim();
}

export function parseIdList(value) {
  return String(value ?? '')
    .split(',')
    .map((v) => toInt(v))
    .filter((v) => Number.isInteger(v) && v > 0);
}

export function parseTagsField(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean).slice(0, 30);
  if (typeof value === 'string') return value.split(',').map((v) => v.trim()).filter(Boolean).slice(0, 30);
  return [];
}
