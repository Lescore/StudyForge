import { HttpError, clampText, nowISO, toInt, normalize } from './util.js';
import {
  TASK_PRIORITY,
  TASK_STATUS,
  TOPIC_STATUS,
  assertTitle,
  requireRow
} from './api-shared.js';

const TASK_LINK_LIMIT = 100;

function taskDetail(db, task) {
  return {
    ...task,
    subtasks: db.prepare('SELECT * FROM subtasks WHERE task_id = ? ORDER BY position, id').all(task.id),
    note_ids: db.prepare('SELECT note_id FROM task_notes WHERE task_id = ?').all(task.id).map((r) => r.note_id),
    file_ids: db.prepare('SELECT file_id FROM task_files WHERE task_id = ?').all(task.id).map((r) => r.file_id)
  };
}

function validateLinks(db, body) {
  const noteIds = Array.isArray(body.note_ids) ? body.note_ids.map((v) => toInt(v)).filter(Boolean).slice(0, TASK_LINK_LIMIT) : null;
  const fileIds = Array.isArray(body.file_ids) ? body.file_ids.map((v) => toInt(v)).filter(Boolean).slice(0, TASK_LINK_LIMIT) : null;
  for (const id of noteIds ?? []) requireRow(db, 'notes', id, 'Notiz');
  for (const id of fileIds ?? []) requireRow(db, 'files', id, 'Dokument');
  return { noteIds, fileIds };
}

function setTaskLinks(db, taskId, { noteIds, fileIds }) {
  if (noteIds) {
    db.prepare('DELETE FROM task_notes WHERE task_id = ?').run(taskId);
    const ins = db.prepare('INSERT OR IGNORE INTO task_notes (task_id, note_id) VALUES (?, ?)');
    for (const id of noteIds) ins.run(taskId, id);
  }
  if (fileIds) {
    db.prepare('DELETE FROM task_files WHERE task_id = ?').run(taskId);
    const ins = db.prepare('INSERT OR IGNORE INTO task_files (task_id, file_id) VALUES (?, ?)');
    for (const id of fileIds) ins.run(taskId, id);
  }
}

function taskBody(db, body, existing = null) {
  const title = body.title !== undefined ? assertTitle(body.title, 'Aufgabentitel', 300) : existing?.title ?? '';
  const status = body.status !== undefined ? body.status : existing?.status ?? 'offen';
  if (!TASK_STATUS.includes(status)) throw new HttpError(400, 'Ungültiger Status für die Aufgabe.');
  const priority = body.priority !== undefined ? body.priority : existing?.priority ?? 'normal';
  if (!TASK_PRIORITY.includes(priority)) throw new HttpError(400, 'Ungültige Priorität.');
  let subjectId = body.subject_id !== undefined ? toInt(body.subject_id) : existing?.subject_id ?? null;
  if (subjectId !== null) requireRow(db, 'subjects', subjectId, 'Fach');
  let examId = body.exam_id !== undefined ? toInt(body.exam_id) : existing?.exam_id ?? null;
  if (examId !== null) requireRow(db, 'exams', examId, 'Prüfung');
  const dueDate = body.due_date !== undefined ? (body.due_date || null) : existing?.due_date ?? null;
  if (dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(dueDate))) {
    throw new HttpError(400, 'Fälligkeitsdatum muss das Format JJJJ-MM-TT haben.');
  }
  return {
    title,
    description: body.description !== undefined ? clampText(body.description, 50000, 'Beschreibung') : existing?.description ?? '',
    subjectId,
    topic: body.topic !== undefined ? clampText(body.topic, 200, 'Thema') : existing?.topic ?? '',
    priority,
    dueDate,
    status,
    examId
  };
}

// ------------------------------------------------------------ IPv4-Subnetting
/**
 * Validiert die Felder einer Prüfung. Ohne `existing` gelten Standardwerte,
 * mit `existing` bleiben nicht übergebene Felder unverändert.
 */
