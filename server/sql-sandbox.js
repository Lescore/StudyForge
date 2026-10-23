/**
 * SQL-Spielplatz: sichere Ausführung von Nutzer-SQL auf einer Beispieldatenbank.
 *
 * Sicherheitskonzept
 * - Jede Anfrage bekommt eine frische In-Memory-Datenbank (nie die Nutzerdatenbank).
 * - Ausgeführt wird in einem eigenen Kindprozess (sql-sandbox-worker.js). Ein
 *   worker_threads-Worker reicht nicht: worker.terminate() kann eine laufende
 *   SQLite-Abfrage (nativer Code) nicht unterbrechen – der Thread liefe weiter.
 *   Den Kindprozess beenden wir nach dem Zeitlimit hart (SIGKILL).
 * - node:sqlite (v22) hat keinen Authorizer. Deshalb prüft ein eigener Tokenizer
 *   jede Anweisung vorab (Sperrliste + erlaubte Anfangsschlüsselwörter).
 * - Speicher: PRAGMA max_page_count, hard_heap_limit und temp_store=MEMORY im
 *   Kindprozess, dazu ein kleines V8-Heap-Limit.
 */
import { fork } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

export const SQL_LIMITS = {
  maxChars: 20000,
  maxStatements: 20,
  maxRows: 500,
  maxCellChars: 2000,
  maxResultChars: 2_000_000,
  timeoutMs: 2000,
  startupMs: 8000,
  maxConcurrent: 2,
  maxPageCount: 4096, // × 4096 Byte Seitengröße = 16 MiB Datenbankgröße
  heapLimitBytes: 96 * 1024 * 1024,
  v8HeapMb: 96
};

/* ------------------------------------------------------------------ Tokenizer */

/**
 * Zerlegt SQL in Token. Typen: word (Bezeichner/Schlüsselwort ohne Anführungszeichen),
 * qident ("…", […], `…`), string ('…', auch X'…'), number, semicolon, op.
 * Kommentare und Leerraum werden übersprungen. Wirft bei nicht geschlossenen
 * Zeichenketten/Bezeichnern (SQLite würde ebenfalls einen Fehler melden).
 */
export function tokenizeSql(sql) {
  const tokens = [];
  const n = sql.length;
  let i = 0;
  while (i < n) {
    const c = sql[i];
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (c === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2; // SQLite akzeptiert offene Kommentare bis zum Ende
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      let value = '';
      for (;;) {
        if (j >= n) throw new SqlGuardError(`Nicht geschlossene ${c === "'" ? 'Zeichenkette' : 'Bezeichner in Anführungszeichen'} (ab Zeichen ${i + 1}).`);
        if (sql[j] === c) {
          if (sql[j + 1] === c) {
            value += c;
            j += 2;
            continue;
          }
          break;
        }
        value += sql[j];
        j += 1;
      }
      tokens.push({ type: c === "'" ? 'string' : 'qident', value, start: i, end: j + 1 });
      i = j + 1;
      continue;
    }
    if (c === '[') {
      const end = sql.indexOf(']', i + 1);
      if (end === -1) throw new SqlGuardError(`Nicht geschlossener Bezeichner in eckigen Klammern (ab Zeichen ${i + 1}).`);
      tokens.push({ type: 'qident', value: sql.slice(i + 1, end), start: i, end: end + 1 });
      i = end + 1;
      continue;
    }
    if (c === ';') {
      tokens.push({ type: 'semicolon', value: ';', start: i, end: i + 1 });
      i += 1;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(sql[i + 1] ?? ''))) {
      let j = i + 1;
      while (j < n && /[0-9a-zA-Z_.]/.test(sql[j])) {
        if ((sql[j] === 'e' || sql[j] === 'E') && (sql[j + 1] === '+' || sql[j + 1] === '-')) j += 1;
        j += 1;
      }
      tokens.push({ type: 'number', value: sql.slice(i, j), start: i, end: j });
      i = j;
      continue;
    }
    // Bezeichner: Buchstaben, Ziffern, _, $ und alle Nicht-ASCII-Zeichen (wie SQLite)
    if (/[A-Za-z_\u0080-￿]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_$\u0080-￿]/.test(sql[j])) j += 1;
      // Blob-Literal X'…' als ein Token behandeln
      if (j === i + 1 && (c === 'x' || c === 'X') && sql[j] === "'") {
        i = j;
        continue; // Zeichenkette folgt als eigenes Token
      }
      tokens.push({ type: 'word', value: sql.slice(i, j), upper: sql.slice(i, j).toUpperCase(), start: i, end: j });
      i = j;
      continue;
    }
    // Parameter ?, :name, @name, $name – im Spielplatz nicht nutzbar, aber harmlos
    tokens.push({ type: 'op', value: c, start: i, end: i + 1 });
    i += 1;
  }
  return tokens;
}

