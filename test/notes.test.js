import test from 'node:test';
import assert from 'node:assert/strict';
import { makeNote, makeSubject, startApp } from './helpers.js';

test('Notiz mit Umlauten, Sonderzeichen und Zeilenumbrüchen bleibt unverändert', async (t) => {
  const app = await startApp(t);
  const title = 'Übung: Größen & „Zeichen“ – 100 % <script>alert(1)</script>';
  const content = '# Überschrift\n\n- Punkt mit Umlaut: äöüß\n- Mathe: $a^2 + b^2 = c^2$\n\n`code` und "Anführungszeichen"\n';
  const created = (await app.expect('POST', '/api/notes', { title, content })).json;
  assert.equal(created.title, title);
  assert.equal(created.content, content);

  const loaded = (await app.expect('GET', `/api/notes/${created.id}`)).json;
  assert.equal(loaded.title, title);
  assert.equal(loaded.content, content);
});

test('Leere Eingaben werden verständlich behandelt', async (t) => {
  const app = await startApp(t);
  const note = (await app.expect('POST', '/api/notes', { title: '   ', content: '' })).json;
  assert.equal(note.title, 'Unbenannte Notiz');
  assert.equal(note.content, '');

  const missing = await app.post('/api/notes/999999', { title: 'x' });
  assert.equal(missing.status, 404);

  const badBody = await app.post('/api/notes', '{kein json');
  assert.equal(badBody.status, 400);
  assert.match(badBody.json.error, /JSON/i);
});

test('Suche findet Inhalte, Schlagwörter und Dateinamen – auch ohne Umlaute', async (t) => {
  const app = await startApp(t);
  const subject = await makeSubject(app, 'Mathematik');
  const note = await makeNote(app, {
    title: 'Grüße und Straße',
    content: 'Die Lösung steht in Kapitel 3. Größenordnung beachten.',
    tags: ['Analysis', 'Übung'],
    subject_id: subject.id
  });
  await makeNote(app, { title: 'Ohne Bezug', content: 'Nichts Passendes' });

  const byUmlaut = (await app.expect('GET', '/api/search?q=Grusse')).json;
  assert.equal(byUmlaut.notes.length, 1);
  assert.equal(byUmlaut.notes[0].id, note.id);

  const byTag = (await app.expect('GET', '/api/search?q=ubung')).json;
  assert.ok(byTag.notes.some((n) => n.id === note.id), 'Suche nach Schlagwort ohne Umlaut');

  const bySubject = (await app.expect('GET', '/api/search?q=mathematik')).json;
  assert.ok(bySubject.notes.some((n) => n.id === note.id), 'Suche nach Fachname');

  const byWord = (await app.expect('GET', '/api/search?q=großenordnung')).json;
  assert.ok(byWord.notes.some((n) => n.id === note.id));

  const short = (await app.expect('GET', '/api/search?q=a')).json;
  assert.equal(short.total, 0, 'Einzelzeichen werden nicht gesucht');

  const empty = (await app.expect('GET', '/api/search?q=')).json;
  assert.equal(empty.total, 0);
});

test('Anhänge fließen in die Notizsuche ein', async (t) => {
  const app = await startApp(t);
  const note = await makeNote(app, { title: 'Skriptsammlung' });
  const upload = await app.expect(
    'POST',
    `/api/files?kind=attachment&note_id=${note.id}&filename=${encodeURIComponent('Netzwerk-Grundlagen.pdf')}`,
    Buffer.from('%PDF-1.4 Test'),
    { headers: { 'Content-Type': 'application/pdf' } }
  );
  assert.equal(upload.status, 201);

  const found = (await app.expect('GET', '/api/search?q=netzwerk-grundlagen')).json;
  assert.ok(found.notes.some((n) => n.id === note.id), 'Suche über Anhangsdateinamen');
  assert.ok(found.documents.concat(found.notes).length > 0);
});

test('Interne Verlinkungen erzeugen Hin- und Rückverweise', async (t) => {
  const app = await startApp(t);
  const target = await makeNote(app, { title: 'DNS', content: 'Domain Name System' });
  const source = await makeNote(app, { title: 'Namensauflösung', content: 'Siehe [[DNS]] und [[Unbekannt]].' });

  let loadedSource = (await app.expect('GET', `/api/notes/${source.id}`)).json;
  assert.deepEqual(loadedSource.links.map((l) => l.id), [target.id]);

  let loadedTarget = (await app.expect('GET', `/api/notes/${target.id}`)).json;
  assert.deepEqual(loadedTarget.backlinks.map((l) => l.id), [source.id]);

  // Wird der Verweis entfernt, verschwindet auch die Verknüpfung.
  await app.expect('PATCH', `/api/notes/${source.id}`, { content: 'Ohne Verweis.' });
  loadedTarget = (await app.expect('GET', `/api/notes/${target.id}`)).json;
  assert.equal(loadedTarget.backlinks.length, 0);

  // Umbenennen der Zielnotiz aktualisiert bestehende Verweise mit gleichem Titel.
  await app.expect('PATCH', `/api/notes/${source.id}`, { content: 'Neu: [[Domain Name System]]' });
  await app.expect('PATCH', `/api/notes/${target.id}`, { title: 'Domain Name System' });
  loadedSource = (await app.expect('GET', `/api/notes/${source.id}`)).json;
  assert.deepEqual(loadedSource.links.map((l) => l.id), [target.id]);
});

