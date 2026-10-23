import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJson, processJson, stringifyJson, utf8Length, lineColumn } from '../public/js/tools/core/web-json.js';
import { encode, decode, parseUrl, exampleUrl } from '../public/js/tools/core/web-url.js';
import { encodeText, encodeBytes, decodeToBytes, utf8Decode, encodedLength, sniffType } from '../public/js/tools/core/web-base64.js';
import { parseTimestamp, describeInstant, isoUtc, httpDate, parseIsoDate, zonedToUtc, isoWeek, epochInfo, INT32_MAX, relativeTime } from '../public/js/tools/core/web-time.js';
import { diffText, myersDiff, sideBySide, unifiedDiff, splitLines } from '../public/js/tools/core/web-diff.js';
import { uuidV4, uuidV7, generateUuids, analyzeUuid, formatUuid, NIL_UUID } from '../public/js/tools/core/web-uuid.js';
import { HTTP_STATUS, searchStatus } from '../public/js/tools/core/web-http-status.js';
import { MIME_TYPES, searchMime, parseContentType } from '../public/js/tools/core/web-mime.js';

/* ------------------------------------------------------------ JSON */

test('JSON: formatieren, komprimieren, Schlüssel sortieren, Zahlen exakt', () => {
  const r = processJson('{"b":1,"a":[true,null,{"x":"ä\\n"}],"big":12345678901234567890}', { indent: 2 });
  assert.equal(r.output, '{\n  "b": 1,\n  "a": [\n    true,\n    null,\n    {\n      "x": "ä\\n"\n    }\n  ],\n  "big": 12345678901234567890\n}');
  assert.ok(r.warnings.some((w) => /2\^53/.test(w)));
  assert.equal(processJson('{ "b": 1, "a": 2 }', { mode: 'minify', sortKeys: true }).output, '{"a":2,"b":1}');
  assert.equal(processJson('[1,[2]]', { indent: '\t' }).output, '[\n\t1,\n\t[\n\t\t2\n\t]\n]');
  assert.equal(processJson('{}').output, '{}');
  assert.equal(processJson(' "x" ').rootType, 'string');
  assert.equal(processJson('1e-7').output, '1e-7');
  const stats = processJson('{"a":[1,2,{"b":null}]}').stats;
  assert.equal(stats.keys, 2);
  assert.equal(stats.maxDepth, 3);
  assert.match(processJson('{"a":1,"a":2}').warnings[0], /Doppelter Schlüssel „a“/);
});

test('JSON: Fehlerposition mit Zeile und Spalte', () => {
  const cases = [
    ['{\n  "a": 1,\n  "b": 2,\n}', 4, 1, /kein Komma/],
    ['{"a" 1}', 1, 6, /Doppelpunkt/],
    ["{'a': 1}", 1, 2, /doppelten Anführungszeichen/],
    ['[1, 2', 1, 6, /nicht geschlossen/],
    ['{"a": tru}', 1, 7, /Unerwartetes Zeichen/],
    ['{"a": True}', 1, 7, /„True“ ist kein JSON-Wert/],
    ['[01]', 1, 2, /Führende Nullen/],
    ['[1.]', 1, 2, /Ungültige Zahl/],
    ['"a\tb"', 1, 3, /Steuerzeichen/],
    ['"\\x"', 1, 2, /Escape-Sequenz/],
    ['// x\n{}', 1, 1, /Kommentare/],
    ['{} {}', 1, 4, /genau ein Wert/],
    ['', 1, 1, /leer/],
    ['﻿{}', 1, 1, /Byte-Order-Mark/],
    ['["ü", x]', 1, 7, /Unerwartetes Zeichen „x“/]
  ];
  for (const [text, line, column, pattern] of cases) {
    assert.throws(
      () => parseJson(text),
      (err) => {
        assert.equal(err.name, 'SyntaxError', text);
        assert.equal(err.line, line, `Zeile bei ${JSON.stringify(text)}`);
        assert.equal(err.column, column, `Spalte bei ${JSON.stringify(text)}`);
        assert.match(err.message, pattern);
        return true;
      }
    );
  }
  assert.deepEqual(lineColumn('ab\n😀x', 5), { line: 2, column: 2 });
});

