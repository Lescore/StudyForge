import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOctal, parseSymbolic, parseAny, toSymbolic, toOctal, toOctalShort, chmodOctal, chmodSymbolic, applyChmod, applyUmask, describe } from '../public/js/tools/core/os-perms.js';
import { simulate, normalizeProcesses } from '../public/js/tools/core/os-sched.js';
import { planBackups, restoreChain } from '../public/js/tools/core/os-backup.js';
import { COMMANDS, CATEGORIES, PLATFORMS, filterCommands } from '../public/js/tools/core/os-commands.js';

/* ------------------------------------------------------------ Dateirechte */
test('Oktal ↔ symbolisch inklusive s/S/t/T', () => {
  assert.equal(toSymbolic(0o755), 'rwxr-xr-x');
  assert.equal(toSymbolic(0o644), 'rw-r--r--');
  assert.equal(toSymbolic(0o4755), 'rwsr-xr-x');
  assert.equal(toSymbolic(0o4644), 'rwSr--r--');
  assert.equal(toSymbolic(0o2775), 'rwxrwsr-x');
  assert.equal(toSymbolic(0o2764), 'rwxrwSr--');
  assert.equal(toSymbolic(0o1777), 'rwxrwxrwt');
  assert.equal(toSymbolic(0o1776), 'rwxrwxrwT');
  assert.equal(toSymbolic(0), '---------');
  assert.equal(parseOctal('755'), 0o755);
  assert.equal(parseOctal('0755'), 0o755);
  assert.equal(parseOctal('4755'), 0o4755);
  assert.equal(parseOctal('1777'), 0o1777);
  assert.equal(parseOctal('7'), 0o007);
  assert.equal(toOctal(0o755), '0755');
  assert.equal(toOctalShort(0o755), '755');
  assert.equal(toOctalShort(0o4755), '4755');
});

test('Symbolisch lesen, auch im ls-Format', () => {
  assert.deepEqual(parseSymbolic('rwxr-xr-x'), { mode: 0o755, type: null, suffix: '' });
  assert.equal(parseSymbolic('-rwsr-xr-x').mode, 0o4755);
  assert.equal(parseSymbolic('-rwsr-xr-x').type, '-');
  const tmp = parseSymbolic('drwxrwxrwt');
  assert.equal(tmp.mode, 0o1777);
  assert.equal(tmp.type, 'd');
  assert.equal(parseSymbolic('drwxrwxrwT').mode, 0o1776);
  assert.equal(parseSymbolic('-rwSr--r--').mode, 0o4644);
  assert.equal(parseSymbolic('drwxr-sr-x').mode, 0o2755);
  assert.equal(parseSymbolic('-rw-r--r--+').suffix, '+');
  assert.equal(parseAny('640').mode, 0o640);
  assert.equal(parseAny('rw-r-----').mode, 0o640);
  // Rundreise für alle 4096 Modi
  for (let m = 0; m <= 0o7777; m += 1) assert.equal(parseSymbolic(toSymbolic(m)).mode, m);
});

test('Ungültige Rechte-Eingaben', () => {
  assert.throws(() => parseOctal('789'), /8 oder 9/);
  assert.throws(() => parseOctal('77777'), /zu viele Ziffern/);
  assert.throws(() => parseOctal(''), /Bitte/);
  assert.throws(() => parseOctal('7a5'), /keine Oktalzahl/);
  assert.throws(() => parseSymbolic('rwxr-xr'), /7 Zeichen/);
  assert.throws(() => parseSymbolic('rwxrwxrws'), /Position 9/);
  assert.throws(() => parseSymbolic('xrwr-xr-x'), /erwartet „r“/);
  assert.throws(() => parseSymbolic('qrwxr-xr-x'), /Dateityp-Zeichen „q“/);
  assert.throws(() => parseSymbolic('rwtr-xr-x'), /Position 3/);
});

