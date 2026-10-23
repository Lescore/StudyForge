import test from 'node:test';
import assert from 'node:assert/strict';
import { rat, parseDecimal, toDecimal, fmt, add, InputError } from '../public/js/tools/core/num.js';
import { sizeUnit, rateUnit, convert, convertAll, formatDuration, bestUnit } from '../public/js/tools/core/units.js';
import { transfer, parseFileList, mediaNeeded, growth, periodsUntilFull, usage } from '../public/js/tools/core/storage.js';
import { raidCapacity } from '../public/js/tools/core/raid.js';
import { parseInBase, ratToBase, convertBase, divisionSteps } from '../public/js/tools/core/bases.js';
import { parseInteger, toPattern, describe, compute, twosComplementSteps, toggleBit, ranges } from '../public/js/tools/core/bits.js';
import { analyzeText, parseBytes, validateUtf8, decodeUtf8, formatBytes, utf8BitLayout } from '../public/js/tools/core/utf8.js';
import { patternFromNumberText, patternFromBits, decode, exactDecimal, limits } from '../public/js/tools/core/ieee754.js';
import { addressSpace, bitsNeeded, parseFields, structLayout, optimizedOrder, layoutRanges, hexAddress } from '../public/js/tools/core/address.js';

const dec = (r, frac = 20) => toDecimal(r, frac).text;
const bytesOf = (value, unitId) => dec(convert(parseDecimal(value), sizeUnit(unitId), sizeUnit('B')));

test('Exakte Dezimalzahlen: Komma, Punkt, Exponent, keine Gleitkommafehler', () => {
  assert.equal(dec(add(parseDecimal('0,1'), parseDecimal('0.2'))), '0.3');
  assert.equal(dec(parseDecimal('1,5e3')), '1500');
  assert.equal(dec(parseDecimal('2.5E-3')), '0.0025');
  assert.equal(dec(parseDecimal('1 000 000')), '1000000');
  assert.throws(() => parseDecimal('1.000.000'), /Tausenderpunkte/);
  assert.throws(() => parseDecimal('abc'), InputError);
  assert.throws(() => parseDecimal(''), /Bitte eine Zahl/);
  assert.throws(() => parseDecimal('-1', { allowNegative: false }), /Negative/);
  assert.equal(toDecimal(rat(1n, 3n), 4).text, '0.3333');
  assert.equal(toDecimal(rat(1n, 3n), 4).exact, false);
  assert.equal(toDecimal(rat(2n, 3n), 2).text, '0.67');
  assert.equal(fmt(rat(1n, 3n), { sig: 3 }), '≈ 0,333');
});

test('SI- und IEC-Präfixe werden nie vermischt', () => {
  assert.equal(bytesOf('1', 'kB'), '1000');
  assert.equal(bytesOf('1', 'KiB'), '1024');
  assert.equal(bytesOf('1', 'MB'), '1000000');
  assert.equal(bytesOf('1', 'MiB'), '1048576');
  assert.equal(bytesOf('1', 'GiB'), '1073741824');
  assert.equal(bytesOf('1', 'TB'), '1000000000000');
  assert.equal(bytesOf('1', 'TiB'), '1099511627776');
  assert.equal(bytesOf('1', 'EiB'), '1152921504606846976');
  assert.equal(bytesOf('1', 'EB'), '1000000000000000000');
  // 1 TB (Hersteller) in TiB (Betriebssystem)
  assert.equal(toDecimal(convert(parseDecimal('1'), sizeUnit('TB'), sizeUnit('TiB')), 6).text, '0.909495');
  assert.equal(dec(convert(parseDecimal('1'), sizeUnit('Mbit'), sizeUnit('bit'))), '1000000');
  assert.equal(dec(convert(parseDecimal('1'), sizeUnit('Mibit'), sizeUnit('bit'))), '1048576');
});

