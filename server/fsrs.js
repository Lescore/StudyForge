/**
 * FSRS-5 (Free Spaced Repetition Scheduler) – lokal implementiert.
 * Quellen/Herleitung: https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
 * Die Formeln sind bewusst transparent und ohne externe Bibliothek umgesetzt.
 *
 * Bewertungen: 1 = Nicht gewusst, 2 = Schwierig, 3 = Gut, 4 = Sicher.
 */

export const DEFAULT_PARAMS = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046,
  1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315,
  2.9898, 0.51655, 0.6621
];

export const DECAY = -0.5;
export const FACTOR = 19 / 81;
export const RATING_LABELS = {
  1: 'Nicht gewusst',
  2: 'Schwierig',
  3: 'Gut',
  4: 'Sicher'
};

const MAX_STABILITY = 36500;
const MIN_STABILITY = 0.1;
const DAY_MS = 86400000;
const AGAIN_MINUTES = 10;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function initStability(rating, w = DEFAULT_PARAMS) {
  return clamp(w[clamp(rating, 1, 4) - 1], MIN_STABILITY, MAX_STABILITY);
}

export function initDifficulty(rating, w = DEFAULT_PARAMS) {
  return clamp(w[4] - (clamp(rating, 1, 4) - 3) * w[5], 1, 10);
}

export function retrievability(elapsedDays, stability) {
  if (!stability || stability <= 0) return 0;
  const t = Math.max(0, elapsedDays);
  return Math.pow(1 + FACTOR * (t / stability), DECAY);
}

export function nextDifficulty(difficulty, rating, w = DEFAULT_PARAMS) {
  const d = clamp(difficulty, 1, 10);
  const delta = d - w[6] * (rating - 3);
  const reverted = w[7] * initDifficulty(4, w) + (1 - w[7]) * delta;
  return clamp(reverted, 1, 10);
}

export function nextStability({ difficulty, stability, elapsedDays, rating, w = DEFAULT_PARAMS }) {
  if (rating === 1) {
    const s = Math.max(stability, MIN_STABILITY);
    const r = retrievability(elapsedDays, s);
    const next = w[11] * Math.pow(difficulty, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r));
    return clamp(Math.min(next, s), MIN_STABILITY, MAX_STABILITY);
  }
  const r = retrievability(elapsedDays, stability);
  const hardPenalty = rating === 2 ? w[15] : 1;
  const easyBonus = rating === 4 ? w[16] : 1;
  const growth = 1 + Math.exp(w[8]) * (11 - difficulty) * Math.pow(stability, -w[9]) * (Math.exp(w[10] * (1 - r)) - 1) * hardPenalty * easyBonus;
  return clamp(stability * growth, MIN_STABILITY, MAX_STABILITY);
}

/** Kurzzeit-Wiederholung am selben Tag (FSRS-5 Term). */
export function shortTermStability(stability, rating, w = DEFAULT_PARAMS) {
  const factor = Math.exp(w[17] * (rating - 3 + w[18]));
  return clamp(stability * factor, MIN_STABILITY, MAX_STABILITY);
}

export function nextIntervalDays(stability, retention = 0.9) {
  const req = clamp(Number(retention) || 0.9, 0.7, 0.99);
  const interval = (stability / FACTOR) * (Math.pow(req, 1 / DECAY) - 1);
  return clamp(interval, 1 / 1440, MAX_STABILITY);
}

export function intervalLabel(days) {
  if (!Number.isFinite(days) || days <= 0) return 'jetzt';
  if (days < 1) return `${Math.max(1, Math.round(days * 24 * 60))} Min`;
  if (days < 30) return `${Math.round(days)} ${Math.round(days) === 1 ? 'Tag' : 'Tage'}`;
  if (days < 365) return `${(days / 30).toFixed(1).replace('.', ',')} Monate`;
  return `${(days / 365).toFixed(1).replace('.', ',')} Jahre`;
}

function elapsedDaysSince(iso, now) {
  if (!iso) return 0;
  const ms = now.getTime() - new Date(iso).getTime();
  return Math.max(0, ms / DAY_MS);
}

