import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  APP_VERSION,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  CARDS_FORMAT,
  CARDS_VERSION
} from './config.js';
import { OPTIONAL_TABLES, TABLES, seedDefaults } from './db.js';
import { createZip, readZip } from './zip.js';
import {
  HttpError,
  isoFileStamp,
  normalize,
  nowISO,
  sanitizeFilename,
  sha256,
  splitTags
} from './util.js';

const NOTE_SKIP_FIELDS = new Set(['search_blob']);
const FILE_ENTRY_RE = /^files\/[A-Za-z0-9._-]{1,160}$/;

function readAllRows(db) {
  const data = {};
  for (const table of TABLES) {
    data[table] = db.prepare(`SELECT * FROM ${table}`).all().map((row) => ({ ...row }));
  }
  return data;
}

function dbHasContent(data) {
  return ['notes', 'cards', 'subjects', 'tasks', 'exams', 'files'].some((t) => (data[t]?.length ?? 0) > 0);
}

function countSummary(data) {
  return {
    semesters: data.semesters?.length ?? 0,
    subjects: data.subjects?.length ?? 0,
    notes: data.notes?.length ?? 0,
    cards: data.cards?.length ?? 0,
    tasks: data.tasks?.length ?? 0,
    documents: (data.files ?? []).filter((f) => f.kind === 'document').length,
    attachments: (data.files ?? []).filter((f) => f.kind === 'attachment').length,
    files: data.files?.length ?? 0,
    reviews: data.reviews?.length ?? 0,
    calendarSources: data.calendar_sources?.length ?? 0,
    calendarEvents: data.calendar_events?.length ?? 0
  };
}

/** Erstellt ein vollständiges ZIP-Backup (Datenbank + Anhänge) als Buffer. */
export function createBackupBundle(db, dirs) {
  const data = readAllRows(db);
  const manifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    appVersion: APP_VERSION,
    createdAt: nowISO(),
    dataFile: 'data.json',
    counts: countSummary(data),
    fileChecksums: {}
  };
  const entries = [];
  for (const file of data.files) {
    const filePath = path.join(dirs.filesDir, path.basename(file.stored_name));
    let buffer;
    try {
      buffer = fs.readFileSync(filePath);
    } catch {
      throw new HttpError(
        500,
        `Die Datei „${file.original_name}“ fehlt im Datenverzeichnis. Backup wurde abgebrochen, damit nichts unbemerkt verloren geht.`
      );
    }
    const hash = sha256(buffer);
    if (file.sha256 && file.sha256 !== hash) {
      throw new HttpError(
        500,
        `Die Datei „${file.original_name}“ ist beschädigt (Prüfsumme weicht ab). Backup abgebrochen.`
      );
    }
    manifest.fileChecksums[file.stored_name] = hash;
    entries.push({
      name: `files/${file.stored_name}`,
      data: buffer,
      compress: !/\.(jpe?g|png|gif|webp|pdf|zip|mp4|mp3)$/i.test(file.stored_name)
    });
  }
  entries.push({ name: 'manifest.json', data: JSON.stringify(manifest, null, 2) });
  entries.push({ name: 'data.json', data: JSON.stringify(data, null, 2) });
  entries.push({
    name: 'README.txt',
    data: [
      'StudyForge – vollständiges Backup',
      `Erstellt: ${manifest.createdAt}`,
      `App-Version: ${APP_VERSION}`,
      '',
      'Diese Datei enthält alle strukturierten Daten (data.json) und alle',
      'Anhänge/Dokumente (Ordner files/). Wiederherstellung in StudyForge',
      'unter „Sichern & Wiederherstellen“ → „Backup einlesen“.',
      '',
      'Wichtig: Nicht einzelne Dateien aus dem Archiv verändern, sonst',
      'schlägt die Prüfsummenkontrolle fehl.'
    ].join('\n')
  });
  return { buffer: createZip(entries), manifest };
}

export function saveSafetyBackup(db, dirs, prefix = 'auto-vor-wiederherstellung') {
  try {
    return writeSafetyBackup(db, dirs, prefix);
  } catch {
    return null;
  }
}

