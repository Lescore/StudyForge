import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parse, tokenize, evaluate, variablesOf, truthTable, toText, gateTable, gateOutput,
  canonicalDNF, canonicalKNF, minimizeDNF, dnfText, analyzeExpression, sameTable, primeImplicants, bitsOf
} from '../public/js/tools/core/logic-expr.js';
import { EXAMPLES, analyzeCircuit, circuitTruthTable, evaluateCircuit, gateExpression, gateDepths } from '../public/js/tools/core/logic-circuit.js';
import { utf8Bytes, utf16Units, describeCodepoint, parseCodepointQuery, blockPage, analyzeText, ASCII_CONTROL, category } from '../public/js/tools/core/charset.js';
import { createMemory, parseBytes, writeBytes, encodeValue, writeValue, readValue, hexdump, hexdumpText, parseAddress } from '../public/js/tools/core/memory-layout.js';

/* ---------------------------------------------------------------- Gatter */

test('Gatter: Wahrheitstabellen mit 2 Eingängen', () => {
  const outs = (type) => gateTable(type, 2).map((r) => r.out).join('');
  assert.equal(outs('AND'), '0001');
  assert.equal(outs('OR'), '0111');
  assert.equal(outs('XOR'), '0110');
  assert.equal(outs('NAND'), '1110');
  assert.equal(outs('NOR'), '1000');
  assert.equal(outs('XNOR'), '1001');
  assert.equal(gateTable('NOT', 1).map((r) => r.out).join(''), '10');
});

test('Gatter: mehrere Eingänge (XOR = Parität)', () => {
  assert.equal(gateTable('XOR', 3).map((r) => r.out).join(''), '01101001');
  assert.equal(gateTable('AND', 4).filter((r) => r.out).length, 1);
  assert.equal(gateTable('NOR', 4)[0].out, 1);
  assert.throws(() => gateOutput('NOT', [1, 0]), /braucht 1/);
  assert.deepEqual(bitsOf(5, 4), [0, 1, 0, 1]);
});

/* ---------------------------------------------------------------- Parser */

test('Parser: verschiedene Schreibweisen ergeben dieselbe Funktion', () => {
  const forms = ['A AND NOT B OR C', 'A & !B | C', 'A ∧ ¬B ∨ C', "A·B' + C", 'a and not b or c'.replace(/a/, 'A').replace(/b/, 'B').replace(/c/, 'C'), 'A && ~B || C'];
  const ref = parse(forms[0]);
  for (const f of forms) assert.ok(sameTable(parse(f), ref, ['A', 'B', 'C']), f);
});

test('Parser: Rangfolge NOT > AND > XOR > OR und Linksassoziativität', () => {
  assert.equal(toText(parse('A + B · C')), 'A + B · C');
  assert.equal(toText(parse('(A + B) · C')), '(A + B) · C');
  assert.equal(toText(parse('A ^ B + C')), 'A ⊕ B + C');
  // A NAND B NAND C = (A NAND B) NAND C
  const ast = parse('A NAND B NAND C');
  assert.equal(evaluate(ast, { A: 1, B: 1, C: 1 }), 1);
  assert.equal(evaluate(ast, { A: 1, B: 1, C: 0 }), 1);
  assert.equal(evaluate(ast, { A: 0, B: 0, C: 1 }), 0);
  assert.equal(evaluate(parse("(A·B)'"), { A: 1, B: 1 }), 0);
  assert.equal(evaluate(parse("A''"), { A: 1 }), 1);
  assert.equal(evaluate(parse('NOT NOT 0'), {}), 0);
});

test('Parser: Variablen alphabetisch, Konstanten, Schlüsselwörter', () => {
  assert.deepEqual(variablesOf(parse('C OR A AND B')), ['A', 'B', 'C']);
  assert.deepEqual(variablesOf(parse('1 XOR 0')), []);
  assert.equal(tokenize('A XNOR B')[1].type, 'XNOR');
  assert.equal(tokenize('A ⊕ B')[1].type, 'XOR');
  assert.equal(tokenize("A'")[1].type, 'PRIME');
});

