/**
 * IPv6: Validierung, Kompression nach RFC 5952, Präfixe, Adresstypen, Subnetze.
 * Adressen sind BigInt-Werte zwischen 0 und 2^128 − 1. Reine Logik ohne DOM.
 */
import { InputError } from './num.js';
import { parseIPv4, formatIPv4 } from './net-ipv4.js';

export const MAX128 = (1n << 128n) - 1n;

/**
 * Liest eine IPv6-Adresse. Erlaubt „::“-Kürzung, eingebettetes IPv4 am Ende
 * (::ffff:192.0.2.1) und einen Zonen-Index (%eth0), der abgetrennt wird.
 * Ergebnis: { value, zone, embeddedIPv4, input }
 */
export function parseIPv6(text, label = 'IPv6-Adresse') {
  let raw = String(text ?? '').trim();
  if (!raw) throw new InputError(`${label}: Bitte eine IPv6-Adresse eingeben (z. B. 2001:db8::1).`);
  if (raw.length > 100) throw new InputError(`${label}: Eingabe ist zu lang für eine IPv6-Adresse.`);
  if (raw.startsWith('[') && raw.endsWith(']')) raw = raw.slice(1, -1);
  let zone = '';
  const percent = raw.indexOf('%');
  if (percent >= 0) {
    zone = raw.slice(percent + 1);
    raw = raw.slice(0, percent);
    if (!zone) throw new InputError(`${label}: Nach „%“ fehlt der Zonen-Index (z. B. %eth0).`);
    if (!/^[A-Za-z0-9._~-]{1,32}$/.test(zone)) throw new InputError(`${label}: Zonen-Index „${zone}“ enthält ungültige Zeichen.`);
  }
  if (raw.includes('/')) throw new InputError(`${label}: Die Präfixlänge bitte separat angeben oder als „Adresse/Präfix“ im Präfixfeld.`);
  if (!/^[0-9A-Fa-f:.]+$/.test(raw)) {
    const bad = raw.match(/[^0-9A-Fa-f:.]/)[0];
    throw new InputError(`${label}: Ungültiges Zeichen „${bad}“ – erlaubt sind Hexziffern 0–9, a–f, Doppelpunkte und (am Ende) eine IPv4-Adresse.`);
  }
  if (raw.includes(':::')) throw new InputError(`${label}: „:::“ ist nicht erlaubt.`);
  const doubles = raw.split('::').length - 1;
  if (doubles > 1) throw new InputError(`${label}: „::“ darf nur einmal vorkommen – sonst wäre nicht eindeutig, wie viele Nullgruppen wo fehlen.`);
  if (!raw.includes(':')) throw new InputError(`${label}: „${raw}“ enthält keinen Doppelpunkt und ist daher keine IPv6-Adresse.`);

  const [headText, tailText] = doubles ? raw.split('::') : [raw, null];
  const splitGroups = (part) => (part === '' ? [] : part.split(':'));
  const head = splitGroups(headText);
  const tail = tailText === null ? [] : splitGroups(tailText);

  let embeddedIPv4 = false;
  const words = [];
  const toWords = (groups, isLastPart) =>
    groups.flatMap((g, i) => {
      if (g === '') throw new InputError(`${label}: Leere Gruppe – ein einzelner Doppelpunkt am Anfang/Ende oder „::“ falsch geschrieben?`);
      if (g.includes('.')) {
        if (!(isLastPart && i === groups.length - 1)) throw new InputError(`${label}: Eine eingebettete IPv4-Adresse ist nur in den letzten 32 Bit erlaubt.`);
        const v4 = parseIPv4(g, `${label} (eingebettetes IPv4)`);
        embeddedIPv4 = true;
        return [v4 >>> 16, v4 & 0xffff];
      }
      if (!/^[0-9A-Fa-f]+$/.test(g)) throw new InputError(`${label}: Gruppe „${g}“ ist keine Hexzahl.`);
      if (g.length > 4) throw new InputError(`${label}: Gruppe „${g}“ hat mehr als 4 Hexziffern (höchstens 16 Bit pro Gruppe).`);
      return [parseInt(g, 16)];
    });
  const headWords = toWords(head, tailText === null);
  const tailWords = toWords(tail, true);
  const count = headWords.length + tailWords.length;
  if (doubles) {
    if (count > 7) throw new InputError(`${label}: Mit „::“ dürfen höchstens 7 Gruppen angegeben werden (gefunden: ${count}).`);
    words.push(...headWords, ...Array(8 - count).fill(0), ...tailWords);
  } else {
    if (count < 8) throw new InputError(`${label}: Zu wenige Gruppen (${count} von 8) und kein „::“ zum Auffüllen.`);
    if (count > 8) throw new InputError(`${label}: Zu viele Gruppen (${count}) – eine IPv6-Adresse hat genau 8 Gruppen à 16 Bit.`);
    words.push(...headWords);
  }
  let value = 0n;
  for (const w of words) value = (value << 16n) | BigInt(w);
  return { value, zone, embeddedIPv4, input: String(text).trim() };
}

