/**
 * Netzwerktopologie-Simulation: Clients, Switches (Layer 2) und Router (Layer 3).
 * Berechnet den Weg eines IPv4-Pakets Schritt für Schritt. Es wird nichts
 * Reales konfiguriert und kein Paket gesendet. Reine Logik ohne DOM.
 */
import { InputError } from './num.js';
import { parseIPv4, parseCidr, formatIPv4, inNetwork, networkOf } from './net-ipv4.js';
import { normalizeRoute, lookupRoute, routeText } from './net-routing.js';

export const DEVICE_TYPES = { client: 'Client', switch: 'Switch', router: 'Router' };
export const MAX_DEVICES = 16;

export function exampleTopology() {
  return {
    devices: [
      { id: 'pc1', type: 'client', name: 'PC1', cidr: '192.168.1.10/24', gateway: '192.168.1.1' },
      { id: 'sw1', type: 'switch', name: 'SW1' },
      { id: 'r1', type: 'router', name: 'R1', ifaces: { l2: '192.168.1.1/24', l3: '10.0.0.1/30' }, routes: '192.168.2.0/24 via 10.0.0.2' },
      { id: 'r2', type: 'router', name: 'R2', ifaces: { l3: '10.0.0.2/30', l4: '192.168.2.1/24' }, routes: '192.168.1.0/24 via 10.0.0.1' },
      { id: 'sw2', type: 'switch', name: 'SW2' },
      { id: 'pc2', type: 'client', name: 'PC2', cidr: '192.168.2.20/24', gateway: '192.168.2.1' },
      { id: 'pc3', type: 'client', name: 'PC3', cidr: '192.168.2.30/24', gateway: '192.168.2.1' }
    ],
    links: [
      { id: 'l1', a: 'pc1', b: 'sw1' },
      { id: 'l2', a: 'sw1', b: 'r1' },
      { id: 'l3', a: 'r1', b: 'r2' },
      { id: 'l4', a: 'r2', b: 'sw2' },
      { id: 'l5', a: 'sw2', b: 'pc2' },
      { id: 'l6', a: 'sw2', b: 'pc3' }
    ]
  };
}

export function cloneTopology(t) {
  return JSON.parse(JSON.stringify(t));
}

const nextId = (list, prefix) => {
  let i = 1;
  while (list.some((x) => x.id === `${prefix}${i}`)) i += 1;
  return `${prefix}${i}`;
};

export function addDevice(t, type) {
  if (!DEVICE_TYPES[type]) throw new InputError('Unbekannter Gerätetyp.');
  if (t.devices.length >= MAX_DEVICES) throw new InputError(`Höchstens ${MAX_DEVICES} Geräte in dieser Simulation.`);
  const prefix = { client: 'pc', switch: 'sw', router: 'r' }[type];
  const id = nextId(t.devices, prefix);
  const name = `${{ client: 'PC', switch: 'SW', router: 'R' }[type]}${id.slice(prefix.length)}`;
  const device = { id, type, name };
  if (type === 'client') Object.assign(device, { cidr: '', gateway: '' });
  if (type === 'router') Object.assign(device, { ifaces: {}, routes: '' });
  t.devices.push(device);
  return device;
}

export function removeDevice(t, id) {
  const gone = t.links.filter((l) => l.a === id || l.b === id).map((l) => l.id);
  t.devices = t.devices.filter((d) => d.id !== id);
  t.links = t.links.filter((l) => l.a !== id && l.b !== id);
  for (const d of t.devices) if (d.ifaces) for (const lid of gone) delete d.ifaces[lid];
}

