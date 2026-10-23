import fs from 'node:fs';
import path from 'node:path';
import { Router } from './http-util.js';
import { APP_VERSION } from './config.js';
import { HttpError, clampText, nowISO, normalize, parseJsonSafe, textSnippet, toInt } from './util.js';
import {
  SUBJECT_COLORS,
  SUBJECT_STATUS,
  assertTitle,
  buildNoteSearchQuery,
  folderPath,
  getSettings,
  refreshNoteLinks,
  refreshNoteSearch,
  requireRow,
  serializeNote,
  setNoteTags,
  parseTagsField
} from './api-shared.js';

const DUE_SQL = `(c.due IS NOT NULL AND c.due <= ?) AND c.suspended = 0`;

export function subjectRows(db, now = nowISO()) {
  const rows = db
    .prepare(
      `SELECT s.*, sem.name AS semester_name,
        (SELECT COUNT(*) FROM notes n WHERE n.subject_id = s.id AND n.deleted_at IS NULL) AS note_count,
        (SELECT COUNT(*) FROM cards c JOIN decks d ON d.id = c.deck_id WHERE d.subject_id = s.id) AS card_count,
        (SELECT COUNT(*) FROM cards c JOIN decks d ON d.id = c.deck_id WHERE d.subject_id = s.id AND ${DUE_SQL}) AS due_count,
        (SELECT COUNT(*) FROM cards c JOIN decks d ON d.id = c.deck_id WHERE d.subject_id = s.id AND c.reps > 0) AS learned_cards,
        (SELECT COUNT(*) FROM tasks t WHERE t.subject_id = s.id AND t.status != 'erledigt') AS open_tasks,
        (SELECT COUNT(*) FROM topics tp WHERE tp.subject_id = s.id) AS topic_count,
        (SELECT COUNT(*) FROM topics tp WHERE tp.subject_id = s.id AND tp.status = 'verstanden') AS topics_done,
        (SELECT COUNT(*) FROM exams e WHERE e.subject_id = s.id AND e.date >= date('now','localtime')) AS upcoming_exams
      FROM subjects s
      LEFT JOIN semesters sem ON sem.id = s.semester_id
      ORDER BY s.position, s.name COLLATE NOCASE`
    )
    .all(now);
  return rows.map((row) => {
    let progress = 0;
    if (row.topic_count > 0) progress = Math.round((row.topics_done / row.topic_count) * 100);
    else if (row.card_count > 0) progress = Math.round((row.learned_cards / row.card_count) * 100);
    return { ...row, progress };
  });
}

function listTags(db) {
  return db
    .prepare(
      `SELECT t.name, COUNT(nt.note_id) AS count FROM tags t
       LEFT JOIN note_tags nt ON nt.tag_id = t.id
       LEFT JOIN notes n ON n.id = nt.note_id AND n.deleted_at IS NULL
       GROUP BY t.id ORDER BY count DESC, t.name COLLATE NOCASE`
    )
    .all();
}

/** Sammelt eine Ordner-ID samt aller Unterordner. */
function collectFolderIds(db, folderId) {
  const out = [];
  const queue = [folderId];
  while (queue.length) {
    const id = queue.shift();
    if (!id || out.includes(id)) continue;
    out.push(id);
    const children = db.prepare('SELECT id FROM folders WHERE parent_id = ?').all(id);
    queue.push(...children.map((c) => c.id));
  }
  return out;
}

function noteTitleOrFallback(title) {
  const t = String(title ?? '').trim();
  return t || 'Unbenannte Notiz';
}

/**
 * Ergänzt Verweise, die auf eine neu erstellte oder umbenannte Notiz zeigen.
 * Wird nur bei Erstellen/Umbenennen ausgeführt, nicht bei jedem Autosave.
 */
function relinkMentionsOf(db, target) {
  const candidates = db
    .prepare("SELECT id, content FROM notes WHERE deleted_at IS NULL AND id != ? AND content LIKE '%[[%'")
    .all(target.id);
  const wanted = target.title.trim().toLowerCase();
  if (!wanted) return;
  const del = db.prepare('DELETE FROM note_links WHERE source_id = ? AND target_id = ?');
  const ins = db.prepare('INSERT OR IGNORE INTO note_links (source_id, target_id) VALUES (?, ?)');
  for (const source of candidates) {
    const re = /\[\[([^\[\]\n]{1,200})\]\]/g;
    let mentions = false;
    let m;
    while ((m = re.exec(source.content)) !== null) {
      if (m[1].split('|')[0].trim().toLowerCase() === wanted) {
        mentions = true;
        break;
      }
    }
    if (mentions) ins.run(source.id, target.id);
    else del.run(source.id, target.id);
  }
}

