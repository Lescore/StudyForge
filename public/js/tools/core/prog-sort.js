/**
 * Sortieralgorithmen als Schrittfolgen (Frames) für die Visualisierung.
 *
 * Jeder Frame: { array, compare, swap, write, pivot, range, sorted,
 *                comparisons, swaps, writes, text }
 *   compare: [i, j] verglichene Indizes, swap: [i, j] vertauschte Indizes,
 *   write: Index eines Schreibzugriffs (Insertion/Merge), pivot: Pivot-Index (Quick),
 *   range: [lo, hi] aktuell bearbeiteter Bereich, sorted: Indizes an Endposition.
 * Reine Logik ohne DOM.
 */
import { InputError } from './num.js';

export const ALGORITHMS = {
  bubble: 'Bubble Sort',
  selection: 'Selection Sort',
  insertion: 'Insertion Sort',
  merge: 'Merge Sort',
  quick: 'Quick Sort (Lomuto, Pivot = letztes Element)'
};

export const LIMITS = { maxLength: 60, min: -999, max: 999 };

/** Zahlenliste aus Text (Komma, Semikolon oder Leerzeichen getrennt). */
export function parseList(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return [];
  const parts = raw.split(/[\s,;]+/).filter(Boolean);
  if (parts.length > LIMITS.maxLength) throw new InputError(`Höchstens ${LIMITS.maxLength} Zahlen (eingegeben: ${parts.length}).`);
  return parts.map((p) => {
    if (!/^[+\-−]?\d+$/.test(p)) throw new InputError(`„${p}“ ist keine ganze Zahl.`);
    const n = Number(p.replace('−', '-'));
    if (n < LIMITS.min || n > LIMITS.max) throw new InputError(`${n} liegt außerhalb von ${LIMITS.min} … ${LIMITS.max}.`);
    return n;
  });
}

/** Zufallsliste (Zufallsquelle austauschbar für Tests). */
export function randomList(length, random = Math.random, { min = 1, max = 99 } = {}) {
  const n = Math.max(0, Math.min(LIMITS.maxLength, Math.floor(length)));
  return Array.from({ length: n }, () => min + Math.floor(random() * (max - min + 1)));
}

function recorder(input) {
  const a = [...input];
  const frames = [];
  const counts = { comparisons: 0, swaps: 0, writes: 0 };
  const sorted = new Set();
  const push = (text, extra = {}) => {
    frames.push({
      array: [...a],
      compare: null,
      swap: null,
      write: null,
      pivot: null,
      range: null,
      ...extra,
      sorted: [...sorted],
      ...counts,
      text
    });
  };
  const compare = (i, j, text, extra) => {
    counts.comparisons += 1;
    push(text, { compare: [i, j], ...extra });
    return a[i] > a[j];
  };
  const swap = (i, j, text, extra) => {
    [a[i], a[j]] = [a[j], a[i]];
    if (i !== j) counts.swaps += 1;
    push(text, { swap: [i, j], ...extra });
  };
  const write = (i, value, text, extra) => {
    a[i] = value;
    counts.writes += 1;
    push(text, { write: i, ...extra });
  };
  return { a, frames, counts, sorted, push, compare, swap, write };
}

function bubble(r) {
  const { a } = r;
  const n = a.length;
  for (let end = n - 1; end > 0; end -= 1) {
    let swapped = false;
    for (let i = 0; i < end; i += 1) {
      if (r.compare(i, i + 1, `Vergleiche a[${i}] = ${a[i]} mit a[${i + 1}] = ${a[i + 1]}.`)) {
        r.swap(i, i + 1, `${a[i]} > ${a[i + 1]} → vertauschen.`);
        swapped = true;
      }
    }
    r.sorted.add(end);
    if (!swapped) {
      for (let k = 0; k < end; k += 1) r.sorted.add(k);
      r.push(`Durchlauf ohne Vertauschung – die Liste ist sortiert (vorzeitiger Abbruch).`);
      return;
    }
    r.push(`Durchlauf beendet: Das größte Element des Restes steht an Position ${end}.`);
  }
  r.sorted.add(0);
}

function selection(r) {
  const { a } = r;
  const n = a.length;
  for (let i = 0; i < n - 1; i += 1) {
    let min = i;
    r.push(`Suche das Minimum ab Position ${i}. Bisheriges Minimum: a[${i}] = ${a[i]}.`, { pivot: min });
    for (let j = i + 1; j < n; j += 1) {
      if (r.compare(min, j, `Vergleiche Minimum a[${min}] = ${a[min]} mit a[${j}] = ${a[j]}.`, { pivot: min })) {
        min = j;
        r.push(`Neues Minimum: a[${min}] = ${a[min]}.`, { pivot: min });
      }
    }
    if (min !== i) r.swap(i, min, `Minimum ${a[min]} mit a[${i}] = ${a[i]} vertauschen.`);
    else r.push(`a[${i}] = ${a[i]} ist bereits das Minimum – kein Tausch.`);
    r.sorted.add(i);
  }
  for (let k = 0; k < n; k += 1) r.sorted.add(k);
}

