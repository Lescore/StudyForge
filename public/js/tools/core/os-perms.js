/**
 * Linux-Dateirechte: symbolisch ↔ oktal, chmod-Ausdrücke, umask.
 *
 * Ein Modus ist eine Zahl von 0 bis 0o7777:
 *   4000 SUID, 2000 SGID, 1000 Sticky, danach je drei Bits für Besitzer (u),
 *   Gruppe (g) und andere (o) mit r = 4, w = 2, x = 1.
 * Reine Logik ohne DOM.
 */
import { InputError } from './num.js';

export const SUID = 0o4000;
export const SGID = 0o2000;
export const STICKY = 0o1000;

export const CLASSES = [
  { id: 'u', label: 'Besitzer', shift: 6, special: SUID, specialChar: 's' },
  { id: 'g', label: 'Gruppe', shift: 3, special: SGID, specialChar: 's' },
  { id: 'o', label: 'Andere', shift: 0, special: STICKY, specialChar: 't' }
];

export const FILE_TYPES = {
  '-': 'reguläre Datei',
  d: 'Verzeichnis',
  l: 'symbolischer Link',
  c: 'zeichenorientiertes Gerät',
  b: 'blockorientiertes Gerät',
  p: 'benannte Pipe (FIFO)',
  s: 'Socket'
};

/** Oktaltext (1–4 Ziffern, wie bei chmod links mit Nullen aufgefüllt) → Modus. */
export function parseOctal(text) {
  const raw = String(text ?? '').trim();
  if (!raw) throw new InputError('Oktal: Bitte 3 oder 4 Oktalziffern eingeben (z. B. 755 oder 4755).');
  if (!/^[0-7]{1,4}$/.test(raw)) {
    if (/[89]/.test(raw)) throw new InputError(`Oktal: „${raw}“ enthält 8 oder 9 – Oktalziffern gehen nur von 0 bis 7.`);
    if (/^[0-7]+$/.test(raw)) throw new InputError(`Oktal: „${raw}“ hat zu viele Ziffern (höchstens 4).`);
    throw new InputError(`Oktal: „${raw}“ ist keine Oktalzahl (nur Ziffern 0–7).`);
  }
  return parseInt(raw, 8);
}

/** Modus → vierstelliger Oktaltext. */
export function toOctal(mode, digits = 4) {
  return (mode & 0o7777).toString(8).padStart(digits, '0');
}

/** Kurze Oktalform: dreistellig, wenn keine Spezialbits gesetzt sind. */
export function toOctalShort(mode) {
  return mode & 0o7000 ? toOctal(mode, 4) : toOctal(mode, 3);
}

/** Modus → neun Zeichen wie bei ls (inkl. s/S/t/T). */
export function toSymbolic(mode) {
  let out = '';
  for (const c of CLASSES) {
    const bits = (mode >> c.shift) & 7;
    out += bits & 4 ? 'r' : '-';
    out += bits & 2 ? 'w' : '-';
    const x = bits & 1;
    if (mode & c.special) out += x ? c.specialChar : c.specialChar.toUpperCase();
    else out += x ? 'x' : '-';
  }
  return out;
}

/**
 * Symbolische Rechte lesen: 9 Zeichen (rwxr-xr-x) oder ls-Format mit
 * Dateityp-Zeichen (drwxr-xr-x), optional mit „+“ (ACL) oder „.“ (SELinux) am Ende.
 */
