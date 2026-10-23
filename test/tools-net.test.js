import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseIPv4, formatIPv4, parseCidr } from '../public/js/tools/core/net-ipv4.js';
import { parseIPv6, compressIPv6, expandIPv6, ipv6Range, classifyIPv6, splitIPv6, interfaceId, mixedIPv6, parseIPv6WithPrefix } from '../public/js/tools/core/net-ipv6.js';
import { normalizeRoute, lookupRoute } from '../public/js/tools/core/net-routing.js';
import { parseHexBytes, decodeIPv4Header, internetChecksum, HEADER_EXAMPLES, withCorrectChecksum } from '../public/js/tools/core/net-header.js';
import { simulateTcp, parseIsn } from '../public/js/tools/core/net-tcp.js';
import { exampleTopology, tracePacket, addLink, addDevice, removeDevice, cloneTopology, parseRouteLine } from '../public/js/tools/core/net-topology.js';
import { createResolverState, defaultRecords, resolve, advanceClock, validateRecord, cacheEntries } from '../public/js/tools/core/net-dns.js';
import { PORTS, searchPorts, rangeOf, validateCustomPort, parseCustomPorts, serializeCustomPorts } from '../public/js/tools/core/net-ports.js';
import { encapsulation, PROTOCOLS, checkQuiz } from '../public/js/tools/core/net-osi.js';
import { packetOverhead, throughputModel } from '../public/js/tools/core/net-throughput.js';
import { toDecimal } from '../public/js/tools/core/num.js';

const v6 = (s) => parseIPv6(s).value;
const c6 = (s) => compressIPv6(v6(s));

/* ------------------------------------------------------------ IPv4-Basis */
test('IPv4 parsen und formatieren', () => {
  assert.equal(parseIPv4('192.168.1.10'), 0xc0a8010a);
  assert.equal(formatIPv4(0xffffffff), '255.255.255.255');
  assert.throws(() => parseIPv4('256.1.1.1'), /größer als 255/);
  assert.throws(() => parseIPv4('1.2.3'), /genau vier/);
  assert.throws(() => parseIPv4('01.2.3.4'), /Führende Nullen/);
  assert.deepEqual(parseCidr('10.0.0.0/8'), { addr: 0x0a000000, prefix: 8 });
  assert.throws(() => parseCidr('10.0.0.0/33'), /höchstens \/32/);
});

/* ------------------------------------------------------------ IPv6 */
test('IPv6: Kompression nach RFC 5952', () => {
  // Beispiele aus RFC 5952
  assert.equal(c6('2001:0db8::0001'), '2001:db8::1');
  assert.equal(c6('2001:db8:0:0:0:0:2:1'), '2001:db8::2:1');
  assert.equal(c6('2001:db8::0:1'), '2001:db8::1');
  assert.equal(c6('2001:db8:0:1:1:1:1:1'), '2001:db8:0:1:1:1:1:1'); // einzelne 0 wird nicht gekürzt
  assert.equal(c6('2001:0:0:1:0:0:0:1'), '2001:0:0:1::1'); // längste Folge
  assert.equal(c6('2001:db8:0:0:1:0:0:1'), '2001:db8::1:0:0:1'); // Gleichstand → erste
  assert.equal(c6('2001:DB8::ABCD'), '2001:db8::abcd'); // Kleinbuchstaben
  assert.equal(c6('0:0:0:0:0:0:0:0'), '::');
  assert.equal(c6('0:0:0:0:0:0:0:1'), '::1');
  assert.equal(c6('1:0:0:0:0:0:0:0'), '1::');
  assert.equal(expandIPv6(v6('2001:db8::1')), '2001:0db8:0000:0000:0000:0000:0000:0001');
});

