import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startApp } from './helpers.js';
import { splitStatements, prepareScript, tokenizeSql, SqlGuardError } from '../server/sql-sandbox.js';
import {
  parseAttributes,
  parseFds,
  closure,
  candidateKeys,
  minimalCover,
  analyzeSchema,
  analyzeText,
  maskToNames,
  namesToMask,
  synthesize3NF,
  fdText,
  project,
  naturalJoin,
  fdViolations
} from '../public/js/tools/core/db-normalize.js';
import { NORMALIZE_EXAMPLES, buildSteps } from '../public/js/tools/core/db-normalize-examples.js';

/* ------------------------------------------------------------ Normalisierung */

const schema = (attrText, fdLines) => {
  const attributes = parseAttributes(attrText);
  const fds = parseFds(fdLines, attributes);
  return { attributes, fds, names: (mask) => maskToNames(mask, attributes) };
};

test('Attributhülle: A → B, B → C ergibt {A}⁺ = {A, B, C}', () => {
  const s = schema('A, B, C, D', 'A -> B\nB -> C');
  const res = closure(namesToMask(['A'], s.attributes), s.fds, { trace: true });
  assert.deepEqual(s.names(res.mask), ['A', 'B', 'C']);
  assert.equal(res.log.length, 2);
  assert.deepEqual(s.names(closure(namesToMask(['D'], s.attributes), s.fds)), ['D']);
});

test('Kandidatenschlüssel: AB → C, C → D, D → A hat die Schlüssel AB, BC, BD (3NF, nicht BCNF)', () => {
  const s = schema('A B C D', 'A, B -> C\nC -> D\nD -> A');
  const keys = candidateKeys(4, s.fds).map((k) => s.names(k).join(''));
  assert.deepEqual(keys.sort(), ['AB', 'BC', 'BD']);
  const a = analyzeSchema(s.attributes, s.fds);
  assert.equal(a.nonPrime, 0, 'alle Attribute sind prim');
  assert.equal(a.nf2.ok, true);
  assert.equal(a.nf3.ok, true);
  assert.equal(a.bcnf.ok, false);
  assert.equal(a.bcnf.violations.length, 2);
  assert.equal(a.highest, '3NF');
});

test('Transitive Abhängigkeit: A → B, B → C ist 2NF, aber nicht 3NF', () => {
  const s = schema('A, B, C', 'A -> B\nB -> C');
  const a = analyzeSchema(s.attributes, s.fds);
  assert.deepEqual(a.keys.map(s.names), [['A']]);
  assert.equal(a.highest, '2NF');
  assert.equal(a.nf3.violations.length, 1);
  assert.equal(a.nf3.violations[0].kind, 'transitiv');
  assert.equal(fdText(a.nf3.violations[0], s.attributes), 'B → C');
});

test('Partielle Abhängigkeit: Studierenden-Kurs-Beispiel ist nur in 1NF', () => {
  const a = analyzeText({
    attributes: 'MatrNr, Name, Studiengang, Fakultaet, KursNr, KursTitel, Note',
    fds: 'MatrNr -> Name, Studiengang\nStudiengang -> Fakultaet\nKursNr -> KursTitel\nMatrNr, KursNr -> Note'
  });
  assert.deepEqual(a.keys.map((k) => maskToNames(k, a.attributes)), [['MatrNr', 'KursNr']]);
  assert.equal(a.highest, '1NF');
  const partial = a.nf2.violations.map((v) => `${maskToNames(v.lhs, a.attributes)}:${maskToNames(v.rhs, a.attributes)}`);
  assert.deepEqual(partial.sort(), ['KursNr:KursTitel', 'MatrNr:Name,Studiengang,Fakultaet']);
  assert.equal(a.nf3.violations.find((v) => fdText(v, a.attributes) === 'Studiengang → Fakultaet').kind, 'transitiv');
});

test('Minimale Überdeckung: {A→BC, B→C, A→B, AB→C} wird zu {A→B, B→C}', () => {
  const s = schema('A, B, C', 'A -> B, C\nB -> C\nA -> B\nA, B -> C');
  const cover = minimalCover(s.fds).map((fd) => fdText(fd, s.attributes)).sort();
  assert.deepEqual(cover, ['A → B', 'B → C']);
});

