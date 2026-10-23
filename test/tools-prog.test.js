import test from 'node:test';
import assert from 'node:assert/strict';
import { sortFrames, parseList, randomList, ALGORITHMS } from '../public/js/tools/core/prog-sort.js';
import { evaluate, display, formatSci, durationText, parseN, CLASSES } from '../public/js/tools/core/prog-bigo.js';
import { Stack, Queue, LinkedList, BST, HashTable, hashKey, parseValue, parseKey, TOMBSTONE } from '../public/js/tools/core/prog-ds.js';
import { collectMatches, replacePreview, buildRegex, segmentsFor, LIMITS as RX } from '../public/js/tools/core/prog-regex.js';
import { GitSim, tokenize, validBranchName } from '../public/js/tools/core/prog-git.js';

/* ------------------------------------------------------------ Sortieren */
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

test('Sortieralgorithmen: Endzustand sortiert für viele Eingaben', () => {
  const rnd = seeded(42);
  const inputs = [
    [],
    [7],
    [1, 2, 3, 4, 5],
    [5, 4, 3, 2, 1],
    [3, 1, 3, 2, 1, 3],
    [0, -5, 999, -999, 0, 42],
    [2, 2, 2, 2]
  ];
  for (let i = 0; i < 30; i += 1) inputs.push(randomList(1 + Math.floor(rnd() * 60), rnd, { min: -999, max: 999 }));
  for (const algo of Object.keys(ALGORITHMS)) {
    for (const input of inputs) {
      const frames = sortFrames(algo, input);
      const last = frames.at(-1);
      const expected = [...input].sort((a, b) => a - b);
      assert.deepEqual(last.array, expected, `${algo} ${JSON.stringify(input)}`);
      assert.equal(last.sorted.length, input.length);
      assert.deepEqual(frames[0].array, input, 'erster Frame = Ausgangslage');
      // Zähler wachsen monoton
      for (let k = 1; k < frames.length; k += 1) {
        assert.ok(frames[k].comparisons >= frames[k - 1].comparisons);
        assert.ok(frames[k].swaps >= frames[k - 1].swaps);
      }
    }
  }
});

test('Sortieren: Zähler an bekannten Fällen', () => {
  // Bubble Sort auf sortierter Liste: ein Durchlauf, n−1 Vergleiche, kein Tausch
  let last = sortFrames('bubble', [1, 2, 3, 4]).at(-1);
  assert.equal(last.comparisons, 3);
  assert.equal(last.swaps, 0);
  // Bubble Sort umgekehrt: n(n−1)/2 Vergleiche und Vertauschungen
  last = sortFrames('bubble', [4, 3, 2, 1]).at(-1);
  assert.equal(last.comparisons, 6);
  assert.equal(last.swaps, 6);
  // Selection Sort: immer n(n−1)/2 Vergleiche
  assert.equal(sortFrames('selection', [1, 2, 3, 4, 5]).at(-1).comparisons, 10);
  assert.equal(sortFrames('selection', [1, 2, 3, 4, 5]).at(-1).swaps, 0);
  // Insertion Sort sortiert: n−1 Vergleiche, keine Schreibzugriffe
  last = sortFrames('insertion', [1, 2, 3, 4, 5]).at(-1);
  assert.equal(last.comparisons, 4);
  assert.equal(last.writes, 0);
  // Quick Sort (Lomuto) auf [3,1,2]: Pivot 2, 2 Vergleiche; dann [1] und [3]
  last = sortFrames('quick', [3, 1, 2]).at(-1);
  assert.equal(last.comparisons, 2);
  // Merge Sort schreibt n·⌈log2 n⌉ = 8 Mal für n = 4
  assert.equal(sortFrames('merge', [4, 3, 2, 1]).at(-1).writes, 8);
  // Pivot und Vergleich werden im Frame markiert
  const q = sortFrames('quick', [5, 1, 4]);
  assert.ok(q.some((f) => f.pivot === 2 && f.compare));
});

test('Sortieren: Eingabe prüfen', () => {
  assert.deepEqual(parseList('5, 3;1  -2 −7'), [5, 3, 1, -2, -7]);
  assert.deepEqual(parseList(''), []);
  assert.throws(() => parseList('1, 2, x'), /keine ganze Zahl/);
  assert.throws(() => parseList('1000'), /außerhalb/);
  assert.throws(() => parseList('1.5'), /keine ganze Zahl/);
  assert.throws(() => parseList(Array(61).fill(1).join(',')), /Höchstens 60/);
  assert.throws(() => sortFrames('heap', [1]), /Unbekannter/);
  assert.equal(randomList(100, Math.random).length, 60);
});

