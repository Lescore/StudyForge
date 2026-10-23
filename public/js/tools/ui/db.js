/**
 * Werkzeuge „Datenbanken“: SQL-Spielplatz (echte SQLite-Abfragen auf dem
 * lokalen Server, Sandbox) und Normalisierung (Schritt-für-Schritt + Analyse).
 */
import { esc, field, layout, panel, resultList, steps, notice, explanation, toolActions, live, table, createStepper, copyButton, errorHtml } from '../kit.js';
import { api } from '../../api.js';
import { analyzeText, closure, maskToNames, fdText, setText, MAX_ATTRIBUTES } from '../core/db-normalize.js';
import { NORMALIZE_EXAMPLES, buildSteps } from '../core/db-normalize-examples.js';

/* ================================================================ SQL-Spielplatz */

const SQL_EXAMPLES = [
  { label: 'WHERE', sql: "-- Studierende der Informatik ab dem 3. Semester\nSELECT matr_nr, vorname, nachname, semester\nFROM studierende\nWHERE studiengang = 'Informatik' AND semester >= 3;" },
  { label: 'ORDER BY', sql: '-- Kurse nach ECTS absteigend, bei Gleichstand nach Titel\nSELECT kurs_id, titel, ects\nFROM kurse\nORDER BY ects DESC, titel;' },
  { label: 'JOIN', sql: '-- Noten mit Namen und Kurstitel\nSELECT s.nachname, s.vorname, k.titel, n.versuch, n.note\nFROM noten AS n\nJOIN studierende AS s ON s.matr_nr = n.matr_nr\nJOIN kurse AS k ON k.kurs_id = n.kurs_id\nORDER BY s.nachname, k.titel, n.versuch;' },
  { label: 'GROUP BY / HAVING', sql: '-- Kurse mit mindestens 3 Belegungen\nSELECT k.titel, COUNT(*) AS belegungen\nFROM belegungen AS b\nJOIN kurse AS k ON k.kurs_id = b.kurs_id\nGROUP BY k.kurs_id, k.titel\nHAVING COUNT(*) >= 3\nORDER BY belegungen DESC;' },
  { label: 'Unterabfrage', sql: '-- Studierende mit einer Note besser als der Durchschnitt aller Noten\nSELECT DISTINCT s.vorname, s.nachname\nFROM studierende AS s\nWHERE s.matr_nr IN (\n  SELECT matr_nr FROM noten\n  WHERE note < (SELECT AVG(note) FROM noten)\n)\nORDER BY s.nachname;' },
  { label: 'LEFT JOIN', sql: '-- Alle Studierenden mit Anzahl belegter Kurse (auch 0)\nSELECT s.vorname, s.nachname, COUNT(b.kurs_id) AS kurse\nFROM studierende AS s\nLEFT JOIN belegungen AS b ON b.matr_nr = s.matr_nr\nGROUP BY s.matr_nr\nORDER BY kurse, s.nachname;\n\n-- Kurse ohne Dozent erscheinen mit NULL\nSELECT k.titel, d.name AS dozent\nFROM kurse AS k\nLEFT JOIN dozierende AS d ON d.dozent_id = k.dozent_id;' },
  { label: 'INSERT + SELECT', sql: "-- Neue Studentin einschreiben und Kurs belegen\nINSERT INTO studierende (matr_nr, vorname, nachname, studiengang, semester)\nVALUES (100113, 'Jana', 'Lange', 'Informatik', 1);\n\nINSERT INTO belegungen VALUES (100113, 'PR1', 'WS 2025/26');\n\nSELECT s.vorname, s.nachname, b.kurs_id, b.semester\nFROM studierende AS s JOIN belegungen AS b USING (matr_nr)\nWHERE s.matr_nr = 100113;" },
  { label: 'CTE (WITH)', sql: '-- Notendurchschnitt je Studiengang (nur bestandene Prüfungen)\nWITH bestanden AS (\n  SELECT matr_nr, note FROM noten WHERE note <= 4.0\n)\nSELECT s.studiengang,\n       COUNT(*) AS pruefungen,\n       ROUND(AVG(b.note), 2) AS schnitt\nFROM bestanden AS b\nJOIN studierende AS s USING (matr_nr)\nGROUP BY s.studiengang\nORDER BY schnitt;' },
  { label: 'Fremdschlüssel-Fehler', sql: "-- Fremdschlüssel sind aktiv: Kurs 'XY9' gibt es nicht\nINSERT INTO belegungen VALUES (100101, 'XY9', 'WS 2025/26');" }
];
const DEFAULT_SQL = SQL_EXAMPLES[2].sql;

