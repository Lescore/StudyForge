/**
 * iCalendar-Import (.ics, RFC 5545) – rein lokal.
 *
 * Das eigentliche Parsen (Zeilenfaltung, Escapes, Zeitzonen aus VTIMEZONE,
 * RRULE/EXDATE/RDATE, RECURRENCE-ID-Ausnahmen) übernimmt die mitgelieferte
 * Bibliothek ical.js (server/vendor/ical, MPL-2.0). Dieses Modul ergänzt:
 *  - Zeichensatzerkennung (UTF-8, sonst Windows-1252)
 *  - TZID ohne VTIMEZONE-Block über die Zeitzonendatenbank von Node (Intl)
 *  - Fehlertoleranz: Ist die Datei an einzelnen Stellen beschädigt, werden
 *    die vollständig lesbaren Termine einzeln verarbeitet und die übrigen
 *    mit Begründung gemeldet – nie stillschweigend verworfen.
 *  - Grenzen für Dateigröße, Terminanzahl und Serienlänge
 *
 * Ergebnis ist eine Liste einzelner Vorkommen („Instanzen“). Identität eines
 * Vorkommens: UID + RECURRENCE-ID (leer bei Einzelterminen).
 */
import crypto from 'node:crypto';
import ICAL from './vendor/ical/ical.js';
import { normalize } from './util.js';

export const ICS_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  maxEvents: 5000,
  maxOccurrencesPerSeries: 1000,
  maxInstances: 20000,
  maxIterationsPerSeries: 50000,
  /** Vorkommen wiederkehrender Termine: ein Jahr zurück … */
  seriesPastDays: 365,
  /** … bis zwei Jahre voraus. Einzeltermine werden immer übernommen. */
  seriesFutureDays: 730
};

export const EVENT_CATEGORIES = ['termin', 'lehrveranstaltung', 'pruefung', 'abgabe'];

const TEXT_LIMITS = { summary: 500, description: 20000, location: 500 };

// Häufige Windows-Zeitzonennamen (Outlook/Exchange), falls kein VTIMEZONE mitkommt.
const WINDOWS_ZONES = {
  'w. europe standard time': 'Europe/Berlin',
  'central europe standard time': 'Europe/Budapest',
  'central european standard time': 'Europe/Warsaw',
  'romance standard time': 'Europe/Paris',
  'gmt standard time': 'Europe/London',
  'greenwich standard time': 'Atlantic/Reykjavik',
  'e. europe standard time': 'Europe/Chisinau',
  'fle standard time': 'Europe/Kiev',
  'gtb standard time': 'Europe/Bucharest',
  'russian standard time': 'Europe/Moscow',
  'turkey standard time': 'Europe/Istanbul',
  'eastern standard time': 'America/New_York',
  'central standard time': 'America/Chicago',
  'mountain standard time': 'America/Denver',
  'pacific standard time': 'America/Los_Angeles',
  'tokyo standard time': 'Asia/Tokyo',
  'china standard time': 'Asia/Shanghai',
  'india standard time': 'Asia/Kolkata',
  'aus eastern standard time': 'Australia/Sydney',
  utc: 'UTC',
  'coordinated universal time': 'UTC'
};

export class IcsError extends Error {}

/** Dekodiert die Rohdaten: BOM entfernen, UTF-8 bevorzugen, sonst Windows-1252. */
export function decodeIcsBuffer(buffer) {
  let bytes = buffer;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) bytes = bytes.subarray(3);
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'UTF-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'Windows-1252' };
  }
}

function clip(value, max) {
  const text = String(value ?? '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const zoneCheckCache = new Map();
function isKnownIanaZone(name) {
  if (zoneCheckCache.has(name)) return zoneCheckCache.get(name);
  let ok = false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name });
    ok = true;
  } catch {
    ok = false;
  }
  zoneCheckCache.set(name, ok);
  return ok;
}

/** Ordnet eine TZID einer IANA-Zeitzone zu (oder null). */
export function resolveTimeZone(tzid) {
  const raw = String(tzid ?? '').trim().replace(/^"|"$/g, '');
  if (!raw) return null;
  if (isKnownIanaZone(raw)) return raw;
  // Mozilla/Lightning: "/mozilla.org/20070129_1/Europe/Berlin"
  const parts = raw.split('/').filter(Boolean);
  for (let take = Math.min(3, parts.length); take >= 1; take -= 1) {
    const candidate = parts.slice(-take).join('/');
    if (candidate.includes('/') && isKnownIanaZone(candidate)) return candidate;
  }
  const windows = WINDOWS_ZONES[raw.toLowerCase()];
  return windows ?? null;
}