export function parseSymbolic(text) {
  let raw = String(text ?? '').trim();
  if (!raw) throw new InputError('Symbolisch: Bitte Rechte wie rwxr-xr-x oder -rwsr-xr-x eingeben.');
  let type = null;
  let suffix = '';
  if (/[+.@]$/.test(raw) && raw.length >= 10) {
    suffix = raw.slice(-1);
    raw = raw.slice(0, -1);
  }
  if (raw.length === 10) {
    type = raw[0];
    if (!(type in FILE_TYPES)) throw new InputError(`Symbolisch: Unbekanntes Dateityp-Zeichen „${type}“ (erlaubt: - d l c b p s).`);
    raw = raw.slice(1);
  } else if (raw.length !== 9) {
    throw new InputError(`Symbolisch: „${String(text).trim()}“ hat ${raw.length} Zeichen – erwartet werden 9 (rwxr-xr-x) oder 10 mit Dateityp (drwxr-xr-x).`);
  }
  let mode = 0;
  CLASSES.forEach((c, i) => {
    const [r, w, x] = raw.slice(i * 3, i * 3 + 3);
    const pos = (n, ch) => `Position ${i * 3 + n + (type ? 2 : 1)} („${ch}“)`;
    if (r === 'r') mode |= 4 << c.shift;
    else if (r !== '-') throw new InputError(`Symbolisch: ${pos(0, r)} – erwartet „r“ oder „-“.`);
    if (w === 'w') mode |= 2 << c.shift;
    else if (w !== '-') throw new InputError(`Symbolisch: ${pos(1, w)} – erwartet „w“ oder „-“.`);
    const s = c.specialChar;
    if (x === 'x') mode |= 1 << c.shift;
    else if (x === s) mode |= (1 << c.shift) | c.special;
    else if (x === s.toUpperCase()) mode |= c.special;
    else if (x !== '-') throw new InputError(`Symbolisch: ${pos(2, x)} – erwartet „x“, „-“, „${s}“ oder „${s.toUpperCase()}“.`);
  });
  return { mode, type, suffix };
}

/** Erkennt automatisch, ob oktal oder symbolisch eingegeben wurde. */
export function parseAny(text) {
  const raw = String(text ?? '').trim();
  if (/^\d+$/.test(raw)) return { mode: parseOctal(raw), type: null, suffix: '' };
  return parseSymbolic(raw);
}

/** chmod-Befehl in Oktalform. */
export function chmodOctal(mode, file = 'datei') {
  return `chmod ${toOctalShort(mode)} ${quoteArg(file)}`;
}

/** chmod-Befehl in symbolischer Form, z. B. chmod u=rwx,g=rx,o=rx datei */
export function chmodSymbolic(mode, file = 'datei') {
  const parts = CLASSES.map((c) => {
    const bits = (mode >> c.shift) & 7;
    let p = `${bits & 4 ? 'r' : ''}${bits & 2 ? 'w' : ''}${bits & 1 ? 'x' : ''}`;
    if (mode & c.special) p += c.specialChar;
    return `${c.id}=${p}`;
  });
  return `chmod ${parts.join(',')} ${quoteArg(file)}`;
}

function quoteArg(file) {
  const name = String(file || 'datei');
  return /^[A-Za-z0-9._\/-]+$/.test(name) ? name : `'${name.replace(/'/g, "'\\''")}'`;
}

/**
 * Wendet einen symbolischen chmod-Ausdruck an (GNU-Semantik, vereinfacht):
 *   [ugoa]*([-+=]([rwxXst]*|[ugo]))+  durch Kommas getrennt.
 * Ohne Angabe von u/g/o/a wirkt der Ausdruck auf alle, außer auf Bits, die in
 * der umask gesetzt sind (wie GNU chmod). Bei Verzeichnissen lässt „=“ SUID/SGID
 * stehen, solange sie nicht ausdrücklich genannt werden.
 * Liefert den neuen Modus und einen Rechenweg.
 */