function cellHtml(value) {
  if (value === null) return '<span class="db-null">NULL</span>';
  if (typeof value === 'number') return `<span class="db-num">${esc(String(value))}</span>`;
  if (typeof value === 'string') return esc(value);
  if (value?.t === 'blob') return `<span class="db-blob">X'${esc(value.v)}'${value.cut ? '…' : ''}</span> <span class="tiny faint">(${value.bytes} Byte)</span>`;
  if (value?.t === 'int' || value?.t === 'num') return `<span class="db-num">${esc(value.v)}</span>`;
  if (value?.t === 'text') return `${esc(value.v)}<span class="tiny faint"> … (gekürzt, ${value.length.toLocaleString('de-DE')} Zeichen)</span>`;
  return esc(String(value));
}

function resultHtml(entry) {
  const head = `<div class="db-result-head"><span class="badge">Anweisung ${entry.index}</span><code class="db-result-sql">${esc(entry.sql.replace(/\s+/g, ' ').slice(0, 160))}</code></div>`;
  if (entry.kind === 'rows') {
    const info = `${entry.rows.length.toLocaleString('de-DE')} Zeile${entry.rows.length === 1 ? '' : 'n'}${entry.truncated ? ' (gekürzt – mehr Zeilen vorhanden; angezeigt werden höchstens 500)' : ''} · ${entry.ms.toLocaleString('de-DE')} ms`;
    const body = entry.rows.length
      ? `<div class="table-wrap"><table class="data tool-table db-table"><thead><tr>${entry.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${entry.rows
          .map((row) => `<tr>${row.map((v) => `<td>${cellHtml(v)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`
      : `<p class="small subtle">Keine Zeilen. Spalten: ${entry.columns.map(esc).join(', ')}</p>`;
    return `<div class="db-result">${head}<p class="small subtle db-result-info">${info}</p>${entry.truncated ? notice('Ergebnis gekürzt: Es werden höchstens 500 Zeilen je Anweisung angezeigt.', 'warning') : ''}${body}</div>`;
  }
  const text = entry.kind === 'changes' ? `${entry.changes} Zeile${entry.changes === 1 ? '' : 'n'} geändert` : 'Ausgeführt';
  return `<div class="db-result">${head}<p class="small db-result-info"><strong>${text}</strong> · ${entry.ms.toLocaleString('de-DE')} ms</p></div>`;
}

function schemaHtml(tables) {
  if (!tables.length) return '<p class="small subtle">Diese Datenbank ist leer. Lege mit CREATE TABLE eigene Tabellen an.</p>';
  return `<div class="db-schema">${tables
    .map(
      (t) => `<div class="db-schema-table">
        <div class="db-schema-name"><strong>${esc(t.name)}</strong> <span class="tiny faint">${t.rows} Zeilen</span>
          <button type="button" class="btn btn-sm btn-ghost db-insert-select" data-table="${esc(t.name)}" aria-label="SELECT * FROM ${esc(t.name)} einfügen">SELECT *</button></div>
        <ul>${t.columns
          .map(
            (c) => `<li><span class="${c.pk ? 'db-pk' : ''}">${esc(c.name)}</span> <span class="faint">${esc(c.type || '–')}</span>${c.pk ? ' <span class="badge badge-accent db-key">PK</span>' : ''}${c.references ? ` <span class="badge badge-info db-key" title="Fremdschlüssel">FK → ${esc(c.references)}</span>` : ''}${c.notNull && !c.pk ? ' <span class="tiny faint">NOT NULL</span>' : ''}</li>`
          )
          .join('')}</ul>
      </div>`
    )
    .join('')}</div>`;
}

function sqlSpielplatz(container) {
  let controller = null;
  let disposed = false;
  container.innerHTML = layout(
    panel(
      'SQL-Abfrage',
      `
      ${notice('Jede Ausführung startet mit einer <strong>frischen Beispieldatenbank</strong> im Arbeitsspeicher. Änderungen (INSERT, UPDATE, CREATE …) gelten nur innerhalb dieser einen Ausführung und werden <strong>nicht gespeichert</strong>. Deine eigenen StudyForge-Daten sind davon nicht berührt.', 'info', { html: true })}
      <div class="form-row">
        ${field({ id: 'db-dataset', label: 'Datenbank', value: 'hochschule', options: [['hochschule', 'Hochschule (Studierende, Kurse, Noten)'], ['leer', 'Leere Datenbank']] })}
      </div>
      ${field({ id: 'db-sql', label: 'SQL (mehrere Anweisungen mit ; trennen)', value: DEFAULT_SQL, rows: 12, mono: true, wide: true, attrs: 'maxlength="20000" aria-describedby="db-sql-hint"' })}
      <p class="hint" id="db-sql-hint">Strg+Enter (macOS: ⌘+Enter) führt aus. Höchstens 20 Anweisungen, 20 000 Zeichen, 2 s Laufzeit, 500 Zeilen je Ergebnis.</p>
      <div class="row db-run-row">
        <button type="button" class="btn btn-primary" id="db-run">▶ Ausführen</button>
        <button type="button" class="btn btn-sm btn-ghost" id="db-reset">Zurücksetzen</button>
        ${copyButton(DEFAULT_SQL, 'SQL kopieren').replace('class="icon-btn tool-copy"', 'class="icon-btn tool-copy" id="db-copy"')}
      </div>
      <div class="db-examples" role="group" aria-label="Beispielabfragen">
        <span class="small subtle">Beispiele:</span>
        ${SQL_EXAMPLES.map((ex, i) => `<button type="button" class="btn btn-sm" data-db-example="${i}">${esc(ex.label)}</button>`).join('')}
      </div>
      ${explanation(`
        <p>Die Abfragen laufen <strong>wirklich</strong> – mit <strong>SQLite</strong> auf deinem lokalen StudyForge-Server, in einer abgeschotteten In-Memory-Datenbank, die nach jeder Ausführung verworfen wird.</p>
        <p><strong>Dialekt SQLite:</strong> dynamische Typisierung (Typangaben sind „Affinitäten“), Zeichenketten in einfachen Anführungszeichen, Verkettung mit <code>||</code>, <code>LIMIT … OFFSET …</code>, Datumsfunktionen wie <code>date()</code> und <code>strftime()</code>. Kein <code>TOP</code> (SQL Server), keine gespeicherten Prozeduren. Viele Grundlagen (SELECT, JOIN, GROUP BY, Unterabfragen, CTEs) sind aber Standard-SQL.</p>
        <p><strong>NULL</strong> bedeutet „kein Wert“. Vergleiche mit NULL ergeben unbekannt – nutze <code>IS NULL</code> statt <code>= NULL</code>. Aggregatfunktionen wie <code>AVG</code> ignorieren NULL.</p>
        <p><strong>Gesperrt</strong> sind aus Sicherheitsgründen u. a. ATTACH/DETACH, VACUUM, PRAGMA, Trigger, virtuelle Tabellen und das Laden von Erweiterungen. Fremdschlüssel sind eingeschaltet.</p>`)}
    `
    ),
    `${panel('Ergebnis', '<div id="db-out"><p class="small subtle">Noch nicht ausgeführt. Wähle ein Beispiel oder schreibe eine eigene Abfrage.</p></div>')}
     ${panel('Schema der Beispieldatenbank', '<div id="db-schema"><p class="small subtle">Wird geladen …</p></div>', { className: 'db-schema-card' })}`
  );
  const $ = (sel) => container.querySelector(sel);
  const textarea = $('#db-sql');
  const out = $('#db-out');
  const runButton = $('#db-run');
  const updateCopy = () => {
    $('#db-copy').dataset.copy = textarea.value;
  };

  const loadSchema = async () => {
    const dataset = $('#db-dataset').value;
    try {
      const data = await api.get(`/tools/sql/schema?dataset=${encodeURIComponent(dataset)}`);
      if (disposed) return;
      $('#db-schema').innerHTML = schemaHtml(data.tables);
    } catch (error) {
      if (!disposed) $('#db-schema').innerHTML = errorHtml(error);
    }
  };

  const run = async () => {
    const sql = textarea.value;
    if (!sql.trim()) {
      out.innerHTML = notice('Bitte zuerst SQL eingeben.', 'warning');
      return;
    }
    controller?.abort();
    controller = new AbortController();
    runButton.disabled = true;
    runButton.textContent = 'Läuft …';
    out.innerHTML = '<p class="small subtle">Wird ausgeführt …</p>';
    try {
      const data = await api.post('/tools/sql', { sql, dataset: $('#db-dataset').value }, { signal: controller.signal });
      if (disposed) return;
      const parts = data.results.map(resultHtml);
      if (data.error) {
        const kindLabel = { blocked: 'Nicht erlaubt', timeout: 'Zeitlimit', sqlite: 'SQLite-Fehler', internal: 'Abgebrochen' }[data.error.kind] ?? 'Fehler';
        parts.push(notice(`${kindLabel}: ${data.error.message}${data.error.kind === 'sqlite' && data.error.statement ? ' – nachfolgende Anweisungen wurden nicht ausgeführt.' : ''}`, 'error'));
      } else {
        parts.push(`<p class="tiny faint">${data.results.length} Anweisung${data.results.length === 1 ? '' : 'en'} ausgeführt in ${data.ms} ms (SQLite, frische In-Memory-Datenbank).</p>`);
      }
      out.innerHTML = parts.join('');
    } catch (error) {
      if (error.name === 'AbortError' || disposed) return;
      out.innerHTML = errorHtml(error);
    } finally {
      if (!disposed) {
        runButton.disabled = false;
        runButton.textContent = '▶ Ausführen';
      }
    }
  };

  runButton.addEventListener('click', run);
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      run();
    }
  });
  textarea.addEventListener('input', updateCopy);
  container.querySelectorAll('[data-db-example]').forEach((button) =>
    button.addEventListener('click', () => {
      textarea.value = SQL_EXAMPLES[Number(button.dataset.dbExample)].sql;
      if ($('#db-dataset').value !== 'hochschule') {
        $('#db-dataset').value = 'hochschule';
        loadSchema();
      }
      updateCopy();
      run();
    })
  );
  $('#db-reset').addEventListener('click', () => {
    textarea.value = DEFAULT_SQL;
    $('#db-dataset').value = 'hochschule';
    updateCopy();
    loadSchema();
    out.innerHTML = '<p class="small subtle">Zurückgesetzt. Noch nicht ausgeführt.</p>';
  });
  $('#db-dataset').addEventListener('change', loadSchema);
  $('#db-schema').addEventListener('click', (event) => {
    const button = event.target.closest('.db-insert-select');
    if (!button) return;
    textarea.value = `SELECT * FROM ${button.dataset.table};`;
    updateCopy();
    textarea.focus();
    run();
  });
  loadSchema();
  return () => {
    disposed = true;
    controller?.abort();
  };
}

