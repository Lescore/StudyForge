import { HttpError, nowISO, toInt, clampText, parseJsonSafe } from './util.js';
import {
  CARD_TYPES,
  assertTitle,
  getSettings,
  parseTagsField,
  requireRow,
  settingNumber
} from './api-shared.js';
import { applyRating, cardMemory, intervalLabel, isHardCard, previewCard, RATING_LABELS } from './fsrs.js';

function parseOptions(raw) {
  const parsed = parseJsonSafe(raw, []);
  return Array.isArray(parsed) ? parsed.map(String).slice(0, 10) : [];
}

function cardOut(card, settings, now = new Date()) {
  const retention = settingNumber(settings, 'requested_retention', 0.9);
  return {
    ...card,
    options: parseOptions(card.options),
    suspended: !!card.suspended,
    tags: card.tags ? String(card.tags).split(',').map((t) => t.trim()).filter(Boolean) : [],
    preview: previewCard(card, now, retention),
    memory: cardMemory(card, now),
    hard: isHardCard(card)
  };
}

function deckRows(db, now) {
  return db
    .prepare(
      `SELECT d.*, s.name AS subject_name, s.color AS subject_color,
        COUNT(c.id) AS card_count,
        SUM(CASE WHEN c.reps = 0 THEN 1 ELSE 0 END) AS new_count,
        SUM(CASE WHEN c.due IS NOT NULL AND c.due <= ? AND c.suspended = 0 THEN 1 ELSE 0 END) AS due_count,
        SUM(CASE WHEN c.suspended = 1 THEN 1 ELSE 0 END) AS suspended_count,
        SUM(CASE WHEN c.reps > 0 THEN 1 ELSE 0 END) AS started_count
       FROM decks d
       LEFT JOIN cards c ON c.deck_id = d.id
       LEFT JOIN subjects s ON s.id = d.subject_id
       GROUP BY d.id
       ORDER BY d.name COLLATE NOCASE`
    )
    .all(now)
    .map((row) => ({
      ...row,
      card_count: Number(row.card_count) || 0,
      new_count: Number(row.new_count) || 0,
      due_count: Number(row.due_count) || 0,
      suspended_count: Number(row.suspended_count) || 0,
      started_count: Number(row.started_count) || 0,
      progress: Number(row.card_count) > 0 ? Math.round((Number(row.started_count) / Number(row.card_count)) * 100) : 0
    }));
}

function validateCardInput(db, body, existing = null) {
  const type = body.type !== undefined ? body.type : existing?.type ?? 'qa';
  if (!CARD_TYPES.includes(type)) throw new HttpError(400, 'Unbekannter Kartentyp.');
  const front = body.front !== undefined ? clampText(body.front, 20000, 'Vorderseite', { required: true }) : existing?.front ?? '';
  const back = body.back !== undefined ? clampText(body.back, 20000, 'Rückseite', { required: true }) : existing?.back ?? '';
  if (!front.trim()) throw new HttpError(400, 'Die Vorderseite darf nicht leer sein.');
  if (!back.trim()) throw new HttpError(400, 'Die Rückseite darf nicht leer sein.');
  if (type === 'cloze' && !/\{\{[^}]+\}\}/.test(front)) {
    throw new HttpError(400, 'Lückentext-Karten benötigen mindestens eine Lücke der Form {{...}} auf der Vorderseite.');
  }
  let options = body.options !== undefined ? (Array.isArray(body.options) ? body.options.map((o) => String(o).trim()) : []) : parseOptions(existing?.options);
  options = options.filter(Boolean).slice(0, 8);
  let correctIndex = body.correct_index !== undefined ? toInt(body.correct_index, null) : existing?.correct_index ?? null;
  if (type === 'truefalse') {
    options = ['Richtig', 'Falsch'];
    if (correctIndex !== 0 && correctIndex !== 1) throw new HttpError(400, 'Bitte „Richtig“ oder „Falsch“ als Lösung wählen.');
  } else if (type === 'mc') {
    if (options.length < 2) throw new HttpError(400, 'Multiple-Choice-Karten benötigen mindestens zwei Antwortmöglichkeiten.');
    if (correctIndex === null || correctIndex < 0 || correctIndex >= options.length) {
      throw new HttpError(400, 'Bitte die richtige Antwort auswählen.');
    }
  } else {
    options = [];
    correctIndex = null;
  }
  const deckId = body.deck_id !== undefined ? toInt(body.deck_id) : existing?.deck_id ?? null;
  if (deckId !== null) {
    const deck = db.prepare('SELECT id FROM decks WHERE id = ?').get(deckId);
    if (!deck) throw new HttpError(400, 'Der gewählte Stapel existiert nicht.');
  }
  const subjectId = body.subject_id !== undefined ? toInt(body.subject_id) : null;
  if (subjectId !== null) requireRow(db, 'subjects', subjectId, 'Fach');
  const sourceNoteId = body.source_note_id !== undefined ? toInt(body.source_note_id) : existing?.source_note_id ?? null;
  if (sourceNoteId !== null) {
    const note = db.prepare('SELECT id FROM notes WHERE id = ? AND deleted_at IS NULL').get(sourceNoteId);
    if (!note) throw new HttpError(400, 'Die verknüpfte Notiz existiert nicht.');
  }
  return {
    type,
    front,
    back,
    options: JSON.stringify(options),
    correctIndex,
    explanation: body.explanation !== undefined ? clampText(body.explanation, 10000, 'Erklärung') : existing?.explanation ?? '',
    topic: body.topic !== undefined ? clampText(body.topic, 200, 'Thema') : existing?.topic ?? '',
    tags: splitTagsString(body.tags, existing?.tags),
    deckId,
    sourceNoteId
  };
}

