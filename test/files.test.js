import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { makeNote, makeSubject, startApp } from './helpers.js';
import { buildPdf } from './pdf-fixture.js';

test('Dokumente: Upload, Metadaten, Anzeige und Download', async (t) => {
  const app = await startApp(t);
  const subject = await makeSubject(app, 'Netzwerktechnik');
  const content = Buffer.from('%PDF-1.4\n% Testdokument mit Umlauten: äöüß\n');

  const created = (
    await app.expect(
      'POST',
      `/api/files?kind=document&subject_id=${subject.id}&topic=Grundlagen&title=${encodeURIComponent('Skript – Grundlagen')}&filename=${encodeURIComponent('Netzwerktechnik Skript – Übung.pdf')}`,
      content,
      { headers: { 'Content-Type': 'application/pdf' } }
    )
  ).json;

  assert.equal(created.original_name, 'Netzwerktechnik Skript – Übung.pdf');
  assert.equal(created.title, 'Skript – Grundlagen');
  assert.equal(created.topic, 'Grundlagen');
  assert.equal(created.mime, 'application/pdf');
  assert.equal(created.size, content.length);
  assert.match(created.stored_name, /^[0-9a-f-]{36}\.pdf$/, 'Speichername ist neutral');
  assert.equal(created.sha256.length, 64);

  const list = (await app.expect('GET', `/api/files?subject_id=${subject.id}`)).json;
  assert.equal(list.length, 1);

  const raw = await app.get(`/api/files/${created.id}/raw`);
  assert.equal(raw.status, 200);
  assert.equal(raw.headers.get('content-type'), 'application/pdf');
  assert.match(raw.headers.get('content-disposition'), /^inline;/);
  assert.equal(raw.buffer.equals(content), true);

  const download = await app.get(`/api/files/${created.id}/raw?download=1`);
  assert.match(download.headers.get('content-disposition'), /^attachment;/);

  const head = await fetch(`${app.base}/api/files/${created.id}/raw`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), String(content.length));

  // Suche über Dateimetadaten
  const search = (await app.expect('GET', '/api/search?q=ubung')).json;
  assert.ok(search.documents.some((d) => d.id === created.id));
});

test('Dateinamen werden entschärft und Pfade bleiben im Datenordner', async (t) => {
  const app = await startApp(t);
  const created = (
    await app.expect(
      'POST',
      `/api/files?kind=document&filename=${encodeURIComponent('../../etc/passwd.txt')}`,
      Buffer.from('harmlos')
    )
  ).json;
  assert.equal(created.original_name, 'passwd.txt');
  assert.equal(created.stored_name.includes('/'), false);
  assert.equal(created.stored_name.includes('..'), false);

  const stored = path.join(app.dataDir, 'files', created.stored_name);
  assert.equal(fs.existsSync(stored), true);
  assert.equal(fs.existsSync(path.join(app.dataDir, '..', 'etc', 'passwd.txt')), false);

  const read = await app.get(`/api/files/${created.id}/raw`);
  assert.equal(read.text(), 'harmlos');

  const empty = await app.expect('GET', '/api/files?q=');
  assert.equal(empty.status, 200);
});

test('Leere Uploads, fehlende Notiz und unbekannte Dateien melden Fehler', async (t) => {
  const app = await startApp(t);
  const empty = await app.post('/api/files?kind=document&filename=leer.txt', Buffer.alloc(0));
  assert.equal(empty.status, 400);
  assert.match(empty.json.error, /leer/i);

  const noName = await app.post('/api/files?kind=document', Buffer.from('x'));
  assert.equal(noName.status, 400);

  const orphan = await app.post('/api/files?kind=attachment&note_id=99999&filename=a.pdf', Buffer.from('x'));
  assert.equal(orphan.status, 404);
  assert.match(orphan.json.error, /Notiz/);

  const note = await makeNote(app, { title: 'Mit Anhang' });
  const attachmentWithoutNote = await app.post('/api/files?kind=attachment&filename=a.pdf', Buffer.from('x'));
  assert.equal(attachmentWithoutNote.status, 400);

  const file = (
    await app.expect('POST', `/api/files?kind=attachment&note_id=${note.id}&filename=a.pdf`, Buffer.from('%PDF'))
  ).json;
  const loaded = (await app.expect('GET', `/api/notes/${note.id}`)).json;
  assert.equal(loaded.attachments.length, 1);

  // Fehlende Datei im Datenverzeichnis -> verständlicher Hinweis statt stiller Fehler.
  fs.unlinkSync(path.join(app.dataDir, 'files', file.stored_name));
  const missing = await app.get(`/api/files/${file.id}/raw`);
  assert.equal(missing.status, 410);
  assert.match(missing.json.error, /Backup/i);

  const unknown = await app.get('/api/files/99999');
  assert.equal(unknown.status, 404);
});

