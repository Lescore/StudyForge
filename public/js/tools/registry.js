/**
 * Verzeichnis aller Informatik-Werkzeuge.
 *
 * Jedes Werkzeug gehört zu einer Hauptkategorie (`cat`) und kann zusätzlich in
 * weiteren Kategorien erscheinen (`also`). `module` bestimmt, welches
 * Oberflächenmodul unter ./ui/ das Werkzeug darstellt; die Module werden erst
 * beim Öffnen eines Werkzeugs geladen.
 */

export const CATEGORIES = [
  { id: 'daten', title: 'Datenmengen & Zahlensysteme', icon: 'documents', desc: 'Bit/Byte, SI/IEC, Übertragungszeit, Speicher, RAID, Zahlensysteme, Gleitkomma.' },
  { id: 'architektur', title: 'Rechnerarchitektur & Logik', icon: 'code', desc: 'Logikgatter, Schaltungen, Zeichentabellen, Speicherlayout.' },
  { id: 'netzwerk', title: 'Netzwerktechnik', icon: 'link', desc: 'Subnetting, IPv6, OSI, TCP, DNS, Routing, Ports, Header.' },
  { id: 'betriebssysteme', title: 'Betriebssysteme & Linux', icon: 'settings', desc: 'Dateirechte, Befehle, Scheduling, RAID und Backup.' },
  { id: 'programmierung', title: 'Programmierung & Algorithmen', icon: 'tools', desc: 'Sortieren, Big-O, Datenstrukturen, Regex, Git, Codebeispiele.' },
  { id: 'datenbanken', title: 'Datenbanken', icon: 'templates', desc: 'SQL-Spielplatz und Normalisierung.' },
  { id: 'web', title: 'Webtechnologien & Datenformate', icon: 'external', desc: 'JSON, URL, Base64, Zeitstempel, Diff, UUID, HTTP, MIME.' },
  { id: 'sicherheit', title: 'Kryptografie & IT-Sicherheit', icon: 'alert', desc: 'Hashes, Passwortentropie, Verschlüsselungsgrundlagen.' },
  { id: 'technik', title: 'Zeit, Leistung & Berechnungen', icon: 'clock', desc: 'Frequenz, Leistung/Energie, Prozent und Verhältnisse.' }
];

const t = (id, cat, module, title, desc, keywords = '', also = []) => ({ id, cat, module, title, desc, keywords, also });

