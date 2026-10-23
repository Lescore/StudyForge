/**
 * Big-O: theoretische Operationsanzahlen der Komplexitätsklassen.
 * Modell: f(n) ohne Konstanten und niedrigere Terme, Logarithmus zur Basis 2.
 * Große Werte exakt als BigInt (bis 40 Stellen) bzw. über log10 als Zehnerpotenz.
 * Reine Logik ohne DOM.
 */
import { InputError } from './num.js';
import { groupDigits } from './num.js';

export const MAX_N = 1_000_000;
const EXACT_DIGITS = 40;

export const CLASSES = [
  { id: 'o1', label: 'O(1)', name: 'konstant', example: 'Arrayzugriff per Index' },
  { id: 'olog', label: 'O(log n)', name: 'logarithmisch', example: 'binäre Suche' },
  { id: 'on', label: 'O(n)', name: 'linear', example: 'lineare Suche' },
  { id: 'onlog', label: 'O(n log n)', name: 'linearithmisch', example: 'Merge Sort' },
  { id: 'on2', label: 'O(n²)', name: 'quadratisch', example: 'Bubble Sort, zwei verschachtelte Schleifen' },
  { id: 'on3', label: 'O(n³)', name: 'kubisch', example: 'naive Matrixmultiplikation' },
  { id: 'o2n', label: 'O(2ⁿ)', name: 'exponentiell', example: 'alle Teilmengen aufzählen' },
  { id: 'ofact', label: 'O(n!)', name: 'faktoriell', example: 'alle Permutationen (Brute-Force-TSP)' }
];

export function parseN(text) {
  const raw = String(text ?? '').trim().replace(/[\s_.']/g, '');
  if (!/^\d+$/.test(raw)) throw new InputError(`n: „${String(text ?? '').trim() || 'leer'}“ ist keine positive ganze Zahl.`);
  const n = Number(raw);
  if (n < 1 || n > MAX_N) throw new InputError(`n: Erlaubt sind 1 bis ${MAX_N.toLocaleString('de-DE')}.`);
  return n;
}

const LOG10_2 = Math.log10(2);

function log10Factorial(n) {
  if (n < 2) return 0;
  if (n <= 170) {
    let s = 0;
    for (let k = 2; k <= n; k += 1) s += Math.log10(k);
    return s;
  }
  // Stirling-Reihe für ln(n!)
  const ln = n * Math.log(n) - n + 0.5 * Math.log(2 * Math.PI * n) + 1 / (12 * n) - 1 / (360 * n ** 3);
  return ln / Math.LN10;
}

function isPow2(n) {
  return n > 0 && (n & (n - 1)) === 0;
}

/**
 * Wert von f(n) für eine Klasse.
 * Ergebnis: { log10, exact (BigInt|null), real (Zahl|null, für nicht ganzzahlige Werte) }
 */
export function evaluate(id, n) {
  const N = BigInt(n);
  switch (id) {
    case 'o1':
      return { log10: 0, exact: 1n, real: null };
    case 'olog': {
      const v = Math.log2(n);
      return { log10: Math.log10(v || 1e-300), exact: isPow2(n) ? BigInt(Math.round(v)) : null, real: v };
    }
    case 'on':
      return { log10: Math.log10(n), exact: N, real: null };
    case 'onlog': {
      const v = n * Math.log2(n);
      return { log10: Math.log10(v || 1e-300), exact: isPow2(n) ? N * BigInt(Math.round(Math.log2(n))) : null, real: v };
    }
    case 'on2':
      return { log10: 2 * Math.log10(n), exact: N * N, real: null };
    case 'on3':
      return { log10: 3 * Math.log10(n), exact: N * N * N, real: null };
    case 'o2n':
      return { log10: n * LOG10_2, exact: n * LOG10_2 < EXACT_DIGITS ? 1n << N : null, real: null };
    case 'ofact': {
      const l = log10Factorial(n);
      let exact = null;
      if (l < EXACT_DIGITS) {
        exact = 1n;
        for (let k = 2n; k <= N; k += 1n) exact *= k;
      }
      return { log10: l, exact, real: null };
    }
    default:
      throw new InputError(`Unbekannte Klasse „${id}“.`);
  }
}

/** Zehnerpotenz-Schreibweise aus log10, z. B. 30,103 → „1,27·10^30“. */
export function formatSci(log10, digits = 3) {
  if (!Number.isFinite(log10)) return '–';
  let e = Math.floor(log10);
  let m = 10 ** (log10 - e);
  let text = m.toPrecision(digits);
  if (Number(text) >= 10) {
    e += 1;
    m /= 10;
    text = m.toPrecision(digits);
  }
  return `${text.replace('.', ',').replace(/,?0+$/, '')}·10^${e}`;
}

/** Anzeige eines Werts: exakt (gruppiert) oder mit „≈“. */
export function display(value) {
  if (value.exact !== null) {
    const digits = value.exact.toString();
    if (digits.length <= 15) return { text: groupDigits(digits), exact: true, sci: digits.length > 6 ? formatSci(value.log10) : '' };
    return { text: groupDigits(digits), exact: true, sci: `≈ ${formatSci(value.log10)}` };
  }
  if (value.real !== null && value.log10 < 15) {
    return { text: `≈ ${value.real.toLocaleString('de-DE', { maximumFractionDigits: 2 })}`, exact: false, sci: '' };
  }
  return { text: `≈ ${formatSci(value.log10)}`, exact: false, sci: '' };
}

const YEAR = 365.25 * 86400;

/**
 * Theoretische Dauer bei `opsPerSecond` Operationen pro Sekunde (Annahme).
 * Liefert Text; sehr große Werte als Zehnerpotenz von Jahren.
 */
export function durationText(log10Ops, opsPerSecond = 1e9) {
  const l = log10Ops - Math.log10(opsPerSecond);
  if (l < -6) return 'unter 1 µs';
  const seconds = 10 ** l;
  if (seconds < 1e-3) return `≈ ${(seconds * 1e6).toLocaleString('de-DE', { maximumSignificantDigits: 3 })} µs`;
  if (seconds < 1) return `≈ ${(seconds * 1e3).toLocaleString('de-DE', { maximumSignificantDigits: 3 })} ms`;
  if (seconds < 120) return `≈ ${seconds.toLocaleString('de-DE', { maximumSignificantDigits: 3 })} s`;
  if (seconds < 7200) return `≈ ${(seconds / 60).toLocaleString('de-DE', { maximumSignificantDigits: 3 })} min`;
  if (seconds < 2 * 86400) return `≈ ${(seconds / 3600).toLocaleString('de-DE', { maximumSignificantDigits: 3 })} h`;
  if (seconds < YEAR) return `≈ ${(seconds / 86400).toLocaleString('de-DE', { maximumSignificantDigits: 3 })} Tage`;
  const ly = l - Math.log10(YEAR);
  if (ly < 6) return `≈ ${(10 ** ly).toLocaleString('de-DE', { maximumSignificantDigits: 3 })} Jahre`;
  return `≈ ${formatSci(ly)} Jahre`;
}
