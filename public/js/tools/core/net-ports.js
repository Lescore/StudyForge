/**
 * Port- und Protokollreferenz (Auswahl häufiger Ports, Zuordnung laut IANA bzw.
 * verbreiteter Praxis – Abweichungen sind vermerkt). Reine Logik ohne DOM.
 */
import { InputError } from './num.js';

const p = (port, proto, name, desc, note = '') => ({ port, proto, name, desc, note });
const T = ['TCP'];
const U = ['UDP'];
const TU = ['TCP', 'UDP'];

export const PORTS = [
  p(7, TU, 'Echo', 'Sendet Empfangenes zurück (Test)'),
  p(20, T, 'FTP-Daten', 'Datenkanal bei aktivem FTP'),
  p(21, T, 'FTP', 'Steuerkanal des File Transfer Protocol'),
  p(22, T, 'SSH', 'Secure Shell, auch SFTP und SCP'),
  p(23, T, 'Telnet', 'Unverschlüsselter Fernzugriff (veraltet)'),
  p(25, T, 'SMTP', 'Mailübertragung zwischen Mailservern'),
  p(43, T, 'WHOIS', 'Abfrage von Domain-/IP-Registrierungsdaten'),
  p(49, T, 'TACACS+', 'AAA für Netzwerkgeräte', 'TACACS+ nutzt TCP; der alte TACACS-Port ist auch für UDP registriert.'),
  p(53, TU, 'DNS', 'Namensauflösung; UDP für normale Anfragen, TCP für große Antworten und Zonentransfers'),
  p(67, U, 'DHCP-Server', 'DHCP/BOOTP – Server empfängt hier'),
  p(68, U, 'DHCP-Client', 'DHCP/BOOTP – Client empfängt hier'),
  p(69, U, 'TFTP', 'Trivial File Transfer Protocol (z. B. PXE-Boot)'),
  p(80, T, 'HTTP', 'Webseiten unverschlüsselt'),
  p(88, TU, 'Kerberos', 'Authentifizierung (z. B. Active Directory)'),
  p(110, T, 'POP3', 'E-Mail abrufen'),
  p(111, TU, 'rpcbind', 'ONC RPC Portmapper (z. B. für NFSv3)'),
  p(119, T, 'NNTP', 'Usenet-News'),
  p(123, U, 'NTP', 'Zeitsynchronisation'),
  p(135, TU, 'MS-RPC', 'Microsoft RPC Endpoint Mapper'),
  p(137, U, 'NetBIOS-NS', 'NetBIOS-Namensdienst', 'Auch für TCP registriert, praktisch nur UDP genutzt.'),
  p(138, U, 'NetBIOS-DGM', 'NetBIOS-Datagrammdienst'),
  p(139, T, 'NetBIOS-SSN', 'NetBIOS-Sitzungsdienst (SMB über NetBIOS)'),
  p(143, T, 'IMAP', 'E-Mail auf dem Server verwalten'),
  p(161, U, 'SNMP', 'Netzwerkmanagement (Abfragen an Agenten)'),
  p(162, U, 'SNMP-Trap', 'Benachrichtigungen von Agenten an den Manager'),
  p(179, T, 'BGP', 'Border Gateway Protocol zwischen Routern'),
  p(389, TU, 'LDAP', 'Verzeichnisdienst'),
  p(443, TU, 'HTTPS', 'HTTP über TLS (TCP); UDP 443 für HTTP/3 über QUIC'),
  p(445, T, 'SMB', 'Datei- und Druckerfreigaben (SMB direkt über TCP)'),
  p(464, TU, 'kpasswd', 'Kerberos-Passwortänderung'),
  p(465, T, 'SMTPS', 'Mail-Einlieferung mit implizitem TLS (Submissions, RFC 8314)'),
  p(500, U, 'IKE', 'Schlüsselaustausch für IPsec (ISAKMP)'),
  p(514, U, 'Syslog', 'Protokollmeldungen', 'TCP 514 ist dagegen rsh (Remote Shell); Syslog über TLS nutzt 6514/TCP.'),
  p(515, T, 'LPD', 'Line Printer Daemon (Drucken)'),
  p(520, U, 'RIP', 'Routing Information Protocol'),
  p(546, U, 'DHCPv6-Client', 'DHCPv6 – Client empfängt hier'),
  p(547, U, 'DHCPv6-Server', 'DHCPv6 – Server und Relays empfangen hier'),
  p(554, TU, 'RTSP', 'Steuerung von Medienstreams'),
  p(587, T, 'Submission', 'Mail-Einlieferung vom Client an den Server (meist mit STARTTLS)'),
  p(631, T, 'IPP', 'Internet Printing Protocol (z. B. CUPS)'),
  p(636, T, 'LDAPS', 'LDAP über TLS'),
  p(853, TU, 'DNS over TLS / QUIC', 'Verschlüsseltes DNS: TCP = DoT (RFC 7858), UDP = DoQ (RFC 9250)'),
  p(873, T, 'rsync', 'Dateisynchronisation (rsync-Daemon)'),
  p(989, T, 'FTPS-Daten', 'FTP über TLS, Datenkanal'),
  p(990, T, 'FTPS', 'FTP über TLS (implizit), Steuerkanal'),
  p(993, T, 'IMAPS', 'IMAP über TLS'),
  p(995, T, 'POP3S', 'POP3 über TLS'),
  p(1194, TU, 'OpenVPN', 'VPN, standardmäßig UDP'),
  p(1433, T, 'MS SQL Server', 'Microsoft-SQL-Datenbank'),
  p(1434, U, 'MS SQL Browser', 'Ermittelt Instanzen des SQL Servers'),
  p(1521, T, 'Oracle DB', 'Oracle-Datenbank-Listener (TNS)'),
  p(1701, U, 'L2TP', 'Layer 2 Tunneling Protocol'),
  p(1723, T, 'PPTP', 'Point-to-Point Tunneling Protocol (veraltet, unsicher)'),
  p(1812, U, 'RADIUS', 'Authentifizierung (z. B. WLAN mit 802.1X)'),
  p(1813, U, 'RADIUS-Accounting', 'Abrechnung/Protokollierung'),
  p(1883, T, 'MQTT', 'Nachrichtenprotokoll für IoT (unverschlüsselt)'),
  p(2049, TU, 'NFS', 'Network File System'),
  p(2375, T, 'Docker API', 'Docker-Daemon ohne TLS – nie öffentlich freigeben'),
  p(2376, T, 'Docker API (TLS)', 'Docker-Daemon mit TLS'),
  p(3268, T, 'LDAP Global Catalog', 'Active-Directory-Gesamtkatalog'),
  p(3306, T, 'MySQL / MariaDB', 'Datenbank'),
  p(3389, TU, 'RDP', 'Remote Desktop (TCP, zusätzlich UDP für bessere Leistung)'),
  p(3478, TU, 'STUN / TURN', 'NAT-Traversal, z. B. für WebRTC'),
  p(4500, U, 'IPsec NAT-T', 'IPsec durch NAT (UDP-Kapselung)'),
  p(5060, TU, 'SIP', 'Signalisierung für VoIP'),
  p(5061, T, 'SIPS', 'SIP über TLS'),
  p(5222, T, 'XMPP', 'Chat (Client-zu-Server)'),
  p(5353, U, 'mDNS', 'Multicast-DNS (z. B. Bonjour/Avahi)'),
  p(5432, T, 'PostgreSQL', 'Datenbank'),
  p(5672, T, 'AMQP', 'Message Broker (z. B. RabbitMQ)'),
  p(5900, T, 'VNC', 'Fernsteuerung (RFB-Protokoll), Bildschirm :0'),
  p(5985, T, 'WinRM (HTTP)', 'Windows Remote Management'),
  p(5986, T, 'WinRM (HTTPS)', 'Windows Remote Management über TLS'),
  p(6379, T, 'Redis', 'In-Memory-Datenbank', 'Von IANA registriert; ohne Passwort/TLS niemals öffentlich erreichbar machen.'),
  p(6443, T, 'Kubernetes API', 'API-Server von Kubernetes', 'Konvention, nicht IANA-registriert.'),
  p(6514, T, 'Syslog über TLS', 'Verschlüsselte Protokollmeldungen (RFC 5425)'),
  p(6667, T, 'IRC', 'Internet Relay Chat', 'Konvention (6665–6669); offiziell ist 194 registriert.'),
  p(8080, T, 'HTTP-Alternativ', 'Häufig für Proxys, Testserver und Anwendungsserver', 'Konvention; registriert als „http-alt“.'),
  p(8443, T, 'HTTPS-Alternativ', 'Häufig für Verwaltungsoberflächen und Testserver', 'Konvention.'),
  p(8883, T, 'MQTT über TLS', 'Verschlüsseltes MQTT'),
  p(9092, T, 'Apache Kafka', 'Broker', 'Konvention, nicht IANA-registriert.'),
  p(9200, T, 'Elasticsearch', 'REST-API', 'Konvention.'),
  p(11211, TU, 'memcached', 'Cache-Server', 'UDP-Zugang wurde für DDoS-Verstärkung missbraucht und ist heute meist abgeschaltet.'),
  p(27017, T, 'MongoDB', 'Dokumentendatenbank'),
  p(51820, U, 'WireGuard', 'VPN', 'Üblicher Standardport, nicht IANA-registriert; frei wählbar.')
];

