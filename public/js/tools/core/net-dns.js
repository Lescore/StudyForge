/**
 * DNS-Auflösung als Simulation: Client → rekursiver Resolver → Root → TLD →
 * autoritativer Nameserver, mit Resolver-Cache, TTL und simulierter Uhr.
 * Es werden KEINE echten DNS-Anfragen gestellt. Reine Logik ohne DOM.
 */
import { InputError } from './num.js';
import { parseIPv4 } from './net-ipv4.js';
import { parseIPv6, compressIPv6 } from './net-ipv6.js';

export const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX'];
export const ZONES = ['example.com', 'example.org', 'example.net'];

/** Rollen/Server (Namen und IPs sind Beispielwerte aus Dokumentationsbereichen). */
export const ACTORS = {
  client: { label: 'Client', sub: 'Stub-Resolver' },
  resolver: { label: 'Resolver', sub: 'rekursiv, mit Cache' },
  root: { label: 'Root-Server', sub: 'Zone „.“' },
  tld: { label: 'TLD-Server', sub: '.com / .org / .net' },
  auth: { label: 'Autoritativ', sub: 'ns1.example.…' }
};

const REFERRAL_TTL = 172800; // 2 Tage – üblicher Wert für Delegationen
const NEGATIVE_TTL = 300; // SOA-Minimum der Beispielzonen (RFC 2308)

const r = (name, type, value, ttl) => ({ name, type, value, ttl, builtin: true });

export function defaultRecords() {
  return [
    r('example.com', 'A', '192.0.2.10', 3600),
    r('example.com', 'AAAA', '2001:db8::10', 3600),
    r('example.com', 'MX', '10 mail.example.com', 3600),
    r('www.example.com', 'CNAME', 'example.com', 300),
    r('mail.example.com', 'A', '192.0.2.25', 3600),
    r('shop.example.com', 'CNAME', 'shop.example.net', 600),
    r('example.net', 'A', '198.51.100.20', 3600),
    r('example.net', 'MX', '20 mx.example.net', 3600),
    r('mx.example.net', 'A', '198.51.100.25', 3600),
    r('shop.example.net', 'CNAME', 'edge.example.org', 120),
    r('example.org', 'A', '198.51.100.7', 3600),
    r('www.example.org', 'A', '198.51.100.8', 60),
    r('edge.example.org', 'A', '203.0.113.50', 60),
    r('edge.example.org', 'AAAA', '2001:db8:0:3::50', 60)
  ];
}

/** Domainnamen normalisieren und prüfen (Kleinbuchstaben, ohne abschließenden Punkt). */
export function normalizeName(text, label = 'Name') {
  const raw = String(text ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!raw) throw new InputError(`${label}: Bitte einen Domainnamen eingeben (z. B. www.example.com).`);
  if (raw.length > 253) throw new InputError(`${label}: Höchstens 253 Zeichen.`);
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(raw) || raw.includes('/')) throw new InputError(`${label}: Bitte nur den Hostnamen eingeben, ohne Protokoll und Pfad.`);
  const labels = raw.split('.');
  for (const l of labels) {
    if (!l) throw new InputError(`${label}: Leeres Label (zwei Punkte hintereinander?).`);
    if (l.length > 63) throw new InputError(`${label}: Label „${l.slice(0, 20)}…“ ist länger als 63 Zeichen.`);
    if (!/^[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?$/.test(l)) throw new InputError(`${label}: „${l}“ ist kein gültiges Label (Buchstaben, Ziffern, Bindestrich; nicht am Anfang/Ende).`);
  }
  return raw;
}

export function zoneOf(name) {
  return ZONES.find((z) => name === z || name.endsWith(`.${z}`)) ?? null;
}

export function tldOf(name) {
  return name.split('.').pop();
}