/** Wie saveSafetyBackup, wirft aber, wenn die Sicherung nicht vollständig geschrieben werden kann. */
function writeSafetyBackup(db, dirs, prefix) {
  const { buffer } = createBackupBundle(db, dirs);
  const name = `${prefix}-${isoFileStamp()}.zip`;
  const target = path.join(dirs.backupsDir, name);
  fs.mkdirSync(dirs.backupsDir, { recursive: true });
  fs.writeFileSync(target, buffer, { flag: 'wx' });
  pruneSafetyBackups(dirs.backupsDir, prefix, 10);
  return target;
}

function pruneSafetyBackups(dir, prefix, keep) {
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(`${prefix}-`) && f.endsWith('.zip'))
      .sort();
    for (const file of files.slice(0, Math.max(0, files.length - keep))) {
      fs.unlinkSync(path.join(dir, file));
    }
  } catch {
    /* Aufräumen ist optional */
  }
}

/**
 * Fehlende Tabellen sind ein Fehler – außer Tabellen, die erst in einer
 * späteren Version hinzukamen (Backups älterer Versionen enthalten sie nicht).
 */
function checkTables(data, problems, warnings, label) {
  const missingOptional = [];
  for (const table of TABLES) {
    if (Array.isArray(data[table])) continue;
    data[table] = [];
    if (OPTIONAL_TABLES.has(table)) missingOptional.push(table);
    else problems.push(`Tabelle „${table}“ fehlt im ${label}.`);
  }
  if (missingOptional.length) {
    warnings.push(`${label} stammt aus einer älteren Version ohne Kalenderdaten – der Kalender ist nach der Wiederherstellung leer.`);
  }
}

/** Prüft ein ZIP-Backup vollständig, ohne Daten zu verändern. */
export function inspectBackupZip(buffer) {
  const problems = [];
  const warnings = [];
  let entries;
  try {
    entries = readZip(buffer);
  } catch (err) {
    // Beschädigte Archive sind ein Eingabefehler (400), kein Serverfehler.
    throw new HttpError(400, `Das ZIP-Backup ist beschädigt oder unvollständig: ${err.message}`);
  }
  const manifestRaw = entries.get('manifest.json');
  const dataRaw = entries.get('data.json');
  if (!manifestRaw) throw new HttpError(400, 'Kein gültiges StudyForge-Backup: manifest.json fehlt.');
  if (!dataRaw) throw new HttpError(400, 'Kein gültiges StudyForge-Backup: data.json fehlt.');

  let manifest;
  let data;
  try {
    manifest = JSON.parse(manifestRaw.toString('utf8'));
  } catch {
    throw new HttpError(400, 'manifest.json ist beschädigt (kein gültiges JSON).');
  }
  try {
    data = JSON.parse(dataRaw.toString('utf8'));
  } catch {
    throw new HttpError(400, 'data.json ist beschädigt (kein gültiges JSON).');
  }
  if (manifest?.format !== BACKUP_FORMAT) {
    throw new HttpError(400, 'Das ist kein StudyForge-Backup (Formatkennung stimmt nicht).');
  }
  if (!Number.isInteger(manifest.version) || manifest.version > BACKUP_VERSION) {
    throw new HttpError(400, `Dieses Backup wurde mit einer neueren Version erstellt (Format ${manifest.version}).`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpError(400, 'data.json enthält keine gültigen Daten.');
  }

  checkTables(data, problems, warnings, 'Backup');

  const fileRecords = Array.isArray(data.files) ? data.files : [];
  const files = new Map();
  const seen = new Set();
  for (const record of fileRecords) {
    const stored = String(record.stored_name ?? '');
    if (!FILE_ENTRY_RE.test(`files/${stored}`) || stored.includes('/') || stored.includes('..')) {
      problems.push(`Ungültiger Dateiname im Backup: ${stored || '(leer)'}`);
      continue;
    }
    if (seen.has(stored)) problems.push(`Dateiname doppelt im Backup: ${stored}`);
    seen.add(stored);
    const entry = entries.get(`files/${stored}`);
    if (!entry) {
      problems.push(`Datei fehlt im Archiv: ${record.original_name || stored}`);
      continue;
    }
    const hash = sha256(entry);
    if (record.sha256 && record.sha256 !== hash) {
      problems.push(`Prüfsumme weicht ab: ${record.original_name || stored}`);
      continue;
    }
    if (manifest.fileChecksums && manifest.fileChecksums[stored] && manifest.fileChecksums[stored] !== hash) {
      problems.push(`Prüfsumme laut Manifest weicht ab: ${record.original_name || stored}`);
      continue;
    }
    files.set(stored, entry);
  }
  for (const name of entries.keys()) {
    if (name.startsWith('files/') && !seen.has(name.slice(6))) {
      warnings.push(`Zusätzliche Datei im Archiv, die nicht in den Daten vorkommt: ${name}`);
    }
  }
  const counts = countSummary(data);
  for (const [key, value] of Object.entries(manifest.counts ?? {})) {
    if (Number.isFinite(value) && counts[key] !== undefined && counts[key] !== value) {
      warnings.push(`Anzahl „${key}“ im Manifest (${value}) weicht von den Daten (${counts[key]}) ab.`);
    }
  }

  return {
    ok: problems.length === 0,
    problems,
    warnings,
    manifest,
    data,
    files,
    counts
  };
}

/** Prüft und liest ein JSON-Backup (mit eingebetteten Dateien). */
export function inspectBackupJson(buffer) {
  let parsed;
  try {
    parsed = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new HttpError(400, 'Die JSON-Datei ist beschädigt (kein gültiges JSON).');
  }
  if (parsed?.format !== 'studyforge-data') {
    throw new HttpError(400, 'Das ist kein StudyForge-Datenexport (Formatkennung fehlt).');
  }
  if (!Number.isInteger(parsed.version) || parsed.version > BACKUP_VERSION) {
    throw new HttpError(400, 'Der Datenexport stammt aus einer neueren, nicht unterstützten Version.');
  }
  const data = parsed.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpError(400, 'Der Datenexport enthält keine gültigen Daten.');
  }
  const problems = [];
  const warnings = [];
  checkTables(data, problems, warnings, 'Export');
  const files = new Map();
  for (const item of parsed.binaries ?? []) {
    try {
      const buf = Buffer.from(String(item.data_base64 ?? ''), 'base64');
      const hash = sha256(buf);
      if (item.sha256 && item.sha256 !== hash) {
        problems.push(`Prüfsumme weicht ab: ${item.stored_name}`);
        continue;
      }
      files.set(String(item.stored_name), buf);
    } catch {
      problems.push(`Binärdaten unlesbar: ${item.stored_name}`);
    }
  }
  for (const record of data.files ?? []) {
    if (!files.has(record.stored_name)) problems.push(`Datei fehlt im Export: ${record.original_name || record.stored_name}`);
  }
  return {
    ok: problems.length === 0,
    problems,
    warnings,
    manifest: { format: 'studyforge-data', version: parsed.version, createdAt: parsed.exportedAt, appVersion: parsed.appVersion },
    data,
    files,
    counts: countSummary(data)
  };
}

