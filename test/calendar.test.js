import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseIcs } from '../server/ics.js';
import { APP_VERSION } from '../server/config.js';
import { readZip } from '../server/zip.js';
import { makeCard, makeDeck, makeNote, makeSubject, startApp } from './helpers.js';

// Termine liegen im nächsten Jahr, damit Serien immer im Übernahmezeitraum liegen.
const Y = new Date().getFullYear() + 1;

function ics(...events) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//StudyForge Test//DE', 'X-WR-CALNAME:Hochschule', ...events.flat(), 'END:VCALENDAR'].join('\r\n');
}

const BERLIN_TZ = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Berlin',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE'
];

function vevent(fields) {
  return ['BEGIN:VEVENT', ...fields, 'END:VEVENT'];
}

const BASIC = ics(
  BERLIN_TZ,
  vevent([`UID:mathe-pruefung@hs`, `DTSTART;TZID=Europe/Berlin:${Y}0715T090000`, `DTEND;TZID=Europe/Berlin:${Y}0715T110000`, 'SUMMARY:Mathematik Prüfung', 'LOCATION:Hörsaal 3\\, Gebäude B', 'DESCRIPTION:Hilfsmittel: Formelsammlung\\nTaschenrechner erlaubt', `LAST-MODIFIED:${Y - 1}0101T120000Z`]),
  vevent([`UID:abgabe-1@hs`, `DTSTART;VALUE=DATE:${Y}0620`, 'SUMMARY:Abgabe Projektbericht']),
  vevent([`UID:vorlesung-1@hs`, `DTSTART:${Y}0110T080000Z`, `DTEND:${Y}0110T093000Z`, 'SUMMARY:Vorlesung Netzwerke'])
);

async function previewIcs(app, text, query = '') {
  const body = Buffer.isBuffer(text) ? text : Buffer.from(text, 'utf8');
  return app.post(`/api/calendar/preview?filename=uni.ics${query}`, body, { headers: { 'Content-Type': 'text/calendar' } });
}

async function importIcs(app, text, query = '', filename = 'uni.ics') {
  const body = Buffer.isBuffer(text) ? text : Buffer.from(text, 'utf8');
  return app.expect('POST', `/api/calendar/import?filename=${encodeURIComponent(filename)}${query}`, body, {
    headers: { 'Content-Type': 'text/calendar' }
  });
}

async function allEvents(app) {
  return (await app.expect('GET', '/api/calendar/events')).json;
}

function berlinWallClock(iso) {
  const parts = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
  return parts;
}

// ---------------------------------------------------------------- 1. Mehrere Termine
test('ICS-Import: gültige Datei mit mehreren Terminen – Vorschau, dann Import', async (t) => {
  const app = await startApp(t);
  const preview = await previewIcs(app, BASIC);
  assert.equal(preview.status, 200);
  assert.equal(preview.json.counts.items, 3);
  assert.equal(preview.json.counts.insert, 3);
  assert.equal(preview.json.calendarName, 'Hochschule');
  assert.equal(preview.json.sourceId, null, 'ohne bestehende Quelle wird eine neue vorgeschlagen');
  assert.equal((await allEvents(app)).length, 0, 'Vorschau speichert nichts');

  const result = (await importIcs(app, BASIC)).json;
  assert.equal(result.ok, true);
  assert.equal(result.insert, 3);
  assert.equal(result.source.name, 'Hochschule');
  const events = await allEvents(app);
  assert.equal(events.length, 3, 'alle Termine, nicht nur der erste');
  const byUid = Object.fromEntries(events.map((e) => [e.uid, e]));
  assert.equal(byUid['mathe-pruefung@hs'].category, 'pruefung');
  assert.equal(byUid['abgabe-1@hs'].category, 'abgabe');
  assert.equal(byUid['vorlesung-1@hs'].category, 'lehrveranstaltung');

  const sources = (await app.expect('GET', '/api/calendar/sources')).json;
  assert.equal(sources.length, 1);
  assert.equal(sources[0].event_count, 3);
});

// ---------------------------------------------------------------- 2. Umlaute, Sonderzeichen
test('ICS-Import: Umlaute, Sonderzeichen, Escapes, Zeilenfaltung und Windows-1252', async (t) => {
  const app = await startApp(t);
  const text = ics(
    vevent([
      'UID:sonder@hs',
      `DTSTART:${Y}0301T100000Z`,
      'SUMMARY:Übung: Größen\\, Maße \\; Ähnliches – „Zitat“ ß 🎓',
      'DESCRIPTION:Erste Zeile\\nZweite Zeile mit Backslash \\\\ und einer sehr langen Beschreibung, die über mehr',
      ' ere Zeilen gefaltet wurde',
      'LOCATION:Raum Ä-1.07'
    ])
  );
  await importIcs(app, text);
  const [event] = await allEvents(app);
  assert.equal(event.summary, 'Übung: Größen, Maße ; Ähnliches – „Zitat“ ß 🎓');
  assert.equal(event.description, 'Erste Zeile\nZweite Zeile mit Backslash \\ und einer sehr langen Beschreibung, die über mehrere Zeilen gefaltet wurde');
  assert.equal(event.location, 'Raum Ä-1.07');

  const latin1 = Buffer.from(
    `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:latin@hs\r\nDTSTART:${Y}0302T100000Z\r\nSUMMARY:Pr\xfcfung Gr\xfc\xdfe\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`,
    'latin1'
  );
  const preview = (await previewIcs(app, latin1)).json;
  assert.equal(preview.encoding, 'Windows-1252');
  assert.equal(preview.items[0].summary, 'Prüfung Grüße');

  const search = (await app.expect('GET', `/api/calendar/events?q=${encodeURIComponent('grossen')}`)).json;
  assert.equal(search.length, 1, 'Suche ist umlautunabhängig');
});