export function isIPv6(text) {
  try {
    parseIPv6(text);
    return true;
  } catch {
    return false;
  }
}

export function toWords(value) {
  const words = [];
  for (let i = 7; i >= 0; i -= 1) words.push(Number((value >> BigInt(i * 16)) & 0xffffn));
  return words;
}

/** Vollständige Schreibweise: 8 Gruppen à 4 Hexziffern. */
export function expandIPv6(value) {
  return toWords(value)
    .map((w) => w.toString(16).padStart(4, '0'))
    .join(':');
}

/** Längste Folge von Nullgruppen (≥ 2), bei Gleichstand die erste. */
export function longestZeroRun(words) {
  let best = { start: -1, len: 0 };
  let i = 0;
  while (i < words.length) {
    if (words[i] === 0) {
      let j = i;
      while (j < words.length && words[j] === 0) j += 1;
      if (j - i > best.len) best = { start: i, len: j - i };
      i = j;
    } else i += 1;
  }
  return best.len >= 2 ? best : { start: -1, len: 0 };
}

/** Kanonische Kurzform nach RFC 5952 (Kleinbuchstaben, keine führenden Nullen, „::“ für die längste Nullfolge ≥ 2). */
export function compressIPv6(value) {
  const words = toWords(value);
  const hex = words.map((w) => w.toString(16));
  const run = longestZeroRun(words);
  if (run.start < 0) return hex.join(':');
  const left = hex.slice(0, run.start).join(':');
  const right = hex.slice(run.start + run.len).join(':');
  return `${left}::${right}`;
}

/** Gemischte Schreibweise (letzte 32 Bit als IPv4), z. B. für IPv4-mapped. */
export function mixedIPv6(value) {
  const words = toWords(value).slice(0, 6);
  const run = longestZeroRun(words);
  const hex = words.map((w) => w.toString(16));
  let prefix;
  if (run.start < 0) prefix = `${hex.join(':')}:`;
  else {
    const left = hex.slice(0, run.start).join(':');
    const right = hex.slice(run.start + run.len).join(':');
    prefix = `${left}::${right}${right ? ':' : ''}`;
  }
  return `${prefix}${formatIPv4(Number(value & 0xffffffffn))}`;
}

export function prefixMask128(prefix) {
  if (prefix === 0) return 0n;
  return (MAX128 >> BigInt(128 - prefix)) << BigInt(128 - prefix);
}

