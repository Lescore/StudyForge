import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCard, makeDeck, makeNote, makeSubject, startApp } from './helpers.js';

test('Karteikarten: alle Typen anlegen und Validierungsfehler verständlich melden', async (t) => {
  const app = await startApp(t);
  const subject = await makeSubject(app, 'Netzwerktechnik');
  const deck = await makeDeck(app, 'Grundlagen', subject.id);

  const qa = await makeCard(app, { deck_id: deck.id, front: 'Was ist DNS?', back: 'Domain Name System' });
  assert.equal(qa.type, 'qa');
  assert.equal(qa.deck_id, deck.id);

  const cloze = await makeCard(app, {
    deck_id: deck.id,
    type: 'cloze',
    front: 'Die {{Subnetzmaske}} trennt Netz- und Hostanteil.',
    back: 'Subnetzmaske'
  });
  assert.equal(cloze.type, 'cloze');

  const trueFalse = await makeCard(app, {
    deck_id: deck.id,
    type: 'truefalse',
    front: 'Ein /24-Netz hat 254 nutzbare Hosts.',
    back: 'Richtig',
    correct_index: 0
  });
  assert.deepEqual(trueFalse.options, ['Richtig', 'Falsch']);

  const mc = await makeCard(app, {
    deck_id: deck.id,
    type: 'mc',
    front: 'Welche Schicht arbeitet mit IP-Adressen?',
    back: 'Vermittlungsschicht',
    options: ['Bitübertragung', 'Vermittlung', 'Anwendung'],
    correct_index: 1
  });
  assert.deepEqual(mc.options, ['Bitübertragung', 'Vermittlung', 'Anwendung']);
  assert.equal(mc.correct_index, 1);

  const definition = await makeCard(app, {
    deck_id: deck.id,
    type: 'definition',
    front: 'Subnetzmaske',
    back: 'Bitmaske zur Trennung von Netz- und Hostanteil.'
  });
  assert.equal(definition.type, 'definition');

  const code = await makeCard(app, {
    deck_id: deck.id,
    type: 'code',
    front: 'Was gibt `len([1, 2])` in Python zurück?',
    back: '2'
  });
  assert.equal(code.type, 'code');

  const noFront = await app.post('/api/cards', { type: 'qa', front: '  ', back: 'x' });
  assert.equal(noFront.status, 400);

  const badCloze = await app.post('/api/cards', { type: 'cloze', front: 'Ohne Lücke', back: 'x' });
  assert.equal(badCloze.status, 400);
  assert.match(badCloze.json.error, /\{\{/);

  const badMc = await app.post('/api/cards', { type: 'mc', front: 'Frage?', back: 'Antwort', options: ['nur eine'] });
  assert.equal(badMc.status, 400);

  const badDeck = await app.post('/api/cards', { deck_id: 99999, front: 'Frage', back: 'Antwort' });
  assert.equal(badDeck.status, 400);

  const all = (await app.expect('GET', `/api/cards?deck_id=${deck.id}`)).json;
  assert.equal(all.total, 6);
});

test('Karte aus Notiz anlegen und mit Notiz verknüpfen', async (t) => {
  const app = await startApp(t);
  const note = await makeNote(app, { title: 'OSI-Modell', content: '7 Schichten' });
  const card = await makeCard(app, {
    front: 'Wie viele Schichten hat das OSI-Modell?',
    back: 'Sieben',
    source_note_id: note.id
  });
  assert.equal(card.source_note_id, note.id);

  const badSource = await app.post('/api/cards', { front: 'Frage', back: 'Antwort', source_note_id: 99999 });
  assert.equal(badSource.status, 400);
});

test('Lernmodus: neue Karten sind fällig, Bewertung plant die nächste Wiederholung', async (t) => {
  const app = await startApp(t);
  const subject = await makeSubject(app, 'Programmierung');
  const deck = await makeDeck(app, 'Java', subject.id);
  const card = await makeCard(app, { deck_id: deck.id, topic: 'Vererbung', front: 'Was ist Vererbung?', back: '…' });

  const queue = (await app.expect('GET', '/api/study/queue?scope=due')).json;
  assert.ok(queue.cards.some((c) => c.id === card.id));
  assert.ok(queue.cards[0].preview.length === 4);

  const before = Date.now();
  const reviewed = (await app.expect('POST', `/api/cards/${card.id}/review`, { rating: 3, duration_ms: 1200 })).json;
  assert.equal(reviewed.card.reps, 1);
  assert.equal(reviewed.card.state, 'review');
  assert.ok(new Date(reviewed.card.due).getTime() > before);
  assert.ok(reviewed.card.stability > 0);
  assert.equal(reviewed.review.rating_label, 'Gut');
  assert.equal(typeof reviewed.review.interval_label, 'string');
  assert.ok(reviewed.review.interval_days >= 1);

  const afterQueue = (await app.expect('GET', '/api/study/queue?scope=due')).json;
  assert.equal(afterQueue.cards.some((c) => c.id === card.id), false, 'Karte ist nicht mehr sofort fällig');

  const history = (await app.expect('GET', `/api/cards/${card.id}/history`)).json;
  assert.equal(history.length, 1);
  assert.equal(history[0].rating, 3);
  assert.equal(history[0].rating_label, 'Gut');

  const invalid = await app.post(`/api/cards/${card.id}/review`, { rating: 9 });
  assert.equal(invalid.status, 400);
});

test('Lernmodus nach Fach, Stapel, Thema und schwierigen Karten', async (t) => {
  const app = await startApp(t);
  const net = await makeSubject(app, 'Netzwerktechnik');
  const math = await makeSubject(app, 'Mathematik');
  const netDeck = await makeDeck(app, 'Netzwerke', net.id);
  const mathDeck = await makeDeck(app, 'Analysis', math.id);

  const dns = await makeCard(app, { deck_id: netDeck.id, topic: 'DNS', front: 'DNS?', back: 'Namensauflösung' });
  const subnet = await makeCard(app, { deck_id: netDeck.id, topic: 'Subnetting', front: 'Subnetting?', back: '…' });
  await makeCard(app, { deck_id: mathDeck.id, topic: 'Grenzwerte', front: 'Grenzwert?', back: '…' });

  const bySubject = (await app.expect('GET', `/api/study/queue?scope=subject&subject_id=${net.id}`)).json;
  assert.equal(bySubject.cards.length, 2);

  const byDeck = (await app.expect('GET', `/api/study/queue?scope=deck&deck_id=${netDeck.id}`)).json;
  assert.equal(byDeck.cards.length, 2);

  const byTopic = (await app.expect('GET', '/api/study/queue?scope=topic&topic=Subnetting')).json;
  assert.deepEqual(byTopic.cards.map((c) => c.id), [subnet.id]);

  const missingDeck = await app.get('/api/study/queue?scope=deck');
  assert.equal(missingDeck.status, 400);

  // Schwierige Karte erzeugen und im Hard-Modus wiederfinden.
  await app.expect('POST', `/api/cards/${dns.id}/review`, { rating: 3 });
  await app.expect('POST', `/api/cards/${dns.id}/review`, { rating: 1 });
  const hard = (await app.expect('GET', '/api/study/queue?scope=hard')).json;
  assert.ok(hard.cards.some((c) => c.id === dns.id));
});

test('Karte zurücksetzen, aussetzen und wieder aktivieren', async (t) => {
  const app = await startApp(t);
  const card = await makeCard(app);
  await app.expect('POST', `/api/cards/${card.id}/review`, { rating: 2 });

  const reset = (await app.expect('POST', `/api/cards/${card.id}/reset`)).json;
  assert.equal(reset.state, 'new');
  assert.equal(reset.reps, 0);
  const history = (await app.expect('GET', `/api/cards/${card.id}/history`)).json;
  assert.equal(history.length, 1, 'Historie bleibt standardmäßig erhalten');

  await app.expect('POST', `/api/cards/${card.id}/review`, { rating: 1 });
  const resetHard = (await app.expect('POST', `/api/cards/${card.id}/reset?history=0`)).json;
  assert.equal(resetHard.reps, 0);
  const historyGone = (await app.expect('GET', `/api/cards/${card.id}/history`)).json;
  assert.equal(historyGone.length, 0);

  await app.expect('PATCH', `/api/cards/${card.id}`, { suspended: true });
  const queue = (await app.expect('GET', '/api/study/queue?scope=due')).json;
  assert.equal(queue.cards.some((c) => c.id === card.id), false, 'Ausgesetzte Karten erscheinen nicht');
  const blocked = await app.post(`/api/cards/${card.id}/review`, { rating: 3 });
  assert.equal(blocked.status, 400);
  await app.expect('PATCH', `/api/cards/${card.id}`, { suspended: false });
});

test('Karte bearbeiten und Stapel löschen (Karten behalten)', async (t) => {
  const app = await startApp(t);
  const deck = await makeDeck(app, 'Temporär');
  const card = await makeCard(app, { deck_id: deck.id, front: 'Alt', back: 'Antwort' });

  const edited = (await app.expect('PATCH', `/api/cards/${card.id}`, { front: 'Neu', back: 'Neue Antwort' })).json;
  assert.equal(edited.front, 'Neu');
  assert.equal(edited.back, 'Neue Antwort');

  const deleted = (await app.expect('DELETE', `/api/decks/${deck.id}`)).json;
  assert.equal(deleted.keptCards, 1);
  const loaded = (await app.expect('GET', `/api/cards/${card.id}`)).json;
  assert.equal(loaded.deck_id, null);

  const deletedWithCards = await app.expect('DELETE', `/api/decks/${(await makeDeck(app, 'Weg')).id}?delete_cards=1`);
  assert.equal(deletedWithCards.json.deletedCards, 0);
});
