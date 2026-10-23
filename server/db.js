import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { isoFileStamp, nowISO } from './util.js';

/** Aktuelle Schemaversion. 3 = Kalender (v1.1.0). */
export const SCHEMA_VERSION = 3;

/**
 * Tabellen, die erst mit einer späteren Version hinzugekommen sind. Backups
 * älterer Versionen enthalten sie nicht; sie gelten dann als leer.
 */
export const OPTIONAL_TABLES = new Set(['calendar_sources', 'calendar_events']);

export const TABLES = [
  'settings',
  'semesters',
  'subjects',
  'folders',
  'notes',
  'tags',
  'note_tags',
  'note_links',
  'note_versions',
  'files',
  'decks',
  'cards',
  'reviews',
  'tasks',
  'subtasks',
  'task_notes',
  'task_files',
  'calendar_sources',
  'calendar_events',
  'exams',
  'topics',
  'goals',
  'snippets',
  'formulas',
  'subnet_exercises',
  'templates'
];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS semesters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  semester_id INTEGER REFERENCES semesters(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'aktiv',
  color TEXT NOT NULL DEFAULT 'indigo',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  topic TEXT NOT NULL DEFAULT '',
  pinned INTEGER NOT NULL DEFAULT 0,
  favorite INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  search_blob TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE IF NOT EXISTS note_tags (
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

CREATE TABLE IF NOT EXISTS note_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  target_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  UNIQUE (source_id, target_id)
);

CREATE TABLE IF NOT EXISTS note_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stored_name TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'application/octet-stream',
  size INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'document',
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',
  note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  search_blob TEXT NOT NULL DEFAULT '',
  content_text TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS decks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_id INTEGER REFERENCES decks(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'qa',
  front TEXT NOT NULL DEFAULT '',
  back TEXT NOT NULL DEFAULT '',
  options TEXT NOT NULL DEFAULT '[]',
  correct_index INTEGER,
  explanation TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  source_note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL,
  state TEXT NOT NULL DEFAULT 'new',
  due TEXT,
  stability REAL NOT NULL DEFAULT 0,
  difficulty REAL NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  last_review TEXT,
  elapsed_days REAL NOT NULL DEFAULT 0,
  scheduled_days REAL NOT NULL DEFAULT 0,
  suspended INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL,
  reviewed_at TEXT NOT NULL,
  prev_state TEXT,
  new_state TEXT,
  prev_stability REAL,
  new_stability REAL,
  prev_difficulty REAL,
  new_difficulty REAL,
  scheduled_days REAL,
  elapsed_days REAL,
  duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  topic TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'normal',
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'offen',
  exam_id INTEGER REFERENCES exams(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS subtasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS task_notes (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, note_id)
);

CREATE TABLE IF NOT EXISTS task_files (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, file_id)
);

CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  date TEXT,
  topics TEXT NOT NULL DEFAULT '',
  goals TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  open_topics TEXT NOT NULL DEFAULT '',
  confidence INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  start_time TEXT,
  location TEXT NOT NULL DEFAULT '',
  calendar_event_id INTEGER REFERENCES calendar_events(id) ON DELETE SET NULL
);

-- Eine importierte .ics-Datei. Wird beim erneuten Import derselben Quelle aktualisiert.
CREATE TABLE IF NOT EXISTS calendar_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  filename TEXT NOT NULL DEFAULT '',
  calendar_name TEXT NOT NULL DEFAULT '',
  prodid TEXT NOT NULL DEFAULT '',
  sha256 TEXT NOT NULL DEFAULT '',
  event_count INTEGER NOT NULL DEFAULT 0,
  last_import_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Ein Termin bzw. ein einzelnes Vorkommen eines wiederkehrenden Termins.