test('3NF-Synthese ergänzt eine Schlüsselrelation', () => {
  const s = schema('A, B, C, D', 'A -> B\nC -> D');
  const rel = synthesize3NF(4, s.fds).map((r) => s.names(r.attrs).join(''));
  assert.deepEqual(rel, ['AB', 'CD', 'AC']);
});

test('Ohne FDs ist die Menge aller Attribute der einzige Schlüssel (BCNF)', () => {
  const a = analyzeText({ attributes: 'X, Y', fds: '' });
  assert.deepEqual(a.keys.map((k) => maskToNames(k, a.attributes)), [['X', 'Y']]);
  assert.equal(a.highest, 'BCNF');
});

test('Attribute werden aus den FDs übernommen, wenn keine Liste angegeben ist; Hüllenabfrage', () => {
  const a = analyzeText({ attributes: '', fds: 'A → B\nB => C', closureOf: 'B' });
  assert.deepEqual(a.attributes, ['A', 'B', 'C']);
  assert.deepEqual(maskToNames(a.closureQuery.mask, a.attributes), ['B', 'C']);
});

test('Eingabefehler werden verständlich gemeldet', () => {
  assert.throws(() => analyzeText({ attributes: 'A, B', fds: 'A -> Z' }), /Zeile 1: Attribut „Z“ steht nicht in der Attributliste/);
  assert.throws(() => analyzeText({ attributes: 'A, B', fds: 'A B' }), /genau ein Pfeil/);
  assert.throws(() => analyzeText({ attributes: 'A, B', fds: '\n -> B' }), /Zeile 2: Die linke Seite ist leer/);
  assert.throws(() => analyzeText({ attributes: 'A, B', fds: 'A -> B -> A' }), /genau ein Pfeil/);
  assert.throws(() => analyzeText({ attributes: '', fds: '' }), /mindestens|Bitte/);
  assert.throws(() => parseAttributes('A, B(C)'), /Ungültiger Attributname/);
  const many = Array.from({ length: 17 }, (_, i) => `A${i}`).join(', ');
  assert.throws(() => analyzeText({ attributes: many, fds: '' }), /Höchstens 16 Attribute/);
});

test('Beispiel-Zerlegungen: Daten erfüllen die FDs, Schlüssel eindeutig, Verbund verlustfrei', () => {
  for (const example of NORMALIZE_EXAMPLES) {
    const steps = buildSteps(example);
    assert.deepEqual(steps.map((s) => s.id), ['UNF', '1NF', '2NF', '3NF']);
    const flat = steps[1].tables[0].rows;
    for (const [lhs, rhs] of example.fds) assert.equal(fdViolations(flat, lhs, rhs).length, 0, `${example.id}: ${lhs} → ${rhs}`);
    assert.equal(steps[1].tables[0].highest, '1NF');
    assert.ok(steps[1].anomalies.length >= 3, 'alle drei Anomalien');
    for (const t of steps[2].tables) assert.ok(['2NF', '3NF', 'BCNF'].includes(t.highest), `${t.name} in 2NF`);
    assert.ok(steps[2].tables.some((t) => t.highest === '2NF'), 'eine Tabelle ist noch nicht in 3NF');
    for (const t of steps[3].tables) {
      assert.ok(['3NF', 'BCNF'].includes(t.highest), `${example.id}/${t.name} in 3NF`);
      assert.equal(project(t.rows, t.key).length, t.rows.length, `Schlüssel von ${t.name} eindeutig`);
    }
    const joined = steps[3].tables.map((t) => t.rows).reduce((a, b) => naturalJoin(a, b));
    assert.equal(joined.length, flat.length, `${example.id}: verlustfreier Verbund`);
    assert.ok(Object.keys(steps[3].tables.at(-1).fks).length >= 2, 'Fremdschlüssel erkannt');
  }
});

/* ------------------------------------------------------------ Tokenizer/Sperren */