test('chmod-Befehle erzeugen', () => {
  assert.equal(chmodOctal(0o755, 'skript.sh'), 'chmod 755 skript.sh');
  assert.equal(chmodOctal(0o4755, 'prog'), 'chmod 4755 prog');
  assert.equal(chmodSymbolic(0o755, 'datei'), 'chmod u=rwx,g=rx,o=rx datei');
  assert.equal(chmodSymbolic(0o640, 'datei'), 'chmod u=rw,g=r,o= datei');
  assert.equal(chmodSymbolic(0o1777, '/tmp'), 'chmod u=rwx,g=rwx,o=rwxt /tmp');
  assert.equal(chmodSymbolic(0o4755, 'a b'), "chmod u=rwxs,g=rx,o=rx 'a b'");
  // Erzeugter symbolischer Befehl führt wieder zum selben Modus
  for (const m of [0o755, 0o640, 0o4755, 0o2770, 0o1777, 0o7000, 0o4644]) {
    const expr = chmodSymbolic(m, 'x').split(' ')[1];
    assert.equal(applyChmod(0o777, expr).mode, m, `Modus ${m.toString(8)}`);
  }
});

test('Symbolische chmod-Ausdrücke anwenden', () => {
  assert.equal(applyChmod(0o644, 'u+x').mode, 0o744);
  assert.equal(applyChmod(0o775, 'g-w').mode, 0o755);
  assert.equal(applyChmod(0o777, 'o=r').mode, 0o774);
  assert.equal(applyChmod(0o600, 'go+r').mode, 0o644);
  assert.equal(applyChmod(0o755, 'a-x').mode, 0o644);
  assert.equal(applyChmod(0o644, 'u+x,g+x').mode, 0o754);
  assert.equal(applyChmod(0o640, 'u+r-w').mode, 0o440);
  assert.equal(applyChmod(0o750, 'o=g').mode, 0o755);
  assert.equal(applyChmod(0o755, 'u+s').mode, 0o4755);
  assert.equal(applyChmod(0o755, 'g+s').mode, 0o2755);
  assert.equal(applyChmod(0o777, '+t').mode, 0o1777);
  assert.equal(applyChmod(0o4755, 'u-s').mode, 0o755);
  assert.equal(applyChmod(0o4755, 'u=rwx').mode, 0o755, '= löscht SUID bei Dateien');
  assert.equal(applyChmod(0o2775, 'g=rwx', { isDir: true }).mode, 0o2775, '= erhält SGID bei Verzeichnissen');
  assert.equal(applyChmod(0o644, '755').mode, 0o755);
  // X: nur, wenn Verzeichnis oder schon irgendwo x gesetzt
  assert.equal(applyChmod(0o644, 'a+X').mode, 0o644);
  assert.equal(applyChmod(0o744, 'a+X').mode, 0o755);
  assert.equal(applyChmod(0o600, 'a+rX', { isDir: true }).mode, 0o755);
  // ohne u/g/o/a: umask-Bits bleiben unberührt (wie GNU chmod)
  assert.equal(applyChmod(0o600, '+w', { umask: 0o022 }).mode, 0o600);
  assert.equal(applyChmod(0o644, '+x', { umask: 0o022 }).mode, 0o755);
  assert.equal(applyChmod(0o644, '+x', { umask: 0o077 }).mode, 0o744);
  assert.equal(applyChmod(0o755, 'u+x').log.length, 1);
});

test('Ungültige chmod-Ausdrücke', () => {
  assert.throws(() => applyChmod(0o644, ''), /Bitte/);
  assert.throws(() => applyChmod(0o644, 'u+q'), /Ungültiges Zeichen „q“/);
  assert.throws(() => applyChmod(0o644, 'u+x,'), /Leerer Abschnitt/);
  assert.throws(() => applyChmod(0o644, 'x+u'), /ungültig/);
  assert.throws(() => applyChmod(0o644, 'u'), /ungültig/);
  assert.throws(() => applyChmod(0o644, '888'), /Ungültiges Zeichen „8“/);
});

test('umask', () => {
  assert.deepEqual(applyUmask('022'), { umask: 0o022, file: 0o644, dir: 0o755 });
  assert.deepEqual(applyUmask('0027'), { umask: 0o027, file: 0o640, dir: 0o750 });
  assert.deepEqual(applyUmask('077'), { umask: 0o077, file: 0o600, dir: 0o700 });
  assert.equal(applyUmask('033').file, 0o644, '666 & ~033 = 644 (nicht einfach 666 − 033)');
  assert.throws(() => applyUmask('22'), /3 oder 4/);
  assert.throws(() => applyUmask('098'), /3 oder 4/);
});

