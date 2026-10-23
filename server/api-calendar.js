import { IcsError, EVENT_CATEGORIES, ICS_LIMITS, parseIcs } from './ics.js';
import { HttpError, clampText, normalize, nowISO, sanitizeFilename, sha256, toInt } from './util.js';
import { assertTitle, requireRow } from './api-shared.js';
import { examPayload } from './api-organize.js';

/*
 * Kalender: Quellen (importierte .ics-Dateien), Termine und die Verknüpfung
 * zu Prüfungen. Grundsätze:
 *  - Importierte Felder werden nur durch einen erneuten Import geändert.
 *  - Ein erneuter Import ändert nie Prüfungen, Notizen oder Lernstände.
 *  - Termine, die in der Datei fehlen, werden nur gelöscht, wenn keine
 *    Prüfung auf sie verweist; verknüpfte bleiben als „entfernt“ markiert.
 *  - Quelle entfernen und Prüfung löschen sind getrennte Vorgänge.
 */

const EVENT_SELECT = `SELECT ce.*, cs.name AS source_name, e.id AS exam_id, e.title AS exam_title, e.date AS exam_date,
    e.start_time AS exam_start_time
  FROM calendar_events ce
  JOIN calendar_sources cs ON cs.id = ce.source_id
  LEFT JOIN exams e ON e.calendar_event_id = ce.id`;

function serializeEvent(row) {
  if (!row) return null;
  const parse = (value, fallback) => {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  };
  return {
    ...row,
    all_day: Boolean(row.all_day),
    is_exception: Boolean(row.is_exception),
    category_manual: Boolean(row.category_manual),
    attendees: parse(row.attendees, []),
    alarms: parse(row.alarms, [])
  };
}

function getEvent(db, id) {
  const row = db.prepare(`${EVENT_SELECT} WHERE ce.id = ?`).get(toInt(id));
  if (!row) throw new HttpError(404, 'Kalendertermin wurde nicht gefunden.');
  return serializeEvent(row);
}

/** Liest die hochgeladene Datei; zu große Dateien werden vor dem Lesen abgelehnt. */
async function readIcsBody(ctx) {
  const declared = Number(ctx.req.headers['content-length']);
  const limitMb = Math.round(ICS_LIMITS.maxBytes / 1024 / 1024);
  if (Number.isFinite(declared) && declared > ICS_LIMITS.maxBytes) {
    ctx.res.setHeader('Connection', 'close');
    throw new HttpError(413, `Die Kalenderdatei ist zu groß (max. ${limitMb} MB). Es wurde nichts gespeichert.`);
  }
  return ctx.body(ICS_LIMITS.maxBytes);
}

function parseUpload(buffer) {
  try {
    return parseIcs(buffer);
  } catch (err) {
    if (err instanceof IcsError) throw new HttpError(400, err.message);
    throw new HttpError(400, `Die Kalenderdatei konnte nicht gelesen werden: ${err.message}`);
  }
}

/** Schlägt eine vorhandene Quelle vor, wenn dieselbe Datei/derselbe Kalender erneut kommt. */
function suggestSource(db, parsed, filename) {
  const sources = db.prepare('SELECT * FROM calendar_sources ORDER BY id').all();
  if (!sources.length) return null;
  const uids = [...new Set(parsed.instances.map((instance) => instance.uid))];
  let best = null;
  for (const source of sources) {
    let score = 0;
    const reasons = [];
    if (filename && source.filename && source.filename.toLowerCase() === filename.toLowerCase()) {
      score += 2;
      reasons.push('gleicher Dateiname');
    }
    if (parsed.calendarName && source.calendar_name && source.calendar_name === parsed.calendarName) {
      score += 2;
      reasons.push('gleicher Kalendername');
    }
    if (uids.length) {
      const sample = uids.slice(0, 500);
      const known = db
        .prepare(`SELECT COUNT(DISTINCT uid) AS c FROM calendar_events WHERE source_id = ? AND uid IN (${sample.map(() => '?').join(',')})`)
        .get(source.id, ...sample).c;
      if (known / sample.length >= 0.5) {
        score += 3;
        reasons.push(`${known} von ${sample.length} Terminen bereits vorhanden`);
      }
    }
    if (score >= 2 && (!best || score > best.score)) best = { id: source.id, name: source.name, score, reasons };
  }
  return best;
}