test('IPv6: Validierung, eingebettetes IPv4 und Zonen-Index', () => {
  assert.throws(() => parseIPv6('1::2::3'), /nur einmal/);
  assert.throws(() => parseIPv6('1:2:3:4:5:6:7:8:9'), /Zu viele Gruppen/);
  assert.throws(() => parseIPv6('1:2:3:4:5:6:7'), /Zu wenige Gruppen/);
  assert.throws(() => parseIPv6('12345::1'), /mehr als 4 Hexziffern/);
  assert.throws(() => parseIPv6('2001:db8::g'), /Ungültiges Zeichen „g“/);
  assert.throws(() => parseIPv6('1:2:3:4:5:6:7::8'), /höchstens 7 Gruppen/);
  assert.throws(() => parseIPv6(':1:2:3:4:5:6:7'), /Leere Gruppe/);
  assert.throws(() => parseIPv6('::1.2.3.4:1'), /letzten 32 Bit/);
  assert.throws(() => parseIPv6(''), /Bitte eine IPv6-Adresse/);
  const mapped = parseIPv6('::ffff:192.0.2.1');
  assert.equal(mapped.embeddedIPv4, true);
  assert.equal(compressIPv6(mapped.value), '::ffff:c000:201');
  assert.equal(mixedIPv6(mapped.value), '::ffff:192.0.2.1');
  const zoned = parseIPv6('fe80::1%eth0');
  assert.equal(zoned.zone, 'eth0');
  assert.equal(compressIPv6(zoned.value), 'fe80::1');
  assert.throws(() => parseIPv6('fe80::1%'), /Zonen-Index/);
});

test('IPv6: Präfix, Netz und letzte Adresse', () => {
  const r64 = ipv6Range(v6('2001:db8:abcd:12::1'), 64);
  assert.equal(compressIPv6(r64.network), '2001:db8:abcd:12::');
  assert.equal(compressIPv6(r64.last), '2001:db8:abcd:12:ffff:ffff:ffff:ffff');
  assert.equal(r64.count, 2n ** 64n);
  assert.equal(r64.hostBitsSet, true);
  const r56 = ipv6Range(v6('2001:db8:abcd:12::'), 56);
  assert.equal(compressIPv6(r56.network), '2001:db8:abcd::');
  assert.equal(compressIPv6(r56.last), '2001:db8:abcd:ff:ffff:ffff:ffff:ffff');
  assert.equal(ipv6Range(0n, 0).count, 2n ** 128n);
  assert.equal(ipv6Range(v6('::1'), 128).count, 1n);
  const p = parseIPv6WithPrefix('2001:db8::/48', '64');
  assert.equal(p.prefix, 48);
  assert.throws(() => parseIPv6WithPrefix('2001:db8::', '129'), /höchstens \/128/);
});

test('IPv6: Adresstypen', () => {
  const type = (s) => classifyIPv6(v6(s)).primary.id;
  assert.equal(type('fe80::1'), 'linklocal');
  assert.equal(type('fd12:3456:789a::1'), 'ula-l');
  assert.equal(type('fc00::1'), 'ula');
  assert.equal(type('2a00:1450::1'), 'gua');
  assert.equal(type('ff02::1'), 'multicast');
  assert.equal(type('::1'), 'loopback');
  assert.equal(type('::'), 'unspecified');
  assert.equal(type('::ffff:192.0.2.1'), 'mapped');
  assert.equal(type('2001:db8::1'), 'doc');
  assert.equal(type('2002:c000:204::1'), '6to4');
  assert.equal(type('2001:0:4136:e378:8000:63bf:3fff:fdd2'), 'teredo');
  assert.equal(type('4000::1'), 'reserved');
  const mc = classifyIPv6(v6('ff05::1:3'));
  assert.match(mc.details.find((d) => d.label === 'Multicast-Scope').value, /Site-Local/);
  const teredo = classifyIPv6(v6('2001:0:4136:e378:8000:63bf:3fff:fdd2'));
  assert.equal(teredo.details.find((d) => d.label.startsWith('Client-IPv4')).value, '192.0.2.45');
  assert.ok(classifyIPv6(v6('2001:db8::1')).all.some((t) => t.id === 'gua'), 'Dokumentationsbereich liegt in 2000::/3');
});

test('IPv6: Interface-ID und EUI-64', () => {
  const iid = interfaceId(v6('fe80::21a:2bff:fe3c:4d5e'));
  assert.equal(iid.text, '021a:2bff:fe3c:4d5e');
  assert.equal(iid.eui64, true);
  assert.equal(iid.mac, '00:1a:2b:3c:4d:5e');
});