function tableColumns(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

/** Stellt ein geprüftes Bundle wieder her. Erstellt vorher ein Sicherheitsbackup. */
export async function restoreBundle(db, dirs, bundle) {
  const safety = saveSafetyBackup(db, dirs);

  // Dateien zuerst schreiben (neue UUID-Namen kollidieren nicht mit alten).
  await fsp.mkdir(dirs.filesDir, { recursive: true });
  const restoredNames = new Set();
  for (const [stored, buffer] of bundle.files) {
    const target = path.join(dirs.filesDir, path.basename(stored));
    await fsp.writeFile(target, buffer);
    restoredNames.add(path.basename(stored));
  }

  const existingFileNames = db.prepare('SELECT stored_name FROM files').all().map((r) => r.stored_name);
  db.exec('PRAGMA foreign_keys = OFF;');
  try {
    db.exec('BEGIN IMMEDIATE;');
    for (const table of [...TABLES].reverse()) {
      db.exec(`DELETE FROM ${table}`);
    }

    for (const table of TABLES) {
      const rows = bundle.data[table] ?? [];
      const columns = tableColumns(db, table);
      for (const row of rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
          throw new HttpError(400, `Ungültiger Datensatz in Tabelle ${table}.`);
        }
        const used = columns.filter((col) => Object.prototype.hasOwnProperty.call(row, col));
        if (!used.length) continue;
        const sql = `INSERT INTO ${table} (${used.map((c) => `"${c}"`).join(', ')}) VALUES (${used.map(() => '?').join(', ')})`;
        const values = used.map((col) => {
          const value = row[col];
          if (value === null || value === undefined) return null;
          if (typeof value === 'number' || typeof value === 'string') return value;
          if (typeof value === 'boolean') return value ? 1 : 0;
          return JSON.stringify(value);
        });
        db.prepare(sql).run(...values);
      }
    }

    const violations = db.prepare('PRAGMA foreign_key_check').all();
    if (violations.length) {
      throw new HttpError(400, 'Die Daten enthalten ungültige Verweise und wurden nicht übernommen.');
    }
    db.exec('COMMIT;');
    // Auto-Increment-Zähler an die höchste ID angleichen.
    for (const table of TABLES) {
      const hasAutoInc = db
        .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`)
        .get(table)?.sql?.includes('AUTOINCREMENT');
      if (!hasAutoInc) continue;
      const maxRow = db.prepare(`SELECT MAX(id) AS m FROM ${table}`).get();
      if (maxRow?.m) {
        db.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run(table);
        db.prepare('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)').run(table, maxRow.m);
      }
    }
    db.exec('PRAGMA foreign_keys = ON;');
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      /* Transaktion war ggf. schon beendet */
    }
    db.exec('PRAGMA foreign_keys = ON;');
    throw err;
  }

  // Nicht mehr referenzierte alte Dateien entfernen.
  for (const name of existingFileNames) {
    if (!restoredNames.has(name)) {
      try {
        await fsp.unlink(path.join(dirs.filesDir, path.basename(name)));
      } catch {
        /* Datei war schon weg */
      }
    }
  }

  return {
    counts: bundle.counts,
    safetyBackup: safety ? path.basename(safety) : null
  };
}

export const RESET_CONFIRM_WORD = 'ZURÜCKSETZEN';

/**
 * Setzt StudyForge zurück.
 * - scope 'settings': nur Einstellungen auf Standardwerte, Inhalte bleiben.
 * - scope 'all': löscht alle Inhalte und Anhänge. Vorher wird ein
 *   vollständiges ZIP-Backup geschrieben; scheitert es, wird nichts gelöscht.
 */
export async function resetData(db, dirs, scope) {
  if (scope === 'settings') {
    db.exec('BEGIN IMMEDIATE;');
    try {
      db.exec('DELETE FROM settings');
      seedDefaults(db);
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
    return { scope, safetyBackup: null };
  }
  if (scope !== 'all') throw new HttpError(400, 'Unbekannte Art des Zurücksetzens.');

  let safety;
  try {
    safety = writeSafetyBackup(db, dirs, 'auto-vor-zuruecksetzen');
  } catch (err) {
    throw new HttpError(
      500,
      `Vor dem Zurücksetzen konnte keine vollständige Sicherung erstellt werden. Es wurde nichts gelöscht. ${err instanceof HttpError ? err.message : ''}`.trim()
    );
  }

  const storedNames = db.prepare('SELECT stored_name FROM files').all().map((r) => r.stored_name);
  db.exec('PRAGMA foreign_keys = OFF;');
  try {
    db.exec('BEGIN IMMEDIATE;');
    for (const table of [...TABLES].reverse()) db.exec(`DELETE FROM ${table}`);
    const sequence = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'").get();
    if (sequence) db.exec('DELETE FROM sqlite_sequence');
    seedDefaults(db);
    db.exec('COMMIT;');
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      /* Transaktion war ggf. schon beendet */
    }
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }

  // Nur Dateien entfernen, die zu StudyForge-Datensätzen gehörten.
  for (const name of storedNames) {
    try {
      await fsp.unlink(path.join(dirs.filesDir, path.basename(name)));
    } catch {
      /* Datei war schon weg */
    }
  }
  return { scope, safetyBackup: path.basename(safety) };
}

export function exportJson(db, dirs) {
  const data = readAllRows(db);
  const binaries = [];
  for (const record of data.files) {
    const filePath = path.join(dirs.filesDir, path.basename(record.stored_name));
    let buffer;
    try {
      buffer = fs.readFileSync(filePath);
    } catch {
      throw new HttpError(500, `Datei fehlt: ${record.original_name}. Export abgebrochen.`);
    }
    const hash = sha256(buffer);
    if (record.sha256 && record.sha256 !== hash) {
      throw new HttpError(500, `Datei beschädigt: ${record.original_name}. Export abgebrochen.`);
    }
    binaries.push({ stored_name: record.stored_name, original_name: record.original_name, sha256: hash, data_base64: buffer.toString('base64') });
  }
  return Buffer.from(
    JSON.stringify(
      {
        format: 'studyforge-data',
        version: BACKUP_VERSION,
        appVersion: APP_VERSION,
        exportedAt: nowISO(),
        counts: countSummary(data),
        note: 'Vollständiger Datenexport inklusive Anhängen und Dokumenten (Base64). Wiederherstellung über „Sichern & Wiederherstellen“.',
        data,
        binaries
      },
      null,
      2
    ),
    'utf8'
  );
}

function mdEscape(text) {
  return String(text ?? '').replace(/^\s*---\s*$/gm, '\\---');
}

export function exportMarkdownZip(db, dirs) {
  const notes = db
    .prepare(
      `SELECT n.*, s.name AS subject_name FROM notes n
       LEFT JOIN subjects s ON s.id = n.subject_id
       WHERE n.deleted_at IS NULL ORDER BY s.name, n.title`
    )
    .all();
  const subjects = db.prepare('SELECT * FROM subjects ORDER BY position, name').all();
  const files = db.prepare('SELECT * FROM files ORDER BY id').all();
  const tagRows = db
    .prepare('SELECT nt.note_id, t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id ORDER BY t.name')
    .all();
  const tagsByNote = new Map();
  for (const row of tagRows) {
    if (!tagsByNote.has(row.note_id)) tagsByNote.set(row.note_id, []);
    tagsByNote.get(row.note_id).push(row.name);
  }

  const entries = [];
  let noteCount = 0;
  for (const note of notes) {
    const folder = sanitizeFilename(note.subject_name || 'Ohne Fach', 'Ohne Fach');
    const base = sanitizeFilename(note.title || `Notiz ${note.id}`, `Notiz ${note.id}`);
    const fileName = `Notizen/${folder}/${base}.md`;
    const tags = tagsByNote.get(note.id) ?? [];
    const meta = [
      '---',
      `title: ${JSON.stringify(note.title)}`,
      `subject: ${JSON.stringify(note.subject_name || '')}`,
      `topic: ${JSON.stringify(note.topic || '')}`,
      `tags: [${tags.map((t) => JSON.stringify(t)).join(', ')}]`,
      `created: ${note.created_at}`,
      `updated: ${note.updated_at}`,
      `studyforge-id: ${note.id}`,
      '---',
      ''
    ].join('\n');
    const attachments = files.filter((f) => f.kind === 'attachment' && f.note_id === note.id);
    const attachmentText = attachments.length
      ? `\n\n## Anhänge\n${attachments
          .map((f) => {
            const safe = sanitizeFilename(f.original_name, `Datei-${f.id}`);
            entries.push({ name: `Anhänge/${note.id}-${safe}`, data: fs.readFileSync(path.join(dirs.filesDir, path.basename(f.stored_name))) });
            return `- [${f.original_name}](../Anh%C3%A4nge/${encodeURIComponent(`${note.id}-${safe}`)})`;
          })
          .join('\n')}`
      : '';
    entries.push({ name: fileName, data: meta + mdEscape(note.content) + attachmentText + '\n' });
    noteCount += 1;
  }

  const fileOwner = new Map(files.map((f) => [f.id, f]));
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
  const documents = files.filter((f) => f.kind === 'document');
  for (const doc of documents) {
    const buffer = fs.readFileSync(path.join(dirs.filesDir, path.basename(doc.stored_name)));
    const folder = sanitizeFilename(subjectName.get(doc.subject_id) || 'Ohne Fach', 'Ohne Fach');
    const name = sanitizeFilename(doc.original_name, `Dokument-${doc.id}`);
    entries.push({ name: `Dokumente/${folder}/${name}`, data: buffer });
  }
  void fileOwner;

  entries.push({
    name: 'README.md',
    data: [
      '# StudyForge – Markdown-Export',
      '',
      `Exportiert am ${new Date().toLocaleString('de-DE')}.`,
      '',
      `- ${noteCount} Notizen unter \`Notizen/<Fach>/<Titel>.md\``,
      `- ${documents.length} Dokumente unter \`Dokumente/<Fach>/\``,
      '- Anhänge unter `Anhänge/` (Dateinamen mit Notiz-ID als Präfix)',
      '',
      'Die Markdown-Dateien enthalten YAML-Frontmatter. Wikilinks `[[Titel]]`',
      'bleiben als Text erhalten. Dieser Export ist zum Lesen/Archivieren gedacht;',
      'für eine vollständige Wiederherstellung bitte das ZIP-Backup verwenden.',
      'Schreibgeschützte Originaldateien wurden nicht verändert.'
    ].join('\n')
  });

  return { buffer: createZip(entries), noteCount, documentCount: documents.length };
}