test('Bit/Byte und Datenraten', () => {
  assert.equal(dec(convert(parseDecimal('100'), rateUnit('Mbit/s'), rateUnit('MB/s'))), '12.5');
  assert.equal(dec(convert(parseDecimal('1'), rateUnit('Gbit/s'), rateUnit('MiB/s')), 6), '119.20929');
  assert.equal(dec(convert(parseDecimal('8'), sizeUnit('bit'), sizeUnit('B'))), '1');
  assert.throws(() => convert(parseDecimal('1'), sizeUnit('MB'), rateUnit('MB/s')), /nicht direkt/);
  const all = convertAll('1', 'GiB');
  assert.equal(all.list.length, 21);
  assert.equal(dec(all.list.find((x) => x.unit.id === 'MiB').value), '1024');
  assert.throws(() => convertAll('-5', 'MB'), /Negative/);
  assert.equal(bestUnit(convert(parseDecimal('1500000'), sizeUnit('B'), sizeUnit('bit')), 'si').unit.id, 'MB');
  assert.equal(bestUnit(convert(parseDecimal('1536'), sizeUnit('B'), sizeUnit('bit')), 'iec').unit.id, 'KiB');
});

test('Große Zahlen bleiben exakt', () => {
  const huge = convert(parseDecimal('123456789012345678901234567890'), sizeUnit('EiB'), sizeUnit('bit'));
  assert.equal(dec(huge), (123456789012345678901234567890n * 8n * 1024n ** 6n).toString());
});

test('Übertragungszeit, nötige Rate, übertragbare Menge und Wirkungsgrad', () => {
  const t1 = transfer({ mode: 'time', size: '1', sizeUnitId: 'GB', rate: '100', rateUnitId: 'Mbit/s' });
  assert.equal(dec(t1.seconds), '80');
  const t2 = transfer({ mode: 'time', size: '1', sizeUnitId: 'GB', rate: '100', rateUnitId: 'Mbit/s', efficiencyPercent: '80' });
  assert.equal(dec(t2.seconds), '100');
  const r = transfer({ mode: 'rate', size: '4,7', sizeUnitId: 'GB', time: '10', timeUnitId: 'min' });
  assert.equal(dec(r.rateBits), '62666666.66666666666666666667');
  const s = transfer({ mode: 'size', rate: '50', rateUnitId: 'MB/s', time: '1', timeUnitId: 'h' });
  assert.equal(dec(convert(s.sizeBits, sizeUnit('bit'), sizeUnit('GB'))), '180');
  assert.throws(() => transfer({ mode: 'time', size: '1', sizeUnitId: 'GB', rate: '0', rateUnitId: 'Mbit/s' }), /größer als 0/);
  assert.throws(() => transfer({ mode: 'time', size: '1', sizeUnitId: 'GB', rate: '1', rateUnitId: 'Mbit/s', efficiencyPercent: '120' }), /Wirkungsgrad/);
  assert.equal(formatDuration(rat(3725n)), '1 h 2 min 5 s');
  assert.equal(formatDuration(rat(1n, 1000n)), '1 ms');
});