test('Erläuterungen und Warnungen', () => {
  const f = describe(0o777);
  assert.ok(f.warnings.some((w) => w.includes('777')));
  const d = describe(0o1777, { isDir: true });
  assert.ok(d.special.some((s) => s.includes('/tmp')));
  assert.ok(!d.warnings.some((w) => w.includes('ohne Sticky')));
  assert.ok(describe(0o777, { isDir: true }).warnings.some((w) => w.includes('777')));
  assert.ok(describe(0o4644).warnings.some((w) => w.includes('„S“')));
  assert.ok(describe(0o2775, { isDir: true }).special.some((s) => s.includes('erben die Gruppe')));
  assert.ok(describe(0o755, { isDir: true }).classes[0].text.includes('betreten'));
  assert.equal(describe(0o700).classes[2].text, 'keine Rechte');
});

/* ------------------------------------------------------------ Scheduling */
const avgW = (r) => r.avg.waiting / r.avg.n;

test('FCFS – Lehrbuchbeispiel (24, 3, 3)', () => {
  const procs = [
    { name: 'P1', arrival: 0, burst: 24 },
    { name: 'P2', arrival: 0, burst: 3 },
    { name: 'P3', arrival: 0, burst: 3 }
  ];
  const r = simulate(procs, { algorithm: 'fcfs' });
  assert.deepEqual(r.results.map((x) => x.waiting), [0, 24, 27]);
  assert.equal(avgW(r), 17);
  assert.deepEqual(r.segments, [
    { start: 0, end: 24, name: 'P1' },
    { start: 24, end: 27, name: 'P2' },
    { start: 27, end: 30, name: 'P3' }
  ]);
  // Gleiche Ankunft → Reihenfolge der Eingabe
  const r2 = simulate([procs[1], procs[2], procs[0]], { algorithm: 'fcfs' });
  assert.equal(avgW(r2), 3);
});

test('SJF nicht präemptiv – Lehrbuchbeispiel (6, 8, 7, 3)', () => {
  const r = simulate(
    [
      { name: 'P1', arrival: 0, burst: 6 },
      { name: 'P2', arrival: 0, burst: 8 },
      { name: 'P3', arrival: 0, burst: 7 },
      { name: 'P4', arrival: 0, burst: 3 }
    ],
    { algorithm: 'sjf' }
  );
  assert.deepEqual(r.results.map((x) => x.waiting), [3, 16, 9, 0]);
  assert.equal(avgW(r), 7);
});

test('SJF mit Ankunftszeiten und Leerlauf', () => {
  const r = simulate(
    [
      { name: 'A', arrival: 2, burst: 3 },
      { name: 'B', arrival: 3, burst: 1 },
      { name: 'C', arrival: 4, burst: 2 }
    ],
    { algorithm: 'sjf' }
  );
  assert.deepEqual(r.segments, [
    { start: 0, end: 2, name: null },
    { start: 2, end: 5, name: 'A' },
    { start: 5, end: 6, name: 'B' },
    { start: 6, end: 8, name: 'C' }
  ]);
  assert.deepEqual(r.results.map((x) => x.waiting), [0, 2, 2]);
  assert.deepEqual(r.results.map((x) => x.response), [0, 2, 2]);
});

test('SRTF – Lehrbuchbeispiel (Durchschnitt 6,5)', () => {
  const r = simulate(
    [
      { name: 'P1', arrival: 0, burst: 8 },
      { name: 'P2', arrival: 1, burst: 4 },
      { name: 'P3', arrival: 2, burst: 9 },
      { name: 'P4', arrival: 3, burst: 5 }
    ],
    { algorithm: 'srtf' }
  );
  assert.deepEqual(r.results.map((x) => x.waiting), [9, 0, 15, 2]);
  assert.equal(avgW(r), 6.5);
  assert.deepEqual(r.segments.map((s) => s.name), ['P1', 'P2', 'P4', 'P1', 'P3']);
  assert.deepEqual(r.results.map((x) => x.response), [0, 0, 15, 2]);
});