/* ================================================================ Normalisierung */

function nfTable(t) {
  const fkCols = t.fks ?? {};
  const head = t.columns.map((c) => {
    const isKey = t.key?.includes(c);
    const fk = fkCols[c];
    return { html: `<span class="${isKey ? 'db-pk' : ''}">${esc(c)}</span>${isKey ? ' <span class="db-mini">PK</span>' : ''}${fk ? ` <span class="db-mini db-mini-fk" title="Fremdschlüssel auf ${esc(fk)}">FK→${esc(fk)}</span>` : ''}` };
  });
  const rows = t.rows.map((row) =>
    t.columns.map((c) => {
      if (t.unf && Array.isArray(row[c])) {
        return { html: `<div class="db-multi">${row[c].map((item) => `<span>${esc(t.groupColumns.map((g) => item[g]).join(' · '))}</span>`).join('')}</div>` };
      }
      return String(row[c] ?? '');
    })
  );
  const nf = t.highest ? `<span class="badge ${['3NF', 'BCNF'].includes(t.highest) ? 'badge-success' : t.highest === '2NF' ? 'badge-warning' : 'badge-danger'}">höchste Normalform: ${esc(t.highest === 'BCNF' ? 'BCNF (⇒ 3NF)' : t.highest)}</span>` : '<span class="badge badge-danger">nicht in 1NF</span>';
  return `<div class="db-nf-table">
    <div class="db-nf-table-head"><strong>${esc(t.name)}</strong> ${nf}</div>
    ${t.unf ? `<p class="tiny faint">Spalte „${esc(t.columns[t.columns.length - 1])}“ enthält je Zeile mehrere Einträge (${esc(t.groupColumns.join(' · '))}).</p>` : ''}
    ${table(head, rows, { className: 'db-nf' })}
    ${t.fds?.length ? `<p class="tiny subtle db-fds">FDs: ${t.fds.map((f) => `<code>${esc(f)}</code>`).join(' ')}</p>` : ''}
  </div>`;
}