test('Speicherbedarf, Medien, Belegung und Wachstum', () => {
  const list = parseFileList('120 × 4,5 MB\n3 GiB\n# Kommentar\n2500 x 800 KiB');
  assert.equal(list.items.length, 3);
  assert.equal(dec(convert(list.totalBits, sizeUnit('bit'), sizeUnit('B'))), String(120 * 4500000 + 3 * 1073741824 + 2500 * 800 * 1024));
  assert.throws(() => parseFileList('5 KB'), /Kilobyte schreibt man kB/);
  assert.throws(() => parseFileList('1,5 × 3 MB'), /ganzzahlig/);
  const media = mediaNeeded(convert(parseDecimal('100'), sizeUnit('GB'), sizeUnit('bit')), convert(parseDecimal('25'), sizeUnit('GB'), sizeUnit('bit')));
  assert.equal(media.count, 4n);
  const media2 = mediaNeeded(convert(parseDecimal('100'), sizeUnit('GB'), sizeUnit('bit')), convert(parseDecimal('25'), sizeUnit('GB'), sizeUnit('bit')), parseDecimal('10'));
  assert.equal(media2.count, 5n);
  const u = usage(rat(1000n), rat(250n));
  assert.equal(dec(u.percentUsed), '25');
  assert.equal(usage(rat(100n), rat(150n)).overfull, true);
  const g = growth(rat(100n), { kind: 'percent', rateText: '10', periods: 2 });
  assert.equal(dec(g.end), '121');
  const g2 = growth(rat(100n), { kind: 'absolute', addBits: rat(5n), periods: 3 });
  assert.equal(dec(g2.end), '115');
  assert.equal(periodsUntilFull(rat(100n), rat(130n), { kind: 'percent', rateText: '10' }), 3);
  assert.equal(periodsUntilFull(rat(100n), rat(130n), { kind: 'percent', rateText: '0', maxPeriods: 50 }), null);
});

test('RAID-Kapazitäten inkl. unterschiedlicher Größen und ungültiger Konfigurationen', () => {
  const four = [rat(4n), rat(4n), rat(4n), rat(4n)];
  assert.equal(dec(raidCapacity(0, four).usable), '16');
  assert.equal(dec(raidCapacity(1, four).usable), '4');
  assert.equal(raidCapacity(1, four).tolerance, 3);
  assert.equal(dec(raidCapacity(5, four).usable), '12');
  assert.equal(dec(raidCapacity(5, four).efficiency), '75');
  assert.equal(dec(raidCapacity(6, four).usable), '8');
  assert.equal(raidCapacity(6, four).tolerance, 2);
  assert.equal(dec(raidCapacity(10, four).usable), '8');
  const mixed = [rat(4n), rat(8n), rat(8n)];
  const r5 = raidCapacity(5, mixed);
  assert.equal(dec(r5.usable), '8');
  assert.equal(dec(r5.unusedByMismatch), '8');
  assert.ok(r5.warnings.length > 0);
  assert.equal(dec(raidCapacity(10, [rat(2n), rat(2n), rat(4n), rat(4n)]).usable), '4');
  assert.throws(() => raidCapacity(10, [rat(1n), rat(1n), rat(1n), rat(1n), rat(1n)]), /gerade Anzahl/);
  assert.throws(() => raidCapacity(5, [rat(1n), rat(1n)]), /mindestens 3/);
  assert.throws(() => raidCapacity(6, [rat(1n), rat(1n), rat(1n)]), /mindestens 4/);
  assert.throws(() => raidCapacity(7, four), /Unterstützt/);
  const reserve = raidCapacity(5, four, parseDecimal('10'));
  assert.equal(dec(reserve.usableAfterReserve), '10.8');
});

test('Zahlensysteme: Basen 2–36, große Zahlen, Nachkommastellen, ungültige Ziffern', () => {
  assert.equal(convertBase('255', 10, 16).result.text, 'FF');
  assert.equal(convertBase('FF', 16, 2).result.text, '11111111');
  assert.equal(convertBase('0x1F', 16, 10).result.text, '31');
  assert.equal(convertBase('777', 8, 10).result.text, '511');
  assert.equal(convertBase('Z', 36, 10).result.text, '35');
  assert.equal(convertBase('-42', 10, 2).result.text, '-101010');
  const big = '123456789012345678901234567890123456789';
  assert.equal(convertBase(convertBase(big, 10, 16).result.text, 16, 10).result.text, big);
  assert.equal(convertBase('0.1', 10, 2, 10).result.text, '0.0001100110');
  assert.equal(convertBase('0.1', 10, 2, 10).result.exact, false);
  assert.equal(convertBase('0.1', 10, 2).result.terminates, false);
  assert.equal(convertBase('0.5', 10, 2).result.text, '0.1');
  assert.equal(convertBase('0.5', 10, 2).result.exact, true);
  assert.equal(convertBase('10.11', 2, 10).result.text, '2.75');
  assert.throws(() => parseInBase('102', 2), /Ungültige Ziffer „2“ an Position 3/);
  assert.throws(() => parseInBase('1G', 16), /Ungültige Ziffer „G“/);
  assert.throws(() => parseInBase('0x10', 2), /Präfix/);
  assert.throws(() => parseInBase('1.2.3', 10), /mehr als ein Komma/);
  assert.throws(() => parseInBase('1', 37), /Basis/);
  assert.equal(ratToBase(parseInBase('0.1', 3).value, 10, 5).text, '0.33333');
  const div = divisionSteps(13n, 2);
  assert.deepEqual(div.steps.map((s) => Number(s.remainder)), [1, 0, 1, 1]);
});

