import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/server.js';
import { readZip } from '../server/zip.js';
import { makeCard, makeDeck, makeNote, makeSubject, startApp } from './helpers.js';

async function seedContent(app) {
  const subject = await makeSubject(app, 'Netzwerktechnik');
  const note = await makeNote(app, {
    title: 'Subnetting – Grundlagen',
    content: '# Subnetting\n\nMaske /24 → 254 Hosts.\n',
    tags: ['Prüfung', 'IPv4'],
    subject_id: subject.id
  });
  const upload = await app.expect(
    'POST',
    `/api/files?kind=attachment&note_id=${note.id}&subject_id=${subject.id}&filename=${encodeURIComponent('Übungsblatt 1.pdf')}`,
    Buffer.from('%PDF-1.4 Übungsblatt'),
    { headers: { 'Content-Type': 'application/pdf' } }
  );
  const deck = await makeDeck(app, 'Netzwerke', subject.id);
  const card = await makeCard(app, { deck_id: deck.id, front: 'Was ist eine Subnetzmaske?', back: 'Trennt Netz- und Hostanteil.', topic: 'Subnetting' });
  const task = (
    await app.expect('POST', '/api/tasks', { title: 'Übungsblatt lösen', subject_id: subject.id, priority: 'hoch' })
  ).json;
  await app.expect('PUT', '/api/settings', { theme: 'dark', review_limit: 42 });
  return { subject, note, upload: upload.json, deck, card, task };
}

test('Vollständiges Backup enthält Daten und Anhänge und stellt alles wieder her', async (t) => {
  const source = await startApp(t);
  const seeded = await seedContent(source);

  const backup = await source.expect('GET', '/api/export/backup');
  assert.match(backup.headers.get('content-type'), /application\/zip/);
  assert.ok(backup.buffer.length > 100);

  const entries = readZip(backup.buffer);
  assert.ok(entries.has('manifest.json'));
  assert.ok(entries.has('data.json'));
  assert.ok(entries.has(`files/${seeded.upload.stored_name}`), 'Anhang ist im ZIP enthalten');
  const manifest = JSON.parse(entries.get('manifest.json').toString('utf8'));
  assert.equal(manifest.counts.notes, 1);
  assert.equal(manifest.counts.files, 1);

  const target = await startApp(t);
  const inspected = (await target.expect('POST', '/api/import/inspect', backup.buffer)).json;
  assert.equal(inspected.ok, true);
  assert.equal(inspected.kind, 'zip');
  assert.equal(inspected.counts.notes, 1);

  const imported = (await target.expect('POST', '/api/import?confirm=replace', backup.buffer)).json;
  assert.equal(imported.ok, true);
  assert.equal(imported.counts.notes, 1);
  assert.ok(imported.safetyBackup, 'Vor dem Ersetzen wird ein Sicherheitsbackup angelegt');

  const notes = (await target.expect('GET', '/api/notes')).json;
  assert.equal(notes.total, 1);
  assert.equal(notes.notes[0].title, 'Subnetting – Grundlagen');
  assert.deepEqual(notes.notes[0].tags.sort(), ['IPv4', 'Prüfung']);

  const loaded = (await target.expect('GET', `/api/notes/${seeded.note.id}`)).json;
  assert.equal(loaded.content, seeded.note.content);
  assert.equal(loaded.attachments.length, 1);
  assert.equal(loaded.attachments[0].original_name, 'Übungsblatt 1.pdf');

  const raw = await target.get(`/api/files/${seeded.upload.id}/raw`);
  assert.equal(raw.status, 200);
  assert.equal(raw.text(), '%PDF-1.4 Übungsblatt');

  const cards = (await target.expect('GET', '/api/cards')).json;
  assert.equal(cards.total, 1);
  assert.equal(cards.cards[0].front, 'Was ist eine Subnetzmaske?');

  const tasks = (await target.expect('GET', '/api/tasks')).json;
  assert.equal(tasks.length, 1);

  const settings = (await target.expect('GET', '/api/settings')).json;
  assert.equal(settings.theme, 'dark');
  assert.equal(settings.review_limit, '42');

  const health = (await target.expect('GET', '/api/health')).json;
  assert.equal(health.ok, true);
});

test('Import ersetzt vorhandene Daten nur nach Bestätigung', async (t) => {
  const source = await startApp(t);
  await seedContent(source);
  const backup = await source.expect('GET', '/api/export/backup');

  const target = await startApp(t);
  await makeNote(target, { title: 'Bleibt bis zur Bestätigung' });

  const unconfirmed = await target.post('/api/import', backup.buffer);
  assert.equal(unconfirmed.status, 400);
  assert.match(unconfirmed.json.error, /bestätigen/i);
  const stillThere = (await target.expect('GET', '/api/notes')).json;
  assert.equal(stillThere.total, 1);

  const confirmed = (await target.expect('POST', '/api/import?confirm=replace', backup.buffer)).json;
  assert.equal(confirmed.ok, true);
  const replaced = (await target.expect('GET', '/api/notes')).json;
  assert.equal(replaced.notes[0].title, 'Subnetting – Grundlagen');
});

test('JSON-Export mit eingebetteten Dateien lässt sich wieder einlesen', async (t) => {
  const source = await startApp(t);
  const seeded = await seedContent(source);
  const json = await source.expect('GET', '/api/export/json');
  const parsed = JSON.parse(json.text());
  assert.equal(parsed.format, 'studyforge-data');
  assert.equal(parsed.binaries.length, 1);
  assert.equal(parsed.binaries[0].original_name, 'Übungsblatt 1.pdf');

  const target = await startApp(t);
  const inspected = (await target.expect('POST', '/api/import/inspect', json.buffer)).json;
  assert.equal(inspected.kind, 'json');
  assert.equal(inspected.ok, true);

  await target.expect('POST', '/api/import?confirm=replace', json.buffer);
  const raw = await target.get(`/api/files/${seeded.upload.id}/raw`);
  assert.equal(raw.status, 200);
  assert.equal(raw.text(), '%PDF-1.4 Übungsblatt');
});