export function applyChmod(startMode, expression, { isDir = false, umask = 0o022 } = {}) {
  const expr = String(expression ?? '').trim();
  if (!expr) throw new InputError('chmod-Ausdruck: Bitte einen Ausdruck wie u+x oder g-w,o=r eingeben.');
  if (expr.length > 200) throw new InputError('chmod-Ausdruck ist zu lang (höchstens 200 Zeichen).');
  if (/^[0-7]+$/.test(expr)) {
    const mode = parseOctal(expr);
    return { mode, log: [`Oktalmodus ${expr}: Rechte werden vollständig auf ${toOctal(mode)} (${toSymbolic(mode)}) gesetzt.`] };
  }
  let mode = startMode & 0o7777;
  const log = [];
  for (const clause of expr.split(',')) {
    const m = /^([ugoa]*)((?:[-+=](?:[rwxXst]*|[ugo]))+)$/.exec(clause);
    if (!m) {
      if (!clause) throw new InputError('chmod-Ausdruck: Leerer Abschnitt (doppeltes oder abschließendes Komma).');
      const bad = clause.match(/[^ugoarwxXst+=,-]/);
      if (bad) throw new InputError(`chmod-Ausdruck: Ungültiges Zeichen „${bad[0]}“ in „${clause}“. Erlaubt: u g o a, + - =, r w x X s t.`);
      throw new InputError(`chmod-Ausdruck: „${clause}“ ist ungültig. Aufbau: [ugoa…][+-=][rwxXst…], z. B. u+x, go-w, a=r.`);
    }
    const whoText = m[1];
    const who = whoText.includes('a') || !whoText ? ['u', 'g', 'o'] : [...new Set(whoText)];
    const masked = !whoText; // umask berücksichtigen
    const opRe = /([-+=])([ugo]|[rwxXst]*)/g;
    let op;
    while ((op = opRe.exec(m[2])) !== null) {
      const [, sign, permText] = op;
      const before = mode;
      // Gewünschte Bits für die betroffenen Klassen bestimmen.
      let bits = 0;
      let specialMentioned = 0;
      if (/^[ugo]$/.test(permText)) {
        const src = CLASSES.find((c) => c.id === permText);
        const srcBits = (mode >> src.shift) & 7;
        for (const w of who) bits |= srcBits << CLASSES.find((c) => c.id === w).shift;
      } else {
        for (const ch of permText) {
          for (const w of who) {
            const c = CLASSES.find((k) => k.id === w);
            if (ch === 'r') bits |= 4 << c.shift;
            else if (ch === 'w') bits |= 2 << c.shift;
            else if (ch === 'x') bits |= 1 << c.shift;
            else if (ch === 'X') {
              if (isDir || mode & 0o111) bits |= 1 << c.shift;
            } else if (ch === 's') {
              if (w === 'u') bits |= SUID;
              if (w === 'g') bits |= SGID;
            } else if (ch === 't') {
              if (w === 'o') bits |= STICKY;
            }
          }
          if (ch === 's') specialMentioned |= (who.includes('u') ? SUID : 0) | (who.includes('g') ? SGID : 0);
          if (ch === 't' && who.includes('o')) specialMentioned |= STICKY;
        }
      }
      const mask = masked ? ~umask & 0o7777 : 0o7777;
      if (sign === '+') mode |= bits & mask;
      else if (sign === '-') mode &= ~(bits & mask);
      else {
        // „=“: Rechte der genannten Klassen erst löschen, dann setzen.
        let clear = 0;
        for (const w of who) {
          const c = CLASSES.find((k) => k.id === w);
          clear |= 7 << c.shift;
          if (c.id === 'o') clear |= STICKY;
          else if (!isDir || specialMentioned & c.special) clear |= c.special;
        }
        clear &= mask;
        mode = (mode & ~clear) | (bits & mask);
      }
      const whoLabel = whoText || '(alle, ohne umask-Bits)';
      log.push(`${whoLabel}${sign}${permText}: ${toSymbolic(before)} (${toOctal(before)}) → ${toSymbolic(mode)} (${toOctal(mode)})`);
    }
  }
  return { mode, log };
}

/** umask-Rechner: Standard 666 (Dateien) bzw. 777 (Verzeichnisse), umask-Bits werden entfernt. */
export function applyUmask(umaskText) {
  const raw = String(umaskText ?? '').trim();
  if (!/^[0-7]{3,4}$/.test(raw)) throw new InputError('umask: Bitte 3 oder 4 Oktalziffern eingeben (z. B. 022 oder 0027).');
  const umask = parseInt(raw, 8);
  const file = 0o666 & ~umask;
  const dir = 0o777 & ~umask;
  return { umask, file, dir };
}

