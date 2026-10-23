/**
 * UUIDs nach RFC 9562: Version 4 (zufällig) und Version 7 (Unix-Zeit in ms +
 * Zufall, zeitlich sortierbar) erzeugen sowie beliebige UUIDs analysieren.
 * Die Zufallsbytes kommen von außen (crypto.getRandomValues), damit die Logik testbar bleibt.
 */
import { InputError } from './num.js';

export const NIL_UUID = '00000000-0000-0000-0000-000000000000';
export const MAX_UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export function bytesToUuid(bytes) {
  const h = hex(bytes);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Version 4: 122 Zufallsbits, Version (0100) in Byte 6, Variante (10) in Byte 8. */
export function uuidV4(random16) {
  const b = Uint8Array.from(random16.slice(0, 16));
  if (b.length !== 16) throw new InputError('16 Zufallsbytes nötig.');
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  return bytesToUuid(b);
}

/**
 * Version 7: 48 Bit Unix-Zeit (ms, Big-Endian), 4 Bit Version 0111, 12 Bit rand_a,
 * 2 Bit Variante 10, 62 Bit rand_b. `counter` (0–4095) ersetzt rand_a, um
 * innerhalb derselben Millisekunde monoton zu bleiben (RFC 9562, 6.2 Methode 1).
 */
export function uuidV7(ms, random16, counter = null) {
  if (!Number.isInteger(ms) || ms < 0 || ms > 2 ** 48 - 1) throw new InputError('Zeitstempel außerhalb von 48 Bit.');
  const b = Uint8Array.from(random16.slice(0, 16));
  let t = ms;
  for (let i = 5; i >= 0; i -= 1) {
    b[i] = t % 256;
    t = Math.floor(t / 256);
  }
  if (counter !== null) {
    b[6] = (counter >> 8) & 0x0f;
    b[7] = counter & 0xff;
  }
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  return bytesToUuid(b);
}

/**
 * Mehrere UUIDs erzeugen. randomBytes(n) liefert Uint8Array(n), now() die Zeit in ms.
 * v7: monoton steigend (Zähler in rand_a, bei Überlauf nächste Millisekunde).
 */
export function generateUuids({ version = 4, count = 1, randomBytes, now = () => Date.now() }) {
  const n = Number(count);
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new InputError('Anzahl muss zwischen 1 und 100 liegen.');
  const out = [];
  if (version === 4) {
    for (let i = 0; i < n; i += 1) out.push(uuidV4(randomBytes(16)));
    return out;
  }
  if (version !== 7) throw new InputError('Unterstützt werden Version 4 und 7.');
  let ms = now();
  let counter = randomBytes(2).reduce((acc, x) => (acc << 8) | x, 0) & 0x7ff; // höchstes Bit frei für Wachstum
  for (let i = 0; i < n; i += 1) {
    if (i > 0) {
      const t = now();
      if (t > ms) {
        ms = t;
        counter = randomBytes(2).reduce((acc, x) => (acc << 8) | x, 0) & 0x7ff;
      } else {
        counter += 1;
        if (counter > 0xfff) {
          ms += 1;
          counter = 0;
        }
      }
    }
    out.push(uuidV7(ms, randomBytes(16), counter));
  }
  return out;
}

export function formatUuid(uuid, { upper = false, hyphens = true, braces = false, urn = false } = {}) {
  let s = hyphens ? uuid : uuid.replace(/-/g, '');
  if (upper) s = s.toUpperCase();
  if (braces) s = `{${s}}`;
  if (urn) s = `urn:uuid:${s}`;
  return s;
}

const GREGORIAN_OFFSET = 0x01b21dd213814000n; // 100-ns-Intervalle von 1582-10-15 bis 1970-01-01

/** UUID analysieren: Format, Version, Variante, ggf. Zeitstempel. */
export function analyzeUuid(input) {
  let s = String(input).trim();
  const notes = [];
  if (/^urn:uuid:/i.test(s)) {
    s = s.slice(9);
    notes.push('URN-Präfix „urn:uuid:“ erkannt.');
  }
  if (/^\{.*\}$/.test(s)) {
    s = s.slice(1, -1);
    notes.push('Geschweifte Klammern (Microsoft-GUID-Schreibweise) erkannt.');
  }
  let h;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) h = s.replace(/-/g, '');
  else if (/^[0-9a-f]{32}$/i.test(s)) {
    h = s;
    notes.push('Ohne Bindestriche geschrieben (32 Hexziffern).');
  } else {
    const digits = s.replace(/-/g, '');
    const bad = digits.match(/[^0-9a-f]/i);
    if (bad) throw new InputError(`Ungültiges Zeichen „${bad[0]}“ – eine UUID besteht aus 32 Hexziffern (0–9, a–f).`);
    if (digits.length !== 32) throw new InputError(`Eine UUID hat 32 Hexziffern, gefunden ${digits.length}.`);
    throw new InputError('Bindestriche an falscher Stelle – Format 8-4-4-4-12.');
  }
  const lower = h.toLowerCase();
  if (h !== lower && h !== h.toUpperCase()) notes.push('Gemischte Groß-/Kleinschreibung (zulässig, aber unüblich).');
  const canonical = `${lower.slice(0, 8)}-${lower.slice(8, 12)}-${lower.slice(12, 16)}-${lower.slice(16, 20)}-${lower.slice(20)}`;
  if (canonical === NIL_UUID) return { canonical, special: 'nil', version: null, variant: null, notes };
  if (canonical === MAX_UUID) return { canonical, special: 'max', version: null, variant: null, notes };
  const versionNibble = parseInt(lower[12], 16);
  const variantByte = parseInt(lower.slice(16, 18), 16);
  let variant;
  if ((variantByte & 0x80) === 0) variant = { id: 'ncs', label: 'NCS (veraltet, Bits 0xxx)' };
  else if ((variantByte & 0xc0) === 0x80) variant = { id: 'rfc', label: 'RFC 9562 / RFC 4122 (Bits 10xx)' };
  else if ((variantByte & 0xe0) === 0xc0) variant = { id: 'microsoft', label: 'Microsoft (veraltet, Bits 110x)' };
  else variant = { id: 'reserved', label: 'Reserviert für die Zukunft (Bits 111x)' };
  const VERSIONS = {
    1: 'Version 1 – zeitbasiert (Gregorianischer Zeitstempel + Knoten-ID/MAC)',
    2: 'Version 2 – DCE-Sicherheit',
    3: 'Version 3 – namensbasiert (MD5)',
    4: 'Version 4 – zufällig',
    5: 'Version 5 – namensbasiert (SHA-1)',
    6: 'Version 6 – zeitbasiert, umsortiert (sortierbar)',
    7: 'Version 7 – Unix-Zeit in Millisekunden + Zufall (sortierbar)',
    8: 'Version 8 – herstellerspezifisch (frei belegbar)'
  };
  const result = {
    canonical,
    special: null,
    version: variant.id === 'rfc' ? versionNibble : null,
    versionLabel: variant.id === 'rfc' ? VERSIONS[versionNibble] ?? `Version ${versionNibble} – nicht definiert` : 'Versionsfeld nur bei RFC-Variante definiert',
    variant,
    notes,
    timestampMs: null
  };
  if (variant.id === 'rfc') {
    if (versionNibble === 7) result.timestampMs = parseInt(lower.slice(0, 12), 16);
    if (versionNibble === 1 || versionNibble === 6) {
      let ts;
      if (versionNibble === 1) ts = (BigInt(`0x${lower.slice(13, 16)}`) << 48n) | (BigInt(`0x${lower.slice(8, 12)}`) << 32n) | BigInt(`0x${lower.slice(0, 8)}`);
      else ts = (BigInt(`0x${lower.slice(0, 8)}`) << 28n) | (BigInt(`0x${lower.slice(8, 12)}`) << 12n) | BigInt(`0x${lower.slice(13, 16)}`);
      result.timestampMs = Number((ts - GREGORIAN_OFFSET) / 10000n);
    }
    if (versionNibble === 4) result.randomBits = 122;
  }
  return result;
}