function isNewer(a, b) {
  return a && b && a > b;
}

/**
 * Vergleicht die Datei mit dem Bestand. Liefert je Vorkommen eine Aktion:
 * insert | update | unchanged | older (Bestand ist neuer) | duplicate (andere Quelle)
 * sowie die Termine, die in der Datei nicht mehr vorkommen.
 */
function planImport(db, parsed, sourceId) {
  const existing = new Map();
  if (sourceId) {
    for (const row of db
      .prepare(
        `SELECT ce.id, ce.uid, ce.recurrence_id, ce.content_hash, ce.sequence, ce.last_modified, ce.removed_at, ce.start, ce.rrule,
          ce.category, ce.category_manual, e.id AS exam_id
         FROM calendar_events ce LEFT JOIN exams e ON e.calendar_event_id = ce.id WHERE ce.source_id = ?`
      )
      .all(sourceId)) {
      existing.set(`${row.uid}\u0000${row.recurrence_id}`, row);
    }
  }
  const otherSource = db.prepare(
    `SELECT cs.name FROM calendar_events ce JOIN calendar_sources cs ON cs.id = ce.source_id
     WHERE ce.uid = ? AND ce.recurrence_id = ? AND ce.source_id != ? LIMIT 1`
  );
  const actions = [];
  const seen = new Set();
  const counts = { insert: 0, update: 0, unchanged: 0, older: 0, duplicate: 0, remove: 0, keepLinked: 0 };
  for (const instance of parsed.instances) {
    const key = `${instance.uid}\u0000${instance.recurrenceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const current = existing.get(key);
    let action;
    let duplicateOf = null;
    if (current) {
      if (current.content_hash === instance.contentHash && !current.removed_at) action = 'unchanged';
      else if (
        (instance.sequence < current.sequence) ||
        (instance.sequence === current.sequence && isNewer(current.last_modified, instance.lastModified))
      ) {
        action = 'older';
      } else action = 'update';
    } else {
      const other = otherSource.get(instance.uid, instance.recurrenceId, sourceId ?? 0);
      if (other) {
        action = 'duplicate';
        duplicateOf = other.name;
      } else action = 'insert';
    }
    counts[action] += 1;
    actions.push({ instance, action, existingId: current?.id ?? null, duplicateOf, current });
  }

  // In der Datei nicht mehr enthaltene Termine der Zielquelle.
  const fileUids = new Set(parsed.instances.map((instance) => instance.uid));
  const windowStart = parsed.window.start;
  const missing = [];
  for (const [key, row] of existing) {
    if (seen.has(key) || row.removed_at) continue;
    // Ältere Vorkommen einer weiterhin vorhandenen Serie liegen nur außerhalb
    // des Übernahmezeitraums – sie wurden nicht gelöscht.
    if (row.rrule && fileUids.has(row.uid) && row.start < windowStart) continue;
    missing.push(row);
    if (row.exam_id) counts.keepLinked += 1;
    else counts.remove += 1;
  }
  return { actions, missing, counts };
}

function previewItems(parsed, plan) {
  const byKey = new Map(plan.actions.map((entry) => [`${entry.instance.uid}\u0000${entry.instance.recurrenceId}`, entry]));
  return parsed.items.slice(0, 1000).map((item) => {
    const statuses = {};
    let duplicateOf = null;
    for (const rid of item.recurrenceIds) {
      const entry = byKey.get(`${item.uid}\u0000${rid}`);
      if (!entry) continue;
      statuses[entry.action] = (statuses[entry.action] ?? 0) + 1;
      duplicateOf ??= entry.duplicateOf;
    }
    const { recurrenceIds, ...rest } = item;
    void recurrenceIds;
    return { ...rest, statuses, duplicateOf };
  });
}

function eventValues(instance) {
  return [
    instance.summary,
    instance.description,
    instance.location,
    instance.start,
    instance.end,
    instance.allDay ? 1 : 0,
    instance.tzid,
    instance.status,
    instance.rrule,
    instance.isException ? 1 : 0,
    instance.organizer,
    JSON.stringify(instance.attendees),
    JSON.stringify(instance.alarms),
    instance.categories,
    instance.sequence,
    instance.lastModified,
    instance.contentHash
  ];
}

function applyImport(db, parsed, plan, { sourceId, name, filename, fileHash }) {
  const ts = nowISO();
  const result = { ...plan.counts, sourceId: null };
  db.exec('BEGIN IMMEDIATE;');
  try {
    let id = sourceId;
    if (!id) {
      id = Number(
        db
          .prepare(
            `INSERT INTO calendar_sources (name, filename, calendar_name, prodid, sha256, event_count, last_import_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`
          )
          .run(name, filename, parsed.calendarName, parsed.prodid, fileHash, ts, ts, ts).lastInsertRowid
      );
    } else {
      db.prepare(
        `UPDATE calendar_sources SET filename = ?, calendar_name = ?, prodid = ?, sha256 = ?, last_import_at = ?, updated_at = ? WHERE id = ?`
      ).run(filename, parsed.calendarName, parsed.prodid, fileHash, ts, ts, id);
    }
    const insert = db.prepare(
      `INSERT INTO calendar_events (source_id, uid, recurrence_id, summary, description, location, start, end, all_day, tzid, status,
         rrule, is_exception, organizer, attendees, alarms, categories, sequence, last_modified, content_hash, category, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const update = db.prepare(
      `UPDATE calendar_events SET summary = ?, description = ?, location = ?, start = ?, end = ?, all_day = ?, tzid = ?, status = ?,
         rrule = ?, is_exception = ?, organizer = ?, attendees = ?, alarms = ?, categories = ?, sequence = ?, last_modified = ?,
         content_hash = ?, category = CASE WHEN category_manual = 1 THEN category ELSE ? END, removed_at = NULL, updated_at = ?
       WHERE id = ?`
    );
    for (const entry of plan.actions) {
      const { instance } = entry;
      if (entry.action === 'insert') {
        insert.run(id, instance.uid, instance.recurrenceId, ...eventValues(instance), instance.category, ts, ts);
      } else if (entry.action === 'update') {
        update.run(...eventValues(instance), instance.category, ts, entry.existingId);
      }
    }
    const markRemoved = db.prepare('UPDATE calendar_events SET removed_at = ?, updated_at = ? WHERE id = ?');
    const remove = db.prepare('DELETE FROM calendar_events WHERE id = ?');
    for (const row of plan.missing) {
      if (row.exam_id) markRemoved.run(ts, ts, row.id);
      else remove.run(row.id);
    }
    const count = db.prepare('SELECT COUNT(*) AS c FROM calendar_events WHERE source_id = ?').get(id).c;
    db.prepare('UPDATE calendar_sources SET event_count = ? WHERE id = ?').run(count, id);
    db.exec('COMMIT;');
    result.sourceId = id;
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
  return result;
}

function sourceRows(db) {
  return db
    .prepare(
      `SELECT cs.*,
        (SELECT COUNT(*) FROM calendar_events ce WHERE ce.source_id = cs.id) AS event_count,
        (SELECT COUNT(*) FROM calendar_events ce JOIN exams e ON e.calendar_event_id = ce.id WHERE ce.source_id = cs.id) AS linked_exams,
        (SELECT COUNT(*) FROM calendar_events ce WHERE ce.source_id = cs.id AND ce.removed_at IS NOT NULL) AS removed_events
       FROM calendar_sources cs ORDER BY cs.name COLLATE NOCASE`
    )
    .all();
}

/** Lokales Datum eines gespeicherten Zeitpunkts (Server läuft auf demselben Rechner). */
function localDate(value, allDay) {
  if (allDay) return String(value).slice(0, 10);
  const date = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const GENERIC_WORDS = new Set([
  'pruefung', 'prufung', 'klausur', 'exam', 'semesterpruefung', 'semesterprufung', 'modulpruefung', 'modulprufung',
  'termin', 'schriftlich', 'muendlich', 'mundlich', 'test', 'der', 'die', 'das', 'und', 'fuer', 'fur', 'zur', 'zum', 'im', 'in', 'am'
]);

function titleWords(text) {
  return new Set(
    normalize(text)
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 3 && !GENERIC_WORDS.has(word))
  );
}

/**
 * Unverbindliche Vorschläge Prüfung ↔ Termin. Bedingung: gleiches Datum UND
 * mindestens ein gemeinsames, nicht-generisches Titelwort – oder gleiches
 * Datum und der Termin ist als Prüfung erkannt. Nie automatische Verknüpfung.
 */
export function linkSuggestions(db, limit = 20) {
  const exams = db
    .prepare('SELECT e.*, s.name AS subject_name FROM exams e LEFT JOIN subjects s ON s.id = e.subject_id WHERE e.calendar_event_id IS NULL')
    .all();
  if (!exams.length) return [];
  const events = db
    .prepare(
      `SELECT ce.id, ce.summary, ce.start, ce.end, ce.all_day, ce.location, ce.category, cs.name AS source_name
       FROM calendar_events ce JOIN calendar_sources cs ON cs.id = ce.source_id
       WHERE ce.removed_at IS NULL AND ce.status != 'CANCELLED'
         AND NOT EXISTS (SELECT 1 FROM exams e WHERE e.calendar_event_id = ce.id)`
    )
    .all();
  const byDate = new Map();
  for (const event of events) {
    const date = localDate(event.start, event.all_day);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(event);
  }
  const suggestions = [];
  for (const exam of exams) {
    if (!exam.date) continue;
    const examWords = titleWords(`${exam.title} ${exam.subject_name ?? ''}`);
    for (const event of byDate.get(exam.date) ?? []) {
      const shared = [...titleWords(event.summary)].filter((word) => examWords.has(word));
      const reasons = ['gleiches Datum'];
      if (shared.length) reasons.push(`gemeinsame Begriffe: ${shared.slice(0, 3).join(', ')}`);
      if (event.category === 'pruefung') reasons.push('Termin ist als Prüfung erkannt');
      if (!shared.length && event.category !== 'pruefung') continue;
      suggestions.push({
        exam_id: exam.id,
        exam_title: exam.title,
        exam_date: exam.date,
        event_id: event.id,
        event_summary: event.summary,
        event_start: event.start,
        event_all_day: Boolean(event.all_day),
        event_location: event.location,
        source_name: event.source_name,
        score: shared.length * 2 + (event.category === 'pruefung' ? 1 : 0),
        reasons
      });
    }
  }
  return suggestions.sort((a, b) => b.score - a.score).slice(0, limit);
}

function linkExam(db, eventId, examId, { replace = false } = {}) {
  const event = getEvent(db, eventId);
  const exam = requireRow(db, 'exams', examId, 'Prüfung');
  if (exam.calendar_event_id === event.id) return;
  if (exam.calendar_event_id && !replace) {
    throw new HttpError(409, `„${exam.title}“ ist bereits mit einem anderen Kalendertermin verknüpft. Erst die bestehende Verknüpfung ändern.`);
  }
  if (event.exam_id && event.exam_id !== exam.id && !replace) {
    throw new HttpError(409, `Dieser Termin ist bereits mit der Prüfung „${event.exam_title}“ verknüpft.`);
  }
  db.exec('BEGIN IMMEDIATE;');
  try {
    // Nur die Verknüpfung ändern – keine Prüfungsinhalte, kein Datum.
    db.prepare('UPDATE exams SET calendar_event_id = NULL WHERE calendar_event_id = ? AND id != ?').run(event.id, exam.id);
    db.prepare('UPDATE exams SET calendar_event_id = ? WHERE id = ?').run(event.id, exam.id);
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

export function registerCalendarRoutes(router) {
  router.add('POST', '/api/calendar/preview', async (ctx) => {
    const buffer = await readIcsBody(ctx);
    const filename = sanitizeFilename(ctx.query.get('filename') || 'kalender.ics', 'kalender.ics');
    const parsed = parseUpload(buffer);
    const suggested = suggestSource(ctx.db, parsed, filename);
    const requested = ctx.query.get('source_id');
    let sourceId = suggested?.id ?? null;
    if (requested === 'new') sourceId = null;
    else if (requested) sourceId = requireRow(ctx.db, 'calendar_sources', requested, 'Kalenderquelle').id;
    const plan = planImport(ctx.db, parsed, sourceId);
    ctx.json(200, {
      filename,
      sha256: sha256(buffer),
      calendarName: parsed.calendarName,
      encoding: parsed.encoding,
      recovered: parsed.recovered,
      suggestedSource: suggested,
      sourceId,
      sources: sourceRows(ctx.db).map((s) => ({ id: s.id, name: s.name, event_count: s.event_count })),
      counts: { ...plan.counts, items: parsed.items.length, instances: parsed.instances.length },
      items: previewItems(parsed, plan),
      itemsTruncated: parsed.items.length > 1000,
      missing: plan.missing.slice(0, 200).map((row) => ({ id: row.id, uid: row.uid, start: row.start, linked: Boolean(row.exam_id) })),
      errors: parsed.errors,
      warnings: parsed.warnings,
      window: parsed.window
    });
  });

  router.add('POST', '/api/calendar/import', async (ctx) => {
    const buffer = await readIcsBody(ctx);
    const filename = sanitizeFilename(ctx.query.get('filename') || 'kalender.ics', 'kalender.ics');
    const parsed = parseUpload(buffer);
    if (!parsed.instances.length) {
      throw new HttpError(400, 'In der Datei wurde kein importierbarer Termin gefunden. Es wurde nichts gespeichert.');
    }
    const requested = ctx.query.get('source_id');
    let sourceId = null;
    if (requested && requested !== 'new') sourceId = requireRow(ctx.db, 'calendar_sources', requested, 'Kalenderquelle').id;
    const name = clampText(ctx.query.get('name') || '', 200, 'Name der Quelle').trim() ||
      parsed.calendarName || filename.replace(/\.ics$/i, '');
    const plan = planImport(ctx.db, parsed, sourceId);
    const result = applyImport(ctx.db, parsed, plan, { sourceId, name, filename, fileHash: sha256(buffer) });
    ctx.json(200, {
      ok: true,
      ...result,
      source: ctx.db.prepare('SELECT * FROM calendar_sources WHERE id = ?').get(result.sourceId),
      errors: parsed.errors,
      warnings: parsed.warnings
    });
  });

  router.add('GET', '/api/calendar/sources', (ctx) => {
    ctx.json(200, sourceRows(ctx.db));
  });

  router.add('PATCH', '/api/calendar/sources/:id', async (ctx) => {
    const source = requireRow(ctx.db, 'calendar_sources', ctx.params.id, 'Kalenderquelle');
    const body = await ctx.jsonBody();
    const name = assertTitle(body.name, 'Name der Quelle', 200);
    ctx.db.prepare('UPDATE calendar_sources SET name = ?, updated_at = ? WHERE id = ?').run(name, nowISO(), source.id);
    ctx.json(200, ctx.db.prepare('SELECT * FROM calendar_sources WHERE id = ?').get(source.id));
  });

  // Entfernt die Quelle samt Terminen. Prüfungen bleiben vollständig erhalten;
  // nur ihre Kalenderverknüpfung entfällt (ON DELETE SET NULL).
  router.add('DELETE', '/api/calendar/sources/:id', (ctx) => {
    const source = requireRow(ctx.db, 'calendar_sources', ctx.params.id, 'Kalenderquelle');
    const unlinked = ctx.db
      .prepare('SELECT COUNT(*) AS c FROM exams e JOIN calendar_events ce ON ce.id = e.calendar_event_id WHERE ce.source_id = ?')
      .get(source.id).c;
    const events = ctx.db.prepare('SELECT COUNT(*) AS c FROM calendar_events WHERE source_id = ?').get(source.id).c;
    ctx.db.prepare('DELETE FROM calendar_sources WHERE id = ?').run(source.id);
    ctx.json(200, { ok: true, removedEvents: events, unlinkedExams: unlinked });
  });

  router.add('GET', '/api/calendar/events', (ctx) => {
    const from = ctx.query.get('from');
    const to = ctx.query.get('to');
    const where = [];
    const params = [];
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (from) {
      if (!datePattern.test(from)) throw new HttpError(400, 'from muss das Format JJJJ-MM-TT haben.');
      // Puffer von einem Tag: Zeitpunkte sind in UTC gespeichert.
      where.push('substr(ce.end, 1, 10) >= date(?, \'-1 day\')');
      params.push(from);
    }
    if (to) {
      if (!datePattern.test(to)) throw new HttpError(400, 'to muss das Format JJJJ-MM-TT haben.');
      where.push('substr(ce.start, 1, 10) <= date(?, \'+1 day\')');
      params.push(to);
    }
    if (ctx.query.get('source_id')) {
      where.push('ce.source_id = ?');
      params.push(toInt(ctx.query.get('source_id')));
    }
    if (ctx.query.get('category')) {
      where.push('ce.category = ?');
      params.push(ctx.query.get('category'));
    }
    if (ctx.query.get('unlinked') === '1') where.push('e.id IS NULL');
    const limit = Math.min(5000, Math.max(1, toInt(ctx.query.get('limit'), 2000)));
    const words = normalize(ctx.query.get('q') || '').split(' ').filter(Boolean).slice(0, 6);
    let rows = ctx.db
      .prepare(`${EVENT_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ce.start, ce.id${words.length ? '' : ' LIMIT ?'}`)
      .all(...params, ...(words.length ? [] : [limit]));
    if (words.length) {
      // Umlautunabhängig wie die globale Suche („Prufung“ findet „Prüfung“).
      rows = rows
        .filter((row) => {
          const haystack = normalize(`${row.summary} ${row.location} ${row.description} ${row.source_name}`);
          return words.every((word) => haystack.includes(word));
        })
        .slice(0, limit);
    }
    ctx.json(200, rows.map(serializeEvent));
  });

  router.add('GET', '/api/calendar/events/:id', (ctx) => {
    ctx.json(200, getEvent(ctx.db, ctx.params.id));
  });

  // Eigene Einordnung (Prüfung/Abgabe/…) – bleibt bei erneutem Import erhalten.
  router.add('PATCH', '/api/calendar/events/:id', async (ctx) => {
    const event = getEvent(ctx.db, ctx.params.id);
    const body = await ctx.jsonBody();
    if (body.category === null || body.category === 'auto') {
      ctx.db.prepare('UPDATE calendar_events SET category_manual = 0, updated_at = ? WHERE id = ?').run(nowISO(), event.id);
    } else {
      if (!EVENT_CATEGORIES.includes(body.category)) throw new HttpError(400, 'Unbekannte Terminart.');
      ctx.db
        .prepare('UPDATE calendar_events SET category = ?, category_manual = 1, updated_at = ? WHERE id = ?')
        .run(body.category, nowISO(), event.id);
    }
    ctx.json(200, getEvent(ctx.db, event.id));
  });

  // Einzelnen Termin entfernen (z. B. „in der Quelle entfernt“). Prüfungen bleiben.
  router.add('DELETE', '/api/calendar/events/:id', (ctx) => {
    const event = getEvent(ctx.db, ctx.params.id);
    ctx.db.prepare('DELETE FROM calendar_events WHERE id = ?').run(event.id);
    ctx.db
      .prepare('UPDATE calendar_sources SET event_count = (SELECT COUNT(*) FROM calendar_events WHERE source_id = ?) WHERE id = ?')
      .run(event.source_id, event.source_id);
    ctx.json(200, { ok: true, unlinkedExam: event.exam_id ?? null });
  });

  router.add('POST', '/api/calendar/events/:id/link', async (ctx) => {
    const body = await ctx.jsonBody();
    const examId = toInt(body.exam_id);
    if (!examId) throw new HttpError(400, 'Bitte eine Prüfung auswählen.');
    linkExam(ctx.db, ctx.params.id, examId, { replace: body.replace === true });
    ctx.json(200, getEvent(ctx.db, ctx.params.id));
  });

  router.add('DELETE', '/api/calendar/events/:id/link', (ctx) => {
    const event = getEvent(ctx.db, ctx.params.id);
    ctx.db.prepare('UPDATE exams SET calendar_event_id = NULL WHERE calendar_event_id = ?').run(event.id);
    ctx.json(200, getEvent(ctx.db, event.id));
  });

  // Neue Prüfung aus einem Termin – Angaben kommen bearbeitet aus dem Dialog.
  router.add('POST', '/api/calendar/events/:id/exam', async (ctx) => {
    const event = getEvent(ctx.db, ctx.params.id);
    if (event.exam_id) throw new HttpError(409, `Dieser Termin ist bereits mit der Prüfung „${event.exam_title}“ verknüpft.`);
    const body = await ctx.jsonBody();
    const data = examPayload(ctx.db, body);
    const ts = nowISO();
    const id = Number(
      ctx.db
        .prepare(
          `INSERT INTO exams (subject_id, title, date, start_time, location, topics, goals, summary, open_topics, confidence, calendar_event_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(data.subjectId, data.title, data.date, data.startTime, data.location, data.topics, data.goals, data.summary, data.openTopics, data.confidence, event.id, ts, ts)
        .lastInsertRowid
    );
    ctx.json(201, ctx.db.prepare('SELECT * FROM exams WHERE id = ?').get(id));
  });

  router.add('GET', '/api/calendar/suggestions', (ctx) => {
    ctx.json(200, linkSuggestions(ctx.db));
  });
}