export function addLink(t, a, b) {
  if (!a || !b) throw new InputError('Bitte zwei Geräte auswählen.');
  if (a === b) throw new InputError('Ein Gerät kann nicht mit sich selbst verbunden werden.');
  const da = t.devices.find((d) => d.id === a);
  const db = t.devices.find((d) => d.id === b);
  if (!da || !db) throw new InputError('Gerät nicht gefunden.');
  if (t.links.some((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a))) throw new InputError(`${da.name} und ${db.name} sind bereits verbunden.`);
  for (const d of [da, db]) {
    if (d.type === 'client' && t.links.some((l) => l.a === d.id || l.b === d.id)) throw new InputError(`${d.name} hat schon eine Verbindung – Clients haben hier nur einen Netzwerkanschluss.`);
  }
  if (t.links.length >= 32) throw new InputError('Höchstens 32 Verbindungen.');
  const link = { id: nextId(t.links, 'l'), a, b };
  t.links.push(link);
  return link;
}

export function removeLink(t, id) {
  t.links = t.links.filter((l) => l.id !== id);
  for (const d of t.devices) if (d.ifaces) delete d.ifaces[id];
}

/** Links eines Geräts in stabiler Reihenfolge; Router-Interfaces heißen eth0, eth1 … */
export function deviceLinks(t, id) {
  return t.links.filter((l) => l.a === id || l.b === id);
}

export function ifaceName(t, routerId, linkId) {
  const idx = deviceLinks(t, routerId).findIndex((l) => l.id === linkId);
  return idx < 0 ? '?' : `eth${idx}`;
}

const other = (link, id) => (link.a === id ? link.b : link.a);

/**
 * Prüft die Konfiguration und baut ein Rechenmodell.
 * Ergebnis: { devices: Map, issues: [{ device, text }] }
 */
