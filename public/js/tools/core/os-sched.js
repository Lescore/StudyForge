/**
 * CPU-Scheduling: FCFS, SJF, SRTF, Priority (nicht präemptiv) und Round Robin.
 *
 * Konventionen (werden in der Oberfläche offengelegt):
 * - Zeiten sind ganzzahlig; Kontextwechsel kosten keine Zeit.
 * - Gleichstand: frühere Ankunft zuerst, danach Reihenfolge der Eingabe.
 * - SRTF: Bei gleicher Restlaufzeit behält der laufende Prozess die CPU.
 * - Round Robin: Prozesse, die während eines Zeitschlitzes oder genau zu dessen
 *   Ende ankommen, werden VOR dem gerade unterbrochenen Prozess eingereiht.
 * Reine Logik ohne DOM.
 */
import { InputError } from './num.js';

export const LIMITS = { maxProcesses: 20, maxArrival: 1000, maxBurst: 100, maxPriority: 99, maxQuantum: 100 };

export const ALGORITHMS = {
  fcfs: 'First Come First Served (FCFS)',
  sjf: 'Shortest Job First (SJF, nicht präemptiv)',
  srtf: 'Shortest Remaining Time First (SRTF, präemptiv)',
  prio: 'Priority Scheduling (nicht präemptiv)',
  rr: 'Round Robin (RR)'
};

function int(value, label, min, max) {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) throw new InputError(`${label}: „${raw || 'leer'}“ ist keine ganze Zahl ≥ 0.`);
  const n = Number(raw);
  if (n < min || n > max) throw new InputError(`${label}: Erlaubt sind ${min} bis ${max}.`);
  return n;
}

/** Prüft und normalisiert die Prozessliste (Werte dürfen Text sein). */
export function normalizeProcesses(list) {
  if (!Array.isArray(list) || !list.length) throw new InputError('Bitte mindestens einen Prozess eingeben.');
  if (list.length > LIMITS.maxProcesses) throw new InputError(`Höchstens ${LIMITS.maxProcesses} Prozesse.`);
  const names = new Set();
  return list.map((p, i) => {
    const name = String(p.name ?? '').trim() || `P${i + 1}`;
    if (name.length > 12) throw new InputError(`Prozess ${i + 1}: Name höchstens 12 Zeichen.`);
    if (names.has(name)) throw new InputError(`Prozessname „${name}“ kommt doppelt vor.`);
    names.add(name);
    return {
      index: i,
      name,
      arrival: int(p.arrival, `${name}: Ankunftszeit`, 0, LIMITS.maxArrival),
      burst: int(p.burst, `${name}: Laufzeit`, 1, LIMITS.maxBurst),
      priority: int(p.priority ?? 0, `${name}: Priorität`, 0, LIMITS.maxPriority)
    };
  });
}

/**
 * Führt die Simulation aus.
 * options: { algorithm, quantum, lowerIsHigher (Priorität: kleinere Zahl = höher) }
 * Ergebnis: { segments, results, avg, frames }
 *   segments: [{ start, end, name|null }]  (null = Leerlauf)
 *   frames: Entscheidungspunkte für die Schrittansicht
 */
