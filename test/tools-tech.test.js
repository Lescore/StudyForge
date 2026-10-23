import test from 'node:test';
import assert from 'node:assert/strict';
import {
  frequencyInfo, frequencyFromPeriod, cyclesForTime, timeForCycles, formatFreq, formatTime,
  powerFromUI, energy, batteryRuntime, energyCost, componentsEnergy,
  percent, change, percentPoints, ruleOfThree, reduceRatio, gcdSteps
} from '../public/js/tools/core/tech-calc.js';
import { rat, fmt, cmp } from '../public/js/tools/core/num.js';

const eq = (a, b) => assert.equal(cmp(a, b), 0, `${a.n}/${a.d} ≠ ${b.n}/${b.d}`);

/* ---------------------------------------------------------------- Frequenz */

test('Frequenz → Periodendauer', () => {
  const r = frequencyInfo('3,5', 'GHz');
  eq(r.hz, rat(3500000000n));
  eq(r.period, rat(1n, 3500000000n));
  assert.equal(formatTime(r.period, 4), '≈ 285,7 ps');
  assert.equal(fmt(r.periods.find((p) => p.unit === 'ns').value, { sig: 4 }), '≈ 0,2857');
  assert.equal(formatTime(frequencyInfo('50', 'Hz').period), '20 ms');
  assert.equal(formatTime(frequencyInfo('1', 'kHz').period), '1 ms');
  assert.equal(formatFreq(rat(2400000000n)), '2,4 GHz');
  assert.throws(() => frequencyInfo('0', 'Hz'), /größer als 0/);
  assert.throws(() => frequencyInfo('-5', 'Hz'), /Negative/);
  assert.throws(() => frequencyInfo('abc', 'Hz'), /keine gültige Zahl/);
});

test('Periodendauer → Frequenz', () => {
  const r = frequencyFromPeriod('20', 'ms');
  eq(r.hz, rat(50n));
  assert.equal(formatFreq(frequencyFromPeriod('1', 'ns').hz), '1 GHz');
});

test('Takte ↔ Zeit', () => {
  const c = cyclesForTime('3', 'GHz', '1', 'ms');
  eq(c.cycles, rat(3000000n));
  const t = timeForCycles('2', 'GHz', '1000');
  eq(t.time, rat(1n, 2000000n));
  assert.equal(formatTime(t.time), '500 ns');
  eq(t.perCycle, rat(1n, 2000000000n));
});

/* ---------------------------------------------------------------- Leistung */

test('P = U · I und E = P · t', () => {
  eq(powerFromUI('12', '2,5').P, rat(30n));
  const e = energy('60', '2', 'h');
  eq(e.wh, rat(120n));
  eq(e.kwh, rat(3n, 25n));
  eq(e.joule, rat(432000n));
  eq(energy('1000', '30', 'min').wh, rat(500n));
  assert.throws(() => energy('10', '1', 'Jahr'), /Unbekannte Zeiteinheit/);
});

test('Akkulaufzeit mit mAh, Nennspannung und Wirkungsgrad', () => {
  // 5000 mAh × 3,7 V = 18,5 Wh; 90 % → 16,65 Wh; bei 2 W → 8,325 h
  const r = batteryRuntime({ capacity: '5000', capUnit: 'mAh', voltage: '3,7', power: '2', efficiency: '90' });
  eq(r.wh, rat(37n, 2n));
  eq(r.usable, rat(333n, 20n));
  eq(r.hours, rat(333n, 40n));
  const w = batteryRuntime({ capacity: '60', capUnit: 'Wh', voltage: '', power: '15', efficiency: '100' });
  eq(w.hours, rat(4n));
  assert.throws(() => batteryRuntime({ capacity: '60', capUnit: 'Wh', power: '0', efficiency: '100' }), /größer als 0/);
  assert.throws(() => batteryRuntime({ capacity: '60', capUnit: 'Wh', power: '5', efficiency: '120' }), /höchstens 100/);
  assert.throws(() => batteryRuntime({ capacity: '60', capUnit: 'mAh', voltage: '', power: '5', efficiency: '100' }), /Nennspannung/);
});

test('Energiekosten und Summe mehrerer Verbraucher', () => {
  eq(energyCost(rat(10n), '30', 'ct').euro, rat(3n));
  eq(energyCost(rat(10n), '0,3', 'eur').euro, rat(3n));
  const r = componentsEnergy([
    { name: 'PC', watt: '150', hours: '8' },
    { name: 'Router', watt: '10', hours: '24' }
  ]);
  eq(r.dayWh, rat(1440n));
  eq(r.dayKwh, rat(36n, 25n));
  eq(r.yearKwh, rat(52596n, 100n)); // 1,44 × 365,25
  eq(r.monthKwh, rat(4383n, 100n)); // 1,44 × 30,4375
  eq(r.totalW, rat(160n));
  assert.throws(() => componentsEnergy([{ name: 'X', watt: '1', hours: '25' }]), /höchstens 24 Stunden/);
  assert.throws(() => componentsEnergy([]), /mindestens einen/);
});

/* ---------------------------------------------------------------- Prozent */

test('Prozentwert, Grundwert, Prozentsatz', () => {
  eq(percent({ find: 'value', base: '250', rate: '20' }).W, rat(50n));
  eq(percent({ find: 'base', value: '50', rate: '20' }).G, rat(250n));
  eq(percent({ find: 'rate', value: '50', base: '250' }).p, rat(20n));
  eq(percent({ find: 'value', base: '0,1', rate: '0,2' }).W, rat(1n, 5000n));
  assert.throws(() => percent({ find: 'rate', value: '1', base: '0' }), /Division durch null/);
});

test('Prozentuale Veränderung und Prozentpunkte', () => {
  const c = change('80', '100');
  eq(c.pct, rat(25n));
  eq(change('100', '80').pct, rat(-20n));
  assert.throws(() => change('0', '5'), /nicht definiert/);
  const p = percentPoints('4', '5');
  eq(p.points, rat(1n));
  eq(p.relative, rat(25n));
});

test('Dreisatz proportional und antiproportional', () => {
  eq(ruleOfThree({ a1: '3', b1: '12', a2: '5', kind: 'prop' }).B2, rat(20n));
  // 4 Server brauchen 6 h → 8 Server 3 h
  eq(ruleOfThree({ a1: '4', b1: '6', a2: '8', kind: 'anti' }).B2, rat(3n));
  assert.throws(() => ruleOfThree({ a1: '4', b1: '6', a2: '0', kind: 'anti' }), /nicht 0/);
});

test('Verhältnisse kürzen', () => {
  assert.deepEqual(reduceRatio('1920:1080').reduced, [16n, 9n]);
  assert.deepEqual(reduceRatio('1920 x 1200').reduced, [8n, 5n]);
  assert.deepEqual(reduceRatio('2560:1080').reduced, [64n, 27n]);
  assert.deepEqual(reduceRatio('1,5:2,25').reduced, [2n, 3n]);
  assert.deepEqual(reduceRatio('6:9:12').reduced, [2n, 3n, 4n]);
  assert.throws(() => reduceRatio('5'), /2 bis 4 Zahlen/);
  assert.throws(() => reduceRatio('0:5'), /mit 0/);
  const g = gcdSteps(1920n, 1080n);
  assert.equal(g.gcd, 120n);
  assert.deepEqual(g.steps, ['1920 = 1 · 1080 + 840', '1080 = 1 · 840 + 240', '840 = 3 · 240 + 120', '240 = 2 · 120 + 0']);
});
