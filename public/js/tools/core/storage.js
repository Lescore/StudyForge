/**
 * Übertragungszeit, Speicherbedarf, Belegung und Wachstum – exakt mit Brüchen.
 */
import { InputError, rat, add, sub, mul, div, cmp, isZero, ceilRat, powRat, parseDecimal, ONE, ZERO } from './num.js';
import { sizeUnit, rateUnit, timeUnit } from './units.js';

const PERCENT = rat(100n);

/** Wirkungsgrad in Prozent (0 < p ≤ 100) als Bruch 0..1. */
export function efficiency(percentText) {
  const p = parseDecimal(percentText, { label: 'Wirkungsgrad', allowNegative: false });
  if (isZero(p) || cmp(p, PERCENT) > 0) throw new InputError('Der Wirkungsgrad muss größer als 0 % und höchstens 100 % sein.');
  return div(p, PERCENT);
}

/**
 * mode 'time': size + rate → Zeit
 * mode 'rate': size + time → nötige Rate
 * mode 'size': rate + time → übertragbare Menge
 * Alles in Bit bzw. Bit/s und Sekunden; `eff` reduziert die nutzbare Rate.
 */
export function transfer({ mode, size, sizeUnitId, rate, rateUnitId, time, timeUnitId, efficiencyPercent = '100' }) {
  const eff = efficiency(efficiencyPercent);
  const result = { mode, eff };
  if (mode !== 'size') {
    result.sizeBits = mul(parseDecimal(size, { label: 'Datenmenge', allowNegative: false }), sizeUnit(sizeUnitId).bits);
  }
  if (mode !== 'rate') {
    result.rateBits = mul(parseDecimal(rate, { label: 'Datenrate', allowNegative: false }), rateUnit(rateUnitId).bits);
    if (isZero(result.rateBits)) throw new InputError('Die Datenrate muss größer als 0 sein.');
    result.effectiveRate = mul(result.rateBits, eff);
  }
  if (mode !== 'time') {
    result.seconds = mul(parseDecimal(time, { label: 'Zeit', allowNegative: false }), timeUnit(timeUnitId).seconds);
    if (isZero(result.seconds)) throw new InputError('Die Zeit muss größer als 0 sein.');
  }
  if (mode === 'time') result.seconds = div(result.sizeBits, result.effectiveRate);
  else if (mode === 'rate') {
    result.effectiveRate = div(result.sizeBits, result.seconds);
    result.rateBits = div(result.effectiveRate, eff); // nötige Nennrate
  } else if (mode === 'size') result.sizeBits = mul(result.effectiveRate, result.seconds);
  else throw new InputError('Unbekannte Berechnungsart.');
  return result;
}

/**
 * Summe einer Dateiliste. Jede Zeile: „Anzahl × Größe Einheit“ oder „Größe Einheit“,
 * z. B. „120 × 4,5 MB“, „3 GiB“, „2500 x 800 KiB“. Leere Zeilen und #Kommentare werden ignoriert.
 */
export function parseFileList(text) {
  const lines = String(text ?? '').split('\n');
  if (lines.length > 500) throw new InputError('Höchstens 500 Zeilen.');
  const items = [];
  lines.forEach((raw, index) => {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) return;
    const m = /^(?:([\d\s_.,]+)\s*[x×*]\s*)?([\d\s_.,eE+-]+?)\s*([A-Za-z]+)$/.exec(line);
    if (!m) throw new InputError(`Zeile ${index + 1}: „${raw.trim()}“ nicht verstanden. Format: „Anzahl × Größe Einheit“, z. B. 120 × 4,5 MB.`);
    const count = m[1] ? parseDecimal(m[1], { label: `Zeile ${index + 1} (Anzahl)`, allowNegative: false }) : ONE;
    if (count.d !== 1n) throw new InputError(`Zeile ${index + 1}: Die Anzahl muss ganzzahlig sein.`);
    let unit;
    try {
      unit = sizeUnit(m[3]);
    } catch {
      const hint = m[3].toLowerCase() === 'kb' ? ' (Kilobyte schreibt man kB, Kibibyte KiB)' : '';
      throw new InputError(`Zeile ${index + 1}: Unbekannte Einheit „${m[3]}“${hint}. Beispiele: B, kB, MB, GB, KiB, MiB, GiB.`);
    }
    const size = parseDecimal(m[2], { label: `Zeile ${index + 1} (Größe)`, allowNegative: false });
    items.push({ line: index + 1, count, size, unit, bits: mul(mul(count, size), unit.bits) });
  });
  const totalBits = items.reduce((sum, item) => add(sum, item.bits), ZERO);
  return { items, totalBits };
}