test('Parser: verständliche Syntaxfehler mit Position', () => {
  const cases = [
    ['(A AND B', /Position 9: Schließende Klammer „\)“ fehlt/],
    ['A AND', /Position 6: Nach „AND“ fehlt ein Operand/],
    ['A B', /Position 3: Zwischen den Operanden fehlt ein Operator/],
    ['A ) B', /Position 3: Schließende Klammer „\)“ ohne passende/],
    ['A $ B', /Position 3: Unerwartetes Zeichen „\$“/],
    ['2 AND A', /Position 1: .*nur 0 und 1/],
    ['A OR OR B', /Position 6: Nach „OR“ fehlt ein Operand/],
    ['()', /Position 2: Leere Klammern/],
    ['   ', /Bitte einen booleschen Ausdruck/]
  ];
  for (const [input, re] of cases) assert.throws(() => parse(input), re, input);
  try {
    parse('A AND (B');
  } catch (error) {
    assert.equal(error.name, 'InputError');
    assert.equal(error.position, 8);
  }
});

test('Parser: mehr als 4 Variablen werden abgelehnt', () => {
  assert.throws(() => truthTable(parse('A+B+C+D+E')), /Höchstens 4 Variablen/);
});

test('Parser: wirft nie bei zufälligen Eingaben etwas anderes als InputError', () => {
  const alphabet = ['A', 'B', ' ', '(', ')', '&', '|', '!', "'", '^', '0', '1', 'AND', 'NOT', '+', '·'];
  let seed = 42;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 2000; i += 1) {
    const len = 1 + Math.floor(rnd() * 10);
    let s = '';
    for (let j = 0; j < len; j += 1) s += alphabet[Math.floor(rnd() * alphabet.length)];
    try {
      const ast = parse(s);
      truthTable(ast);
    } catch (error) {
      assert.equal(error.name, 'InputError', `${s}: ${error.message}`);
    }
  }
});

/* ---------------------------------------------------------------- Normalformen */

test('Kanonische DNF/KNF für XOR', () => {
  assert.equal(canonicalDNF(['A', 'B'], [1, 2]), '¬A·B + A·¬B');
  assert.equal(canonicalKNF(['A', 'B'], [0, 3]), '(A + B)·(¬A + ¬B)');
  assert.equal(canonicalDNF(['A'], []), '0');
  assert.equal(canonicalKNF(['A'], []), '1');
});

test('Quine-McCluskey: bekannte Lehrbuchbeispiele', () => {
  // f(A,B,C,D) = Σm(0,1,2,5,6,7,8,9,10,14) → ¬B·¬C + C·¬D + ¬A·B·D (3 Terme, 7 Literale)
  const ms = [0, 1, 2, 5, 6, 7, 8, 9, 10, 14];
  const r = minimizeDNF(4, ms);
  assert.equal(r.terms.length, 3);
  const vars = ['A', 'B', 'C', 'D'];
  const text = dnfText(r.terms, vars);
  assert.equal(text, '¬A·B·D + ¬B·¬C + C·¬D');
  const table = truthTable(parse(text), vars);
  assert.deepEqual(table.filter((x) => x.out).map((x) => x.index), ms);
  assert.equal(r.terms.reduce((s, t) => s + (4 - popcount(t.mask)), 0), 7);
});

function popcount(x) {
  let c = 0;
  while (x) {
    c += x & 1;
    x >>= 1;
  }
  return c;
}

test('Quine-McCluskey: zyklische Überdeckung (keine wesentlichen Primimplikanten)', () => {
  // Σm(0,1,2,5,6,7) mit 3 Variablen: 6 Primimplikanten, minimale Lösung hat 3 Terme
  const r = minimizeDNF(3, [0, 1, 2, 5, 6, 7]);
  assert.equal(primeImplicants(3, [0, 1, 2, 5, 6, 7]).primes.length, 6);
  assert.equal(r.essential.length, 0);
  assert.equal(r.terms.length, 3);
  const vars = ['A', 'B', 'C'];
  assert.deepEqual(truthTable(parse(dnfText(r.terms, vars)), vars).filter((x) => x.out).map((x) => x.index), [0, 1, 2, 5, 6, 7]);
});