/**
 * Erzeugt für alle vier Bewertungen eine Vorschau, ohne zu speichern.
 * So kann die Oberfläche ehrlich anzeigen, wann die Karte wiederkommt.
 */
export function previewCard(card, now = new Date(), retention = 0.9) {
  const out = [];
  for (let rating = 1; rating <= 4; rating += 1) {
    const sim = applyRating(card, rating, now, retention, { dryRun: true });
    out.push({
      rating,
      label: RATING_LABELS[rating],
      intervalDays: sim.intervalDays,
      intervalLabel: sim.intervalLabel,
      due: sim.due
    });
  }
  return out;
}

/**
 * Berechnet den neuen Kartenzustand. Gibt ein neues Objekt zurück (Mutation
 * erfolgt nicht). `dryRun` beeinflusst nur die Vorschau (Again -> 10 Minuten).
 */
export function applyRating(card, rating, now = new Date(), retention = 0.9, opts = {}) {
  const r = clamp(Math.trunc(Number(rating)), 1, 4);
  const w = DEFAULT_PARAMS;
  const isNew = !Number(card.reps);
  const prevStability = Number(card.stability) || 0;
  const prevDifficulty = Number(card.difficulty) || 0;
  const elapsed = elapsedDaysSince(card.last_review, now);

  let difficulty;
  let stability;
  let state;
  let intervalDays;
  let due;

  if (r === 1) {
    difficulty = isNew ? initDifficulty(1, w) : nextDifficulty(prevDifficulty, 1, w);
    stability = isNew
      ? initStability(1, w)
      : nextStability({ difficulty, stability: prevStability, elapsedDays: elapsed, rating: 1, w });
    state = 'relearning';
    intervalDays = AGAIN_MINUTES / 1440;
    due = new Date(now.getTime() + AGAIN_MINUTES * 60000);
  } else {
    if (isNew) {
      difficulty = initDifficulty(r, w);
      stability = initStability(r, w);
    } else {
      difficulty = nextDifficulty(prevDifficulty, r, w);
      stability = nextStability({
        difficulty,
        stability: prevStability,
        elapsedDays: elapsed,
        rating: r,
        w
      });
      if (elapsed < 1) stability = shortTermStability(prevStability, r, w);
    }
    state = 'review';
    intervalDays = nextIntervalDays(stability, retention);
    // Wiederholungen am selben Tag: mindestens ein Tag Abstand bei gut/sicher.
    intervalDays = Math.max(intervalDays, 1);
    due = new Date(now.getTime() + intervalDays * DAY_MS);
  }

  const scheduledDays = intervalDays;
  return {
    state,
    difficulty: Number(difficulty.toFixed(4)),
    stability: Number(stability.toFixed(4)),
    due: due.toISOString(),
    intervalDays: Number(scheduledDays.toFixed(4)),
    intervalLabel: intervalLabel(scheduledDays),
    reps: (Number(card.reps) || 0) + 1,
    lapses: (Number(card.lapses) || 0) + (r === 1 && !isNew ? 1 : 0),
    last_review: now.toISOString(),
    elapsed_days: Number(elapsed.toFixed(4)),
    scheduled_days: Number(scheduledDays.toFixed(4)),
    prev_state: userState(card),
    prev_stability: prevStability,
    prev_difficulty: prevDifficulty
  };
}

function userState(card) {
  if (!Number(card.reps)) return 'new';
  if (card.state === 'learning' || card.state === 'relearning') return card.state;
  return 'review';
}

export function isHardCard(card) {
  if (card.state === 'relearning') return true;
  if (Number(card.lapses) > 0) return true;
  return Number(card.difficulty) >= 7;
}

export function cardMemory(card, now = new Date()) {
  if (!card.last_review || !card.stability) return null;
  const elapsed = elapsedDaysSince(card.last_review, now);
  return {
    elapsedDays: elapsed,
    retrievability: Math.round(retrievability(elapsed, card.stability) * 100)
  };
}
