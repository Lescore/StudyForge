import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRating,
  intervalLabel,
  nextIntervalDays,
  previewCard,
  retrievability,
  RATING_LABELS
} from '../server/fsrs.js';

const newCard = {
  state: 'new',
  due: null,
  stability: 0,
  difficulty: 0,
  reps: 0,
  lapses: 0,
  last_review: null
};

test('Neue Karte: Bewertung "Gut" plant eine Wiederholung in der Zukunft', () => {
  const now = new Date('2026-01-01T10:00:00.000Z');
  const result = applyRating(newCard, 3, now, 0.9);
  assert.equal(result.state, 'review');
  assert.equal(result.reps, 1);
  assert.ok(result.stability > 0);
  assert.ok(result.difficulty >= 1 && result.difficulty <= 10);
  assert.ok(new Date(result.due) > now);
  assert.equal(result.last_review, now.toISOString());
});

test('Neue Karte: "Sicher" ergibt ein längeres Intervall als "Gut"', () => {
  const now = new Date('2026-01-01T10:00:00.000Z');
  const good = applyRating(newCard, 3, now, 0.9);
  const easy = applyRating(newCard, 4, now, 0.9);
  assert.ok(easy.intervalDays > good.intervalDays, `${easy.intervalDays} > ${good.intervalDays}`);
});

test('Neue Karte: "Nicht gewusst" kommt nach 10 Minuten wieder', () => {
  const now = new Date('2026-01-01T10:00:00.000Z');
  const result = applyRating(newCard, 1, now, 0.9);
  assert.equal(result.state, 'relearning');
  const minutes = (new Date(result.due) - now) / 60000;
  assert.ok(Math.abs(minutes - 10) < 0.001, `10 Minuten erwartet, war ${minutes}`);
});

test('applyRating verändert die übergebene Karte nicht', () => {
  const card = { ...newCard };
  const copy = { ...card };
  applyRating(card, 4, new Date(), 0.9);
  assert.deepEqual(card, copy);
});

test('Wiederholte gute Bewertungen vergrößern den Abstand', () => {
  let card = { ...newCard };
  let now = new Date('2026-01-01T08:00:00.000Z');
  const intervals = [];
  for (let i = 0; i < 4; i += 1) {
    const result = applyRating(card, 3, now, 0.9);
    intervals.push(result.intervalDays);
    card = { ...card, ...result };
    now = new Date(now.getTime() + result.intervalDays * 86400000);
  }
  for (let i = 1; i < intervals.length; i += 1) {
    assert.ok(intervals[i] > intervals[i - 1], `Intervall ${i} muss wachsen: ${intervals.join(', ')}`);
  }
});

test('Vergessen erhöht Fehlgriffe und senkt die Stabilität nicht unter das Minimum', () => {
  let card = { ...newCard };
  const first = applyRating(card, 3, new Date('2026-01-01T08:00:00.000Z'), 0.9);
  card = { ...card, ...first };
  const again = applyRating(card, 1, new Date('2026-01-05T08:00:00.000Z'), 0.9);
  assert.equal(again.lapses, 1);
  assert.equal(again.state, 'relearning');
  assert.ok(again.stability > 0);
  assert.ok(again.stability <= first.stability + 1e-9);
  assert.equal(again.reps, 2);
});

test('Höhere Ziel-Merkfähigkeit führt zu kürzeren Intervallen', () => {
  const short = nextIntervalDays(10, 0.99);
  const long = nextIntervalDays(10, 0.7);
  assert.ok(short < long, `0.99 -> ${short}, 0.7 -> ${long}`);
});

test('nextIntervalDays bleibt in sinnvollen Grenzen', () => {
  assert.ok(nextIntervalDays(0, 0.9) > 0);
  assert.ok(nextIntervalDays(100000, 0.9) <= 36500);
  // Ungültige Retention wird auf den erlaubten Bereich begrenzt.
  assert.equal(nextIntervalDays(10, 5), nextIntervalDays(10, 0.99));
});

test('Retrievability sinkt mit der Zeit und ist am Wiederholungstag hoch', () => {
  assert.ok(retrievability(0, 10) > 0.99);
  assert.ok(retrievability(5, 10) < retrievability(0, 10));
  assert.equal(retrievability(0, 0), 0);
});

test('Vorschau liefert alle vier Bewertungen mit deutschem Text', () => {
  const preview = previewCard(newCard, new Date('2026-01-01T10:00:00.000Z'), 0.9);
  assert.equal(preview.length, 4);
  assert.deepEqual(preview.map((p) => p.rating), [1, 2, 3, 4]);
  for (const entry of preview) {
    assert.equal(entry.label, RATING_LABELS[entry.rating]);
    assert.equal(typeof entry.intervalLabel, 'string');
    assert.ok(!Number.isNaN(new Date(entry.due).getTime()));
  }
});

test('Intervalltexte sind lesbar und deutsch', () => {
  assert.equal(intervalLabel(0), 'jetzt');
  assert.equal(intervalLabel(2), '2 Tage');
  assert.equal(intervalLabel(45), '1,5 Monate');
  assert.ok(/Jahre$/.test(intervalLabel(800)));
  assert.ok(/Min$/.test(intervalLabel(10 / 1440)));
});
