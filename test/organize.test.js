import test from 'node:test';
import assert from 'node:assert/strict';
import { makeNote, makeSubject, startApp } from './helpers.js';

test('Aufgaben: Teilaufgaben, Verknüpfungen, Status und Filter', async (t) => {
  const app = await startApp(t);
  const subject = await makeSubject(app, 'Netzwerktechnik');
  const note = await makeNote(app, { title: 'Subnetting' });

  const task = (
    await app.expect('POST', '/api/tasks', {
      title: 'Übungsblatt 4',
      description: 'Aufgaben 1–5',
      subject_id: subject.id,
      priority: 'hoch',
      due_date: '2026-10-22',
      subtasks: [{ title: 'Aufgabe 1' }, { title: 'Aufgabe 2' }]
    })
  ).json;
  assert.equal(task.title, 'Übungsblatt 4');
  assert.equal(task.subtasks.length, 2);

  const linked = (await app.expect('PATCH', `/api/tasks/${task.id}`, { note_ids: [note.id] })).json;
  assert.deepEqual(linked.note_ids, [note.id]);

  const sub = (await app.expect('POST', `/api/tasks/${task.id}/subtasks`, { title: 'Aufgabe 3' })).json;
  await app.expect('PATCH', `/api/subtasks/${sub.id}`, { done: true });
  const updated = (await app.expect('GET', `/api/tasks/${task.id}`)).json;
  assert.equal(updated.subtasks.filter((s) => s.done).length, 1);

  await app.expect('PATCH', `/api/tasks/${task.id}`, { status: 'erledigt' });
  const done = (await app.expect('GET', `/api/tasks/${task.id}`)).json;
  assert.equal(done.status, 'erledigt');
  assert.ok(done.completed_at, 'Erledigte Aufgabe bekommt Zeitstempel');

  const open = (await app.expect('GET', '/api/tasks?open=1')).json;
  assert.equal(open.length, 0);
  const all = (await app.expect('GET', '/api/tasks')).json;
  assert.equal(all.length, 1);
  assert.equal(all[0].subtasks.length, 3);
  assert.equal(all[0].subtask_count, 3);

  const missingTitle = await app.post('/api/tasks', { title: '  ' });
  assert.equal(missingTitle.status, 400);
});

test('Prüfungen: Datum, Selbsteinschätzung und offene Themen', async (t) => {
  const app = await startApp(t);
  const subject = await makeSubject(app, 'Betriebssysteme');
  const exam = (
    await app.expect('POST', '/api/exams', {
      title: 'Klausur BS',
      subject_id: subject.id,
      date: '2026-12-15',
      topics: 'Scheduling, Speicherverwaltung',
      goals: 'Round Robin erklären',
      open_topics: 'Seitenersetzung',
      confidence: 3
    })
  ).json;
  assert.equal(exam.date, '2026-12-15');
  assert.equal(exam.confidence, 3);

  const invalidDate = await app.post('/api/exams', { title: 'Test', date: '15.12.2026' });
  assert.equal(invalidDate.status, 400);
  assert.match(invalidDate.json.error, /JJJJ-MM-TT/);

  const clamped = (await app.expect('POST', '/api/exams', { title: 'Zweitklausur', confidence: 99 })).json;
  assert.equal(clamped.confidence, 5);

  const list = (await app.expect('GET', '/api/exams')).json;
  assert.equal(list.length, 2);

  const dashboard = (await app.expect('GET', '/api/dashboard')).json;
  assert.ok(dashboard.upcomingExams.some((e) => e.id === exam.id));
});

test('Themen und Lernziele steuern den Fachfortschritt', async (t) => {
  const app = await startApp(t);
  const subject = await makeSubject(app, 'Datenbanken');
  const sql = (await app.expect('POST', '/api/topics', { subject_id: subject.id, name: 'SQL' })).json;
  const model = (await app.expect('POST', '/api/topics', { subject_id: subject.id, name: 'Modellierung' })).json;

  const duplicate = await app.post('/api/topics', { subject_id: subject.id, name: 'SQL' });
  assert.equal(duplicate.status, 409);

  await app.expect('PATCH', `/api/topics/${sql.id}`, { status: 'verstanden' });
  await app.expect('PATCH', `/api/topics/${model.id}`, { status: 'ueben' });

  const invalid = await app.patch(`/api/topics/${model.id}`, { status: 'fertig' });
  assert.equal(invalid.status, 400);

  const detail = (await app.expect('GET', `/api/subjects/${subject.id}`)).json;
  assert.equal(detail.topic_count, 2);
  assert.equal(detail.topics_done, 1);
  assert.equal(detail.progress, 50);

  const dashboard = (await app.expect('GET', '/api/dashboard')).json;
  assert.ok(dashboard.practiceTopics.some((tp) => tp.id === model.id));
  assert.ok(dashboard.understoodTopics.some((tp) => tp.id === sql.id));

  const goal = (
    await app.expect('POST', '/api/goals', { subject_id: subject.id, title: 'Normalformen sicher anwenden' })
  ).json;
  await app.expect('PATCH', `/api/goals/${goal.id}`, { status: 'erledigt' });
  const goals = (await app.expect('GET', `/api/goals?subject_id=${subject.id}`)).json;
  assert.equal(goals[0].status, 'erledigt');
});

