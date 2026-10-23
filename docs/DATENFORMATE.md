# Datenformate

StudyForge exportiert bewusst offene, lesbare Formate. Alle Dateien bleiben
unter deiner Kontrolle; es gibt keine proprietäre Cloud-Struktur.

## 1. Vollständiges Backup (ZIP)

Dateiname: `studyforge-backup-JJJJ-MM-TT.zip`

```
manifest.json      Metadaten und Prüfsummen
data.json          alle Tabellen als JSON-Arrays
README.txt         kurze Wiederherstellungsanleitung
files/<uuid>.<ext> Kopien aller Anhänge und Dokumente
```

`manifest.json`:

```json
{
  "format": "studyforge-backup",
  "version": 1,
  "appVersion": "1.1.0",
  "createdAt": "2026-10-20T18:00:00.000Z",
  "dataFile": "data.json",
  "counts": {
    "semesters": 2, "subjects": 6, "notes": 120, "cards": 340,
    "tasks": 18, "documents": 12, "attachments": 9, "reviews": 800,
    "calendarSources": 1, "calendarEvents": 140
  },
  "fileChecksums": { "<uuid>.pdf": "<sha256>" }
}
```

`data.json` enthält für jede Tabelle ein Array mit den unveränderten
Datenbankzeilen, z. B.:

```json
{
  "semesters": [{ "id": 1, "name": "1. Semester", "position": 0, ... }],
  "subjects":  [{ "id": 1, "name": "Netzwerktechnik", ... }],
  "notes":     [{ "id": 1, "title": "OSI-Modell", "content": "# OSI\n…", ... }],
  "cards":     [{ "id": 1, "front": "…", "back": "…", "due": "…", ... }],
  "files":     [{ "id": 1, "stored_name": "…", "sha256": "…", ... }]
}
```

Beim Einlesen prüft StudyForge:

- Formatkennung und Version,
- Vollständigkeit aller Tabellen (Ausnahme: Backups aus 1.0.0 enthalten noch
  keine Kalendertabellen – sie werden mit einem Hinweis als leer übernommen),
- dass jede in `files` referenzierte Datei im Archiv liegt,
- SHA-256 gegen die Prüfsumme in Datensatz und Manifest,
- Fremdschlüssel nach dem Einspielen.

Erst wenn alles stimmt, wird nach Bestätigung ersetzt. Vorher entsteht
automatisch `data/backups/auto-vor-wiederherstellung-<Zeitstempel>.zip`
(die letzten zehn werden behalten). Schlägt die Prüfung fehl, bleiben die
vorhandenen Daten unangetastet.

## 2. Datenexport (JSON)

Dateiname: `studyforge-daten-JJJJ-MM-TT.json`

```json
{
  "format": "studyforge-data",
  "version": 1,
  "appVersion": "1.1.0",
  "exportedAt": "2026-10-20T18:00:00.000Z",
  "counts": { "notes": 120, "cards": 340, "files": 21 },
  "note": "Vollständiger Datenexport inklusive Anhängen …",
  "data": { "notes": [], "cards": [], "files": [] },
  "binaries": [
    {
      "stored_name": "<uuid>.pdf",
      "original_name": "Skript.pdf",
      "sha256": "<sha256>",
      "data_base64": "JVBERi0xLjQK…"
    }
  ]
}
```

Dieser Export ist ebenfalls vollständig (inklusive Dateien) und lässt sich
über „Sichern & Wiederherstellen → Backup einlesen“ zurückspielen. Für große
Sammlungen ist das ZIP-Backup platzsparender.

## 3. Karteikarten (JSON)

Dateiname: `studyforge-karten-JJJJ-MM-TT.json`

```json
{
  "format": "studyforge-cards",
  "version": 1,
  "exportedAt": "2026-10-20T18:00:00.000Z",
  "note": "Karteninhalt und Planungsstand. …",
  "decks": [
    { "name": "Netzwerk Basics", "subject_id": 1, "description": "" }
  ],
  "cards": [
    {
      "deck": "Netzwerk Basics",
      "type": "qa",
      "front": "Welche Portnummer verwendet HTTPS?",
      "back": "443",
      "options": [],
      "correct_index": null,
      "explanation": "",
      "topic": "Netzwerk Basics",
      "tags": ["Netzwerk", "Ports"],
      "scheduling": {
        "state": "review",
        "due": "2026-10-24T09:00:00.000Z",
        "stability": 5.21,
        "difficulty": 4.83,
        "reps": 3,
        "lapses": 0,
        "last_review": "2026-10-20T09:00:00.000Z"
      }
    }
  ]
}
```

Unterstützte `type`-Werte:

| Typ | Bedeutung | Pflichtfelder |
| --- | --- | --- |
| `qa` | Frage und Antwort | `front`, `back` |
| `definition` | Begriff und Definition | `front`, `back` |
| `cloze` | Lückentext | `front` mit mindestens einer Lücke `{{…}}`, `back` |
| `truefalse` | Richtig oder falsch | `front`, `back`, `correct_index` 0 oder 1 |
| `mc` | Multiple Choice | `front`, `back`, mindestens zwei `options`, gültiger `correct_index` |
| `code` | Code- und Syntaxfrage | `front`, `back` |