export function simulate(rawProcesses, { algorithm = 'fcfs', quantum = 2, lowerIsHigher = true } = {}) {
  if (!ALGORITHMS[algorithm]) throw new InputError(`Unbekannter Algorithmus „${algorithm}“.`);
  const procs = normalizeProcesses(rawProcesses);
  const q = algorithm === 'rr' ? int(quantum, 'Zeitquantum', 1, LIMITS.maxQuantum) : null;
  const remaining = procs.map((p) => p.burst);
  const firstStart = procs.map(() => null);
  const completion = procs.map(() => null);
  const segments = [];
  const frames = [];
  const order = [...procs].sort((a, b) => a.arrival - b.arrival || a.index - b.index);
  let nextArrival = 0; // Index in order
  let time = 0;
  let done = 0;
  const ready = []; // Indizes (Ankunftsreihenfolge bzw. RR-Warteschlange)

  const admit = (t) => {
    const arrived = [];
    while (nextArrival < order.length && order[nextArrival].arrival <= t) {
      ready.push(order[nextArrival].index);
      arrived.push(order[nextArrival].name);
      nextArrival += 1;
    }
    return arrived;
  };
  const prioKey = (i) => (lowerIsHigher ? procs[i].priority : -procs[i].priority);
  const tie = (a, b) => procs[a].arrival - procs[b].arrival || a - b;
  const sortReady = () => {
    if (algorithm === 'sjf') ready.sort((a, b) => procs[a].burst - procs[b].burst || tie(a, b));
    else if (algorithm === 'srtf') ready.sort((a, b) => remaining[a] - remaining[b] || tie(a, b));
    else if (algorithm === 'prio') ready.sort((a, b) => prioKey(a) - prioKey(b) || tie(a, b));
    else if (algorithm === 'fcfs') ready.sort(tie);
  };
  const pushSegment = (start, end, idx) => {
    const name = idx === null ? null : procs[idx].name;
    const last = segments[segments.length - 1];
    if (last && last.name === name && last.end === start) last.end = end;
    else segments.push({ start, end, name });
  };
  const snapshot = (running, note, arrived) => {
    frames.push({
      time,
      running: running === null ? null : procs[running].name,
      ready: ready.map((i) => procs[i].name),
      remaining: procs.map((p, i) => ({ name: p.name, remaining: remaining[i] })),
      done: procs.filter((_, i) => completion[i] !== null).map((p) => p.name),
      arrived,
      note,
      segments: segments.map((s) => ({ ...s }))
    });
  };

  let arrivedNow = admit(time);
  let running = null; // nur für SRTF relevant
  while (done < procs.length) {
    if (!ready.length && running === null) {
      // Leerlauf bis zur nächsten Ankunft
      const t = order[nextArrival].arrival;
      snapshot(null, `Keine Prozesse bereit – CPU im Leerlauf bis t = ${t}.`, arrivedNow);
      pushSegment(time, t, null);
      time = t;
      arrivedNow = admit(time);
      continue;
    }
    if (algorithm === 'srtf') {
      if (running !== null) ready.push(running);
      // Laufender Prozess behält die CPU bei Gleichstand.
      const current = running;
      sortReady();
      let pick = ready[0];
      if (current !== null && remaining[current] === remaining[pick]) pick = current;
      ready.splice(ready.indexOf(pick), 1);
      const preempted = current !== null && current !== pick;
      if (firstStart[pick] === null) firstStart[pick] = time;
      const nextT = nextArrival < order.length ? order[nextArrival].arrival : Infinity;
      const runUntil = Math.min(time + remaining[pick], nextT);
      const note = preempted
        ? `${procs[pick].name} hat die kürzeste Restlaufzeit (${remaining[pick]}) und verdrängt ${procs[current].name} (Rest ${remaining[current]}).`
        : current === pick
          ? `${procs[pick].name} läuft weiter (Restlaufzeit ${remaining[pick]} ist weiterhin minimal).`
          : `${procs[pick].name} hat die kürzeste Restlaufzeit (${remaining[pick]}) und erhält die CPU.`;
      if (current !== pick || frames.length === 0 || arrivedNow.length) snapshot(pick, note, arrivedNow);
      pushSegment(time, runUntil, pick);
      remaining[pick] -= runUntil - time;
      time = runUntil;
      running = pick;
      if (remaining[pick] === 0) {
        completion[pick] = time;
        done += 1;
        running = null;
      }
      arrivedNow = admit(time);
      continue;
    }
    sortReady();
    const pick = ready.shift();
    if (firstStart[pick] === null) firstStart[pick] = time;
    let slice = remaining[pick];
    let note;
    if (algorithm === 'rr') {
      slice = Math.min(q, remaining[pick]);
      note = `${procs[pick].name} ist vorn in der Warteschlange und läuft ${slice} Zeiteinheit${slice === 1 ? '' : 'en'}${slice < q ? ' (Rest kleiner als das Quantum)' : ''}.`;
    } else if (algorithm === 'fcfs') note = `${procs[pick].name} ist am längsten bereit und läuft bis zum Ende (${slice}).`;
    else if (algorithm === 'sjf') note = `${procs[pick].name} hat unter den bereiten Prozessen die kürzeste Laufzeit (${procs[pick].burst}) und läuft bis zum Ende.`;
    else note = `${procs[pick].name} hat die höchste Priorität (${procs[pick].priority}) und läuft bis zum Ende.`;
    snapshot(pick, note, arrivedNow);
    pushSegment(time, time + slice, pick);
    time += slice;
    remaining[pick] -= slice;
    arrivedNow = admit(time);
    if (remaining[pick] === 0) {
      completion[pick] = time;
      done += 1;
    } else {
      // RR: Neuankömmlinge stehen bereits vor dem unterbrochenen Prozess.
      ready.push(pick);
    }
  }
  snapshot(null, 'Alle Prozesse sind fertig.', arrivedNow);

  const results = procs.map((p, i) => {
    const turnaround = completion[i] - p.arrival;
    return {
      name: p.name,
      arrival: p.arrival,
      burst: p.burst,
      priority: p.priority,
      start: firstStart[i],
      completion: completion[i],
      turnaround,
      waiting: turnaround - p.burst,
      response: firstStart[i] - p.arrival
    };
  });
  const sum = (key) => results.reduce((s, r) => s + r[key], 0);
  const avg = {
    n: results.length,
    waiting: sum('waiting'),
    turnaround: sum('turnaround'),
    response: sum('response')
  };
  return { procs, segments, results, avg, frames, end: time };
}