/** Prüft einen vom Nutzer ergänzten Record. */
export function validateRecord(input, records) {
  const name = normalizeName(input.name, 'Name');
  const zone = zoneOf(name);
  if (!zone) throw new InputError(`Name: Eigene Einträge nur in den Beispielzonen (${ZONES.join(', ')}), z. B. test.example.com.`);
  const type = String(input.type ?? '').toUpperCase();
  if (!RECORD_TYPES.includes(type)) throw new InputError('Typ: A, AAAA, CNAME oder MX.');
  const ttlText = String(input.ttl ?? '').trim();
  if (!/^\d{1,7}$/.test(ttlText)) throw new InputError('TTL: Bitte eine ganze Zahl in Sekunden (0 bis 9 999 999).');
  const ttl = Number(ttlText);
  let value = String(input.value ?? '').trim();
  if (type === 'A') parseIPv4(value, 'Wert (IPv4)');
  else if (type === 'AAAA') value = compressIPv6(parseIPv6(value, 'Wert (IPv6)').value);
  else if (type === 'CNAME') {
    value = normalizeName(value, 'Ziel des CNAME');
    if (value === name) throw new InputError('Ein CNAME darf nicht auf sich selbst zeigen.');
  } else if (type === 'MX') {
    const m = /^(\d{1,5})\s+(\S+)$/.exec(value);
    if (!m || Number(m[1]) > 65535) throw new InputError('Wert (MX): Form „Priorität Mailserver“, z. B. „10 mail.example.com“.');
    value = `${Number(m[1])} ${normalizeName(m[2], 'Mailserver')}`;
  }
  const same = records.filter((x) => x.name === name);
  if (type === 'CNAME' && same.length) throw new InputError(`Zu ${name} gibt es schon Einträge – ein CNAME darf nicht neben anderen Records stehen (RFC 1034).`);
  if (type !== 'CNAME' && same.some((x) => x.type === 'CNAME')) throw new InputError(`${name} ist bereits ein CNAME – daneben sind keine weiteren Records erlaubt.`);
  if (same.some((x) => x.type === type && x.value === value)) throw new InputError('Diesen Eintrag gibt es bereits.');
  if (name === zone && type === 'CNAME') throw new InputError('Am Zonen-Apex (z. B. example.com) ist kein CNAME erlaubt.');
  return { name, type, value, ttl, builtin: false };
}

/** Neuer Resolver-Zustand. */
export function createResolverState() {
  return { now: 0, cache: new Map() };
}

export function advanceClock(state, seconds) {
  state.now += seconds;
  purgeCache(state);
}

export function purgeCache(state) {
  for (const [key, entry] of state.cache) if (entry.expires <= state.now) state.cache.delete(key);
}

export function flushCache(state) {
  state.cache.clear();
}

function cacheGet(state, name, type) {
  const entry = state.cache.get(`${name}|${type}`);
  if (!entry) return null;
  if (entry.expires <= state.now) {
    state.cache.delete(`${name}|${type}`);
    return null;
  }
  return entry;
}

function cachePut(state, name, type, data, ttl, kind = 'answer') {
  if (ttl <= 0) return;
  state.cache.set(`${name}|${type}`, { name, type, data, kind, ttl, stored: state.now, expires: state.now + ttl });
}