function splitTagsString(value, existing) {
  if (value === undefined) return existing ?? '';
  return parseTagsField(value).join(', ');
}

function queueWhere(scope, query, db) {
  const now = nowISO();
  const conditions = ['c.suspended = 0'];
  const params = [];
  let join = 'LEFT JOIN decks d ON d.id = c.deck_id LEFT JOIN subjects s ON s.id = d.subject_id';
  let order = 'CASE WHEN c.due IS NULL THEN 1 ELSE 0 END, c.due ASC, c.id ASC';
  const subjectId = toInt(query.get('subject_id'));
  const deckId = toInt(query.get('deck_id'));
  const topic = String(query.get('topic') ?? '').trim();

  if (scope === 'deck') {
    if (!deckId) throw new HttpError(400, 'Bitte einen Stapel auswählen.');
    conditions.push('c.deck_id = ?');
    params.push(deckId);
  } else if (scope === 'subject') {
    if (!subjectId) throw new HttpError(400, 'Bitte ein Fach auswählen.');
    conditions.push('d.subject_id = ?');
    params.push(subjectId);
  } else if (scope === 'topic') {
    if (!topic) throw new HttpError(400, 'Bitte ein Thema angeben.');
    conditions.push('c.topic LIKE ?');
    params.push(`%${topic}%`);
    if (subjectId) {
      conditions.push('d.subject_id = ?');
      params.push(subjectId);
    }
  } else if (scope === 'hard') {
    conditions.push('(c.lapses > 0 OR c.difficulty >= 6.5 OR c.state = ?)');
    params.push('relearning');
    order = 'CASE WHEN c.due IS NULL THEN 1 ELSE 0 END, c.due ASC, c.lapses DESC';
    if (subjectId) {
      conditions.push('d.subject_id = ?');
      params.push(subjectId);
    }
  } else if (scope === 'goals') {
    const openTopics = db
      .prepare("SELECT name FROM topics WHERE status != 'verstanden'")
      .all()
      .map((t) => t.name);
    if (openTopics.length) {
      conditions.push(`c.topic IN (${openTopics.map(() => '?').join(',')})`);
      params.push(...openTopics);
    } else {
      conditions.push(`d.subject_id IN (SELECT DISTINCT subject_id FROM goals WHERE status != 'erledigt' AND subject_id IS NOT NULL)`);
    }
    order = 'CASE WHEN c.due IS NULL THEN 1 ELSE 0 END, c.due ASC';
  } else if (scope === 'due' || scope === 'mixed') {
    conditions.push('(c.due IS NULL OR c.due <= ?)');
    params.push(now);
    order = 'CASE WHEN c.due IS NULL THEN 1 ELSE 0 END, c.due ASC, c.id ASC';
    if (subjectId) {
      conditions.push('d.subject_id = ?');
      params.push(subjectId);
    }
    if (scope === 'mixed') {
      const ids = String(query.get('subject_ids') ?? '')
        .split(',')
        .map((v) => toInt(v))
        .filter(Boolean);
      if (ids.length) {
        conditions.push(`d.subject_id IN (${ids.map(() => '?').join(',')})`);
        params.push(...ids);
      }
    }
  } else {
    throw new HttpError(400, 'Unbekannter Lernmodus.');
  }
  return { where: conditions.join(' AND '), params, join, order };
}