export const RANGES = [
  { from: 0, to: 1023, name: 'Well-known Ports (System Ports)', desc: 'Von der IANA für Standarddienste vergeben. Auf Unix-Systemen braucht ein Prozess traditionell Root-Rechte, um sie zu öffnen.' },
  { from: 1024, to: 49151, name: 'Registered Ports (User Ports)', desc: 'Bei der IANA für bestimmte Anwendungen registrierbar.' },
  { from: 49152, to: 65535, name: 'Dynamische / private Ports (Ephemeral)', desc: 'Nicht vergeben; Betriebssysteme wählen hier Quellports für ausgehende Verbindungen (Linux standardmäßig 32768–60999).' }
];

export function rangeOf(port) {
  return RANGES.find((r) => port >= r.from && port <= r.to) ?? null;
}

export function parsePort(text, label = 'Port') {
  const raw = String(text ?? '').trim();
  if (!/^\d{1,5}$/.test(raw)) throw new InputError(`${label}: Bitte eine ganze Zahl von 0 bis 65535 eingeben.`);
  const n = Number(raw);
  if (n > 65535) throw new InputError(`${label}: ${n} ist zu groß – Portnummern haben 16 Bit (höchstens 65535).`);
  return n;
}

/** Suche nach Nummer, Name, Beschreibung; Filter 'alle' | 'TCP' | 'UDP'. */
export function searchPorts(list, query, proto = 'alle') {
  const q = String(query ?? '').trim().toLowerCase();
  const filtered = list.filter((e) => proto === 'alle' || e.proto.includes(proto));
  if (!q) return filtered;
  const range = /^(\d{1,5})\s*[-–]\s*(\d{1,5})$/.exec(q);
  if (range) {
    const [a, b] = [Number(range[1]), Number(range[2])].sort((x, y) => x - y);
    return filtered.filter((e) => e.port >= a && e.port <= b);
  }
  if (/^\d{1,5}$/.test(q)) return filtered.filter((e) => String(e.port) === q || String(e.port).startsWith(q));
  return filtered.filter((e) => `${e.name} ${e.desc} ${e.note ?? ''} ${e.proto.join(' ')}`.toLowerCase().includes(q));
}