/* ------------------------------------------------------------ Big-O */
test('Big-O: exakte Werte und Zehnerpotenzen', () => {
  assert.equal(evaluate('o2n', 10).exact, 1024n);
  assert.equal(evaluate('o2n', 100).exact, 2n ** 100n);
  assert.equal(display(evaluate('o2n', 100)).sci, '≈ 1,27·10^30');
  assert.equal(evaluate('o2n', 1000).exact, null);
  assert.equal(display(evaluate('o2n', 1000)).text, '≈ 1,07·10^301');
  assert.equal(evaluate('ofact', 20).exact, 2432902008176640000n);
  assert.equal(display(evaluate('ofact', 1000)).text, '≈ 4,02·10^2567');
  assert.equal(display(evaluate('ofact', 100000)).text, '≈ 2,82·10^456573');
  assert.equal(evaluate('on2', 1000).exact, 1000000n);
  assert.equal(evaluate('on3', 1000000).exact, 10n ** 18n);
  assert.equal(evaluate('olog', 1024).exact, 10n);
  assert.equal(evaluate('olog', 1000).exact, null);
  assert.equal(display(evaluate('olog', 1000)).text, '≈ 9,97');
  assert.equal(evaluate('onlog', 8).exact, 24n);
  assert.equal(evaluate('o1', 5).exact, 1n);
  assert.equal(formatSci(Math.log10(5)), '5·10^0');
  assert.equal(formatSci(2.99999999), '1·10^3');
  assert.equal(CLASSES.length, 8);
});

test('Big-O: Laufzeit-Annahme und Eingabeprüfung', () => {
  assert.equal(durationText(9), '≈ 1 s');
  assert.equal(durationText(3), '≈ 1 µs');
  assert.equal(durationText(0), 'unter 1 µs');
  assert.match(durationText(30.1), /Jahre$/);
  assert.equal(parseN('1000'), 1000);
  assert.equal(parseN('1 000'), 1000);
  assert.throws(() => parseN('0'), /1 bis/);
  assert.throws(() => parseN('-5'), /keine positive/);
  assert.throws(() => parseN('2000000'), /1 bis/);
});

/* ------------------------------------------------------------ Datenstrukturen */
test('Stack und Queue inklusive Fehlerfälle', () => {
  const s = new Stack();
  assert.equal(s.pop().ok, false);
  assert.match(s.pop().message, /leerem Stack/);
  assert.equal(s.peek().ok, false);
  s.push(1);
  s.push(2);
  assert.equal(s.peek().value, 2);
  assert.equal(s.pop().value, 2);
  assert.deepEqual(s.items, [1]);
  for (let i = 0; i < 25; i += 1) s.push(i);
  assert.equal(s.items.length, 20);
  const q = new Queue();
  assert.equal(q.dequeue().ok, false);
  q.enqueue(1);
  q.enqueue(2);
  assert.equal(q.peek().value, 1);
  assert.equal(q.dequeue().value, 1);
  assert.deepEqual(q.items, [2]);
});

test('Verkettete Liste', () => {
  const l = new LinkedList();
  l.insertTail(2);
  l.insertHead(1);
  l.insertTail(4);
  assert.equal(l.insertAt(2, 3).ok, true);
  assert.deepEqual(l.items, [1, 2, 3, 4]);
  assert.equal(l.insertAt(9, 5).ok, false);
  assert.deepEqual(l.search(3).path, [0, 1, 2]);
  assert.equal(l.search(9).ok, false);
  assert.equal(l.deleteValue(2).ok, true);
  assert.equal(l.deleteValue(2).ok, false);
  assert.equal(l.deleteAt(0).value, 1);
  assert.equal(l.deleteAt(5).ok, false);
  assert.deepEqual(l.items, [3, 4]);
  assert.equal(new LinkedList().deleteAt(0).ok, false);
});