export function parsePrefix128(value, label = 'Präfixlänge') {
  const raw = String(value ?? '').trim().replace(/^\//, '');
  if (!/^\d{1,3}$/.test(raw)) throw new InputError(`${label}: Bitte eine ganze Zahl zwischen 0 und 128 eingeben.`);
  const p = Number(raw);
  if (p > 128) throw new InputError(`${label}: ${p} ist zu groß (höchstens /128).`);
  return p;
}

/** Netzwerkadresse, letzte Adresse, Anzahl. */
export function ipv6Range(value, prefix) {
  const mask = prefixMask128(prefix);
  const network = value & mask;
  const last = network | (MAX128 ^ mask);
  const hostBits = 128 - prefix;
  return { network, last, hostBits, count: 1n << BigInt(hostBits), hostBitsSet: (value & ~mask & MAX128) !== 0n };
}

/** 2^n als lesbarer Text mit Dezimalwert (gekürzt bei sehr großen Zahlen). */
export function powerOfTwoText(n) {
  const v = (1n << BigInt(n)).toString();
  const grouped = v.length > 4 ? v.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : v;
  return `2^${n} = ${grouped}`;
}

const range = (text, prefix) => ({ net: parseIPv6(text).value, prefix });

/** Bekannte Adressbereiche (spezifischere zuerst geprüft über die Präfixlänge). */
export const IPV6_TYPES = [
  { id: 'unspecified', ...range('::', 128), name: 'Unspezifizierte Adresse', desc: 'Platzhalter „keine Adresse“ (z. B. Quelladresse vor der Adresszuweisung). Darf nie Zieladresse sein.', scope: '–' },
  { id: 'loopback', ...range('::1', 128), name: 'Loopback', desc: 'Der eigene Rechner (entspricht 127.0.0.1 bei IPv4).', scope: 'Host' },
  { id: 'mapped', ...range('::ffff:0:0', 96), name: 'IPv4-mapped', desc: 'Darstellung einer IPv4-Adresse im IPv6-Adressraum (Dual-Stack-Sockets), RFC 4291.', scope: 'wie die IPv4-Adresse' },
  { id: 'compat', ...range('::', 96), name: 'IPv4-kompatibel (veraltet)', desc: 'Veraltete Form ::a.b.c.d (RFC 4291, abgekündigt).', scope: '–' },
  { id: 'nat64', ...range('64:ff9b::', 96), name: 'NAT64 (Well-Known Prefix)', desc: 'Übersetzung IPv6 → IPv4, RFC 6052; die letzten 32 Bit sind die IPv4-Adresse.', scope: 'global' },
  { id: 'discard', ...range('100::', 64), name: 'Discard-Only', desc: 'Pakete werden verworfen (Blackholing), RFC 6666.', scope: '–' },
  { id: 'teredo', ...range('2001::', 32), name: 'Teredo', desc: 'Tunnel IPv6 über UDP/IPv4 (RFC 4380). Enthält Server- und (invertiert) Client-IPv4.', scope: 'global' },
  { id: 'doc', ...range('2001:db8::', 32), name: 'Dokumentation', desc: 'Nur für Beispiele in Büchern/Dokumentation (RFC 3849) – wird nie geroutet.', scope: 'global (nicht geroutet)' },
  { id: 'doc2', ...range('3fff::', 20), name: 'Dokumentation', desc: 'Zweiter Dokumentationsbereich 3fff::/20 (RFC 9637).', scope: 'global (nicht geroutet)' },
  { id: '6to4', ...range('2002::', 16), name: '6to4', desc: 'Automatischer Tunnel (RFC 3056, veraltet); Bits 17–48 sind die öffentliche IPv4-Adresse.', scope: 'global' },
  { id: 'gua', ...range('2000::', 3), name: 'Global Unicast', desc: 'Weltweit eindeutige, öffentlich routbare Adressen (2000::/3).', scope: 'global' },
  { id: 'ula-l', ...range('fd00::', 8), name: 'Unique Local (lokal vergeben, fd00::/8)', desc: 'Private Adressen (RFC 4193) mit zufälliger 40-Bit-Global-ID; nicht im Internet geroutet.', scope: 'global (privat)' },
  { id: 'ula', ...range('fc00::', 7), name: 'Unique Local (fc00::/7)', desc: 'Private Adressen (RFC 4193). Die Hälfte fc00::/8 (L-Bit = 0) ist bisher nicht definiert.', scope: 'global (privat)' },
  { id: 'sitelocal', ...range('fec0::', 10), name: 'Site-Local (veraltet)', desc: 'Abgekündigt durch RFC 3879, ersetzt durch Unique Local.', scope: 'Site' },
  { id: 'linklocal', ...range('fe80::', 10), name: 'Link-Local', desc: 'Nur im eigenen Link gültig, wird automatisch gebildet; Router leiten sie nicht weiter. Bei mehreren Interfaces Zonen-Index (%eth0) nötig.', scope: 'Link' },
  { id: 'multicast', ...range('ff00::', 8), name: 'Multicast', desc: 'Eine Adresse für eine Gruppe von Empfängern. IPv6 kennt keinen Broadcast.', scope: 'siehe Scope-Feld' }
];

export const MULTICAST_SCOPES = {
  0: 'reserviert',
  1: 'Interface-Local',
  2: 'Link-Local',
  3: 'Realm-Local',
  4: 'Admin-Local',
  5: 'Site-Local',
  8: 'Organization-Local',
  14: 'Global',
  15: 'reserviert'
};

const WELL_KNOWN_MULTICAST = [
  ['ff02::1', 'Alle Knoten im Link (All Nodes)'],
  ['ff02::2', 'Alle Router im Link (All Routers)'],
  ['ff02::5', 'OSPFv3-Router'],
  ['ff02::6', 'OSPFv3 Designated Router'],
  ['ff02::9', 'RIPng-Router'],
  ['ff02::a', 'EIGRP-Router'],
  ['ff02::d', 'PIM-Router'],
  ['ff02::16', 'MLDv2-fähige Router'],
  ['ff02::fb', 'mDNS'],
  ['ff02::1:2', 'DHCPv6-Server und -Relays im Link'],
  ['ff05::1:3', 'DHCPv6-Server (Site)'],
  ['ff01::1', 'Alle Knoten (Interface-Local)'],
  ['ff05::2', 'Alle Router (Site)'],
  ['ff0e::101', 'NTP (global)']
].map(([a, n]) => [parseIPv6(a).value, n]);

const inRange = (value, t) => (value & prefixMask128(t.prefix)) === t.net;

/**
 * Adresstyp(en) bestimmen. Ergebnis: { primary, all, details[] }
 * `all` ist nach Spezifität sortiert (längstes passendes Präfix zuerst).
 */
export function classifyIPv6(value) {
  let all = IPV6_TYPES.filter((t) => inRange(value, t));
  // ::/96 nur, wenn es nicht :: oder ::1 ist
  if (value === 0n || value === 1n) all = all.filter((t) => t.id !== 'compat');
  all.sort((a, b) => b.prefix - a.prefix);
  const details = [];
  const primary = all[0] ?? { id: 'reserved', name: 'Reserviert / nicht zugewiesen', desc: 'Liegt außerhalb der derzeit zugewiesenen Bereiche (z. B. Global Unicast 2000::/3).', scope: '–', net: 0n, prefix: 0 };
  if (primary.id === 'multicast') {
    const flags = Number((value >> 116n) & 0xfn);
    const scope = Number((value >> 112n) & 0xfn);
    details.push({ label: 'Multicast-Scope', value: `${scope.toString(16)} = ${MULTICAST_SCOPES[scope] ?? 'nicht zugewiesen'}` });
    const f = [];
    if (flags & 1) f.push('T = 1: temporär/dynamisch vergeben');
    else f.push('T = 0: fest zugewiesen (well-known)');
    if (flags & 2) f.push('P = 1: präfixbasiert (RFC 3306)');
    if (flags & 4) f.push('R = 1: Rendezvous-Point eingebettet (RFC 3956)');
    details.push({ label: 'Multicast-Flags', value: `${flags.toString(16)} (${f.join('; ')})` });
    const known = WELL_KNOWN_MULTICAST.find(([v]) => v === value);
    if (known) details.push({ label: 'Bekannte Gruppe', value: known[1] });
    const snBase = parseIPv6('ff02::1:ff00:0').value;
    if ((value & prefixMask128(104)) === snBase) {
      details.push({ label: 'Solicited-Node', value: `Für Adressen, die auf …${(value & 0xffffffn).toString(16).padStart(6, '0')} enden (Neighbor Discovery, ersetzt ARP)` });
    }
  }
  if (primary.id === 'mapped' || primary.id === 'nat64' || primary.id === 'compat') {
    details.push({ label: 'Eingebettete IPv4', value: formatIPv4(Number(value & 0xffffffffn)) });
  }
  if (primary.id === '6to4') {
    details.push({ label: 'IPv4 des 6to4-Routers', value: formatIPv4(Number((value >> 80n) & 0xffffffffn)) });
  }
  if (primary.id === 'teredo') {
    details.push({ label: 'Teredo-Server (IPv4)', value: formatIPv4(Number((value >> 64n) & 0xffffffffn)) });
    details.push({ label: 'Client-IPv4 (entschlüsselt)', value: formatIPv4(Number(~value & 0xffffffffn)) });
    details.push({ label: 'Client-Port (entschlüsselt)', value: String(Number(~(value >> 32n) & 0xffffn)) });
  }
  if (primary.id === 'linklocal' && (value & prefixMask128(64)) !== parseIPv6('fe80::').value) {
    details.push({ label: 'Hinweis', value: 'Link-Local-Adressen sollen die Form fe80::/64 haben (Bits 11–64 null).' });
  }
  return { primary, all, details };
}

/** Interface-ID (untere 64 Bit) und Hinweis auf EUI-64 (ff:fe in der Mitte). */
export function interfaceId(value) {
  const iid = value & ((1n << 64n) - 1n);
  const words = toWords(iid).slice(4);
  const text = words.map((w) => w.toString(16).padStart(4, '0')).join(':');
  const eui64 = ((iid >> 24n) & 0xffffn) === 0xfffen;
  let mac = null;
  if (eui64) {
    const bytes = [];
    for (let i = 7; i >= 0; i -= 1) bytes.push(Number((iid >> BigInt(i * 8)) & 0xffn));
    const m = [bytes[0] ^ 0x02, bytes[1], bytes[2], bytes[5], bytes[6], bytes[7]];
    mac = m.map((b) => b.toString(16).padStart(2, '0')).join(':');
  }
  return { iid, text, eui64, mac };
}

/**
 * Teilt value/n in Subnetze der Länge m. Liefert Anzahl, die ersten `limit`
 * Subnetze, das letzte Subnetz und Erklärungen zu Bits und Hex-Grenzen.
 */
export function splitIPv6(value, n, m, limit = 16) {
  if (m < n) throw new InputError(`Neue Präfixlänge /${m} muss größer oder gleich /${n} sein – aufteilen heißt längeres Präfix.`);
  if (m > 128) throw new InputError('Neue Präfixlänge höchstens /128.');
  const subnetBits = m - n;
  const base = value & prefixMask128(n);
  const count = 1n << BigInt(subnetBits);
  const step = 1n << BigInt(128 - m);
  const shown = BigInt(Math.max(0, Math.min(limit, 256)));
  const list = [];
  for (let i = 0n; i < count && i < shown; i += 1n) {
    const net = base + i * step;
    list.push({ index: i, network: net, last: net + step - 1n });
  }
  const lastNet = base + (count - 1n) * step;
  const explain = [];
  explain.push(`Subnetzbits: ${m} − ${n} = ${subnetBits} → ${powerOfTwoText(subnetBits)} Subnetze.`);
  explain.push(`Jedes /${m}-Subnetz enthält ${powerOfTwoText(128 - m)} Adressen.`);
  if (subnetBits > 0) {
    explain.push(`Die Subnetz-ID belegt die Bits ${n + 1} bis ${m} (von links gezählt, 1-basiert).`);
    const firstNibble = Math.floor(n / 4);
    const lastNibble = Math.ceil(m / 4) - 1;
    const nibbleNote = n % 4 === 0 && m % 4 === 0
      ? `Beide Grenzen liegen auf Hex-Ziffern-Grenzen (Vielfache von 4): Die Subnetz-ID sind genau die Hexziffern ${firstNibble + 1} bis ${lastNibble + 1} der ausgeschriebenen Adresse (${subnetBits / 4} Hexziffer${subnetBits === 4 ? '' : 'n'}).`
      : `Mindestens eine Grenze liegt mitten in einer Hexziffer (nicht durch 4 teilbar) – dort ändert sich die Hexziffer in Schritten, nicht ziffernweise. Daher lieber Präfixe auf 4-Bit-Grenzen planen (z. B. /48, /52, /56, /60, /64).`;
    explain.push(nibbleNote);
    const group = Math.floor((m - 1) / 16);
    const inc = 1 << ((group + 1) * 16 - m);
    explain.push(`Schrittweite: Das niederwertigste Subnetzbit liegt in Gruppe ${group + 1}; dort wächst die Gruppe pro Subnetz um 0x${inc.toString(16)} (= ${inc}).`);
  }
  return { base, n, m, count, step, list, lastNet, lastLast: lastNet + step - 1n, truncated: count > shown, explain };
}

/** Binärdarstellung einer Gruppe (für Bitgrenzen-Anzeige). */
export function binaryGroups(value) {
  return toWords(value).map((w) => w.toString(2).padStart(16, '0'));
}

/** Liest „Adresse“ oder „Adresse/Präfix“; Präfix aus separatem Feld, falls nicht in der Adresse. */
export function parseIPv6WithPrefix(addrText, prefixText) {
  const raw = String(addrText ?? '').trim();
  const slash = raw.indexOf('/');
  let address = raw;
  let p = prefixText;
  if (slash >= 0) {
    address = raw.slice(0, slash);
    p = raw.slice(slash + 1);
  }
  const parsed = parseIPv6(address);
  const prefix = parsePrefix128(p);
  return { ...parsed, prefix };
}