test('JSON: Größen in Zeichen und UTF-8-Bytes; Grenzen', () => {
  assert.equal(utf8Length('aä€😀'), 1 + 2 + 3 + 4);
  const r = processJson('"😀"');
  assert.equal(r.input.chars, 3);
  assert.equal(r.input.bytes, 6);
  assert.throws(() => parseJson('['.repeat(1002) + ']'.repeat(1002)), /Zu tief verschachtelt/);
  assert.throws(() => parseJson(' '.repeat(2 * 1024 * 1024 + 1)), /zu groß/);
  // Ergebnis ist gleichwertig zu JSON.parse
  const text = '{"a":[1,2.5,-0,"x\\u00e4"],"b":{"c":false}}';
  assert.deepEqual(JSON.parse(stringifyJson(parseJson(text).root, { indent: 4 })), JSON.parse(text));
});

/* ------------------------------------------------------------ URL */

test('URL: encodeURIComponent vs. encodeURI, Formular-Codierung', () => {
  assert.equal(encode('a b&c=d/ä?#'), 'a%20b%26c%3Dd%2F%C3%A4%3F%23');
  assert.equal(encode('a b&c=d/ä?#', { mode: 'uri' }), 'a%20b&c=d/%C3%A4?#');
  assert.equal(encode('a b', { spaceAsPlus: true }), 'a+b');
  assert.equal(encode('😀'), '%F0%9F%98%80');
  assert.throws(() => encode('\uD800'), /Surrogat/);
});

test('URL: Decodieren mit genauer Fehlermeldung', () => {
  assert.equal(decode('caf%C3%A9%20cr%c3%a8me'), 'café crème');
  assert.equal(decode('a+b', { plusAsSpace: true }), 'a b');
  assert.equal(decode('a+b'), 'a+b');
  assert.throws(() => decode('100%'), /Ungültige %-Sequenz „%“ an Position 4/);
  assert.throws(() => decode('a%zz'), /„%zz“ an Position 2/);
  assert.throws(() => decode('K%E4se'), /kein gültiges UTF-8/);
});

test('URL: Zerlegung mit der URL-Klasse', () => {
  const u = parseUrl(exampleUrl());
  assert.equal(u.scheme, 'https');
  assert.equal(u.username, 'anna');
  assert.equal(u.password, 'geheim');
  assert.equal(u.hostname, 'shop.example.com');
  assert.equal(u.port, '8443');
  assert.equal(u.pathname, '/produkte/b%C3%BCcher/suche');
  assert.deepEqual(u.pathSegments, ['produkte', 'bücher', 'suche']);
  assert.deepEqual(u.params, [
    { key: 'q', value: 'café crème' },
    { key: 'seite', value: '2' },
    { key: 'filter', value: 'neu' },
    { key: 'filter', value: 'rabatt' }
  ]);
  assert.equal(u.fragment, 'ergebnisse');
  const d = parseUrl(['http', '://bücher.example/'].join(''));
  assert.equal(d.hostname, 'xn--bcher-kva.example');
  assert.equal(d.portIsDefault, true);
  assert.equal(d.effectivePort, '80');
  assert.throws(() => parseUrl('example.com/pfad'), /Es fehlt das Schema/);
  assert.throws(() => parseUrl(''), /Bitte eine URL/);
});

/* ------------------------------------------------------------ Base64 */