// ---------------------------------------------------------------- 3. Ganztägig
test('ICS-Import: ganztägige Termine (eintägig, mehrtägig, ohne DTEND)', async (t) => {
  const app = await startApp(t);
  await importIcs(
    app,
    ics(
      vevent(['UID:ganz-1', `DTSTART;VALUE=DATE:${Y}1224`, `DTEND;VALUE=DATE:${Y}1225`, 'SUMMARY:Heiligabend']),
      vevent(['UID:ganz-2', `DTSTART;VALUE=DATE:${Y}0803`, `DTEND;VALUE=DATE:${Y}0808`, 'SUMMARY:Prüfungswoche']),
      vevent(['UID:ganz-3', `DTSTART;VALUE=DATE:${Y}0901`, 'SUMMARY:Ohne Ende'])
    )
  );
  const byUid = Object.fromEntries((await allEvents(app)).map((e) => [e.uid, e]));
  assert.equal(byUid['ganz-1'].all_day, true);
  assert.equal(byUid['ganz-1'].start, `${Y}-12-24`);
  assert.equal(byUid['ganz-1'].end, `${Y}-12-25`);
  assert.equal(byUid['ganz-2'].end, `${Y}-08-08`, 'Ende ist exklusiv wie in RFC 5545');
  assert.equal(byUid['ganz-3'].end, `${Y}-09-02`, 'fehlendes DTEND = ein Tag');

  const range = (await app.expect('GET', `/api/calendar/events?from=${Y}-08-05&to=${Y}-08-05`)).json;
  assert.ok(range.some((e) => e.uid === 'ganz-2'), 'mehrtägiger Termin erscheint an einem mittleren Tag');
});

// ---------------------------------------------------------------- 4. Zeitzonen
test('ICS-Import: Zeitzonen (VTIMEZONE, UTC, TZID ohne VTIMEZONE, Windows-Name, Sommerzeit)', async (t) => {
  const app = await startApp(t);
  await importIcs(
    app,
    ics(
      BERLIN_TZ,
      vevent(['UID:tz-sommer', `DTSTART;TZID=Europe/Berlin:${Y}0715T100000`, 'SUMMARY:Sommer']),
      vevent(['UID:tz-winter', `DTSTART;TZID=Europe/Berlin:${Y}0115T100000`, 'SUMMARY:Winter']),
      vevent(['UID:tz-utc', `DTSTART:${Y}0115T100000Z`, `DTEND:${Y}0115T113000Z`, 'SUMMARY:UTC']),
      vevent(['UID:tz-ny', `DTSTART;TZID=America/New_York:${Y}0115T100000`, 'DURATION:PT2H', 'SUMMARY:New York ohne VTIMEZONE']),
      vevent(['UID:tz-win', `DTSTART;TZID=W. Europe Standard Time:${Y}0715T100000`, 'SUMMARY:Outlook-Zeitzone'])
    )
  );
  const byUid = Object.fromEntries((await allEvents(app)).map((e) => [e.uid, e]));
  assert.equal(byUid['tz-sommer'].start, `${Y}-07-15T08:00:00.000Z`, 'MESZ = UTC+2');
  assert.equal(byUid['tz-winter'].start, `${Y}-01-15T09:00:00.000Z`, 'MEZ = UTC+1');
  assert.equal(byUid['tz-utc'].start, `${Y}-01-15T10:00:00.000Z`);
  assert.equal(byUid['tz-utc'].end, `${Y}-01-15T11:30:00.000Z`);
  assert.equal(byUid['tz-ny'].start, `${Y}-01-15T15:00:00.000Z`, 'New York im Winter = UTC−5');
  assert.equal(byUid['tz-ny'].end, `${Y}-01-15T17:00:00.000Z`, 'DURATION wird berücksichtigt');
  assert.equal(byUid['tz-ny'].tzid, 'America/New_York');
  assert.equal(byUid['tz-win'].start, `${Y}-07-15T08:00:00.000Z`);
});