function snapshotNoteVersion(db, oldNote) {
  if (!oldNote) return;
  const last = db.prepare('SELECT * FROM note_versions WHERE note_id = ? ORDER BY created_at DESC LIMIT 1').get(oldNote.id);
  if (last && last.title === oldNote.title && last.content === oldNote.content) return;
  if (last && Date.now() - new Date(last.created_at).getTime() < 120000) return;
  db.prepare('INSERT INTO note_versions (note_id, title, content, created_at) VALUES (?, ?, ?, ?)').run(
    oldNote.id,
    oldNote.title,
    oldNote.content,
    nowISO()
  );
  db.prepare(
    `DELETE FROM note_versions WHERE note_id = ? AND id NOT IN (
      SELECT id FROM note_versions WHERE note_id = ? ORDER BY created_at DESC LIMIT 30)`
  ).run(oldNote.id, oldNote.id);
}

export function registerCoreRoutes(router, context) {
  // ------------------------------------------------------------ Metadaten
  router.add('GET', '/api/meta', (ctx) => {
    const counts = context.counts();
    const dbFile = path.join(ctx.dataDir, 'studyforge.db');
    let dbSize = 0;
    try {
      dbSize = fs.statSync(dbFile).size;
    } catch {
      dbSize = 0;
    }
    const backups = fs.existsSync(ctx.dirs.backupsDir)
      ? fs
          .readdirSync(ctx.dirs.backupsDir)
          .filter((f) => f.endsWith('.zip'))
          .map((f) => {
            const stat = fs.statSync(path.join(ctx.dirs.backupsDir, f));
            return { name: f, size: stat.size, at: stat.mtime.toISOString() };
          })
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, 10)
      : [];
    ctx.json(200, {
      app: 'StudyForge',
      version: APP_VERSION,
      node: process.version,
      dataDir: ctx.dataDir,
      filesDir: ctx.dirs.filesDir,
      dbPath: dbFile,
      dbSize,
      counts,
      backups,
      schemaVersion: Number(ctx.db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get()?.value || 0),
      lastMigration: parseJsonSafe(ctx.db.prepare("SELECT value FROM meta WHERE key = 'last_migration'").get()?.value ?? 'null'),
      serverPort: ctx.serverInfo?.port ?? null
    });
  });

  router.add('GET', '/api/health', (ctx) => {
    const integrity = ctx.db.prepare('PRAGMA integrity_check').get();
    ctx.json(200, { ok: integrity?.integrity_check === 'ok', integrity });
  });

  // ------------------------------------------------------------ Semester
  router.add('GET', '/api/semesters', (ctx) => {
    ctx.json(200, ctx.db.prepare('SELECT * FROM semesters ORDER BY position, name').all());
  });

  router.add('POST', '/api/semesters', async (ctx) => {
    const body = await ctx.jsonBody();
    const name = assertTitle(body.name, 'Name des Semesters', 120);
    const ts = nowISO();
    const result = ctx.db
      .prepare('INSERT INTO semesters (name, start_date, end_date, position, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(name, body.start_date || null, body.end_date || null, toInt(body.position, 0), ts);
    ctx.json(201, ctx.db.prepare('SELECT * FROM semesters WHERE id = ?').get(result.lastInsertRowid));
  });

  router.add('PATCH', '/api/semesters/:id', async (ctx) => {
    const row = requireRow(ctx.db, 'semesters', ctx.params.id, 'Semester');
    const body = await ctx.jsonBody();
    const name = body.name !== undefined ? assertTitle(body.name, 'Name des Semesters', 120) : row.name;
    ctx.db
      .prepare('UPDATE semesters SET name = ?, start_date = ?, end_date = ?, position = ? WHERE id = ?')
      .run(name, body.start_date !== undefined ? body.start_date || null : row.start_date, body.end_date !== undefined ? body.end_date || null : row.end_date, body.position !== undefined ? toInt(body.position, row.position) : row.position, row.id);
    ctx.json(200, ctx.db.prepare('SELECT * FROM semesters WHERE id = ?').get(row.id));
  });

  router.add('DELETE', '/api/semesters/:id', (ctx) => {
    requireRow(ctx.db, 'semesters', ctx.params.id, 'Semester');
    ctx.db.prepare('DELETE FROM semesters WHERE id = ?').run(toInt(ctx.params.id));
    ctx.json(200, { ok: true });
  });

  // ------------------------------------------------------------ Fächer
  router.add('GET', '/api/subjects', (ctx) => {
    ctx.json(200, subjectRows(ctx.db));
  });

  router.add('GET', '/api/subjects/:id', (ctx) => {
    const subject = requireRow(ctx.db, 'subjects', ctx.params.id, 'Fach');
    const topics = ctx.db.prepare('SELECT * FROM topics WHERE subject_id = ? ORDER BY status, name COLLATE NOCASE').all(subject.id);
    const goals = ctx.db.prepare('SELECT * FROM goals WHERE subject_id = ? ORDER BY status, due_date').all(subject.id);
    const exams = ctx.db.prepare('SELECT * FROM exams WHERE subject_id = ? ORDER BY date').all(subject.id);
    const decks = ctx.db.prepare('SELECT * FROM decks WHERE subject_id = ? ORDER BY name COLLATE NOCASE').all(subject.id);
    const row = subjectRows(ctx.db).find((s) => s.id === subject.id) ?? subject;
    ctx.json(200, { ...row, topics, goals, exams, decks, semester_name: row.semester_name ?? null });
  });

  router.add('POST', '/api/subjects', async (ctx) => {
    const body = await ctx.jsonBody();
    const name = assertTitle(body.name, 'Name des Fachs', 160);
    const ts = nowISO();
    const status = SUBJECT_STATUS.includes(body.status) ? body.status : 'aktiv';
    const color = SUBJECT_COLORS.includes(body.color) ? body.color : 'indigo';
    const semesterId = toInt(body.semester_id);
    if (semesterId !== null && !ctx.db.prepare('SELECT id FROM semesters WHERE id = ?').get(semesterId)) {
      throw new HttpError(400, 'Das gewählte Semester existiert nicht.');
    }
    const result = ctx.db
      .prepare(
        'INSERT INTO subjects (semester_id, name, description, status, color, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(semesterId, name, clampText(body.description, 20000, 'Beschreibung'), status, color, toInt(body.position, 0), ts, ts);
    ctx.json(201, ctx.db.prepare('SELECT * FROM subjects WHERE id = ?').get(result.lastInsertRowid));
  });

  router.add('PATCH', '/api/subjects/:id', async (ctx) => {
    const subject = requireRow(ctx.db, 'subjects', ctx.params.id, 'Fach');
    const body = await ctx.jsonBody();
    const name = body.name !== undefined ? assertTitle(body.name, 'Name des Fachs', 160) : subject.name;
    const status = body.status !== undefined ? (SUBJECT_STATUS.includes(body.status) ? body.status : subject.status) : subject.status;
    const color = body.color !== undefined ? (SUBJECT_COLORS.includes(body.color) ? body.color : subject.color) : subject.color;
    const semesterId = body.semester_id !== undefined ? toInt(body.semester_id) : subject.semester_id;
    if (semesterId !== null && !ctx.db.prepare('SELECT id FROM semesters WHERE id = ?').get(semesterId)) {
      throw new HttpError(400, 'Das gewählte Semester existiert nicht.');
    }
    ctx.db
      .prepare(
        'UPDATE subjects SET semester_id = ?, name = ?, description = ?, status = ?, color = ?, position = ?, updated_at = ? WHERE id = ?'
      )
      .run(
        semesterId,
        name,
        body.description !== undefined ? clampText(body.description, 20000, 'Beschreibung') : subject.description,
        status,
        color,
        body.position !== undefined ? toInt(body.position, subject.position) : subject.position,
        nowISO(),
        subject.id
      );
    ctx.json(200, ctx.db.prepare('SELECT * FROM subjects WHERE id = ?').get(subject.id));
  });

  router.add('DELETE', '/api/subjects/:id', (ctx) => {
    const subject = requireRow(ctx.db, 'subjects', ctx.params.id, 'Fach');
    const count = (table) => ctx.db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE subject_id = ?`).get(subject.id).c;
    const removed = { topics: count('topics'), goals: count('goals') };
    ctx.db.prepare('DELETE FROM subjects WHERE id = ?').run(subject.id);
    // Zuletzt gewähltes Fach nicht auf ein gelöschtes Fach zeigen lassen.
    ctx.db.prepare("UPDATE settings SET value = '' WHERE key = 'last_subject_id' AND value = ?").run(String(subject.id));
    ctx.json(200, {
      ok: true,
      removed,
      note: 'Themen und Lernziele des Fachs wurden gelöscht. Notizen, Karten, Dokumente, Aufgaben und Prüfungen bleiben erhalten und sind keinem Fach mehr zugeordnet.'
    });
  });

  // ------------------------------------------------------------ Ordner
  router.add('GET', '/api/folders', (ctx) => {
    const rows = ctx.db
      .prepare(
        `SELECT f.*, s.name AS subject_name,
          (SELECT COUNT(*) FROM notes n WHERE n.folder_id = f.id AND n.deleted_at IS NULL) AS note_count
         FROM folders f LEFT JOIN subjects s ON s.id = f.subject_id
         ORDER BY f.position, f.name COLLATE NOCASE`
      )
      .all();
    ctx.json(200, rows.map((r) => ({ ...r, path: folderPath(ctx.db, r.id) })));
  });

  router.add('POST', '/api/folders', async (ctx) => {
    const body = await ctx.jsonBody();
    const name = assertTitle(body.name, 'Ordnername', 120);
    const parentId = toInt(body.parent_id);
    if (parentId !== null) requireRow(ctx.db, 'folders', parentId, 'Übergeordneter Ordner');
    const subjectId = toInt(body.subject_id);
    if (subjectId !== null) requireRow(ctx.db, 'subjects', subjectId, 'Fach');
    const result = ctx.db
      .prepare('INSERT INTO folders (name, parent_id, subject_id, position, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(name, parentId, subjectId, toInt(body.position, 0), nowISO());
    ctx.json(201, ctx.db.prepare('SELECT * FROM folders WHERE id = ?').get(result.lastInsertRowid));
  });

  router.add('PATCH', '/api/folders/:id', async (ctx) => {
    const folder = requireRow(ctx.db, 'folders', ctx.params.id, 'Ordner');
    const body = await ctx.jsonBody();
    const name = body.name !== undefined ? assertTitle(body.name, 'Ordnername', 120) : folder.name;
    let parentId = body.parent_id !== undefined ? toInt(body.parent_id) : folder.parent_id;
    if (parentId !== null) {
      if (parentId === folder.id) throw new HttpError(400, 'Ein Ordner kann nicht sein eigener Elternordner sein.');
      requireRow(ctx.db, 'folders', parentId, 'Übergeordneter Ordner');
      const descendants = collectFolderIds(ctx.db, folder.id);
      if (descendants.includes(parentId)) throw new HttpError(400, 'Ein Ordner kann nicht in einen seiner Unterordner verschoben werden.');
    }
    const subjectId = body.subject_id !== undefined ? toInt(body.subject_id) : folder.subject_id;
    if (subjectId !== null) requireRow(ctx.db, 'subjects', subjectId, 'Fach');
    ctx.db
      .prepare('UPDATE folders SET name = ?, parent_id = ?, subject_id = ?, position = ? WHERE id = ?')
      .run(name, parentId, subjectId, body.position !== undefined ? toInt(body.position, folder.position) : folder.position, folder.id);
    ctx.json(200, ctx.db.prepare('SELECT * FROM folders WHERE id = ?').get(folder.id));
  });

  router.add('DELETE', '/api/folders/:id', (ctx) => {
    const folder = requireRow(ctx.db, 'folders', ctx.params.id, 'Ordner');
    const count = ctx.db.prepare('SELECT COUNT(*) AS c FROM notes WHERE folder_id = ? AND deleted_at IS NULL').get(folder.id).c;
    ctx.db.prepare('DELETE FROM folders WHERE id = ?').run(folder.id);
    ctx.json(200, { ok: true, orphanedNotes: count });
  });

  // ------------------------------------------------------------ Notizen
  router.add('GET', '/api/notes', (ctx) => {
    const q = ctx.query;
    const limit = Math.min(Math.max(toInt(q.get('limit'), 100), 1), 500);
    const offset = Math.max(toInt(q.get('offset'), 0), 0);
    const folderId = toInt(q.get('folder_id'));
    const folderIds = folderId && q.get('with_subfolders') === '1' ? collectFolderIds(ctx.db, folderId) : null;
    const { where, params } = buildNoteSearchQuery({
      q: q.get('q') || '',
      subjectId: toInt(q.get('subject_id')),
      folderId: folderIds ? null : folderId,
      folderIds,
      tag: q.get('tag'),
      favorite: q.get('favorite') === '1',
      trash: q.get('trash') === '1'
    });
    const sort = q.get('sort');
    const order = sort === 'title' ? 'n.title COLLATE NOCASE ASC' : sort === 'created' ? 'n.created_at DESC' : 'n.updated_at DESC';
    const total = ctx.db.prepare(`SELECT COUNT(*) AS c FROM notes n WHERE ${where.join(' AND ')}`).get(...params).c;
    const rows = ctx.db
      .prepare(
        `SELECT n.id, n.title, n.subject_id, n.folder_id, n.topic, n.pinned, n.favorite, n.created_at, n.updated_at, n.deleted_at,
          substr(n.content, 1, 500) AS snippet,
          s.name AS subject_name, s.color AS subject_color, f.name AS folder_name,
          (SELECT COUNT(*) FROM files fi WHERE fi.note_id = n.id) AS attachment_count,
          (SELECT GROUP_CONCAT(t.name, '||') FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.note_id = n.id) AS tag_list,
          (SELECT COUNT(*) FROM note_links l JOIN notes tn ON tn.id = l.target_id WHERE l.source_id = n.id AND tn.deleted_at IS NULL) AS link_count
        FROM notes n
        LEFT JOIN subjects s ON s.id = n.subject_id
        LEFT JOIN folders f ON f.id = n.folder_id
        WHERE ${where.join(' AND ')}
        ORDER BY n.pinned DESC, ${order}
        LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset);
    ctx.json(200, {
      total,
      limit,
      offset,
      notes: rows.map((row) => ({
        ...row,
        pinned: !!row.pinned,
        favorite: !!row.favorite,
        tags: row.tag_list ? row.tag_list.split('||') : [],
        tag_list: undefined,
        subject: row.subject_name ? { name: row.subject_name, color: row.subject_color } : null,
        excerpt: String(row.snippet || '').replace(/[#*`>\-\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220)
      }))
    });
  });

  router.add('GET', '/api/notes/:id', (ctx) => {
    const note = requireRow(ctx.db, 'notes', ctx.params.id, 'Notiz');
    ctx.json(200, serializeNote(ctx.db, note, { full: true }));
  });

  router.add('POST', '/api/notes', async (ctx) => {
    const body = await ctx.jsonBody();
    const title = noteTitleOrFallback(body.title);
    const content = clampText(body.content, 2000000, 'Inhalt');
    const subjectId = toInt(body.subject_id);
    if (subjectId !== null) requireRow(ctx.db, 'subjects', subjectId, 'Fach');
    const folderId = toInt(body.folder_id);
    if (folderId !== null) requireRow(ctx.db, 'folders', folderId, 'Ordner');
    const topic = clampText(body.topic, 200, 'Thema');
    const ts = nowISO();
    const result = ctx.db
      .prepare(
        `INSERT INTO notes (title, content, folder_id, subject_id, topic, pinned, favorite, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(title, content, folderId, subjectId, topic, body.pinned ? 1 : 0, body.favorite ? 1 : 0, ts, ts);
    const id = Number(result.lastInsertRowid);
    const tags = parseTagsField(body.tags);
    if (tags.length) setNoteTags(ctx.db, id, tags);
    refreshNoteSearch(ctx.db, id);
    refreshNoteLinks(ctx.db, id, content);
    relinkMentionsOf(ctx.db, ctx.db.prepare('SELECT * FROM notes WHERE id = ?').get(id));
    ctx.json(201, serializeNote(ctx.db, ctx.db.prepare('SELECT * FROM notes WHERE id = ?').get(id), { full: true }));
  });

  router.add('PATCH', '/api/notes/:id', async (ctx) => {
    const old = requireRow(ctx.db, 'notes', ctx.params.id, 'Notiz');
    const body = await ctx.jsonBody();
    const title = body.title !== undefined ? noteTitleOrFallback(body.title) : old.title;
    const content = body.content !== undefined ? clampText(body.content, 2000000, 'Inhalt') : old.content;
    const subjectId = body.subject_id !== undefined ? toInt(body.subject_id) : old.subject_id;
    if (subjectId !== null) requireRow(ctx.db, 'subjects', subjectId, 'Fach');
    const folderId = body.folder_id !== undefined ? toInt(body.folder_id) : old.folder_id;
    if (folderId !== null) requireRow(ctx.db, 'folders', folderId, 'Ordner');
    const topic = body.topic !== undefined ? clampText(body.topic, 200, 'Thema') : old.topic;

    if (title !== old.title || content !== old.content) snapshotNoteVersion(ctx.db, old);

    ctx.db
      .prepare(
        `UPDATE notes SET title = ?, content = ?, folder_id = ?, subject_id = ?, topic = ?, pinned = ?, favorite = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        title,
        content,
        folderId,
        subjectId,
        topic,
        body.pinned !== undefined ? (body.pinned ? 1 : 0) : old.pinned,
        body.favorite !== undefined ? (body.favorite ? 1 : 0) : old.favorite,
        nowISO(),
        old.id
      );
    if (body.tags !== undefined) setNoteTags(ctx.db, old.id, parseTagsField(body.tags));
    refreshNoteSearch(ctx.db, old.id);
    if (content !== old.content) refreshNoteLinks(ctx.db, old.id, content);
    if (title !== old.title) {
      relinkMentionsOf(ctx.db, ctx.db.prepare('SELECT * FROM notes WHERE id = ?').get(old.id));
    }
    ctx.json(200, serializeNote(ctx.db, ctx.db.prepare('SELECT * FROM notes WHERE id = ?').get(old.id), { full: true }));
  });

  router.add('DELETE', '/api/notes/:id', (ctx) => {
    const note = requireRow(ctx.db, 'notes', ctx.params.id, 'Notiz');
    if (ctx.query.get('permanent') === '1') {
      const attachments = ctx.db.prepare('SELECT * FROM files WHERE note_id = ?').all(note.id);
      for (const file of attachments) {
        try {
          fs.unlinkSync(path.join(ctx.dirs.filesDir, path.basename(file.stored_name)));
        } catch {
          /* Datei war bereits weg */
        }
      }
      ctx.db.prepare('DELETE FROM notes WHERE id = ?').run(note.id);
      ctx.json(200, { ok: true, permanent: true });
      return;
    }
    ctx.db.prepare('UPDATE notes SET deleted_at = ? WHERE id = ?').run(nowISO(), note.id);
    ctx.json(200, { ok: true, trashed: true });
  });

  router.add('POST', '/api/notes/:id/restore', (ctx) => {
    const note = requireRow(ctx.db, 'notes', ctx.params.id, 'Notiz');
    ctx.db.prepare('UPDATE notes SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(nowISO(), note.id);
    refreshNoteSearch(ctx.db, note.id);
    ctx.json(200, serializeNote(ctx.db, ctx.db.prepare('SELECT * FROM notes WHERE id = ?').get(note.id), { full: true }));
  });

  router.add('GET', '/api/notes/:id/versions', (ctx) => {
    const note = requireRow(ctx.db, 'notes', ctx.params.id, 'Notiz');
    const rows = ctx.db.prepare('SELECT id, title, created_at, LENGTH(content) AS size FROM note_versions WHERE note_id = ? ORDER BY created_at DESC').all(note.id);
    ctx.json(200, rows);
  });

  router.add('GET', '/api/notes/:id/versions/:versionId', (ctx) => {
    const note = requireRow(ctx.db, 'notes', ctx.params.id, 'Notiz');
    const version = ctx.db
      .prepare('SELECT * FROM note_versions WHERE id = ? AND note_id = ?')
      .get(toInt(ctx.params.versionId), note.id);
    if (!version) throw new HttpError(404, 'Diese Version wurde nicht gefunden.');
    ctx.json(200, version);
  });

  router.add('POST', '/api/notes/:id/versions/:versionId/restore', (ctx) => {
    const note = requireRow(ctx.db, 'notes', ctx.params.id, 'Notiz');
    const version = ctx.db
      .prepare('SELECT * FROM note_versions WHERE id = ? AND note_id = ?')
      .get(toInt(ctx.params.versionId), note.id);
    if (!version) throw new HttpError(404, 'Diese Version wurde nicht gefunden.');
    snapshotNoteVersion(ctx.db, note);
    const ts = nowISO();
    ctx.db.prepare('UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?').run(version.title, version.content, ts, note.id);
    refreshNoteSearch(ctx.db, note.id);
    refreshNoteLinks(ctx.db, note.id, version.content);
    relinkMentionsOf(ctx.db, ctx.db.prepare('SELECT * FROM notes WHERE id = ?').get(note.id));
    ctx.json(200, serializeNote(ctx.db, ctx.db.prepare('SELECT * FROM notes WHERE id = ?').get(note.id), { full: true }));
  });

  router.add('GET', '/api/tags', (ctx) => {
    ctx.json(200, listTags(ctx.db));
  });

  // ------------------------------------------------------------ Suche
  router.add('GET', '/api/search', (ctx) => {
    const q = ctx.query.get('q') || '';
    const normalized = normalize(q);
    if (normalized.length < 2) {
      ctx.json(200, { query: q, notes: [], documents: [], cards: [], tasks: [], total: 0 });
      return;
    }
    const like = `%${normalized}%`;
    const notes = ctx.db
      .prepare(
        `SELECT n.id, n.title, n.updated_at, s.name AS subject_name,
          (SELECT GROUP_CONCAT(t.name, '||') FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.note_id = n.id) AS tag_list
         FROM notes n LEFT JOIN subjects s ON s.id = n.subject_id
         WHERE n.deleted_at IS NULL AND n.search_blob LIKE ? ORDER BY n.updated_at DESC LIMIT 12`
      )
      .all(like)
      .map((r) => ({ ...r, tags: r.tag_list ? r.tag_list.split('||') : [], tag_list: undefined }));
    const documents = ctx.db
      .prepare(
        `SELECT f.id, f.original_name, f.title, f.topic, f.mime, f.size, f.created_at, f.content_text, s.name AS subject_name
         FROM files f LEFT JOIN subjects s ON s.id = f.subject_id
         WHERE f.kind = 'document' AND f.search_blob LIKE ? ORDER BY f.created_at DESC LIMIT 12`
      )
      .all(like)
      .map(({ content_text: contentText, ...rest }) => ({
        ...rest,
        has_text: Boolean(contentText),
        snippet: textSnippet(contentText, q)
      }));
    const cards = ctx.db
      .prepare('SELECT id, deck_id, front, back, topic, tags FROM cards ORDER BY id DESC')
      .all()
      .filter((c) => normalize(`${c.front} ${c.back} ${c.topic} ${c.tags}`).includes(normalized))
      .slice(0, 12);
    const tasks = ctx.db
      .prepare("SELECT id, title, description, topic, status, due_date FROM tasks ORDER BY status, due_date")
      .all()
      .filter((t) => normalize(`${t.title} ${t.description} ${t.topic}`).includes(normalized))
      .slice(0, 12);
    ctx.json(200, {
      query: q,
      notes,
      documents,
      cards,
      tasks,
      total: notes.length + documents.length + cards.length + tasks.length
    });
  });

  // ------------------------------------------------------------ Dashboard
  router.add('GET', '/api/dashboard', (ctx) => {
    const now = nowISO();
    const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const subjects = subjectRows(ctx.db, now);
    const recent = ctx.db
      .prepare(
        `SELECT n.id, n.title, n.updated_at, n.topic, s.name AS subject_name, s.color AS subject_color
         FROM notes n LEFT JOIN subjects s ON s.id = n.subject_id
         WHERE n.deleted_at IS NULL ORDER BY n.updated_at DESC LIMIT 6`
      )
      .all();
    const dueCards = ctx.db
      .prepare(`SELECT COUNT(*) AS c FROM cards c WHERE ${DUE_SQL}`)
      .get(now).c;
    const newCards = ctx.db.prepare('SELECT COUNT(*) AS c FROM cards WHERE reps = 0 AND suspended = 0').get().c;
    const dueDecks = ctx.db
      .prepare(
        `SELECT d.id, d.name, s.name AS subject_name,
          COUNT(c.id) AS due_count
         FROM decks d
         JOIN cards c ON c.deck_id = d.id AND ((c.due IS NOT NULL AND c.due <= ?) OR c.due IS NULL) AND c.suspended = 0
         LEFT JOIN subjects s ON s.id = d.subject_id
         GROUP BY d.id ORDER BY due_count DESC LIMIT 4`
      )
      .all(now);
    const openTasks = ctx.db
      .prepare(
        `SELECT t.id, t.title, t.status, t.priority, t.due_date, s.name AS subject_name
         FROM tasks t LEFT JOIN subjects s ON s.id = t.subject_id
         WHERE t.status != 'erledigt'
         ORDER BY CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END, t.due_date, CASE t.priority WHEN 'hoch' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END
         LIMIT 8`
      )
      .all();
    const upcomingExams = ctx.db
      .prepare(
        `SELECT e.*, s.name AS subject_name, s.color AS subject_color
         FROM exams e LEFT JOIN subjects s ON s.id = e.subject_id
         WHERE e.date IS NOT NULL AND e.date >= ?
         ORDER BY e.date LIMIT 6`
      )
      .all(today);
    // Prüfungen/Abgaben aus importierten Kalendern, die (noch) keiner Prüfung zugeordnet sind.
    const upcomingEvents = ctx.db
      .prepare(
        `SELECT ce.id, ce.summary, ce.start, ce.all_day, ce.category, ce.location
         FROM calendar_events ce
         WHERE ce.category IN ('pruefung', 'abgabe') AND ce.removed_at IS NULL AND ce.status != 'CANCELLED'
           AND substr(ce.end, 1, 10) >= ?
           AND NOT EXISTS (SELECT 1 FROM exams e WHERE e.calendar_event_id = ce.id)
         ORDER BY ce.start LIMIT 6`
      )
      .all(today)
      .map((row) => ({ ...row, all_day: Boolean(row.all_day) }));
    const topicStats = ctx.db
      .prepare(
        `SELECT status, COUNT(*) AS count FROM topics GROUP BY status`
      )
      .all()
      .reduce((acc, row) => ({ ...acc, [row.status]: row.count }), { offen: 0, ueben: 0, verstanden: 0 });
    const practiceTopics = ctx.db
      .prepare(
        `SELECT tp.id, tp.name, tp.status, tp.subject_id, s.name AS subject_name, s.color AS subject_color
         FROM topics tp JOIN subjects s ON s.id = tp.subject_id
         WHERE tp.status != 'verstanden'
         ORDER BY CASE tp.status WHEN 'ueben' THEN 0 ELSE 1 END, tp.updated_at DESC LIMIT 8`
      )
      .all();
    const understoodTopics = ctx.db
      .prepare(
        `SELECT tp.id, tp.name, tp.subject_id, s.name AS subject_name, s.color AS subject_color
         FROM topics tp JOIN subjects s ON s.id = tp.subject_id
         WHERE tp.status = 'verstanden' ORDER BY tp.updated_at DESC LIMIT 6`
      )
      .all();
    const reviews7d = ctx.db
      .prepare("SELECT COUNT(*) AS c FROM reviews WHERE reviewed_at >= datetime('now','-7 days')")
      .get().c;
    const dueTaskCount = ctx.db
      .prepare("SELECT COUNT(*) AS c FROM tasks WHERE status != 'erledigt' AND due_date IS NOT NULL AND due_date <= ?")
      .get(today).c;
    ctx.json(200, {
      subjects,
      recent,
      dueCards,
      newCards,
      dueDecks,
      openTasks,
      upcomingExams,
      upcomingEvents,
      topicStats,
      practiceTopics,
      understoodTopics,
      reviews7d,
      dueTaskCount,
      counts: context.counts(),
      today
    });
  });

  // ------------------------------------------------------------ Einstellungen
  router.add('GET', '/api/settings', (ctx) => {
    ctx.json(200, getSettings(ctx.db));
  });

  router.add('PUT', '/api/settings', async (ctx) => {
    const body = await ctx.jsonBody();
    const allowed = {
      theme: ['system', 'light', 'dark'],
      font_size: ['sm', 'md', 'lg', 'xl'],
      timer_default: ['0', '1'],
      editor_split: ['0', '1'],
      last_subject_id: null
    };
    const updates = {};
    for (const [key, value] of Object.entries(body)) {
      if (!(key in allowed)) continue;
      if (allowed[key] && !allowed[key].includes(String(value))) throw new HttpError(400, `Ungültiger Wert für ${key}.`);
      updates[key] = String(value);
    }
    if (body.review_limit !== undefined) {
      const n = toInt(body.review_limit, 20);
      if (n < 5 || n > 200) throw new HttpError(400, 'Karten pro Lerneinheit müssen zwischen 5 und 200 liegen.');
      updates.review_limit = String(n);
    }
    if (body.requested_retention !== undefined) {
      const n = Number(body.requested_retention);
      if (!Number.isFinite(n) || n < 0.7 || n > 0.99) throw new HttpError(400, 'Die Ziel-Merkfähigkeit muss zwischen 70 % und 99 % liegen.');
      updates.requested_retention = String(n);
    }
    if (body.timer_minutes !== undefined) {
      const n = toInt(body.timer_minutes, 25);
      if (n < 5 || n > 120) throw new HttpError(400, 'Der Timer muss zwischen 5 und 120 Minuten liegen.');
      updates.timer_minutes = String(n);
    }
    // Werkzeuge: Favoriten und eigene Port-Einträge als JSON-Liste (nur auf ausdrücklichen Wunsch gespeichert).
    for (const [key, max] of [['tools_favorites', 4000], ['tools_custom_ports', 32000]]) {
      if (body[key] === undefined) continue;
      const text = String(body[key]);
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      if (!Array.isArray(parsed)) throw new HttpError(400, `Ungültiger Wert für ${key}.`);
      if (text.length > max) throw new HttpError(400, `Zu viele Einträge für ${key}.`);
      updates[key] = text;
    }
    if (updates.last_subject_id) {
      const subject = ctx.db.prepare('SELECT id FROM subjects WHERE id = ?').get(toInt(updates.last_subject_id));
      if (!subject) delete updates.last_subject_id;
    }
    const stmt = ctx.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    for (const [key, value] of Object.entries(updates)) stmt.run(key, value);
    ctx.json(200, getSettings(ctx.db));
  });

}
