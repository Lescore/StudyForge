import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');

/**
 * Datenverzeichnis: standardmäßig <projekt>/data. Über STUDYFORGE_DATA
 * (oder --data-dir beim Start) kann ein anderer Ordner gewählt werden,
 * z. B. für Tests oder eine Sicherung auf einem anderen Laufwerk.
 */
export function resolveDataDir(cliArg) {
  const fromArg = cliArg?.trim();
  const fromEnv = process.env.STUDYFORGE_DATA?.trim();
  const dir = fromArg || fromEnv || path.join(PROJECT_ROOT, 'data');
  return path.resolve(dir);
}

export const APP_NAME = 'StudyForge';
export const APP_VERSION = '1.2.0';
export const BACKUP_FORMAT = 'studyforge-backup';
export const BACKUP_VERSION = 1;
export const CARDS_FORMAT = 'studyforge-cards';
export const CARDS_VERSION = 1;

export function ensureDataDirs(dataDir) {
  const files = path.join(dataDir, 'files');
  const backups = path.join(dataDir, 'backups');
  const tmp = path.join(dataDir, 'tmp');
  for (const dir of [dataDir, files, backups, tmp]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return { dataDir, filesDir: files, backupsDir: backups, tmpDir: tmp };
}