/** Belegung eines Datenträgers. */
export function usage(capacityBits, usedBits) {
  if (isZero(capacityBits)) throw new InputError('Die Kapazität muss größer als 0 sein.');
  const free = sub(capacityBits, usedBits);
  return { free, percentUsed: mul(div(usedBits, capacityBits), PERCENT), percentFree: mul(div(free, capacityBits), PERCENT), overfull: cmp(free, ZERO) < 0 };
}

/** Wie viele Medien der Kapazität `mediumBits` braucht man für `dataBits` (ohne Aufteilen über Medien hinweg gerechnet). */
export function mediaNeeded(dataBits, mediumBits, reservePercent = ZERO) {
  if (isZero(mediumBits)) throw new InputError('Die Kapazität eines Mediums muss größer als 0 sein.');
  if (cmp(reservePercent, PERCENT) >= 0) throw new InputError('Die Reserve muss unter 100 % liegen.');
  const usable = mul(mediumBits, sub(ONE, div(reservePercent, PERCENT)));
  const exact = div(dataBits, usable);
  return { usable, exact, count: ceilRat(exact) };
}

/**
 * Wachstum über `periods` Perioden: 'percent' (Zinseszins) oder 'absolute' (gleicher Zuwachs).
 * Liefert die Werte je Periode (gekürzt auf höchstens 120 Zeilen) und das Ende.
 */
export function growth(startBits, { kind = 'percent', rateText = '5', addBits = ZERO, periods = 12 }) {
  const n = Number(periods);
  if (!Number.isInteger(n) || n < 1 || n > 600) throw new InputError('Die Anzahl der Perioden muss zwischen 1 und 600 liegen.');
  let factor = ONE;
  if (kind === 'percent') {
    const p = parseDecimal(rateText, { label: 'Wachstum' });
    if (cmp(p, rat(-100n)) <= 0) throw new InputError('Ein Wachstum von −100 % oder weniger ist nicht sinnvoll.');
    factor = add(ONE, div(p, PERCENT));
  }
  const rows = [];
  let value = startBits;
  for (let i = 1; i <= n; i++) {
    value = kind === 'percent' ? mul(value, factor) : add(value, addBits);
    if (i <= 120 || i === n) rows.push({ period: i, value });
  }
  const closed = kind === 'percent' ? mul(startBits, powRat(factor, n)) : add(startBits, mul(addBits, rat(BigInt(n))));
  return { rows, end: closed, factor, truncated: n > 120 };
}

/** Zeitpunkt (Periode), ab dem eine Kapazität nicht mehr reicht. */
export function periodsUntilFull(startBits, capacityBits, { kind = 'percent', rateText = '5', addBits = ZERO, maxPeriods = 600 } = {}) {
  if (cmp(startBits, capacityBits) > 0) return 0;
  const { factor } = growth(startBits, { kind, rateText, addBits, periods: 1 });
  let value = startBits;
  for (let i = 1; i <= maxPeriods; i++) {
    value = kind === 'percent' ? mul(value, factor) : add(value, addBits);
    if (cmp(value, capacityBits) > 0) return i;
  }
  return null;
}