test('Beschädigte Backups werden abgelehnt, ohne vorhandene Daten zu löschen', async (t) => {
  const app = await startApp(t);
  await makeNote(app, { title: 'Wichtig', content: 'Darf nicht verloren gehen' });

  const garbage = await app.post('/api/import/inspect', Buffer.from('das ist kein backup'));
  assert.equal(garbage.status, 400);
  assert.match(garbage.json.error, /beschädigt|JSON/i);

  const wrongFormat = await app.post(
    '/api/import/inspect',
    Buffer.from(JSON.stringify({ format: 'etwas-anderes', version: 1, data: {} }))
  );
  assert.equal(wrongFormat.status, 400);
  assert.match(wrongFormat.json.error, /Formatkennung/);

  const valid = await app.expect('GET', '/api/export/backup');
  const truncated = valid.buffer.subarray(0, Math.floor(valid.buffer.length / 2));
  const brokenZip = await app.post('/api/import/inspect', truncated);
  assert.equal(brokenZip.status, 400);

  const importBroken = await app.post('/api/import?confirm=replace', truncated);
  assert.equal(importBroken.status, 400);

  const notes = (await app.expect('GET', '/api/notes')).json;
  assert.equal(notes.total, 1, 'Vorhandene Daten bleiben erhalten');
  assert.equal(notes.notes[0].title, 'Wichtig');
});

test('Kartenexport und -import im dokumentierten JSON-Format', async (t) => {
  const source = await startApp(t);
  const deck = await makeDeck(source, 'Netzwerke');
  await makeCard(source, { deck_id: deck.id, front: 'DNS?', back: 'Namensauflösung', tags: ['DNS'] });
  await makeCard(source, { deck_id: deck.id, type: 'mc', front: 'Port 443?', back: 'HTTPS', options: ['HTTP', 'HTTPS'], correct_index: 1 });

  const exportRes = await source.expect('GET', '/api/export/cards');
  const payload = JSON.parse(exportRes.text());
  assert.equal(payload.format, 'studyforge-cards');
  assert.equal(payload.cards.length, 2);
  assert.ok(payload.cards[0].scheduling);

  const target = await startApp(t);
  const targetDeck = await makeDeck(target, 'Import');
  const imported = (
    await target.expect('POST', `/api/import/cards?deck_id=${targetDeck.id}`, exportRes.buffer)
  ).json;
  assert.equal(imported.imported, 2);
  assert.equal(imported.skipped, 0);

  const cards = (await target.expect('GET', `/api/cards?deck_id=${targetDeck.id}`)).json;
  assert.equal(cards.total, 2);
  const mc = cards.cards.find((c) => c.type === 'mc');
  assert.deepEqual(mc.options, ['HTTP', 'HTTPS']);
  assert.equal(mc.correct_index, 1);

  const invalid = await target.post(`/api/import/cards?deck_id=${targetDeck.id}`, Buffer.from('kein json'));
  assert.equal(invalid.status, 400);
  assert.match(invalid.json.error, /JSON/);
});

test('Markdown-Export liefert lesbare Notizdateien', async (t) => {
  const app = await startApp(t);
  await makeNote(app, { title: 'TCP/IP – Schichten', content: 'Anwendung, Transport, Internet, Netzzugang.' });
  const res = await app.expect('GET', '/api/export/markdown');
  const entries = readZip(res.buffer);
  assert.ok(entries.has('README.md'), 'Export enthält eine Leseanleitung');
  const mdFiles = [...entries.keys()].filter((name) => name.startsWith('Notizen/') && name.endsWith('.md'));
  assert.equal(mdFiles.length, 1);
  const text = entries.get(mdFiles[0]).toString('utf8');
  assert.match(text, /^---\ntitle:/, 'Frontmatter mit Metadaten');
  assert.match(text, /TCP\/IP/);
  assert.match(text, /Anwendung, Transport/);
  assert.match(mdFiles[0], /\.md$/);
});

test('Daten bleiben nach einem Neustart erhalten', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studyforge-persist-'));
  const open = async () => {
    const instance = createApp({ dataDir: dir });
    const { port } = await instance.listen(0);
    return { instance, base: `http://127.0.0.1:${port}` };
  };
  const request = async (base, method, p, body) => {
    const res = await fetch(base + p, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: res.status, json: await res.json() };
  };

  let running = await open();
  const subject = await request(running.base, 'POST', '/api/subjects', { name: 'Betriebssysteme' });
  assert.equal(subject.status, 201);
  const note = await request(running.base, 'POST', '/api/notes', {
    title: 'Scheduling',
    content: 'Round Robin',
    subject_id: subject.json.id
  });
  const card = await request(running.base, 'POST', '/api/cards', { front: 'Was ist Scheduling?', back: 'Prozessauswahl' });
  await request(running.base, 'POST', `/api/cards/${card.json.id}/review`, { rating: 3 });
  await running.instance.close();

  running = await open();
  try {
    const notes = await request(running.base, 'GET', '/api/notes');
    assert.equal(notes.json.total, 1);
    assert.equal(notes.json.notes[0].title, 'Scheduling');
    const cards = await request(running.base, 'GET', '/api/cards');
    assert.equal(cards.json.cards[0].reps, 1);
    assert.ok(cards.json.cards[0].due);
    void note;
  } finally {
    await running.instance.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