export function examPayload(db, body, existing = null) {
  const pick = (key, fallback) => (body[key] !== undefined ? body[key] : existing ? existing[key] : fallback);
  const subjectId = body.subject_id !== undefined ? toInt(body.subject_id) : existing?.subject_id ?? null;
  if (subjectId !== null) requireRow(db, 'subjects', subjectId, 'Fach');
  const date = pick('date', null) || null;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new HttpError(400, 'Prüfungsdatum muss das Format JJJJ-MM-TT haben.');
  const startTime = pick('start_time', null) || null;
  if (startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(startTime))) throw new HttpError(400, 'Uhrzeit muss das Format HH:MM haben.');
  const title = body.title !== undefined || !existing ? assertTitle(body.title, 'Titel der Prüfung', 300) : existing.title;
  const text = (key, max, label) => (body[key] !== undefined ? clampText(body[key], max, label) : existing ? existing[key] : '');
  return {
    subjectId,
    title,
    date,
    startTime,
    location: text('location', 500, 'Ort').trim(),
    topics: text('topics', 50000, 'Prüfungsstoff'),
    goals: text('goals', 50000, 'Lernziele'),
    summary: text('summary', 50000, 'Zusammenfassung'),
    openTopics: text('open_topics', 50000, 'Offene Themen'),
    confidence: body.confidence !== undefined ? Math.min(5, Math.max(0, toInt(body.confidence, 0))) : existing?.confidence ?? 0
  };
}

export function ipv4ToInt(ip) {
  const parts = String(ip ?? '').trim().split('.');
  if (parts.length !== 4) throw new HttpError(400, 'Bitte eine gültige IPv4-Adresse eingeben (z. B. 192.168.10.1).');
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) throw new HttpError(400, 'Bitte eine gültige IPv4-Adresse eingeben.');
    const n = Number(part);
    if (n > 255) throw new HttpError(400, 'Die Oktette einer IPv4-Adresse müssen zwischen 0 und 255 liegen.');
    value = value * 256 + n;
  }
  return value;
}