// ---------------------------------------------------------------- 5. Wiederholungen
test('ICS-Import: wiederkehrende Termine mit EXDATE, geänderter Ausnahme und Sommerzeitwechsel', async (t) => {
  const app = await startApp(t);
  // Wöchentlich ab Mitte Oktober über das Ende der Sommerzeit hinweg.
  const text = ics(
    BERLIN_TZ,
    vevent([
      'UID:serie@hs',
      `DTSTART;TZID=Europe/Berlin:${Y}1012T100000`,
      `DTEND;TZID=Europe/Berlin:${Y}1012T120000`,
      'RRULE:FREQ=WEEKLY;COUNT=6',
      `EXDATE;TZID=Europe/Berlin:${Y}1026T100000`,
      'SUMMARY:Vorlesung Algorithmen'
    ]),
    vevent([
      'UID:serie@hs',
      `RECURRENCE-ID;TZID=Europe/Berlin:${Y}1102T100000`,
      `DTSTART;TZID=Europe/Berlin:${Y}1102T140000`,
      `DTEND;TZID=Europe/Berlin:${Y}1102T160000`,
      'SUMMARY:Vorlesung Algorithmen (verlegt)',
      'LOCATION:Raum 2'
    ])
  );
  const preview = (await previewIcs(app, text)).json;
  assert.equal(preview.counts.items, 1, 'Serie erscheint in der Vorschau als ein Eintrag');
  assert.equal(preview.items[0].occurrences, 5, '6 Vorkommen minus 1 EXDATE');
  assert.equal(preview.items[0].exceptions, 1);

  await importIcs(app, text);
  const events = (await allEvents(app)).filter((e) => e.uid === 'serie@hs');
  assert.equal(events.length, 5);
  assert.ok(events.every((e) => e.rrule.includes('FREQ=WEEKLY')));
  const local = events.map((e) => berlinWallClock(e.start));
  const moved = events.find((e) => e.is_exception);
  assert.equal(moved.summary, 'Vorlesung Algorithmen (verlegt)');
  assert.equal(berlinWallClock(moved.start), '14:00');
  assert.equal(local.filter((time) => time === '10:00').length, 4, 'Ortszeit bleibt über den Sommerzeitwechsel 10:00');
  assert.ok(!events.some((e) => e.start.startsWith(`${Y}-10-26`)), 'EXDATE-Termin fehlt');
  assert.equal(new Set(events.map((e) => e.recurrence_id)).size, 5, 'jedes Vorkommen hat eine eigene Identität');

  // Unendliche Serie wird auf den Übernahmezeitraum begrenzt.
  const endless = parseIcs(ics(vevent(['UID:endlos', 'DTSTART:20200106T080000Z', 'RRULE:FREQ=DAILY', 'SUMMARY:Täglich'])), {
    now: new Date('2026-10-21T00:00:00Z')
  });
  const starts = endless.instances.map((i) => i.start).sort();
  assert.ok(starts[0] >= '2025-10-21', 'nicht älter als ein Jahr');
  assert.ok(starts.at(-1) <= '2028-10-21T23:59:59Z', 'nicht weiter als zwei Jahre voraus');
  assert.ok(endless.instances.length <= 1000, 'Obergrenze je Serie');
});

// ---------------------------------------------------------------- 6. Beschädigte Dateien
test('ICS-Import: beschädigte und ungültige Dateien – verständliche Fehler, nichts gespeichert', async (t) => {
  const app = await startApp(t);
  for (const [body, pattern] of [
    ['', /leer|fehlt/i],
    ['Das ist keine Kalenderdatei', /keine iCalendar-Datei/],
    [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]), /keine iCalendar-Datei/]
  ]) {
    const res = await app.post('/api/calendar/preview?filename=kaputt.ics', body, { headers: { 'Content-Type': 'text/calendar' } });
    assert.equal(res.status, 400);
    assert.match(res.json.error, pattern);
  }

  const tooBig = Buffer.alloc(5 * 1024 * 1024 + 10, 'A');
  const big = await app.post('/api/calendar/preview?filename=gross.ics', tooBig, { headers: { 'Content-Type': 'text/calendar' } });
  assert.equal(big.status, 413);

  // Teilweise beschädigt: ein Termin mit ungültigem Datum, einer abgeschnitten.
  const partial = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    ...vevent(['UID:gut-1', `DTSTART:${Y}0501T100000Z`, 'SUMMARY:Gut eins']),
    ...vevent(['UID:kaputt', 'DTSTART:2026XX', 'SUMMARY:Kaputt']),
    ...vevent(['UID:gut-2', `DTSTART:${Y}0502T100000Z`, 'SUMMARY:Gut zwei']),
    'BEGIN:VEVENT',
    'UID:abgeschnitten',
    'SUMMARY:Abgeschnitten'
  ].join('\r\n');
  const preview = await previewIcs(app, partial);
  assert.equal(preview.status, 200);
  assert.equal(preview.json.recovered, true);
  assert.deepEqual(preview.json.items.map((i) => i.summary).sort(), ['Gut eins', 'Gut zwei']);
  assert.ok(preview.json.errors.some((e) => e.includes('Kaputt')), 'fehlerhafter Termin wird benannt');
  assert.ok(preview.json.errors.some((e) => /unvollständig/.test(e)), 'abgeschnittener Block wird gemeldet');
  assert.equal((await allEvents(app)).length, 0);

  const imported = (await importIcs(app, partial)).json;
  assert.equal(imported.insert, 2);
  assert.ok(imported.errors.length >= 2);

  const nothing = await app.post('/api/calendar/import?filename=leer.ics', Buffer.from('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR'), {
    headers: { 'Content-Type': 'text/calendar' }
  });
  assert.equal(nothing.status, 400);
  assert.equal((await app.expect('GET', '/api/calendar/sources')).json.length, 1, 'leere Datei legt keine Quelle an');
});