test('IPv6: Subnetze aufteilen', () => {
  const s = splitIPv6(v6('2001:db8:abcd::'), 48, 56, 3);
  assert.equal(s.count, 256n);
  assert.deepEqual(s.list.map((x) => compressIPv6(x.network)), ['2001:db8:abcd::', '2001:db8:abcd:100::', '2001:db8:abcd:200::']);
  assert.equal(compressIPv6(s.lastNet), '2001:db8:abcd:ff00::');
  assert.equal(s.truncated, true);
  const s64 = splitIPv6(v6('2001:db8:abcd:1200::'), 56, 64, 2);
  assert.deepEqual(s64.list.map((x) => compressIPv6(x.network)), ['2001:db8:abcd:1200::', '2001:db8:abcd:1201::']);
  assert.throws(() => splitIPv6(v6('2001:db8::'), 64, 48), /größer oder gleich/);
  const odd = splitIPv6(v6('2001:db8::'), 48, 50, 4);
  assert.equal(odd.count, 4n);
  assert.deepEqual(odd.list.map((x) => compressIPv6(x.network)), ['2001:db8::', '2001:db8:0:4000::', '2001:db8:0:8000::', '2001:db8:0:c000::']);
  assert.ok(odd.explain.some((e) => e.includes('mitten in einer Hexziffer')));
});

/* ------------------------------------------------------------ Routing */
const table = (rows) => rows.map((r) => normalizeRoute(r));

test('Routing: Longest-Prefix-Match', () => {
  const routes = table([
    { dest: '0.0.0.0/0', gateway: '192.168.1.1', metric: '100' },
    { dest: '10.0.0.0/8', gateway: '192.168.1.254', metric: '10' },
    { dest: '10.20.0.0/16', gateway: '172.16.0.2', metric: '20' }
  ]);
  const res = lookupRoute(routes, parseIPv4('10.20.5.1'));
  assert.equal(res.chosen.index, 2);
  assert.match(res.reason, /Longest-Prefix-Match/);
  assert.equal(res.candidates.filter((c) => c.matches).length, 3);
  assert.equal(lookupRoute(routes, parseIPv4('10.99.0.1')).chosen.index, 1);
});

test('Routing: Metrik bei gleicher Präfixlänge und Gleichstand', () => {
  const routes = table([
    { dest: '10.20.30.0/24', gateway: '172.16.0.3', metric: '20' },
    { dest: '10.20.30.0/24', gateway: '172.16.0.4', metric: '5' }
  ]);
  const res = lookupRoute(routes, parseIPv4('10.20.30.40'));
  assert.equal(res.chosen.index, 1);
  assert.match(res.reason, /niedrigsten Metrik/);
  assert.match(res.candidates[0].verdict, /höhere Metrik/);
  const tie = lookupRoute(table([{ dest: '10.0.0.0/8', gateway: '1.1.1.1', metric: '5' }, { dest: '10.0.0.0/8', gateway: '2.2.2.2', metric: '5' }]), parseIPv4('10.1.1.1'));
  assert.equal(tie.chosen.index, 0);
  assert.equal(tie.ties.length, 1);
  assert.match(tie.reason, /ECMP/);
});

test('Routing: keine Route und Default-Route', () => {
  const noDefault = table([{ dest: '192.168.1.0/24', gateway: 'direkt' }]);
  const res = lookupRoute(noDefault, parseIPv4('8.8.8.8'));
  assert.equal(res.chosen, null);
  assert.match(res.reason, /Destination Unreachable/);
  const withDefault = table([{ dest: '192.168.1.0/24', gateway: 'direkt' }, { dest: '0.0.0.0/0', gateway: '192.168.1.1', metric: '1' }]);
  const r2 = lookupRoute(withDefault, parseIPv4('8.8.8.8'));
  assert.equal(r2.chosen.index, 1);
  assert.match(r2.reason, /Standardroute/);
});

test('Routing: Hostbits im Ziel werden normalisiert, ungültige Einträge abgelehnt', () => {
  const r = normalizeRoute({ dest: '10.1.2.3/8', gateway: 'direkt' });
  assert.equal(formatIPv4(r.network), '10.0.0.0');
  assert.match(r.warnings[0], /Hostbits/);
  assert.equal(r.gateway, null);
  assert.throws(() => normalizeRoute({ dest: '10.0.0.0/8', gateway: '1.2.3', metric: '1' }), /Next Hop/);
  assert.throws(() => normalizeRoute({ dest: '10.0.0.0/8', metric: '-1' }), /Metrik/);
});

