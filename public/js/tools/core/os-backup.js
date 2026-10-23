/**
 * Backup-Arten: Vollsicherung, inkrementell, differenziell.
 *
 * Modell (als Annahme offengelegt):
 * - Der Datenbestand hat eine feste Größe; Änderungen ersetzen Daten, statt ihn wachsen zu lassen.
 * - Die an verschiedenen Tagen geänderten Daten überschneiden sich nicht
 *   (dann ist eine differenzielle Sicherung die Summe aller Änderungen seit der Vollsicherung –
 *   bei Überschneidungen wäre sie kleiner).
 * - Inkrementell sichert alles seit der letzten Sicherung beliebiger Art,
 *   differenziell alles seit der letzten Vollsicherung.
 * Reine Logik ohne DOM.
 */
import { InputError } from './num.js';

export const TYPES = { full: 'Vollsicherung', incr: 'Inkrementell', diff: 'Differenziell', none: 'keine' };

function num(value, label, max) {
  const raw = String(value ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new InputError(`${label}: „${raw || 'leer'}“ ist keine Zahl ≥ 0.`);
  const n = Number(raw);
  if (n > max) throw new InputError(`${label}: höchstens ${max}.`);
  return n;
}

/**
 * days: [{ label, type, changed }]  (changed = an diesem Tag geänderte Daten in GB,
 *        vor der Sicherung am Abend)
 * Liefert je Tag die Sicherungsgröße und Summen.
 */
export function planBackups(days, totalSize) {
  const total = num(totalSize, 'Datenbestand', 1e6);
  if (total <= 0) throw new InputError('Datenbestand: Bitte einen Wert größer 0 eingeben.');
  let sinceLast = 0;
  let sinceFull = 0;
  let hadFull = false;
  const rows = days.map((d, i) => {
    if (!TYPES[d.type]) throw new InputError(`Tag ${i + 1}: Unbekannte Sicherungsart.`);
    const changed = num(d.changed, `${d.label}: geänderte Daten`, 1e6);
    if (changed > total) throw new InputError(`${d.label}: Es können nicht mehr Daten geändert werden, als vorhanden sind (${total} GB).`);
    sinceLast += changed;
    sinceFull += changed;
    let size = 0;
    let note = '';
    if (d.type === 'full') {
      size = total;
      hadFull = true;
      sinceFull = 0;
      sinceLast = 0;
      note = 'gesamter Datenbestand';
    } else if (d.type === 'incr' || d.type === 'diff') {
      if (!hadFull) note = 'ohne vorherige Vollsicherung nicht verwendbar';
      if (d.type === 'incr') {
        size = Math.min(sinceLast, total);
        note ||= 'Änderungen seit der letzten Sicherung';
      } else {
        size = Math.min(sinceFull, total);
        note ||= 'Änderungen seit der letzten Vollsicherung';
      }
      sinceLast = 0;
    }
    return { label: d.label, type: d.type, changed, size, note };
  });
  const totalStored = rows.reduce((s, r) => s + r.size, 0);
  return { rows, totalStored, total };
}

/**
 * Welche Sicherungen braucht man, um den Stand von Tag `dayIndex` (nach der
 * Sicherung an diesem Tag) wiederherzustellen?
 * Regel: letzte Vollsicherung ≤ Tag, danach die jüngste differenzielle Sicherung
 * seit dieser Vollsicherung, danach alle inkrementellen Sicherungen nach der
 * jüngeren der beiden.
 */
export function restoreChain(rows, dayIndex) {
  if (dayIndex < 0 || dayIndex >= rows.length) throw new InputError('Ungültiger Tag für die Wiederherstellung.');
  let full = -1;
  for (let i = dayIndex; i >= 0; i -= 1) {
    if (rows[i].type === 'full') {
      full = i;
      break;
    }
  }
  if (full < 0) return { ok: false, chain: [], message: 'Bis zu diesem Tag gibt es keine Vollsicherung – eine Wiederherstellung ist nicht möglich.' };
  let diff = -1;
  for (let i = dayIndex; i > full; i -= 1) {
    if (rows[i].type === 'diff') {
      diff = i;
      break;
    }
  }
  const chain = [full];
  if (diff >= 0) chain.push(diff);
  for (let i = Math.max(full, diff) + 1; i <= dayIndex; i += 1) if (rows[i].type === 'incr') chain.push(i);
  // Stand: liegt nach dem letzten Glied der Kette noch ein Tag ohne Sicherung, fehlen dessen Änderungen.
  const last = chain[chain.length - 1];
  const lost = [];
  for (let i = last + 1; i <= dayIndex; i += 1) if (rows[i].type === 'none' && rows[i].changed > 0) lost.push(i);
  const size = chain.reduce((s, i) => s + rows[i].size, 0);
  return { ok: true, chain, size, lost, message: '' };
}