// ---------------------------------------------------------------- 7. Duplikate
test('ICS-Import: erneuter Import derselben Datei erzeugt keine Duplikate', async (t) => {
  const app = await startApp(t);
  const first = (await importIcs(app, BASIC)).json;

  const preview = (await previewIcs(app, BASIC)).json;
  assert.equal(preview.suggestedSource.id, first.sourceId, 'gleiche Datei wird als bestehende Quelle erkannt');
  assert.equal(preview.sourceId, first.sourceId);
  assert.equal(preview.counts.unchanged, 3);
  assert.equal(preview.counts.insert, 0);

  const again = (await importIcs(app, BASIC, `&source_id=${first.sourceId}`)).json;
  assert.equal(again.unchanged, 3);
  assert.equal((await allEvents(app)).length, 3);

  // Auch als „neue Quelle“ werden dieselben UIDs nicht doppelt angelegt.
  const asNew = (await importIcs(app, BASIC, '&source_id=new&name=Kopie', 'kopie.ics')).json;
  assert.equal(asNew.duplicate, 3);
  assert.equal(asNew.insert, 0);
  assert.equal((await allEvents(app)).length, 3);

  // Doppelte UID innerhalb einer Datei wird nur einmal übernommen.
  const doubled = ics(
    vevent(['UID:doppelt', 'SEQUENCE:1', `DTSTART:${Y}0601T100000Z`, 'SUMMARY:Version 1']),
    vevent(['UID:doppelt', 'SEQUENCE:2', `DTSTART:${Y}0601T120000Z`, 'SUMMARY:Version 2'])
  );
  const res = (await importIcs(app, doubled, '&source_id=new', 'doppelt.ics')).json;
  assert.equal(res.insert, 1);
  const doubledEvents = (await allEvents(app)).filter((e) => e.uid === 'doppelt');
  assert.equal(doubledEvents.length, 1);
  assert.equal(doubledEvents[0].summary, 'Version 2', 'höchste SEQUENCE gewinnt');
});

async function seedExamAndEvent(app) {
  const subject = await makeSubject(app, 'Mathematik');
  const exam = (
    await app.expect('POST', '/api/exams', {
      title: 'Mathematik – Semesterprüfung',
      subject_id: subject.id,
      date: `${Y}-07-15`,
      topics: 'Integrale, Matrizen',
      goals: 'Eigenwerte sicher',
      open_topics: 'Taylorreihen',
      summary: 'Meine eigenen Notizen',
      confidence: 3
    })
  ).json;
  await importIcs(app, BASIC);
  const event = (await allEvents(app)).find((e) => e.uid === 'mathe-pruefung@hs');
  return { subject, exam, event };
}

// ---------------------------------------------------------------- 8. Manuelle Verknüpfung
test('Verknüpfung: Termin mit vorhandener Prüfung verbinden – beide Seiten verweisen aufeinander', async (t) => {
  const app = await startApp(t);
  const { exam, event } = await seedExamAndEvent(app);

  const suggestions = (await app.expect('GET', '/api/calendar/suggestions')).json;
  assert.equal(suggestions.length, 1, 'gleiches Datum + gemeinsamer Begriff ergibt einen Vorschlag');
  assert.equal(suggestions[0].exam_id, exam.id);
  assert.equal(suggestions[0].event_id, event.id);
  assert.equal((await app.expect('GET', `/api/calendar/events/${event.id}`)).json.exam_id, null, 'Vorschläge verknüpfen nicht automatisch');

  const linked = (await app.expect('POST', `/api/calendar/events/${event.id}/link`, { exam_id: exam.id })).json;
  assert.equal(linked.exam_id, exam.id);
  assert.equal(linked.exam_title, exam.title);

  const exams = (await app.expect('GET', '/api/exams')).json;
  const fromExam = exams.find((e) => e.id === exam.id);
  assert.equal(fromExam.calendar_event_id, event.id);
  assert.equal(fromExam.calendar_summary, 'Mathematik Prüfung');
  assert.equal(fromExam.calendar_location, 'Hörsaal 3, Gebäude B');
  assert.match(fromExam.calendar_description, /Formelsammlung/);
  assert.equal(fromExam.calendar_source_name, 'Hochschule');
  assert.equal(fromExam.topics, 'Integrale, Matrizen', 'Prüfungsinhalt unverändert');
  assert.equal(fromExam.date, `${Y}-07-15`, 'Datum wird nicht ungefragt überschrieben');
  assert.deepEqual((await app.expect('GET', '/api/calendar/suggestions')).json, [], 'verknüpfte Paare werden nicht mehr vorgeschlagen');

  // Eine zweite Prüfung kann denselben Termin nicht ohne Bestätigung übernehmen.
  const other = (await app.expect('POST', '/api/exams', { title: 'Andere Prüfung' })).json;
  const conflict = await app.post(`/api/calendar/events/${event.id}/link`, { exam_id: other.id });
  assert.equal(conflict.status, 409);
  const replaced = (await app.expect('POST', `/api/calendar/events/${event.id}/link`, { exam_id: other.id, replace: true })).json;
  assert.equal(replaced.exam_id, other.id);
  const after = (await app.expect('GET', '/api/exams')).json;
  assert.equal(after.find((e) => e.id === exam.id).calendar_event_id, null, 'höchstens eine Prüfung je Termin');
  assert.equal(after.find((e) => e.id === exam.id).title, exam.title, 'alte Prüfung bleibt erhalten');
});