test('Bit-Inspektor, Zweierkomplement und Bereichsgrenzen', () => {
  assert.equal(parseInteger('0xFF'), 255n);
  assert.equal(parseInteger('-0b101'), -5n);
  assert.equal(parseInteger('1_000'), 1000n);
  assert.throws(() => parseInteger('12a'), /keine ganze Zahl/);
  assert.throws(() => parseInteger('0b102'), /binär/);
  const d = describe(toPattern(-1n, 8), 8);
  assert.equal(d.bits, '11111111');
  assert.equal(d.unsigned, 255n);
  assert.equal(d.signed, -1n);
  assert.equal(d.hex, 'FF');
  assert.deepEqual(describe(0x12345678n, 32).bytesLittle, [0x78, 0x56, 0x34, 0x12]);
  assert.equal(describe(0x12345678n, 32).grouped, '0001 0010  0011 0100  0101 0110  0111 1000');
  assert.throws(() => toPattern(256n, 8), /passt nicht in 8 Bit/);
  assert.throws(() => toPattern(-129n, 8), /passt nicht/);
  assert.equal(toggleBit(0n, 8, 7), 128n);
  assert.equal(ranges(16).signedMin, -32768n);
  assert.equal(ranges(64).unsignedMax, 18446744073709551615n);
  const tc = twosComplementSteps(-5n, 8);
  assert.equal(tc.magnitude, '00000101');
  assert.equal(tc.inverted, '11111010');
  assert.equal(tc.result, '11111011');
  assert.equal(twosComplementSteps(-128n, 8).special, true);
  assert.throws(() => twosComplementSteps(200n, 8), /außerhalb/);
});