-- Identität innerhalb einer Quelle: (uid, recurrence_id); recurrence_id ist
-- bei Einzelterminen leer. Importierte Felder werden nie von StudyForge
-- verändert – nur category (wenn category_manual = 1) ist eine eigene Angabe.
CREATE TABLE IF NOT EXISTS calendar_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES calendar_sources(id) ON DELETE CASCADE,
  uid TEXT NOT NULL,
  recurrence_id TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0,
  tzid TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  rrule TEXT NOT NULL DEFAULT '',
  is_exception INTEGER NOT NULL DEFAULT 0,
  organizer TEXT NOT NULL DEFAULT '',
  attendees TEXT NOT NULL DEFAULT '[]',
  alarms TEXT NOT NULL DEFAULT '[]',
  categories TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'termin',
  category_manual INTEGER NOT NULL DEFAULT 0,
  sequence INTEGER NOT NULL DEFAULT 0,
  last_modified TEXT,
  content_hash TEXT NOT NULL DEFAULT '',
  removed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (source_id, uid, recurrence_id)
);

CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offen',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (subject_id, name)
);

CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'offen',
  due_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS snippets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'text',
  code TEXT NOT NULL DEFAULT '',
  explanation TEXT NOT NULL DEFAULT '',
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  topic TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS formulas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  latex TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  topic TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subnet_exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  prefix INTEGER NOT NULL DEFAULT 24,
  answer_network TEXT NOT NULL DEFAULT '',
  answer_broadcast TEXT NOT NULL DEFAULT '',
  answer_first TEXT NOT NULL DEFAULT '',
  answer_last TEXT NOT NULL DEFAULT '',
  answer_hosts INTEGER NOT NULL DEFAULT 0,
  working TEXT NOT NULL DEFAULT '',
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'notiz',
  content TEXT NOT NULL DEFAULT '',
  builtin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_subject ON notes(subject_id);
CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(due);
CREATE INDEX IF NOT EXISTS idx_cards_deck ON cards(deck_id);
CREATE INDEX IF NOT EXISTS idx_cards_subject ON cards(deck_id, due);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_files_note ON files(note_id);
CREATE INDEX IF NOT EXISTS idx_files_subject ON files(subject_id);
CREATE INDEX IF NOT EXISTS idx_reviews_card ON reviews(card_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events(start);
CREATE INDEX IF NOT EXISTS idx_calendar_events_uid ON calendar_events(uid);
`;

const DEFAULT_SETTINGS = {
  theme: 'system',
  font_size: 'md',
  review_limit: '20',
  requested_retention: '0.9',
  timer_default: '0',
  timer_minutes: '25',
  editor_split: '0',
  last_subject_id: ''
};

const BUILTIN_TEMPLATES = [
  {
    name: 'Zusammenfassung eines Kapitels',
    kind: 'zusammenfassung',
    content: `# Kapitel: {{Titel}}

## Einordnung
- Fach:
- Thema:
- Quelle / Skriptseite:

## Kernaussagen
1. 
2. 
3. 

## Begriffe und Definitionen
| Begriff | Erklärung |
| --- | --- |
|  |  |

## Beispiel
\`\`\`
\`\`\`

## Offene Fragen
- [ ] 

## Selbstkontrolle
- Was kann ich jetzt erklären?
- Was muss ich noch üben?
`
  },
  {
    name: 'Definition eines Fachbegriffs',
    kind: 'definition',
    content: `# Begriff: {{Titel}}

**Definition:**
> 

**Alltagssprache / Analogie:**

**Abgrenzung zu ähnlichen Begriffen:**

**Beispiel:**

**Typische Prüfungsfrage:**

**Quelle:**
`
  },
  {
    name: 'Schritt-für-Schritt-Lösungsweg',
    kind: 'loesungsweg',
    content: `# Aufgabe: {{Titel}}

## Gegeben
- 

## Gesucht
- 

## Lösungsschritte
1. 
2. 
3. 

## Rechnung / Herleitung
$$

$$

## Ergebnis
- 

## Kontrolle
- [ ] Einheiten geprüft
- [ ] Plausibilität geprüft
- [ ] Sonderfälle bedacht

## Fehlerquelle / Merksatz
`
  },
  {
    name: 'Technische Dokumentation',
    kind: 'dokumentation',
    content: `# {{Titel}}

## Zweck

## Voraussetzungen
- 

## Aufbau / Komponenten
| Komponente | Aufgabe |
| --- | --- |
|  |  |

## Vorgehen
1. 

## Konfiguration / Beispiel
\`\`\`
\`\`\`

## Fehlerfälle
| Symptom | Ursache | Lösung |
| --- | --- | --- |
|  |  |  |

## Sicherheitshinweise
`
  },
  {
    name: 'Fehleranalyse',
    kind: 'fehleranalyse',
    content: `# Fehler: {{Titel}}

## Beobachtung
- Was passiert?
- Fehlermeldung:

## Reproduktion
1. 

## Eingrenzung
- [ ] Konfiguration geprüft
- [ ] Logs geprüft
- [ ] Netzwerk / Verbindung geprüft
- [ ] letzte Änderung geprüft

## Ursache

## Lösung

## Vorbeugung
`
  },
  {
    name: 'Vergleich zweier Konzepte',
    kind: 'vergleich',
    content: `# Vergleich: {{Titel}}

| Kriterium | Konzept A | Konzept B |
| --- | --- | --- |
| Definition |  |  |
| Einsatzgebiet |  |  |
| Vorteile |  |  |
| Nachteile |  |  |
| Beispiel |  |  |

## Wann welches Konzept?

## Merksatz
`
  },
  {
    name: 'Prüfungsvorbereitung',
    kind: 'pruefung',
    content: `# Prüfungsvorbereitung: {{Titel}}

## Rahmen
- Prüfungsdatum:
- Hilfsmittel:
- Prüfungsform:

## Stoffliste
- [ ] 
- [ ] 

## Eigene Lernziele
1. 

## Kernbegriffe
| Begriff | Sicher? |
| --- | --- |
|  | ☐ |

## Schwierige Aufgabentypen

## Letzte Wiederholung
`
  },
  {
    name: 'Netzwerkdokumentation',
    kind: 'netzwerk',
    content: `# Netzwerk: {{Titel}}

## Netzwerkplan
| Gerät | IP-Adresse | Subnetzmaske | Gateway | Aufgabe |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## Adressierung
- Netzwerk:
- Broadcast:
- Nutzbarer Bereich:
- Anzahl Hosts:

## Dienste
| Dienst | Port / Protokoll | Zweck |
| --- | --- | --- |
| DNS | 53/UDP, TCP | Namensauflösung |
| DHCP | 67/68 UDP | automatische Adressvergabe |

## Routing

## Testfälle
\`\`\`bash
ip addr
ip route
ping <ziel>
\`\`\`

## Sicherheitshinweise
`
  },
  {
    name: 'Programmierbeispiel',
    kind: 'code',
    content: `# {{Titel}}

## Ziel

## Sprache / Umgebung
- Sprache:
- Version:

## Code
\`\`\`java
// Beispiel
\`\`\`

## Erklärung
1. 

## Eingabe / Ausgabe
| Eingabe | Erwartete Ausgabe |
| --- | --- |
|  |  |

## Fehlerfälle
- 

## Variante / Übungsaufgabe
`
  }
];

function readSchemaVersion(db) {
  const hasMeta = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'meta'").get();
  if (!hasMeta) return null;
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
  return row ? Number(row.value) || 0 : null;
}

function columnNames(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
}

/**
 * Sicherung vor einer Schemamigration: konsistente Kopie per VACUUM INTO,
 * danach schreibgeschützt öffnen, Integrität und Datensatzzahlen prüfen.
 * Schlägt die Prüfung fehl, wird nicht migriert.
 */