// ---------------------------------------------------------------- 9. Prüfung aus Termin
test('Verknüpfung: Prüfung direkt aus einem Kalendertermin erstellen', async (t) => {
  const app = await startApp(t);
  await importIcs(app, BASIC);
  const event = (await allEvents(app)).find((e) => e.uid === 'mathe-pruefung@hs');
  const created = (
    await app.expect('POST', `/api/calendar/events/${event.id}/exam`, {
      title: 'Mathematik Prüfung (bearbeitet)',
      date: `${Y}-07-15`,
      start_time: '09:00',
      location: 'Hörsaal 3, Gebäude B',
      summary: 'Hilfsmittel: Formelsammlung'
    })
  ).json;
  assert.equal(created.calendar_event_id, event.id);
  assert.equal(created.title, 'Mathematik Prüfung (bearbeitet)', 'Angaben sind vor dem Speichern bearbeitbar');
  assert.equal(created.start_time, '09:00');
  assert.equal(created.location, 'Hörsaal 3, Gebäude B');

  const eventAfter = (await app.expect('GET', `/api/calendar/events/${event.id}`)).json;
  assert.equal(eventAfter.exam_id, created.id);
  assert.equal(eventAfter.summary, 'Mathematik Prüfung', 'Kalendereintrag selbst bleibt unverändert');

  const twice = await app.post(`/api/calendar/events/${event.id}/exam`, { title: 'Noch eine' });
  assert.equal(twice.status, 409);
  const invalid = await app.post(`/api/calendar/events/${event.id}/exam`, { title: 'x', start_time: '25:99' });
  assert.ok(invalid.status === 400 || invalid.status === 409);
});

// ---------------------------------------------------------------- 10. Verknüpfung aufheben
test('Verknüpfung aufheben: Prüfung und Termin bleiben vollständig erhalten', async (t) => {
  const app = await startApp(t);
  const { exam, event } = await seedExamAndEvent(app);
  await app.expect('POST', `/api/calendar/events/${event.id}/link`, { exam_id: exam.id });
  await app.expect('DELETE', `/api/calendar/events/${event.id}/link`);
  const examAfter = (await app.expect('GET', '/api/exams')).json.find((e) => e.id === exam.id);
  assert.equal(examAfter.calendar_event_id, null);
  for (const key of ['title', 'date', 'topics', 'goals', 'open_topics', 'summary', 'confidence', 'subject_id']) {
    assert.deepEqual(examAfter[key], exam[key], `Feld ${key} unverändert`);
  }
  const eventAfter = (await app.expect('GET', `/api/calendar/events/${event.id}`)).json;
  assert.equal(eventAfter.summary, event.summary);
  assert.equal(eventAfter.exam_id, null);
});