export const MAX_CUSTOM = 200;

/** Prüft einen eigenen Eintrag. */
export function validateCustomPort(input) {
  const port = parsePort(input.port);
  const protoMap = { TCP: T, UDP: U, 'TCP/UDP': TU };
  const proto = protoMap[input.proto];
  if (!proto) throw new InputError('Protokoll: TCP, UDP oder TCP/UDP wählen.');
  const name = String(input.name ?? '').trim();
  if (!name) throw new InputError('Name: Bitte einen Dienstnamen eingeben.');
  if (name.length > 60) throw new InputError('Name: Höchstens 60 Zeichen.');
  const desc = String(input.desc ?? '').trim();
  if (desc.length > 200) throw new InputError('Beschreibung: Höchstens 200 Zeichen.');
  return { port, proto: [...proto], name, desc, note: '', custom: true };
}

/** Liest den gespeicherten JSON-String tolerant (fehlend/ungültig → leere Liste). */
export function parseCustomPorts(json) {
  if (!json) return [];
  try {
    const list = JSON.parse(json);
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const item of list.slice(0, MAX_CUSTOM)) {
      try {
        const proto = Array.isArray(item.proto) ? item.proto.join('/') : item.proto;
        out.push(validateCustomPort({ ...item, proto }));
      } catch {
        // Ungültige Einträge überspringen.
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function serializeCustomPorts(list) {
  const json = JSON.stringify(list.map((e) => ({ port: e.port, proto: e.proto.join('/'), name: e.name, desc: e.desc })));
  if (json.length > 32000) throw new InputError('Zu viele oder zu lange eigene Einträge (höchstens 32 000 Zeichen gespeichert).');
  return json;
}