test('Binärarithmetik: Überlauf, Übertrag, Division, Shifts', () => {
  const add = compute('add', 127n, 1n, 8);
  assert.equal(add.result, 128n);
  assert.equal(add.resultSigned, -128n);
  assert.equal(add.flags.overflow, true);
  assert.equal(add.flags.carry, false);
  const add2 = compute('add', 255n, 1n, 8);
  assert.equal(add2.result, 0n);
  assert.equal(add2.flags.carry, true);
  assert.equal(add2.flags.overflow, false); // −1 + 1 = 0 vorzeichenbehaftet korrekt
  const sub = compute('sub', 0n, 1n, 8);
  assert.equal(sub.result, 255n);
  assert.equal(sub.flags.borrow, true);
  assert.equal(sub.flags.overflow, false);
  assert.equal(compute('sub', -128n, 1n, 8).flags.overflow, true);
  const mul = compute('mul', 16n, 16n, 8, { mode: 'unsigned' });
  assert.equal(mul.result, 0n);
  assert.equal(mul.flags.carry, true);
  const div = compute('div', -7n, 2n, 8, { mode: 'signed' });
  assert.equal(div.resultSigned, -3n);
  assert.equal(div.remainder, -1n);
  assert.equal(compute('div', 7n, 2n, 8, { mode: 'unsigned' }).remainder, 1n);
  assert.equal(compute('div', -128n, -1n, 8, { mode: 'signed' }).flags.overflow, true);
  assert.throws(() => compute('div', 1n, 0n, 8), /Division durch null/);
  assert.equal(compute('and', 0b1100n, 0b1010n, 8).result, 0b1000n);
  assert.equal(compute('or', 0b1100n, 0b1010n, 8).result, 0b1110n);
  assert.equal(compute('xor', 0b1100n, 0b1010n, 8).result, 0b0110n);
  assert.equal(compute('not', 0n, 0n, 8).result, 255n);
  assert.equal(compute('neg', -128n, 0n, 8).flags.overflow, true);
  assert.equal(compute('shr', -16n, 0n, 8, { shift: 2 }).result, 0b00111100n);
  assert.equal(compute('sar', -16n, 0n, 8, { shift: 2 }).resultSigned, -4n);
  assert.equal(compute('sar', -1n, 0n, 8, { shift: 1 }).resultSigned, -1n);
  const shl = compute('shl', 0b01000000n, 0n, 8, { shift: 1 });
  assert.equal(shl.resultSigned, -128n);
  assert.equal(shl.flags.overflow, true);
  assert.equal(compute('shl', 0b10000001n, 0n, 8, { shift: 1 }).flags.carry, true);
  assert.equal(compute('add', 2n ** 63n - 1n, 1n, 64).flags.overflow, true);
  assert.throws(() => compute('shl', 1n, 0n, 8, { shift: 9 }), /zwischen 0 und 8/);
});

test('Unicode und UTF-8: Zeichen ≠ Bytes, Emojis, ungültige Folgen', () => {
  const a = analyzeText('Grüße 👋🏽');
  assert.equal(a.counts.codepoints, 8);
  assert.equal(a.counts.graphemes, 7);
  assert.equal(a.counts.utf16Units, 10);
  assert.equal(a.counts.bytes, 16); // G r ü(2) ß(2) e ␠ 👋(4) 🏽(4)
  assert.equal(formatBytes(analyzeText('ü').bytes), 'C3 BC');
  assert.equal(formatBytes(analyzeText('€').bytes), 'E2 82 AC');
  assert.equal(formatBytes(analyzeText('😀').bytes), 'F0 9F 98 80');
  assert.equal(analyzeText('😀').codepoints[0].label, 'U+1F600');
  assert.equal(utf8BitLayout(0xfc)[0].prefix, '110');
  assert.equal(decodeUtf8(parseBytes('48 61 6c 6c c3 b6')).text, 'Hallö');
  assert.equal(decodeUtf8(parseBytes('01001000 01101001', 'bin')).text, 'Hi');
  assert.equal(decodeUtf8(parseBytes('72 105', 'dec')).text, 'Hi');
  assert.match(validateUtf8(parseBytes('C3')).message, /unvollständig/);
  assert.match(validateUtf8(parseBytes('80')).message, /Folgebyte/);
  assert.match(validateUtf8(parseBytes('C0 AF')).message, /nie vor/);
  assert.match(validateUtf8(parseBytes('E0 80 AF')).message, /Überlange/);
  assert.match(validateUtf8(parseBytes('ED A0 80')).message, /Surrogat/);
  assert.match(validateUtf8(parseBytes('F4 90 80 80')).message, /U\+10FFFF/);
  assert.throws(() => parseBytes('ABC'), /Ungerade/);
  assert.throws(() => parseBytes('GG'), /Ungültiges Zeichen/);
  assert.throws(() => parseBytes('256', 'dec'), /kein Byte/);
});