test('Tokenizer: Trennung an ; außerhalb von Zeichenketten, Bezeichnern und Kommentaren', () => {
  const parts = splitStatements(`SELECT 'a;b'; SELECT "x;y" FROM [t;] -- ; Kommentar\n; /* ; */ SELECT \`q;\`;;  `);
  assert.deepEqual(parts.map((p) => p.text), [`SELECT 'a;b'`, 'SELECT "x;y" FROM [t;]', 'SELECT `q;`']);
  assert.equal(tokenizeSql("SELECT 'it''s'")[1].value, "it's");
  assert.throws(() => tokenizeSql("SELECT 'offen"), /Nicht geschlossene Zeichenkette/);
  assert.deepEqual(prepareScript("SELECT 'ATTACH'; SELECT 'PRAGMA x' AS \"pragma\""), ["SELECT 'ATTACH'", `SELECT 'PRAGMA x' AS "pragma"`]);
});

test('Sperren: verbotene Anweisungen inkl. Umgehungsversuchen', () => {
  const blocked = [
    "ATTACH '/tmp/x.db' AS x",
    "attach database '/tmp/x.db' as x",
    "AtTaCh/**/'/tmp/x.db' AS x",
    "SELECT 1; ATTACH '/tmp/x.db' AS x",
    "/* Kommentar */ ATTACH '/tmp/x.db' AS x",
    "-- Kommentar\nDETACH x",
    'VACUUM',
    "VACUUM INTO '/tmp/kopie.db'",
    'vacuum/* */into/**/\'/tmp/k.db\'',
    'PRAGMA foreign_keys = OFF',
    'pragma max_page_count = 999999',
    'EXPLAIN PRAGMA table_info(kurse)',
    "SELECT * FROM pragma_table_info('kurse')",
    'SELECT * FROM "pragma_table_info"(\'kurse\')',
    "SELECT load_extension('/tmp/x.so')",
    "SELECT \"LOAD_EXTENSION\"('/tmp/x.so')",
    'CREATE TRIGGER t AFTER INSERT ON kurse BEGIN SELECT 1; END',
    'CREATE TEMP TRIGGER t AFTER INSERT ON kurse BEGIN SELECT 1; END',
    'CREATE VIRTUAL TABLE v USING fts5(x)',
    'REINDEX',
    'ANALYZE',
    'SAVEPOINT a',
    'CREATE UNIQUE TRIGGER x',
    '; ; ',
    `SELECT ${'1'.repeat(20001)}`,
    Array.from({ length: 21 }, () => 'SELECT 1').join(';')
  ];
  for (const sql of blocked) assert.throws(() => prepareScript(sql), SqlGuardError, sql.slice(0, 60));
  assert.throws(() => prepareScript('SELECT 1; VACUUM'), /Anweisung 2: VACUUM/);
  assert.throws(() => prepareScript('PrAgMa x'), /PRAGMA/);
});

test('Sperren: erlaubte Anweisungen werden durchgelassen', () => {
  const allowed = [
    "SELECT 'ATTACH', 'VACUUM INTO x', 'PRAGMA' AS \"pragma\"",
    'WITH x AS (SELECT 1) SELECT * FROM x',
    'VALUES (1), (2)',
    "INSERT INTO kurse VALUES ('X', 'Y', 1, NULL)",
    'UPDATE kurse SET ects = 5',
    'DELETE FROM noten',
    "REPLACE INTO kurse VALUES ('X', 'Y', 1, NULL)",
    'CREATE TABLE t (x)',
    'CREATE TEMP TABLE t (x)',
    'CREATE VIEW v AS SELECT 1',
    'CREATE UNIQUE INDEX i ON kurse(titel)',
    'DROP TABLE noten',
    'ALTER TABLE kurse ADD COLUMN raum TEXT',
    'EXPLAIN QUERY PLAN SELECT * FROM kurse',
    'BEGIN; COMMIT; BEGIN; ROLLBACK',
    'SELECT [attach] FROM t',
    'select * from kurse -- ATTACH im Kommentar'
  ];
  for (const sql of allowed) assert.doesNotThrow(() => prepareScript(sql), sql);
});