export function backupBeforeMigration(db, dataDir, fromVersion) {
  const backupsDir = path.join(dataDir, 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  const base = `vor-migration-schema${fromVersion}-zu-${SCHEMA_VERSION}-${isoFileStamp()}`;
  let target = path.join(backupsDir, `${base}.db`);
  for (let n = 2; fs.existsSync(target); n += 1) target = path.join(backupsDir, `${base}-${n}.db`);
  db.prepare('VACUUM INTO ?').run(target);

  const copy = new DatabaseSync(target, { readOnly: true });
  try {
    const integrity = copy.prepare('PRAGMA integrity_check').get();
    if (Object.values(integrity)[0] !== 'ok') throw new Error('Integritätsprüfung der Sicherung fehlgeschlagen.');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((row) => row.name);
    for (const table of tables) {
      const original = db.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get().c;
      const copied = copy.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get().c;
      if (original !== copied) throw new Error(`Sicherung unvollständig (Tabelle ${table}).`);
    }
  } finally {
    copy.close();
  }
  return target;
}

/** Schema 2 -> 3: Kalender. Nur additive Änderungen, keine Daten werden gelöscht. */
function migrateToV3(db) {
  const examColumns = columnNames(db, 'exams');
  if (!examColumns.includes('start_time')) db.exec('ALTER TABLE exams ADD COLUMN start_time TEXT');
  if (!examColumns.includes('location')) db.exec("ALTER TABLE exams ADD COLUMN location TEXT NOT NULL DEFAULT ''");
  if (!examColumns.includes('calendar_event_id')) {
    db.exec('ALTER TABLE exams ADD COLUMN calendar_event_id INTEGER REFERENCES calendar_events(id) ON DELETE SET NULL');
  }
}

export function openDatabase(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'studyforge.db');
  const existed = fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0;
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = DELETE;');
  db.exec('PRAGMA synchronous = FULL;');

  const versionBefore = existed ? readSchemaVersion(db) : null;
  if (versionBefore !== null && versionBefore > SCHEMA_VERSION) {
    db.close();
    throw new Error(
      `Die Datenbank stammt aus einer neueren StudyForge-Version (Schema ${versionBefore}). Bitte die passende Version verwenden.`
    );
  }
  let migrationBackup = null;
  if (versionBefore !== null && versionBefore < SCHEMA_VERSION) {
    try {
      migrationBackup = backupBeforeMigration(db, dataDir, versionBefore);
    } catch (err) {
      db.close();
      throw new Error(`Sicherung vor der Datenbankmigration fehlgeschlagen – es wurde nichts verändert. ${err.message}`);
    }
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.exec(SCHEMA);

    // Migrationen: bestehende Datenbanken bekommen neue Spalten ohne Datenverlust.
    const fileColumns = columnNames(db, 'files');
    if (!fileColumns.includes('content_text')) {
      db.exec("ALTER TABLE files ADD COLUMN content_text TEXT NOT NULL DEFAULT ''");
    }
    migrateToV3(db);
    db.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_exams_calendar_event ON exams(calendar_event_id) WHERE calendar_event_id IS NOT NULL'
    );

    const metaCount = db.prepare("SELECT COUNT(*) AS c FROM meta WHERE key = 'schema_version'").get().c;
    if (!metaCount) {
      db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?)").run(String(SCHEMA_VERSION));
      db.prepare("INSERT INTO meta (key, value) VALUES ('created_at', ?)").run(nowISO());
    }
    db.prepare(
      "INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run(String(SCHEMA_VERSION));
    if (migrationBackup) {
      db.prepare(
        "INSERT INTO meta (key, value) VALUES ('last_migration', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      ).run(JSON.stringify({ from: versionBefore, to: SCHEMA_VERSION, at: nowISO(), backup: path.basename(migrationBackup) }));
    }
    db.exec('COMMIT;');
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      /* bereits beendet */
    }
    db.close();
    throw err;
  }
  if (migrationBackup) {
    console.log(`  Datenbank auf Schema ${SCHEMA_VERSION} aktualisiert. Sicherung: ${migrationBackup}`);
  }

  seedDefaults(db);
  return db;
}

/** Ergänzt fehlende Standardeinstellungen und legt die mitgelieferten Vorlagen an, falls keine existieren. */
export function seedDefaults(db) {
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(key, value);

  const templateCount = db.prepare('SELECT COUNT(*) AS c FROM templates').get().c;
  if (templateCount === 0) {
    const ins = db.prepare(
      'INSERT INTO templates (name, kind, content, builtin, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)'
    );
    const ts = nowISO();
    for (const t of BUILTIN_TEMPLATES) ins.run(t.name, t.kind, t.content, ts, ts);
  }
}

export function tableCounts(db) {
  const counts = {};
  for (const table of TABLES) {
    counts[table] = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
  }
  return counts;
}