// ---------------------------------------------------------------- 11. Aktualisierte Datei
test('Erneuter Import einer aktualisierten Datei: Änderungen übernommen, Verknüpfungen bleiben', async (t) => {
  const app = await startApp(t);
  const { exam, event } = await seedExamAndEvent(app);
  await app.expect('POST', `/api/calendar/events/${event.id}/link`, { exam_id: exam.id });
  const vorlesung = (await allEvents(app)).find((e) => e.uid === 'vorlesung-1@hs');
  await app.expect('PATCH', `/api/calendar/events/${vorlesung.id}`, { category: 'pruefung' });
  const sourceId = event.source_id;

  // Prüfung verlegt (Uhrzeit + Raum), Abgabe gestrichen, ein neuer Termin, Vorlesung unverändert.
  const updated = ics(
    BERLIN_TZ,
    vevent([`UID:mathe-pruefung@hs`, `DTSTART;TZID=Europe/Berlin:${Y}0715T130000`, `DTEND;TZID=Europe/Berlin:${Y}0715T150000`, 'SUMMARY:Mathematik Prüfung', 'LOCATION:Audimax', 'SEQUENCE:1', `LAST-MODIFIED:${Y - 1}0601T120000Z`]),
    vevent([`UID:vorlesung-1@hs`, `DTSTART:${Y}0110T080000Z`, `DTEND:${Y}0110T093000Z`, 'SUMMARY:Vorlesung Netzwerke']),
    vevent([`UID:neu@hs`, `DTSTART:${Y}0201T080000Z`, 'SUMMARY:Tutorium'])
  );
  const preview = (await previewIcs(app, updated)).json;
  assert.equal(preview.sourceId, sourceId, 'aktualisierte Datei wird derselben Quelle zugeordnet');
  assert.equal(preview.counts.update, 1);
  assert.equal(preview.counts.insert, 1);
  assert.equal(preview.counts.unchanged, 1);
  assert.equal(preview.counts.remove, 1, 'gestrichene, unverknüpfte Abgabe wird entfernt');

  const result = (await importIcs(app, updated, `&source_id=${sourceId}`)).json;
  assert.equal(result.update, 1);
  const events = await allEvents(app);
  const moved = events.find((e) => e.uid === 'mathe-pruefung@hs');
  assert.equal(moved.id, event.id, 'gleiche Identität → gleiche Zeile');
  assert.equal(moved.location, 'Audimax');
  assert.equal(moved.start, `${Y}-07-15T11:00:00.000Z`);
  assert.equal(moved.exam_id, exam.id, 'Verknüpfung bleibt erhalten');
  assert.ok(!events.some((e) => e.uid === 'abgabe-1@hs'));
  assert.equal(events.find((e) => e.uid === 'vorlesung-1@hs').category, 'pruefung', 'eigene Einordnung bleibt erhalten');

  const examAfter = (await app.expect('GET', '/api/exams')).json.find((e) => e.id === exam.id);
  assert.equal(examAfter.date, `${Y}-07-15`);
  assert.equal(examAfter.start_time, null, 'Prüfungsdaten werden nicht ungefragt überschrieben');
  assert.equal(examAfter.summary, 'Meine eigenen Notizen');
  assert.equal(examAfter.calendar_location, 'Audimax', 'Prüfung zeigt den aktuellen Kalenderstand');

  // Ältere Fassung (niedrigere SEQUENCE) überschreibt den neueren Bestand nicht.
  const older = (await importIcs(app, BASIC, `&source_id=${sourceId}`)).json;
  assert.equal(older.older, 1);
  assert.equal((await app.expect('GET', `/api/calendar/events/${event.id}`)).json.location, 'Audimax');

  // Verknüpfter Termin fehlt in der Datei → bleibt erhalten, als entfernt markiert, Prüfung bleibt.
  const withoutExam = ics(vevent([`UID:vorlesung-1@hs`, `DTSTART:${Y}0110T080000Z`, `DTEND:${Y}0110T093000Z`, 'SUMMARY:Vorlesung Netzwerke']));
  const removal = (await importIcs(app, withoutExam, `&source_id=${sourceId}`)).json;
  assert.equal(removal.keepLinked, 1);
  const kept = (await app.expect('GET', `/api/calendar/events/${event.id}`)).json;
  assert.ok(kept.removed_at, 'als „in Quelle entfernt“ markiert');
  assert.equal(kept.exam_id, exam.id);
  assert.ok((await app.expect('GET', '/api/exams')).json.some((e) => e.id === exam.id), 'Prüfung wird nicht gelöscht');

  // Taucht der Termin wieder auf, ist er wieder aktiv.
  await importIcs(app, updated, `&source_id=${sourceId}`);
  assert.equal((await app.expect('GET', `/api/calendar/events/${event.id}`)).json.removed_at, null);
});

// ---------------------------------------------------------------- 12. Bestehende Daten
test('Kalenderfunktionen lassen Prüfungen, Notizen und Lernfortschritte unangetastet', async (t) => {
  const app = await startApp(t);
  const { subject, exam, event } = await seedExamAndEvent(app);
  const note = await makeNote(app, { title: 'Integrale', content: 'Partielle Integration', subject_id: subject.id });
  const deck = await makeDeck(app, 'Analysis', subject.id);
  const card = await makeCard(app, { deck_id: deck.id });
  await app.expect('POST', `/api/cards/${card.id}/review`, { rating: 3 });
  const cardBefore = (await app.expect('GET', `/api/cards/${card.id}`)).json;
  const task = (await app.expect('POST', '/api/tasks', { title: 'Übungsblatt', exam_id: exam.id })).json;

  await app.expect('POST', `/api/calendar/events/${event.id}/link`, { exam_id: exam.id });
  await importIcs(app, BASIC, `&source_id=${event.source_id}`);

  // Quelle entfernen: Termine weg, Prüfung bleibt, nur die Verknüpfung entfällt.
  const removed = (await app.expect('DELETE', `/api/calendar/sources/${event.source_id}`)).json;
  assert.equal(removed.unlinkedExams, 1);
  assert.equal((await allEvents(app)).length, 0);
  const examAfter = (await app.expect('GET', '/api/exams')).json.find((e) => e.id === exam.id);
  assert.ok(examAfter, 'Prüfung existiert weiter');
  assert.equal(examAfter.calendar_event_id, null);
  assert.equal(examAfter.topics, exam.topics);
  assert.equal(examAfter.open_tasks, 1, 'Aufgabenverknüpfung der Prüfung bleibt');

  const noteAfter = (await app.expect('GET', `/api/notes/${note.id}`)).json;
  assert.equal(noteAfter.content, 'Partielle Integration');
  const cardAfter = (await app.expect('GET', `/api/cards/${card.id}`)).json;
  assert.equal(cardAfter.reps, cardBefore.reps);
  assert.equal(cardAfter.stability, cardBefore.stability);
  assert.equal(cardAfter.due, cardBefore.due);
  assert.equal((await app.expect('GET', `/api/tasks/${task.id}`)).json.exam_id, exam.id);

  // Umgekehrt: Prüfung löschen lässt den Termin bestehen.
  await importIcs(app, BASIC);
  const ev2 = (await allEvents(app)).find((e) => e.uid === 'mathe-pruefung@hs');
  await app.expect('POST', `/api/calendar/events/${ev2.id}/link`, { exam_id: exam.id });
  await app.expect('DELETE', `/api/exams/${exam.id}`);
  const evAfter = (await app.expect('GET', `/api/calendar/events/${ev2.id}`)).json;
  assert.equal(evAfter.exam_id, null);
  assert.equal(evAfter.summary, 'Mathematik Prüfung');
});