/** Cache als Liste für die Anzeige, mit Rest-TTL. */
export function cacheEntries(state) {
  purgeCache(state);
  return [...state.cache.values()]
    .map((e) => ({ ...e, remaining: e.expires - state.now }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.type.localeCompare(b.type));
}

const fmtRecords = (list) => list.map((x) => `${x.name} ${x.ttl} ${x.type} ${x.value}`);

/**
 * Löst `name`/`type` auf und liefert die Schrittfolge.
 * Schritt: { from, to, title, detail, lines[], cache: 'hit'|'miss'|null }
 * Ergebnis: { steps, rcode: 'NOERROR'|'NXDOMAIN'|'NODATA', answers[], chain[] }
 */
export function resolve(state, records, nameText, type) {
  const qname = normalizeName(nameText, 'Name');
  if (!RECORD_TYPES.includes(type)) throw new InputError('Typ: A, AAAA, CNAME oder MX.');
  purgeCache(state);
  const steps = [];
  const answers = [];
  const chain = [];
  steps.push({ from: 'client', to: 'resolver', title: `Anfrage: ${qname} ${type}?`, detail: 'Der Client (Stub-Resolver im Betriebssystem) fragt seinen konfigurierten rekursiven Resolver – mit gesetztem RD-Bit („Recursion Desired“).' });

  let current = qname;
  let rcode = 'NOERROR';
  const visited = new Set([qname]);
  const loop = (target) => {
    if (!visited.has(target)) {
      visited.add(target);
      return false;
    }
    steps.push({ from: 'resolver', to: 'resolver', title: 'CNAME-Schleife erkannt', detail: `Die Kette führt zurück zu ${target}. Der Resolver bricht ab (SERVFAIL).` });
    rcode = 'SERVFAIL';
    return true;
  };
  for (let hop = 0; hop < 8; hop += 1) {
    // 1. Cache: fertige Antwort, CNAME oder negativer Eintrag?
    const neg = cacheGet(state, current, '*NX');
    if (neg) {
      steps.push({ from: 'resolver', to: 'resolver', cache: 'hit', title: `Cache-Treffer (negativ): ${current} existiert nicht`, detail: `Der Resolver hat sich das NXDOMAIN gemerkt (negatives Caching, RFC 2308). Rest-TTL ${neg.expires - state.now} s.` });
      rcode = 'NXDOMAIN';
      break;
    }
    const hit = cacheGet(state, current, type);
    if (hit) {
      const rest = hit.expires - state.now;
      if (hit.kind === 'nodata') {
        steps.push({ from: 'resolver', to: 'resolver', cache: 'hit', title: `Cache-Treffer (NODATA): ${current} hat keinen ${type}-Eintrag`, detail: `Rest-TTL ${rest} s.` });
        rcode = 'NODATA';
        break;
      }
      const list = hit.data.map((x) => ({ ...x, ttl: rest }));
      answers.push(...list);
      steps.push({ from: 'resolver', to: 'resolver', cache: 'hit', title: `Cache-Treffer: ${current} ${type}`, detail: `Der Eintrag liegt seit ${state.now - hit.stored} s im Cache; Rest-TTL ${rest} s. Keine Anfrage an andere Server nötig.`, lines: fmtRecords(list) });
      break;
    }
    const cname = type !== 'CNAME' ? cacheGet(state, current, 'CNAME') : null;
    if (cname) {
      const rest = cname.expires - state.now;
      const rec = { ...cname.data[0], ttl: rest };
      answers.push(rec);
      chain.push(rec);
      steps.push({ from: 'resolver', to: 'resolver', cache: 'hit', title: `Cache-Treffer: ${current} ist CNAME → ${rec.value}`, detail: `Rest-TTL ${rest} s. Der Resolver folgt dem Alias.`, lines: fmtRecords([rec]) });
      if (loop(rec.value)) break;
      current = rec.value;
      continue;
    }

    // 2. Iterativ: Root → TLD → autoritativ (bekannte Delegationen aus dem Cache überspringen)
    const tld = tldOf(current);
    const zone = zoneOf(current);
    steps.push({ from: 'resolver', to: 'resolver', cache: 'miss', title: `Cache: kein Eintrag für ${current} ${type}`, detail: 'Der Resolver muss die Antwort selbst iterativ beschaffen.' });
    const tldKnown = cacheGet(state, tld, 'NS');
    if (!tldKnown) {
      steps.push({ from: 'resolver', to: 'root', title: `Frage an Root: ${current} ${type}?`, detail: 'Der Resolver kennt die Root-Server-Adressen aus seiner fest eingebauten Liste (Root Hints).' });
      if (!['com', 'org', 'net'].includes(tld)) {
        steps.push({ from: 'root', to: 'resolver', title: `NXDOMAIN: TLD „.${tld}“ existiert nicht`, detail: 'In dieser Simulation gibt es nur .com, .org und .net. Die Root-Zone antwortet mit NXDOMAIN (autoritativ für „.“).' });
        cachePut(state, current, '*NX', [], NEGATIVE_TTL, 'negative');
        rcode = 'NXDOMAIN';
        break;
      }
      steps.push({ from: 'root', to: 'resolver', title: `Verweis (Referral) auf die .${tld}-Server`, detail: `Root kennt die Antwort nicht, aber die zuständigen TLD-Server. NS-Einträge + Glue-Adressen, TTL ${REFERRAL_TTL} s (2 Tage) – der Resolver speichert sie im Cache.`, lines: [`${tld}. ${REFERRAL_TTL} NS (Namen der .${tld}-Server)`] });
      cachePut(state, tld, 'NS', [{ name: tld, type: 'NS', value: `TLD-Server für .${tld}` }], REFERRAL_TTL, 'referral');
    } else {
      steps.push({ from: 'resolver', to: 'resolver', cache: 'hit', title: `Cache: .${tld}-Server bekannt`, detail: `Die Delegation an .${tld} steht noch im Cache (Rest-TTL ${tldKnown.expires - state.now} s) – Root wird übersprungen.` });
    }
    const zoneKnown = zone ? cacheGet(state, zone, 'NS') : null;
    if (!zoneKnown) {
      steps.push({ from: 'resolver', to: 'tld', title: `Frage an .${tld}-Server: ${current} ${type}?`, detail: 'Auch der TLD-Server antwortet nicht rekursiv.' });
      if (!zone) {
        steps.push({ from: 'tld', to: 'resolver', title: 'NXDOMAIN: Domain ist nicht delegiert', detail: `Unter .${tld} gibt es in dieser Simulation nur ${ZONES.filter((z) => z.endsWith(tld)).join(', ')}. Der TLD-Server antwortet NXDOMAIN.` });
        cachePut(state, current, '*NX', [], NEGATIVE_TTL, 'negative');
        rcode = 'NXDOMAIN';
        break;
      }
      steps.push({ from: 'tld', to: 'resolver', title: `Verweis auf ns1.${zone}`, detail: `Der TLD-Server delegiert ${zone} an dessen autoritative Nameserver (NS + Glue), TTL ${REFERRAL_TTL} s.`, lines: [`${zone}. ${REFERRAL_TTL} NS ns1.${zone}.`] });
      cachePut(state, zone, 'NS', [{ name: zone, type: 'NS', value: `ns1.${zone}` }], REFERRAL_TTL, 'referral');
    } else {
      steps.push({ from: 'resolver', to: 'resolver', cache: 'hit', title: `Cache: Nameserver von ${zone} bekannt`, detail: `Delegation im Cache (Rest-TTL ${zoneKnown.expires - state.now} s) – Root und TLD werden übersprungen.` });
    }
    steps.push({ from: 'resolver', to: 'auth', title: `Frage an ns1.${zone}: ${current} ${type}?`, detail: 'Der autoritative Server kennt die Zone selbst und antwortet verbindlich (AA-Bit).' });

    const exact = records.filter((x) => x.name === current && x.type === type);
    const alias = records.find((x) => x.name === current && x.type === 'CNAME');
    const exists = records.some((x) => x.name === current || x.name.endsWith(`.${current}`)) || current === zone;
    if (exact.length) {
      answers.push(...exact);
      cachePut(state, current, type, exact, Math.min(...exact.map((x) => x.ttl)));
      steps.push({ from: 'auth', to: 'resolver', title: `Antwort: ${exact.length} ${type}-Eintr${exact.length === 1 ? 'ag' : 'äge'}`, detail: `Der Resolver speichert die Antwort für die TTL im Cache${exact.some((x) => x.ttl === 0) ? ' (TTL 0: nicht gespeichert)' : ''}.`, lines: fmtRecords(exact) });
      break;
    }
    if (alias && type !== 'CNAME') {
      answers.push(alias);
      chain.push(alias);
      cachePut(state, current, 'CNAME', [alias], alias.ttl);
      steps.push({ from: 'auth', to: 'resolver', title: `Antwort: CNAME → ${alias.value}`, detail: `${current} ist ein Alias. Der Resolver muss den Zielnamen ${alias.value} weiter auflösen${zoneOf(alias.value) === zone ? ' (liegt in derselben Zone; echte Server liefern ihn oft gleich mit – hier zur Verdeutlichung als eigener Schritt)' : ' (andere Zone → neue Delegationskette)'}.`, lines: fmtRecords([alias]) });
      if (loop(alias.value)) break;
      current = alias.value;
      continue;
    }
    if (exists) {
      cachePut(state, current, type, [], NEGATIVE_TTL, 'nodata');
      steps.push({ from: 'auth', to: 'resolver', title: `NOERROR, aber keine Daten (NODATA)`, detail: `Der Name ${current} existiert, hat aber keinen ${type}-Eintrag. Die Antwort enthält den SOA-Record; negativ gecacht für ${NEGATIVE_TTL} s.` });
      rcode = 'NODATA';
      break;
    }
    cachePut(state, current, '*NX', [], NEGATIVE_TTL, 'negative');
    steps.push({ from: 'auth', to: 'resolver', title: `NXDOMAIN: ${current} existiert nicht`, detail: `Der autoritative Server bestätigt, dass es den Namen nicht gibt. Negatives Caching für ${NEGATIVE_TTL} s (SOA-Minimum).` });
    rcode = 'NXDOMAIN';
    break;
  }
  if (rcode === 'NOERROR' && !answers.some((x) => x.type === type)) {
    rcode = 'SERVFAIL';
    steps.push({ from: 'resolver', to: 'resolver', title: 'Abbruch', detail: 'Die CNAME-Kette ist zu lang (mehr als 8 Schritte).' });
  }
  const summary = rcode === 'NOERROR'
    ? `Antwort an den Client: ${answers.filter((x) => x.type === type).map((x) => x.value).join(', ')}`
    : rcode === 'NXDOMAIN' ? `NXDOMAIN an den Client: ${qname} existiert nicht` : rcode === 'NODATA' ? `Leere Antwort (NOERROR/NODATA) an den Client` : 'SERVFAIL an den Client';
  steps.push({ from: 'resolver', to: 'client', title: summary, detail: rcode === 'NOERROR' ? 'Der Resolver gibt die vollständige Antwort (inkl. CNAME-Kette) zurück. Die TTLs zeigen, wie lange der Client sie verwenden darf.' : 'Der Client erhält eine Fehlermeldung bzw. leere Antwort; Programme melden z. B. „Host nicht gefunden“.', lines: fmtRecords(answers) });
  return { qname, type, steps, rcode, answers, chain };
}