export function buildModel(t) {
  const issues = [];
  const devices = new Map();
  for (const d of t.devices) {
    const links = deviceLinks(t, d.id);
    const m = { ...d, links };
    if (d.type === 'client') {
      try {
        const { addr, prefix } = parseCidr(d.cidr, { label: `${d.name}: IP/Präfix` });
        m.addr = addr;
        m.prefix = prefix;
        if (prefix < 31 && (addr === networkOf(addr, prefix) || addr === (networkOf(addr, prefix) | (2 ** (32 - prefix) - 1)) >>> 0)) {
          issues.push({ device: d.id, text: `${d.name}: ${formatIPv4(addr)} ist Netz- oder Broadcastadresse – als Hostadresse ungeeignet.` });
        }
      } catch (e) {
        issues.push({ device: d.id, text: e.message });
      }
      if (d.gateway && String(d.gateway).trim()) {
        try {
          m.gw = parseIPv4(d.gateway, `${d.name}: Gateway`);
          if (m.addr !== undefined && !inNetwork(m.gw, m.addr, m.prefix)) issues.push({ device: d.id, text: `${d.name}: Gateway ${formatIPv4(m.gw)} liegt nicht im eigenen Netz ${formatIPv4(networkOf(m.addr, m.prefix))}/${m.prefix}.` });
        } catch (e) {
          issues.push({ device: d.id, text: e.message });
        }
      } else m.gw = null;
      if (!links.length) issues.push({ device: d.id, text: `${d.name} ist mit nichts verbunden.` });
    }
    if (d.type === 'router') {
      m.interfaces = [];
      links.forEach((l, i) => {
        const text = d.ifaces?.[l.id];
        if (!text || !String(text).trim()) {
          issues.push({ device: d.id, text: `${d.name} eth${i} (zu ${t.devices.find((x) => x.id === other(l, d.id))?.name ?? '?'}): keine IP-Adresse konfiguriert.` });
          return;
        }
        try {
          const { addr, prefix } = parseCidr(text, { label: `${d.name} eth${i}` });
          m.interfaces.push({ name: `eth${i}`, link: l.id, addr, prefix });
        } catch (e) {
          issues.push({ device: d.id, text: e.message });
        }
      });
      m.routes = m.interfaces.map((ifc) => ({ network: networkOf(ifc.addr, ifc.prefix), prefix: ifc.prefix, gateway: null, iface: ifc.name, link: ifc.link, metric: 0, warnings: [], source: 'direkt verbunden' }));
      const lines = String(d.routes ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
      lines.forEach((line, i) => {
        try {
          m.routes.push(parseRouteLine(line, `${d.name} Route ${i + 1}`));
        } catch (e) {
          issues.push({ device: d.id, text: e.message });
        }
      });
    }
    devices.set(d.id, m);
  }
  return { devices, issues, topology: t };
}

/** „Netz/Präfix via Gateway [metric N]“ oder „Netz/Präfix direkt“ bzw. „default via …“. */
export function parseRouteLine(line, label = 'Route') {
  const m = /^(\S+)\s+(?:via\s+(\S+)|(direkt|connected))(?:\s+metri[ck]\s+(\d+))?$/i.exec(line.trim());
  if (!m) throw new InputError(`${label}: „${line}“ – erwartet „Netz/Präfix via Gateway“ (optional „metric N“), z. B. 0.0.0.0/0 via 10.0.0.2.`);
  const dest = m[1].toLowerCase() === 'default' ? '0.0.0.0/0' : m[1];
  const route = normalizeRoute({ dest, gateway: m[2] ?? 'direkt', metric: m[4] ?? '1' }, label);
  route.source = 'statisch';
  return route;
}

/**
 * Sucht im Layer-2-Segment hinter `linkId` (von `fromId` aus, über Switches)
 * ein Gerät, das `ip` besitzt. Ergebnis: { device, iface?, path: [deviceIds], links: [linkIds] } oder null.
 */
export function findInSegment(model, fromId, linkId, ip) {
  const t = model.topology;
  const start = t.links.find((l) => l.id === linkId);
  if (!start) return { found: null, reached: [] };
  const queue = [{ id: other(start, fromId), via: start.id, path: [fromId, other(start, fromId)], links: [start.id] }];
  const seen = new Set([fromId]);
  const reached = [];
  while (queue.length) {
    const cur = queue.shift();
    if (seen.has(cur.id)) continue;
    seen.add(cur.id);
    const dev = model.devices.get(cur.id);
    if (!dev) continue;
    if (dev.type === 'switch') {
      for (const l of dev.links) {
        const nxt = other(l, cur.id);
        if (!seen.has(nxt)) queue.push({ id: nxt, via: l.id, path: [...cur.path, nxt], links: [...cur.links, l.id] });
      }
      continue;
    }
    reached.push(dev.name);
    if (dev.type === 'client' && dev.addr === ip) return { found: { device: dev, path: cur.path, links: cur.links }, reached };
    if (dev.type === 'router') {
      const ifc = dev.interfaces.find((i) => i.link === cur.via && i.addr === ip);
      if (ifc) return { found: { device: dev, iface: ifc, path: cur.path, links: cur.links }, reached };
    }
  }
  return { found: null, reached };
}

const names = (model, ids) => ids.map((id) => model.devices.get(id)?.name ?? id);

/**
 * Paketweg berechnen.
 * Ergebnis: { ok, steps: [{ device, text, kind, links[], ttl }], reason }
 * kind: 'info' | 'hop' | 'ok' | 'error'
 */
export function tracePacket(t, srcId, dstText, ttlText = '64') {
  const model = buildModel(t);
  const src = model.devices.get(srcId);
  if (!src) throw new InputError('Bitte eine Quelle wählen.');
  if (src.type !== 'client') throw new InputError('Quelle muss ein Client sein.');
  const dst = parseIPv4(dstText, 'Ziel-IP');
  if (!/^\d{1,3}$/.test(String(ttlText).trim()) || Number(ttlText) < 1 || Number(ttlText) > 255) throw new InputError('TTL: ganze Zahl von 1 bis 255.');
  let ttl = Number(ttlText);
  const steps = [];
  const fail = (device, text) => {
    steps.push({ device, text, kind: 'error', links: [], ttl });
    return { ok: false, steps, reason: text, issues: model.issues };
  };
  if (src.addr === undefined) return fail(src.id, `${src.name} hat keine gültige IP-Konfiguration.`);
  if (!src.links.length) return fail(src.id, `${src.name} ist mit keinem Netz verbunden.`);
  const dstText2 = formatIPv4(dst);
  steps.push({ device: src.id, kind: 'info', links: [], ttl, text: `${src.name} (${formatIPv4(src.addr)}/${src.prefix}) will ein Paket an ${dstText2} senden. TTL = ${ttl}.` });
  if (dst === src.addr) {
    steps.push({ device: src.id, kind: 'ok', links: [], ttl, text: 'Das Ziel ist der Absender selbst – das Paket verlässt den Rechner nicht.' });
    return { ok: true, steps, reason: 'lokal', issues: model.issues };
  }
  let nextHopIp;
  if (inNetwork(dst, src.addr, src.prefix)) {
    nextHopIp = dst;
    steps.push({ device: src.id, kind: 'info', links: [], ttl, text: `${dstText2} liegt im eigenen Netz ${formatIPv4(networkOf(src.addr, src.prefix))}/${src.prefix} (gleicher Netzanteil nach UND mit der Maske) → direkte Zustellung. ${src.name} ermittelt per ARP die MAC-Adresse von ${dstText2}.` });
  } else {
    if (src.gw === null || src.gw === undefined) return fail(src.id, `${dstText2} liegt nicht im eigenen Netz und ${src.name} hat kein Default-Gateway → „Netzwerk nicht erreichbar“.`);
    if (!inNetwork(src.gw, src.addr, src.prefix)) return fail(src.id, `Das Default-Gateway ${formatIPv4(src.gw)} liegt nicht im eigenen Netz – es kann nicht direkt erreicht werden.`);
    nextHopIp = src.gw;
    steps.push({ device: src.id, kind: 'info', links: [], ttl, text: `${dstText2} liegt nicht im eigenen Netz ${formatIPv4(networkOf(src.addr, src.prefix))}/${src.prefix} → Paket an das Default-Gateway ${formatIPv4(src.gw)}. Ziel-IP bleibt ${dstText2}, nur die Ziel-MAC ist die des Gateways (ARP für ${formatIPv4(src.gw)}).` });
  }

  let current = src;
  let outLink = src.links[0].id;
  const visited = new Set();
  for (let guard = 0; guard < 40; guard += 1) {
    const { found, reached } = findInSegment(model, current.id, outLink, nextHopIp);
    if (!found) {
      return fail(current.id, `ARP-Anfrage nach ${formatIPv4(nextHopIp)} bleibt unbeantwortet: Im angeschlossenen Segment${reached.length ? ` (erreichbar: ${reached.join(', ')})` : ''} hat kein Gerät diese Adresse. ${nextHopIp === dst ? 'Ziel' : 'Next Hop/Gateway'} nicht erreichbar.`);
    }
    const via = found.path.slice(1, -1);
    steps.push({ device: found.device.id, kind: 'hop', links: found.links, ttl, text: `Frame ${current.name} → ${via.length ? `${names(model, via).join(' → ')} → ` : ''}${found.device.name}${found.iface ? ` (${found.iface.name})` : ''}${via.length ? '. Switches leiten anhand der Ziel-MAC weiter und verändern weder IP noch TTL.' : '.'}` });
    const dev = found.device;
    if (dev.type === 'client') {
      steps.push({ device: dev.id, kind: 'ok', links: [], ttl, text: `Zugestellt: ${dev.name} (${formatIPv4(dev.addr)}) ist das Ziel. Ankunft mit TTL ${ttl}.` });
      return { ok: true, steps, reason: 'zugestellt', issues: model.issues };
    }
    // Router
    if (dev.interfaces.some((i) => i.addr === dst)) {
      steps.push({ device: dev.id, kind: 'ok', links: [], ttl, text: `Zugestellt: ${dstText2} ist eine Adresse von ${dev.name} selbst.` });
      return { ok: true, steps, reason: 'zugestellt', issues: model.issues };
    }
    if (visited.has(dev.id)) {
      return fail(dev.id, `Routing-Schleife: Das Paket ist wieder bei ${dev.name}. Es würde kreisen, bis die TTL 0 erreicht, und dann verworfen (ICMP Time Exceeded). Routen der beteiligten Router prüfen.`);
    }
    visited.add(dev.id);
    ttl -= 1;
    if (ttl <= 0) {
      return fail(dev.id, `${dev.name} verringert die TTL auf 0 → Paket wird verworfen, der Absender erhält ICMP „Time Exceeded“ (Typ 11). So funktioniert auch traceroute.`);
    }
    const res = lookupRoute(dev.routes, dst);
    const candidates = res.candidates.filter((c) => c.matches).map((c) => `${routeText(c.route)}${c.route.gateway !== null ? ` via ${formatIPv4(c.route.gateway)}` : ' direkt'}`);
    if (!res.chosen) {
      return fail(dev.id, `${dev.name} (TTL jetzt ${ttl}): Kein Eintrag in der Routing-Tabelle passt zu ${dstText2} und es gibt keine Default-Route → Paket verworfen, ICMP „Destination Unreachable“ an den Absender.`);
    }
    const route = res.chosen.route;
    let egress;
    if (route.gateway === null) {
      egress = dev.interfaces.find((i) => i.link === route.link) ?? dev.interfaces.find((i) => inNetwork(dst, i.addr, i.prefix));
      nextHopIp = dst;
    } else {
      egress = dev.interfaces.find((i) => inNetwork(route.gateway, i.addr, i.prefix));
      nextHopIp = route.gateway;
      if (!egress) {
        return fail(dev.id, `${dev.name}: Route ${routeText(route)} zeigt auf Gateway ${formatIPv4(route.gateway)}, aber kein Interface liegt in dessen Netz → Gateway nicht erreichbar.`);
      }
    }
    if (!egress) return fail(dev.id, `${dev.name}: Kein passendes Interface für ${routeText(route)}.`);
    steps.push({ device: dev.id, kind: 'info', links: [], ttl, text: `${dev.name}: TTL ${ttl + 1} → ${ttl}. Longest-Prefix-Match für ${dstText2}: passend ${candidates.join(', ')} → gewählt ${routeText(route)} (${route.source}${route.gateway !== null ? `, Next Hop ${formatIPv4(route.gateway)}` : ', Ziel direkt im Netz'}) über ${egress.name}.` });
    current = dev;
    outLink = egress.link;
  }
  return fail(current.id, 'Abbruch: zu viele Schritte.');
}

/** Einfache Anordnung: Breitensuche ab dem ersten Gerät, Spalte = Abstand. */
export function layoutTopology(t, { colWidth = 130, rowHeight = 90, margin = 50 } = {}) {
  const pos = {};
  const depth = {};
  const order = [];
  for (const d of t.devices) {
    if (depth[d.id] !== undefined) continue;
    const base = Object.keys(depth).length ? Math.max(...Object.values(depth)) + 1 : 0;
    depth[d.id] = base;
    const queue = [d.id];
    while (queue.length) {
      const id = queue.shift();
      order.push(id);
      for (const l of deviceLinks(t, id)) {
        const n = other(l, id);
        if (depth[n] === undefined) {
          depth[n] = depth[id] + 1;
          queue.push(n);
        }
      }
    }
  }
  const cols = {};
  for (const id of order) (cols[depth[id]] ??= []).push(id);
  const maxRows = Math.max(1, ...Object.values(cols).map((c) => c.length));
  const nCols = Math.max(1, Object.keys(cols).length ? Math.max(...Object.keys(cols).map(Number)) + 1 : 1);
  const height = margin * 2 + (maxRows - 1) * rowHeight;
  for (const [c, ids] of Object.entries(cols)) {
    const offset = (height - (ids.length - 1) * rowHeight) / 2;
    ids.forEach((id, i) => {
      pos[id] = { x: margin + Number(c) * colWidth, y: offset + i * rowHeight };
    });
  }
  return { pos, width: margin * 2 + (nCols - 1) * colWidth, height };
}
