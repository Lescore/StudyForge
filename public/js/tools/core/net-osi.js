/**
 * OSI- und TCP/IP-Modell: Schichten, Protokollzuordnung, Kapselung.
 * Reine Logik ohne DOM.
 */
import { InputError } from './num.js';

export const OSI_LAYERS = [
  { n: 7, name: 'Application', de: 'Anwendungsschicht', pdu: 'Daten (Nachricht)', task: 'Dienste für Anwendungen: Web, Mail, Namensauflösung', devices: 'Hosts, Proxys, Gateways' },
  { n: 6, name: 'Presentation', de: 'Darstellungsschicht', pdu: 'Daten', task: 'Datenformate, Kodierung, Kompression, (teilweise) Verschlüsselung', devices: 'Hosts' },
  { n: 5, name: 'Session', de: 'Sitzungsschicht', pdu: 'Daten', task: 'Sitzungen aufbauen, verwalten, synchronisieren', devices: 'Hosts' },
  { n: 4, name: 'Transport', de: 'Transportschicht', pdu: 'Segment (TCP) / Datagramm (UDP)', task: 'Ende-zu-Ende zwischen Prozessen: Ports, Zuverlässigkeit, Flusskontrolle', devices: 'Hosts, Firewalls (stateful)' },
  { n: 3, name: 'Network', de: 'Vermittlungsschicht', pdu: 'Paket', task: 'Logische Adressierung (IP) und Wegewahl (Routing) zwischen Netzen', devices: 'Router, Layer-3-Switches' },
  { n: 2, name: 'Data Link', de: 'Sicherungsschicht', pdu: 'Frame (Rahmen)', task: 'Übertragung im lokalen Netz: MAC-Adressen, Fehlererkennung (FCS)', devices: 'Switches, Bridges, WLAN-Access-Points' },
  { n: 1, name: 'Physical', de: 'Bitübertragungsschicht', pdu: 'Bits / Symbole', task: 'Signale auf dem Medium: Kabel, Funk, Licht, Stecker, Kodierung', devices: 'Kabel, Repeater, Hubs, Transceiver' }
];

/** TCP/IP-Modell (RFC 1122: 4 Schichten) und das in Lehrbüchern verbreitete 5-Schichten-Modell. */
export const TCPIP4 = [
  { name: 'Anwendung (Application)', osi: [7, 6, 5] },
  { name: 'Transport', osi: [4] },
  { name: 'Internet', osi: [3] },
  { name: 'Netzzugang (Link)', osi: [2, 1] }
];
export const TCPIP5 = [
  { name: 'Anwendung', osi: [7, 6, 5] },
  { name: 'Transport', osi: [4] },
  { name: 'Vermittlung (Network)', osi: [3] },
  { name: 'Sicherung (Data Link)', osi: [2] },
  { name: 'Bitübertragung (Physical)', osi: [1] }
];