export class SqlGuardError extends Error {
  constructor(message, statement = null) {
    super(message);
    this.name = 'SqlGuardError';
    this.statement = statement;
  }
}

/** Trennt in Anweisungen (an ; außerhalb von Zeichenketten/Kommentaren). Leere Anweisungen entfallen. */
export function splitStatements(sql) {
  const tokens = tokenizeSql(sql);
  const statements = [];
  let current = [];
  const flush = () => {
    if (current.length) {
      statements.push({ text: sql.slice(current[0].start, current[current.length - 1].end), tokens: current });
    }
    current = [];
  };
  for (const token of tokens) {
    if (token.type === 'semicolon') flush();
    else current.push(token);
  }
  flush();
  return statements;
}

const ALLOWED_START = new Set(['SELECT', 'WITH', 'INSERT', 'UPDATE', 'DELETE', 'REPLACE', 'CREATE', 'DROP', 'ALTER', 'EXPLAIN', 'BEGIN', 'COMMIT', 'END', 'ROLLBACK', 'VALUES']);
const FORBIDDEN_WORDS = {
  ATTACH: 'ATTACH ist im Spielplatz gesperrt (kein Zugriff auf weitere Datenbankdateien).',
  DETACH: 'DETACH ist im Spielplatz gesperrt.',
  VACUUM: 'VACUUM (auch VACUUM INTO) ist im Spielplatz gesperrt (würde Dateien schreiben).',
  PRAGMA: 'PRAGMA-Anweisungen sind im Spielplatz gesperrt (die Einstellungen der Sandbox sind fest).',
  TRIGGER: 'Trigger sind im Spielplatz nicht erlaubt.',
  VIRTUAL: 'Virtuelle Tabellen (CREATE VIRTUAL TABLE) sind im Spielplatz nicht erlaubt.',
  LOAD_EXTENSION: 'load_extension ist gesperrt – Erweiterungen können nicht geladen werden.'
};

/**
 * Prüft eine Anweisung. Wirft SqlGuardError mit verständlicher Meldung.
 * `index` ist 1-basiert (für die Meldung).
 */
export function checkStatement(statement, index = 1) {
  const fail = (message) => {
    throw new SqlGuardError(`Anweisung ${index}: ${message}`, index);
  };
  for (const token of statement.tokens) {
    if (token.type === 'word' && FORBIDDEN_WORDS[token.upper]) fail(FORBIDDEN_WORDS[token.upper]);
    if (token.type === 'word' || token.type === 'qident') {
      const name = token.value.toLowerCase();
      if (name === 'load_extension') fail(FORBIDDEN_WORDS.LOAD_EXTENSION);
      if (name.startsWith('pragma_')) fail('PRAGMA-Funktionen (pragma_…) sind im Spielplatz gesperrt.');
    }
  }
  const words = statement.tokens.filter((t) => t.type === 'word');
  const first = statement.tokens[0];
  if (!first || first.type !== 'word' || !ALLOWED_START.has(first.upper)) {
    fail(`„${String(first?.value ?? '').slice(0, 30)}“ ist hier nicht erlaubt. Erlaubt sind SELECT, WITH, VALUES, INSERT, UPDATE, DELETE, REPLACE, CREATE TABLE/VIEW/INDEX, DROP, ALTER, EXPLAIN, BEGIN, COMMIT und ROLLBACK.`);
  }
  if (first.upper === 'CREATE') {
    let k = 1;
    while (words[k] && ['TEMP', 'TEMPORARY', 'UNIQUE'].includes(words[k].upper)) k += 1;
    const kind = words[k]?.upper;
    if (!['TABLE', 'VIEW', 'INDEX'].includes(kind)) fail('Nach CREATE sind nur TABLE, VIEW und INDEX erlaubt.');
  }
  return true;
}

