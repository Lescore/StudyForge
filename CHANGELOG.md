# Changelog

Alle nennenswerten Änderungen an StudyForge. Versionierung nach
[Semantic Versioning](https://semver.org/lang/de/): neue, abwärtskompatible
Funktionen erhöhen die mittlere Stelle.

## [1.2.0] – 2026-10-23

### Neu: Informatik-Werkzeuge

Der Bereich „Informatik-Werkzeuge“ ist jetzt eine Werkzeugkiste mit 51
Rechnern, Simulationen und Nachschlagewerken in 9 Kategorien – mit Suche
(auch ohne Umlaute), Favoriten und eigener Adresse je Werkzeug
(`#/werkzeuge/<id>`). Übersicht aller Werkzeuge: [docs/WERKZEUGE.md](docs/WERKZEUGE.md).

- **Datenmengen & Zahlensysteme:** Datenmengen-Konverter (Bit/Byte, SI und
  IEC, Datenraten), Übertragungszeit (Dauer, nötige Rate, übertragbare Menge,
  Wirkungsgrad als Annahme), Speicherplatz & Kapazität (Dateilisten, Belegung,
  Medienanzahl, Hersteller- vs. Betriebssystemangabe, Wachstum), RAID 0/1/5/6/10,
  Zahlensysteme (Basis 2–36, Nachkommastellen, Rechenweg), Bit-/Byte-Inspektor,
  Binärarithmetik & Zweierkomplement, Text & UTF-8, IEEE-754-Gleitkomma,
  Adressraum & Struct-Alignment. Exakte Arithmetik mit BigInt-Brüchen.
- **Rechnerarchitektur & Logik:** Logikgatter und boolesche Ausdrücke mit
  Wahrheitstabelle und minimaler DNF (Quine-McCluskey),
  Logikschaltungs-Simulator, ASCII-/Unicode-Tabelle, simulierter Speicher mit
  Hexdump und Endianness.
- **Netzwerktechnik:** IPv6-Rechner, OSI-/TCP-IP-Modell mit Kapselung,
  TCP-Handshake-, DNS-, Routing- und Topologie-Simulator, Port-Referenz (eigene
  Einträge speicherbar), Durchsatz & Latenz (BDP), IPv4-Header-Inspektor.
- **Betriebssysteme & Linux:** Dateirechte/chmod/umask, Befehlsreferenz Linux,
  Windows cmd und PowerShell getrennt, Scheduling (FCFS, SJF, SRTF, Priority,
  Round Robin) mit Gantt-Diagramm, RAID- und Backup-Grundlagen.
- **Programmierung & Algorithmen:** Sortier-Visualisierer (5 Verfahren),
  Big-O-Explorer, Datenstrukturen (Stack, Queue, Liste, Suchbaum,
  Hash-Tabelle), Regex-Tester (im Web Worker mit Zeitlimit), Git-Simulator.
- **Datenbanken:** SQL-Spielplatz mit echter SQLite auf einer
  Beispieldatenbank, Normalisierung (1NF–3NF/BCNF, Kandidatenschlüssel,
  Anomalien).
- **Web & Datenformate:** JSON, URL, Base64, Zeitstempel, Diff, UUID (v4/v7),
  HTTP-Statuscodes, MIME-Typen.
- **Kryptografie & IT-Sicherheit:** SHA-256/384/512 für Text und Dateien
  (Web Crypto), Passwortentropie mit offengelegten Annahmen,
  Verschlüsselungsgrundlagen mit AES-GCM-, ECDSA- und Hash-Demos.
- **Zeit, Leistung & Berechnungen:** Frequenz/Periodendauer, Leistung/Energie/
  Akkulaufzeit/Kosten, Prozent, Dreisatz und Verhältnisse.

Jedes Werkzeug hat Beispiele, Zurücksetzen, Kopieren-Knöpfe, Rechenweg bzw.
Schrittsteuerung und eine kurze Erklärung. Simulationen sind gekennzeichnet und
verändern nichts am System; es werden keine Pakete oder DNS-Anfragen gesendet.

### Geändert

- Die bisherigen Tabs (Subnetting, Codebeispiele, Formelsammlung) sind jetzt
  Werkzeuge in der Übersicht; alte Links `#/werkzeuge?tab=…` werden
  weitergeleitet. Gespeicherte Subnetting-Aufgaben, Codebeispiele und Formeln
  bleiben unverändert.
- Einstellungen kennen zwei neue Schlüssel (`tools_favorites`,
  `tools_custom_ports`, je eine JSON-Liste). Sie werden nur auf ausdrücklichen
  Klick gespeichert. Kein neues Datenbankschema, kein neues Backup-Format.

### Einrichtung

- **`setup.cmd` (Windows) und `setup.sh` (Linux/macOS):** prüfen Node.js,
  laden bei Bedarf nach Rückfrage eine portable Node-Version (22.23.3) von
  nodejs.org nach `runtime/node` – ohne Administratorrechte, mit Prüfung der
  SHA-256-Prüfsumme –, legen optional eine Desktop-Verknüpfung bzw. einen
  Menüeintrag an und prüfen die Einrichtung (`scripts/setup-check.js`).
- `start.*` und `stop.*` verwenden `runtime/node` automatisch; `start.cmd`
  meldet eine zu alte Node-Version jetzt verständlich.
- Neue Anleitung für Nutzer: [ANLEITUNG.md](ANLEITUNG.md) (Einrichten, Starten,
  Daten, Weitergeben ohne persönliche Daten, Update, USB-Stick, Probleme lösen).
- `npm test` führt nur noch `test/*.test.js` aus (vorher wurden auch die
  Hilfsdateien `helpers.js` und `pdf-fixture.js` als „Test“ mitgezählt).

### Repository

- Für GitHub vorbereitet: `LICENSE` (MIT), `.gitattributes` (feste Zeilenenden:
  LF für Shell-Skripte, CRLF für `.cmd`/`.ps1`), erweitertes `.gitignore`
  (persönliche Daten in `data/` und `runtime/` werden nie eingecheckt),
  GitHub-Actions-Workflow mit Tests und Offline-Prüfung, neue Screenshots mit
  Demo-Daten, Schnellstart im README.

### Server

- Neuer Endpunkt `POST /api/tools/sql` (und `GET /api/tools/sql/schema`) für
  den SQL-Spielplatz: frische In-Memory-Datenbank je Ausführung in einem
  eigenen Kindprozess mit 2 s Zeitlimit, Speicher- und Zeilengrenzen;
  ATTACH, VACUUM, PRAGMA, Trigger und Erweiterungen sind gesperrt. Die
  Nutzerdatenbank wird nie verwendet.

## [1.1.0] – 2026-10-21

### Neu

- **Kalender** (`#/kalender`) mit Monats-, Wochen- und Listenansicht,
  Navigation in Vergangenheit und Zukunft, Filter nach Quelle und Terminart.
  Terminarten werden farblich unterschieden: Termin, Lehrveranstaltung,
  Prüfung, Abgabe. Abgesagte Termine sind durchgestrichen.
- **ICS-Import** (iCalendar, RFC 5545) per Dateiauswahl oder Drag-and-drop,
  mehrere Dateien nacheinander. Vor dem Speichern zeigt eine Vorschau alle
  erkannten Termine mit Status (neu, aktualisiert, unverändert, älter,
  Duplikat, entfällt), Lesefehlern und Hinweisen. Abbrechen speichert nichts.
- Unterstützt: `SUMMARY`, `DESCRIPTION`, `LOCATION`, `DTSTART`/`DTEND`/`DURATION`,
  ganztägige Termine, Zeitzonen (`VTIMEZONE`, IANA, Windows-Namen, UTC),
  `UID`, `LAST-MODIFIED`, `SEQUENCE`, `RRULE`/`RDATE`/`EXDATE`,
  `RECURRENCE-ID`-Ausnahmen, `VALARM` (Anzeige), `ORGANIZER`, `ATTENDEE`,
  `STATUS`, `CATEGORIES`. UTF-8 und Windows-1252.
- **Termindetails** mit Zeit, Ort, Beschreibung, Organisator, Teilnehmenden,
  Erinnerungen und Quelle; Terminart lässt sich selbst festlegen.
- **Verknüpfung Kalender ↔ Prüfung**: Termin mit vorhandener Prüfung
  verbinden, Verknüpfung ändern oder aufheben, neue Prüfung direkt aus einem
  Termin anlegen (Titel, Datum, Uhrzeit, Ort, Beschreibung vorbelegt und
  bearbeitbar; automatisch verknüpft).
- **Prüfungsansicht** zeigt den verknüpften Termin (Datum, Uhrzeit, Ort,
  Beschreibung, Quelle), Abweichungen bei Datum/Uhrzeit/Ort mit
  „aus Kalender übernehmen“ (nie automatisch) und „Im Kalender öffnen“.
- **Unverbindliche Verknüpfungsvorschläge** (gleiches Datum und gemeinsamer
  Titelbegriff bzw. als Prüfung erkannter Termin). Verknüpft wird nur nach
  Bestätigung.
- Prüfungen haben jetzt optional **Uhrzeit** und **Ort**.
- Dashboard „Nächste Termine“ zeigt zusätzlich unverknüpfte Prüfungen und
  Abgaben aus importierten Kalendern.
- Einstellungen zeigen App-Version, Datenbankschema und die letzte Migration.
- **`stop.sh` / `stop.cmd` / `npm run stop`** beenden eine laufende Instanz
  sauber (wie `Strg+C`). Der Starthelfer hinterlegt dafür
  `data/studyforge.instance.json` mit Port und zufälligem Schlüssel; der
  Endpunkt `POST /api/shutdown` existiert nur bei Start über den Starthelfer
  und verlangt diesen Schlüssel. Veraltete Instanzdateien werden erkannt,
  fremde Prozesse nie beendet.
- **Fächer löschen**: In der Fachansicht gibt es jetzt „Löschen“ (die
  Funktion fehlte in der Oberfläche). Der Bestätigungsdialog nennt, was
  mitgelöscht wird (Themen, Lernziele) und was erhalten bleibt (Notizen, Karten,
  Dokumente, Aufgaben, Prüfungen – danach ohne Fach). War das Fach als
  „zuletzt gewählt“ gespeichert, wird diese Einstellung geleert.
- **Zurücksetzen** in den Einstellungen: nur Einstellungen auf Standardwerte,
  oder alle Daten löschen (Eingabe von `ZURÜCKSETZEN` nötig, vorher
  automatisches ZIP-Backup `data/backups/auto-vor-zuruecksetzen-*.zip`;
  scheitert es, wird nichts gelöscht). Endpunkt `POST /api/reset`.

### Geändert

- **App-Icon und Favicon vereinheitlicht**: Überall wird jetzt die
  StudyForge-Kachel „SF“ (Markenfarbe `#0f766e`) verwendet. Bisher zeigte das
  Favicon ein Buch-Symbol, die Navigation dagegen das „SF“-Textlogo.
  - `public/favicon.svg` (Vektorpfade statt Schrift, dadurch überall gleich)
  - neu: `public/favicon.ico` (16/32/48 px), `public/icons/favicon-16.png`,
    `public/icons/favicon-32.png`, `public/icons/apple-touch-icon.png` (180 px)
  - Logo in der Navigation nutzt dieselbe SVG-Datei
  - Verweise mit `?v=1.1.0` gegen veraltete Browser-Caches
- `start.sh` bevorzugt eine portable Node-Version unter
  `~/.local/share/node/current` und meldet eine zu alte Node-Version klar.

### Datenbank-Migration (Schema 2 → 3)

- Neue Tabellen `calendar_sources` und `calendar_events`.
- Neue Spalten `exams.start_time`, `exams.location`, `exams.calendar_event_id`
  (mit eindeutigem Teilindex: ein Termin gehört höchstens zu einer Prüfung).
- Nur additive Änderungen in einer Transaktion; vorhandene Daten werden nicht
  verändert. Vorher wird automatisch
  `data/backups/vor-migration-schema2-zu-3-<Zeitstempel>.db` erstellt und auf
  Integrität und vollständige Datensatzzahlen geprüft. Schlägt diese Prüfung
  fehl, startet StudyForge nicht und migriert nichts.
- Datenbanken mit einem neueren Schema werden abgelehnt statt beschädigt.

### Backup und Wiederherstellung

- ZIP- und JSON-Backups enthalten die Kalendertabellen und Verknüpfungen
  (Backup-Format weiterhin Version 1).
- Backups aus 1.0.0 lassen sich weiterhin wiederherstellen; fehlende
  Kalendertabellen gelten als leer (mit Hinweis statt Fehler).

### Abhängigkeiten

- **ical.js 2.2.1** (MPL-2.0) mitgeliefert unter `server/vendor/ical/` – wie
  KaTeX ohne `npm install`, ohne Netzwerk. `package.json` hat weiterhin keine
  Abhängigkeiten.

### Behoben

- Uploads über der Größengrenze beim Kalenderimport werden mit einer
  verständlichen Meldung (HTTP 413) abgelehnt, statt die Verbindung abzubrechen.

## [1.0.0] – 2026-10-20

Erste Version: Notizen, Karteikarten mit FSRS, Lernmodus, Dokumente mit
PDF-Volltext, Aufgaben, Prüfungen, Informatik-Werkzeuge, Vorlagen, Backups.
