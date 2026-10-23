#!/usr/bin/env node
/**
 * Prüft nach der Einrichtung, ob StudyForge auf diesem Rechner laufen kann.
 * Ändert nichts außer einem Test im Datenordner (wird sofort wieder gelöscht).
 * Optionen: --data-dir <pfad>
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDataDir, APP_VERSION } from '../server/config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dataArg = args.includes('--data-dir') ? args[args.indexOf('--data-dir') + 1] : undefined;

let failed = 0;
const ok = (text) => console.log(`  [OK]     ${text}`);
const fail = (text, hint) => {
  failed += 1;
  console.log(`  [FEHLER] ${text}`);
  if (hint) console.log(`           ${hint}`);
};
const warn = (text) => console.log(`  [HINWEIS] ${text}`);

console.log(`StudyForge ${APP_VERSION} – Prüfung der Einrichtung\n`);

const [major, minor] = process.versions.node.split('.').map(Number);
if (major > 22 || (major === 22 && minor >= 5)) ok(`Node.js ${process.version} (${process.execPath})`);
else fail(`Node.js ${process.version} ist zu alt.`, 'Benötigt wird Node.js 22.5 oder neuer.');

try {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE t (x INTEGER); INSERT INTO t VALUES (42);');
  if (db.prepare('SELECT x FROM t').get().x !== 42) throw new Error('falsches Ergebnis');
  db.close();
  ok('Eingebaute Datenbank (node:sqlite) funktioniert');
} catch (err) {
  fail(`node:sqlite ist nicht verfügbar (${err.message}).`, 'Bitte Node.js 22.5 oder neuer verwenden.');
}

const required = ['server/server.js', 'scripts/start.js', 'scripts/stop.js', 'public/index.html', 'public/vendor/katex/katex.min.js', 'server/vendor/ical/ical.js'];
const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) fail(`Dateien fehlen: ${missing.join(', ')}`, 'Den Projektordner bitte vollständig kopieren bzw. entpacken.');
else ok('Programmdateien vollständig');

const dataDir = resolveDataDir(dataArg);
try {
  fs.mkdirSync(dataDir, { recursive: true });
  const probe = path.join(dataDir, `.schreibtest-${process.pid}`);
  fs.writeFileSync(probe, 'ok');
  fs.unlinkSync(probe);
  const existing = fs.existsSync(path.join(dataDir, 'studyforge.db'));
  ok(`Datenordner beschreibbar: ${dataDir}${existing ? ' (vorhandene Daten gefunden – bleiben unverändert)' : ' (noch leer – wird beim ersten Start angelegt)'}`);
} catch (err) {
  fail(`Datenordner nicht beschreibbar: ${dataDir} (${err.code || err.message})`, 'Projekt an einen Ort mit Schreibrechten kopieren oder --data-dir verwenden.');
}

const portFree = await new Promise((resolve) => {
  const server = net.createServer();
  server.once('error', () => resolve(false));
  server.listen(4173, '127.0.0.1', () => server.close(() => resolve(true)));
});
if (portFree) ok('Port 4173 ist frei');
else warn('Port 4173 ist belegt (läuft StudyForge schon?). Beim Start wird automatisch der nächste freie Port gewählt.');

console.log('');
if (failed) {
  console.log(`${failed} Problem(e) gefunden – StudyForge kann so noch nicht starten.`);
  process.exit(1);
}
console.log('Alles bereit.');