test('Versionen werden angelegt und lassen sich wiederherstellen', async (t) => {
  const app = await startApp(t);
  const note = await makeNote(app, { title: 'Entwurf', content: 'Erste Fassung' });
  await app.expect('PATCH', `/api/notes/${note.id}`, { content: 'Zweite Fassung' });

  const versions = (await app.expect('GET', `/api/notes/${note.id}/versions`)).json;
  assert.equal(versions.length, 1);
  assert.equal(versions[0].title, 'Entwurf');

  const version = (await app.expect('GET', `/api/notes/${note.id}/versions/${versions[0].id}`)).json;
  assert.equal(version.content, 'Erste Fassung');

  const restored = (await app.expect('POST', `/api/notes/${note.id}/versions/${versions[0].id}/restore`)).json;
  assert.equal(restored.content, 'Erste Fassung');
});

test('Papierkorb: Löschen, Wiederherstellen und endgültiges Löschen', async (t) => {
  const app = await startApp(t);
  const note = await makeNote(app, { title: 'Wegwerfnotiz' });
  await app.expect('DELETE', `/api/notes/${note.id}`);

  const active = (await app.expect('GET', '/api/notes')).json;
  assert.equal(active.notes.some((n) => n.id === note.id), false);

  const trash = (await app.expect('GET', '/api/notes?trash=1')).json;
  assert.equal(trash.notes.some((n) => n.id === note.id), true);

  await app.expect('POST', `/api/notes/${note.id}/restore`);
  const back = (await app.expect('GET', '/api/notes')).json;
  assert.equal(back.notes.some((n) => n.id === note.id), true);

  await app.expect('DELETE', `/api/notes/${note.id}?permanent=1`);
  const gone = await app.get(`/api/notes/${note.id}`);
  assert.equal(gone.status, 404);
});

test('Ordner: Hierarchie, Verschieben und Suche mit Unterordnern', async (t) => {
  const app = await startApp(t);
  const subject = await makeSubject(app, 'Informatik');
  const parent = (await app.expect('POST', '/api/folders', { name: 'Semester 1', subject_id: subject.id })).json;
  const child = (await app.expect('POST', '/api/folders', { name: 'Netzwerke', parent_id: parent.id })).json;
  await makeNote(app, { title: 'Im Unterordner', folder_id: child.id });
  await makeNote(app, { title: 'Im Hauptordner', folder_id: parent.id });

  const all = (await app.expect('GET', '/api/folders')).json;
  const childRow = all.find((f) => f.id === child.id);
  assert.equal(childRow.path, 'Semester 1 / Netzwerke');

  const withSub = (await app.expect('GET', `/api/notes?folder_id=${parent.id}&with_subfolders=1`)).json;
  assert.equal(withSub.total, 2);
  const withoutSub = (await app.expect('GET', `/api/notes?folder_id=${parent.id}`)).json;
  assert.equal(withoutSub.total, 1);

  const cyclic = await app.patch(`/api/folders/${parent.id}`, { parent_id: child.id });
  assert.equal(cyclic.status, 400);
  assert.match(cyclic.json.error, /Unterordner/);
});

test('Große Notizsammlung: 300 Notizen, Suche und Seitenweise Ausgabe', async (t) => {
  const app = await startApp(t);
  const subject = await makeSubject(app, 'Datenbanken');
  const started = Date.now();
  // In kleinen Stapeln anlegen, damit wir viele Notizen testen, ohne den
  // Testlauf durch hunderte gleichzeitige Verbindungen zu belasten.
  for (let start = 0; start < 300; start += 20) {
    const batch = [];
    for (let i = start; i < start + 20; i += 1) {
      batch.push(
        makeNote(app, {
          title: `Notiz ${String(i).padStart(3, '0')} – Normalisierung`,
          content: `Inhalt ${i}: ${'Datenbankentwurf '.repeat(20)}`,
          subject_id: subject.id,
          tags: i % 2 === 0 ? ['SQL'] : ['Modellierung']
        })
      );
    }
    await Promise.all(batch);
  }
  const insertMs = Date.now() - started;

  const firstPage = (await app.expect('GET', '/api/notes?limit=50')).json;
  assert.equal(firstPage.notes.length, 50);
  assert.ok(firstPage.total >= 300);

  const secondPage = (await app.expect('GET', '/api/notes?limit=50&offset=50')).json;
  const overlap = secondPage.notes.filter((n) => firstPage.notes.some((f) => f.id === n.id));
  assert.equal(overlap.length, 0, 'Seiten dürfen sich nicht überschneiden');

  const searchStart = Date.now();
  const search = (await app.expect('GET', '/api/search?q=normalisierung')).json;
  const searchMs = Date.now() - searchStart;
  assert.equal(search.notes.length, 12, 'Suche ist auf 12 Treffer begrenzt');
  assert.ok(searchMs < 2000, `Suche dauerte ${searchMs} ms`);
  assert.ok(insertMs < 60000, `Anlegen dauerte ${insertMs} ms`);

  const tagFilter = (await app.expect('GET', '/api/notes?tag=SQL&limit=500')).json;
  assert.ok(tagFilter.total >= 150, `Tag-Filter lieferte ${tagFilter.total}`);
});

test('Suchbegriffe mit SQL-Sonderzeichen beschädigen nichts', async (t) => {
  const app = await startApp(t);
  await makeNote(app, { title: "Robert'); DROP TABLE notes;--", content: "50% Rabatt & 'Test'" });
  const res = await app.get(`/api/search?q=${encodeURIComponent("'); DROP TABLE notes;--")}`);
  assert.equal(res.status, 200);
  const count = (await app.expect('GET', '/api/notes')).json;
  assert.equal(count.total, 1);
  const health = (await app.expect('GET', '/api/health')).json;
  assert.equal(health.ok, true);
});