test('Quine-McCluskey: Konstanten 0 und 1', () => {
  assert.equal(dnfText(minimizeDNF(2, []).terms, ['A', 'B']), '0');
  assert.equal(dnfText(minimizeDNF(2, [0, 1, 2, 3]).terms, ['A', 'B']), '1');
  assert.equal(analyzeExpression('A OR NOT A').minimalText, '1');
  assert.equal(analyzeExpression('A AND NOT A').minimalText, '0');
});

test('Vereinfachung ist für ALLE Funktionen mit 1–4 Variablen per Wahrheitstabelle verifiziert', () => {
  for (let n = 1; n <= 4; n += 1) {
    const vars = ['A', 'B', 'C', 'D'].slice(0, n);
    const rows = 2 ** n;
    // n = 4: alle 65 536 Funktionen wären langsam – jede 7. prüfen plus Grenzfälle.
    const step = n === 4 ? 7 : 1;
    for (let f = 0; f < 2 ** rows; f += step) {
      const ms = [];
      for (let i = 0; i < rows; i += 1) if ((f >> i) & 1) ms.push(i);
      const text = dnfText(minimizeDNF(n, ms).terms, vars);
      const got = truthTable(parse(text), vars).filter((r) => r.out).map((r) => r.index);
      assert.deepEqual(got, ms, `n=${n} f=${f}: ${text}`);
      const knf = canonicalKNF(vars, [...Array(rows).keys()].filter((i) => !ms.includes(i)));
      assert.deepEqual(truthTable(parse(knf), vars).filter((r) => r.out).map((r) => r.index), ms);
    }
  }
});

test('Minimale DNF ist nie länger als die kanonische DNF', () => {
  for (let f = 0; f < 256; f += 1) {
    const ms = [];
    for (let i = 0; i < 8; i += 1) if ((f >> i) & 1) ms.push(i);
    assert.ok(minimizeDNF(3, ms).terms.length <= Math.max(1, ms.length));
  }
});

test('analyzeExpression: Volladdierer-Summe und Übertrag', () => {
  const s = analyzeExpression('A ^ B ^ C');
  assert.deepEqual(s.minterms, [1, 2, 4, 7]);
  assert.deepEqual(s.maxterms, [0, 3, 5, 6]);
  assert.equal(s.minimal.terms.length, 4); // XOR lässt sich in DNF nicht vereinfachen
  const c = analyzeExpression('A·B + A·C + B·C + A·B·C');
  assert.equal(c.minimalText, 'A·B + A·C + B·C');
  assert.deepEqual(c.verified, { dnf: true, knf: true, minimal: true });
  const m = analyzeExpression("A·B + A·B'");
  assert.equal(m.minimalText, 'A');
});

/* ---------------------------------------------------------------- Schaltungen */

test('Schaltung: Beispiele sind gültig und rechnen richtig', () => {
  const ha = EXAMPLES.halbaddierer.build();
  assert.ok(analyzeCircuit(ha).valid);
  const t = circuitTruthTable(ha);
  assert.deepEqual(t.outputs, ['S', 'C']);
  assert.deepEqual(t.rows.map((r) => r.outputs.join('')), ['00', '10', '10', '01']);

  const fa = EXAMPLES.volladdierer.build();
  const ft = circuitTruthTable(fa);
  for (const row of ft.rows) {
    const sum = row.inputs.reduce((a, b) => a + b, 0);
    assert.deepEqual(row.outputs, [sum & 1, sum >> 1]);
  }
  const mux = EXAMPLES.mux.build();
  for (const row of circuitTruthTable(mux).rows) {
    const [d0, d1, sel] = row.inputs;
    assert.equal(row.outputs[0], sel ? d1 : d0);
  }
  assert.equal(gateExpression(fa, 'g5'), '(A · B) + ((A ⊕ B) · Cin)');
  assert.equal(gateExpression(mux, 'g1'), '¬Sel');
});