test('Subnetting-Rechner und Übungsprüfung', async (t) => {
  const app = await startApp(t);
  const calc = (await app.expect('GET', '/api/tools/subnet/calculate?ip=192.168.10.130&prefix=26')).json;
  assert.equal(calc.network, '192.168.10.128');
  assert.equal(calc.broadcast, '192.168.10.191');
  assert.equal(calc.first, '192.168.10.129');
  assert.equal(calc.last, '192.168.10.190');
  assert.equal(calc.usable_hosts, 62);

  const check = (
    await app.expect('POST', '/api/tools/subnet/check', {
      ip: '192.168.10.130',
      prefix: 26,
      network: '192.168.10.128',
      broadcast: '192.168.10.191',
      first: '192.168.10.129',
      last: '192.168.10.190',
      usable_hosts: 62
    })
  ).json;
  assert.equal(check.allCorrect, true);

  const wrong = (
    await app.expect('POST', '/api/tools/subnet/check', {
      ip: '192.168.10.130',
      prefix: 26,
      network: '192.168.10.0',
      broadcast: '192.168.10.255',
      first: '192.168.10.1',
      last: '192.168.10.254',
      usable_hosts: 254
    })
  ).json;
  assert.equal(wrong.allCorrect, false);
  assert.equal(wrong.results.filter((r) => !r.correct).length, 4);

  const invalid = await app.get('/api/tools/subnet/calculate?ip=999.1.1.1&prefix=26');
  assert.equal(invalid.status, 400);
});

test('Werkzeuge: Codebeispiele, Formeln und gespeicherte Subnetting-Aufgaben', async (t) => {
  const app = await startApp(t);
  const subject = await makeSubject(app, 'Programmierung');

  const snippet = (
    await app.expect('POST', '/api/snippets', {
      title: 'Summe in Python',
      language: 'python',
      code: 'sum([1, 2, 3])',
      explanation: 'Addiert alle Elemente.',
      subject_id: subject.id,
      topic: 'Listen'
    })
  ).json;
  assert.equal(snippet.language, 'python');
  const snippets = (await app.expect('GET', `/api/snippets?subject_id=${subject.id}`)).json;
  assert.equal(snippets.length, 1);

  const formula = (
    await app.expect('POST', '/api/formulas', {
      name: 'Satz des Pythagoras',
      latex: 'a^2 + b^2 = c^2',
      topic: 'Geometrie',
      subject_id: subject.id
    })
  ).json;
  assert.equal(formula.latex, 'a^2 + b^2 = c^2');
  const formulas = (await app.expect('GET', '/api/formulas')).json;
  assert.equal(formulas.length, 1);

  const exercise = (
    await app.expect('POST', '/api/subnets', {
      title: 'Übung /26',
      ip: '10.0.0.70',
      prefix: 26,
      working: 'Blockgröße 64 → Netz .64',
      subject_id: subject.id
    })
  ).json;
  assert.equal(exercise.answer_network, '10.0.0.64');
  assert.equal(exercise.answer_hosts, 62);
  const exercises = (await app.expect('GET', `/api/subnets?subject_id=${subject.id}`)).json;
  assert.equal(exercises.length, 1);
  assert.match(exercises[0].working, /Blockgröße/);

  const updated = (await app.expect('PATCH', `/api/subnets/${exercise.id}`, { prefix: 27 })).json;
  assert.equal(updated.answer_network, '10.0.0.64');
  assert.equal(updated.answer_hosts, 30);

  const invalid = await app.post('/api/subnets', { ip: '10.0.0.300', prefix: 26 });
  assert.equal(invalid.status, 400);
});

test('Vorlagen anlegen, anpassen, nutzen und löschen', async (t) => {
  const app = await startApp(t);
  const builtin = (await app.expect('GET', '/api/templates')).json;
  assert.ok(builtin.length >= 9);
  assert.ok(builtin.some((tpl) => tpl.name === 'Prüfungsvorbereitung'));

  const own = (
    await app.expect('POST', '/api/templates', {
      name: 'Eigene Wochenplanung',
      kind: 'notiz',
      content: '# {{Titel}}\n\n- [ ] '
    })
  ).json;
  assert.ok(!own.builtin, 'Eigene Vorlage ist nicht als eingebaut markiert');

  const edited = (await app.expect('PATCH', `/api/templates/${own.id}`, { name: 'Wochenplan' })).json;
  assert.equal(edited.name, 'Wochenplan');

  const note = (
    await app.expect('POST', '/api/notes', {
      title: 'Woche 42',
      content: edited.content.replace('{{Titel}}', 'Woche 42')
    })
  ).json;
  assert.match(note.content, /Woche 42/);

  await app.expect('DELETE', `/api/templates/${own.id}`);
  const remaining = (await app.expect('GET', '/api/templates')).json;
  assert.equal(remaining.some((tpl) => tpl.id === own.id), false);
});
