import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { instanceFilePath } from '../server/instance.js';
import { startApp } from './helpers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NODE_ARGS = ['--disable-warning=ExperimentalWarning'];

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studyforge-stop-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Asynchron, damit dieser Testprozess den beendeten Server-Kindprozess abholen
// kann (sonst bliebe er als Zombie scheinbar „am Leben“).
function runStop(dataDir) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [...NODE_ARGS, path.join(root, 'scripts', 'stop.js'), '--data-dir', dataDir]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('exit', (status) => resolve({ status, stdout, stderr }));
  });
}

async function waitFor(check, ms = 15000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const value = check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Zeitüberschreitung');
}

test('stop.js beendet eine über den Starthelfer gestartete Instanz sauber', async (t) => {
  const dataDir = tempDir(t);
  const child = spawn(process.execPath, [...NODE_ARGS, path.join(root, 'scripts', 'start.js'), '--no-browser', '--port', '0', '--data-dir', dataDir], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  t.after(() => child.kill());

  const file = instanceFilePath(dataDir);
  const info = await waitFor(() => fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8')));
  assert.equal(info.pid, child.pid);
  assert.equal(info.token.length, 64);
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o077, 0, 'nur für den eigenen Benutzer lesbar');

  const base = `http://127.0.0.1:${info.port}`;
  const note = await fetch(`${base}/api/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Vor dem Beenden', content: 'bleibt erhalten' })
  });
  assert.equal(note.status, 201);

  // Ohne bzw. mit falschem Schlüssel lässt sich der Server nicht beenden.
  for (const headers of [{}, { 'X-StudyForge-Token': 'falsch' }]) {
    const denied = await fetch(`${base}/api/shutdown`, { method: 'POST', headers });
    assert.equal(denied.status, 403);
  }
  const fromWebsite = await fetch(`${base}/api/shutdown`, { method: 'POST', headers: { Origin: 'https://example.com', 'X-StudyForge-Token': info.token } });
  assert.equal(fromWebsite.status, 403, 'fremde Webseiten können nicht beenden');

  const result = await runStop(dataDir);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /wurde beendet/);
  assert.equal(await exited, 0, 'Server endet regulär');
  assert.ok(!fs.existsSync(file), 'Instanzdatei wird entfernt');

  const db = new DatabaseSync(path.join(dataDir, 'studyforge.db'), { readOnly: true });
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM notes WHERE title = 'Vor dem Beenden'").get().c, 1);
  db.close();

  const again = await runStop(dataDir);
  assert.equal(again.status, 0);
  assert.match(again.stdout, /läuft nicht/);
});

test('stop.js räumt veraltete Instanzdateien auf, ohne fremde Prozesse zu beenden', async (t) => {
  const dataDir = tempDir(t);
  // Prozess existiert nicht mehr.
  fs.writeFileSync(instanceFilePath(dataDir), JSON.stringify({ pid: 2147483646, port: 1, token: 'x'.repeat(64) }));
  let result = await runStop(dataDir);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /läuft nicht mehr/);
  assert.ok(!fs.existsSync(instanceFilePath(dataDir)));

  // Prozess existiert (dieser Testprozess), aber auf dem Port lauscht kein StudyForge.
  const free = await startApp(t);
  const port = Number(new URL(free.base).port);
  await free.instance.close();
  fs.writeFileSync(instanceFilePath(dataDir), JSON.stringify({ pid: process.pid, port, token: 'x'.repeat(64) }));
  result = await runStop(dataDir);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /kein StudyForge mehr/);
  assert.ok(!fs.existsSync(instanceFilePath(dataDir)));
});

test('Ohne Starthelfer-Schlüssel gibt es keinen Endpunkt zum Beenden', async (t) => {
  const app = await startApp(t);
  const res = await app.post('/api/shutdown', {}, { headers: { 'X-StudyForge-Token': 'egal' } });
  assert.equal(res.status, 404);
});