export const TOOLS = [
  // Datenmengen & Zahlensysteme
  t('datenmengen', 'daten', 'data', 'Datenmengen-Konverter', 'Bit, Byte, SI- und IEC-Präfixe sowie Datenraten exakt umrechnen.', 'kb kib mb mib gb gib tb byte bit mbit datenrate einheiten 1000 1024', ['technik']),
  t('uebertragungszeit', 'daten', 'data', 'Übertragungszeit', 'Dauer, nötige Datenrate oder übertragbare Menge – mit Wirkungsgrad und Overhead.', 'download upload dauer bandbreite mbit/s overhead', ['netzwerk', 'technik']),
  t('speicherplatz', 'daten', 'data', 'Speicherplatz & Kapazität', 'Gesamtgröße, Belegung, Medienanzahl, Hersteller- vs. Betriebssystemangabe, Wachstum.', 'festplatte ssd tb tib belegung wachstum medien', ['technik']),
  t('raid', 'daten', 'data', 'RAID-Kapazität', 'Nutzbare Kapazität, Redundanz und Fehlertoleranz für RAID 0, 1, 5, 6, 10.', 'raid0 raid1 raid5 raid6 raid10 parität spiegelung', ['betriebssysteme']),
  t('zahlensysteme', 'daten', 'data', 'Zahlensysteme', 'Basis 2 bis 36, mit Nachkommastellen und Schritt-für-Schritt-Rechenweg.', 'binär oktal dezimal hexadezimal basis umrechnen', ['architektur']),
  t('bit-inspektor', 'daten', 'data', 'Bit- und Byte-Inspektor', 'Ein Wert in allen Darstellungen, anklickbare Bits, 8 bis 64 Bit.', 'bits nibble byte endian vorzeichen', ['architektur']),
  t('binaerarithmetik', 'daten', 'data', 'Binärarithmetik & Zweierkomplement', 'Rechnen mit fester Bitbreite, Überlauf, Bitoperationen und Shifts.', 'zweierkomplement overflow carry and or xor not shift', ['architektur']),
  t('textcodierung', 'daten', 'data', 'Text & UTF-8', 'Text in UTF-8-Bytes, Hex, Binär und zurück – inklusive Emojis.', 'utf-8 unicode bytes encoding emoji codepoint', ['web', 'architektur']),
  t('ieee754', 'daten', 'data', 'IEEE-754-Gleitkomma', 'Float32/Float64 zerlegen: Vorzeichen, Exponent, Mantisse, exakter Wert.', 'float double gleitkomma mantisse exponent nan infinity subnormal', ['architektur']),
  t('adressraum', 'daten', 'data', 'Adressraum & Alignment', 'Adressbits, Adressbereiche, Byte- vs. Wortadressierung, Struct-Padding.', 'adresse speicher alignment padding struct wort', ['architektur']),

  // Rechnerarchitektur & Logik
  t('logikgatter', 'architektur', 'arch', 'Logikgatter & Wahrheitstabellen', 'Gatter und boolesche Ausdrücke mit 2–4 Variablen, Tabellen und Vereinfachung.', 'and or not xor nand nor xnor boolesch wahrheitstabelle'),
  t('logikschaltung', 'architektur', 'arch', 'Logikschaltungs-Simulator', 'Kombinatorische Schaltungen aus Gattern zusammenstellen und prüfen.', 'schaltung gatter simulator signal'),
  t('zeichentabelle', 'architektur', 'arch', 'ASCII- & Unicode-Tabelle', 'Codepoints, UTF-8-Bytes und Zeichen nachschlagen.', 'ascii unicode zeichen tabelle codepoint', ['web']),
  t('speicherlayout', 'architektur', 'arch', 'Speicherlayout & Hexdump', 'Simulierter Speicher mit Hexdump, Endianness, Lesen und Schreiben.', 'hexdump little endian big endian speicher offset'),

  // Netzwerktechnik
  t('ipv4-subnetting', 'netzwerk', 'legacy', 'IPv4-Subnetting', 'Netz, Broadcast und Hosts berechnen, eigene Lösungen prüfen und Aufgaben speichern.', 'ipv4 subnetz cidr maske broadcast übung'),
  t('ipv6', 'netzwerk', 'net', 'IPv6-Rechner', 'Validieren, kürzen, expandieren, Präfixe, Adresstypen und Subnetze.', 'ipv6 präfix link-local ula interface-id'),
  t('osi-modell', 'netzwerk', 'net', 'OSI- & TCP/IP-Modell', 'Schichten, Protokolle, PDUs und Kapselung Schritt für Schritt.', 'osi schichten tcp/ip encapsulation pdu'),
  t('tcp-handshake', 'netzwerk', 'net', 'TCP-Handshake-Simulator', 'SYN, SYN-ACK, ACK, Sequenznummern, Abbau und Fehlerfälle.', 'tcp syn ack fin sequenznummer'),
  t('dns-simulator', 'netzwerk', 'net', 'DNS-Auflösung', 'Rekursive Auflösung über Root, TLD und autoritative Server, mit Cache und TTL.', 'dns resolver root tld a aaaa cname mx ttl'),
  t('routing-tabelle', 'netzwerk', 'net', 'Routing-Tabelle', 'Eigene Routen, Longest-Prefix-Match und Metrik nachvollziehen.', 'routing longest prefix match route metrik'),
  t('ports', 'netzwerk', 'net', 'Ports & Protokolle', 'Häufige TCP-/UDP-Ports durchsuchen, eigene Einträge speichern.', 'port tcp udp http ssh dns'),
  t('netzwerkdurchsatz', 'netzwerk', 'net', 'Durchsatz & Latenz', 'Bandbreite, RTT, Übertragungsdauer und Bandwidth-Delay-Product.', 'latenz rtt durchsatz bdp bandbreite', ['technik']),
  t('ipv4-header', 'netzwerk', 'net', 'IPv4-Header-Inspektor', 'Headerfelder aus Bytes dekodieren und Prüfsumme kontrollieren.', 'ipv4 header ttl checksum flags fragment'),
  t('topologie', 'netzwerk', 'net', 'Netzwerktopologie', 'Kleine Topologie mit Clients, Switches und Routern – Paketweg verfolgen.', 'topologie switch router pfad'),

  // Betriebssysteme & Linux
  t('dateirechte', 'betriebssysteme', 'os', 'Linux-Dateirechte', 'rwx und Oktal umrechnen, chmod, SUID, SGID, Sticky Bit.', 'chmod rechte rwx 755 644 suid sgid sticky'),
  t('befehle', 'betriebssysteme', 'os', 'Befehlsreferenz Linux & Windows', 'Wichtige Befehle nach Aufgabe – getrennt für Linux und Windows.', 'linux windows befehle shell cmd powershell'),
  t('scheduling', 'betriebssysteme', 'os', 'Prozess-Scheduling', 'FCFS, SJF, Priority, Round Robin mit Gantt-Diagramm und Wartezeiten.', 'scheduling fcfs sjf round robin gantt'),
  t('raid-backup', 'betriebssysteme', 'os', 'RAID & Backup-Grundlagen', 'RAID-Level, Backup-Arten und die 3-2-1-Regel im Überblick.', 'raid backup inkrementell differenziell 3-2-1'),

  // Programmierung & Algorithmen
  t('sortieren', 'programmierung', 'prog', 'Sortieralgorithmen', 'Bubble, Selection, Insertion, Merge, Quick – Schritt für Schritt.', 'sortieren bubble quick merge insertion selection'),
  t('big-o', 'programmierung', 'prog', 'Big-O-Explorer', 'Wachstumsraten theoretischer Komplexitätsklassen vergleichen.', 'big o komplexität laufzeit'),
  t('datenstrukturen', 'programmierung', 'prog', 'Datenstrukturen', 'Stack, Queue, verkettete Liste, Suchbaum und Hash-Tabelle bedienen.', 'stack queue liste baum bst hashtabelle'),
  t('regex', 'programmierung', 'prog', 'Reguläre Ausdrücke', 'JavaScript-RegExp testen, Treffer und Gruppen hervorheben.', 'regex regulärer ausdruck pattern', ['web']),
  t('git-simulator', 'programmierung', 'prog', 'Git-Branching-Simulator', 'Commits, Branches, Merge und Rebase als Graph – nur simuliert.', 'git branch merge rebase commit'),
  t('codebeispiele', 'programmierung', 'legacy', 'Codebeispiele', 'Eigene Codebeispiele mit Erklärung und Syntaxhervorhebung.', 'snippet code beispiel'),

  // Datenbanken
  t('sql-spielplatz', 'datenbanken', 'db', 'SQL-Spielplatz', 'Echte SQL-Abfragen auf einer Beispieldatenbank im Arbeitsspeicher.', 'sql select join sqlite abfrage'),
  t('normalisierung', 'datenbanken', 'db', 'Normalisierung', '1NF, 2NF, 3NF, funktionale Abhängigkeiten und Anomalien.', 'normalform 1nf 2nf 3nf anomalie schlüssel'),

  // Webtechnologien & Datenformate
  t('json', 'web', 'web', 'JSON formatieren & prüfen', 'JSON validieren, formatieren, komprimieren – mit Fehlerposition.', 'json format validieren'),
  t('url', 'web', 'web', 'URL codieren & zerlegen', 'Prozentcodierung und URL-Bestandteile.', 'url encode decode query'),
  t('base64', 'web', 'web', 'Base64', 'Text (UTF-8) und Dateien in Base64 und zurück.', 'base64 codierung'),
  t('zeitstempel', 'web', 'web', 'Zeitstempel', 'Unix-Zeit in Datum umrechnen und umgekehrt, mit Zeitzonen.', 'unix timestamp epoch iso 8601 datum', ['technik']),
  t('diff', 'web', 'web', 'Text vergleichen (Diff)', 'Zeilenweiser Vergleich zweier Texte.', 'diff vergleich unterschied', ['programmierung']),
  t('hashes', 'sicherheit', 'sec', 'Hashes & Prüfsummen', 'SHA-256/384/512 für Text und Dateien, Hashes vergleichen.', 'sha256 sha512 hash prüfsumme checksum', ['web']),
  t('uuid', 'web', 'web', 'UUID-Generator', 'Zufällige UUIDs (Version 4) erzeugen und prüfen.', 'uuid guid'),
  t('http-status', 'web', 'web', 'HTTP-Statuscodes', 'Statuscodes nachschlagen und verstehen.', 'http status 404 500 200'),
  t('mime-typen', 'web', 'web', 'MIME-Typen', 'Dateiendungen und Medientypen nachschlagen.', 'mime content-type medientyp'),

  // Kryptografie & IT-Sicherheit
  t('passwortentropie', 'sicherheit', 'sec', 'Passwortentropie', 'Theoretische Entropie und Suchdauer unter offengelegten Annahmen.', 'passwort entropie brute force'),
  t('krypto-grundlagen', 'sicherheit', 'sec', 'Verschlüsselungsgrundlagen', 'Hashing, symmetrisch, asymmetrisch und Signaturen im Vergleich.', 'aes rsa signatur verschlüsselung'),

  // Zeit, Leistung & Berechnungen
  t('frequenz', 'technik', 'tech', 'Frequenz & Periodendauer', 'Hz bis GHz umrechnen, Periodendauer und Takte berechnen.', 'frequenz hz mhz ghz periode takt'),
  t('leistung', 'technik', 'tech', 'Leistung, Energie & Laufzeit', 'Watt, Wattstunden, Akkulaufzeit und Energiekosten.', 'watt kwh energie akku laufzeit strom'),
  t('prozent', 'technik', 'tech', 'Prozent & Verhältnisse', 'Prozentwerte, Veränderungen, Dreisatz und Verhältnisse.', 'prozent dreisatz verhältnis'),
  t('formelsammlung', 'technik', 'legacy', 'Formelsammlung', 'Eigene LaTeX-Formeln mit Erklärung.', 'formel latex mathematik')
];