// ---------------------------------------------------------------- 13. Backup / Migration
test('Backup und Wiederherstellung enthalten Kalenderquellen, Termine und Verknüpfungen', async (t) => {
  const source = await startApp(t);
  const { exam, event } = await seedExamAndEvent(source);
  await source.expect('POST', `/api/calendar/events/${event.id}/link`, { exam_id: exam.id });

  const backup = await source.expect('GET', '/api/export/backup');
  const entries = readZip(backup.buffer);
  const data = JSON.parse(entries.get('data.json').toString('utf8'));
  assert.equal(data.calendar_sources.length, 1);
  assert.equal(data.calendar_events.length, 3);
  const manifest = JSON.parse(entries.get('manifest.json').toString('utf8'));
  assert.equal(manifest.appVersion, APP_VERSION);
  assert.equal(manifest.counts.calendarEvents, 3);

  for (const [label, payload] of [
    ['ZIP', backup.buffer],
    ['JSON', (await source.expect('GET', '/api/export/json')).buffer]
  ]) {
    const target = await startApp(t);
    const inspected = (await target.expect('POST', '/api/import/inspect', payload)).json;
    assert.equal(inspected.ok, true, `${label}: Prüfung ok`);
    await target.expect('POST', '/api/import?confirm=replace', payload);
    const exams = (await target.expect('GET', '/api/exams')).json;
    assert.equal(exams[0].calendar_event_id, event.id, `${label}: Verknüpfung wiederhergestellt`);
    assert.equal(exams[0].calendar_summary, 'Mathematik Prüfung');
    assert.equal((await allEvents(target)).length, 3);
    // Nach der Wiederherstellung funktioniert der erneute Import ohne Duplikate.
    const preview = (await previewIcs(target, BASIC)).json;
    assert.equal(preview.counts.unchanged, 3, `${label}: Identitäten bleiben nach Wiederherstellung erkennbar`);
  }
});

test('Backups aus Version 1.0.0 lassen sich weiterhin wiederherstellen', async (t) => {
  const app = await startApp(t);
  const old = fs.readFileSync(new URL('./fixtures/studyforge-backup-v1.0.0.zip', import.meta.url));
  const inspected = (await app.expect('POST', '/api/import/inspect', old)).json;
  assert.equal(inspected.ok, true, inspected.problems.join(' '));
  assert.equal(inspected.appVersion, '1.0.0');
  assert.ok(inspected.warnings.some((w) => /älteren Version ohne Kalenderdaten/.test(w)));
  await app.expect('POST', '/api/import?confirm=replace', old);
  const exams = (await app.expect('GET', '/api/exams')).json;
  assert.equal(exams[0].title, 'Mathematik – Semesterprüfung');
  assert.equal(exams[0].calendar_event_id, null);
  assert.equal(exams[0].location, '');
});

test('Migration einer 1.0.0-Datenbank: Sicherung vorher, Daten vollständig erhalten', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studyforge-migration-'));
  fs.copyFileSync(new URL('./fixtures/studyforge-v1.0.0.db', import.meta.url), path.join(dir, 'studyforge.db'));
  const before = new DatabaseSync(path.join(dir, 'studyforge.db'), { readOnly: true });
  const countsBefore = Object.fromEntries(
    ['notes', 'cards', 'reviews', 'exams', 'tasks', 'subjects', 'topics'].map((table) => [table, before.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c])
  );
  const examBefore = before.prepare('SELECT * FROM exams').get();
  before.close();

  const app = await startApp(t, { dataDir: dir });
  const meta = (await app.expect('GET', '/api/meta')).json;
  assert.equal(meta.version, APP_VERSION);
  assert.equal(meta.schemaVersion, 3);
  assert.equal(meta.lastMigration.from, 2);

  const backupFile = path.join(dir, 'backups', meta.lastMigration.backup);
  assert.ok(fs.existsSync(backupFile), 'Sicherung vor der Migration existiert');
  const copy = new DatabaseSync(backupFile, { readOnly: true });
  assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.equal(copy.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get().value, '2', 'Sicherung ist der Stand vor der Migration');
  for (const [table, count] of Object.entries(countsBefore)) {
    assert.equal(copy.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c, count, `Sicherung: ${table}`);
  }
  copy.close();

  for (const [table, count] of Object.entries(countsBefore)) {
    assert.equal(meta.counts[table] ?? count, count, `nach Migration: ${table}`);
  }
  const exam = (await app.expect('GET', '/api/exams')).json[0];
  for (const key of ['title', 'date', 'topics', 'goals', 'summary', 'open_topics', 'confidence']) {
    assert.equal(exam[key], examBefore[key], `Prüfungsfeld ${key}`);
  }
  assert.equal(exam.open_tasks, 1);
  // Kalenderfunktionen stehen nach der Migration zur Verfügung.
  await importIcs(app, BASIC);
  const event = (await allEvents(app)).find((e) => e.uid === 'mathe-pruefung@hs');
  await app.expect('POST', `/api/calendar/events/${event.id}/link`, { exam_id: exam.id });
});