export function exportCards(db, deckId = null) {
  const decks = db
    .prepare('SELECT * FROM decks' + (deckId ? ' WHERE id = ?' : '') + ' ORDER BY name')
    .all(...(deckId ? [deckId] : []));
  const deckIds = new Set(decks.map((d) => d.id));
  const cards = db
    .prepare('SELECT * FROM cards ORDER BY id')
    .all()
    .filter((c) => !deckId || deckIds.has(c.deck_id));
  return Buffer.from(
    JSON.stringify(
      {
        format: CARDS_FORMAT,
        version: CARDS_VERSION,
        exportedAt: nowISO(),
        note: 'Karteninhalt und Planungsstand. Import erfolgt in einen gewählten Stapel; die Planung wird dabei zurückgesetzt.',
        decks: decks.map((d) => ({ name: d.name, subject_id: d.subject_id, description: d.description })),
        cards: cards.map((c) => ({
          deck: decks.find((d) => d.id === c.deck_id)?.name ?? '',
          type: c.type,
          front: c.front,
          back: c.back,
          options: JSON.parse(c.options || '[]'),
          correct_index: c.correct_index,
          explanation: c.explanation,
          topic: c.topic,
          tags: splitTags(c.tags),
          scheduling: {
            state: c.state,
            due: c.due,
            stability: c.stability,
            difficulty: c.difficulty,
            reps: c.reps,
            lapses: c.lapses,
            last_review: c.last_review
          }
        }))
      },
      null,
      2
    ),
    'utf8'
  );
}