test('Base64: RFC-4648-Testvektoren und UTF-8', () => {
  const vectors = [['', ''], ['f', 'Zg=='], ['fo', 'Zm8='], ['foo', 'Zm9v'], ['foob', 'Zm9vYg=='], ['fooba', 'Zm9vYmE='], ['foobar', 'Zm9vYmFy']];
  for (const [plain, b64] of vectors) {
    assert.equal(encodeText(plain), b64);
    if (b64) assert.equal(utf8Decode(decodeToBytes(b64).bytes).text, plain);
  }
  assert.equal(encodeText('Grüße 😀'), 'R3LDvMOfZSDwn5iA');
  assert.equal(utf8Decode(decodeToBytes('R3LDvMOfZSDwn5iA').bytes).text, 'Grüße 😀');
  assert.equal(encodeBytes(Uint8Array.from([0xfb, 0xff])), '+/8=');
  assert.equal(encodeBytes(Uint8Array.from([0xfb, 0xff]), { urlSafe: true, padding: false }), '-_8');
  const url = decodeToBytes('-_8');
  assert.deepEqual([...url.bytes], [0xfb, 0xff]);
  assert.equal(url.variant, 'base64url');
  assert.match(url.warnings.join(' '), /Ohne Füllzeichen/);
  assert.equal(encodedLength(10), 16);
  assert.equal(encodedLength(10, false), 14);
});

test('Base64: ungültige Eingaben werden erkannt', () => {
  assert.throws(() => decodeToBytes('Zm9v!'), /Ungültiges Zeichen „!“ an Position 5/);
  assert.throws(() => decodeToBytes('Zm9vY'), /Ungültige Länge/);
  assert.throws(() => decodeToBytes('Zg=x'), /„=“ darf nur am Ende stehen/);
  assert.throws(() => decodeToBytes('Zm8=='), /Falsche Anzahl Füllzeichen/);
  assert.throws(() => decodeToBytes('Zm9v==='), /Zu viele Füllzeichen/);
  assert.throws(() => decodeToBytes('a+b-'), /mischt/);
  assert.throws(() => decodeToBytes('   '), /Keine Base64-Zeichen/);
  assert.deepEqual([...decodeToBytes('Zm9v\nYmFy').bytes], [...new TextEncoder().encode('foobar')]);
  assert.match(decodeToBytes('Zh==').warnings.join(' '), /nicht null/);
  assert.equal(utf8Decode(Uint8Array.from([0xc3, 0x28])).ok, false);
  assert.deepEqual(sniffType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d])), { mime: 'image/png', ext: 'png' });
});

/* ------------------------------------------------------------ Zeitstempel */

test('Zeitstempel: Einheitenerkennung und Jahr-2038-Grenze', () => {
  assert.equal(parseTimestamp('1700000000').unit, 's');
  assert.equal(parseTimestamp('1700000000000').unit, 'ms');
  assert.equal(parseTimestamp('1700000000000000').unit, 'us');
  assert.equal(parseTimestamp('1700000000000000000').unit, 'ns');
  assert.equal(parseTimestamp('1700000000000000000').ms, 1700000000000);
  assert.equal(parseTimestamp('1700000000,5', 's').ms, 1700000000500);
  assert.equal(parseTimestamp('-1', 's').ms, -1000);
  assert.equal(parseTimestamp('1', 'us').subMs, true);
  assert.equal(isoUtc(parseTimestamp(String(INT32_MAX)).ms), '2038-01-19T03:14:07.000Z');
  assert.equal(epochInfo(INT32_MAX * 1000).int32, true);
  assert.equal(epochInfo((INT32_MAX + 1) * 1000).int32, false);
  assert.equal(isoUtc(0), '1970-01-01T00:00:00.000Z');
  assert.throws(() => parseTimestamp('abc'), /ganze Zahl/);
  assert.throws(() => parseTimestamp('99999999999999', 's'), /Bereich/);
});

test('Zeitstempel: Zeitzonen, ISO 8601, RFC 2822 und HTTP-Datum', () => {
  const ms = 1700000000000; // 2023-11-14T22:13:20Z
  const berlin = describeInstant(ms, 'Europe/Berlin');
  assert.equal(berlin.iso, '2023-11-14T23:13:20+01:00');
  assert.equal(berlin.rfc2822, 'Tue, 14 Nov 2023 23:13:20 +0100');
  assert.equal(berlin.weekday, 'Dienstag');
  assert.equal(describeInstant(ms, 'Asia/Kolkata').iso, '2023-11-15T03:43:20+05:30');
  assert.equal(describeInstant(ms, 'America/New_York').offsetText, '-05:00');
  assert.equal(httpDate(ms), 'Tue, 14 Nov 2023 22:13:20 GMT');
  assert.deepEqual(isoWeek(2021, 1, 3), { week: 53, year: 2020 });
  assert.deepEqual(isoWeek(2026, 10, 23), { week: 43, year: 2026 });
  assert.throws(() => describeInstant(ms, 'Mars/Olympus'), /Unbekannte Zeitzone/);
  assert.equal(relativeTime(0, 3 * 86400000), 'vor 3 Tagen');
});