/* ------------------------------------------------------------ HTTP-API */

const sql = (app, text, dataset) => app.post('/api/tools/sql', dataset ? { sql: text, dataset } : { sql: text });

test('SQL-Spielplatz: SELECT, JOIN, mehrere Anweisungen, NULL und Schema', async (t) => {
  const app = await startApp(t);
  const schemaRes = (await app.expect('GET', '/api/tools/sql/schema')).json;
  assert.deepEqual(schemaRes.tables.map((x) => x.name), ['dozierende', 'studierende', 'kurse', 'belegungen', 'noten']);
  const kurse = schemaRes.tables.find((x) => x.name === 'kurse');
  assert.equal(kurse.columns.find((c) => c.name === 'kurs_id').pk, 1);
  assert.equal(kurse.columns.find((c) => c.name === 'dozent_id').references, 'dozierende(dozent_id)');

  const res = await sql(app, `SELECT titel, ects FROM kurse WHERE ects >= 8 ORDER BY titel;
    SELECT k.titel, d.name FROM kurse k LEFT JOIN dozierende d ON d.dozent_id = k.dozent_id WHERE k.kurs_id = 'SE1'`);
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
  assert.equal(res.json.results.length, 2);
  assert.deepEqual(res.json.results[0].columns, ['titel', 'ects']);
  assert.deepEqual(res.json.results[0].rows, [['Programmieren 1', 8], ['Programmieren 2', 8]]);
  assert.deepEqual(res.json.results[1].rows, [['Softwaretechnik', null]]);

  const dml = await sql(app, "INSERT INTO dozierende VALUES (9, 'Test', 'X', NULL); UPDATE kurse SET ects = ects + 1 WHERE dozent_id = 1; CREATE TABLE t(x); SELECT count(*) FROM dozierende");
  assert.equal(dml.json.ok, true);
  assert.deepEqual(dml.json.results.map((r) => r.kind), ['changes', 'changes', 'ok', 'rows']);
  assert.equal(dml.json.results[1].changes, 2);
  assert.deepEqual(dml.json.results[3].rows, [[6]]);

  // Frische Datenbank je Anfrage: die Einfügung von eben ist weg.
  const fresh = await sql(app, 'SELECT count(*) FROM dozierende');
  assert.deepEqual(fresh.json.results[0].rows, [[5]]);

  const empty = await sql(app, "SELECT name FROM sqlite_schema WHERE type='table'", 'leer');
  assert.deepEqual(empty.json.results[0].rows, []);

  const special = await sql(app, "SELECT 9007199254740993 AS big, x'00FF' AS b, 1e999 AS inf");
  assert.deepEqual(special.json.results[0].rows[0], [{ t: 'int', v: '9007199254740993' }, { t: 'blob', v: '00FF', bytes: 2, cut: false }, { t: 'num', v: 'Infinity' }]);
});

test('SQL-Spielplatz: Fehler von SQLite mit Anweisungsnummer, Abbruch danach, Fremdschlüssel aktiv', async (t) => {
  const app = await startApp(t);
  const res = await sql(app, 'SELECT 1; SELECT * FROM gibtsnicht; SELECT 3');
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, false);
  assert.equal(res.json.results.length, 1);
  assert.equal(res.json.error.statement, 2);
  assert.match(res.json.error.message, /^Anweisung 2: no such table: gibtsnicht/);

  const fk = await sql(app, "INSERT INTO belegungen VALUES (1, 'XX', 'WS')");
  assert.match(fk.json.error.message, /FOREIGN KEY constraint failed/);

  const syntax = await sql(app, 'SELEC 1');
  assert.equal(syntax.json.error.kind, 'blocked');

  const bad = await app.post('/api/tools/sql', { sql: 42 });
  assert.equal(bad.status, 400);
  const unknown = await app.post('/api/tools/sql', { sql: 'SELECT 1', dataset: 'nix' });
  assert.equal(unknown.status, 400);
  const tooLong = await app.post('/api/tools/sql', { sql: 'SELECT ' + 'x'.repeat(20001) });
  assert.equal(tooLong.status, 400);
  const huge = await app.post('/api/tools/sql', { sql: 'x'.repeat(70 * 1024) });
  assert.equal(huge.status, 413);
  assert.match(huge.json.error, /zu groß/);
});