test('Priority nicht präemptiv – Lehrbuchbeispiel (Durchschnitt 8,2) und umgekehrte Konvention', () => {
  const procs = [
    { name: 'P1', arrival: 0, burst: 10, priority: 3 },
    { name: 'P2', arrival: 0, burst: 1, priority: 1 },
    { name: 'P3', arrival: 0, burst: 2, priority: 4 },
    { name: 'P4', arrival: 0, burst: 1, priority: 5 },
    { name: 'P5', arrival: 0, burst: 5, priority: 2 }
  ];
  const r = simulate(procs, { algorithm: 'prio', lowerIsHigher: true });
  assert.deepEqual(r.results.map((x) => x.waiting), [6, 0, 16, 18, 1]);
  assert.equal(avgW(r), 8.2);
  const r2 = simulate(procs, { algorithm: 'prio', lowerIsHigher: false });
  assert.deepEqual(r2.segments.map((s) => s.name), ['P4', 'P3', 'P1', 'P5', 'P2']);
});

test('Round Robin q = 2 nachgerechnet', () => {
  const r = simulate(
    [
      { name: 'P1', arrival: 0, burst: 5 },
      { name: 'P2', arrival: 0, burst: 3 },
      { name: 'P3', arrival: 0, burst: 1 }
    ],
    { algorithm: 'rr', quantum: 2 }
  );
  assert.deepEqual(r.segments.map((s) => [s.name, s.start, s.end]), [
    ['P1', 0, 2],
    ['P2', 2, 4],
    ['P3', 4, 5],
    ['P1', 5, 7],
    ['P2', 7, 8],
    ['P1', 8, 9]
  ]);
  assert.deepEqual(r.results.map((x) => x.waiting), [4, 5, 4]);
  assert.deepEqual(r.results.map((x) => x.turnaround), [9, 8, 5]);
  assert.deepEqual(r.results.map((x) => x.response), [0, 2, 4]);
  assert.equal(r.avg.waiting, 13);
});

test('Round Robin q = 4 – Lehrbuchbeispiel (24, 3, 3) Durchschnitt 17/3', () => {
  const r = simulate(
    [
      { name: 'P1', arrival: 0, burst: 24 },
      { name: 'P2', arrival: 0, burst: 3 },
      { name: 'P3', arrival: 0, burst: 3 }
    ],
    { algorithm: 'rr', quantum: 4 }
  );
  assert.deepEqual(r.results.map((x) => x.waiting), [6, 4, 7]);
  assert.equal(r.avg.waiting, 17);
});

test('Round Robin: Neuankömmlinge vor dem unterbrochenen Prozess', () => {
  // P2 kommt genau zum Ende des ersten Zeitschlitzes an.
  const r = simulate(
    [
      { name: 'P1', arrival: 0, burst: 4 },
      { name: 'P2', arrival: 2, burst: 2 }
    ],
    { algorithm: 'rr', quantum: 2 }
  );
  assert.deepEqual(r.segments.map((s) => s.name), ['P1', 'P2', 'P1']);
  const r2 = simulate(
    [
      { name: 'P1', arrival: 0, burst: 5 },
      { name: 'P2', arrival: 1, burst: 3 },
      { name: 'P3', arrival: 3, burst: 2 }
    ],
    { algorithm: 'rr', quantum: 2 }
  );
  // t=2: Queue [P2, P1]; t=4: P3 (Ankunft 3) vor P2? P2 läuft 2–4 → Queue [P1, P3, P2]
  assert.deepEqual(r2.segments.map((s) => [s.name, s.start, s.end]), [
    ['P1', 0, 2],
    ['P2', 2, 4],
    ['P1', 4, 6],
    ['P3', 6, 8],
    ['P2', 8, 9],
    ['P1', 9, 10]
  ]);
  // Schrittansicht zeigt die Ready-Queue
  const f = r2.frames.find((x) => x.time === 4);
  assert.equal(f.running, 'P1');
  assert.deepEqual(f.ready, ['P3', 'P2']);
  assert.equal(r2.frames.at(-1).note, 'Alle Prozesse sind fertig.');
});

test('Scheduling: ungültige Eingaben', () => {
  assert.throws(() => normalizeProcesses([]), /mindestens einen/);
  assert.throws(() => simulate([{ name: 'A', arrival: 0, burst: 0 }]), /Laufzeit: Erlaubt sind 1/);
  assert.throws(() => simulate([{ name: 'A', arrival: -1, burst: 2 }]), /keine ganze Zahl/);
  assert.throws(() => simulate([{ name: 'A', arrival: '1,5', burst: 2 }]), /keine ganze Zahl/);
  assert.throws(() => simulate([{ name: 'A', arrival: 0, burst: 2 }, { name: 'A', arrival: 0, burst: 1 }]), /doppelt/);
  assert.throws(() => simulate([{ name: 'A', arrival: 0, burst: 2 }], { algorithm: 'rr', quantum: 0 }), /Zeitquantum/);
  assert.throws(() => simulate(Array.from({ length: 21 }, (_, i) => ({ name: `P${i}`, arrival: 0, burst: 1 }))), /Höchstens 20/);
  assert.throws(() => simulate([{ name: 'A', arrival: 0, burst: 2 }], { algorithm: 'xyz' }), /Unbekannter/);
});