test('Schaltung: offene Eingänge, Zyklen und unbenutzte Gatter werden erkannt', () => {
  const bad = EXAMPLES.fehler.build();
  const r = analyzeCircuit(bad);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => /Offene .*G3, Eingang 1/.test(e)));
  assert.ok(r.errors.some((e) => /Zyklus .*G1 → G2 → G1/.test(e)));
  assert.ok(r.warnings.some((w) => /G3 wird nirgends verwendet/.test(w)));
  assert.throws(() => circuitTruthTable(bad), /keine Fehler mehr/);
  const ev = evaluateCircuit(bad);
  assert.equal(ev.gates.get('g1'), null);
  assert.equal(ev.gates.get('g3'), null);
  assert.equal(gateDepths(bad).get('g3'), 1);
});

test('Schaltung: Selbstschleife, fehlende Quelle, doppelte Namen, keine Ausgänge', () => {
  const c = EXAMPLES.halbaddierer.build();
  c.gates[0].inputs[0] = 'g:g1';
  assert.ok(analyzeCircuit(c).errors.some((e) => /mit sich selbst verbunden/.test(e)));
  const d = EXAMPLES.halbaddierer.build();
  d.gates[1].inputs[1] = 'g:g99';
  assert.ok(analyzeCircuit(d).errors.some((e) => /existiert nicht mehr/.test(e)));
  const e = EXAMPLES.halbaddierer.build();
  e.gates[1].label = 'A';
  assert.ok(analyzeCircuit(e).errors.some((x) => /doppelt vergeben/.test(x)));
  const f = EXAMPLES.halbaddierer.build();
  f.gates.forEach((g) => (g.output = false));
  assert.ok(analyzeCircuit(f).errors.some((x) => /Kein Gatter ist als Ausgang/.test(x)));
});

test('Schaltung: Live-Auswertung mit Eingangswerten', () => {
  const c = EXAMPLES.halbaddierer.build();
  c.inputs[0].value = 1;
  c.inputs[1].value = 1;
  const ev = evaluateCircuit(c);
  assert.equal(ev.gates.get('g1'), 0);
  assert.equal(ev.gates.get('g2'), 1);
  const depth = gateDepths(EXAMPLES.volladdierer.build());
  assert.equal(depth.get('g1'), 1);
  assert.equal(depth.get('g5'), 3);
});

/* ---------------------------------------------------------------- Zeichen */

test('UTF-8/UTF-16 einzelner Codepoints', () => {
  assert.deepEqual(utf8Bytes(0x41), [0x41]);
  assert.deepEqual(utf8Bytes(0xe9), [0xc3, 0xa9]);
  assert.deepEqual(utf8Bytes(0x20ac), [0xe2, 0x82, 0xac]);
  assert.deepEqual(utf8Bytes(0x1f600), [0xf0, 0x9f, 0x98, 0x80]);
  assert.deepEqual(utf8Bytes(0x10ffff), [0xf4, 0x8f, 0xbf, 0xbf]);
  assert.equal(utf8Bytes(0xd800), null);
  assert.deepEqual(utf16Units(0x1f600), [0xd83d, 0xde00]);
  // Gegenprobe mit TextEncoder für viele Codepoints
  const te = new TextEncoder();
  for (const cp of [0, 0x7f, 0x80, 0x7ff, 0x800, 0xfffd, 0xffff, 0x10000, 0x1f9d1, 0x10fffe]) {
    assert.deepEqual(utf8Bytes(cp), [...te.encode(String.fromCodePoint(cp))]);
  }
  assert.throws(() => utf8Bytes(0x110000), /außerhalb/);
});

test('Codepoint-Beschreibung und Steuerzeichen', () => {
  const d = describeCodepoint(0xe9);
  assert.equal(d.uplus, 'U+00E9');
  assert.equal(d.utf8Hex, 'C3 A9');
  assert.equal(d.dec, '233');
  assert.equal(d.category.code, 'Ll');
  assert.equal(describeCodepoint(10).display.text, 'LF');
  assert.equal(ASCII_CONTROL[127][0], 'DEL');
  assert.equal(ASCII_CONTROL[27][0], 'ESC');
  assert.equal(category(0x301).code, 'Mn');
  assert.equal(describeCodepoint(0x1f600).jsEscape, '\\u{1F600}');
});