test('SQL-Spielplatz: Sperren über die API', async (t) => {
  const app = await startApp(t);
  for (const text of ["ATTACH '/tmp/x.db' AS x;", "VACUUM INTO '/tmp/studyforge-kopie.db';", 'PRAGMA foreign_keys = OFF;', "SELECT 1; aTtAcH /* x */ '/tmp/x.db' AS x"]) {
    const res = await sql(app, text);
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, false, text);
    assert.equal(res.json.error.kind, 'blocked');
    assert.equal(res.json.results.length, 0, 'nichts ausgeführt');
  }
  assert.equal(fs.existsSync('/tmp/studyforge-kopie.db'), false);
  const ok = await sql(app, "SELECT 'ATTACH' AS wort");
  assert.deepEqual(ok.json.results[0].rows, [['ATTACH']]);
});

test('SQL-Spielplatz: Zeitlimit bricht Endlosrekursion ab, Server antwortet weiter', async (t) => {
  const app = await startApp(t);
  const started = Date.now();
  const res = await sql(app, 'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c) SELECT count(*) FROM c;');
  const took = Date.now() - started;
  assert.ok(took < 5000, `Antwort nach ${took} ms`);
  assert.equal(res.json.ok, false);
  assert.equal(res.json.error.kind, 'timeout');
  assert.match(res.json.error.message, /Abfrage nach 2 s abgebrochen/);
  const after = await app.expect('GET', '/api/notes');
  assert.equal(after.status, 200);
  const again = await sql(app, 'SELECT 1');
  assert.equal(again.json.ok, true);
});

test('SQL-Spielplatz: Zeilen- und Speichergrenzen', async (t) => {
  const app = await startApp(t);
  const res = await sql(app, 'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c WHERE x < 2000) SELECT x FROM c');
  assert.equal(res.json.ok, true);
  assert.equal(res.json.results[0].rows.length, 500);
  assert.equal(res.json.results[0].truncated, true);
  const full = await sql(app, 'CREATE TABLE big(x); WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c WHERE x < 100000) INSERT INTO big SELECT randomblob(1000) FROM c');
  assert.equal(full.json.ok, false);
  assert.match(full.json.error.message, /Anweisung 2: database or disk is full/);
  const longCell = await sql(app, "SELECT printf('%.*c', 5000, 'x')");
  assert.equal(longCell.json.results[0].rows[0][0].cut, true);
  assert.equal(longCell.json.results[0].rows[0][0].length, 5000);
});

test('SQL-Spielplatz: Nutzerdatenbank und Datenverzeichnis bleiben unverändert', async (t) => {
  const app = await startApp(t);
  const listFiles = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  await app.expect('POST', '/api/notes', { title: 'Bleibt', content: 'Inhalt' });
  const before = listFiles(app.dataDir).filter((f) => !/-(wal|shm|journal)$/.test(f)).sort();
  const notesBefore = (await app.expect('GET', '/api/notes')).json;
  const res = await sql(app, 'CREATE TABLE notes(x); INSERT INTO notes VALUES (1); DROP TABLE noten; SELECT * FROM notes');
  assert.equal(res.json.ok, true);
  assert.deepEqual(res.json.results[3].rows, [[1]]);
  const notesAfter = (await app.expect('GET', '/api/notes')).json;
  assert.deepEqual(notesAfter, notesBefore);
  const tables = app.instance.db.prepare("SELECT name FROM sqlite_master WHERE name IN ('kurse', 'dozierende')").all();
  assert.equal(tables.length, 0, 'Beispieltabellen nicht in der Nutzerdatenbank');
  const after = listFiles(app.dataDir).filter((f) => !/-(wal|shm|journal)$/.test(f)).sort();
  assert.deepEqual(after, before);
});
