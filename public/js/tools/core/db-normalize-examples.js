/**
 * Beispiel-Datensätze für die schrittweise Normalisierung (UNF → 1NF → 2NF → 3NF).
 * Die Tabellen der späteren Schritte werden NICHT von Hand gepflegt, sondern per
 * Projektion aus der 1NF-Tabelle berechnet (siehe buildSteps) – so passen Daten,
 * Schlüssel und Abhängigkeiten immer zusammen (in den Tests geprüft).
 */
import { analyzeSchema, flattenGroup, fdText, namesToMask, project, projectFds, valueCounts, maskToNames } from './db-normalize.js';

export const NORMALIZE_EXAMPLES = [
  {
    id: 'studium',
    label: 'Studierende & Kurse',
    unfName: 'Studienverwaltung',
    attributes: ['MatrNr', 'Name', 'Studiengang', 'Fakultaet', 'KursNr', 'KursTitel', 'Dozent', 'Note'],
    group: { name: 'Kurse', columns: ['KursNr', 'KursTitel', 'Dozent', 'Note'] },
    fds: [
      [['MatrNr'], ['Name', 'Studiengang']],
      [['Studiengang'], ['Fakultaet']],
      [['KursNr'], ['KursTitel', 'Dozent']],
      [['MatrNr', 'KursNr'], ['Note']]
    ],
    rows: [
      { MatrNr: 100101, Name: 'Lena Fischer', Studiengang: 'Informatik', Fakultaet: 'Informatik & Mathematik', Kurse: [
        { KursNr: 'DB1', KursTitel: 'Datenbanksysteme', Dozent: 'Schmidt', Note: '1,7' },
        { KursNr: 'RN1', KursTitel: 'Rechnernetze', Dozent: 'Weber', Note: '2,3' }
      ] },
      { MatrNr: 100102, Name: 'Tim Becker', Studiengang: 'Informatik', Fakultaet: 'Informatik & Mathematik', Kurse: [
        { KursNr: 'DB1', KursTitel: 'Datenbanksysteme', Dozent: 'Schmidt', Note: '3,0' },
        { KursNr: 'TI1', KursTitel: 'Theoretische Informatik', Dozent: 'Nowak', Note: '2,0' }
      ] },
      { MatrNr: 100103, Name: 'Sara Hoffmann', Studiengang: 'Wirtschaftsinformatik', Fakultaet: 'Wirtschaft', Kurse: [
        { KursNr: 'DB1', KursTitel: 'Datenbanksysteme', Dozent: 'Schmidt', Note: '1,0' },
        { KursNr: 'SE1', KursTitel: 'Softwaretechnik', Dozent: 'Yilmaz', Note: '1,3' }
      ] },
      { MatrNr: 100104, Name: 'Paul Schulz', Studiengang: 'Informatik', Fakultaet: 'Informatik & Mathematik', Kurse: [
        { KursNr: 'PR1', KursTitel: 'Programmieren 1', Dozent: 'Yilmaz', Note: '2,7' }
      ] }
    ],
    nf2: [
      { name: 'Studierende', columns: ['MatrNr', 'Name', 'Studiengang', 'Fakultaet'] },
      { name: 'Kurse', columns: ['KursNr', 'KursTitel', 'Dozent'] },
      { name: 'Belegungen', columns: ['MatrNr', 'KursNr', 'Note'] }
    ],
    nf3: [
      { name: 'Studierende', columns: ['MatrNr', 'Name', 'Studiengang'] },
      { name: 'Studiengaenge', columns: ['Studiengang', 'Fakultaet'] },
      { name: 'Kurse', columns: ['KursNr', 'KursTitel', 'Dozent'] },
      { name: 'Belegungen', columns: ['MatrNr', 'KursNr', 'Note'] }
    ],
    anomalies: {
      redundant: ['KursNr'], redundantShow: ['KursTitel', 'Dozent'],
      insert: 'Ein neuer Kurs „BS1 Betriebssysteme (Braun)“ kann nicht eingetragen werden, solange niemand ihn belegt: MatrNr ist Teil des Primärschlüssels und darf nicht NULL sein.',
      deleteHint: 'Kurs'
    }
  },
  {
    id: 'bestellung',
    label: 'Bestellungen',
    unfName: 'Bestellungen',
    attributes: ['BestellNr', 'Datum', 'KundenNr', 'KundenName', 'Ort', 'ArtikelNr', 'Bezeichnung', 'Preis', 'Menge'],
    group: { name: 'Positionen', columns: ['ArtikelNr', 'Bezeichnung', 'Preis', 'Menge'] },
    fds: [
      [['BestellNr'], ['Datum', 'KundenNr']],
      [['KundenNr'], ['KundenName', 'Ort']],
      [['ArtikelNr'], ['Bezeichnung', 'Preis']],
      [['BestellNr', 'ArtikelNr'], ['Menge']]
    ],
    rows: [
      { BestellNr: 5001, Datum: '2026-03-02', KundenNr: 'K17', KundenName: 'Meyer GmbH', Ort: 'Kassel', Positionen: [
        { ArtikelNr: 'A-10', Bezeichnung: 'USB-Stick 64 GB', Preis: '9,90', Menge: 5 },
        { ArtikelNr: 'A-22', Bezeichnung: 'Netzwerkkabel 2 m', Preis: '3,50', Menge: 10 }
      ] },
      { BestellNr: 5002, Datum: '2026-03-02', KundenNr: 'K08', KundenName: 'Lehmann KG', Ort: 'Fulda', Positionen: [
        { ArtikelNr: 'A-10', Bezeichnung: 'USB-Stick 64 GB', Preis: '9,90', Menge: 2 }
      ] },
      { BestellNr: 5003, Datum: '2026-03-05', KundenNr: 'K17', KundenName: 'Meyer GmbH', Ort: 'Kassel', Positionen: [
        { ArtikelNr: 'A-31', Bezeichnung: 'Maus, kabellos', Preis: '19,00', Menge: 3 },
        { ArtikelNr: 'A-22', Bezeichnung: 'Netzwerkkabel 2 m', Preis: '3,50', Menge: 4 },
        { ArtikelNr: 'A-10', Bezeichnung: 'USB-Stick 64 GB', Preis: '9,90', Menge: 1 }
      ] }
    ],
    nf2: [
      { name: 'Bestellungen', columns: ['BestellNr', 'Datum', 'KundenNr', 'KundenName', 'Ort'] },
      { name: 'Artikel', columns: ['ArtikelNr', 'Bezeichnung', 'Preis'] },
      { name: 'Positionen', columns: ['BestellNr', 'ArtikelNr', 'Menge'] }
    ],
    nf3: [
      { name: 'Bestellungen', columns: ['BestellNr', 'Datum', 'KundenNr'] },
      { name: 'Kunden', columns: ['KundenNr', 'KundenName', 'Ort'] },
      { name: 'Artikel', columns: ['ArtikelNr', 'Bezeichnung', 'Preis'] },
      { name: 'Positionen', columns: ['BestellNr', 'ArtikelNr', 'Menge'] }
    ],
    anomalies: {
      redundant: ['ArtikelNr'], redundantShow: ['Bezeichnung', 'Preis'],
      insert: 'Ein neuer Artikel „A-40 Webcam (49,00)“ kann nicht erfasst werden, solange er in keiner Bestellung vorkommt: BestellNr ist Teil des Primärschlüssels.',
      deleteHint: 'Artikel'
    }
  }
];