function stepHtml(step, index, total) {
  return `<div class="db-step">
    <h3 class="db-step-title">${esc(step.title)} <span class="tiny faint">Schritt ${index + 1} von ${total}</span></h3>
    <div class="db-step-why">
      <div><strong class="small">Was hat sich geändert?</strong><ul class="small">${step.changes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>
      <div><strong class="small">Warum?</strong><p class="small">${esc(step.why)}</p></div>
    </div>
    <p class="small"><strong>Funktionale Abhängigkeiten:</strong> ${step.fds.map((f) => `<code class="db-fd">${esc(f)}</code>`).join(' ')}</p>
    <div class="db-nf-tables">${step.tables.map(nfTable).join('')}</div>
    ${step.anomalies ? `<div class="db-anomalies"><strong class="small">Anomalien in dieser Tabelle:</strong>${step.anomalies.map((a) => notice(`<strong>${esc(a.kind)}:</strong> ${esc(a.text)}`, 'warning', { html: true })).join('')}</div>` : ''}
  </div>`;
}

const ANALYSIS_EXAMPLES = [
  { label: 'Studierende/Kurse', values: { attrs: 'MatrNr, Name, Studiengang, Fakultaet, KursNr, KursTitel, Note', fds: 'MatrNr -> Name, Studiengang\nStudiengang -> Fakultaet\nKursNr -> KursTitel\nMatrNr, KursNr -> Note', hull: 'MatrNr' } },
  { label: 'Transitiv (2NF)', values: { attrs: 'PersNr, Name, AbtNr, AbtName', fds: 'PersNr -> Name, AbtNr\nAbtNr -> AbtName', hull: 'PersNr' } },
  { label: '3NF, nicht BCNF', values: { attrs: 'Student, Fach, Dozent', fds: 'Student, Fach -> Dozent\nDozent -> Fach', hull: 'Student, Dozent' } },
  { label: 'Mehrere Schlüssel', values: { attrs: 'A, B, C, D', fds: 'A, B -> C\nC -> D\nD -> A', hull: 'C, B' } }
];