/* ------------------------------------------------------------ IPv4-Header */
test('IPv4-Header: bekanntes Beispiel mit gültiger Prüfsumme', () => {
  const bytes = parseHexBytes('4500 0073 0000 4000 4011 b861 c0a8 0001 c0a8 00c7');
  const h = decodeIPv4Header(bytes);
  assert.equal(h.ok, true);
  assert.equal(h.checksum.valid, true);
  assert.equal(h.checksum.computed, 0xb861);
  const f = Object.fromEntries(h.fields.map((x) => [x.key, x]));
  assert.equal(f.version.raw, 4);
  assert.equal(f.ihl.raw, 5);
  assert.equal(f.totalLength.raw, 115);
  assert.equal(f.flags.raw, 0b010); // DF
  assert.equal(f.ttl.raw, 64);
  assert.equal(f.protocol.detail, 'UDP');
  assert.equal(f.src.value, '192.168.0.1');
  assert.equal(f.dst.value, '192.168.0.199');
  assert.equal(internetChecksum(bytes).sum, 0xffff);
});

test('IPv4-Header: alle Beispiele sind wie beschrieben', () => {
  const [valid, withOptions, wrong, short] = HEADER_EXAMPLES.map((e) => decodeIPv4Header(parseHexBytes(e.hex)));
  assert.equal(valid.checksum.valid, true);
  assert.equal(withOptions.checksum.valid, true);
  assert.equal(withOptions.headerLength, 24);
  assert.equal(withOptions.options[0].name, 'Router Alert');
  assert.equal(wrong.checksum.valid, false);
  assert.equal(decodeIPv4Header(withCorrectChecksum(wrong.bytes)).checksum.valid, true);
  assert.equal(short.ok, false);
});

test('IPv4-Header: Längen- und Formatfehler', () => {
  assert.match(decodeIPv4Header(parseHexBytes('4500 0014')).errors[0], /mindestens 20 Byte/);
  const ihl4 = decodeIPv4Header(parseHexBytes('4400 0014 0000 0000 4006 0000 0a00 0001 0a00 0002'));
  assert.ok(ihl4.errors.some((e) => /IHL = 4/.test(e)));
  const ihl6 = decodeIPv4Header(parseHexBytes('4600 0018 0000 0000 4006 0000 0a00 0001 0a00 0002'));
  assert.ok(ihl6.errors.some((e) => /24 Byte Header/.test(e)));
  const v6h = decodeIPv4Header(parseHexBytes('6500 0014 0000 0000 4006 0000 0a00 0001 0a00 0002'));
  assert.ok(v6h.errors.some((e) => /Version ist 6/.test(e)));
  const tl = decodeIPv4Header(parseHexBytes('4500 0010 0000 0000 4006 0000 0a00 0001 0a00 0002'));
  assert.ok(tl.errors.some((e) => /Gesamtlänge 16 Byte ist kleiner/.test(e)));
  assert.throws(() => parseHexBytes('450'), /Ungerade Anzahl/);
  assert.throws(() => parseHexBytes('45zz'), /Ungültiges Zeichen/);
  assert.equal(parseHexBytes('45:00-00 73').length, 4);
});

/* ------------------------------------------------------------ TCP */
test('TCP: Sequenz- und Bestätigungsnummern im Handshake, Daten und Abbau', () => {
  const ev = simulateTcp({ clientIsn: 1000, serverIsn: 5000, clientData: 100, serverData: 200 }).filter((e) => e.kind === 'segment');
  const s = ev.map((e) => [e.from, e.flags.join('+'), e.seq, e.ack, e.len]);
  assert.deepEqual(s, [
    ['client', 'SYN', 1000, null, 0],
    ['server', 'SYN+ACK', 5000, 1001, 0],
    ['client', 'ACK', 1001, 5001, 0],
    ['client', 'PSH+ACK', 1001, 5001, 100],
    ['server', 'ACK', 5001, 1101, 0],
    ['server', 'PSH+ACK', 5001, 1101, 200],
    ['client', 'ACK', 1101, 5201, 0],
    ['client', 'FIN+ACK', 1101, 5201, 0],
    ['server', 'ACK', 5201, 1102, 0],
    ['server', 'FIN+ACK', 5201, 1102, 0],
    ['client', 'ACK', 1102, 5202, 0]
  ]);
  const all = simulateTcp({ clientIsn: 1000, serverIsn: 5000 });
  assert.equal(all.at(-1).client, 'CLOSED');
  assert.ok(all.some((e) => e.client === 'TIME-WAIT'));
  assert.ok(all.some((e) => e.server === 'CLOSE-WAIT'));
  assert.ok(all.some((e) => e.server === 'LAST-ACK'));
  assert.ok(all.some((e) => e.client === 'FIN-WAIT-2'));
});