test('IEEE 754: Normal-, Subnormalzahlen, ±0, Unendlich, NaN, exakte Werte', () => {
  const one = decode(patternFromNumberText('1', 32).pattern, 32);
  assert.equal(one.hex, '3F800000');
  assert.equal(one.kind, 'normal');
  assert.equal(one.unbiasedExponent, 0);
  const tenth = decode(patternFromNumberText('0,1', 32).pattern, 32);
  assert.equal(tenth.hex, '3DCCCCCD');
  assert.equal(exactDecimal(tenth.exact), '0.100000001490116119384765625');
  const tenth64 = decode(patternFromNumberText('0.1', 64).pattern, 64);
  assert.equal(tenth64.hex, '3FB999999999999A');
  assert.equal(exactDecimal(tenth64.exact), '0.1000000000000000055511151231257827021181583404541015625');
  const negZero = decode(patternFromNumberText('-0', 32).pattern, 32);
  assert.equal(negZero.kind, 'zero');
  assert.equal(negZero.sign, 1);
  assert.equal(decode(patternFromNumberText('inf', 64).pattern, 64).kind, 'infinity');
  assert.equal(decode(patternFromNumberText('-inf', 32).pattern, 32).number, -Infinity);
  const nan = decode(patternFromNumberText('NaN', 32).pattern, 32);
  assert.equal(nan.kind, 'nan');
  assert.equal(nan.quiet, true);
  const sub = decode(patternFromBits('00000001', 32).pattern, 32);
  assert.equal(sub.kind, 'subnormal');
  assert.equal(sub.number, 1.401298464324817e-45);
  assert.equal(decode(patternFromNumberText('1e40', 32).pattern, 32).kind, 'infinity');
  assert.equal(decode(patternFromBits('7F7FFFFF', 32).pattern, 32).number, 3.4028234663852886e38);
  assert.equal(limits(64).maxNormal.number, Number.MAX_VALUE);
  assert.equal(limits(64).minSub.number, Number.MIN_VALUE);
  assert.throws(() => patternFromBits('123456789', 32), /Zu viele Hex-Ziffern/);
  assert.throws(() => patternFromNumberText('1,2,3', 32), /Trennzeichen|gültige Zahl/);
});

test('Adressraum, Adressbits und Struct-Padding', () => {
  const s = addressSpace(32, 1);
  assert.equal(s.locations, 4294967296n);
  assert.equal(s.maxAddress, 0xffffffffn);
  assert.equal(addressSpace(16, 2).bytes, 131072n);
  assert.equal(bitsNeeded(65536n).bits, 16);
  assert.equal(bitsNeeded(65537n).bits, 17);
  assert.equal(bitsNeeded(1n).bits, 0);
  assert.equal(bitsNeeded(4096n, 4).bits, 10);
  assert.equal(hexAddress(255n, 16), '0x00FF');
  const ranges = layoutRanges(0n, [{ name: 'ROM', size: 0x4000n }, { name: 'RAM', size: 0x8000n }], 16);
  assert.equal(ranges[1].first, 0x4000n);
  assert.equal(ranges[1].last, 0xbfffn);
  assert.throws(() => layoutRanges(0xf000n, [{ name: 'X', size: 0x2000n }], 16), /außerhalb/);
  const fields = parseFields('char a;\nint b;\nchar c;\ndouble d; // Kommentar', 'lp64');
  const layout = structLayout(fields);
  assert.deepEqual(layout.rows.map((r) => r.offset), [0, 4, 8, 16]);
  assert.equal(layout.size, 24);
  assert.equal(layout.paddingTotal, 10);
  assert.equal(optimizedOrder(fields).size, 16);
  assert.equal(structLayout(fields, { pack: 1 }).size, 14);
  assert.equal(structLayout(parseFields('char a\ndouble d', 'ilp32')).size, 12);
  assert.equal(structLayout(parseFields('char name[13]\nint* p', 'lp64')).size, 24);
  assert.equal(structLayout(parseFields('long x', 'llp64')).size, 4);
  assert.throws(() => parseFields('quux x'), /Unbekannter Typ/);
});