/** Zerlegt und prüft das gesamte SQL. Gibt die Anweisungen zurück oder wirft SqlGuardError. */
export function prepareScript(sql) {
  if (typeof sql !== 'string') throw new SqlGuardError('Bitte SQL als Text übergeben.');
  if (sql.length > SQL_LIMITS.maxChars) {
    throw new SqlGuardError(`Der SQL-Text ist zu lang (höchstens ${SQL_LIMITS.maxChars.toLocaleString('de-DE')} Zeichen).`);
  }
  const statements = splitStatements(sql);
  if (!statements.length) throw new SqlGuardError('Keine SQL-Anweisung gefunden.');
  if (statements.length > SQL_LIMITS.maxStatements) {
    throw new SqlGuardError(`Zu viele Anweisungen (${statements.length}); höchstens ${SQL_LIMITS.maxStatements} pro Ausführung.`);
  }
  statements.forEach((statement, i) => checkStatement(statement, i + 1));
  return statements.map((s) => s.text);
}

/* ------------------------------------------------------------ Beispieldaten */

export const DATASETS = {
  hochschule: {
    label: 'Hochschule (Studierende, Kurse, Noten)',
    sql: `
CREATE TABLE dozierende (
  dozent_id   INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  fachgebiet  TEXT NOT NULL,
  buero       TEXT
);
CREATE TABLE studierende (
  matr_nr     INTEGER PRIMARY KEY,
  vorname     TEXT NOT NULL,
  nachname    TEXT NOT NULL,
  studiengang TEXT NOT NULL,
  semester    INTEGER NOT NULL CHECK (semester >= 1),
  email       TEXT UNIQUE
);
CREATE TABLE kurse (
  kurs_id     TEXT PRIMARY KEY,
  titel       TEXT NOT NULL,
  ects        INTEGER NOT NULL CHECK (ects > 0),
  dozent_id   INTEGER REFERENCES dozierende(dozent_id)
);
CREATE TABLE belegungen (
  matr_nr     INTEGER NOT NULL REFERENCES studierende(matr_nr),
  kurs_id     TEXT NOT NULL REFERENCES kurse(kurs_id),
  semester    TEXT NOT NULL,
  PRIMARY KEY (matr_nr, kurs_id)
);
CREATE TABLE noten (
  noten_id    INTEGER PRIMARY KEY,
  matr_nr     INTEGER NOT NULL,
  kurs_id     TEXT NOT NULL,
  versuch     INTEGER NOT NULL DEFAULT 1,
  note        REAL CHECK (note BETWEEN 1.0 AND 5.0),
  datum       TEXT NOT NULL,
  FOREIGN KEY (matr_nr, kurs_id) REFERENCES belegungen(matr_nr, kurs_id)
);
INSERT INTO dozierende VALUES
  (1, 'Prof. Dr. Anna Schmidt', 'Datenbanken', 'B 2.14'),
  (2, 'Prof. Dr. Jonas Weber', 'Rechnernetze', 'B 3.02'),
  (3, 'Dr. Leyla Yilmaz', 'Programmierung', 'A 1.10'),
  (4, 'Prof. Dr. Marta Nowak', 'Theoretische Informatik', NULL),
  (5, 'Dr. Felix Braun', 'Betriebssysteme', 'C 0.07');
INSERT INTO studierende VALUES
  (100101, 'Lena', 'Fischer', 'Informatik', 3, 'lena.fischer@example.org'),
  (100102, 'Tim', 'Becker', 'Informatik', 3, 'tim.becker@example.org'),
  (100103, 'Sara', 'Hoffmann', 'Wirtschaftsinformatik', 5, NULL),
  (100104, 'Paul', 'Schulz', 'Informatik', 1, 'paul.schulz@example.org'),
  (100105, 'Mia', 'Wagner', 'Medieninformatik', 2, 'mia.wagner@example.org'),
  (100106, 'Noah', 'Koch', 'Wirtschaftsinformatik', 4, 'noah.koch@example.org'),
  (100107, 'Emma', 'Richter', 'Informatik', 6, NULL),
  (100108, 'Ben', 'Klein', 'Medieninformatik', 1, 'ben.klein@example.org'),
  (100109, 'Hanna', 'Wolf', 'Informatik', 2, 'hanna.wolf@example.org'),
  (100110, 'Luca', 'Neumann', 'Wirtschaftsinformatik', 3, 'luca.neumann@example.org'),
  (100111, 'Zoe', 'Schwarz', 'Informatik', 5, 'zoe.schwarz@example.org'),
  (100112, 'Elias', 'Zimmermann', 'Medieninformatik', 4, NULL);
INSERT INTO kurse VALUES
  ('DB1', 'Datenbanksysteme', 6, 1),
  ('DB2', 'Fortgeschrittene Datenbanken', 5, 1),
  ('RN1', 'Rechnernetze', 6, 2),
  ('PR1', 'Programmieren 1', 8, 3),
  ('PR2', 'Programmieren 2', 8, 3),
  ('TI1', 'Theoretische Informatik', 6, 4),
  ('BS1', 'Betriebssysteme', 5, 5),
  ('SE1', 'Softwaretechnik', 6, NULL);
INSERT INTO belegungen VALUES
  (100101, 'DB1', 'WS 2025/26'), (100101, 'RN1', 'WS 2025/26'), (100101, 'PR2', 'SS 2025'),
  (100102, 'DB1', 'WS 2025/26'), (100102, 'PR2', 'SS 2025'), (100102, 'TI1', 'WS 2025/26'),
  (100103, 'DB1', 'WS 2024/25'), (100103, 'DB2', 'SS 2025'), (100103, 'SE1', 'WS 2025/26'),
  (100104, 'PR1', 'WS 2025/26'),
  (100105, 'PR1', 'WS 2024/25'), (100105, 'PR2', 'SS 2025'),
  (100106, 'DB1', 'WS 2024/25'), (100106, 'BS1', 'WS 2025/26'), (100106, 'SE1', 'WS 2025/26'),
  (100107, 'DB2', 'SS 2025'), (100107, 'RN1', 'WS 2024/25'), (100107, 'TI1', 'WS 2024/25'), (100107, 'BS1', 'WS 2025/26'),
  (100109, 'PR1', 'WS 2024/25'), (100109, 'PR2', 'SS 2025'),
  (100110, 'DB1', 'WS 2025/26'), (100110, 'RN1', 'WS 2025/26'),
  (100111, 'TI1', 'WS 2024/25'), (100111, 'BS1', 'WS 2025/26'), (100111, 'DB2', 'SS 2025');
INSERT INTO noten (noten_id, matr_nr, kurs_id, versuch, note, datum) VALUES
  (1, 100101, 'DB1', 1, 1.7, '2026-02-12'),
  (2, 100101, 'RN1', 1, 2.3, '2026-02-18'),
  (3, 100101, 'PR2', 1, 1.3, '2025-07-21'),
  (4, 100102, 'DB1', 1, 5.0, '2026-02-12'),
  (5, 100102, 'DB1', 2, 3.0, '2026-04-02'),
  (6, 100102, 'PR2', 1, 2.0, '2025-07-21'),
  (7, 100103, 'DB1', 1, 1.0, '2025-02-10'),
  (8, 100103, 'DB2', 1, 1.7, '2025-07-15'),
  (9, 100105, 'PR1', 1, 2.7, '2025-02-20'),
  (10, 100105, 'PR2', 1, 3.3, '2025-07-21'),
  (11, 100106, 'DB1', 1, 4.0, '2025-02-10'),
  (12, 100107, 'DB2', 1, 1.3, '2025-07-15'),
  (13, 100107, 'RN1', 1, 2.0, '2025-02-17'),
  (14, 100107, 'TI1', 1, 5.0, '2025-02-24'),
  (15, 100107, 'TI1', 2, 3.7, '2025-04-07'),
  (16, 100109, 'PR1', 1, 1.0, '2025-02-20'),
  (17, 100109, 'PR2', 1, 1.7, '2025-07-21'),
  (18, 100111, 'TI1', 1, 2.3, '2025-02-24'),
  (19, 100111, 'DB2', 1, NULL, '2025-07-15');
`
  },
  leer: {
    label: 'Leere Datenbank',
    sql: ''
  }
};

