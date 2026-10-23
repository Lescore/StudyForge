#!/usr/bin/env node
/**
 * Lokaler Starthelfer für StudyForge.
 * - benötigt keine Installation, keine Adminrechte, keine Netzverbindung
 * - bindet nur an 127.0.0.1
 * - öffnet die Oberfläche im Standardbrowser (Fehler dabei sind unkritisch)
 */
import { spawn } from 'node:child_process';
import { createApp } from '../server/server.js';
import { resolveDataDir, APP_VERSION } from '../server/config.js';
import { newShutdownToken, removeInstanceFile, writeInstanceFile } from '../server/instance.js';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 5)) {
  console.error(`StudyForge benötigt Node.js 22.5 oder neuer (gefunden: ${process.version}).`);
  console.error('Node.js ist kostenlos unter https://nodejs.org/ erhältlich (LTS-Version).');
  process.exit(1);
}

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

const requestedPort = Number(argValue('--port', process.env.PORT || 4173));
const dataDir = resolveDataDir(argValue('--data-dir'));
const noBrowser = args.includes('--no-browser') || process.env.STUDYFORGE_NO_BROWSER === '1';

const shutdownToken = newShutdownToken();
const instance = createApp({ dataDir, host: '127.0.0.1', shutdownToken, onShutdown: () => shutdown() });

let startPort = Number.isFinite(requestedPort) ? requestedPort : 4173;
let info = null;
for (let attempt = 0; attempt < 20; attempt += 1) {
  try {
    info = await instance.listen(startPort + attempt);
    break;
  } catch (err) {
    if (err.code !== 'EADDRINUSE') {
      console.error('StudyForge konnte nicht gestartet werden:', err.message);
      process.exit(1);
    }
  }
}
if (!info) {
  console.error(`Kein freier Port zwischen ${startPort} und ${startPort + 19} gefunden.`);
  process.exit(1);
}

// Für stop.sh / stop.cmd: Port und Schlüssel dieser Instanz hinterlegen.
try {
  writeInstanceFile(instance.dataDir, { port: info.port, token: shutdownToken, version: APP_VERSION });
} catch (err) {
  console.warn(`Hinweis: stop.sh/stop.cmd steht nicht zur Verfügung (${err.message}). Beenden mit Strg+C.`);
}
process.on('exit', () => removeInstanceFile(instance.dataDir, shutdownToken));

const url = `http://localhost:${info.port}`;
console.log('');
console.log(`  StudyForge ${APP_VERSION}`);
console.log(`  Oberfläche:       ${url}`);
console.log(`  Daten:            ${instance.dataDir}`);
console.log('  Netzwerk:         nur lokal (127.0.0.1), keine Cloud, keine Telemetrie');
console.log('');
console.log('  Beenden mit Strg+C oder über stop.sh / stop.cmd. Änderungen werden automatisch gespeichert.');
console.log('');

if (!noBrowser) {
  const command =
    process.platform === 'win32'
      ? { cmd: 'cmd', args: ['/c', 'start', '', url] }
      : process.platform === 'darwin'
        ? { cmd: 'open', args: [url] }
        : { cmd: 'xdg-open', args: [url] };
  try {
    const child = spawn(command.cmd, command.args, { detached: true, stdio: 'ignore' });
    child.on('error', () => {
      console.log(`Bitte die Adresse ${url} manuell im Browser öffnen.`);
    });
    child.unref();
  } catch {
    console.log(`Bitte die Adresse ${url} manuell im Browser öffnen.`);
  }
}

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  console.log('\nStudyForge wird beendet. Alle Daten sind gespeichert.');
  await instance.close();
  removeInstanceFile(instance.dataDir, shutdownToken);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