test('TCP: Überlauf modulo 2^32 und Fehlerfälle', () => {
  const ev = simulateTcp({ clientIsn: 4294967295, serverIsn: 0, close: false }).filter((e) => e.kind === 'segment');
  assert.equal(ev[1].ack, 0);
  const lost = simulateTcp({ clientIsn: 1, serverIsn: 2, scenario: 'lost-syn', close: false });
  assert.equal(lost.filter((e) => e.flags?.includes('SYN') && e.from === 'client').length, 2);
  assert.ok(lost.some((e) => e.kind === 'timeout'));
  const rst = simulateTcp({ clientIsn: 77, serverIsn: 2, scenario: 'rst' });
  const r = rst.at(-1);
  assert.deepEqual([r.flags.join('+'), r.seq, r.ack, r.client], ['RST+ACK', 0, 78, 'CLOSED']);
  const lostAck = simulateTcp({ clientIsn: 1, serverIsn: 2, scenario: 'lost-ack', close: false });
  const lostIdx = lostAck.findIndex((e) => e.lost);
  assert.equal(lostAck[lostIdx].client, 'ESTABLISHED');
  assert.equal(lostAck[lostIdx].server, 'SYN-RECEIVED');
  assert.equal(lostAck.at(-1).server, 'ESTABLISHED');
  assert.throws(() => parseIsn('4294967296', 'ISN'), /Höchstens/);
});

/* ------------------------------------------------------------ Topologie */
test('Topologie: Pfad über zwei Router mit TTL', () => {
  const res = tracePacket(exampleTopology(), 'pc1', '192.168.2.20');
  assert.equal(res.ok, true);
  const hops = res.steps.filter((s) => s.kind === 'hop').map((s) => s.device);
  assert.deepEqual(hops, ['r1', 'r2', 'pc2']);
  assert.equal(res.steps.at(-1).ttl, 62);
  const local = tracePacket(exampleTopology(), 'pc2', '192.168.2.30');
  assert.deepEqual(local.steps.filter((s) => s.kind === 'hop').map((s) => s.device), ['pc3']);
  assert.equal(local.steps.at(-1).ttl, 64);
});

test('Topologie: Fehlerfälle (keine Route, Host fehlt, TTL, Schleife, Gateway)', () => {
  const t = exampleTopology();
  const noRoute = tracePacket(t, 'pc1', '203.0.113.5');
  assert.equal(noRoute.ok, false);
  assert.match(noRoute.reason, /keine Default-Route/);
  assert.match(tracePacket(t, 'pc1', '192.168.2.99').reason, /unbeantwortet/);
  assert.match(tracePacket(t, 'pc1', '192.168.2.20', '1').reason, /Time Exceeded/);
  const loop = cloneTopology(t);
  loop.devices.find((d) => d.id === 'r1').routes += '\n0.0.0.0/0 via 10.0.0.2';
  loop.devices.find((d) => d.id === 'r2').routes += '\ndefault via 10.0.0.1';
  assert.match(tracePacket(loop, 'pc1', '203.0.113.5').reason, /Schleife/);
  const badGw = cloneTopology(t);
  badGw.devices.find((d) => d.id === 'r1').routes = '192.168.2.0/24 via 172.16.0.1';
  assert.match(tracePacket(badGw, 'pc1', '192.168.2.20').reason, /Gateway nicht erreichbar/);
  const noGw = cloneTopology(t);
  noGw.devices.find((d) => d.id === 'pc1').gateway = '';
  assert.match(tracePacket(noGw, 'pc1', '192.168.2.20').reason, /kein Default-Gateway/);
});

