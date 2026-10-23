import fs from 'node:fs';
import path from 'node:path';
import {
  createBackupBundle,
  exportCards,
  exportJson,
  exportMarkdownZip,
  importCardsJson,
  inspectBackupJson,
  inspectBackupZip,
  restoreBundle,
  resetData,
  RESET_CONFIRM_WORD
} from './backup.js';
import { HttpError, isoFileStamp, nowISO, toInt } from './util.js';
import { requireRow } from './api-shared.js';

const MAX_IMPORT = 256 * 1024 * 1024;

function download(ctx, buffer, mime, filename) {
  ctx.send(200, buffer, {
    'Content-Type': mime,
    'Content-Disposition': `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'Cache-Control': 'no-store'
  });
}

function inspectAny(buffer) {
  if (!buffer.length) throw new HttpError(400, 'Die Datei ist leer.');
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return { kind: 'zip', bundle: inspectBackupZip(buffer) };
  return { kind: 'json', bundle: inspectBackupJson(buffer) };
}

export function registerTransferRoutes(router, context) {
  router.add('GET', '/api/export/backup', (ctx) => {
    const { buffer } = createBackupBundle(ctx.db, ctx.dirs);
    download(ctx, buffer, 'application/zip', `studyforge-backup-${isoFileStamp()}.zip`);
  });

  router.add('GET', '/api/export/json', (ctx) => {
    const buffer = exportJson(ctx.db, ctx.dirs);
    download(ctx, buffer, 'application/json; charset=utf-8', `studyforge-daten-${isoFileStamp()}.json`);
  });

  router.add('GET', '/api/export/markdown', (ctx) => {
    const { buffer } = exportMarkdownZip(ctx.db, ctx.dirs);
    download(ctx, buffer, 'application/zip', `studyforge-markdown-${isoFileStamp()}.zip`);
  });

  router.add('GET', '/api/export/cards', (ctx) => {
    const deckId = toInt(ctx.query.get('deck_id'));
    if (deckId !== null) requireRow(ctx.db, 'decks', deckId, 'Stapel');
    const buffer = exportCards(ctx.db, deckId);
    download(ctx, buffer, 'application/json; charset=utf-8', `studyforge-karten-${isoFileStamp()}.json`);
  });

  router.add('GET', '/api/backups/:name', (ctx) => {
    const name = path.basename(String(ctx.params.name || ''));
    if (!/^[\w.-]+\.zip$/.test(name)) throw new HttpError(400, 'Ungültiger Backup-Dateiname.');
    const target = path.join(ctx.dirs.backupsDir, name);
    if (!target.startsWith(path.resolve(ctx.dirs.backupsDir) + path.sep)) throw new HttpError(400, 'Ungültiger Pfad.');
    let stat;
    try {
      stat = fs.statSync(target);
    } catch {
      throw new HttpError(404, 'Dieses Backup wurde nicht gefunden.');
    }
    ctx.send(200, fs.readFileSync(target), {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"`,
      'Content-Length': stat.size,
      'Cache-Control': 'no-store'
    });
  });

  router.add('GET', '/api/export/note/:id', (ctx) => {
    const note = requireRow(ctx.db, 'notes', ctx.params.id, 'Notiz');
    const subject = note.subject_id
      ? ctx.db.prepare('SELECT name FROM subjects WHERE id = ?').get(note.subject_id)?.name
      : '';
    const tags = ctx.db
      .prepare('SELECT t.name FROM tags t JOIN note_tags nt ON nt.tag_id = t.id WHERE nt.note_id = ?')
      .all(note.id)
      .map((r) => r.name);
    const attachments = ctx.db.prepare('SELECT original_name FROM files WHERE note_id = ?').all(note.id);
    const content = [
      '---',
      `title: ${JSON.stringify(note.title)}`,
      `subject: ${JSON.stringify(subject || '')}`,
      `topic: ${JSON.stringify(note.topic || '')}`,
      `tags: [${tags.map((t) => JSON.stringify(t)).join(', ')}]`,
      `created: ${note.created_at}`,
      `updated: ${note.updated_at}`,
      '---',
      '',
      note.content,
      ...(attachments.length ? ['', '## Anhänge', ...attachments.map((a) => `- ${a.original_name}`)] : []),
      ''
    ].join('\n');
    download(ctx, Buffer.from(content, 'utf8'), 'text/markdown; charset=utf-8', `${note.title || 'Notiz'}.md`);
  });

  router.add('POST', '/api/import/inspect', async (ctx) => {
    const buffer = await ctx.body(MAX_IMPORT);
    const { kind, bundle } = inspectAny(buffer);
    ctx.json(200, {
      kind,
      ok: bundle.ok,
      problems: bundle.problems,
      warnings: bundle.warnings,
      counts: bundle.counts,
      createdAt: bundle.manifest?.createdAt ?? null,
      appVersion: bundle.manifest?.appVersion ?? null
    });
  });

  router.add('POST', '/api/import', async (ctx) => {
    if (ctx.query.get('confirm') !== 'replace') {
      throw new HttpError(400, 'Der Import ersetzt alle vorhandenen Daten. Bitte ausdrücklich bestätigen.');
    }
    const buffer = await ctx.body(MAX_IMPORT);
    const { kind, bundle } = inspectAny(buffer);
    if (!bundle.ok) {
      throw new HttpError(400, `Backup ist unvollständig oder beschädigt: ${bundle.problems.slice(0, 5).join(' ')}`);
    }
    const result = await restoreBundle(ctx.db, ctx.dirs, bundle);
    ctx.json(200, {
      ok: true,
      kind,
      restoredAt: nowISO(),
      counts: result.counts,
      safetyBackup: result.safetyBackup,
      warnings: bundle.warnings,
      totals: context.counts()
    });
  });

  router.add('POST', '/api/reset', async (ctx) => {
    const body = await ctx.jsonBody();
    if (body.scope === 'all' && body.confirm !== RESET_CONFIRM_WORD) {
      throw new HttpError(400, `Zum Löschen aller Daten bitte „${RESET_CONFIRM_WORD}“ eingeben.`);
    }
    const result = await resetData(ctx.db, ctx.dirs, body.scope);
    ctx.json(200, { ok: true, ...result, totals: context.counts() });
  });

  router.add('POST', '/api/import/cards', async (ctx) => {
    const deckId = toInt(ctx.query.get('deck_id'));
    if (!deckId) throw new HttpError(400, 'Bitte einen Ziel-Stapel auswählen.');
    requireRow(ctx.db, 'decks', deckId, 'Stapel');
    const buffer = await ctx.body(32 * 1024 * 1024);
    const result = importCardsJson(ctx.db, buffer, deckId);
    ctx.json(200, result);
  });
}