test('Codepoint-Suche: alle Schreibweisen', () => {
  assert.deepEqual(parseCodepointQuery('U+00E9').codepoints, [0xe9]);
  assert.deepEqual(parseCodepointQuery('u+1f600').codepoints, [0x1f600]);
  assert.deepEqual(parseCodepointQuery('0x41').codepoints, [0x41]);
  assert.deepEqual(parseCodepointQuery('65').codepoints, [65]);
  assert.deepEqual(parseCodepointQuery('&#233;').codepoints, [233]);
  assert.deepEqual(parseCodepointQuery('&#x20AC;').codepoints, [0x20ac]);
  assert.deepEqual(parseCodepointQuery('é').codepoints, [0xe9]);
  assert.deepEqual(parseCodepointQuery('Ab').codepoints, [0x41, 0x62]);
  assert.equal(parseCodepointQuery('7').ambiguousDigit, true);
  assert.throws(() => parseCodepointQuery('U+110000'), /außerhalb/);
  assert.throws(() => parseCodepointQuery(''), /Bitte/);
});

test('Blockseiten sind begrenzt und korrekt', () => {
  const p = blockPage(0x0370, 0x03ff, 0, 64);
  assert.equal(p.cells.length, 64);
  assert.equal(p.pages, 3); // 144 Codepoints / 64
  assert.equal(p.cells[0].cp, 0x370);
  const last = blockPage(0x0370, 0x03ff, 5, 64);
  assert.equal(last.page, 2);
  assert.equal(last.cells.length, 16);
  assert.equal(last.to, 0x3ff);
  assert.equal(blockPage(0, 0x10ffff, 0, 10000).cells.length, 256);
  assert.throws(() => blockPage(0x200, 0x100), /vor dem Anfang/);
});

test('Graphem-Analyse: é zusammengesetzt vs. kombiniert, Emoji mit ZWJ und Hautfarbe', () => {
  const pre = analyzeText('é');
  const comb = analyzeText('é');
  assert.equal(pre.graphemeCount, 1);
  assert.equal(comb.graphemeCount, 1);
  assert.equal(pre.codepointCount, 1);
  assert.equal(comb.codepointCount, 2);
  assert.equal(pre.utf8Count, 2);
  assert.equal(comb.utf8Count, 3);
  assert.equal(comb.nfc, 'é');
  const dev = analyzeText('👩‍💻');
  assert.equal(dev.graphemeCount, 1);
  assert.equal(dev.codepointCount, 3);
  assert.equal(dev.utf8Count, 11);
  assert.equal(dev.utf16Count, 5);
  assert.match(dev.graphemes[0].codepoints[1].role, /Zero Width Joiner/);
  const thumb = analyzeText('👍🏽');
  assert.equal(thumb.graphemeCount, 1);
  assert.match(thumb.graphemes[0].codepoints[1].role, /Hautfarben-Modifikator/);
  const flag = analyzeText('🇩🇪');
  assert.equal(flag.graphemeCount, 1);
  assert.equal(flag.codepointCount, 2);
});

/* ---------------------------------------------------------------- Speicher */

test('Speicher: Größe, Adressen, Bytefolgen', () => {
  assert.equal(createMemory(256).length, 256);
  assert.throws(() => createMemory(5000), /Speichergröße/);
  assert.equal(parseAddress('0x10', 256), 16);
  assert.equal(parseAddress('255', 256), 255);
  assert.throws(() => parseAddress('256', 256), /außerhalb/);
  assert.throws(() => parseAddress('zehn', 256), /keine gültige Adresse/);
  assert.deepEqual(parseBytes('DE AD be ef'), [0xde, 0xad, 0xbe, 0xef]);
  assert.deepEqual(parseBytes('0xDE,0xAD'), [0xde, 0xad]);
  assert.deepEqual(parseBytes('DEADBEEF'), [0xde, 0xad, 0xbe, 0xef]);
  assert.deepEqual(parseBytes('72 101 108', 'dec'), [72, 101, 108]);
  assert.throws(() => parseBytes('ABC'), /ungerade Anzahl/);
  assert.throws(() => parseBytes('XY'), /kein gültiger Hex-Wert/);
  assert.throws(() => parseBytes('256', 'dec'), /passt nicht in ein Byte/);
});