test('Zeitstempel: Datum → Zeitstempel mit Sommerzeit-Lücke und doppelter Stunde', () => {
  assert.equal(parseIsoDate('2026-10-23T14:30:00Z', 'Europe/Berlin').ms, Date.UTC(2026, 9, 23, 14, 30));
  assert.equal(parseIsoDate('2026-10-23T14:30:00+02:00', 'UTC').ms, Date.UTC(2026, 9, 23, 12, 30));
  assert.equal(parseIsoDate('2026-10-23T14:30', 'Europe/Berlin').ms, Date.UTC(2026, 9, 23, 12, 30));
  assert.equal(parseIsoDate('2026-01-15', 'Europe/Berlin').ms, Date.UTC(2026, 0, 14, 23));
  const gap = zonedToUtc({ year: 2026, month: 3, day: 29, hour: 2, minute: 30, second: 0, millisecond: 0 }, 'Europe/Berlin');
  assert.equal(gap.status, 'gap');
  const amb = zonedToUtc({ year: 2026, month: 10, day: 25, hour: 2, minute: 30, second: 0, millisecond: 0 }, 'Europe/Berlin');
  assert.equal(amb.status, 'ambiguous');
  assert.deepEqual(amb.alternatives, [Date.UTC(2026, 9, 25, 0, 30), Date.UTC(2026, 9, 25, 1, 30)]);
  assert.throws(() => parseIsoDate('2026-02-30', 'UTC'), /Tag 30 gibt es im Monat 02\/2026 nicht/);
  assert.throws(() => parseIsoDate('2016-12-31T23:59:60Z', 'UTC'), /Schaltsekunde/);
  assert.throws(() => parseIsoDate('23.10.2026', 'UTC'), /ISO 8601/);
});

/* ------------------------------------------------------------ Diff */

function lcsLength(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[a.length][b.length];
}

test('Diff: Myers liefert eine kürzeste Editierfolge (Vergleich mit LCS, Zufallstests)', () => {
  let seed = 42;
  const rand = (n) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  for (let round = 0; round < 300; round += 1) {
    const a = Array.from({ length: rand(25) }, () => rand(5));
    const b = Array.from({ length: rand(25) }, () => rand(5));
    const ops = myersDiff(a, b);
    const equal = ops.filter((o) => o.op === 'equal');
    assert.equal(equal.length, lcsLength(a, b), `Runde ${round}`);
    // Operationen rekonstruieren beide Folgen
    assert.deepEqual(ops.filter((o) => o.op !== 'insert').map((o) => a[o.a]), a);
    assert.deepEqual(ops.filter((o) => o.op !== 'delete').map((o) => b[o.b]), b);
    for (const o of equal) assert.equal(a[o.a], b[o.b]);
  }
});

test('Diff: Klassisches Beispiel ABCABBA → CBABAC hat 5 Änderungen', () => {
  const ops = myersDiff([...'ABCABBA'], [...'CBABAC']);
  assert.equal(ops.filter((o) => o.op !== 'equal').length, 5);
});