Import: Ziel-Stapel auswählen; die Karten werden **hinzugefügt**, vorhandene
Karten bleiben unverändert. Der Planungsstand (`scheduling`) wird bewusst
**zurückgesetzt** (`state: new`, `due: null`), damit importierte Karten nicht
fälschlich als „gelernt“ gelten. Ungültige Karten werden übersprungen und im
Ergebnis gemeldet (`skipped`, `errors`).

## 4. Markdown-Export (ZIP)

Dateiname: `studyforge-markdown-JJJJ-MM-TT.zip`

```
README.md
Notizen/<Fach>/<Titel>.md
Anhänge/<Notiz-ID>-<Dateiname>
Dokumente/<Fach>/<Dateiname>
```

Jede Notiz beginnt mit YAML-Frontmatter:

```markdown
---
title: "OSI-Modell"
subject: "Netzwerktechnik"
topic: "Grundlagen"
tags: ["Prüfung", "OSI"]
created: 2026-10-20T08:00:00.000Z
updated: 2026-10-20T09:30:00.000Z
studyforge-id: 12
---
```

Der Inhalt bleibt Markdown (inklusive `[[Verknüpfungen]]` und Formeln). Dieser
Export ist zum Lesen, Archivieren und für andere Markdown-Werkzeuge gedacht;
für eine vollständige Wiederherstellung bitte das ZIP-Backup verwenden.

## 5. Einzelne Notiz

`GET /api/export/note/:id` liefert eine `.md`-Datei mit Titel, Metadaten,
Inhalt, Schlagwörtern, Verknüpfungen und einer Liste der Anhänge.

## 6. Datenbank

Die SQLite-Datei `data/studyforge.db` ist das Arbeitsformat. Sie ist lesbar,
aber **kein vollständiges Backup** – Anhänge liegen separat unter `data/files/`.
Für Sicherungen immer das ZIP- oder JSON-Backup verwenden.

Seit 1.1.0 (Schema 3) kommen hinzu:

| Tabelle / Spalte | Inhalt |
| --- | --- |
| `calendar_sources` | eine importierte `.ics`-Datei: Name, Dateiname, `X-WR-CALNAME`, `PRODID`, SHA-256 des letzten Imports |
| `calendar_events` | ein Termin bzw. ein Vorkommen einer Serie. Identität je Quelle: `(uid, recurrence_id)`; `recurrence_id` ist bei Einzelterminen leer |
| `exams.calendar_event_id` | primärer Kalendertermin einer Prüfung (höchstens einer; ein Termin gehört höchstens zu einer Prüfung) |
| `exams.start_time`, `exams.location` | Uhrzeit (`HH:MM`) und Ort der Prüfung – eigene Angaben, unabhängig vom Kalender |

Zeitangaben in `calendar_events`: ganztägige Termine als `JJJJ-MM-TT`
(`end` exklusiv wie in RFC 5545), alle anderen als UTC-Zeitstempel
(`2026-10-28T07:00:00.000Z`); die ursprüngliche Zeitzone steht in `tzid`.
`attendees` und `alarms` sind JSON-Arrays. `category` ist `termin`,
`lehrveranstaltung`, `pruefung` oder `abgabe`; `category_manual = 1` heißt,
die Einordnung stammt von dir und bleibt bei erneutem Import erhalten.
`removed_at` ist gesetzt, wenn der Termin beim letzten Import der Quelle fehlte,
aber wegen einer Prüfungsverknüpfung behalten wurde.

Beim Start einer älteren Datenbank wird automatisch migriert. Vorher entsteht
`data/backups/vor-migration-schema<alt>-zu-<neu>-<Zeitstempel>.db` – eine per
`VACUUM INTO` erzeugte, auf Integrität und Datensatzzahlen geprüfte Kopie.
Zur Rückkehr auf den alten Stand: StudyForge beenden, `data/studyforge.db`
durch diese Datei ersetzen (umbenennen in `studyforge.db`) und die alte
Version starten.

## 7. Kalender (.ics, Import)

StudyForge liest iCalendar-Dateien nach RFC 5545 (`.ics`, `.ical`, `.ifb`),
schreibt aber keine zurück. Übernommen werden `SUMMARY`, `DESCRIPTION`,
`LOCATION`, `DTSTART`/`DTEND`/`DURATION`, ganztägige Termine (`VALUE=DATE`),
`TZID` mit oder ohne `VTIMEZONE` (IANA- und gängige Windows-Namen), UTC (`Z`),
`UID`, `RECURRENCE-ID`, `RRULE`/`RDATE`/`EXDATE`, `SEQUENCE`, `LAST-MODIFIED`,
`STATUS`, `CATEGORIES`, `ORGANIZER`, `ATTENDEE` (bis 100) und `VALARM`
(Zeitpunkt bzw. Abstand; nur zur Anzeige). `VTODO`/`VJOURNAL` werden gezählt,
aber nicht importiert.

Grenzen: 5 MB je Datei, 5000 `VEVENT`s, 1000 Vorkommen je Serie, 20 000
Vorkommen je Import. Vorkommen wiederkehrender Termine werden für den
Zeitraum ein Jahr zurück bis zwei Jahre voraus gespeichert; Einzeltermine
immer.
