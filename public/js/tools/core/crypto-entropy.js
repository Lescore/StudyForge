/**
 * Theoretische Passwortentropie und Suchdauer unter offengelegten Annahmen.
 *
 * Gilt nur für zufällig (gleichverteilt) gewählte Passwörter. Große Zahlen wie
 * 95^20 werden als BigInt exakt gerechnet, Zeiten als Bruch bzw. in
 * wissenschaftlicher Schreibweise ausgegeben.
 */
import { InputError, rat, div, cmp, fmt } from './num.js';

export const CLASSES = {
  lower: { label: 'Kleinbuchstaben a–z', size: 26 },
  upper: { label: 'Großbuchstaben A–Z', size: 26 },
  digits: { label: 'Ziffern 0–9', size: 10 }
};
export const DEFAULT_SPECIAL = 32; // druckbare ASCII-Sonderzeichen ohne Leerzeichen

/** Größenordnungen für Rateversuche pro Sekunde – ausdrücklich Annahmen. */
export const RATE_PRESETS = [
  { id: 'online-limited', rate: 10n, label: 'Online-Angriff mit Ratenbegrenzung (≈ 10 Versuche/s)', note: 'Annahme: Der Dienst bremst oder sperrt nach Fehlversuchen; real oft noch deutlich weniger.' },
  { id: 'online', rate: 1000n, label: 'Online ohne Begrenzung (≈ 10³/s)', note: 'Annahme: Anmeldungen über das Netz ohne wirksame Sperre.' },
  { id: 'offline-slow', rate: 10000n, label: 'Offline, langsamer Passworthash, eine GPU (≈ 10⁴/s)', note: 'Annahme: gestohlene Hashes mit bcrypt/scrypt/Argon2id und hohem Kostenfaktor; stark parameterabhängig.' },
  { id: 'offline-fast', rate: 10n ** 10n, label: 'Offline, schneller Hash, eine GPU (≈ 10¹⁰/s)', note: 'Annahme: ungesalzener oder schneller Hash (z. B. SHA-256, NTLM) auf einer aktuellen Grafikkarte.' },
  { id: 'offline-cluster', rate: 10n ** 12n, label: 'Offline, schneller Hash, großer GPU-Verbund (≈ 10¹²/s)', note: 'Annahme: gut ausgestatteter Angreifer mit vielen GPUs.' }
];

const LOG2_10 = Math.log2(10);

/** log2 einer (großen) positiven BigInt-Zahl mit Gleitkommagenauigkeit. */
export function log2Big(n) {
  if (n <= 0n) throw new InputError('log2 nur für positive Zahlen.');
  const s = n.toString(2);
  if (s.length <= 52) return Math.log2(Number(n));
  // Die ersten 53 Bit genügen für die Mantisse.
  const head = parseInt(s.slice(0, 53), 2);
  return Math.log2(head) + (s.length - 53);
}

function parseIntField(text, label, min, max) {
  const t = String(text ?? '').trim();
  if (!/^[0-9]+$/.test(t)) throw new InputError(`${label}: Bitte eine ganze Zahl eingeben.`);
  const v = Number(t);
  if (v < min || v > max) throw new InputError(`${label}: erlaubt sind ${min.toLocaleString('de-DE')} bis ${max.toLocaleString('de-DE')}.`);
  return v;
}

/** Zeichensatzgröße aus Klassen. */
export function charsetSize({ lower, upper, digits, special, specialSize }) {
  let n = 0;
  const parts = [];
  if (lower) {
    n += 26;
    parts.push('26 (a–z)');
  }
  if (upper) {
    n += 26;
    parts.push('26 (A–Z)');
  }
  if (digits) {
    n += 10;
    parts.push('10 (0–9)');
  }
  if (special) {
    const s = parseIntField(specialSize, 'Anzahl Sonderzeichen', 1, 1000);
    n += s;
    parts.push(`${s} (Sonderzeichen)`);
  }
  if (!n) throw new InputError('Bitte mindestens eine Zeichenklasse wählen.');
  return { n, parts };
}

/**
 * Suchraum S = N^L (bzw. W^k bei Passphrasen) und Entropie H = log2(S).
 */