test('Diff: Text, Optionen, Statistik, unified und nebeneinander', () => {
  const left = 'eins\nzwei\ndrei\nvier\n';
  const right = 'eins\nZWEI  \ndrei\nfünf\n';
  const r = diffText(left, right);
  assert.deepEqual(r.stats, { added: 2, removed: 2, unchanged: 2 });
  const u = unifiedDiff(r, { nameA: 'alt.txt', nameB: 'neu.txt' });
  assert.equal(u.text, '--- alt.txt\n+++ neu.txt\n@@ -1,4 +1,4 @@\n eins\n-zwei\n+ZWEI  \n drei\n-vier\n+fünf\n');
  const ignore = diffText(left, right, { ignoreCase: true, ignoreTrailing: true });
  assert.deepEqual(ignore.stats, { added: 1, removed: 1, unchanged: 3 });
  const rows = sideBySide(r);
  assert.deepEqual(rows.map((x) => x.kind), ['equal', 'change', 'equal', 'change']);
  assert.equal(diffText('a\r\nb', 'a\nb').identical, true);
  assert.equal(unifiedDiff(diffText('x', 'x')).text, '');
  assert.deepEqual(splitLines(''), []);
  assert.equal(unifiedDiff(diffText('', 'neu\n')).text, '--- a\n+++ b\n@@ -0,0 +1 @@\n+neu\n');
  assert.equal(unifiedDiff(diffText('a\nb\n', 'a\nb\nc\n'), { context: 0 }).text, '--- a\n+++ b\n@@ -2,0 +3 @@\n+c\n');
  assert.throws(() => diffText('x\n'.repeat(5001), ''), /höchstens 5\.000/);
});

test('Diff: große Eingaben bleiben schnell (5000 völlig verschiedene Zeilen)', () => {
  const a = Array.from({ length: 5000 }, (_, i) => `a${i}`).join('\n');
  const b = Array.from({ length: 5000 }, (_, i) => `b${i}`).join('\n');
  const t0 = Date.now();
  const r = diffText(a, b);
  assert.equal(r.stats.removed, 5000);
  assert.equal(r.stats.added, 5000);
  assert.ok(Date.now() - t0 < 4000);
});

/* ------------------------------------------------------------ UUID */