function normalisierung(container) {
  const example = { index: 0, steps: buildSteps(NORMALIZE_EXAMPLES[0]) };
  const stepper = createStepper({
    count: () => example.steps.length,
    show: (i) => {
      container.querySelector('#db-nf-step').innerHTML = stepHtml(example.steps[i], i, example.steps.length);
    },
    interval: 2500,
    label: 'Normalisierung'
  });
  const defaults = ANALYSIS_EXAMPLES[0].values;
  container.innerHTML = `
    ${panel(
      'Schritt für Schritt: UNF → 1NF → 2NF → 3NF',
      `<div class="form-row">${field({ id: 'db-nf-example', label: 'Beispiel', value: NORMALIZE_EXAMPLES[0].id, options: NORMALIZE_EXAMPLES.map((e) => [e.id, e.label]), attrs: 'data-no-live' })}</div>
       ${stepper.html}
       <div id="db-nf-step" aria-live="polite"></div>
       <p class="tiny faint">Die Tabellen der Schritte 2NF und 3NF werden per Projektion aus der 1NF-Tabelle berechnet; Schlüssel und Normalform jeder Tabelle ermittelt das Werkzeug aus den funktionalen Abhängigkeiten. PK = Primärschlüssel (unterstrichen), FK = Fremdschlüssel.</p>`
    )}
    <div id="db-nf-analysis">${layout(
      panel(
        'Analyse: Attribute und funktionale Abhängigkeiten',
        `${field({ id: 'attrs', label: 'Attribute (durch Komma getrennt)', value: defaults.attrs, mono: true, hint: `Höchstens ${MAX_ATTRIBUTES} Attribute. Leer lassen: Attribute aus den FDs übernehmen.` })}
         ${field({ id: 'fds', label: 'Funktionale Abhängigkeiten (eine pro Zeile)', value: defaults.fds, rows: 6, mono: true, hint: 'Schreibweise: A, B -> C, D (auch → oder =>). # leitet einen Kommentar ein.' })}
         ${field({ id: 'hull', label: 'Attributhülle berechnen für', value: defaults.hull, mono: true, hint: 'z. B. MatrNr oder MatrNr, KursNr' })}
         ${toolActions({ examples: ANALYSIS_EXAMPLES })}
         ${explanation(`
          <p><strong>Funktionale Abhängigkeit</strong> X → Y: Gleiche Werte in X erzwingen gleiche Werte in Y.</p>
          <p><strong>Attributhülle X⁺:</strong> alle Attribute, die aus X über die FDs folgen. X ist <strong>Superschlüssel</strong>, wenn X⁺ alle Attribute enthält; ein <strong>Kandidatenschlüssel</strong> ist ein minimaler Superschlüssel. <strong>Primattribute</strong> gehören zu mindestens einem Kandidatenschlüssel.</p>
          <p><strong>1NF:</strong> nur atomare Werte (keine Listen/Wiederholungsgruppen). <strong>2NF:</strong> 1NF und kein Nichtprimattribut hängt von einer echten Teilmenge eines Schlüssels ab (keine partielle Abhängigkeit). <strong>3NF:</strong> für jede nichttriviale FD X → A ist X Superschlüssel oder A prim (keine transitive Abhängigkeit). <strong>BCNF:</strong> für jede nichttriviale FD ist X Superschlüssel.</p>
          <p><strong>Anomalien</strong> entstehen durch Redundanz: Einfügen (Daten können ohne andere nicht erfasst werden), Ändern (mehrfach gespeicherte Werte müssen überall geändert werden), Löschen (mit einer Zeile verschwinden ungewollt weitere Informationen).</p>`)}`
      ),
      '<div id="db-nf-out"></div>'
    )}</div>`;
  stepper.mount(container);

  container.querySelector('#db-nf-example').addEventListener('change', (event) => {
    const ex = NORMALIZE_EXAMPLES.find((e) => e.id === event.target.value);
    example.steps = buildSteps(ex);
    stepper.refresh(0);
  });

  const analysisRoot = container.querySelector('#db-nf-analysis');
  const handle = live(analysisRoot, {
    output: '#db-nf-out',
    defaults,
    examples: ANALYSIS_EXAMPLES,
    compute: (v) => {
      const a = analyzeText({ attributes: v.attrs, fds: v.fds, closureOf: v.hull });
      const names = (m) => maskToNames(m, a.attributes);
      const set = (m) => setText(m, a.attributes);
      const keysText = a.keys.map(set).join(', ');
      const check = (ok, label) => `<span class="badge ${ok ? 'badge-success' : 'badge-danger'}">${ok ? '✓' : '✗'} ${label}</span>`;
      const violationList = (list, render) => (list.length ? `<ul class="small db-violations">${list.map((v2) => `<li>${render(v2)}</li>`).join('')}</ul>` : '');
      const nf2 = violationList(a.nf2.violations, (x) => `${esc(set(x.lhs))} → ${esc(names(x.rhs).join(', '))}: <strong>partielle Abhängigkeit</strong> – ${esc(names(x.rhs).join(', '))} ${x.rhs && names(x.rhs).length > 1 ? 'sind Nichtprimattribute und hängen' : 'ist Nichtprimattribut und hängt'} schon von der echten Teilmenge ${esc(set(x.lhs))} des Schlüssels ${esc(set(x.key))} ab.`);
      const nf3 = violationList(a.nf3.violations, (x) => `<code>${esc(fdText(x, a.attributes))}</code>: ${esc(set(x.lhs))} ist kein Superschlüssel und ${esc(names(x.rhs)[0])} ist nicht prim (${x.kind === 'transitiv' ? '<strong>transitive</strong> Abhängigkeit über ein Nichtschlüsselattribut' : '<strong>partielle</strong> Abhängigkeit'}).`);
      const bcnf = violationList(a.bcnf.violations, (x) => `<code>${esc(fdText(x, a.attributes))}</code>: Determinante ${esc(set(x.lhs))} ist kein Superschlüssel${x.kind === 'prim' ? ` (${esc(names(x.rhs)[0])} ist prim – für 3NF erlaubt, für BCNF nicht)` : ''}.`);
      const hull = a.closureQuery;
      const firstKeyTrace = a.keys.length ? { start: a.keys[0], ...closure(a.keys[0], a.fds, { trace: true }) } : null;
      const traceLines = (q) => [
        `Start: ${set(q.start)}`,
        ...q.log.map((l) => `${fdText(l.fd, a.attributes)} anwendbar → ergänze ${names(l.added).join(', ')} → ${set(l.result)}`),
        q.log.length ? null : 'Keine FD anwendbar – die Hülle ist die Menge selbst.'
      ];
      return panel(
        'Ergebnis',
        `${resultList([
          { label: a.keys.length === 1 ? 'Kandidatenschlüssel' : `Kandidatenschlüssel (${a.keys.length})`, value: keysText, strong: true },
          { label: 'Primattribute', value: names(a.prime).join(', ') || '–' },
          { label: 'Nichtprimattribute', value: names(a.nonPrime).join(', ') || '– (keine)' },
          { label: 'Höchste Normalform', value: a.highest === 'BCNF' ? 'BCNF (damit auch 3NF, 2NF)' : a.highest, copy: false },
          hull ? { label: `Hülle ${set(hull.start)}⁺`, value: `${set(hull.mask)}${hull.mask === a.all ? ' – Superschlüssel' : ''}` } : null
        ])}
        ${notice('Alle Attributwerte sind atomar (1NF). Geprüft wird nur, was aus den angegebenen FDs folgt.', 'assumption')}
        <div class="db-nf-checks">${check(true, '1NF (Annahme)')} ${check(a.nf2.ok, '2NF')} ${check(a.nf3.ok, '3NF')} ${check(a.bcnf.ok, 'BCNF')}</div>
        ${a.nf2.ok ? '' : `<p class="small"><strong>2NF verletzt:</strong></p>${nf2}`}
        ${a.nf3.ok ? '' : `<p class="small"><strong>3NF verletzt:</strong></p>${nf3}`}
        ${a.bcnf.ok ? '' : `<p class="small"><strong>BCNF verletzt:</strong></p>${bcnf}`}
        ${hull ? steps(traceLines(hull), { title: `Rechenweg: Hülle von ${set(hull.start)}` }) : ''}
        ${firstKeyTrace ? steps(traceLines(firstKeyTrace), { title: `Warum ist ${set(a.keys[0])} ein Schlüssel?`, open: false }) : ''}
        ${steps(a.cover.length ? a.cover.map((fd) => fdText(fd, a.attributes)) : ['Keine nichttrivialen FDs.'], { title: 'Minimale Überdeckung', open: false })}
        ${steps(a.synthesis.map((r) => `R(${names(r.attrs).join(', ')}) – Schlüssel ${set(r.key)}${r.keyRelation ? ' (ergänzt, damit ein Kandidatenschlüssel enthalten ist)' : ''}`), { title: 'Zerlegung in 3NF (Synthesealgorithmus)', open: !a.nf3.ok })}
        `
      );
    }
  });
  return () => {
    stepper.destroy();
    handle.destroy();
  };
}

const TOOLS = {
  'sql-spielplatz': sqlSpielplatz,
  normalisierung
};

export function render(toolId, container, ctx) {
  const tool = TOOLS[toolId];
  if (!tool) throw new Error(`Unbekanntes Werkzeug: ${toolId}`);
  return tool(container, ctx);
}