export function keyspace({ mode, length, charset, words, listSize }) {
  if (mode === 'passphrase') {
    const k = parseIntField(words, 'Wortanzahl', 1, 64);
    const w = parseIntField(listSize, 'Größe der Wortliste', 2, 10_000_000);
    const space = BigInt(w) ** BigInt(k);
    return { space, bits: k * Math.log2(w), formula: `H = ${k} · log₂(${w.toLocaleString('de-DE')})`, base: w, exponent: k };
  }
  const L = parseIntField(length, 'Länge', 1, 1024);
  const N = typeof charset === 'number' ? charset : parseIntField(charset, 'Zeichensatzgröße', 2, 1_114_112);
  if (N < 2) throw new InputError('Zeichensatzgröße: mindestens 2.');
  const space = BigInt(N) ** BigInt(L);
  return { space, bits: L * Math.log2(N), formula: `H = ${L} · log₂(${N.toLocaleString('de-DE')})`, base: N, exponent: L };
}

/** Wissenschaftliche Schreibweise für einen positiven Bruch, z. B. „3,4 × 10^28“. */
export function sci(a, sig = 3) {
  if (a.n === 0n) return '0';
  const n = a.n < 0n ? -a.n : a.n;
  // Exponent über Stellenanzahl abschätzen und korrigieren.
  let e = n.toString().length - a.d.toString().length;
  const ge = (exp) => (exp >= 0 ? n >= a.d * 10n ** BigInt(exp) : n * 10n ** BigInt(-exp) >= a.d);
  if (!ge(e)) e -= 1;
  else if (ge(e + 1)) e += 1;
  // Mantisse mit sig Stellen: round(n / d / 10^(e-sig+1))
  const shift = e - sig + 1;
  let num = n;
  let den = a.d;
  if (shift >= 0) den *= 10n ** BigInt(shift);
  else num *= 10n ** BigInt(-shift);
  let m = num / den;
  const exact = num % den === 0n;
  if ((num % den) * 2n >= den) m += 1n;
  if (m.toString().length > sig) {
    m /= 10n;
    e += 1;
  }
  const digits = m.toString();
  const mant = digits.length > 1 ? `${digits[0]},${digits.slice(1).replace(/0+$/, '')}`.replace(/,$/, '') : digits;
  if (e >= -3 && e <= 5) return fmt(a, { sig });
  return `${exact ? '' : '≈ '}${mant} × 10^${e}`;
}

const YEAR = 31_557_600n; // Julianisches Jahr (365,25 Tage) in Sekunden – Konvention

/** Zeit (Bruch in Sekunden) in eine lesbare Einheit. */
export function humanTime(seconds) {
  const units = [
    ['Jahre', YEAR],
    ['Tage', 86400n],
    ['Stunden', 3600n],
    ['Minuten', 60n],
    ['Sekunden', 1n]
  ];
  for (const [label, s] of units) {
    if (cmp(seconds, rat(s)) >= 0) return `${sci(div(seconds, rat(s)))} ${label}`;
  }
  if (seconds.n === 0n) return '0 Sekunden';
  return `${sci(seconds)} Sekunden`;
}

/** Vollständige und mittlere Suchdauer bei r Versuchen pro Sekunde. */
export function searchTime(space, rate) {
  if (rate <= 0n) throw new InputError('Versuche pro Sekunde müssen größer als 0 sein.');
  const full = rat(space, rate);
  const mean = div(full, rat(2n));
  return { full, mean, fullText: humanTime(full), meanText: humanTime(mean) };
}

export function parseRate(text) {
  const t = String(text ?? '').trim().replace(/[\s_]/g, '');
  let m;
  if ((m = /^([0-9]+)$/.exec(t))) return BigInt(m[1]);
  if ((m = /^10\^([0-9]{1,3})$/.exec(t))) return 10n ** BigInt(m[1]);
  if ((m = /^([0-9]+)[eE]([0-9]{1,3})$/.exec(t))) return BigInt(m[1]) * 10n ** BigInt(m[2]);
  throw new InputError('Versuche pro Sekunde: Bitte eine ganze Zahl eingeben (z. B. 1000000, 1e9 oder 10^12).');
}

/** Exakte Darstellung des Suchraums, gekürzt bei sehr vielen Stellen. */
export function bigText(n, maxDigits = 60) {
  const s = n.toString();
  if (s.length <= maxDigits) return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sci(rat(n), 4)} (${s.length} Dezimalstellen)`;
}

/**
 * Leitet aus einem eingegebenen Passwort nur Länge und vorkommende Klassen ab.
 * Das Passwort selbst wird nicht zurückgegeben.
 */
export function inspectPassword(pw) {
  const chars = [...String(pw ?? '')];
  const has = {
    lower: chars.some((c) => /[a-z]/.test(c)),
    upper: chars.some((c) => /[A-Z]/.test(c)),
    digits: chars.some((c) => /[0-9]/.test(c)),
    special: chars.some((c) => /[\x20-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/.test(c)),
    other: chars.some((c) => !/[\x20-\x7e]/.test(c))
  };
  return { length: chars.length, has };
}