/** Kandidatenschlüssel und Normalform einer Teilrelation (aus den projizierten FDs). */
export function relationInfo(example, columns) {
  const attrs = example.attributes;
  const fds = example.fds.map(([l, r]) => ({ lhs: namesToMask(l, attrs), rhs: namesToMask(r, attrs) }));
  const subset = namesToMask(columns, attrs);
  const projected = projectFds(fds, subset);
  // Lokale Nummerierung für die Analyse der Teilrelation
  const local = columns.slice();
  const toLocal = (mask) => namesToMask(maskToNames(mask, attrs), local);
  const localFds = projected.map((fd) => ({ lhs: toLocal(fd.lhs), rhs: toLocal(fd.rhs) }));
  const analysis = analyzeSchema(local, localFds);
  return {
    key: maskToNames(analysis.keys[0], local),
    keys: analysis.keys.map((k) => maskToNames(k, local)),
    highest: analysis.highest,
    fds: localFds.length ? mergeLocal(localFds).map((fd) => fdText(fd, local)) : [],
    analysis
  };
}

function mergeLocal(fds) {
  const map = new Map();
  for (const fd of fds) map.set(fd.lhs, (map.get(fd.lhs) ?? 0) | fd.rhs);
  return [...map].map(([lhs, rhs]) => ({ lhs, rhs }));
}

/** Fremdschlüssel: Schlüssel einer anderen Tabelle, die als (Teil-)Attribute vorkommen. */
function foreignKeys(tables) {
  for (const t of tables) {
    t.fks = {};
    for (const other of tables) {
      if (other === t) continue;
      if (other.key.length && other.key.every((c) => t.columns.includes(c)) && other.key.join() !== t.key.join()) {
        for (const c of other.key) t.fks[c] = other.name;
      }
    }
  }
  return tables;
}