test('Binärer Suchbaum: Einfügen, Suchen, Löschen, Traversierungen, Höhe', () => {
  const t = new BST([50, 30, 70, 20, 40, 60, 80]);
  assert.deepEqual(t.inorder(), [20, 30, 40, 50, 60, 70, 80]);
  assert.deepEqual(t.preorder(), [50, 30, 20, 40, 70, 60, 80]);
  assert.deepEqual(t.postorder(), [20, 40, 30, 60, 80, 70, 50]);
  assert.deepEqual(t.levelorder(), [50, 30, 70, 20, 40, 60, 80]);
  assert.equal(t.height(), 2);
  assert.equal(new BST().height(), -1);
  assert.equal(new BST([1]).height(), 0);
  assert.deepEqual(t.search(60).path, [50, 70, 60]);
  assert.equal(t.search(65).ok, false);
  const dup = t.insert(40);
  assert.equal(dup.ok, false);
  assert.match(dup.message, /Duplikate/);
  // Blatt
  assert.match(t.delete(20).message, /Blatt/);
  // ein Kind
  t.insert(65);
  assert.match(t.delete(60).message, /ein Kind/);
  assert.deepEqual(t.inorder(), [30, 40, 50, 65, 70, 80]);
  // zwei Kinder → In-Order-Nachfolger
  const r = t.delete(50);
  assert.match(r.message, /Nachfolger 65/);
  assert.deepEqual(t.inorder(), [30, 40, 65, 70, 80]);
  assert.deepEqual(t.levelorder(), [65, 30, 70, 40, 80]);
  // Nachfolger ist direktes rechtes Kind
  const u = new BST([10, 5, 15, 20]);
  u.delete(10);
  assert.deepEqual(u.preorder(), [15, 5, 20]);
  assert.equal(u.delete(99).ok, false);
  // Wurzel mit einem Kind löschen
  const w = new BST([1, 2]);
  w.delete(1);
  assert.deepEqual(w.preorder(), [2]);
  assert.equal(w.count, 1);
  const lay = new BST([2, 1, 3]).layout();
  assert.deepEqual(lay.nodes.map((n) => [n.key, n.x, n.y]), [[1, 0, 1], [2, 1, 0], [3, 2, 1]]);
});

test('Hash-Tabelle: Hashfunktion, Verkettung, lineares Sondieren', () => {
  assert.equal(hashKey(17, 7).hash, 3);
  assert.equal(hashKey(-3, 7).hash, 4);
  assert.equal(hashKey('ab', 7).hash, (97 + 98) % 7);
  assert.match(hashKey('ab', 7).explain, /97 \+ 98 = 195/);
  const c = new HashTable(5);
  c.insert(3);
  const col = c.insert(8);
  assert.match(col.message, /Kollision/);
  assert.deepEqual(c.buckets[3], [3, 8]);
  assert.equal(c.insert(8).ok, false);
  assert.equal(c.loadFactor, 2 / 5);
  assert.equal(c.search(8).ok, true);
  assert.equal(c.delete(3).ok, true);
  assert.deepEqual(c.buckets[3], [8]);
  const p = new HashTable(5, { strategy: 'probing' });
  p.insert(3);
  const r = p.insert(8);
  assert.equal(r.highlight, 4);
  assert.deepEqual(r.probes, [3, 4]);
  const r2 = p.insert(13);
  assert.equal(r2.highlight, 0, 'Umlauf an den Anfang');
  assert.equal(p.delete(8).ok, true);
  assert.equal(p.buckets[4], TOMBSTONE);
  assert.equal(p.search(13).ok, true, 'Suche läuft über den Grabstein weiter');
  assert.equal(p.insert(13).ok, false, 'Duplikat hinter Grabstein erkannt');
  const full = new HashTable(2, { strategy: 'probing' });
  full.insert(1);
  full.insert(2);
  assert.match(full.insert(3).message, /voll/);
  assert.throws(() => new HashTable(0), /1 bis 31/);
  assert.throws(() => parseValue('abc'), /keine ganze Zahl/);
  assert.throws(() => parseValue('1000'), /−999|-999/);
  assert.equal(parseKey(' Anna ', 'text'), 'Anna');
  assert.throws(() => parseKey('', 'text'), /Bitte/);
});

/* ------------------------------------------------------------ Regex */
test('Regex: Treffer, Gruppen, Flags', () => {
  const r = collectMatches('(?<jahr>\\d{4})-(\\d{2})', 'g', 'am 2024-05 und 1999-12');
  assert.equal(r.matches.length, 2);
  assert.deepEqual(r.matches[0], { index: 3, length: 7, text: '2024-05', groups: [{ n: 1, value: '2024', start: null }, { n: 2, value: '05', start: null }], named: { jahr: '2024' } });
  // Ohne g nur der erste Treffer
  assert.equal(collectMatches('\\d', '', 'a1b2').matches.length, 1);
  // i-Flag
  assert.equal(collectMatches('abc', 'gi', 'ABC abc').matches.length, 2);
  // optionale Gruppe ohne Treffer → null
  assert.equal(collectMatches('a(b)?', 'g', 'a').matches[0].groups[0].value, null);
  // d-Flag liefert Startpositionen
  assert.equal(collectMatches('x(y)', 'gd', 'axy').matches[0].groups[0].start, 2);
});