export function datasetSql(name) {
  const dataset = DATASETS[name || 'hochschule'];
  if (!dataset) throw new SqlGuardError('Unbekannter Datensatz.');
  return dataset.sql;
}

/** Schema (Tabellen, Spalten, Typen, Schlüssel, Zeilenzahl) aus einer frisch befüllten DB lesen. */
export function readSchema(name = 'hochschule') {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys = ON;');
    const sql = datasetSql(name);
    if (sql) db.exec(sql);
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all();
    return tables.map(({ name: table }) => {
      const quoted = `"${table.replace(/"/g, '""')}"`;
      const columns = db.prepare(`PRAGMA table_info(${quoted})`).all();
      const foreign = db.prepare(`PRAGMA foreign_key_list(${quoted})`).all();
      const rows = db.prepare(`SELECT count(*) AS n FROM ${quoted}`).get().n;
      return {
        name: table,
        rows: Number(rows),
        columns: columns.map((c) => {
          const fk = foreign.find((f) => f.from === c.name);
          return {
            name: c.name,
            type: c.type || '',
            notNull: Boolean(c.notnull),
            pk: Number(c.pk),
            references: fk ? `${fk.table}(${fk.to ?? ''})` : null
          };
        })
      };
    });
  } finally {
    db.close();
  }
}

