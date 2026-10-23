/**
 * Technische Berechnungen: Frequenz/Periodendauer/Takte, Leistung/Energie/
 * Akkulaufzeit/Kosten sowie Prozent, Dreisatz und Verhältnisse.
 *
 * Alle Rechnungen exakt mit Brüchen (num.js). Reine Logik ohne DOM.
 */
import { InputError, rat, add, sub, mul, div, cmp, gcd, parseDecimal, fmt, isZero, isNeg, ZERO } from './num.js';

const R = (n, d = 1n) => rat(BigInt(n), BigInt(d));
const pos = (v, label) => {
  const x = parseDecimal(v, { label, allowNegative: false });
  if (isZero(x)) throw new InputError(`${label}: muss größer als 0 sein.`);
  return x;
};

/* ------------------------------------------------------------ Frequenz */

export const FREQ_UNITS = [
  { id: 'Hz', factor: R(1) },
  { id: 'kHz', factor: R(1000) },
  { id: 'MHz', factor: R(10n ** 6n) },
  { id: 'GHz', factor: R(10n ** 9n) },
  { id: 'THz', factor: R(10n ** 12n) }
];
export const TIME_UNITS = [
  { id: 's', factor: R(1) },
  { id: 'ms', factor: R(1, 1000) },
  { id: 'µs', factor: R(1, 10n ** 6n) },
  { id: 'ns', factor: R(1, 10n ** 9n) },
  { id: 'ps', factor: R(1, 10n ** 12n) },
  { id: 'fs', factor: R(1, 10n ** 15n) }
];

const findUnit = (list, id, what) => {
  const u = list.find((x) => x.id === id);
  if (!u) throw new InputError(`Unbekannte ${what} „${id}“.`);
  return u;
};
export const freqUnit = (id) => findUnit(FREQ_UNITS, id, 'Frequenzeinheit');
export const timeUnitT = (id) => findUnit(TIME_UNITS, id, 'Zeiteinheit');

/** Größte Einheit, in der der Wert ≥ 1 ist (für passende Ausgabe). */
export function bestOf(list, value) {
  let best = list[list.length - 1];
  const sorted = [...list].sort((a, b) => cmp(b.factor, a.factor));
  for (const u of sorted) {
    if (cmp(value, u.factor) >= 0) {
      best = u;
      break;
    }
  }
  return { unit: best, value: div(value, best.factor) };
}

export function formatFreq(hz, sig = 6) {
  const { unit, value } = bestOf(FREQ_UNITS, hz);
  return `${fmt(value, { sig })} ${unit.id}`;
}
export function formatTime(seconds, sig = 6) {
  if (isZero(seconds)) return '0 s';
  const { unit, value } = bestOf(TIME_UNITS, seconds);
  return `${fmt(value, { sig })} ${unit.id}`;
}

/** Frequenz → Periodendauer und alle Einheiten. */
export function frequencyInfo(value, unitId) {
  const f = mul(pos(value, 'Frequenz'), freqUnit(unitId).factor);
  const T = div(R(1), f);
  return {
    hz: f,
    period: T,
    freqs: FREQ_UNITS.map((u) => ({ unit: u.id, value: div(f, u.factor) })),
    periods: TIME_UNITS.map((u) => ({ unit: u.id, value: div(T, u.factor) }))
  };
}

/** Periodendauer → Frequenz (f = 1 / T). */
export function frequencyFromPeriod(value, unitId) {
  const T = mul(pos(value, 'Periodendauer'), timeUnitT(unitId).factor);
  const f = div(R(1), T);
  return { hz: f, period: T, freqs: FREQ_UNITS.map((u) => ({ unit: u.id, value: div(f, u.factor) })), periods: TIME_UNITS.map((u) => ({ unit: u.id, value: div(T, u.factor) })) };
}

/** Takte ↔ Zeit: n = f · t bzw. t = n / f. */
export function cyclesForTime(fValue, fUnit, tValue, tUnit) {
  const f = mul(pos(fValue, 'Frequenz'), freqUnit(fUnit).factor);
  const t = mul(parseDecimal(tValue, { label: 'Zeit', allowNegative: false }), timeUnitT(tUnit).factor);
  return { f, t, cycles: mul(f, t) };
}
export function timeForCycles(fValue, fUnit, nValue) {
  const f = mul(pos(fValue, 'Frequenz'), freqUnit(fUnit).factor);
  const n = parseDecimal(nValue, { label: 'Anzahl Takte', allowNegative: false });
  return { f, n, time: div(n, f), perCycle: div(R(1), f) };
}