function insertion(r) {
  const { a } = r;
  const n = a.length;
  for (let i = 1; i < n; i += 1) {
    const key = a[i];
    r.push(`Nimm a[${i}] = ${key} und füge es links in den sortierten Teil ein.`, { pivot: i, range: [0, i] });
    let j = i - 1;
    while (j >= 0) {
      r.counts.comparisons += 1;
      r.push(`Vergleiche ${a[j]} mit ${key}.`, { compare: [j, j + 1], range: [0, i] });
      if (a[j] <= key) break;
      r.write(j + 1, a[j], `${a[j]} > ${key} → ${a[j]} eine Position nach rechts schieben.`, { range: [0, i] });
      j -= 1;
    }
    if (j + 1 !== i) r.write(j + 1, key, `${key} an Position ${j + 1} schreiben.`, { range: [0, i] });
    else r.push(`${key} bleibt an Position ${i}.`, { range: [0, i] });
  }
  for (let k = 0; k < n; k += 1) r.sorted.add(k);
}

function merge(r) {
  const { a } = r;
  const sort = (lo, hi) => {
    if (hi - lo < 1) return;
    const mid = Math.floor((lo + hi) / 2);
    r.push(`Teile [${lo}…${hi}] in [${lo}…${mid}] und [${mid + 1}…${hi}].`, { range: [lo, hi] });
    sort(lo, mid);
    sort(mid + 1, hi);
    const left = a.slice(lo, mid + 1);
    const right = a.slice(mid + 1, hi + 1);
    r.push(`Mische [${left.join(', ')}] und [${right.join(', ')}].`, { range: [lo, hi] });
    let i = 0;
    let j = 0;
    let k = lo;
    while (i < left.length && j < right.length) {
      r.counts.comparisons += 1;
      r.push(`Vergleiche ${left[i]} (links) mit ${right[j]} (rechts).`, { compare: [lo + i, mid + 1 + j], range: [lo, hi] });
      // ≤ hält Merge Sort stabil.
      if (left[i] <= right[j]) {
        r.write(k, left[i], `${left[i]} ≤ ${right[j]} → ${left[i]} an Position ${k} schreiben.`, { range: [lo, hi] });
        i += 1;
      } else {
        r.write(k, right[j], `${right[j]} < ${left[i]} → ${right[j]} an Position ${k} schreiben.`, { range: [lo, hi] });
        j += 1;
      }
      k += 1;
    }
    while (i < left.length) {
      r.write(k, left[i], `Rest links: ${left[i]} an Position ${k}.`, { range: [lo, hi] });
      i += 1;
      k += 1;
    }
    while (j < right.length) {
      r.write(k, right[j], `Rest rechts: ${right[j]} an Position ${k}.`, { range: [lo, hi] });
      j += 1;
      k += 1;
    }
  };
  sort(0, a.length - 1);
  for (let k = 0; k < a.length; k += 1) r.sorted.add(k);
}

function quick(r) {
  const { a } = r;
  const sort = (lo, hi) => {
    if (lo > hi) return;
    if (lo === hi) {
      r.sorted.add(lo);
      r.push(`Bereich [${lo}] hat nur ein Element – steht fest.`, { range: [lo, hi] });
      return;
    }
    const pivot = a[hi];
    r.push(`Partitioniere [${lo}…${hi}] mit Pivot a[${hi}] = ${pivot} (Lomuto: letztes Element).`, { pivot: hi, range: [lo, hi] });
    let i = lo;
    for (let j = lo; j < hi; j += 1) {
      r.counts.comparisons += 1;
      r.push(`Vergleiche a[${j}] = ${a[j]} mit Pivot ${pivot}.`, { compare: [j, hi], pivot: hi, range: [lo, hi] });
      if (a[j] < pivot) {
        if (i !== j) r.swap(i, j, `${a[j]} < ${pivot} → mit a[${i}] = ${a[i]} vertauschen; Grenze rückt auf ${i + 1}.`, { pivot: hi, range: [lo, hi] });
        else r.push(`${a[j]} < ${pivot} → bleibt; Grenze rückt auf ${i + 1}.`, { pivot: hi, range: [lo, hi] });
        i += 1;
      }
    }
    if (i !== hi) r.swap(i, hi, `Pivot ${pivot} an seine Endposition ${i} tauschen.`, { pivot: i, range: [lo, hi] });
    r.sorted.add(i);
    r.push(`Pivot ${pivot} steht fest an Position ${i}: links kleiner, rechts größer oder gleich.`, { pivot: i, range: [lo, hi] });
    sort(lo, i - 1);
    sort(i + 1, hi);
  };
  sort(0, a.length - 1);
  for (let k = 0; k < a.length; k += 1) r.sorted.add(k);
}

const IMPL = { bubble, selection, insertion, merge, quick };

/** Erzeugt alle Frames; der letzte Frame enthält das sortierte Array. */
export function sortFrames(algorithm, input) {
  const impl = IMPL[algorithm];
  if (!impl) throw new InputError(`Unbekannter Algorithmus „${algorithm}“.`);
  if (input.length > LIMITS.maxLength) throw new InputError(`Höchstens ${LIMITS.maxLength} Elemente.`);
  const r = recorder(input);
  r.push(input.length ? `Ausgangslage: ${input.length} Element${input.length === 1 ? '' : 'e'}.` : 'Leere Liste – nichts zu sortieren.');
  if (input.length > 1) impl(r);
  for (let k = 0; k < input.length; k += 1) r.sorted.add(k);
  r.push(`Fertig: ${r.counts.comparisons} Vergleiche, ${r.counts.swaps} Vertauschungen, ${r.counts.writes} Schreibzugriffe.`);
  return r.frames;
}
