/**
 * IPv4-Header dekodieren und Prüfsumme (Einerkomplement) berechnen.
 * Reine Logik ohne DOM.
 */
import { InputError } from './num.js';
import { formatIPv4 } from './net-ipv4.js';

/** Hex-Bytefolge lesen: Leerzeichen, Zeilenumbrüche, Doppelpunkte, Bindestriche und „0x“ erlaubt. */
export function parseHexBytes(text, { max = 1500 } = {}) {
  const raw = String(text ?? '');
  if (raw.length > max * 5) throw new InputError(`Eingabe ist zu lang (höchstens ${max} Byte).`);
  const cleaned = raw.replace(/0x/gi, '').replace(/[\s:,-]/g, '');
  if (!cleaned) throw new InputError('Bitte eine Hex-Bytefolge eingeben, z. B. 45 00 00 73 …');
  const bad = cleaned.match(/[^0-9a-fA-F]/);
  if (bad) throw new InputError(`Ungültiges Zeichen „${bad[0]}“ – erlaubt sind Hexziffern 0–9, a–f sowie Leerzeichen und Doppelpunkte als Trenner.`);
  if (cleaned.length % 2) throw new InputError(`Ungerade Anzahl Hexziffern (${cleaned.length}) – jedes Byte besteht aus genau zwei Hexziffern.`);
  const bytes = [];
  for (let i = 0; i < cleaned.length; i += 2) bytes.push(parseInt(cleaned.slice(i, i + 2), 16));
  if (bytes.length > max) throw new InputError(`Zu viele Bytes (${bytes.length}, höchstens ${max}).`);
  return bytes;
}

/**
 * Internet-Prüfsumme (RFC 1071) über `bytes`; `skip` = Byteoffset eines
 * 16-Bit-Feldes, das als 0 gezählt wird (das Prüfsummenfeld selbst).
 * Ergebnis: { sum (gefaltet), checksum (= ~sum), trace[] }
 */
export function internetChecksum(bytes, skip = -1) {
  let sum = 0;
  const words = [];
  for (let i = 0; i < bytes.length; i += 2) {
    const w = i === skip ? 0 : (bytes[i] << 8) | (bytes[i + 1] ?? 0);
    words.push(w);
    sum += w;
  }
  const raw = sum;
  while (sum > 0xffff) sum = (sum & 0xffff) + (sum >>> 16);
  return { words, raw, sum, checksum: ~sum & 0xffff };
}

export const PROTOCOLS = {
  0: 'HOPOPT (IPv6 Hop-by-Hop)',
  1: 'ICMP',
  2: 'IGMP',
  4: 'IPv4 (IP-in-IP)',
  6: 'TCP',
  17: 'UDP',
  41: 'IPv6 (in IPv4 gekapselt)',
  47: 'GRE',
  50: 'ESP (IPsec)',
  51: 'AH (IPsec)',
  58: 'ICMPv6',
  89: 'OSPF',
  103: 'PIM',
  112: 'VRRP',
  132: 'SCTP'
};

export function dscpName(dscp) {
  if (dscp === 0) return 'Default / CS0 (Best Effort)';
  if (dscp === 46) return 'EF (Expedited Forwarding, z. B. Sprache)';
  if (dscp === 44) return 'VOICE-ADMIT';
  if (dscp % 8 === 0) return `CS${dscp / 8} (Class Selector)`;
  const cls = dscp >> 3;
  const drop = (dscp >> 1) & 3;
  if (cls >= 1 && cls <= 4 && (dscp & 1) === 0 && drop >= 1) return `AF${cls}${drop} (Assured Forwarding)`;
  return 'nicht standardisiert / lokal';
}

export const ECN_NAMES = ['Not-ECT (kein ECN)', 'ECT(1)', 'ECT(0)', 'CE (Congestion Experienced)'];

const OPTION_NAMES = { 0: 'End of Option List', 1: 'No Operation (NOP)', 7: 'Record Route', 68: 'Timestamp', 130: 'Security', 131: 'Loose Source Route', 137: 'Strict Source Route', 148: 'Router Alert' };

function parseOptions(bytes) {
  const list = [];
  let i = 0;
  while (i < bytes.length) {
    const type = bytes[i];
    const name = OPTION_NAMES[type] ?? `unbekannt (${type})`;
    const meta = `copied=${type >> 7}, Klasse=${(type >> 5) & 3}, Nummer=${type & 31}`;
    if (type === 0) {
      list.push({ offset: i, type, name, length: 1, meta, data: [] });
      if (bytes.slice(i + 1).some((b) => b !== 0)) list.push({ offset: i + 1, type: null, name: 'Daten nach End of Option List (sollten 0 sein)', length: bytes.length - i - 1, meta: '', data: bytes.slice(i + 1), problem: true });
      break;
    }
    if (type === 1) {
      list.push({ offset: i, type, name, length: 1, meta, data: [] });
      i += 1;
      continue;
    }
    const len = bytes[i + 1];
    if (len === undefined || len < 2 || i + len > bytes.length) {
      list.push({ offset: i, type, name, length: bytes.length - i, meta, data: bytes.slice(i + 2), problem: true, note: 'Optionslänge ungültig oder über das Headerende hinaus' });
      break;
    }
    list.push({ offset: i, type, name, length: len, meta, data: bytes.slice(i + 2, i + len) });
    i += len;
  }
  return list;
}