export function toolById(id) {
  return TOOLS.find((tool) => tool.id === id) ?? null;
}

export function categoryById(id) {
  return CATEGORIES.find((category) => category.id === id) ?? null;
}

export function toolsInCategory(categoryId) {
  return TOOLS.filter((tool) => tool.cat === categoryId || tool.also.includes(categoryId));
}

function fold(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss');
}

/** Sucht in Titel, Beschreibung und Stichwörtern; alle Suchwörter müssen vorkommen. */
export function searchTools(query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return TOOLS.filter((tool) => {
    const text = `${tool.title} ${tool.desc} ${tool.keywords} ${categoryById(tool.cat)?.title ?? ''}`;
    // „Übertragung“ soll auch mit „ubertragung“ und „uebertragung“ gefunden werden.
    const hay = `${fold(text)} ${fold(text.replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue'))}`;
    return words.every((word) => hay.includes(word));
  });
}

/** Lädt das Oberflächenmodul eines Werkzeugs. Statische Pfade, damit nichts nachgeladen wird, was nicht im Projekt liegt. */
export const MODULE_LOADERS = {
  data: () => import('./ui/data.js'),
  arch: () => import('./ui/arch.js'),
  net: () => import('./ui/net.js'),
  os: () => import('./ui/os.js'),
  prog: () => import('./ui/prog.js'),
  db: () => import('./ui/db.js'),
  web: () => import('./ui/web.js'),
  sec: () => import('./ui/sec.js'),
  tech: () => import('./ui/tech.js')
};