test('Regex: Null-Längen-Treffer schalten weiter (keine Endlosschleife)', () => {
  assert.equal(collectMatches('', 'g', 'abc').matches.length, 4);
  assert.deepEqual(collectMatches('x*', 'g', 'axxb').matches.map((m) => [m.index, m.length]), [[0, 0], [1, 2], [3, 0], [4, 0]]);
  // Mit u-Flag wird ein Emoji (Surrogatpaar) als ein Zeichen übersprungen
  assert.equal(collectMatches('', 'gu', '😀').matches.length, 2);
  assert.equal(collectMatches('', 'g', '😀').matches.length, 3);
  assert.equal(collectMatches('^', 'gm', 'a\nb\nc').matches.length, 3);
});

test('Regex: Grenzen und Fehlermeldungen', () => {
  const many = collectMatches('a', 'g', 'a'.repeat(5000));
  assert.equal(many.matches.length, RX.matches);
  assert.equal(many.truncated, true);
  assert.equal(collectMatches('a', 'g', 'aaa', { maxMatches: 3 }).truncated, false);
  assert.throws(() => buildRegex('(', 'g'), (e) => e.name === 'InputError' && /Ungültiges Muster:/.test(e.message));
  assert.throws(() => buildRegex('a', 'gq'), /Unbekanntes Flag „q“/);
  assert.throws(() => buildRegex('a', 'gg'), /doppelt/);
  assert.throws(() => buildRegex('a'.repeat(1001), ''), /zu lang/);
  assert.throws(() => collectMatches('a', 'g', 'a'.repeat(100001)), /zu lang/);
  assert.equal(replacePreview('(\\w+)@(\\w+)', 'g', 'anna@uni', '$2:$1'), 'uni:anna');
  assert.equal(replacePreview('(?<n>\\d)', 'g', 'a1', '[$<n>]'), 'a[1]');
  assert.throws(() => replacePreview('a', 'g', 'a', 'x'.repeat(1001)), /zu lang/);
});

test('Regex: Abschnitte für sichere Hervorhebung', () => {
  const text = 'x<b>y';
  const { matches } = collectMatches('<b>', 'g', text);
  assert.deepEqual(segmentsFor(text, matches), [
    { text: 'x', match: null },
    { text: '<b>', match: 0, empty: false },
    { text: 'y', match: null }
  ]);
  const z = collectMatches('', 'g', 'ab');
  assert.equal(segmentsFor('ab', z.matches).map((s) => s.text).join(''), 'ab');
});

/* ------------------------------------------------------------ Git */
test('Git: Tokenizer und Branchnamen', () => {
  assert.deepEqual(tokenize('git commit -m "Erster Versuch"'), ['git', 'commit', '-m', 'Erster Versuch']);
  assert.deepEqual(tokenize("git commit -m 'a b'"), ['git', 'commit', '-m', 'a b']);
  assert.deepEqual(tokenize('git commit -m ""'), ['git', 'commit', '-m', '']);
  assert.ok(validBranchName('feature/login'));
  assert.ok(!validBranchName('-x'));
  assert.ok(!validBranchName('a..b'));
  assert.ok(!validBranchName('HEAD'));
  assert.ok(!validBranchName('c3'));
  assert.ok(!validBranchName('x.lock'));
});

test('Git: Commit, Branch, Fast-Forward-Merge', () => {
  const g = new GitSim();
  assert.ok(g.run('git commit -m "Zweiter"').ok);
  assert.equal(g.state.branches.main, 'c2');
  assert.ok(g.run('git checkout -b feature').ok);
  g.run('git commit -m "F1"');
  g.run('git commit -m "F2"');
  assert.equal(g.state.branches.feature, 'c4');
  g.run('git switch main');
  const m = g.run('git merge feature');
  assert.ok(m.ok);
  assert.ok(m.output.includes('Fast-forward'));
  assert.equal(g.state.branches.main, 'c4');
  assert.equal(Object.keys(g.state.commits).length, 4, 'kein Merge-Commit');
  assert.deepEqual(g.run('git merge feature').output, ['Bereits aktuell.']);
});