test('Topologie: Bearbeiten mit Prüfungen', () => {
  const t = exampleTopology();
  assert.throws(() => addLink(t, 'pc1', 'sw2'), /nur einen Netzwerkanschluss/);
  assert.throws(() => addLink(t, 'sw1', 'sw1'), /mit sich selbst/);
  assert.throws(() => addLink(t, 'sw1', 'r1'), /bereits verbunden/);
  const pc = addDevice(t, 'client');
  assert.equal(pc.id, 'pc4');
  addLink(t, 'pc4', 'sw1');
  removeDevice(t, 'r1');
  assert.ok(!t.links.some((l) => l.a === 'r1' || l.b === 'r1'));
  assert.throws(() => parseRouteLine('10.0.0.0/8 nach 1.2.3.4'), /erwartet/);
  assert.equal(parseRouteLine('default via 10.0.0.1 metric 5').metric, 5);
});

/* ------------------------------------------------------------ DNS */
test('DNS: CNAME-Kette über Zonen, Cache und TTL-Ablauf', () => {
  const st = createResolverState();
  const rec = defaultRecords();
  const first = resolve(st, rec, 'shop.example.com', 'A');
  assert.equal(first.rcode, 'NOERROR');
  assert.deepEqual(first.chain.map((x) => x.value), ['shop.example.net', 'edge.example.org']);
  assert.equal(first.answers.at(-1).value, '203.0.113.50');
  assert.ok(first.steps.some((s) => s.to === 'root'));
  const second = resolve(st, rec, 'shop.example.com', 'A');
  assert.ok(second.steps.every((s) => !['root', 'tld', 'auth'].includes(s.to)), 'zweite Anfrage komplett aus dem Cache');
  assert.equal(second.answers.at(-1).value, '203.0.113.50');
  advanceClock(st, 61); // A von edge.example.org (TTL 60) verfällt
  const third = resolve(st, rec, 'shop.example.com', 'A');
  assert.ok(third.steps.some((s) => s.to === 'auth' && s.title.includes('edge.example.org')));
  assert.ok(!third.steps.some((s) => s.to === 'root'), 'Delegationen bleiben im Cache');
  assert.ok(cacheEntries(st).every((e) => e.remaining > 0));
});

test('DNS: NXDOMAIN, NODATA, eigene Records und Schleifen', () => {
  const st = createResolverState();
  const rec = defaultRecords();
  assert.equal(resolve(st, rec, 'gibtsnicht.example.org', 'A').rcode, 'NXDOMAIN');
  assert.equal(resolve(st, rec, 'foo.invalid', 'A').rcode, 'NXDOMAIN');
  assert.equal(resolve(st, rec, 'mail.example.com', 'AAAA').rcode, 'NODATA');
  const added = validateRecord({ name: 'Test.Example.com.', type: 'A', value: '192.0.2.99', ttl: '30' }, rec);
  assert.equal(added.name, 'test.example.com');
  rec.push(added);
  assert.equal(resolve(st, rec, 'test.example.com', 'A').answers[0].value, '192.0.2.99');
  assert.throws(() => validateRecord({ name: 'x.example.de', type: 'A', value: '192.0.2.1', ttl: '60' }, rec), /Beispielzonen/);
  assert.throws(() => validateRecord({ name: 'www.example.com', type: 'A', value: '192.0.2.1', ttl: '60' }, rec), /bereits ein CNAME/);
  assert.throws(() => validateRecord({ name: 'y.example.com', type: 'AAAA', value: '1::2::3', ttl: '60' }, rec), /nur einmal/);
  rec.push(validateRecord({ name: 'a.example.net', type: 'CNAME', value: 'b.example.net', ttl: '60' }, rec));
  rec.push(validateRecord({ name: 'b.example.net', type: 'CNAME', value: 'a.example.net', ttl: '60' }, rec));
  assert.equal(resolve(st, rec, 'a.example.net', 'A').rcode, 'SERVFAIL');
});

