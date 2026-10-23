# Informatik-Werkzeuge (ab 1.2.0)

Alle Werkzeuge laufen lokal im Browser; nur der SQL-Spielplatz nutzt den lokalen StudyForge-Server. Aufruf über **Informatik-Werkzeuge** in der Navigation oder direkt mit `#/werkzeuge/<id>`. Simulationen verändern nichts am System und senden keine Daten.

## Datenmengen & Zahlensysteme

| Werkzeug | id | Inhalt |
| --- | --- | --- |
| Datenmengen-Konverter | `datenmengen` | Bit, Byte, SI- und IEC-Präfixe sowie Datenraten exakt umrechnen. |
| Übertragungszeit | `uebertragungszeit` | Dauer, nötige Datenrate oder übertragbare Menge – mit Wirkungsgrad und Overhead. |
| Speicherplatz & Kapazität | `speicherplatz` | Gesamtgröße, Belegung, Medienanzahl, Hersteller- vs. Betriebssystemangabe, Wachstum. |
| RAID-Kapazität | `raid` | Nutzbare Kapazität, Redundanz und Fehlertoleranz für RAID 0, 1, 5, 6, 10. |
| Zahlensysteme | `zahlensysteme` | Basis 2 bis 36, mit Nachkommastellen und Schritt-für-Schritt-Rechenweg. |
| Bit- und Byte-Inspektor | `bit-inspektor` | Ein Wert in allen Darstellungen, anklickbare Bits, 8 bis 64 Bit. |
| Binärarithmetik & Zweierkomplement | `binaerarithmetik` | Rechnen mit fester Bitbreite, Überlauf, Bitoperationen und Shifts. |
| Text & UTF-8 | `textcodierung` | Text in UTF-8-Bytes, Hex, Binär und zurück – inklusive Emojis. |
| IEEE-754-Gleitkomma | `ieee754` | Float32/Float64 zerlegen: Vorzeichen, Exponent, Mantisse, exakter Wert. |
| Adressraum & Alignment | `adressraum` | Adressbits, Adressbereiche, Byte- vs. Wortadressierung, Struct-Padding. |

## Rechnerarchitektur & Logik

| Werkzeug | id | Inhalt |
| --- | --- | --- |
| Logikgatter & Wahrheitstabellen | `logikgatter` | Gatter und boolesche Ausdrücke mit 2–4 Variablen, Tabellen und Vereinfachung. |
| Logikschaltungs-Simulator | `logikschaltung` | Kombinatorische Schaltungen aus Gattern zusammenstellen und prüfen. |
| ASCII- & Unicode-Tabelle | `zeichentabelle` | Codepoints, UTF-8-Bytes und Zeichen nachschlagen. |
| Speicherlayout & Hexdump | `speicherlayout` | Simulierter Speicher mit Hexdump, Endianness, Lesen und Schreiben. |

Auch hier aufgeführt: Zahlensysteme, Bit- und Byte-Inspektor, Binärarithmetik & Zweierkomplement, Text & UTF-8, IEEE-754-Gleitkomma, Adressraum & Alignment.

## Netzwerktechnik

| Werkzeug | id | Inhalt |
| --- | --- | --- |
| IPv4-Subnetting | `ipv4-subnetting` | Netz, Broadcast und Hosts berechnen, eigene Lösungen prüfen und Aufgaben speichern. *(seit 1.0)* |
| IPv6-Rechner | `ipv6` | Validieren, kürzen, expandieren, Präfixe, Adresstypen und Subnetze. |
| OSI- & TCP/IP-Modell | `osi-modell` | Schichten, Protokolle, PDUs und Kapselung Schritt für Schritt. |
| TCP-Handshake-Simulator | `tcp-handshake` | SYN, SYN-ACK, ACK, Sequenznummern, Abbau und Fehlerfälle. |
| DNS-Auflösung | `dns-simulator` | Rekursive Auflösung über Root, TLD und autoritative Server, mit Cache und TTL. |
| Routing-Tabelle | `routing-tabelle` | Eigene Routen, Longest-Prefix-Match und Metrik nachvollziehen. |
| Ports & Protokolle | `ports` | Häufige TCP-/UDP-Ports durchsuchen, eigene Einträge speichern. |
| Durchsatz & Latenz | `netzwerkdurchsatz` | Bandbreite, RTT, Übertragungsdauer und Bandwidth-Delay-Product. |
| IPv4-Header-Inspektor | `ipv4-header` | Headerfelder aus Bytes dekodieren und Prüfsumme kontrollieren. |
| Netzwerktopologie | `topologie` | Kleine Topologie mit Clients, Switches und Routern – Paketweg verfolgen. |