export function intToIp(value) {
  return [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join('.');
}

export function subnetSolution(ip, prefix) {
  const p = toInt(prefix, null);
  if (p === null || p < 0 || p > 32) throw new HttpError(400, 'Das Präfix muss zwischen 0 und 32 liegen.');
  const ipInt = ipv4ToInt(ip);
  const mask = p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0;
  const network = (ipInt & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const totalAddresses = 2 ** (32 - p);
  let usable;
  let first = null;
  let last = null;
  if (p <= 30) {
    usable = totalAddresses - 2;
    first = intToIp(network + 1);
    last = intToIp(broadcast - 1);
  } else {
    usable = p === 32 ? 1 : 2;
    first = intToIp(network);
    last = intToIp(broadcast);
  }
  return {
    ip,
    prefix: p,
    mask: intToIp(mask),
    network: intToIp(network),
    broadcast: intToIp(broadcast),
    first,
    last,
    usable_hosts: usable,
    total_addresses: totalAddresses,
    cidr: `${intToIp(network)}/${p}`,
    wildcard: intToIp(~mask >>> 0),
    host_bits: 32 - p,
    notes:
      p === 0
        ? 'Präfix /0 umfasst den gesamten IPv4-Adressraum.'
        : p === 31
          ? '/31 wird für Punkt-zu-Punkt-Verbindungen genutzt (2 Adressen, kein klassischer Broadcast).'
          : p === 32
            ? '/32 ist ein einzelner Host.'
            : `Für Hosts nutzbar: ${usable} Adressen (Netz- und Broadcastadresse abgezogen).`
  };
}

function sameIp(a, b) {
  try {
    return ipv4ToInt(a) === ipv4ToInt(b);
  } catch {
    return false;
  }
}

export function registerOrganizeRoutes(router) {
  // ------------------------------------------------------------ Aufgaben
  router.add('GET', '/api/tasks', (ctx) => {
    const where = [];
    const params = [];
    const status = ctx.query.get('status');
    if (status && TASK_STATUS.includes(status)) {
      where.push('t.status = ?');
      params.push(status);
    }
    if (ctx.query.get('open') === '1') where.push("t.status != 'erledigt'");
    const subjectId = toInt(ctx.query.get('subject_id'));
    if (subjectId) {
      where.push('t.subject_id = ?');
      params.push(subjectId);
    }
    if (ctx.query.get('overdue') === '1') {
      where.push("t.due_date IS NOT NULL AND t.due_date < ? AND t.status != 'erledigt'");
      params.push(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10));
    }
    if (ctx.query.get('exam_id')) {
      where.push('t.exam_id = ?');
      params.push(toInt(ctx.query.get('exam_id')));
    }
    const q = normalize(ctx.query.get('q') || '');
    const rows = ctx.db
      .prepare(
        `SELECT t.*, s.name AS subject_name, s.color AS subject_color, e.title AS exam_title,
          (SELECT COUNT(*) FROM subtasks st WHERE st.task_id = t.id) AS subtask_count,
          (SELECT COUNT(*) FROM subtasks st WHERE st.task_id = t.id AND st.done = 1) AS subtask_done
         FROM tasks t
         LEFT JOIN subjects s ON s.id = t.subject_id
         LEFT JOIN exams e ON e.id = t.exam_id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY CASE t.status WHEN 'erledigt' THEN 1 ELSE 0 END,
          CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END, t.due_date,
          CASE t.priority WHEN 'hoch' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, t.created_at DESC`
      )
      .all(...params)
      .filter((row) => !q || normalize(`${row.title} ${row.description} ${row.topic} ${row.subject_name ?? ''}`).includes(q));
    ctx.json(200, rows.map((row) => taskDetail(ctx.db, row)));
  });

  router.add('POST', '/api/tasks', async (ctx) => {
    const body = await ctx.jsonBody();
    const data = taskBody(ctx.db, body);
    const ts = nowISO();
    const result = ctx.db
      .prepare(
        `INSERT INTO tasks (title, description, subject_id, topic, priority, due_date, status, exam_id, created_at, updated_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.title,
        data.description,
        data.subjectId,
        data.topic,
        data.priority,
        data.dueDate,
        data.status,
        data.examId,
        ts,
        ts,
        data.status === 'erledigt' ? ts : null
      );
    const id = Number(result.lastInsertRowid);
    let position = 0;
    if (Array.isArray(body.subtasks)) {
      const ins = ctx.db.prepare('INSERT INTO subtasks (task_id, title, done, position) VALUES (?, ?, ?, ?)');
      for (const sub of body.subtasks.slice(0, 100)) {
        const title = String(sub?.title ?? '').trim();
        if (title) ins.run(id, title.slice(0, 500), sub?.done ? 1 : 0, position++);
      }
    }
    const links = validateLinks(ctx.db, body);
    setTaskLinks(ctx.db, id, links);
    ctx.json(201, taskDetail(ctx.db, ctx.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)));
  });

  router.add('GET', '/api/tasks/:id', (ctx) => {
    const task = requireRow(ctx.db, 'tasks', ctx.params.id, 'Aufgabe');
    const row = ctx.db
      .prepare('SELECT t.*, s.name AS subject_name, e.title AS exam_title FROM tasks t LEFT JOIN subjects s ON s.id = t.subject_id LEFT JOIN exams e ON e.id = t.exam_id WHERE t.id = ?')
      .get(task.id);
    ctx.json(200, taskDetail(ctx.db, row));
  });

  router.add('PATCH', '/api/tasks/:id', async (ctx) => {
    const task = requireRow(ctx.db, 'tasks', ctx.params.id, 'Aufgabe');
    const body = await ctx.jsonBody();
    const data = taskBody(ctx.db, body, task);
    const completedAt = data.status === 'erledigt' ? task.completed_at || nowISO() : null;
    ctx.db
      .prepare(
        `UPDATE tasks SET title = ?, description = ?, subject_id = ?, topic = ?, priority = ?, due_date = ?, status = ?, exam_id = ?,
         updated_at = ?, completed_at = ? WHERE id = ?`
      )
      .run(data.title, data.description, data.subjectId, data.topic, data.priority, data.dueDate, data.status, data.examId, nowISO(), completedAt, task.id);
    const links = validateLinks(ctx.db, body);
    setTaskLinks(ctx.db, task.id, links);
    ctx.json(200, taskDetail(ctx.db, ctx.db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id)));
  });

  router.add('DELETE', '/api/tasks/:id', (ctx) => {
    const task = requireRow(ctx.db, 'tasks', ctx.params.id, 'Aufgabe');
    ctx.db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
    ctx.json(200, { ok: true });
  });

  router.add('POST', '/api/tasks/:id/subtasks', async (ctx) => {
    const task = requireRow(ctx.db, 'tasks', ctx.params.id, 'Aufgabe');
    const body = await ctx.jsonBody();
    const title = assertTitle(body.title, 'Titel der Teilaufgabe', 500);
    const max = ctx.db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM subtasks WHERE task_id = ?').get(task.id).m;
    const result = ctx.db
      .prepare('INSERT INTO subtasks (task_id, title, done, position) VALUES (?, ?, 0, ?)')
      .run(task.id, title, max + 1);
    ctx.json(201, ctx.db.prepare('SELECT * FROM subtasks WHERE id = ?').get(result.lastInsertRowid));
  });

  router.add('PATCH', '/api/subtasks/:id', async (ctx) => {
    const sub = requireRow(ctx.db, 'subtasks', ctx.params.id, 'Teilaufgabe');
    const body = await ctx.jsonBody();
    ctx.db
      .prepare('UPDATE subtasks SET title = ?, done = ? WHERE id = ?')
      .run(body.title !== undefined ? assertTitle(body.title, 'Titel der Teilaufgabe', 500) : sub.title, body.done !== undefined ? (body.done ? 1 : 0) : sub.done, sub.id);
    ctx.json(200, ctx.db.prepare('SELECT * FROM subtasks WHERE id = ?').get(sub.id));
  });

  router.add('DELETE', '/api/subtasks/:id', (ctx) => {
    const sub = requireRow(ctx.db, 'subtasks', ctx.params.id, 'Teilaufgabe');
    ctx.db.prepare('DELETE FROM subtasks WHERE id = ?').run(sub.id);
    ctx.json(200, { ok: true });
  });

  // ------------------------------------------------------------ Prüfungen
  router.add('GET', '/api/exams', (ctx) => {
    const rows = ctx.db
      .prepare(
        `SELECT e.*, s.name AS subject_name, s.color AS subject_color,
          (SELECT COUNT(*) FROM tasks t WHERE t.exam_id = e.id AND t.status != 'erledigt') AS open_tasks,
          ce.summary AS calendar_summary, ce.start AS calendar_start, ce.end AS calendar_end, ce.all_day AS calendar_all_day,
          ce.location AS calendar_location, ce.description AS calendar_description, ce.status AS calendar_status,
          ce.removed_at AS calendar_removed_at, cs.name AS calendar_source_name
         FROM exams e LEFT JOIN subjects s ON s.id = e.subject_id
         LEFT JOIN calendar_events ce ON ce.id = e.calendar_event_id
         LEFT JOIN calendar_sources cs ON cs.id = ce.source_id
         ORDER BY CASE WHEN e.date IS NULL THEN 1 ELSE 0 END, e.date, e.start_time`
      )
      .all()
      .map((row) => ({ ...row, calendar_all_day: Boolean(row.calendar_all_day) }));
    ctx.json(200, rows);
  });

  router.add('POST', '/api/exams', async (ctx) => {
    const data = examPayload(ctx.db, await ctx.jsonBody());
    const ts = nowISO();
    const result = ctx.db
      .prepare(
        `INSERT INTO exams (subject_id, title, date, start_time, location, topics, goals, summary, open_topics, confidence, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(data.subjectId, data.title, data.date, data.startTime, data.location, data.topics, data.goals, data.summary, data.openTopics, data.confidence, ts, ts);
    ctx.json(201, ctx.db.prepare('SELECT * FROM exams WHERE id = ?').get(result.lastInsertRowid));
  });

  // Die Kalenderverknüpfung wird nur über /api/calendar/events/:id/link geändert.
  router.add('PATCH', '/api/exams/:id', async (ctx) => {
    const exam = requireRow(ctx.db, 'exams', ctx.params.id, 'Prüfung');
    const data = examPayload(ctx.db, await ctx.jsonBody(), exam);
    ctx.db
      .prepare(
        `UPDATE exams SET subject_id = ?, title = ?, date = ?, start_time = ?, location = ?, topics = ?, goals = ?, summary = ?,
           open_topics = ?, confidence = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(data.subjectId, data.title, data.date, data.startTime, data.location, data.topics, data.goals, data.summary, data.openTopics, data.confidence, nowISO(), exam.id);
    ctx.json(200, ctx.db.prepare('SELECT * FROM exams WHERE id = ?').get(exam.id));
  });

  router.add('DELETE', '/api/exams/:id', (ctx) => {
    const exam = requireRow(ctx.db, 'exams', ctx.params.id, 'Prüfung');
    ctx.db.prepare('DELETE FROM exams WHERE id = ?').run(exam.id);
    ctx.json(200, { ok: true });
  });

  // ------------------------------------------------------------ Themen
  router.add('GET', '/api/topics', (ctx) => {
    const subjectId = toInt(ctx.query.get('subject_id'));
    const rows = ctx.db
      .prepare(
        `SELECT tp.*, s.name AS subject_name, s.color AS subject_color
         FROM topics tp LEFT JOIN subjects s ON s.id = tp.subject_id
         ${subjectId ? 'WHERE tp.subject_id = ?' : ''}
         ORDER BY CASE tp.status WHEN 'ueben' THEN 0 WHEN 'offen' THEN 1 ELSE 2 END, tp.name COLLATE NOCASE`
      )
      .all(...(subjectId ? [subjectId] : []));
    ctx.json(200, rows);
  });

  router.add('POST', '/api/topics', async (ctx) => {
    const body = await ctx.jsonBody();
    const subjectId = toInt(body.subject_id);
    if (!subjectId) throw new HttpError(400, 'Bitte ein Fach auswählen.');
    requireRow(ctx.db, 'subjects', subjectId, 'Fach');
    const name = assertTitle(body.name, 'Thema', 200);
    const status = TOPIC_STATUS.includes(body.status) ? body.status : 'offen';
    const ts = nowISO();
    try {
      const result = ctx.db
        .prepare('INSERT INTO topics (subject_id, name, status, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(subjectId, name, status, clampText(body.note, 10000, 'Notiz'), ts, ts);
      ctx.json(201, ctx.db.prepare('SELECT * FROM topics WHERE id = ?').get(result.lastInsertRowid));
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) throw new HttpError(409, 'Dieses Thema gibt es in dem Fach bereits.');
      throw err;
    }
  });

  router.add('PATCH', '/api/topics/:id', async (ctx) => {
    const topic = requireRow(ctx.db, 'topics', ctx.params.id, 'Thema');
    const body = await ctx.jsonBody();
    const status = body.status !== undefined ? body.status : topic.status;
    if (!TOPIC_STATUS.includes(status)) throw new HttpError(400, 'Ungültiger Lernstatus.');
    try {
      ctx.db
        .prepare('UPDATE topics SET name = ?, status = ?, note = ?, updated_at = ? WHERE id = ?')
        .run(
          body.name !== undefined ? assertTitle(body.name, 'Thema', 200) : topic.name,
          status,
          body.note !== undefined ? clampText(body.note, 10000, 'Notiz') : topic.note,
          nowISO(),
          topic.id
        );
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) throw new HttpError(409, 'Dieses Thema gibt es in dem Fach bereits.');
      throw err;
    }
    ctx.json(200, ctx.db.prepare('SELECT * FROM topics WHERE id = ?').get(topic.id));
  });

  router.add('DELETE', '/api/topics/:id', (ctx) => {
    const topic = requireRow(ctx.db, 'topics', ctx.params.id, 'Thema');
    ctx.db.prepare('DELETE FROM topics WHERE id = ?').run(topic.id);
    ctx.json(200, { ok: true });
  });

  // ------------------------------------------------------------ Lernziele
  router.add('GET', '/api/goals', (ctx) => {
    const subjectId = toInt(ctx.query.get('subject_id'));
    ctx.json(
      200,
      ctx.db
        .prepare(
          `SELECT g.*, s.name AS subject_name FROM goals g LEFT JOIN subjects s ON s.id = g.subject_id
           ${subjectId ? 'WHERE g.subject_id = ?' : ''}
           ORDER BY CASE g.status WHEN 'offen' THEN 0 ELSE 1 END, CASE WHEN g.due_date IS NULL THEN 1 ELSE 0 END, g.due_date`
        )
        .all(...(subjectId ? [subjectId] : []))
    );
  });

  router.add('POST', '/api/goals', async (ctx) => {
    const body = await ctx.jsonBody();
    const title = assertTitle(body.title, 'Lernziel', 300);
    const subjectId = toInt(body.subject_id);
    if (subjectId !== null) requireRow(ctx.db, 'subjects', subjectId, 'Fach');
    const status = body.status === 'erledigt' ? 'erledigt' : 'offen';
    const ts = nowISO();
    const result = ctx.db
      .prepare('INSERT INTO goals (subject_id, title, description, status, due_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(subjectId, title, clampText(body.description, 20000, 'Beschreibung'), status, body.due_date || null, ts, ts);
    ctx.json(201, ctx.db.prepare('SELECT * FROM goals WHERE id = ?').get(result.lastInsertRowid));
  });

  router.add('PATCH', '/api/goals/:id', async (ctx) => {
    const goal = requireRow(ctx.db, 'goals', ctx.params.id, 'Lernziel');
    const body = await ctx.jsonBody();
    const subjectId = body.subject_id !== undefined ? toInt(body.subject_id) : goal.subject_id;
    if (subjectId !== null) requireRow(ctx.db, 'subjects', subjectId, 'Fach');
    ctx.db
      .prepare('UPDATE goals SET subject_id = ?, title = ?, description = ?, status = ?, due_date = ?, updated_at = ? WHERE id = ?')
      .run(
        subjectId,
        body.title !== undefined ? assertTitle(body.title, 'Lernziel', 300) : goal.title,
        body.description !== undefined ? clampText(body.description, 20000, 'Beschreibung') : goal.description,
        body.status !== undefined ? (body.status === 'erledigt' ? 'erledigt' : 'offen') : goal.status,
        body.due_date !== undefined ? body.due_date || null : goal.due_date,
        nowISO(),
        goal.id
      );
    ctx.json(200, ctx.db.prepare('SELECT * FROM goals WHERE id = ?').get(goal.id));
  });

  router.add('DELETE', '/api/goals/:id', (ctx) => {
    const goal = requireRow(ctx.db, 'goals', ctx.params.id, 'Lernziel');
    ctx.db.prepare('DELETE FROM goals WHERE id = ?').run(goal.id);
    ctx.json(200, { ok: true });
  });

  // ------------------------------------------------------------ Codebeispiele
  router.add('GET', '/api/snippets', (ctx) => {
    const subjectId = toInt(ctx.query.get('subject_id'));
    ctx.json(
      200,
      ctx.db
        .prepare(
          `SELECT sn.*, s.name AS subject_name FROM snippets sn LEFT JOIN subjects s ON s.id = sn.subject_id
           ${subjectId ? 'WHERE sn.subject_id = ?' : ''} ORDER BY sn.updated_at DESC`
        )
        .all(...(subjectId ? [subjectId] : []))
    );
  });

  router.add('POST', '/api/snippets', async (ctx) => {
    const body = await ctx.jsonBody();
    const title = assertTitle(body.title, 'Titel des Codebeispiels', 300);
    const subjectId = toInt(body.subject_id);
    if (subjectId !== null) requireRow(ctx.db, 'subjects', subjectId, 'Fach');
    const ts = nowISO();
    const result = ctx.db
      .prepare('INSERT INTO snippets (title, language, code, explanation, subject_id, topic, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(
        title,
        clampText(body.language, 30, 'Programmiersprache') || 'text',
        clampText(body.code, 200000, 'Code'),
        clampText(body.explanation, 50000, 'Erklärung'),
        subjectId,
        clampText(body.topic, 200, 'Thema'),
        ts,
        ts
      );
    ctx.json(201, ctx.db.prepare('SELECT * FROM snippets WHERE id = ?').get(result.lastInsertRowid));
  });

  router.add('PATCH', '/api/snippets/:id', async (ctx) => {
    const snippet = requireRow(ctx.db, 'snippets', ctx.params.id, 'Codebeispiel');
    const body = await ctx.jsonBody();
    const subjectId = body.subject_id !== undefined ? toInt(body.subject_id) : snippet.subject_id;
    if (subjectId !== null) requireRow(ctx.db, 'subjects', subjectId, 'Fach');
    ctx.db
      .prepare('UPDATE snippets SET title = ?, language = ?, code = ?, explanation = ?, subject_id = ?, topic = ?, updated_at = ? WHERE id = ?')
      .run(
        body.title !== undefined ? assertTitle(body.title, 'Titel des Codebeispiels', 300) : snippet.title,
        body.language !== undefined ? clampText(body.language, 30, 'Programmiersprache') || 'text' : snippet.language,
        body.code !== undefined ? clampText(body.code, 200000, 'Code') : snippet.code,
        body.explanation !== undefined ? clampText(body.explanation, 50000, 'Erklärung') : snippet.explanation,
        subjectId,
        body.topic !== undefined ? clampText(body.topic, 200, 'Thema') : snippet.topic,
        nowISO(),
        snippet.id
      );
    ctx.json(200, ctx.db.prepare('SELECT * FROM snippets WHERE id = ?').get(snippet.id));
  });

  router.add('DELETE', '/api/snippets/:id', (ctx) => {
    const snippet = requireRow(ctx.db, 'snippets', ctx.params.id, 'Codebeispiel');
    ctx.db.prepare('DELETE FROM snippets WHERE id = ?').run(snippet.id);
    ctx.json(200, { ok: true });
  });

  // ------------------------------------------------------------ Formeln
  router.add('GET', '/api/formulas', (ctx) => {
    const subjectId = toInt(ctx.query.get('subject_id'));
    ctx.json(
      200,
      ctx.db
        .prepare(
          `SELECT f.*, s.name AS subject_name FROM formulas f LEFT JOIN subjects s ON s.id = f.subject_id
           ${subjectId ? 'WHERE f.subject_id = ?' : ''} ORDER BY f.topic COLLATE NOCASE, f.name COLLATE NOCASE`
        )
        .all(...(subjectId ? [subjectId] : []))
    );
  });

  router.add('POST', '/api/formulas', async (ctx) => {
    const body = await ctx.jsonBody();
    const name = assertTitle(body.name, 'Name der Formel', 300);
    const subjectId = toInt(body.subject_id);
    if (subjectId !== null) requireRow(ctx.db, 'subjects', subjectId, 'Fach');
    const ts = nowISO();
    const result = ctx.db
      .prepare('INSERT INTO formulas (name, latex, description, subject_id, topic, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(
        name,
        clampText(body.latex, 20000, 'LaTeX'),
        clampText(body.description, 20000, 'Beschreibung'),
        subjectId,
        clampText(body.topic, 200, 'Thema'),
        ts,
        ts
      );
    ctx.json(201, ctx.db.prepare('SELECT * FROM formulas WHERE id = ?').get(result.lastInsertRowid));
  });

  router.add('PATCH', '/api/formulas/:id', async (ctx) => {
    const formula = requireRow(ctx.db, 'formulas', ctx.params.id, 'Formel');
    const body = await ctx.jsonBody();
    const subjectId = body.subject_id !== undefined ? toInt(body.subject_id) : formula.subject_id;
    if (subjectId !== null) requireRow(ctx.db, 'subjects', subjectId, 'Fach');
    ctx.db
      .prepare('UPDATE formulas SET name = ?, latex = ?, description = ?, subject_id = ?, topic = ?, updated_at = ? WHERE id = ?')
      .run(
        body.name !== undefined ? assertTitle(body.name, 'Name der Formel', 300) : formula.name,
        body.latex !== undefined ? clampText(body.latex, 20000, 'LaTeX') : formula.latex,
        body.description !== undefined ? clampText(body.description, 20000, 'Beschreibung') : formula.description,
        subjectId,
        body.topic !== undefined ? clampText(body.topic, 200, 'Thema') : formula.topic,
        nowISO(),
        formula.id
      );
    ctx.json(200, ctx.db.prepare('SELECT * FROM formulas WHERE id = ?').get(formula.id));
  });

  router.add('DELETE', '/api/formulas/:id', (ctx) => {
    const formula = requireRow(ctx.db, 'formulas', ctx.params.id, 'Formel');
    ctx.db.prepare('DELETE FROM formulas WHERE id = ?').run(formula.id);
    ctx.json(200, { ok: true });
  });

  // ------------------------------------------------------------ Subnetting
  router.add('GET', '/api/tools/subnet/calculate', (ctx) => {
    ctx.json(200, subnetSolution(ctx.query.get('ip'), ctx.query.get('prefix')));
  });

  router.add('POST', '/api/tools/subnet/check', async (ctx) => {
    const body = await ctx.jsonBody();
    const solution = subnetSolution(body.ip, body.prefix);
    const fields = [
      { key: 'network', label: 'Netzwerkadresse' },
      { key: 'broadcast', label: 'Broadcastadresse' },
      { key: 'first', label: 'Erste Hostadresse' },
      { key: 'last', label: 'Letzte Hostadresse' }
    ];
    const results = fields.map((f) => ({
      ...f,
      correct: sameIp(body[f.key], solution[f.key]),
      expected: solution[f.key],
      given: body[f.key] ?? ''
    }));
    const hostsCorrect = toInt(body.usable_hosts, null) === solution.usable_hosts;
    ctx.json(200, {
      solution,
      results,
      hosts: { label: 'Nutzbare Hosts', correct: hostsCorrect, expected: solution.usable_hosts, given: body.usable_hosts },
      allCorrect: results.every((r) => r.correct) && hostsCorrect
    });
  });

  router.add('GET', '/api/subnets', (ctx) => {
    const subjectId = toInt(ctx.query.get('subject_id'));
    ctx.json(
      200,
      ctx.db
        .prepare(
          `SELECT se.*, s.name AS subject_name FROM subnet_exercises se LEFT JOIN subjects s ON s.id = se.subject_id
           ${subjectId ? 'WHERE se.subject_id = ?' : ''} ORDER BY se.updated_at DESC`
        )
        .all(...(subjectId ? [subjectId] : []))
    );
  });

  router.add('POST', '/api/subnets', async (ctx) => {
    const body = await ctx.jsonBody();
    const solution = subnetSolution(body.ip, body.prefix);
    const title = body.title ? assertTitle(body.title, 'Titel der Aufgabe', 300) : `${solution.ip}/${solution.prefix}`;
    const subjectId = toInt(body.subject_id);
    if (subjectId !== null) requireRow(ctx.db, 'subjects', subjectId, 'Fach');
    const ts = nowISO();
    const result = ctx.db
      .prepare(
        `INSERT INTO subnet_exercises (title, ip, prefix, answer_network, answer_broadcast, answer_first, answer_last,
         answer_hosts, working, subject_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        title,
        solution.ip,
        solution.prefix,
        solution.network,
        solution.broadcast,
        solution.first ?? '',
        solution.last ?? '',
        solution.usable_hosts,
        clampText(body.working, 50000, 'Lösungsweg'),
        subjectId,
        ts,
        ts
      );
    ctx.json(201, ctx.db.prepare('SELECT * FROM subnet_exercises WHERE id = ?').get(result.lastInsertRowid));
  });

  router.add('PATCH', '/api/subnets/:id', async (ctx) => {
    const exercise = requireRow(ctx.db, 'subnet_exercises', ctx.params.id, 'Subnetting-Aufgabe');
    const body = await ctx.jsonBody();
    const ip = body.ip !== undefined ? String(body.ip) : exercise.ip;
    const prefix = body.prefix !== undefined ? toInt(body.prefix) : exercise.prefix;
    const solution = subnetSolution(ip, prefix);
    const subjectId = body.subject_id !== undefined ? toInt(body.subject_id) : exercise.subject_id;
    if (subjectId !== null) requireRow(ctx.db, 'subjects', subjectId, 'Fach');
    ctx.db
      .prepare(
        `UPDATE subnet_exercises SET title = ?, ip = ?, prefix = ?, answer_network = ?, answer_broadcast = ?,
         answer_first = ?, answer_last = ?, answer_hosts = ?, working = ?, subject_id = ?, updated_at = ? WHERE id = ?`
      )
      .run(
        body.title !== undefined ? assertTitle(body.title, 'Titel der Aufgabe', 300) : exercise.title,
        solution.ip,
        solution.prefix,
        solution.network,
        solution.broadcast,
        solution.first ?? '',
        solution.last ?? '',
        solution.usable_hosts,
        body.working !== undefined ? clampText(body.working, 50000, 'Lösungsweg') : exercise.working,
        subjectId,
        nowISO(),
        exercise.id
      );
    ctx.json(200, ctx.db.prepare('SELECT * FROM subnet_exercises WHERE id = ?').get(exercise.id));
  });

  router.add('DELETE', '/api/subnets/:id', (ctx) => {
    const exercise = requireRow(ctx.db, 'subnet_exercises', ctx.params.id, 'Subnetting-Aufgabe');
    ctx.db.prepare('DELETE FROM subnet_exercises WHERE id = ?').run(exercise.id);
    ctx.json(200, { ok: true });
  });

  // ------------------------------------------------------------ Vorlagen
  router.add('GET', '/api/templates', (ctx) => {
    ctx.json(200, ctx.db.prepare('SELECT * FROM templates ORDER BY builtin DESC, name COLLATE NOCASE').all());
  });

  router.add('POST', '/api/templates', async (ctx) => {
    const body = await ctx.jsonBody();
    const name = assertTitle(body.name, 'Name der Vorlage', 200);
    const content = clampText(body.content, 200000, 'Vorlage', { required: true });
    const ts = nowISO();
    const result = ctx.db
      .prepare('INSERT INTO templates (name, kind, content, builtin, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)')
      .run(name, clampText(body.kind, 50, 'Art') || 'notiz', content, ts, ts);
    ctx.json(201, ctx.db.prepare('SELECT * FROM templates WHERE id = ?').get(result.lastInsertRowid));
  });

  router.add('PATCH', '/api/templates/:id', async (ctx) => {
    const template = requireRow(ctx.db, 'templates', ctx.params.id, 'Vorlage');
    const body = await ctx.jsonBody();
    const name = body.name !== undefined ? assertTitle(body.name, 'Name der Vorlage', 200) : template.name;
    const kind = body.kind !== undefined ? clampText(body.kind, 50, 'Art') || template.kind : template.kind;
    const content = body.content !== undefined ? clampText(body.content, 200000, 'Vorlage', { required: true }) : template.content;
    ctx.db
      .prepare('UPDATE templates SET name = ?, kind = ?, content = ?, updated_at = ? WHERE id = ?')
      .run(name, kind, content, nowISO(), template.id);
    ctx.json(200, ctx.db.prepare('SELECT * FROM templates WHERE id = ?').get(template.id));
  });

  router.add('DELETE', '/api/templates/:id', (ctx) => {
    const template = requireRow(ctx.db, 'templates', ctx.params.id, 'Vorlage');
    ctx.db.prepare('DELETE FROM templates WHERE id = ?').run(template.id);
    ctx.json(200, { ok: true });
  });

}