/* ------------------------------------------------------------ Ports */
test('Ports: Liste, Bereiche, Suche', () => {
  assert.ok(PORTS.length >= 60, `nur ${PORTS.length} Einträge`);
  const keys = PORTS.map((p) => p.port);
  assert.equal(new Set(keys).size, keys.length, 'keine doppelten Portnummern');
  const get = (n) => PORTS.find((p) => p.port === n);
  assert.deepEqual(get(53).proto, ['TCP', 'UDP']);
  assert.deepEqual(get(443).proto, ['TCP', 'UDP']);
  assert.deepEqual(get(123).proto, ['UDP']);
  assert.equal(get(3389).name, 'RDP');
  assert.equal(rangeOf(80).name.startsWith('Well-known'), true);
  assert.equal(rangeOf(1024).name.startsWith('Registered'), true);
  assert.equal(rangeOf(49152).name.startsWith('Dynamische'), true);
  assert.deepEqual(searchPorts(PORTS, '22').map((p) => p.port), [22]);
  assert.ok(searchPorts(PORTS, 'ssh').some((p) => p.port === 22));
  assert.ok(searchPorts(PORTS, '', 'UDP').every((p) => p.proto.includes('UDP')));
  assert.deepEqual(searchPorts(PORTS, '990-995').map((p) => p.port), [990, 993, 995]);
});

test('Ports: eigene Einträge prüfen und serialisieren', () => {
  const e = validateCustomPort({ port: '8081', proto: 'TCP', name: 'Mein Dienst', desc: '' });
  assert.equal(e.custom, true);
  assert.throws(() => validateCustomPort({ port: '70000', proto: 'TCP', name: 'x' }), /65535/);
  assert.throws(() => validateCustomPort({ port: '1', proto: 'ICMP', name: 'x' }), /Protokoll/);
  assert.throws(() => validateCustomPort({ port: '1', proto: 'TCP', name: ' ' }), /Name/);
  const json = serializeCustomPorts([e]);
  assert.deepEqual(parseCustomPorts(json), [e]);
  assert.deepEqual(parseCustomPorts('kein json'), []);
  assert.deepEqual(parseCustomPorts(undefined), []);
});

/* ------------------------------------------------------------ OSI */
test('OSI: Kapselung und Zuordnung', () => {
  const enc = encapsulation({ payload: 1460, transport: 'tcp', ip: 'ipv4' });
  assert.equal(enc.frameLen, 1518);
  assert.equal(enc.wireBytes, 1538);
  assert.equal(enc.steps.length, 10);
  const small = encapsulation({ payload: 1, transport: 'udp' });
  assert.equal(small.pad, 46 - 29);
  assert.equal(small.frameLen, 64);
  assert.ok(PROTOCOLS.find((p) => p.name === 'TLS').disputed);
  assert.ok(PROTOCOLS.find((p) => p.name === 'ARP').disputed);
  assert.equal(checkQuiz('TCP', 4).correct, true);
  assert.equal(checkQuiz('HTTP', 3).correct, false);
});

/* ------------------------------------------------------------ Durchsatz */
test('Durchsatz: Overhead, BDP und Fensterbegrenzung', () => {
  const oh = packetOverhead({ mtu: '1500', l3: 'ipv4', l4: 'tcp' });
  assert.equal(oh.payload, 1460);
  assert.equal(oh.wire, 1538);
  const m = throughputModel({ rate: '100', rateUnit: 'Mbit/s', rttMs: '20', size: '1', sizeUnit: 'MB', window: '65535', windowUnit: 'B', setupRtts: '1', overhead: false });
  assert.equal(toDecimal(m.bdpBytes).text, '250000');
  assert.equal(m.limitedBy, 'Fenster');
  // 65535 Byte / 20 ms = 26 214 000 bit/s
  assert.equal(toDecimal(m.effective).text, '26214000');
  const big = throughputModel({ rate: '100', rateUnit: 'Mbit/s', rttMs: '20', size: '1', sizeUnit: 'MB', window: '1', windowUnit: 'MiB', setupRtts: '0', overhead: true, mtu: '1500', l3: 'ipv4', l4: 'tcp' });
  assert.equal(big.limitedBy, 'Leitung');
  assert.equal(toDecimal(big.goodput, 0).text, '94928479'); // 100 Mbit/s × 1460/1538
  assert.throws(() => throughputModel({ rate: '0', rateUnit: 'Mbit/s', rttMs: '1', size: '1', sizeUnit: 'MB', window: '1', windowUnit: 'B' }), /größer als 0/);
  assert.throws(() => packetOverhead({ mtu: '1000', l3: 'ipv6', l4: 'tcp' }), /1280/);
});
