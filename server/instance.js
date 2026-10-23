import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Instanzdatei für stop.sh/stop.cmd: Prozess-ID, Port und ein zufälliger
 * Schlüssel, mit dem sich der laufende Server sauber beenden lässt. Sie liegt
 * im Datenverzeichnis (nur für den eigenen Benutzer lesbar) und wird beim
 * Beenden wieder entfernt.
 */
export const INSTANCE_FILE = 'studyforge.instance.json';

export function instanceFilePath(dataDir) {
  return path.join(dataDir, INSTANCE_FILE);
}

export function newShutdownToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function writeInstanceFile(dataDir, { port, token, version }) {
  const file = instanceFilePath(dataDir);
  const content = JSON.stringify({ pid: process.pid, port, token, version, startedAt: new Date().toISOString() }, null, 2);
  fs.writeFileSync(file, content, { mode: 0o600 });
  return file;
}

export function readInstanceFile(dataDir) {
  try {
    const data = JSON.parse(fs.readFileSync(instanceFilePath(dataDir), 'utf8'));
    if (!Number.isInteger(data?.pid) || !Number.isInteger(data?.port) || typeof data?.token !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}

/** Entfernt die Datei nur, wenn sie zu dieser Instanz gehört. */
export function removeInstanceFile(dataDir, token) {
  const current = readInstanceFile(dataDir);
  if (current && current.token !== token) return;
  try {
    fs.unlinkSync(instanceFilePath(dataDir));
  } catch {
    /* bereits entfernt */
  }
}

export function tokenMatches(expected, given) {
  if (!expected || typeof given !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
