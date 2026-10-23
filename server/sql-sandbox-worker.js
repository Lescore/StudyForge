/**
 * Kindprozess des SQL-Spielplatzes. Bekommt bereits geprüfte Anweisungen,
 * führt sie auf einer frischen In-Memory-Datenbank aus und schickt das Ergebnis
 * per IPC zurück. Der Elternprozess beendet diesen Prozess nach dem Zeitlimit.
 */
import { DatabaseSync } from 'node:sqlite';

const DML = new Set(['INSERT', 'UPDATE', 'DELETE', 'REPLACE']);

/** Wert für JSON/IPC aufbereiten: NULL bleibt null, Sonderfälle als { t, v }. */
function cell(value, limits, state) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') {
    if (value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(value);
    state.size += 20;
    return { t: 'int', v: value.toString() };
  }
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value;
    return { t: 'num', v: Number.isNaN(value) ? 'NaN' : value > 0 ? 'Infinity' : '-Infinity' };
  }
  if (value instanceof Uint8Array) {
    const shown = Math.min(value.length, Math.floor(limits.maxCellChars / 2));
    const hex = Buffer.from(value.buffer, value.byteOffset, shown).toString('hex').toUpperCase();
    state.size += hex.length;
    return { t: 'blob', v: hex, bytes: value.length, cut: shown < value.length };
  }
  const text = String(value);
  if (text.length > limits.maxCellChars) {
    state.size += limits.maxCellChars;
    return { t: 'text', v: text.slice(0, limits.maxCellChars), length: text.length, cut: true };
  }
  state.size += text.length;
  return text;
}

function firstWords(sql) {
  // Schlüsselwörter nach führenden Kommentaren (die Anweisung wurde vorher geprüft)
  const cleaned = sql.replace(/^(\s|--[^\n]*\n?|\/\*[\s\S]*?\*\/)+/, '');
  return cleaned.slice(0, 40).toUpperCase();
}

/** Deutsche Zusatzhinweise zu Grenzen der Sandbox (die SQLite-Meldung bleibt erhalten). */
function hint(message) {
  if (/database or disk is full/i.test(message)) return ' – Speichergrenze des Spielplatzes erreicht (max. 16 MiB Datenbankgröße).';
  if (/out of memory|string or blob too big/i.test(message)) return ' – Speichergrenze des Spielplatzes erreicht.';
  return '';
}

function run({ statements, datasetSql, limits }) {
  const started = performance.now();
  const results = [];
  const state = { size: 0 };
  const db = new DatabaseSync(':memory:');
  try {
    // Feste Grenzen vor der Nutzer-SQL. hard_heap_limit gilt prozessweit –
    // hier unbedenklich, weil dieser Prozess nur diese eine Abfrage ausführt.
    db.exec(`PRAGMA hard_heap_limit = ${limits.heapLimitBytes};
      PRAGMA temp_store = MEMORY;
      PRAGMA foreign_keys = ON;`);
    if (datasetSql) db.exec(datasetSql);
    db.exec(`PRAGMA max_page_count = ${limits.maxPageCount};`);
  } catch (error) {
    return { ok: false, results, error: { statement: null, message: `Beispieldatenbank konnte nicht angelegt werden: ${error.message}`, kind: 'internal' } };
  }
  for (let i = 0; i < statements.length; i += 1) {
    const sql = statements[i];
    const t0 = performance.now();
    try {
      const stmt = db.prepare(sql);
      stmt.setReadBigInts(true);
      const columns = stmt.columns().map((c) => c.name);
      const entry = { index: i + 1, sql: sql.length > 400 ? `${sql.slice(0, 400)} …` : sql };
      if (columns.length) {
        stmt.setReturnArrays(true);
        const rows = [];
        let truncated = false;
        for (const row of stmt.iterate()) {
          if (rows.length >= limits.maxRows || state.size > limits.maxResultChars) {
            truncated = true;
            break;
          }
          state.size += 4 * row.length;
          rows.push(row.map((value) => cell(value, limits, state)));
        }
        Object.assign(entry, { kind: 'rows', columns, rows, truncated });
      } else {
        const info = stmt.run();
        const head = firstWords(sql);
        const word = head.match(/^[A-Z]+/)?.[0] ?? '';
        if (DML.has(word) || word === 'WITH') entry.kind = 'changes';
        else entry.kind = 'ok';
        entry.changes = entry.kind === 'changes' ? Number(info.changes) : null;
      }
      entry.ms = Math.round((performance.now() - t0) * 10) / 10;
      results.push(entry);
    } catch (error) {
      db.close();
      return {
        ok: false,
        results,
        error: { statement: i + 1, message: `Anweisung ${i + 1}: ${error.message}${hint(error.message)}`, kind: 'sqlite' },
        ms: Math.round(performance.now() - started)
      };
    }
  }
  db.close();
  return { ok: true, results, ms: Math.round(performance.now() - started) };
}

process.on('message', (message) => {
  if (message?.type !== 'run') return;
  let payload;
  try {
    payload = run(message);
  } catch (error) {
    payload = { ok: false, results: [], error: { statement: null, message: `Interner Fehler: ${error.message}`, kind: 'internal' } };
  }
  process.send({ type: 'result', payload }, () => process.exit(0));
});
process.on('disconnect', () => process.exit(0));
process.send({ type: 'ready' });