Auch hier aufgeführt: Übertragungszeit.

## Betriebssysteme & Linux

| Werkzeug | id | Inhalt |
| --- | --- | --- |
| Linux-Dateirechte | `dateirechte` | rwx und Oktal umrechnen, chmod, SUID, SGID, Sticky Bit. |
| Befehlsreferenz Linux & Windows | `befehle` | Wichtige Befehle nach Aufgabe – getrennt für Linux und Windows. |
| Prozess-Scheduling | `scheduling` | FCFS, SJF, Priority, Round Robin mit Gantt-Diagramm und Wartezeiten. |
| RAID & Backup-Grundlagen | `raid-backup` | RAID-Level, Backup-Arten und die 3-2-1-Regel im Überblick. |

Auch hier aufgeführt: RAID-Kapazität.

## Programmierung & Algorithmen

| Werkzeug | id | Inhalt |
| --- | --- | --- |
| Sortieralgorithmen | `sortieren` | Bubble, Selection, Insertion, Merge, Quick – Schritt für Schritt. |
| Big-O-Explorer | `big-o` | Wachstumsraten theoretischer Komplexitätsklassen vergleichen. |
| Datenstrukturen | `datenstrukturen` | Stack, Queue, verkettete Liste, Suchbaum und Hash-Tabelle bedienen. |
| Reguläre Ausdrücke | `regex` | JavaScript-RegExp testen, Treffer und Gruppen hervorheben. |
| Git-Branching-Simulator | `git-simulator` | Commits, Branches, Merge und Rebase als Graph – nur simuliert. |
| Codebeispiele | `codebeispiele` | Eigene Codebeispiele mit Erklärung und Syntaxhervorhebung. *(seit 1.0)* |

Auch hier aufgeführt: Text vergleichen (Diff).

## Datenbanken

| Werkzeug | id | Inhalt |
| --- | --- | --- |
| SQL-Spielplatz | `sql-spielplatz` | Echte SQL-Abfragen auf einer Beispieldatenbank im Arbeitsspeicher. |
| Normalisierung | `normalisierung` | 1NF, 2NF, 3NF, funktionale Abhängigkeiten und Anomalien. |

## Webtechnologien & Datenformate

| Werkzeug | id | Inhalt |
| --- | --- | --- |
| JSON formatieren & prüfen | `json` | JSON validieren, formatieren, komprimieren – mit Fehlerposition. |
| URL codieren & zerlegen | `url` | Prozentcodierung und URL-Bestandteile. |
| Base64 | `base64` | Text (UTF-8) und Dateien in Base64 und zurück. |
| Zeitstempel | `zeitstempel` | Unix-Zeit in Datum umrechnen und umgekehrt, mit Zeitzonen. |
| Text vergleichen (Diff) | `diff` | Zeilenweiser Vergleich zweier Texte. |
| UUID-Generator | `uuid` | Zufällige UUIDs (Version 4) erzeugen und prüfen. |
| HTTP-Statuscodes | `http-status` | Statuscodes nachschlagen und verstehen. |
| MIME-Typen | `mime-typen` | Dateiendungen und Medientypen nachschlagen. |

Auch hier aufgeführt: Text & UTF-8, ASCII- & Unicode-Tabelle, Reguläre Ausdrücke, Hashes & Prüfsummen.

## Kryptografie & IT-Sicherheit

| Werkzeug | id | Inhalt |
| --- | --- | --- |
| Hashes & Prüfsummen | `hashes` | SHA-256/384/512 für Text und Dateien, Hashes vergleichen. |
| Passwortentropie | `passwortentropie` | Theoretische Entropie und Suchdauer unter offengelegten Annahmen. |
| Verschlüsselungsgrundlagen | `krypto-grundlagen` | Hashing, symmetrisch, asymmetrisch und Signaturen im Vergleich. |

## Zeit, Leistung & Berechnungen

| Werkzeug | id | Inhalt |
| --- | --- | --- |
| Frequenz & Periodendauer | `frequenz` | Hz bis GHz umrechnen, Periodendauer und Takte berechnen. |
| Leistung, Energie & Laufzeit | `leistung` | Watt, Wattstunden, Akkulaufzeit und Energiekosten. |
| Prozent & Verhältnisse | `prozent` | Prozentwerte, Veränderungen, Dreisatz und Verhältnisse. |
| Formelsammlung | `formelsammlung` | Eigene LaTeX-Formeln mit Erklärung. *(seit 1.0)* |