/** osi: Liste der Schichten; disputed: Hinweistext, wenn die Zuordnung umstritten ist. */
export const PROTOCOLS = [
  { name: 'HTTP', full: 'Hypertext Transfer Protocol', osi: [7], tcpip: 'Anwendung', note: 'über TCP (HTTP/1.1, HTTP/2) bzw. QUIC/UDP (HTTP/3)' },
  { name: 'HTTPS', full: 'HTTP über TLS', osi: [7], tcpip: 'Anwendung', note: 'HTTP + TLS; Port 443' },
  { name: 'FTP', full: 'File Transfer Protocol', osi: [7], tcpip: 'Anwendung' },
  { name: 'SMTP', full: 'Simple Mail Transfer Protocol', osi: [7], tcpip: 'Anwendung' },
  { name: 'IMAP', full: 'Internet Message Access Protocol', osi: [7], tcpip: 'Anwendung' },
  { name: 'POP3', full: 'Post Office Protocol 3', osi: [7], tcpip: 'Anwendung' },
  { name: 'DNS', full: 'Domain Name System', osi: [7], tcpip: 'Anwendung', note: 'meist UDP Port 53, TCP für große Antworten/Zonentransfer' },
  { name: 'DHCP', full: 'Dynamic Host Configuration Protocol', osi: [7], tcpip: 'Anwendung', note: 'nutzt UDP, konfiguriert aber Schicht-3-Parameter' },
  { name: 'SSH', full: 'Secure Shell', osi: [7], tcpip: 'Anwendung' },
  { name: 'Telnet', full: 'Telnet', osi: [7], tcpip: 'Anwendung' },
  { name: 'SNMP', full: 'Simple Network Management Protocol', osi: [7], tcpip: 'Anwendung' },
  { name: 'NTP', full: 'Network Time Protocol', osi: [7], tcpip: 'Anwendung' },
  { name: 'LDAP', full: 'Lightweight Directory Access Protocol', osi: [7], tcpip: 'Anwendung' },
  { name: 'SMB', full: 'Server Message Block', osi: [7], tcpip: 'Anwendung', disputed: 'Oft auch Schicht 5/6 zugeordnet (Sitzungen, Dateifreigaben).' },
  { name: 'MQTT', full: 'Message Queuing Telemetry Transport', osi: [7], tcpip: 'Anwendung' },
  { name: 'MIME', full: 'Multipurpose Internet Mail Extensions', osi: [6], tcpip: 'Anwendung', note: 'Datenformat/Kodierung' },
  { name: 'JPEG / PNG', full: 'Bildformate', osi: [6], tcpip: 'Anwendung', note: 'Darstellungsformate, keine Netzwerkprotokolle im engeren Sinn' },
  { name: 'TLS', full: 'Transport Layer Security', osi: [6, 5], tcpip: 'Anwendung', disputed: 'Umstritten: liegt zwischen Transport und Anwendung. Häufig Schicht 6 (Verschlüsselung/Darstellung) oder 5 (Sitzung) zugeordnet, manchmal „Schicht 4,5“. Im TCP/IP-Modell gehört TLS zur Anwendungsschicht oberhalb von TCP.' },
  { name: 'RPC', full: 'Remote Procedure Call', osi: [5], tcpip: 'Anwendung' },
  { name: 'NetBIOS', full: 'NetBIOS Session Service', osi: [5], tcpip: 'Anwendung' },
  { name: 'TCP', full: 'Transmission Control Protocol', osi: [4], tcpip: 'Transport', note: 'verbindungsorientiert, zuverlässig' },
  { name: 'UDP', full: 'User Datagram Protocol', osi: [4], tcpip: 'Transport', note: 'verbindungslos' },
  { name: 'QUIC', full: 'QUIC', osi: [4], tcpip: 'Transport', disputed: 'QUIC läuft über UDP, übernimmt aber Transportaufgaben (Zuverlässigkeit, Staukontrolle) und enthält TLS 1.3 – daher Schicht 4, teilweise auch 4–7.' },
  { name: 'SCTP', full: 'Stream Control Transmission Protocol', osi: [4], tcpip: 'Transport' },
  { name: 'IPv4', full: 'Internet Protocol Version 4', osi: [3], tcpip: 'Internet' },
  { name: 'IPv6', full: 'Internet Protocol Version 6', osi: [3], tcpip: 'Internet' },
  { name: 'ICMP', full: 'Internet Control Message Protocol', osi: [3], tcpip: 'Internet', disputed: 'Wird in IP-Paketen transportiert (Protokoll 1), gehört aber funktional zur Vermittlungsschicht (Schicht 3).' },
  { name: 'IPsec', full: 'IP Security (AH/ESP)', osi: [3], tcpip: 'Internet' },
  { name: 'OSPF', full: 'Open Shortest Path First', osi: [3], tcpip: 'Internet', disputed: 'Routingprotokoll direkt über IP (Protokoll 89): meist Schicht 3; manche ordnen Routingprotokolle der Anwendungsebene zu.' },
  { name: 'BGP', full: 'Border Gateway Protocol', osi: [7], tcpip: 'Anwendung', disputed: 'Läuft über TCP (Port 179), steuert aber das Routing auf Schicht 3 – daher je nach Quelle Schicht 7 oder 3.' },
  { name: 'ARP', full: 'Address Resolution Protocol', osi: [2, 3], tcpip: 'Netzzugang', disputed: 'Umstritten: ARP verknüpft Schicht-3-Adressen (IP) mit Schicht-2-Adressen (MAC) und wird direkt in Ethernet-Frames transportiert. Häufig als Schicht 2, manchmal als 3 oder „2,5“ bezeichnet.' },
  { name: 'NDP', full: 'Neighbor Discovery (IPv6)', osi: [3], tcpip: 'Internet', note: 'Ersetzt ARP bei IPv6, läuft als ICMPv6' },
  { name: 'Ethernet (IEEE 802.3)', full: 'Ethernet', osi: [2, 1], tcpip: 'Netzzugang', note: 'MAC-Teil auf Schicht 2, Bitübertragung (z. B. 1000BASE-T) auf Schicht 1' },
  { name: 'WLAN (IEEE 802.11)', full: 'Wireless LAN', osi: [2, 1], tcpip: 'Netzzugang', note: 'MAC-Teil Schicht 2, Funk-PHY Schicht 1' },
  { name: 'PPP', full: 'Point-to-Point Protocol', osi: [2], tcpip: 'Netzzugang' },
  { name: 'VLAN (IEEE 802.1Q)', full: 'Virtual LAN Tagging', osi: [2], tcpip: 'Netzzugang' },
  { name: 'STP', full: 'Spanning Tree Protocol', osi: [2], tcpip: 'Netzzugang' },
  { name: 'MPLS', full: 'Multiprotocol Label Switching', osi: [2, 3], tcpip: 'Netzzugang', disputed: 'Liegt zwischen Schicht 2 und 3 („Schicht 2,5“).' },
  { name: 'Bluetooth', full: 'Bluetooth', osi: [2, 1], tcpip: 'Netzzugang' },
  { name: 'DSL', full: 'Digital Subscriber Line', osi: [1], tcpip: 'Netzzugang' },
  { name: 'USB', full: 'Universal Serial Bus', osi: [1], tcpip: 'Netzzugang', note: 'Bus, kein typisches Netzwerkprotokoll' },
  { name: 'RJ45 / Twisted Pair', full: 'Kupferkabel', osi: [1], tcpip: 'Netzzugang' },
  { name: 'Glasfaser', full: 'Lichtwellenleiter', osi: [1], tcpip: 'Netzzugang' }
];

