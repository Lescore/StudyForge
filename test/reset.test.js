import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startApp, makeSubject, makeNote, makeDeck, makeCard } from './helpers.js';

test('Fach löschen: Themen/Lernziele weg, Notizen/Karten/Prüfungen bleiben ohne Fach', async (t) => {
  const app = await startApp(t);
  const subject = await makeSubject(app, 'Mathe');
  const other = await makeSubject(app, 'Physik');
  await app.expect('POST', '/api/topics', { subject_id: subject.id, name: 'Integrale' });
  await app.expect('POST', '/api/goals', { subject_id: subject.id, title: 'Prüfung bestehen' });
  const note = await makeNote(app, { title: 'Integralregeln', subject_id: subject.id });
  const deck = await makeDeck(app, 'Analysis', subject.id);
  await makeCard(app, { deck_id: deck.id });
  const exam = (await app.expect('POST', '/api/exams', { title: 'Matheklausur', subject_id: subject.id })).json;
  await app.expect('PUT', '/api/settings', { last_subject_id: String(subject.id) });

  const res = await app.expect('DELETE', `/api/subjects/${subject.id}`);
  assert.deepEqual(res.json.removed, { topics: 1, goals: 1 });

  assert.equal((await app.get(`/api/subjects/${subject.id}`)).status, 404);
  assert.deepEqual((await app.expect('GET', '/api/subjects')).json.map((s) => s.id), [other.id]);
  assert.equal((await app.expect('GET', `/api/notes/${note.id}`)).json.subject_id, null);
  const decks = (await app.expect('GET', '/api/decks')).json;
  assert.equal(decks.find((d) => d.id === deck.id).subject_id, null);
  const exams = (await app.expect('GET', '/api/exams')).json;
  assert.equal(exams.find((e) => e.id === exam.id).subject_id, null);
  assert.equal((await app.expect('GET', '/api/settings')).json.last_subject_id, '');
  assert.equal((await app.expect('GET', '/api/meta')).json.counts.cards, 1);
});

test('Einstellungen zurücksetzen lässt Inhalte unverändert', async (t) => {
  const app = await startApp(t);
  await makeNote(app, { title: 'Bleibt' });
  await app.expect('PUT', '/api/settings', { theme: 'dark', review_limit: '50' });

  await app.expect('POST', '/api/reset', { scope: 'settings' });
  const settings = (await app.expect('GET', '/api/settings')).json;
  assert.equal(settings.theme, 'system');
  assert.equal(String(settings.review_limit), '20');
  assert.equal((await app.expect('GET', '/api/meta')).json.counts.notes, 1);
});

test('Alles zurücksetzen verlangt Bestätigung, sichert vorher und löscht danach alles', async (t) => {
  const app = await startApp(t);
  const subject = await makeSubject(app);
  const note = await makeNote(app, { title: 'Weg', subject_id: subject.id });
  await makeCard(app);
  const file = (await app.expect('POST', `/api/files?kind=attachment&note_id=${note.id}&filename=a.pdf`, Buffer.from('%PDF-1.4 test'))).json;
  const filesDir = path.join(app.dataDir, 'files');
  assert.ok(fs.existsSync(path.join(filesDir, file.stored_name)));
  await app.expect('PUT', '/api/settings', { theme: 'dark' });

  for (const body of [{ scope: 'all' }, { scope: 'all', confirm: 'ja' }, { scope: 'irgendwas', confirm: 'ZURÜCKSETZEN' }]) {
    const denied = await app.post('/api/reset', body);
    assert.equal(denied.status, 400, JSON.stringify(body));
  }
  assert.equal((await app.expect('GET', '/api/meta')).json.counts.notes, 1, 'nichts gelöscht ohne Bestätigung');

  const res = await app.expect('POST', '/api/reset', { scope: 'all', confirm: 'ZURÜCKSETZEN' });
  assert.match(res.json.safetyBackup, /^auto-vor-zuruecksetzen-.*\.zip$/);
  const backupPath = path.join(app.dataDir, 'backups', res.json.safetyBackup);
  assert.ok(fs.existsSync(backupPath));

  const counts = (await app.expect('GET', '/api/meta')).json.counts;
  for (const key of ['notes', 'cards', 'subjects', 'files', 'tasks', 'exams', 'decks']) assert.equal(counts[key], 0, key);
  assert.ok(counts.templates > 0, 'mitgelieferte Vorlagen wieder da');
  assert.equal((await app.expect('GET', '/api/settings')).json.theme, 'system');
  assert.ok(!fs.existsSync(path.join(filesDir, file.stored_name)), 'Anhang entfernt');

  // Die Sicherung lässt sich vollständig wiederherstellen.
  const backup = fs.readFileSync(backupPath);
  const inspect = (await app.expect('POST', '/api/import/inspect', backup)).json;
  assert.ok(inspect.ok, JSON.stringify(inspect.problems));
  await app.expect('POST', '/api/import?confirm=replace', backup);
  const restored = (await app.expect('GET', '/api/meta')).json.counts;
  assert.equal(restored.notes, 1);
  assert.equal(restored.subjects, 1);
  assert.equal(restored.cards, 1);
  assert.equal(restored.files, 1);
  assert.ok(fs.existsSync(path.join(filesDir, file.stored_name)));

});

test('Alles zurücksetzen bricht ab, wenn die Sicherung nicht möglich ist', async (t) => {
  const app = await startApp(t);
  const note = await makeNote(app, { title: 'Bleibt sicher' });
  const file = (await app.expect('POST', `/api/files?kind=attachment&note_id=${note.id}&filename=a.pdf`, Buffer.from('%PDF-1.4'))).json;
  fs.unlinkSync(path.join(app.dataDir, 'files', file.stored_name));

  const res = await app.post('/api/reset', { scope: 'all', confirm: 'ZURÜCKSETZEN' });
  assert.equal(res.status, 500);
  assert.match(res.json.error, /nichts gelöscht/);
  const counts = (await app.expect('GET', '/api/meta')).json.counts;
  assert.equal(counts.notes, 1);
  assert.equal(counts.files, 1);
});