// ---------------------------------------------------------------- 14. Icons
test('App-Icon und Favicon: alle Verweise vorhanden, ausgeliefert und einheitlich', async (t) => {
  const app = await startApp(t);
  const html = (await app.expect('GET', '/')).text();
  const iconRefs = [...html.matchAll(/<link[^>]+rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(iconRefs.length >= 4, 'ICO, SVG, PNG und Apple-Touch-Icon sind eingebunden');
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(APP_VERSION, '1.2.0');
  assert.equal(pkg.version, APP_VERSION, 'package.json und App-Version stimmen überein');
  assert.equal((await app.expect('GET', '/api/meta')).json.version, APP_VERSION);
  for (const ref of iconRefs) {
    assert.ok(ref.endsWith(`?v=${APP_VERSION}`), `${ref} ist mit der App-Version versioniert (Browser-Cache)`);
    const res = await app.get(ref);
    assert.equal(res.status, 200, `${ref} wird ausgeliefert`);
    assert.ok(res.buffer.length > 100);
  }
  const ico = await app.get('/favicon.ico');
  assert.equal(ico.status, 200, 'automatische /favicon.ico-Anfrage der Browser wird bedient');
  assert.equal(ico.headers.get('content-type'), 'image/x-icon');
  assert.equal(ico.buffer.readUInt16LE(2), 1, 'gültige ICO-Datei');
  assert.ok(ico.buffer.readUInt16LE(4) >= 3, 'mehrere Auflösungen');

  const svg = (await app.get('/favicon.svg')).text();
  assert.match(svg, /#0f766e/, 'Markenfarbe');
  assert.doesNotMatch(svg, /M18 18h20a8 8 0 0 1 8 8v24H26/, 'altes Buch-Symbol ist ersetzt');
  assert.ok(html.includes(`<img class="brand-mark" src="/favicon.svg?v=${APP_VERSION}"`), 'Navigation nutzt dieselbe Icon-Datei');
  assert.doesNotMatch(html, /class="brand-mark"[^>]*>SF</, 'kein abweichendes Text-Logo mehr');

  for (const [file, size] of [['icons/favicon-16.png', 16], ['icons/favicon-32.png', 32], ['icons/apple-touch-icon.png', 180]]) {
    const png = (await app.get(`/${file}`)).buffer;
    assert.equal(png.toString('ascii', 1, 4), 'PNG');
    assert.equal(png.readUInt32BE(16), size, `${file} hat ${size} px`);
  }
});

// ---------------------------------------------------------------- 15. Offline
test('Offline: neuer Funktionsumfang ohne externe Ressourcen und ohne Netzwerkzugriffe', async (t) => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const { spawnSync } = await import('node:child_process');
  const check = spawnSync(process.execPath, [path.join(root, 'scripts', 'check-offline.js')], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stdout + check.stderr);
  assert.match(check.stdout, /OK: Keine externen Ressourcen/);

  // Serverseitiger Kalendercode baut keine ausgehenden Verbindungen auf.
  for (const file of ['server/ics.js', 'server/api-calendar.js', 'server/vendor/ical/ical.js']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /\bfetch\s*\(|node:https?|node:net|node:dgram|XMLHttpRequest|WebSocket/, `${file} enthält keine Netzwerkzugriffe`);
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies ?? {}, {}, 'keine npm-Laufzeitabhängigkeiten');

  // Kompletter Ablauf über Loopback: Import → Kalender → Prüfung → Dashboard.
  const app = await startApp(t);
  await importIcs(app, BASIC);
  const page = await app.get('/', { headers: { Accept: 'text/html' } });
  assert.match(page.text(), /href="#\/kalender"/, 'Kalender ist in der Navigation');
  for (const asset of ['/js/views/calendar.js', '/js/views/exams.js', '/css/app.css']) {
    assert.equal((await app.get(asset)).status, 200);
  }
  const dashboard = (await app.expect('GET', '/api/dashboard')).json;
  assert.ok(Array.isArray(dashboard.upcomingEvents));
});