export function searchProtocols(query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return PROTOCOLS;
  const num = /^\d$/.test(q) ? Number(q) : null;
  return PROTOCOLS.filter((p) => (num !== null ? p.osi.includes(num) : `${p.name} ${p.full} ${p.tcpip} ${p.note ?? ''}`.toLowerCase().includes(q)));
}

/** Header-Größen (Byte) ohne Optionen. */
export const SIZES = { tcp: 20, udp: 8, ipv4: 20, ipv6: 40, ethHeader: 14, fcs: 4, preamble: 8, ifg: 12 };

/**
 * Kapselung/Entkapselung als Schrittfolge.
 * Ergebnis: Liste von { side: 'sender'|'receiver', layer, title, pdu, blocks[], text }
 * blocks: { kind: 'data'|'l4'|'l3'|'l2'|'fcs'|'bits', label, bytes }
 */
export function encapsulation({ payload = 100, transport = 'tcp', ip = 'ipv4' } = {}) {
  if (!Number.isInteger(payload) || payload < 0 || payload > 65000) throw new InputError('Nutzdaten: 0 bis 65 000 Byte.');
  const l4 = transport === 'udp' ? SIZES.udp : SIZES.tcp;
  const l3 = ip === 'ipv6' ? SIZES.ipv6 : SIZES.ipv4;
  const l4name = transport === 'udp' ? 'UDP-Header' : 'TCP-Header';
  const l3name = ip === 'ipv6' ? 'IPv6-Header' : 'IPv4-Header';
  const segName = transport === 'udp' ? 'Datagramm' : 'Segment';
  const data = { kind: 'data', label: 'Nutzdaten', bytes: payload };
  const L4 = { kind: 'l4', label: l4name, bytes: l4 };
  const L3 = { kind: 'l3', label: l3name, bytes: l3 };
  const L2 = { kind: 'l2', label: 'Ethernet-Header', bytes: SIZES.ethHeader };
  const FCS = { kind: 'fcs', label: 'FCS', bytes: SIZES.fcs };
  const ipPayload = l4 + payload;
  const frameData = l3 + ipPayload;
  const pad = Math.max(0, 46 - frameData);
  const PAD = pad ? [{ kind: 'pad', label: 'Padding', bytes: pad }] : [];
  const frameLen = SIZES.ethHeader + frameData + pad + SIZES.fcs;
  const notes = [];
  if (frameData > 1500) notes.push(`Achtung: ${frameData} Byte IP-Paket überschreiten die übliche Ethernet-MTU von 1500 Byte – in der Praxis würde segmentiert (TCP) bzw. fragmentiert (IP).`);
  const sender = [
    { layer: 7, title: 'Anwendung erzeugt Daten', pdu: 'Daten', blocks: [data], text: `Die Anwendung (z. B. ein Browser) übergibt ${payload} Byte an die Transportschicht. Schichten 7–5 fügen im TCP/IP-Alltag keinen eigenen Netzwerkheader hinzu – Formate wie HTTP stecken in den Nutzdaten.` },
    { layer: 4, title: `Transportschicht: ${l4name} davor`, pdu: segName, blocks: [L4, data], text: `${l4name} (${l4} Byte${transport === 'tcp' ? ' ohne Optionen' : ''}) mit Quell- und Zielport${transport === 'tcp' ? ', Sequenz-/Bestätigungsnummer, Flags, Fenster' : ', Länge und Prüfsumme'}. PDU: ${segName}, ${ipPayload} Byte.` },
    { layer: 3, title: `Vermittlungsschicht: ${l3name} davor`, pdu: 'Paket', blocks: [L3, L4, data], text: `${l3name} (${l3} Byte) mit Quell- und Ziel-IP, ${ip === 'ipv6' ? 'Hop Limit' : 'TTL'} und Protokollnummer (${transport === 'udp' ? '17 = UDP' : '6 = TCP'}). PDU: Paket, ${frameData} Byte.` },
    { layer: 2, title: 'Sicherungsschicht: Ethernet-Header und FCS', pdu: 'Frame', blocks: [L2, L3, L4, data, ...PAD, FCS], text: `Ethernet-Header (14 Byte: Ziel-MAC, Quell-MAC, EtherType ${ip === 'ipv6' ? '0x86DD' : '0x0800'}) davor, Prüfsumme FCS (CRC-32, 4 Byte) dahinter${pad ? `, dazu ${pad} Byte Padding, weil ein Frame mindestens 64 Byte lang sein muss` : ''}. PDU: Frame, ${frameLen} Byte.` },
    { layer: 1, title: 'Bitübertragung: Bits auf das Medium', pdu: 'Bits', blocks: [{ kind: 'bits', label: 'Präambel + SFD', bytes: SIZES.preamble }, L2, L3, L4, data, ...PAD, FCS], text: `Vor dem Frame stehen Präambel und Start Frame Delimiter (8 Byte), danach folgt eine Pause (Interframe Gap, 12 Byte-Zeiten). Auf der Leitung: ${frameLen + SIZES.preamble} Byte = ${(frameLen + SIZES.preamble) * 8} Bit (+ IFG). Die Bits werden als elektrische/optische/Funk-Signale übertragen.` }
  ].map((s) => ({ ...s, side: 'sender' }));
  const receiver = [
    { layer: 1, title: 'Empfänger: Bits empfangen', pdu: 'Bits', blocks: sender[4].blocks, text: 'Die Netzwerkkarte erkennt die Präambel, synchronisiert sich und setzt die Bits zum Frame zusammen.' },
    { layer: 2, title: 'Frame prüfen und auspacken', pdu: 'Frame', blocks: sender[3].blocks, text: 'FCS prüfen (bei Fehler wird der Frame verworfen), Ziel-MAC prüfen, anhand des EtherType an IP übergeben. Ethernet-Header und FCS werden entfernt.' },
    { layer: 3, title: 'Paket auspacken', pdu: 'Paket', blocks: sender[2].blocks, text: `Ziel-IP gehört zu diesem Host → ${l3name} entfernen, anhand der Protokollnummer an ${transport.toUpperCase()} übergeben.` },
    { layer: 4, title: `${segName} auspacken`, pdu: segName, blocks: sender[1].blocks, text: `Anhand des Zielports wird der richtige Prozess (Socket) gefunden${transport === 'tcp' ? '; TCP bestätigt den Empfang (ACK) und sortiert in die richtige Reihenfolge' : ''}. Header entfernen.` },
    { layer: 7, title: 'Anwendung erhält die Daten', pdu: 'Daten', blocks: [data], text: `Die Anwendung liest die ${payload} Byte Nutzdaten.` }
  ].map((s) => ({ ...s, side: 'receiver' }));
  return { steps: [...sender, ...receiver], frameLen, wireBytes: frameLen + SIZES.preamble + SIZES.ifg, overhead: frameLen + SIZES.preamble + SIZES.ifg - payload, notes, pad };
}

/** Für den Übungsmodus: Protokolle mit eindeutiger Zuordnung. */
export function quizPool() {
  return PROTOCOLS.filter((p) => !p.disputed && p.osi.length === 1);
}

export function checkQuiz(protocolName, layer) {
  const p = PROTOCOLS.find((x) => x.name === protocolName);
  if (!p) throw new InputError('Unbekanntes Protokoll.');
  return { correct: p.osi.includes(Number(layer)), expected: p.osi, protocol: p };
}