/** Erzeugt die vier Schritte mit berechneten Tabellen, Schlüsseln, FDs und Anomalien. */
export function buildSteps(example) {
  const flat = flattenGroup(example.rows, example.group.name);
  const fdLines = example.fds.map(([l, r]) => `${l.join(', ')} → ${r.join(', ')}`);
  const baseCols = example.attributes.filter((a) => !example.group.columns.includes(a));
  const info1 = relationInfo(example, example.attributes);
  const make = (defs) =>
    foreignKeys(
      defs.map((d) => {
        const ri = relationInfo(example, d.columns);
        return { name: d.name, columns: d.columns, key: ri.key, fds: ri.fds, highest: ri.highest, rows: project(flat, d.columns) };
      })
    );

  const { redundant, redundantShow } = example.anomalies;
  const counts = valueCounts(flat, redundant);
  const [mostValue, mostCount] = [...counts].sort((a, b) => b[1] - a[1])[0];
  const single = [...counts].find(([, c]) => c === 1);
  const singleRow = single ? flat.find((r) => redundant.map((c) => r[c]).join(' | ') === single[0]) : null;

  return [
    {
      id: 'UNF',
      title: 'Unnormalisiert (UNF)',
      tables: [{ name: example.unfName, columns: [...baseCols, example.group.name], key: [example.attributes[0]], groupColumns: example.group.columns, rows: example.rows, unf: true, fks: {} }],
      changes: [`Die Spalte „${example.group.name}“ enthält eine Wiederholungsgruppe: mehrere Werte (${example.group.columns.join(', ')}) in einer Zelle.`],
      why: 'Ein Attributwert ist nicht atomar. Abfragen wie „alle Einträge mit Wert X“ oder Fremdschlüssel auf einzelne Einträge sind so nicht sauber möglich.',
      fds: fdLines
    },
    {
      id: '1NF',
      title: 'Erste Normalform (1NF)',
      tables: foreignKeys([{ name: example.unfName, columns: example.attributes, key: info1.key, fds: info1.fds, highest: info1.highest, rows: flat }]),
      changes: [
        `Wiederholungsgruppe aufgelöst: Jede Zeile enthält jetzt genau einen Eintrag – aus ${example.rows.length} werden ${flat.length} Zeilen.`,
        `Neuer zusammengesetzter Primärschlüssel: (${info1.key.join(', ')}).`
      ],
      why: 'Alle Werte sind atomar. Aber viele Attribute hängen nur von einem Teil des Schlüssels ab (partielle Abhängigkeit) – das erzeugt Redundanz und Anomalien.',
      fds: fdLines,
      anomalies: [
        { kind: 'Änderungsanomalie', text: `„${mostValue}“ steht ${mostCount}-mal in der Tabelle (mit ${redundantShow.join(' und ')}). Ändert sich z. B. ${redundantShow[redundantShow.length - 1]}, müssen alle ${mostCount} Zeilen geändert werden – vergisst man eine, ist die Datenbank widersprüchlich.` },
        { kind: 'Einfügeanomalie', text: example.anomalies.insert },
        singleRow
          ? { kind: 'Löschanomalie', text: `${example.anomalies.deleteHint} „${single[0]}“ kommt nur in einer Zeile vor (${baseCols[0]} ${singleRow[baseCols[0]]}). Wird diese Zeile gelöscht, gehen auch ${redundantShow.join(' und ')} von „${single[0]}“ verloren.` }
          : null
      ].filter(Boolean)
    },
    {
      id: '2NF',
      title: 'Zweite Normalform (2NF)',
      tables: make(example.nf2),
      changes: [
        'Partielle Abhängigkeiten herausgelöst: Was nur von einem Teil des Schlüssels abhängt, bekommt eine eigene Tabelle.',
        'Die Ausgangstabelle behält nur noch den zusammengesetzten Schlüssel und die voll abhängigen Attribute; die Teilschlüssel werden zu Fremdschlüsseln.'
      ],
      why: 'Jedes Nichtschlüsselattribut hängt jetzt vom ganzen Schlüssel ab. Es bleibt aber eine transitive Abhängigkeit (Schlüssel → Nichtschlüssel → Nichtschlüssel).',
      fds: fdLines
    },
    {
      id: '3NF',
      title: 'Dritte Normalform (3NF)',
      tables: make(example.nf3),
      changes: ['Transitive Abhängigkeit aufgelöst: Das Nichtschlüsselattribut, von dem andere abhängen, wird Schlüssel einer neuen Tabelle und bleibt in der alten als Fremdschlüssel.'],
      why: 'Kein Nichtschlüsselattribut hängt mehr von einem anderen Nichtschlüsselattribut ab. Jede Information steht genau einmal; die Zerlegung ist verlustfrei (natürlicher Verbund ergibt wieder die 1NF-Tabelle) und abhängigkeitserhaltend.',
      fds: fdLines
    }
  ];
}
