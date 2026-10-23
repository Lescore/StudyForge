#!/usr/bin/env node
/**
 * Beendet eine laufende StudyForge-Instanz sauber (wie Strg+C):
 * Datenbank wird geschlossen, nichts geht verloren.
 *
 * Ablauf: Instanzdatei im Datenverzeichnis lesen → Server über
 * 127.0.0.1 mit dem hinterlegten Schlüssel um das Beenden bitten → warten,
 * bis der Prozess weg ist. Antwortet der Server nicht mehr, wird der Prozess
 * als letzter Ausweg direkt beendet.
 *
 * Optionen: --data-dir <pfad> (wie beim Start), --timeout <sekunden>
 */
import { resolveDataDir } from '../server/config.js';
import { instanceFilePath, readInstanceFile, removeInstanceFile } from '../server/instance.js';

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

const dataDir = resolveDataDir(argValue('--data-dir'));
const timeoutMs = Math.max(1, Number(argValue('--timeout', 15)) || 15) * 1000;

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

async function waitForExit(pid, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (!isRunning(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return !isRunning(pid);
}

const info = readInstanceFile(dataDir);
if (!info) {
  console.log('StudyForge läuft nicht (keine laufende Instanz für dieses Datenverzeichnis gefunden).');
  console.log(`Geprüft: ${instanceFilePath(dataDir)}`);
  process.exit(0);
}

if (!isRunning(info.pid)) {
  removeInstanceFile(dataDir, info.token);
  console.log('StudyForge läuft nicht mehr. Veraltete Instanzdatei wurde entfernt.');
  process.exit(0);
}

console.log(`StudyForge wird beendet (Port ${info.port}, Prozess ${info.pid}) …`);

let requested = false;
let unreachable = false;
try {
  const response = await fetch(`http://127.0.0.1:${info.port}/api/shutdown`, {
    method: 'POST',
    headers: { 'X-StudyForge-Token': info.token },
    signal: AbortSignal.timeout(5000)
  });
  requested = response.ok;
  if (!response.ok) console.warn(`Der Server hat das Beenden abgelehnt (HTTP ${response.status}).`);
} catch (err) {
  // Verbindung abgelehnt: auf diesem Port lauscht kein StudyForge mehr.
  unreachable = err?.cause?.code === 'ECONNREFUSED';
  if (!unreachable) console.warn('Der Server antwortet nicht.');
}

if (unreachable) {
  // Prozess-ID existiert, aber kein StudyForge auf dem Port – vermutlich wurde
  // die ID inzwischen von einem anderen Programm übernommen. Nichts beenden.
  removeInstanceFile(dataDir, info.token);
  console.log('Auf dem hinterlegten Port läuft kein StudyForge mehr. Veraltete Instanzdatei wurde entfernt.');
  process.exit(0);
}

if (requested && (await waitForExit(info.pid, timeoutMs))) {
  console.log('StudyForge wurde beendet. Alle Daten sind gespeichert.');
  process.exit(0);
}

// Letzter Ausweg: Server hängt. Auf Windows beendet dies den Prozess sofort.
console.warn('StudyForge reagiert nicht – Prozess wird direkt beendet.');
try {
  process.kill(info.pid, 'SIGTERM');
} catch {
  /* bereits beendet */
}
if (await waitForExit(info.pid, 5000)) {
  removeInstanceFile(dataDir, info.token);
  console.log('StudyForge wurde beendet. Gespeicherte Änderungen bleiben erhalten (die Datenbank schreibt jede Änderung sofort).');
  process.exit(0);
}
console.error(`StudyForge (Prozess ${info.pid}) konnte nicht beendet werden. Bitte das Startfenster schließen oder den Prozess im Task-Manager beenden.`);
process.exit(1);
