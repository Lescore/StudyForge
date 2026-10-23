/**
 * Routing-Entscheidung mit Longest-Prefix-Match (IPv4).
 * Wird vom Routing-Tabellen-Werkzeug und von der Topologie-Simulation genutzt.
 * Reine Logik ohne DOM.
 */
import { InputError } from './num.js';
import { parseIPv4, formatIPv4, parsePrefix, prefixMask, networkOf, parseCidr } from './net-ipv4.js';

/**
 * Prüft und normalisiert einen Routeneintrag.
 * Eingabe: { dest: '10.0.0.0/8' | dest + prefix, gateway: '' | 'direkt' | IP, iface, metric }
 * Ergebnis: { network, prefix, gateway (Zahl oder null), iface, metric, warnings[] }
 */
export function normalizeRoute(input, label = 'Route') {
  const warnings = [];
  let addr;
  let prefix;
  const destText = String(input.dest ?? '').trim();
  if (destText.includes('/')) ({ addr, prefix } = parseCidr(destText, { label: `${label}: Ziel` }));
  else {
    addr = parseIPv4(destText, `${label}: Ziel`);
    prefix = parsePrefix(input.prefix, `${label}: Präfixlänge`);
  }
  const network = networkOf(addr, prefix);
  if (network !== addr) {
    warnings.push(`Im Ziel ${formatIPv4(addr)}/${prefix} sind Hostbits gesetzt – als Netz ${formatIPv4(network)}/${prefix} verwendet.`);
  }
  const gwText = String(input.gateway ?? '').trim();
  const direct = !gwText || /^(direkt|direct|connected|-|0\.0\.0\.0|on-link)$/i.test(gwText);
  const gateway = direct ? null : parseIPv4(gwText, `${label}: Next Hop`);
  const metricText = String(input.metric ?? '0').trim() || '0';
  if (!/^\d{1,6}$/.test(metricText)) throw new InputError(`${label}: Metrik muss eine ganze Zahl ≥ 0 sein.`);
  const metric = Number(metricText);
  const iface = String(input.iface ?? '').trim().slice(0, 20);
  return { network, prefix, gateway, iface, metric, warnings, source: input.source ?? 'statisch' };
}

export function routeText(route) {
  return `${formatIPv4(route.network)}/${route.prefix}`;
}

/**
 * Wählt die Route für ein Ziel: alle Einträge prüfen, passende nach
 * Präfixlänge (absteigend), dann Metrik (aufsteigend), dann Tabellenreihenfolge.
 * Ergebnis: { dst, candidates[], chosen, reason, ties[] }
 */
export function lookupRoute(routes, dst) {
  const candidates = routes.map((route, index) => {
    const mask = prefixMask(route.prefix);
    const matches = ((dst & mask) >>> 0) === route.network;
    return {
      route,
      index,
      matches,
      reason: matches
        ? `passt: ${formatIPv4(dst)} UND ${formatIPv4(mask)} = ${formatIPv4((dst & mask) >>> 0)} = Netzadresse`
        : `passt nicht: ${formatIPv4(dst)} UND ${formatIPv4(mask)} = ${formatIPv4((dst & mask) >>> 0)} ≠ ${formatIPv4(route.network)}`
    };
  });
  const matching = candidates.filter((c) => c.matches);
  matching.sort((a, b) => b.route.prefix - a.route.prefix || a.route.metric - b.route.metric || a.index - b.index);
  const chosen = matching[0] ?? null;
  let reason;
  let ties = [];
  if (!chosen) {
    reason = 'Keine Route passt und es gibt keine Standardroute (0.0.0.0/0): Ziel nicht erreichbar. Ein Router verwirft das Paket und sendet in der Regel ICMP „Destination Unreachable“ (Typ 3, Code 0 „Network Unreachable“) an den Absender.';
  } else {
    const samePrefix = matching.filter((c) => c.route.prefix === chosen.route.prefix);
    const sameMetric = samePrefix.filter((c) => c.route.metric === chosen.route.metric);
    ties = sameMetric.filter((c) => c !== chosen);
    if (matching.length === 1) reason = `Nur eine Route passt: ${routeText(chosen.route)}.`;
    else if (samePrefix.length === 1) reason = `Längstes passendes Präfix: /${chosen.route.prefix} (Longest-Prefix-Match) – spezifischer als alle anderen passenden Einträge.`;
    else if (ties.length === 0) reason = `Mehrere Routen mit /${chosen.route.prefix} passen; gewählt wird die mit der niedrigsten Metrik (${chosen.route.metric}).`;
    else reason = `Mehrere Routen mit /${chosen.route.prefix} und gleicher Metrik ${chosen.route.metric}: Hier wird die erste in der Tabelle genommen. Echte Router verteilen den Verkehr dann oft auf alle (ECMP).`;
    if (chosen.route.prefix === 0) reason += ' Es greift die Standardroute (Default-Route), weil kein spezifischeres Netz passt.';
  }
  for (const c of candidates) {
    if (!c.matches) continue;
    if (c === chosen) c.verdict = 'gewählt';
    else if (c.route.prefix < chosen.route.prefix) c.verdict = `kürzeres Präfix (/${c.route.prefix} < /${chosen.route.prefix})`;
    else if (c.route.metric > chosen.route.metric) c.verdict = `höhere Metrik (${c.route.metric} > ${chosen.route.metric})`;
    else c.verdict = 'gleichwertig, steht aber später in der Tabelle';
  }
  return { dst, candidates, chosen, reason, ties };
}

/** Next Hop der gewählten Route: Gateway oder (direkt verbunden) das Ziel selbst. */
export function nextHop(route, dst) {
  return route.gateway ?? dst;
}

export const EXAMPLE_ROUTES = [
  { dest: '0.0.0.0/0', gateway: '192.168.1.1', iface: 'eth0', metric: '100' },
  { dest: '192.168.1.0/24', gateway: 'direkt', iface: 'eth0', metric: '0' },
  { dest: '10.0.0.0/8', gateway: '192.168.1.254', iface: 'eth0', metric: '10' },
  { dest: '10.20.0.0/16', gateway: '172.16.0.2', iface: 'eth1', metric: '20' },
  { dest: '10.20.30.0/24', gateway: '172.16.0.3', iface: 'eth1', metric: '20' },
  { dest: '10.20.30.0/24', gateway: '172.16.0.4', iface: 'eth1', metric: '5' },
  { dest: '172.16.0.0/24', gateway: 'direkt', iface: 'eth1', metric: '0' }
];