test('Git: echter Merge mit zwei Eltern und --no-ff', () => {
  const g = new GitSim();
  g.run('git branch feature');
  g.run('git commit -m "M2"'); // c2 auf main
  g.run('git switch feature');
  g.run('git commit -m "F1"'); // c3
  g.run('git switch main');
  const r = g.run('git merge feature');
  assert.ok(r.ok);
  const merge = g.state.commits[g.state.branches.main];
  assert.equal(merge.id, 'c4');
  assert.deepEqual(merge.parents, ['c2', 'c3']);
  assert.equal(merge.message, "Merge branch 'feature'");
  assert.equal(g.mergeBase('c2', 'c3'), 'c1');
  const h = new GitSim();
  h.run('git checkout -b f');
  h.run('git commit -m "x"');
  h.run('git checkout main');
  h.run('git merge --no-ff f');
  assert.equal(h.state.commits[h.state.branches.main].parents.length, 2);
  assert.match(h.run('git log --oneline').output[0], /^c3 \(HEAD -> main\) Merge branch 'f'/);
});

test('Git: Rebase erzeugt neue Commits, alte werden unerreichbar', () => {
  const g = new GitSim();
  g.run('git switch -c feature');
  g.run('git commit -m "F1"'); // c2
  g.run('git commit -m "F2"'); // c3
  g.run('git switch main');
  g.run('git commit -m "M1"'); // c4
  g.run('git switch feature');
  const r = g.run('git rebase main');
  assert.ok(r.ok, r.output.join('\n'));
  assert.equal(g.state.branches.feature, 'c6');
  assert.deepEqual(g.state.commits.c5.parents, ['c4']);
  assert.deepEqual(g.state.commits.c6.parents, ['c5']);
  assert.equal(g.state.commits.c5.message, 'F1');
  assert.equal(g.state.commits.c5.rebasedFrom, 'c2');
  const reach = g.reachable();
  assert.ok(!reach.has('c2') && !reach.has('c3'));
  assert.ok(reach.has('c4'));
  // Danach ist main Vorfahre → FF-Merge möglich
  g.run('git switch main');
  assert.ok(g.run('git merge feature').output.includes('Fast-forward'));
  // Rebase auf Vorfahren: nichts zu tun
  assert.match(g.run('git rebase c1').output[0], /auf dem neuesten Stand/);
  // Rebase ohne eigene Commits → vorspulen
  const h = new GitSim();
  h.run('git branch alt');
  h.run('git commit -m "neu"');
  h.run('git switch alt');
  assert.match(h.run('git rebase main').output[0], /Fast-forward/);
  assert.equal(h.state.branches.alt, 'c2');
});

test('Git: Fehlerfälle, detached HEAD, Rückgängig', () => {
  const g = new GitSim();
  g.run('git branch feature');
  let r = g.run('git branch feature');
  assert.equal(r.ok, false);
  assert.equal(r.output[0], "fatal: Ein Branch namens 'feature' existiert bereits.");
  r = g.run('git switch gibtsnicht');
  assert.equal(r.ok, false);
  assert.match(r.output[0], /Ungültige Referenz: gibtsnicht/);
  assert.match(g.run('git checkout gibtsnicht').output[0], /Pfadspezifikation/);
  assert.match(g.run('git merge gibtsnicht').output[0], /nichts, was wir zusammenführen können/);
  assert.match(g.run('git rebase gibtsnicht').output[0], /Ungültiger Upstream/);
  assert.match(g.run('git commit').output[0], /-m/);
  assert.match(g.run('git push').output[0], /kein \(simulierter\) Git-Befehl/);
  assert.match(g.run('ls -la').output[0], /mit „git“ beginnen/);
  assert.match(g.run('git branch -d main').output[0], /gerade ausgecheckt/);
  assert.match(g.run('git switch c1').output[0], /Branch erwartet/);
  assert.equal(g.run('git switch main').output[0], "Bereits auf 'main'");
  // nicht zusammengeführter Branch
  g.run('git switch feature');
  g.run('git commit -m "nur feature"');
  g.run('git switch main');
  assert.match(g.run('git branch -d feature').output[0], /nicht vollständig zusammengeführt/);
  assert.ok(g.run('git branch -D feature').ok);
  // detached HEAD
  r = g.run('git checkout c1');
  assert.ok(r.ok);
  assert.equal(g.state.head.branch, null);
  g.run('git commit -m "lose"');
  assert.equal(g.state.head.detached, 'c3');
  assert.match(g.run('git status').output[0], /HEAD losgelöst bei c3/);
  // Rückgängig
  const before = JSON.stringify(g.state);
  g.run('git switch main');
  assert.ok(g.undo());
  assert.equal(JSON.stringify(g.state), before);
  // Fehlerhafte Befehle verändern nichts und landen nicht im Rückgängig-Stapel
  const n = g.past.length;
  g.run('git merge nix');
  assert.equal(g.past.length, n);
  assert.match(g.run('git commit -m "offen').output[0], /Anführungszeichen/);
  g.reset();
  assert.deepEqual(Object.keys(g.state.commits), ['c1']);
});