/* ------------------------------------------------------------ Backup */
test('Backup: Größen und Wiederherstellungskette', () => {
  const days = [
    { label: 'Mo', type: 'full', changed: '0' },
    { label: 'Di', type: 'incr', changed: '10' },
    { label: 'Mi', type: 'incr', changed: '5' },
    { label: 'Do', type: 'diff', changed: '20' },
    { label: 'Fr', type: 'incr', changed: '8' }
  ];
  const plan = planBackups(days, '500');
  assert.deepEqual(plan.rows.map((r) => r.size), [500, 10, 5, 35, 8]);
  assert.equal(plan.totalStored, 558);
  assert.deepEqual(restoreChain(plan.rows, 2).chain, [0, 1, 2]);
  assert.deepEqual(restoreChain(plan.rows, 3).chain, [0, 3]);
  assert.deepEqual(restoreChain(plan.rows, 4).chain, [0, 3, 4]);
  const diffs = planBackups(
    [
      { label: 'Mo', type: 'full', changed: '0' },
      { label: 'Di', type: 'diff', changed: '10' },
      { label: 'Mi', type: 'diff', changed: '5' }
    ],
    '100'
  );
  assert.deepEqual(diffs.rows.map((r) => r.size), [100, 10, 15]);
  assert.deepEqual(restoreChain(diffs.rows, 2).chain, [0, 2]);
  const noFull = planBackups([{ label: 'Mo', type: 'incr', changed: '1' }], '10');
  assert.equal(restoreChain(noFull.rows, 0).ok, false);
  assert.throws(() => planBackups([{ label: 'Mo', type: 'full', changed: '20' }], '10'), /nicht mehr Daten/);
  assert.throws(() => planBackups([{ label: 'Mo', type: 'full', changed: 'x' }], '10'), /keine Zahl/);
});

/* ------------------------------------------------------------ Befehle */
test('Befehlsreferenz: Daten vollständig und Filter', () => {
  for (const c of COMMANDS) {
    assert.ok(PLATFORMS[c.platform], c.cmd);
    assert.ok(CATEGORIES[c.cat], c.cmd);
    assert.ok(c.cmd && c.purpose && c.example, c.cmd);
    assert.ok(!/https?:\/\//.test(c.example + c.note), c.cmd);
  }
  // Jede Kategorie hat Einträge für Linux und Windows
  for (const cat of Object.keys(CATEGORIES)) {
    assert.ok(filterCommands({ platform: 'linux', cat }).length > 0, `linux ${cat}`);
    assert.ok(filterCommands({ platform: 'windows', cat }).length > 0, `windows ${cat}`);
  }
  assert.ok(filterCommands({ query: 'tracert' }).some((c) => c.platform === 'cmd' && c.cmd === 'tracert'));
  assert.ok(!COMMANDS.some((c) => c.platform === 'linux' && (c.cmd === 'tracert' || c.cmd === 'ipconfig')));
  assert.ok(filterCommands({ platform: 'linux', query: 'traceroute' }).some((c) => c.cmd === 'traceroute'));
  assert.ok(filterCommands({ platform: 'ps' }).every((c) => c.platform === 'ps'));
  const dangerous = COMMANDS.filter((c) => c.danger).map((c) => c.cmd);
  for (const d of ['rm -rf', 'dd', 'mkfs', 'format', 'Remove-Item -Recurse -Force']) assert.ok(dangerous.includes(d), d);
  // ping gibt es getrennt für Linux und cmd mit unterschiedlichen Optionen
  const pings = COMMANDS.filter((c) => c.cmd === 'ping');
  assert.deepEqual(pings.map((c) => c.platform).sort(), ['cmd', 'linux']);
  assert.ok(pings.find((c) => c.platform === 'linux').example.includes('-c'));
  assert.ok(pings.find((c) => c.platform === 'cmd').example.includes('-n'));
});