const DESCRIPTIONS = {
  file: {
    r: 'Inhalt lesen',
    w: 'Inhalt ändern (Löschen/Umbenennen hängt dagegen von den Rechten des Verzeichnisses ab)',
    x: 'als Programm/Skript ausführen'
  },
  dir: {
    r: 'Einträge auflisten (ls)',
    w: 'Einträge anlegen, löschen, umbenennen (nur zusammen mit x wirksam)',
    x: 'betreten (cd) und auf Einträge zugreifen, deren Namen bekannt sind'
  }
};

/** Verständliche Erläuterung je Klasse und Spezialbit. */
export function describe(mode, { isDir = false } = {}) {
  const d = isDir ? DESCRIPTIONS.dir : DESCRIPTIONS.file;
  const classes = CLASSES.map((c) => {
    const bits = (mode >> c.shift) & 7;
    const can = [];
    if (bits & 4) can.push(d.r);
    if (bits & 2) can.push(d.w);
    if (bits & 1) can.push(d.x);
    return { id: c.id, label: c.label, bits, octal: bits, text: can.length ? can.join('; ') : 'keine Rechte' };
  });
  const special = [];
  const warnings = [];
  if (mode & SUID) {
    if (isDir) special.push('SUID auf einem Verzeichnis wird von Linux ignoriert (keine Wirkung).');
    else special.push('SUID: Das Programm läuft mit den Rechten des Dateibesitzers (z. B. /usr/bin/passwd mit root-Rechten). Bei Skripten mit #! ignoriert Linux SUID.');
    if (!(mode & 0o100)) warnings.push('Großes „S“ beim Besitzer: SUID ist gesetzt, aber der Besitzer hat kein x – das Bit ist so wirkungslos und meist ein Versehen.');
  }
  if (mode & SGID) {
    if (isDir) special.push('SGID auf einem Verzeichnis: Neue Dateien und Unterverzeichnisse erben die Gruppe des Verzeichnisses (praktisch für Team-Ordner).');
    else special.push('SGID: Das Programm läuft mit den Rechten der Dateigruppe.');
    if (!(mode & 0o010)) warnings.push(isDir ? 'Großes „S“ bei der Gruppe: SGID ist gesetzt, die Gruppe hat aber kein x – Gruppenmitglieder können das Verzeichnis nicht betreten.' : 'Großes „S“ bei der Gruppe ohne x: Bei Dateien kennzeichnet das unter Linux traditionell verpflichtendes Sperren (mandatory locking), das moderne Kernel nicht mehr unterstützen.');
  }
  if (mode & STICKY) {
    if (isDir) special.push('Sticky-Bit auf einem Verzeichnis: Einträge dürfen nur ihr Besitzer, der Verzeichnisbesitzer oder root löschen/umbenennen – typisch für /tmp (1777).');
    else special.push('Sticky-Bit auf Dateien wird von Linux ignoriert (historische Bedeutung).');
    if (!(mode & 0o001)) warnings.push('Großes „T“: Sticky-Bit gesetzt, „andere“ haben aber kein x.');
  }
  if ((mode & 0o777) === 0o777) warnings.push('777 (jeder darf alles) ist fast nie die richtige Lösung. Besser: passenden Besitzer/passende Gruppe setzen (chown/chgrp) und nur nötige Rechte vergeben, z. B. 755 bzw. 644 oder 770 für eine Teamgruppe.');
  else if (mode & 0o002) {
    if (isDir && !(mode & STICKY)) warnings.push('Für alle beschreibbares Verzeichnis ohne Sticky-Bit: Jeder kann fremde Dateien darin löschen.');
    else if (!isDir) warnings.push('Die Datei ist für alle beschreibbar – jeder Benutzer kann den Inhalt verändern.');
  }
  if (isDir && (mode & 0o444) && !(mode & 0o111)) warnings.push('Verzeichnis mit r, aber ohne x: Namen lassen sich auflisten, die Einträge aber nicht öffnen.');
  return { classes, special, warnings };
}