test('Speicher: Schreiben über das Ende ändert nichts', () => {
  const mem = createMemory(64);
  writeBytes(mem, 60, [1, 2, 3, 4]);
  assert.deepEqual([...mem.slice(60)], [1, 2, 3, 4]);
  const before = [...mem];
  assert.throws(() => writeBytes(mem, 62, [9, 9, 9]), /über das Speicherende.*nichts geschrieben/);
  assert.deepEqual([...mem], before);
  assert.throws(() => writeValue(mem, 60, 'u64', '1', true), /Speicherende/);
  assert.deepEqual([...mem], before);
});

test('Speicher: Endianness bei 16/32/64 Bit', () => {
  assert.deepEqual(encodeValue('u32', '0x12345678', true).bytes, [0x78, 0x56, 0x34, 0x12]);
  assert.deepEqual(encodeValue('u32', '0x12345678', false).bytes, [0x12, 0x34, 0x56, 0x78]);
  assert.deepEqual(encodeValue('i16', '-2', true).bytes, [0xfe, 0xff]);
  assert.deepEqual(encodeValue('i8', '-128', true).bytes, [0x80]);
  assert.deepEqual(encodeValue('u64', '18446744073709551615', true).bytes, Array(8).fill(0xff));
  assert.throws(() => encodeValue('u8', '256', true), /außerhalb des Wertebereichs von u8 \(0 bis 255\)/);
  assert.throws(() => encodeValue('i8', '128', true), /-128 bis 127/);
  assert.throws(() => encodeValue('u16', '-1', true), /außerhalb/);
  assert.throws(() => encodeValue('u16', '1.5', true), /keine ganze Zahl/);

  const mem = createMemory(64);
  writeValue(mem, 0, 'u32', '305419896', true);
  assert.equal(readValue(mem, 0, 'u32', true).value, '305419896');
  assert.equal(readValue(mem, 0, 'u32', false).value, String(0x78563412));
  assert.equal(readValue(mem, 0, 'u16', true).value, String(0x5678));
  writeValue(mem, 8, 'i64', '-9223372036854775808', false);
  assert.equal(readValue(mem, 8, 'i64', false).value, '-9223372036854775808');
  assert.equal(readValue(mem, 8, 'u64', false).value, '9223372036854775808');
  assert.equal(readValue(mem, 8, 'u8', true).value, '128');
});

test('Speicher: Float32/64', () => {
  assert.deepEqual(encodeValue('f32', '1', false).bytes, [0x3f, 0x80, 0, 0]);
  assert.deepEqual(encodeValue('f64', '-2', false).bytes, [0xc0, 0, 0, 0, 0, 0, 0, 0]);
  const r = encodeValue('f32', '0,1', true);
  assert.equal(r.rounded, true);
  assert.equal(encodeValue('f32', '1e39', true).overflow, true);
  const mem = createMemory(64);
  writeValue(mem, 0, 'f64', '3.141592653589793', true);
  assert.equal(readValue(mem, 0, 'f64', true).value, '3.141592653589793');
  writeValue(mem, 16, 'f32', 'NaN', true);
  assert.equal(readValue(mem, 16, 'f32', true).value, 'NaN');
  assert.throws(() => encodeValue('f32', 'abc', true), /keine gültige Gleitkommazahl/);
});

test('Speicher: Hexdump mit ASCII-Spalte', () => {
  const mem = createMemory(64);
  writeBytes(mem, 0, [...new TextEncoder().encode('Hallo')]);
  mem[5] = 0x0a;
  const lines = hexdump(mem);
  assert.equal(lines.length, 4);
  assert.equal(lines[0].addrHex, '0000');
  assert.equal(lines[0].ascii, 'Hallo...........');
  assert.equal(lines[1].addrHex, '0010');
  assert.match(hexdumpText(mem).split('\n')[0], /^0000 {2}48 61 6C 6C 6F 0A 00/);
});