const hex = (n, digits) => `0x${n.toString(16).padStart(digits, '0')}`;

/**
 * Dekodiert einen IPv4-Header.
 * Ergebnis: { ok, errors[], warnings[], fields[], checksum, options, headerLength, bytes }
 * Bei weniger als 20 Byte nur Fehler.
 */
export function decodeIPv4Header(bytes) {
  const errors = [];
  const warnings = [];
  const infos = [];
  if (bytes.length < 20) {
    errors.push(`Zu kurz: ${bytes.length} Byte. Ein IPv4-Header hat mindestens 20 Byte (IHL = 5).`);
    return { ok: false, errors, warnings, infos, fields: [], bytes };
  }
  const version = bytes[0] >> 4;
  const ihl = bytes[0] & 0xf;
  const dscp = bytes[1] >> 2;
  const ecn = bytes[1] & 3;
  const totalLength = (bytes[2] << 8) | bytes[3];
  const identification = (bytes[4] << 8) | bytes[5];
  const flagsBits = bytes[6] >> 5;
  const reserved = (flagsBits >> 2) & 1;
  const df = (flagsBits >> 1) & 1;
  const mf = flagsBits & 1;
  const fragmentOffset = ((bytes[6] & 0x1f) << 8) | bytes[7];
  const ttl = bytes[8];
  const protocol = bytes[9];
  const checksumField = (bytes[10] << 8) | bytes[11];
  const src = ((bytes[12] << 24) | (bytes[13] << 16) | (bytes[14] << 8) | bytes[15]) >>> 0;
  const dst = ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0;
  const headerLength = ihl * 4;

  if (version !== 4) errors.push(`Version ist ${version}, erwartet 4 – das ist kein IPv4-Header${version === 6 ? ' (6 wäre IPv6 mit ganz anderem Aufbau)' : ''}.`);
  if (ihl < 5) errors.push(`IHL = ${ihl} ist ungültig: Der Header muss mindestens 5 × 4 = 20 Byte lang sein.`);
  if (ihl >= 5 && headerLength > bytes.length) errors.push(`IHL = ${ihl} bedeutet ${headerLength} Byte Header, eingegeben sind aber nur ${bytes.length} Byte – Optionen fehlen.`);
  if (ihl >= 5 && totalLength < headerLength) errors.push(`Gesamtlänge ${totalLength} Byte ist kleiner als die Headerlänge ${headerLength} Byte.`);
  if (reserved) warnings.push('Das reservierte Flag-Bit ist gesetzt – es muss 0 sein.');
  if (df && mf) warnings.push('DF und MF sind beide gesetzt – ungewöhnlich (ein nicht fragmentierbares Paket sollte kein Fragment sein).');
  if (ttl === 0) warnings.push('TTL = 0: Ein Router würde dieses Paket verwerfen (ICMP Time Exceeded).');

  const headerAvailable = ihl >= 5 && headerLength <= bytes.length;
  const headerBytes = headerAvailable ? bytes.slice(0, headerLength) : bytes.slice(0, 20);
  const calc = internetChecksum(headerBytes, 10);
  const verify = internetChecksum(headerBytes);
  const checksum = {
    given: checksumField,
    computed: calc.checksum,
    valid: verify.sum === 0xffff,
    calc,
    coversOptions: headerAvailable && headerLength > 20,
    partial: !headerAvailable
  };
  if (!checksum.valid) warnings.push(`Prüfsumme stimmt nicht: im Header ${hex(checksumField, 4)}, richtig wäre ${hex(calc.checksum, 4)}.`);
  if (headerAvailable && bytes.length > headerLength) infos.push(`Nach dem Header folgen ${bytes.length - headerLength} weitere Byte – sie werden als Nutzdaten betrachtet und nicht dekodiert.`);
  if (headerAvailable && totalLength > bytes.length) {
    infos.push(`Gesamtlänge ${totalLength} Byte > eingegebene ${bytes.length} Byte: Die Nutzdaten (${totalLength - headerLength} Byte) sind nicht enthalten – für die Headerprüfung genügt das.`);
  }
  if (headerAvailable && totalLength < bytes.length && totalLength >= headerLength) warnings.push(`Eingabe ist länger als die Gesamtlänge ${totalLength} Byte.`);
  const options = headerAvailable && headerLength > 20 ? parseOptions(bytes.slice(20, headerLength)) : [];

  const fields = [
    { key: 'version', name: 'Version', bits: 4, offset: 0, raw: version, value: String(version), detail: version === 4 ? 'IPv4' : 'ungültig' },
    { key: 'ihl', name: 'IHL', bits: 4, offset: 4, raw: ihl, value: String(ihl), detail: `${ihl} × 32-Bit-Worte = ${headerLength} Byte` },
    { key: 'dscp', name: 'DSCP', bits: 6, offset: 8, raw: dscp, value: String(dscp), detail: dscpName(dscp) },
    { key: 'ecn', name: 'ECN', bits: 2, offset: 14, raw: ecn, value: ecn.toString(2).padStart(2, '0'), detail: ECN_NAMES[ecn] },
    { key: 'totalLength', name: 'Gesamtlänge', bits: 16, offset: 16, raw: totalLength, value: String(totalLength), detail: `${totalLength} Byte (Header + Nutzdaten), Nutzdaten ${Math.max(0, totalLength - headerLength)} Byte` },
    { key: 'identification', name: 'Identification', bits: 16, offset: 32, raw: identification, value: hex(identification, 4), detail: `${identification} – ordnet Fragmente einem Datagramm zu` },
    { key: 'flags', name: 'Flags', bits: 3, offset: 48, raw: flagsBits, value: flagsBits.toString(2).padStart(3, '0'), detail: `reserviert=${reserved}, DF=${df}${df ? ' (nicht fragmentieren)' : ''}, MF=${mf}${mf ? ' (weitere Fragmente folgen)' : ''}` },
    { key: 'fragmentOffset', name: 'Fragment Offset', bits: 13, offset: 51, raw: fragmentOffset, value: String(fragmentOffset), detail: `${fragmentOffset} × 8 = ${fragmentOffset * 8} Byte${fragmentOffset === 0 && !mf ? ' (nicht fragmentiert)' : ''}` },
    { key: 'ttl', name: 'TTL', bits: 8, offset: 64, raw: ttl, value: String(ttl), detail: 'Router verringern den Wert um 1; bei 0 wird verworfen' },
    { key: 'protocol', name: 'Protocol', bits: 8, offset: 72, raw: protocol, value: String(protocol), detail: PROTOCOLS[protocol] ?? 'anderes/unbekanntes Protokoll' },
    { key: 'checksum', name: 'Header Checksum', bits: 16, offset: 80, raw: checksumField, value: hex(checksumField, 4), detail: checksum.valid ? 'gültig' : `ungültig – richtig: ${hex(calc.checksum, 4)}` },
    { key: 'src', name: 'Quelladresse', bits: 32, offset: 96, raw: src, value: formatIPv4(src), detail: hex(src, 8) },
    { key: 'dst', name: 'Zieladresse', bits: 32, offset: 128, raw: dst, value: formatIPv4(dst), detail: hex(dst, 8) }
  ];
  if (options.length) {
    fields.push({ key: 'options', name: 'Optionen', bits: (headerLength - 20) * 8, offset: 160, raw: null, value: `${headerLength - 20} Byte`, detail: options.map((o) => o.name).join(', ') });
  }
  return { ok: errors.length === 0, errors, warnings, infos, fields, checksum, options, headerLength, headerAvailable, bytes };
}