export function registerLearnRoutes(router, context) {
  // ------------------------------------------------------------ Stapel
  router.add('GET', '/api/decks', (ctx) => {
    ctx.json(200, deckRows(ctx.db, nowISO()));
  });

  router.add('POST', '/api/decks', async (ctx) => {
    const body = await ctx.jsonBody();
    const name = assertTitle(body.name, 'Name des Stapels', 160);
    const subjectId = toInt(body.subject_id);
    if (subjectId !== null) requireRow(ctx.db, 'subjects', subjectId, 'Fach');
    const ts = nowISO();
    const result = ctx.db
      .prepare('INSERT INTO decks (name, subject_id, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(name, subjectId, clampText(body.description, 10000, 'Beschreibung'), ts, ts);
    ctx.json(201, ctx.db.prepare('SELECT * FROM decks WHERE id = ?').get(result.lastInsertRowid));
  });

  router.add('PATCH', '/api/decks/:id', async (ctx) => {
    const deck = requireRow(ctx.db, 'decks', ctx.params.id, 'Stapel');
    const body = await ctx.jsonBody();
    const subjectId = body.subject_id !== undefined ? toInt(body.subject_id) : deck.subject_id;
    if (subjectId !== null) requireRow(ctx.db, 'subjects', subjectId, 'Fach');
    ctx.db
      .prepare('UPDATE decks SET name = ?, subject_id = ?, description = ?, updated_at = ? WHERE id = ?')
      .run(
        body.name !== undefined ? assertTitle(body.name, 'Name des Stapels', 160) : deck.name,
        subjectId,
        body.description !== undefined ? clampText(body.description, 10000, 'Beschreibung') : deck.description,
        nowISO(),
        deck.id
      );
    ctx.json(200, ctx.db.prepare('SELECT * FROM decks WHERE id = ?').get(deck.id));
  });

  router.add('DELETE', '/api/decks/:id', (ctx) => {
    const deck = requireRow(ctx.db, 'decks', ctx.params.id, 'Stapel');
    const cards = ctx.db.prepare('SELECT COUNT(*) AS c FROM cards WHERE deck_id = ?').get(deck.id).c;
    if (ctx.query.get('delete_cards') === '1') {
      ctx.db.prepare('DELETE FROM cards WHERE deck_id = ?').run(deck.id);
      ctx.db.prepare('DELETE FROM decks WHERE id = ?').run(deck.id);
      ctx.json(200, { ok: true, deletedCards: cards });
      return;
    }
    ctx.db.prepare('DELETE FROM decks WHERE id = ?').run(deck.id);
    ctx.json(200, { ok: true, keptCards: cards, note: 'Die Karten bleiben erhalten und sind keinem Stapel mehr zugeordnet.' });
  });

  // ------------------------------------------------------------ Karten
  router.add('GET', '/api/cards', (ctx) => {
    const q = ctx.query;
    const now = new Date();
    const settings = getSettings(ctx.db);
    const conditions = [];
    const params = [];
    const deckId = toInt(q.get('deck_id'));
    if (deckId !== null) {
      conditions.push('c.deck_id = ?');
      params.push(deckId);
    }
    const subjectId = toInt(q.get('subject_id'));
    if (subjectId !== null) {
      conditions.push('d.subject_id = ?');
      params.push(subjectId);
    }
    if (q.get('due') === '1') conditions.push('c.due IS NOT NULL AND c.due <= ?');
    if (q.get('due') === '1') params.push(now.toISOString());
    if (q.get('unassigned') === '1') conditions.push('c.deck_id IS NULL');
    if (q.get('hard') === '1') conditions.push("(c.lapses > 0 OR c.difficulty >= 6.5 OR c.state = 'relearning')");
    const state = q.get('state');
    if (state && ['new', 'learning', 'review', 'relearning'].includes(state)) {
      conditions.push('c.state = ?');
      params.push(state);
    }
    const search = String(q.get('q') ?? '').trim().toLowerCase();
    const limit = Math.min(Math.max(toInt(q.get('limit'), 300), 1), 2000);
    let rows = ctx.db
      .prepare(
        `SELECT c.*, d.name AS deck_name, d.subject_id AS subject_id, s.name AS subject_name, s.color AS subject_color
         FROM cards c LEFT JOIN decks d ON d.id = c.deck_id LEFT JOIN subjects s ON s.id = d.subject_id
         ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
         ORDER BY c.created_at DESC LIMIT ?`
      )
      .all(...params, limit);
    if (search) {
      rows = rows.filter((r) => `${r.front} ${r.back} ${r.topic} ${r.tags}`.toLowerCase().includes(search));
    }
    ctx.json(200, { total: rows.length, cards: rows.map((c) => cardOut(c, settings, now)) });
  });

  router.add('GET', '/api/cards/:id', (ctx) => {
    const card = requireRow(ctx.db, 'cards', ctx.params.id, 'Karte');
    const settings = getSettings(ctx.db);
    const row = ctx.db
      .prepare(
        `SELECT c.*, d.name AS deck_name, s.name AS subject_name FROM cards c
         LEFT JOIN decks d ON d.id = c.deck_id LEFT JOIN subjects s ON s.id = d.subject_id WHERE c.id = ?`
      )
      .get(card.id);
    ctx.json(200, cardOut(row, settings));
  });

  router.add('GET', '/api/cards/:id/history', (ctx) => {
    const card = requireRow(ctx.db, 'cards', ctx.params.id, 'Karte');
    const rows = ctx.db
      .prepare('SELECT * FROM reviews WHERE card_id = ? ORDER BY reviewed_at DESC LIMIT 100')
      .all(card.id)
      .map((r) => ({ ...r, rating_label: RATING_LABELS[r.rating] ?? String(r.rating) }));
    ctx.json(200, rows);
  });

  router.add('GET', '/api/cards/:id/preview', (ctx) => {
    const card = requireRow(ctx.db, 'cards', ctx.params.id, 'Karte');
    const settings = getSettings(ctx.db);
    ctx.json(200, {
      card_id: card.id,
      preview: previewCard(card, new Date(), settingNumber(settings, 'requested_retention', 0.9)),
      retention: settingNumber(settings, 'requested_retention', 0.9)
    });
  });

  router.add('POST', '/api/cards', async (ctx) => {
    const body = await ctx.jsonBody();
    const data = validateCardInput(ctx.db, body);
    const ts = nowISO();
    const result = ctx.db
      .prepare(
        `INSERT INTO cards (deck_id, type, front, back, options, correct_index, explanation, topic, tags, source_note_id, state, due, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', NULL, ?, ?)`
      )
      .run(
        data.deckId,
        data.type,
        data.front,
        data.back,
        data.options,
        data.correctIndex,
        data.explanation,
        data.topic,
        data.tags,
        data.sourceNoteId,
        ts,
        ts
      );
    const card = ctx.db.prepare('SELECT * FROM cards WHERE id = ?').get(result.lastInsertRowid);
    ctx.json(201, cardOut(card, getSettings(ctx.db)));
  });

  router.add('PATCH', '/api/cards/:id', async (ctx) => {
    const card = requireRow(ctx.db, 'cards', ctx.params.id, 'Karte');
    const body = await ctx.jsonBody();
    if (body.suspended !== undefined && Object.keys(body).length === 1) {
      ctx.db.prepare('UPDATE cards SET suspended = ?, updated_at = ? WHERE id = ?').run(body.suspended ? 1 : 0, nowISO(), card.id);
      ctx.json(200, cardOut(ctx.db.prepare('SELECT * FROM cards WHERE id = ?').get(card.id), getSettings(ctx.db)));
      return;
    }
    if (body.deck_id !== undefined && body.front === undefined) {
      const deckId = toInt(body.deck_id);
      if (deckId !== null) requireRow(ctx.db, 'decks', deckId, 'Stapel');
      ctx.db.prepare('UPDATE cards SET deck_id = ?, updated_at = ? WHERE id = ?').run(deckId, nowISO(), card.id);
      ctx.json(200, cardOut(ctx.db.prepare('SELECT * FROM cards WHERE id = ?').get(card.id), getSettings(ctx.db)));
      return;
    }
    const data = validateCardInput(ctx.db, body, card);
    ctx.db
      .prepare(
        `UPDATE cards SET deck_id = ?, type = ?, front = ?, back = ?, options = ?, correct_index = ?, explanation = ?, topic = ?, tags = ?, source_note_id = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        data.deckId,
        data.type,
        data.front,
        data.back,
        data.options,
        data.correctIndex,
        data.explanation,
        data.topic,
        data.tags,
        data.sourceNoteId,
        nowISO(),
        card.id
      );
    ctx.json(200, cardOut(ctx.db.prepare('SELECT * FROM cards WHERE id = ?').get(card.id), getSettings(ctx.db)));
  });

  router.add('DELETE', '/api/cards/:id', (ctx) => {
    const card = requireRow(ctx.db, 'cards', ctx.params.id, 'Karte');
    ctx.db.prepare('DELETE FROM cards WHERE id = ?').run(card.id);
    ctx.json(200, { ok: true });
  });

  router.add('POST', '/api/cards/:id/reset', (ctx) => {
    const card = requireRow(ctx.db, 'cards', ctx.params.id, 'Karte');
    const keepHistory = ctx.query.get('history') !== '0';
    if (!keepHistory) ctx.db.prepare('DELETE FROM reviews WHERE card_id = ?').run(card.id);
    ctx.db
      .prepare(
        `UPDATE cards SET state = 'new', due = NULL, stability = 0, difficulty = 0, reps = 0, lapses = 0,
         last_review = NULL, elapsed_days = 0, scheduled_days = 0, updated_at = ? WHERE id = ?`
      )
      .run(nowISO(), card.id);
    ctx.json(200, cardOut(ctx.db.prepare('SELECT * FROM cards WHERE id = ?').get(card.id), getSettings(ctx.db)));
  });

  // ------------------------------------------------------------ Lernmodus
  router.add('GET', '/api/study/queue', (ctx) => {
    const scope = String(ctx.query.get('scope') || 'due');
    const settings = getSettings(ctx.db);
    const { where, params, join, order } = queueWhere(scope, ctx.query, ctx.db);
    const limit = Math.min(Math.max(toInt(ctx.query.get('limit'), settingNumber(settings, 'review_limit', 20)), 1), 200);
    const rows = ctx.db
      .prepare(
        `SELECT c.*, d.name AS deck_name, s.name AS subject_name, s.color AS subject_color
         FROM cards c ${join} WHERE ${where} ORDER BY ${order} LIMIT ?`
      )
      .all(...params, limit);
    const totalAvailable = ctx.db
      .prepare(`SELECT COUNT(*) AS c FROM cards c ${join} WHERE ${where}`)
      .get(...params).c;
    ctx.json(200, {
      scope,
      limit,
      totalAvailable,
      cards: rows.map((c) => cardOut(c, settings)),
      retention: settingNumber(settings, 'requested_retention', 0.9)
    });
  });

  router.add('POST', '/api/cards/:id/review', async (ctx) => {
    const card = requireRow(ctx.db, 'cards', ctx.params.id, 'Karte');
    if (card.suspended) throw new HttpError(400, 'Diese Karte ist ausgesetzt.');
    const body = await ctx.jsonBody();
    const rating = toInt(body.rating);
    if (![1, 2, 3, 4].includes(rating)) throw new HttpError(400, 'Bewertung muss zwischen 1 (nicht gewusst) und 4 (sicher) liegen.');
    const settings = getSettings(ctx.db);
    const retention = settingNumber(settings, 'requested_retention', 0.9);
    const now = new Date();
    const result = applyRating(card, rating, now, retention);
    const duration = Math.min(Math.max(toInt(body.duration_ms, 0), 0), 4 * 3600 * 1000);

    ctx.db.exec('BEGIN IMMEDIATE;');
    try {
      ctx.db
        .prepare(
          `UPDATE cards SET state = ?, due = ?, stability = ?, difficulty = ?, reps = ?, lapses = ?, last_review = ?,
           elapsed_days = ?, scheduled_days = ?, updated_at = ? WHERE id = ?`
        )
        .run(
          result.state,
          result.due,
          result.stability,
          result.difficulty,
          result.reps,
          result.lapses,
          result.last_review,
          result.elapsed_days,
          result.scheduled_days,
          nowISO(),
          card.id
        );
      ctx.db
        .prepare(
          `INSERT INTO reviews (card_id, rating, reviewed_at, prev_state, new_state, prev_stability, new_stability,
           prev_difficulty, new_difficulty, scheduled_days, elapsed_days, duration_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          card.id,
          rating,
          result.last_review,
          result.prev_state,
          result.state,
          result.prev_stability,
          result.stability,
          result.prev_difficulty,
          result.difficulty,
          result.scheduled_days,
          result.elapsed_days,
          duration
        );
      ctx.db.exec('COMMIT;');
    } catch (err) {
      ctx.db.exec('ROLLBACK;');
      throw err;
    }

    const updated = ctx.db
      .prepare(
        `SELECT c.*, d.name AS deck_name, s.name AS subject_name FROM cards c
         LEFT JOIN decks d ON d.id = c.deck_id LEFT JOIN subjects s ON s.id = d.subject_id WHERE c.id = ?`
      )
      .get(card.id);
    ctx.json(200, {
      card: cardOut(updated, settings),
      review: {
        rating,
        rating_label: RATING_LABELS[rating],
        next_due: result.due,
        interval_days: result.intervalDays,
        interval_label: intervalLabel(result.intervalDays),
        stability: result.stability,
        difficulty: result.difficulty
      }
    });
  });

  void context;
}