const dtfCache = new Map();
function zoneFormatter(timeZone) {
  if (!dtfCache.has(timeZone)) {
    dtfCache.set(
      timeZone,
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    );
  }
  return dtfCache.get(timeZone);
}

function zoneOffsetMs(utcMs, timeZone) {
  const parts = Object.fromEntries(
    zoneFormatter(timeZone)
      .formatToParts(new Date(utcMs))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Wandelt eine Wanduhrzeit in einer IANA-Zone in einen UTC-Zeitpunkt (ms). */
export function wallClockToUtc({ year, month, day, hour = 0, minute = 0, second = 0 }, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const first = zoneOffsetMs(guess, timeZone);
  let utc = guess - first;
  const second2 = zoneOffsetMs(utc, timeZone);
  if (second2 !== first) utc = guess - second2;
  return utc;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function isFloating(time) {
  return !time.zone || time.zone.tzid === 'floating';
}

/**
 * Wandelt ein ICAL.Time in die gespeicherte Form:
 * ganztägig → { allDay: true, value: 'JJJJ-MM-TT' }, sonst UTC-ISO-Zeitstempel.
 */
function convertTime(time, tzidHint, notes) {
  if (time.isDate) {
    return { allDay: true, value: `${String(time.year).padStart(4, '0')}-${pad(time.month)}-${pad(time.day)}`, tzid: '' };
  }
  if (!isFloating(time)) {
    return { allDay: false, value: time.toJSDate().toISOString(), tzid: time.zone.tzid === 'UTC' ? 'UTC' : time.zone.tzid };
  }
  if (tzidHint) {
    const zone = resolveTimeZone(tzidHint);
    if (zone) {
      const utc = wallClockToUtc(time, zone);
      return { allDay: false, value: new Date(utc).toISOString(), tzid: zone };
    }
    notes.add(`Unbekannte Zeitzone „${tzidHint}“ – die Uhrzeit wurde als Ortszeit dieses Rechners übernommen.`);
  }
  // Floating Time (ohne Zeitzone): gilt laut RFC 5545 als lokale Zeit.
  return { allDay: false, value: time.toJSDate().toISOString(), tzid: '' };
}

function tzidOf(component, name) {
  const prop = component?.getFirstProperty(name);
  const tzid = prop?.getParameter('tzid');
  return Array.isArray(tzid) ? tzid[0] : tzid || '';
}

function addDays(dateText, days) {
  const [y, m, d] = dateText.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

function mailtoToEmail(value) {
  return String(value ?? '').replace(/^mailto:/i, '').trim();
}

function personLabel(prop) {
  if (!prop) return '';
  const cn = prop.getParameter('cn');
  const email = mailtoToEmail(prop.getFirstValue());
  if (cn && email) return `${cn} <${email}>`;
  return cn || email;
}

function readAttendees(component) {
  return component
    .getAllProperties('attendee')
    .slice(0, 100)
    .map((prop) => ({
      name: clip(prop.getParameter('cn') || '', 200),
      email: clip(mailtoToEmail(prop.getFirstValue()), 200),
      role: String(prop.getParameter('role') || ''),
      status: String(prop.getParameter('partstat') || '')
    }));
}

function readAlarms(component) {
  const alarms = [];
  for (const alarm of component.getAllSubcomponents('valarm').slice(0, 10)) {
    try {
      const action = String(alarm.getFirstPropertyValue('action') || 'DISPLAY').toUpperCase();
      const triggerProp = alarm.getFirstProperty('trigger');
      if (!triggerProp) continue;
      const trigger = triggerProp.getFirstValue();
      const related = String(triggerProp.getParameter('related') || 'START').toUpperCase();
      if (trigger instanceof ICAL.Duration) {
        alarms.push({ action, minutesBefore: Math.round(-trigger.toSeconds() / 60), related });
      } else if (trigger instanceof ICAL.Time) {
        alarms.push({ action, at: trigger.toJSDate().toISOString() });
      }
    } catch {
      /* Erinnerung nicht interpretierbar – Termin bleibt trotzdem erhalten */
    }
  }
  return alarms;
}

function readCategories(component) {
  return component
    .getAllProperties('categories')
    .flatMap((prop) => prop.getValues())
    .map((value) => String(value).trim())
    .filter(Boolean)
    .slice(0, 20)
    .join(', ');
}

/** Erkennt studienbezogene Terminarten anhand von Titel und CATEGORIES. */
export function detectCategory(summary, categories = '') {
  const text = normalize(`${summary} ${categories}`);
  if (/(prufung|pruefung|klausur|\bexam|testat|kolloquium|assessment|midterm|\bfinal)/.test(text)) return 'pruefung';
  if (/(abgabe|deadline|einreich|\bfrist|faellig|fallig|\bdue\b|submission|hand-?in)/.test(text)) return 'abgabe';
  if (/(vorlesung|ubung|uebung|seminar|praktikum|tutorium|lecture|labor|\bkurs\b|\bvl\b)/.test(text)) return 'lehrveranstaltung';
  return 'termin';
}

function hashOf(value) {
  return crypto.createHash('sha1').update(JSON.stringify(value)).digest('hex');
}

/** Felder eines Vorkommens aus der Komponente (Master oder Ausnahme). */
function baseFields(component, event) {
  const summary = clip(event.summary ?? component.getFirstPropertyValue('summary') ?? '', TEXT_LIMITS.summary).trim();
  const categories = readCategories(component);
  const lastModified = component.getFirstPropertyValue('last-modified');
  return {
    summary,
    description: clip(event.description ?? '', TEXT_LIMITS.description),
    location: clip(event.location ?? '', TEXT_LIMITS.location).trim(),
    status: String(component.getFirstPropertyValue('status') || '').toUpperCase().slice(0, 20),
    organizer: clip(personLabel(component.getFirstProperty('organizer')), 300),
    attendees: readAttendees(component),
    alarms: readAlarms(component),
    categories,
    category: detectCategory(summary, categories),
    sequence: Number(component.getFirstPropertyValue('sequence')) || 0,
    lastModified: lastModified instanceof ICAL.Time ? lastModified.toJSDate().toISOString() : null
  };
}

function finishInstance({ uid, recurrenceId, fields, start, end, rrule, isException }) {
  let endValue = end?.value ?? null;
  if (start.allDay) {
    if (!endValue || !end.allDay || endValue <= start.value) endValue = addDays(start.value, 1);
  } else if (!endValue || end.allDay || endValue < start.value) {
    endValue = start.value;
  }
  const instance = {
    uid,
    recurrenceId,
    ...fields,
    start: start.value,
    end: endValue,
    allDay: start.allDay,
    tzid: start.tzid,
    rrule,
    isException
  };
  instance.contentHash = hashOf([
    instance.summary,
    instance.description,
    instance.location,
    instance.start,
    instance.end,
    instance.allDay,
    instance.status,
    instance.organizer,
    instance.attendees,
    instance.alarms,
    instance.categories,
    instance.rrule
  ]);
  return instance;
}

function unfoldLines(text) {
  return text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

/**
 * Notfallweg für beschädigte Dateien: einzelne VEVENT-/VTIMEZONE-Blöcke
 * herauslösen und getrennt parsen. Unvollständige Blöcke werden gemeldet.
 */
function recoverComponents(text, errors) {
  const lines = unfoldLines(text);
  const blocks = [];
  let current = null;
  let depth = 0;
  for (const line of lines) {
    const upper = line.trim().toUpperCase();
    if (!current) {
      if (upper === 'BEGIN:VEVENT' || upper === 'BEGIN:VTIMEZONE') {
        current = { kind: upper.slice(6), lines: [line] };
        depth = 1;
      }
      continue;
    }
    if (upper.startsWith('BEGIN:')) {
      if (upper === 'BEGIN:VEVENT' || upper === 'BEGIN:VTIMEZONE' || upper === 'BEGIN:VCALENDAR') {
        errors.push(`Ein ${current.kind}-Block ist nicht abgeschlossen und wurde übersprungen.`);
        current = upper === 'BEGIN:VCALENDAR' ? null : { kind: upper.slice(6), lines: [line] };
        depth = current ? 1 : 0;
        continue;
      }
      depth += 1;
    } else if (upper.startsWith('END:')) {
      depth -= 1;
    }
    current.lines.push(line);
    if (depth === 0) {
      blocks.push(current);
      current = null;
    }
  }
  if (current) errors.push(`Ein ${current.kind}-Block am Dateiende ist unvollständig und wurde übersprungen.`);

  const timezones = [];
  const events = [];
  for (const block of blocks) {
    try {
      const wrapped = ['BEGIN:VCALENDAR', 'VERSION:2.0', ...block.lines, 'END:VCALENDAR'].join('\r\n');
      const component = new ICAL.Component(ICAL.parse(wrapped));
      const inner = component.getFirstSubcomponent(block.kind.toLowerCase());
      if (inner) (block.kind === 'VTIMEZONE' ? timezones : events).push(inner);
    } catch (err) {
      const summaryLine = block.lines.find((line) => /^SUMMARY[;:]/i.test(line));
      const label = summaryLine ? `„${clip(summaryLine.replace(/^SUMMARY[^:]*:/i, ''), 80)}“` : `(${block.kind})`;
      errors.push(`Termin ${label} ist fehlerhaft und wurde übersprungen: ${err.message}`);
    }
  }
  return { timezones, events };
}

/**
 * Parst eine .ics-Datei. Wirft IcsError, wenn die Datei grundsätzlich
 * unbrauchbar ist; einzelne fehlerhafte Termine landen in `errors`.
 */
export function parseIcs(input, { now = new Date() } = {}) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(String(input ?? ''), 'utf8');
  if (!buffer.length) throw new IcsError('Die Datei ist leer.');
  if (buffer.length > ICS_LIMITS.maxBytes) {
    throw new IcsError(`Die Kalenderdatei ist zu groß (max. ${Math.round(ICS_LIMITS.maxBytes / 1024 / 1024)} MB).`);
  }
  const { text, encoding } = decodeIcsBuffer(buffer);
  if (!/^\s*BEGIN:VCALENDAR/i.test(text) && !/\nBEGIN:VCALENDAR/i.test(text)) {
    throw new IcsError('Das ist keine iCalendar-Datei (BEGIN:VCALENDAR fehlt).');
  }

  const errors = [];
  const warnings = [];
  const notes = new Set();
  let calendarName = '';
  let prodid = '';
  let timezones = [];
  let vevents = [];
  let recovered = false;
  let skippedTodos = 0;

  try {
    const parsed = ICAL.parse(text);
    const root = new ICAL.Component(parsed);
    const calendars = root.name === 'vcalendar' ? [root] : root.getAllSubcomponents('vcalendar');
    if (!calendars.length) throw new IcsError('Kein VCALENDAR-Abschnitt gefunden.');
    for (const calendar of calendars) {
      calendarName ||= String(calendar.getFirstPropertyValue('x-wr-calname') || '');
      prodid ||= String(calendar.getFirstPropertyValue('prodid') || '');
      timezones.push(...calendar.getAllSubcomponents('vtimezone'));
      vevents.push(...calendar.getAllSubcomponents('vevent'));
      skippedTodos += calendar.getAllSubcomponents('vtodo').length + calendar.getAllSubcomponents('vjournal').length;
    }
  } catch (err) {
    if (err instanceof IcsError) throw err;
    // Datei ist an mindestens einer Stelle beschädigt: blockweise weiterlesen.
    recovered = true;
    errors.push(`Die Datei ist nicht vollständig gültig (${err.message}). Lesbare Termine wurden einzeln geprüft.`);
    const lines = unfoldLines(text);
    calendarName = (lines.find((l) => /^X-WR-CALNAME[;:]/i.test(l)) || '').replace(/^[^:]*:/, '').trim();
    prodid = (lines.find((l) => /^PRODID[;:]/i.test(l)) || '').replace(/^[^:]*:/, '').trim();
    ({ timezones, events: vevents } = recoverComponents(text, errors));
  }

  if (vevents.length > ICS_LIMITS.maxEvents) {
    throw new IcsError(`Die Datei enthält ${vevents.length} Termine – erlaubt sind höchstens ${ICS_LIMITS.maxEvents} pro Import.`);
  }
  if (skippedTodos) warnings.push(`${skippedTodos} Aufgabe(n)/Journal-Einträge (VTODO/VJOURNAL) werden nicht importiert.`);

  const windowStart = new Date(now.getTime() - ICS_LIMITS.seriesPastDays * 86400000);
  const windowEnd = new Date(now.getTime() + ICS_LIMITS.seriesFutureDays * 86400000);
  const instances = [];
  const items = [];

  // Zeitzonen dieser Datei registrieren – nach dem Import wieder zurücksetzen.
  ICAL.TimezoneService.reset();
  try {
    for (const tz of timezones) {
      try {
        const tzid = tz.getFirstPropertyValue('tzid');
        if (tzid && !ICAL.TimezoneService.has(tzid)) ICAL.TimezoneService.register(tz);
      } catch (err) {
        warnings.push(`Zeitzonendefinition übersprungen: ${err.message}`);
      }
    }

    // Nach UID gruppieren: Master (ohne RECURRENCE-ID) und Ausnahmen.
    const groups = new Map();
    vevents.forEach((component, index) => {
      let uid = String(component.getFirstPropertyValue('uid') || '').trim();
      if (!uid) {
        uid = `studyforge-ohne-uid-${hashOf([
          String(component.getFirstPropertyValue('summary') || ''),
          String(component.getFirstProperty('dtstart')?.toICALString() || ''),
          String(component.getFirstPropertyValue('location') || '')
        ]).slice(0, 16)}`;
        notes.add('Termine ohne UID wurden anhand von Titel, Beginn und Ort wiedererkannt.');
      }
      uid = clip(uid, 500);
      if (!groups.has(uid)) groups.set(uid, { masters: [], exceptions: [], firstIndex: index });
      const group = groups.get(uid);
      if (component.hasProperty('recurrence-id')) group.exceptions.push(component);
      else group.masters.push(component);
    });

    for (const [uid, group] of groups) {
      if (instances.length >= ICS_LIMITS.maxInstances) {
        warnings.push(`Mehr als ${ICS_LIMITS.maxInstances} Vorkommen – weitere Termine wurden nicht übernommen.`);
        break;
      }
      try {
        items.push(...expandGroup(uid, group, { windowStart, windowEnd, instances, errors, warnings, notes }));
      } catch (err) {
        const component = group.masters[0] || group.exceptions[0];
        const label = String(component?.getFirstPropertyValue('summary') || uid);
        errors.push(`Termin „${clip(label, 80)}“ konnte nicht gelesen werden: ${err.message}`);
      }
    }
  } finally {
    ICAL.TimezoneService.reset();
  }

  items.sort((a, b) => String(a.start).localeCompare(String(b.start)));
  return {
    calendarName: clip(calendarName, 200).trim(),
    prodid: clip(prodid, 200).trim(),
    encoding,
    recovered,
    items,
    instances,
    errors,
    warnings: [...warnings, ...notes],
    window: { start: windowStart.toISOString(), end: windowEnd.toISOString() }
  };
}

function expandGroup(uid, group, ctx) {
  const { windowStart, windowEnd, instances, errors, warnings, notes } = ctx;
  const items = [];
  let master = group.masters[0] ?? null;
  if (group.masters.length > 1) {
    // Ungültig, kommt aber vor: den neuesten Stand verwenden.
    master = [...group.masters].sort(
      (a, b) => (Number(b.getFirstPropertyValue('sequence')) || 0) - (Number(a.getFirstPropertyValue('sequence')) || 0)
    )[0];
    warnings.push(`UID „${clip(uid, 60)}“ kommt mehrfach vor – die Fassung mit der höchsten SEQUENCE wurde verwendet.`);
  }

  const pushInstance = (instance) => {
    if (instances.length >= ICS_LIMITS.maxInstances) return false;
    instances.push(instance);
    return true;
  };

  if (master) {
    const event = new ICAL.Event(master);
    const startTzid = tzidOf(master, 'dtstart');
    const endTzid = tzidOf(master, 'dtend') || startTzid;
    if (!master.hasProperty('dtstart')) throw new Error('DTSTART fehlt.');
    const masterFields = baseFields(master, event);

    if (event.isRecurring()) {
      const rruleProp = master.getFirstPropertyValue('rrule');
      const rrule = rruleProp ? clip(rruleProp.toString(), 500) : 'RDATE';
      const exceptionByRid = new Map();
      for (const exception of group.exceptions) {
        try {
          event.relateException(exception);
          const rid = convertTime(exception.getFirstPropertyValue('recurrence-id'), tzidOf(exception, 'recurrence-id') || startTzid, notes);
          exceptionByRid.set(rid.value, exception);
        } catch (err) {
          errors.push(`Ausnahme zu „${clip(masterFields.summary || uid, 80)}“ übersprungen: ${err.message}`);
        }
      }
      const iterator = event.iterator();
      let count = 0;
      let iterations = 0;
      let truncated = false;
      let first = null;
      const recurrenceIds = [];
      let next;
      while ((next = iterator.next())) {
        iterations += 1;
        if (iterations > ICS_LIMITS.maxIterationsPerSeries) {
          truncated = true;
          break;
        }
        const details = event.getOccurrenceDetails(next);
        const occStart = details.startDate.toJSDate();
        if (occStart > windowEnd) break;
        const occEnd = details.endDate.toJSDate();
        if (occEnd < windowStart) continue;
        if (count >= ICS_LIMITS.maxOccurrencesPerSeries) {
          truncated = true;
          break;
        }
        const rid = convertTime(details.recurrenceId, startTzid, notes);
        const exception = exceptionByRid.get(rid.value);
        const fields = exception ? baseFields(exception, details.item) : masterFields;
        const instance = finishInstance({
          uid,
          recurrenceId: rid.value,
          fields,
          start: convertTime(details.startDate, exception ? tzidOf(exception, 'dtstart') : startTzid, notes),
          end: convertTime(details.endDate, exception ? tzidOf(exception, 'dtend') || tzidOf(exception, 'dtstart') : endTzid, notes),
          rrule,
          isException: Boolean(exception)
        });
        if (!pushInstance(instance)) break;
        first ??= instance;
        recurrenceIds.push(instance.recurrenceId);
        count += 1;
      }
      if (truncated) {
        warnings.push(`Serie „${clip(masterFields.summary || uid, 80)}“: nur ${count} Vorkommen übernommen (Grenze erreicht).`);
      }
      items.push({
        uid,
        summary: masterFields.summary,
        location: masterFields.location,
        category: masterFields.category,
        status: masterFields.status,
        start: first?.start ?? convertTime(event.startDate, startTzid, notes).value,
        end: first?.end ?? null,
        allDay: event.startDate.isDate,
        rrule,
        occurrences: count,
        exceptions: exceptionByRid.size,
        recurrenceIds
      });
      return items;
    }

    // Einzeltermin
    const instance = finishInstance({
      uid,
      recurrenceId: '',
      fields: masterFields,
      start: convertTime(event.startDate, startTzid, notes),
      end: master.hasProperty('dtend') || master.hasProperty('duration') ? convertTime(event.endDate, endTzid, notes) : null,
      rrule: '',
      isException: false
    });
    if (pushInstance(instance)) {
      items.push({
        uid,
        summary: instance.summary,
        location: instance.location,
        category: instance.category,
        status: instance.status,
        start: instance.start,
        end: instance.end,
        allDay: instance.allDay,
        rrule: '',
        occurrences: 1,
        exceptions: 0,
        recurrenceIds: ['']
      });
    }
    // Ausnahmen ohne wiederkehrenden Master werden als eigene Vorkommen geführt.
    if (group.exceptions.length) {
      warnings.push(`„${clip(masterFields.summary || uid, 80)}“: Ausnahmen ohne Wiederholungsregel als eigene Termine übernommen.`);
    }
  }

  // Ausnahmen ohne (verwendbaren) Master
  if (!master || !new ICAL.Event(master).isRecurring()) {
    for (const exception of group.exceptions) {
      try {
        const event = new ICAL.Event(exception);
        const rid = convertTime(exception.getFirstPropertyValue('recurrence-id'), tzidOf(exception, 'recurrence-id'), notes);
        const fields = baseFields(exception, event);
        const instance = finishInstance({
          uid,
          recurrenceId: rid.value,
          fields,
          start: convertTime(event.startDate, tzidOf(exception, 'dtstart'), notes),
          end: exception.hasProperty('dtend') || exception.hasProperty('duration')
            ? convertTime(event.endDate, tzidOf(exception, 'dtend') || tzidOf(exception, 'dtstart'), notes)
            : null,
          rrule: '',
          isException: true
        });
        if (!pushInstance(instance)) break;
        items.push({
          uid,
          summary: instance.summary,
          location: instance.location,
          category: instance.category,
          status: instance.status,
          start: instance.start,
          end: instance.end,
          allDay: instance.allDay,
          rrule: '',
          occurrences: 1,
          exceptions: 0,
          recurrenceIds: [instance.recurrenceId]
        });
      } catch (err) {
        errors.push(`Einzelner Termin „${clip(String(exception.getFirstPropertyValue('summary') || uid), 80)}“ übersprungen: ${err.message}`);
      }
    }
  }
  return items;
}