test('Datei löschen entfernt Datensatz und gespeicherte Kopie', async (t) => {
  const app = await startApp(t);
  const created = (
    await app.expect('POST', '/api/files?kind=document&filename=weg.txt', Buffer.from('in halt'))
  ).json;
  const stored = path.join(app.dataDir, 'files', created.stored_name);
  assert.equal(fs.existsSync(stored), true);

  await app.expect('DELETE', `/api/files/${created.id}`);
  assert.equal(fs.existsSync(stored), false);
  const list = (await app.expect('GET', '/api/files')).json;
  assert.equal(list.length, 0);
});

test('Nur Loopback und nur die lokale Oberfläche dürfen schreiben', async (t) => {
  const app = await startApp(t);

  const foreignOrigin = await app.post(
    '/api/notes',
    { title: 'Fremd' },
    { headers: { Origin: 'http://evil.example' } }
  );
  assert.equal(foreignOrigin.status, 403);
  assert.match(foreignOrigin.json.error, /lokalen Oberfläche/);

  const localOrigin = await app.post(
    '/api/notes',
    { title: 'Lokal' },
    { headers: { Origin: app.base } }
  );
  assert.equal(localOrigin.status, 201);

  const notes = (await app.expect('GET', '/api/notes')).json;
  assert.equal(notes.total, 1);

  // Fremder Host-Header (DNS-Rebinding) wird abgewiesen.
  const status = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: new URL(app.base).port,
        path: '/api/notes',
        method: 'GET',
        headers: { Host: 'evil.example' }
      },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      }
    );
    req.on('error', reject);
    req.end();
  });
  assert.equal(status, 403);
});

test('PDF-Volltext: Text wird extrahiert, gesucht und neu eingelesen', async (t) => {
  const app = await startApp(t);
  const pdf = buildPdf({
    content: 'BT /F1 12 Tf 72 720 Td (Kryptografie und RSA) Tj 0 -16 Td (Schlüsselaustausch) Tj ET',
    compress: true
  });
  const created = (
    await app.expect('POST', `/api/files?kind=document&filename=${encodeURIComponent('Kapitel 4.pdf')}`, pdf, {
      headers: { 'Content-Type': 'application/pdf' }
    })
  ).json;
  assert.equal(created.has_text, true);
  assert.ok(created.text_chars > 0);
  assert.equal(created.content_text, undefined, 'extrahierter Text gehört nicht in Listenantworten');

  // Globale Suche findet ein Wort, das nur im PDF-Inhalt steht.
  const search = (await app.expect('GET', '/api/search?q=Kryptografie')).json;
  const hit = search.documents.find((doc) => doc.id === created.id);
  assert.ok(hit, 'Dokument wird über den Inhalt gefunden');
  assert.match(hit.snippet, /Kryptografie/);

  // Dokumentenfilter nutzt denselben Index und liefert einen Auszug.
  const filtered = (await app.expect('GET', '/api/files?kind=document&q=rsa')).json;
  assert.equal(filtered.length, 1);
  assert.match(filtered[0].snippet, /RSA/i);

  const text = (await app.expect('GET', `/api/files/${created.id}/text`)).json;
  assert.match(text.text, /Kryptografie und RSA/);
  assert.match(text.text, /Schlüsselaustausch/);

  const reindexed = (await app.expect('POST', `/api/files/${created.id}/reindex`, {})).json;
  assert.equal(reindexed.chars, text.chars);
  assert.equal(reindexed.indexed, true);

  const missing = await app.post('/api/files/9999/reindex', {});
  assert.equal(missing.status, 404);
});

test('Statische Dateien: kein Ausbruch aus dem public-Ordner', async (t) => {
  const app = await startApp(t);
  const traversalVariants = [
    '/%2e%2e/server/config.js',
    '/..%2fserver%2fconfig.js',
    '/%2e%2e%2fpackage.json',
    '/../data/studyforge.db'
  ];
  for (const variant of traversalVariants) {
    const res = await app.get(variant);
    assert.ok([403, 404].includes(res.status), `${variant} -> ${res.status}`);
    assert.equal(res.text().includes('PROJECT_ROOT'), false, 'kein Quellcode-Leak');
  }

  const index = await app.get('/');
  assert.equal(index.status, 200);
  assert.match(index.text(), /StudyForge/);
  assert.match(index.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(index.headers.get('x-content-type-options'), 'nosniff');
});