/** Bytes als Hex mit Leerzeichen zwischen 16-Bit-Worten. */
export function formatHexWords(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length; i += 2) out.push(bytes.slice(i, i + 2).map((b) => b.toString(16).padStart(2, '0')).join(''));
  return out.join(' ');
}

/** Setzt die richtige Prüfsumme in eine Kopie der Bytes. */
export function withCorrectChecksum(bytes) {
  const copy = bytes.slice();
  const ihl = (copy[0] & 0xf) * 4;
  const len = ihl >= 20 && ihl <= copy.length ? ihl : 20;
  const { checksum } = internetChecksum(copy.slice(0, len), 10);
  copy[10] = checksum >> 8;
  copy[11] = checksum & 0xff;
  return copy;
}

export const HEADER_EXAMPLES = [
  { label: 'UDP, gültige Prüfsumme', hex: '4500 0073 0000 4000 4011 b861 c0a8 0001 c0a8 00c7' },
  { label: 'IGMP mit Router-Alert-Option', hex: '4600 0020 1c46 0000 0102 667a c000 0201 e000 0016 9404 0000' },
  { label: 'falsche Prüfsumme', hex: '4500 003c 1c46 4000 4006 0000 c000 0201 c633 6407' },
  { label: 'zu kurz', hex: '4500 0014 0000 4000 4011' }
];
