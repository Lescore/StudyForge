/**
 * RAID-Kapazitäten nach dem üblichen Lehrbuchmodell.
 * Bei unterschiedlich großen Laufwerken nutzen klassische RAID-Implementierungen
 * (z. B. mdadm, Hardware-Controller) pro Laufwerk nur so viel wie das kleinste
 * Mitglied – der Rest bleibt ungenutzt. Spezialverfahren (z. B. Synology SHR,
 * ZFS mit gemischten vdevs, Btrfs-RAID1) rechnen anders und sind hier nicht abgebildet.
 */
import { InputError, rat, add, sub, mul, div, minRat, cmp, isZero, ZERO } from './num.js';

export const LEVELS = {
  0: { label: 'RAID 0 (Striping)', min: 2 },
  1: { label: 'RAID 1 (Spiegelung)', min: 2 },
  5: { label: 'RAID 5 (Striping mit einfacher Parität)', min: 3 },
  6: { label: 'RAID 6 (Striping mit doppelter Parität)', min: 4 },
  10: { label: 'RAID 10 (Spiegelung + Striping)', min: 4 }
};

/**
 * drives: Liste von Brüchen (Kapazität je Laufwerk, beliebige Einheit)
 * reservePercent: Bruch 0..100 – Anteil der nutzbaren Kapazität, der frei bleiben soll
 */
export function raidCapacity(level, drives, reservePercent = ZERO) {
  const info = LEVELS[level];
  if (!info) throw new InputError('Unterstützt werden RAID 0, 1, 5, 6 und 10.');
  const n = drives.length;
  if (n < info.min) throw new InputError(`${info.label} braucht mindestens ${info.min} Laufwerke (angegeben: ${n}).`);
  if (n > 64) throw new InputError('Höchstens 64 Laufwerke.');
  if (drives.some((d) => cmp(d, ZERO) <= 0)) throw new InputError('Jedes Laufwerk braucht eine Kapazität größer als 0.');
  if (cmp(reservePercent, ZERO) < 0 || cmp(reservePercent, rat(100n)) >= 0) throw new InputError('Die Reserve muss zwischen 0 und unter 100 % liegen.');

  const raw = drives.reduce((sum, d) => add(sum, d), ZERO);
  const smallest = minRat(...drives);
  const N = rat(BigInt(n));
  const warnings = [];
  let usable;
  let tolerance;
  let toleranceText;
  let formula;

  if (level === 0 || level === '0') {
    usable = mul(N, smallest);
    tolerance = 0;
    toleranceText = 'Keine: Fällt ein Laufwerk aus, sind alle Daten verloren.';
    formula = 'n × kleinstes Laufwerk';
    if (drives.some((d) => cmp(d, smallest) !== 0)) {
      warnings.push('Klassisches RAID 0 nutzt je Laufwerk nur die Größe des kleinsten. Manche Systeme (z. B. Linux md mit unterschiedlich großen Zonen, JBOD/„Spanning“) können mehr nutzen – dann aber ohne gleichmäßiges Striping.');
    }
  } else if (Number(level) === 1) {
    usable = smallest;
    tolerance = n - 1;
    toleranceText = `${n - 1} Laufwerk${n - 1 === 1 ? '' : 'e'} (alle Laufwerke enthalten dieselben Daten).`;
    formula = 'kleinstes Laufwerk (alle anderen sind Spiegel)';
  } else if (Number(level) === 5) {
    usable = mul(rat(BigInt(n - 1)), smallest);
    tolerance = 1;
    toleranceText = '1 Laufwerk. Während des Rebuilds besteht kein Schutz mehr – bei großen Laufwerken dauert der Rebuild lange.';
    formula = '(n − 1) × kleinstes Laufwerk';
  } else if (Number(level) === 6) {
    usable = mul(rat(BigInt(n - 2)), smallest);
    tolerance = 2;
    toleranceText = '2 beliebige Laufwerke gleichzeitig.';
    formula = '(n − 2) × kleinstes Laufwerk';
  } else {
    if (n % 2 !== 0) throw new InputError(`RAID 10 braucht eine gerade Anzahl Laufwerke (je zwei bilden einen Spiegel). Angegeben: ${n}.`);
    // Spiegelpaare in Eingabereihenfolge: 1+2, 3+4, …; gestript wird über die Paare.
    const pairs = [];
    for (let i = 0; i < n; i += 2) pairs.push(minRat(drives[i], drives[i + 1]));
    const smallestPair = minRat(...pairs);
    usable = mul(rat(BigInt(n / 2)), smallestPair);
    tolerance = 1;
    toleranceText = `Garantiert 1 Laufwerk; bis zu ${n / 2}, wenn aus jedem Spiegelpaar höchstens eines ausfällt. Fallen beide Laufwerke eines Paares aus, sind alle Daten verloren.`;
    formula = '(n ÷ 2) × kleinstes Spiegelpaar';
    if (drives.some((d) => cmp(d, smallest) !== 0)) {
      warnings.push('Spiegelpaare werden hier in Eingabereihenfolge gebildet (Laufwerk 1+2, 3+4, …). Andere Paarungen oder Implementierungen (z. B. Linux md „RAID10 far/offset“) können abweichen.');
    }
  }

  if (drives.some((d) => cmp(d, smallest) !== 0) && Number(level) !== 10) {
    warnings.push('Unterschiedlich große Laufwerke: Je Laufwerk wird nur die Kapazität des kleinsten genutzt. Spezialverfahren wie SHR, ZFS oder Btrfs rechnen anders – dafür ist dieses Werkzeug nicht ausgelegt.');
  }

  const reserve = mul(usable, div(reservePercent, rat(100n)));
  const usableAfterReserve = sub(usable, reserve);
  const unusedByMismatch = sub(raw, Number(level) === 1 ? mul(N, smallest) : Number(level) === 10 ? mul(usable, rat(2n)) : mul(N, smallest));
  return {
    level: Number(level),
    label: info.label,
    n,
    raw,
    smallest,
    usable,
    reserve,
    usableAfterReserve,
    lost: sub(raw, usable),
    unusedByMismatch: cmp(unusedByMismatch, ZERO) > 0 ? unusedByMismatch : ZERO,
    efficiency: isZero(raw) ? ZERO : mul(div(usable, raw), rat(100n)),
    tolerance,
    toleranceText,
    formula,
    warnings
  };
}