Auch hier aufgeführt: Datenmengen-Konverter, Übertragungszeit, Speicherplatz & Kapazität, Durchsatz & Latenz, Zeitstempel.

## Aufbau im Code

| Ort | Inhalt |
| --- | --- |
| `public/js/tools/registry.js` | Verzeichnis aller Werkzeuge, Kategorien, Suche |
| `public/js/tools/kit.js` | gemeinsame Bausteine: Felder, Ergebnisliste mit Kopieren, Rechenweg, Hinweise, Live-Berechnung, Schrittsteuerung für Simulationen |
| `public/js/tools/core/*.js` | reine Rechenlogik ohne DOM, mit Node getestet (`test/tools-*.test.js`) |
| `public/js/tools/ui/<modul>.js` | Oberfläche je Kategorie, wird erst beim Öffnen geladen |
| `public/css/tools.css`, `public/css/tools/*.css` | Gestaltung (hell/dunkel über die vorhandenen Farbvariablen) |
| `server/api-tools.js`, `server/sql-sandbox*.js` | SQL-Spielplatz (einziger Server-Teil) |

Gemeinsame Logik wird nicht doppelt implementiert: Einheiten (`core/units.js`),
exakte Brüche (`core/num.js`) und Zahlensysteme (`core/bases.js`) nutzen alle
Werkzeuge gemeinsam; der RAID-Rechner existiert nur einmal, die
RAID-&-Backup-Seite verlinkt ihn.

## Gespeicherte Daten

Eingaben werden nicht gespeichert. Ausnahmen, jeweils nur auf ausdrücklichen
Klick, in der vorhandenen Tabelle `settings` (damit auch im Backup):

- `tools_favorites` – Liste der gemerkten Werkzeuge
- `tools_custom_ports` – eigene Einträge der Port-Referenz

„Einstellungen zurücksetzen“ entfernt beides.

## SQL-Spielplatz – Sicherheit

- Jede Ausführung: neue In-Memory-Datenbank mit Beispieldaten, nie die
  Nutzerdatenbank.
- Eigener Kindprozess, der nach 2 s hart beendet wird (ein Worker-Thread lässt
  sich während einer laufenden SQLite-Abfrage nicht zuverlässig abbrechen).
- Grenzen: 20 000 Zeichen, 20 Anweisungen, 500 Zeilen je Ergebnis, 16 MiB
  Datenbankgröße, Speicherlimit, höchstens 2 gleichzeitige Ausführungen.
- `node:sqlite` hat keinen Authorizer; ein Tokenizer lässt nur Anweisungen zu,
  die mit SELECT, WITH, VALUES, INSERT, UPDATE, DELETE, REPLACE,
  CREATE TABLE/VIEW/INDEX, DROP, ALTER, EXPLAIN, BEGIN, COMMIT, END oder
  ROLLBACK beginnen, und sperrt ATTACH, DETACH, VACUUM, PRAGMA, `pragma_*`,
  Trigger, virtuelle Tabellen und `load_extension`.

## Bekannte Grenzen

- **RAID:** klassisches Modell (je Laufwerk zählt die Größe des kleinsten);
  SHR, ZFS, Btrfs rechnen anders. RAID-10-Paare in Eingabereihenfolge.
- **IEEE 754, float:** Eingaben werden zuerst als double gelesen und dann auf
  float gerundet (in seltenen Grenzfällen doppelte Rundung).
- **Struct-Layout:** übliche ABI-Vorgaben (LP64, LLP64, ILP32); Compiler-Optionen
  können abweichen.
- **Logikausdrücke:** kein implizites AND (`A'B` → Fehlermeldung mit Hinweis).
- **Netzwerk-Simulationen:** DNS mit einem Server je Ebene, ohne DNSSEC; TCP
  ohne Fenster und Optionen; Routing ohne administrative Distanz; Topologie
  ohne ARP-Cache und NAT; Durchsatz ohne Slow Start und Verluste.
- **Git-Simulator:** keine Dateien, Konflikte, Remotes oder interaktiver Rebase.
- **Regex:** native JavaScript-RegExp im Web Worker, 1 s Zeitlimit.
- **SQL:** SQLite-Dialekt; bloße Spaltennamen `pragma`/`trigger` werden
  abgelehnt (in Anführungszeichen erlaubt). Je Ausführung ca. 40–90 ms für den
  Kindprozess.
- **Schriften:** Ob Emojis und seltene Zeichen sichtbar sind, hängt von den
  installierten Schriften ab.
- **Passwortentropie:** gilt nur für zufällig gewählte Passwörter; Suchdauern
  beruhen auf ausgewiesenen Annahmen.