test('UUID: Version 4 und 7 setzen Versions- und Variantenbits korrekt', () => {
  const ones = new Uint8Array(16).fill(0xff);
  assert.equal(uuidV4(ones), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
  assert.equal(uuidV4(new Uint8Array(16)), '00000000-0000-4000-8000-000000000000');
  // RFC 9562, Anhang A.6: Zeitstempel 0x017F22E279B0 = 1645557742000 ms
  const v7 = uuidV7(0x017f22e279b0, Uint8Array.from([0, 0, 0, 0, 0, 0, 0xcc, 0xc3, 0x18, 0xc4, 0xdc, 0x0c, 0x0c, 0x07, 0x39, 0x8f]));
  assert.equal(v7, '017f22e2-79b0-7cc3-98c4-dc0c0c07398f');
  const info = analyzeUuid(v7);
  assert.equal(info.version, 7);
  assert.equal(info.timestampMs, 1645557742000);
  let counter = 0;
  const list = generateUuids({ version: 7, count: 50, randomBytes: (n) => new Uint8Array(n).fill(counter++ % 256), now: () => 1700000000000 });
  assert.deepEqual([...list].sort(), list, 'v7 innerhalb derselben Millisekunde monoton');
  assert.equal(new Set(list).size, 50);
  assert.throws(() => generateUuids({ version: 4, count: 0, randomBytes: () => new Uint8Array(16) }), /zwischen 1 und 100/);
  assert.throws(() => generateUuids({ version: 4, count: 101, randomBytes: () => new Uint8Array(16) }), /zwischen 1 und 100/);
  assert.equal(formatUuid('017f22e2-79b0-7cc3-98c4-dc0c0c07398f', { upper: true, hyphens: false }), '017F22E279B07CC398C4DC0C0C07398F');
});

test('UUID: Analyse von Format, Version, Variante, Nil und v1-Zeitstempel', () => {
  assert.equal(analyzeUuid(NIL_UUID).special, 'nil');
  assert.equal(analyzeUuid('FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF').special, 'max');
  const v4 = analyzeUuid('{F47AC10B-58CC-4372-A567-0E02B2C3D479}');
  assert.equal(v4.version, 4);
  assert.equal(v4.variant.id, 'rfc');
  assert.equal(v4.canonical, 'f47ac10b-58cc-4372-a567-0e02b2c3d479');
  // RFC 9562, Anhang A.1: v1 mit Zeitstempel 2022-02-22T19:22:22Z
  const v1 = analyzeUuid('urn:uuid:C232AB00-9414-11EC-B3C8-9F6BDECED846');
  assert.equal(v1.version, 1);
  assert.equal(new Date(v1.timestampMs).toISOString(), '2022-02-22T19:22:22.000Z');
  // A.5: v6 mit demselben Zeitstempel
  assert.equal(new Date(analyzeUuid('1EC9414C-232A-6B00-B3C8-9F6BDECED846').timestampMs).toISOString(), '2022-02-22T19:22:22.000Z');
  assert.equal(analyzeUuid('f47ac10b58cc4372c5670e02b2c3d479').variant.id, 'microsoft');
  assert.throws(() => analyzeUuid('f47ac10b-58cc-4372-a567-0e02b2c3d47'), /32 Hexziffern, gefunden 31/);
  assert.throws(() => analyzeUuid('g47ac10b-58cc-4372-a567-0e02b2c3d479'), /Ungültiges Zeichen „g“/);
  assert.throws(() => analyzeUuid('f47ac10b58cc-4372-a567-0e02b2c3d479'), /Bindestriche/);
});

/* ------------------------------------------------------------ HTTP & MIME */

test('HTTP-Statuscodes: Pflichtcodes vorhanden, 418 als Scherz markiert, Suche', () => {
  const codes = HTTP_STATUS.map((s) => s.code);
  for (const c of [100, 101, 103, 200, 201, 202, 204, 206, 301, 302, 303, 304, 307, 308, 400, 401, 403, 404, 405, 406, 408, 409, 410, 411, 412, 413, 414, 415, 416, 418, 422, 425, 426, 428, 429, 431, 451, 500, 501, 502, 503, 504, 505, 511]) {
    assert.ok(codes.includes(c), `Code ${c}`);
  }
  assert.equal(new Set(codes).size, codes.length, 'keine Dubletten');
  assert.deepEqual([...codes].sort((a, b) => a - b), codes, 'aufsteigend sortiert');
  assert.equal(HTTP_STATUS.find((s) => s.code === 418).joke, true);
  assert.equal(HTTP_STATUS.filter((s) => s.joke).length, 1);
  assert.deepEqual(searchStatus('40').map((s) => s.code), [400, 401, 402, 403, 404, 405, 406, 407, 408, 409]);
  assert.ok(searchStatus('umleitung').some((s) => s.code === 307));
  assert.ok(searchStatus('', 5).every((s) => s.code >= 500 && s.code < 600));
  assert.deepEqual(searchStatus('3xx').map((s) => s.code), [300, 301, 302, 303, 304, 307, 308]);
});

test('MIME-Typen: mindestens 60 Einträge, Pflichttypen, Suche in beide Richtungen', () => {
  assert.ok(MIME_TYPES.length >= 60);
  const types = new Set(MIME_TYPES.map((m) => m.type));
  for (const t of ['text/html', 'text/css', 'text/javascript', 'application/json', 'application/pdf', 'image/png', 'image/jpeg', 'image/svg+xml', 'image/webp', 'image/avif', 'audio/mpeg', 'video/mp4', 'application/zip', 'application/gzip', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/octet-stream', 'font/woff2', 'text/csv', 'application/xml', 'text/markdown']) {
    assert.ok(types.has(t), t);
  }
  const exts = MIME_TYPES.flatMap((m) => m.ext);
  assert.equal(new Set(exts).size, exts.length, 'jede Endung nur einmal');
  assert.equal(searchMime('.PNG')[0].type, 'image/png');
  assert.equal(searchMime('docx')[0].type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.deepEqual(searchMime('image/jpeg')[0].ext, ['jpg', 'jpeg', 'jpe']);
  assert.equal(searchMime('text/html; charset=utf-8')[0].type, 'text/html');
  const ct = parseContentType('text/html; charset="UTF-8"');
  assert.deepEqual(ct.params, [{ name: 'charset', value: 'UTF-8' }]);
  assert.equal(parseContentType('image/svg+xml').suffix, 'xml');
  assert.equal(parseContentType('kein typ'), null);
});