/* ------------------------------------------------------------ Leistung & Energie */

/** P = U · I */
export function powerFromUI(u, i) {
  const U = parseDecimal(u, { label: 'Spannung U', allowNegative: false });
  const I = parseDecimal(i, { label: 'Stromstärke I', allowNegative: false });
  return { U, I, P: mul(U, I) };
}

export const HOURS = { s: R(1, 3600), min: R(1, 60), h: R(1), d: R(24) };

/** E = P · t in Wh, kWh und J. */
export function energy(p, t, tUnit) {
  const P = parseDecimal(p, { label: 'Leistung P', allowNegative: false });
  if (!HOURS[tUnit]) throw new InputError('Unbekannte Zeiteinheit.');
  const h = mul(parseDecimal(t, { label: 'Dauer t', allowNegative: false }), HOURS[tUnit]);
  const wh = mul(P, h);
  return { P, hours: h, wh, kwh: div(wh, R(1000)), joule: mul(wh, R(3600)) };
}

/**
 * Akkulaufzeit t = nutzbare Energie / Leistung.
 * Kapazität in Wh oder mAh (dann × Nennspannung / 1000). Wirkungsgrad in % (Annahme).
 */
export function batteryRuntime({ capacity, capUnit, voltage, power, efficiency }) {
  const C = pos(capacity, 'Kapazität');
  let wh;
  let V = null;
  if (capUnit === 'mAh') {
    V = pos(voltage, 'Nennspannung');
    wh = div(mul(C, V), R(1000));
  } else if (capUnit === 'Wh') wh = C;
  else throw new InputError('Kapazität in Wh oder mAh angeben.');
  const P = pos(power, 'Leistung');
  const eta = parseDecimal(efficiency, { label: 'Wirkungsgrad', allowNegative: false });
  if (isZero(eta) || cmp(eta, R(100)) > 0) throw new InputError('Wirkungsgrad: mehr als 0 und höchstens 100 %.');
  const usable = div(mul(wh, eta), R(100));
  const hours = div(usable, P);
  return { wh, V, usable, P, eta, hours, seconds: mul(hours, R(3600)) };
}

/** Energiekosten: kWh × Preis (in Cent oder Euro pro kWh). */
export function energyCost(kwh, price, priceUnit) {
  const p = parseDecimal(price, { label: 'Preis pro kWh', allowNegative: false });
  const euroPerKwh = priceUnit === 'ct' ? div(p, R(100)) : p;
  return { euroPerKwh, euro: mul(kwh, euroPerKwh) };
}

export const DAYS_PER_MONTH = R(36525, 1200); // 30,4375 Tage = 365,25 / 12 (Annahme)
export const DAYS_PER_YEAR = R(36525, 100);

/** Summe mehrerer Verbraucher: [{ name, watt, hours }] → kWh pro Tag/Monat/Jahr. */
export function componentsEnergy(items) {
  if (!items.length) throw new InputError('Bitte mindestens einen Verbraucher eintragen.');
  if (items.length > 50) throw new InputError('Höchstens 50 Verbraucher.');
  let dayWh = ZERO;
  let totalW = ZERO;
  const rows = items.map((item, k) => {
    const label = item.name?.trim() || `Verbraucher ${k + 1}`;
    const W = parseDecimal(item.watt, { label: `${label}: Leistung`, allowNegative: false });
    const h = parseDecimal(item.hours, { label: `${label}: Stunden pro Tag`, allowNegative: false });
    if (cmp(h, R(24)) > 0) throw new InputError(`${label}: Ein Tag hat höchstens 24 Stunden.`);
    const wh = mul(W, h);
    dayWh = add(dayWh, wh);
    totalW = add(totalW, W);
    return { name: label, W, h, wh };
  });
  const dayKwh = div(dayWh, R(1000));
  return { rows, totalW, dayWh, dayKwh, monthKwh: mul(dayKwh, DAYS_PER_MONTH), yearKwh: mul(dayKwh, DAYS_PER_YEAR) };
}

/* ------------------------------------------------------------ Prozent */

const num = (v, label) => parseDecimal(v, { label });