const CARD_TYPES = new Set(['qa', 'definition', 'cloze', 'truefalse', 'mc', 'code']);

export function importCardsJson(db, rawBuffer, deckId) {
  let parsed;
  try {
    parsed = JSON.parse(rawBuffer.toString('utf8'));
  } catch {
    throw new HttpError(400, 'Die Kartendatei ist kein gültiges JSON.');
  }
  if (parsed?.format !== CARDS_FORMAT) {
    throw new HttpError(400, `Unbekanntes Kartenformat (erwartet: ${CARDS_FORMAT}).`);
  }
  if (!Array.isArray(parsed.cards)) throw new HttpError(400, 'Die Kartendatei enthält keine Kartenliste.');
  const deck = db.prepare('SELECT * FROM decks WHERE id = ?').get(deckId);
  if (!deck) throw new HttpError(400, 'Ziel-Stapel wurde nicht gefunden.');
  if (parsed.cards.length > 20000) throw new HttpError(400, 'Zu viele Karten auf einmal (max. 20000).');
  const ts = nowISO();
  const insert = db.prepare(
    `INSERT INTO cards (deck_id, type, front, back, options, correct_index, explanation, topic, tags, state, due, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', NULL, ?, ?)`
  );
  let imported = 0;
  const errors = [];
  db.exec('BEGIN IMMEDIATE;');
  try {
    parsed.cards.forEach((card, index) => {
      const front = String(card?.front ?? '').trim();
      const back = String(card?.back ?? '').trim();
      const type = CARD_TYPES.has(card?.type) ? card.type : 'qa';
      if (!front || !back) {
        errors.push(`Karte ${index + 1}: Vorder- oder Rückseite fehlt.`);
        return;
      }
      const options = Array.isArray(card.options) ? card.options.map(String).slice(0, 8) : [];
      insert.run(
        deckId,
        type,
        front.slice(0, 20000),
        back.slice(0, 20000),
        JSON.stringify(options),
        Number.isInteger(card.correct_index) ? card.correct_index : null,
        String(card.explanation ?? '').slice(0, 10000),
        String(card.topic ?? '').slice(0, 200),
        splitTags(card.tags).join(', '),
        ts,
        ts
      );
      imported += 1;
    });
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
  return { imported, skipped: errors.length, errors: errors.slice(0, 20), deck: deck.name };
}

export function searchPreview(db, query, limit = 5) {
  const q = normalize(query);
  if (!q) return null;
  const notes = db
    .prepare(
      `SELECT id, title, updated_at FROM notes
       WHERE deleted_at IS NULL AND search_blob LIKE ? ORDER BY updated_at DESC LIMIT ?`
    )
    .all(`%${q}%`, limit);
  return { notes };
}