/* ------------------------------------------------------------ Ausführung */

const WORKER_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sql-sandbox-worker.js');
let running = 0;

/**
 * Führt geprüftes SQL im Kindprozess aus.
 * Ergebnis: { ok, results: [...], error?: { statement, message, kind } , ms }
 */
export async function runSandbox(sql, dataset = 'hochschule') {
  let statements;
  try {
    datasetSql(dataset);
    statements = prepareScript(sql);
  } catch (error) {
    if (error instanceof SqlGuardError) {
      return { ok: false, results: [], error: { statement: error.statement, message: error.message, kind: 'blocked' } };
    }
    throw error;
  }
  if (running >= SQL_LIMITS.maxConcurrent) {
    return { ok: false, results: [], error: { statement: null, message: 'Der SQL-Spielplatz ist gerade ausgelastet. Bitte versuche es gleich noch einmal.', kind: 'busy' } };
  }
  running += 1;
  try {
    return await execInChild(statements, dataset);
  } finally {
    running -= 1;
  }
}

function execInChild(statements, dataset) {
  return new Promise((resolve) => {
    const child = fork(WORKER_PATH, [], {
      execArgv: ['--disable-warning=ExperimentalWarning', `--max-old-space-size=${SQL_LIMITS.v8HeapMb}`],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      serialization: 'advanced'
    });
    let settled = false;
    let timer = null;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      resolve(value);
    };
    const timeoutError = () =>
      finish({ ok: false, results: [], error: { statement: null, message: `Abfrage nach ${SQL_LIMITS.timeoutMs / 1000} s abgebrochen (Zeitlimit). Prüfe z. B. rekursive CTEs auf eine Abbruchbedingung.`, kind: 'timeout' } });
    timer = setTimeout(() => finish({ ok: false, results: [], error: { statement: null, message: 'Der SQL-Prozess ist nicht rechtzeitig gestartet.', kind: 'internal' } }), SQL_LIMITS.startupMs);
    child.on('message', (message) => {
      if (message?.type === 'ready') {
        clearTimeout(timer);
        timer = setTimeout(timeoutError, SQL_LIMITS.timeoutMs);
        child.send({ type: 'run', statements, datasetSql: datasetSql(dataset), limits: SQL_LIMITS });
      } else if (message?.type === 'result') {
        finish(message.payload);
      }
    });
    child.on('error', () => finish({ ok: false, results: [], error: { statement: null, message: 'Der SQL-Prozess konnte nicht gestartet werden.', kind: 'internal' } }));
    child.on('exit', (code, signal) => {
      if (settled) return;
      finish({
        ok: false,
        results: [],
        error: { statement: null, message: `Die Ausführung wurde abgebrochen (Speicher- oder Ressourcengrenze erreicht${signal ? `, Signal ${signal}` : code ? `, Code ${code}` : ''}).`, kind: 'internal' }
      });
    });
  });
}