/** Grundwert G, Prozentsatz p, Prozentwert W: zwei gegeben, eins gesucht. */
export function percent({ find, base, rate, value }) {
  if (find === 'value') {
    const G = num(base, 'Grundwert');
    const p = num(rate, 'Prozentsatz');
    return { G, p, W: div(mul(G, p), R(100)), formula: 'W = G · p / 100' };
  }
  if (find === 'base') {
    const W = num(value, 'Prozentwert');
    const p = num(rate, 'Prozentsatz');
    if (isZero(p)) throw new InputError('Prozentsatz darf hier nicht 0 sein (Division durch null).');
    return { W, p, G: div(mul(W, R(100)), p), formula: 'G = W · 100 / p' };
  }
  if (find === 'rate') {
    const W = num(value, 'Prozentwert');
    const G = num(base, 'Grundwert');
    if (isZero(G)) throw new InputError('Grundwert darf nicht 0 sein (Division durch null).');
    return { W, G, p: div(mul(W, R(100)), G), formula: 'p = W / G · 100' };
  }
  throw new InputError('Unbekannte Rechenart.');
}

/** Prozentuale Veränderung von alt nach neu. */
export function change(oldValue, newValue) {
  const a = num(oldValue, 'Alter Wert');
  const b = num(newValue, 'Neuer Wert');
  if (isZero(a)) throw new InputError('Alter Wert 0: Eine prozentuale Veränderung ist nicht definiert.');
  const diff = sub(b, a);
  const pct = div(mul(diff, R(100)), isNeg(a) ? mul(a, R(-1)) : a);
  return { a, b, diff, pct, factor: div(b, a) };
}

/** Prozentpunkte vs. Prozent bei zwei Prozentangaben. */
export function percentPoints(p1, p2) {
  const a = num(p1, 'Erster Prozentsatz');
  const b = num(p2, 'Zweiter Prozentsatz');
  const points = sub(b, a);
  const relative = isZero(a) ? null : div(mul(points, R(100)), a);
  return { a, b, points, relative };
}

/** Dreisatz: a1 entspricht b1; was entspricht a2? */
export function ruleOfThree({ a1, b1, a2, kind }) {
  const A1 = num(a1, 'Größe 1 (bekannt)');
  const B1 = num(b1, 'Zugehöriger Wert');
  const A2 = num(a2, 'Größe 2 (gesucht für)');
  if (kind === 'anti') {
    if (isZero(A2)) throw new InputError('Bei antiproportionaler Zuordnung darf Größe 2 nicht 0 sein.');
    return { A1, B1, A2, B2: div(mul(B1, A1), A2), formula: 'b₂ = b₁ · a₁ / a₂' };
  }
  if (isZero(A1)) throw new InputError('Größe 1 darf nicht 0 sein (Division durch null).');
  return { A1, B1, A2, B2: div(mul(B1, A2), A1), formula: 'b₂ = b₁ · a₂ / a₁' };
}

/** Verhältnis kürzen, z. B. „1920:1080“ → 16:9 (auch Dezimalzahlen, 2–4 Glieder). */
export function reduceRatio(text) {
  const parts = String(text ?? '').split(/\s*[:/x×]\s*/i).map((p) => p.trim()).filter((p) => p !== '');
  if (parts.length < 2 || parts.length > 4) throw new InputError('Bitte 2 bis 4 Zahlen mit „:“ getrennt eingeben, z. B. 1920:1080.');
  const values = parts.map((p, k) => parseDecimal(p, { label: `Glied ${k + 1}`, allowNegative: false }));
  if (values.some(isZero)) throw new InputError('Ein Verhältnis mit 0 lässt sich nicht kürzen.');
  // Auf gemeinsame ganze Zahlen bringen: mit kgV der Nenner multiplizieren.
  const lcm = values.reduce((l, v) => (l * v.d) / gcd(l, v.d), 1n);
  const ints = values.map((v) => (v.n * lcm) / v.d);
  const g = ints.reduce((a, b) => gcd(a, b));
  const reduced = ints.map((x) => x / g);
  return { values, scale: lcm, ints, gcd: g, reduced, decimal: div(rat(reduced[0]), rat(reduced[reduced.length - 1])) };
}

/** Euklidischer Algorithmus als Schritte (für den Rechenweg bei zwei Gliedern). */
export function gcdSteps(a, b) {
  const out = [];
  let x = a;
  let y = b;
  while (y) {
    out.push(`${x} = ${x / y} · ${y} + ${x % y}`);
    [x, y] = [y, x % y];
  }
  return { gcd: x, steps: out };
}
