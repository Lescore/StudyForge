import { api, downloadFromApi } from '../api.js';
import { state, loadCore, saveSettings, refreshMeta } from '../store.js';
import {
  esc,
  icon,
  toast,
  errorToast,
  openModal,
  formatBytes,
  formatDate,
  confirmDialog
} from '../ui.js';

const COUNT_LABELS = {
  notes: 'Notizen',
  cards: 'Karteikarten',
  subjects: 'Fächer',
  semesters: 'Semester',
  reviews: 'Wiederholungen',
  tasks: 'Aufgaben',
  exams: 'Prüfungen',
  files: 'Dateien',
  templates: 'Vorlagen',
  snippets: 'Codebeispiele',
  formulas: 'Formeln'
};

function countGrid(counts) {
  return `<div class="stat-grid">${Object.entries(COUNT_LABELS)
    .map(([key, label]) => `<div class="stat"><div class="stat-value">${counts[key] ?? 0}</div><div class="stat-label">${label}</div></div>`)
    .join('')}</div>`;
}

function backupInspectSummary(result) {
  const counts = result.counts || {};
  return `<div class="stack">
    <div class="row">
      <span class="badge ${result.kind === 'zip' ? 'badge-accent' : 'badge-info'}">${result.kind === 'zip' ? 'Vollständiges ZIP-Backup' : 'JSON-Datenexport'}</span>
      ${result.createdAt ? `<span class="small subtle">erstellt ${esc(formatDate(result.createdAt, { withTime: true }))}</span>` : ''}
      ${result.appVersion ? `<span class="small faint">Version ${esc(result.appVersion)}</span>` : ''}
    </div>
    <div class="solution-box"><dl>
      <dt>Notizen</dt><dd>${counts.notes ?? 0}</dd>
      <dt>Karten</dt><dd>${counts.cards ?? 0}</dd>
      <dt>Fächer</dt><dd>${counts.subjects ?? 0}</dd>
      <dt>Dokumente</dt><dd>${counts.documents ?? 0}</dd>
      <dt>Anhänge</dt><dd>${counts.attachments ?? 0}</dd>
      <dt>Wiederholungen</dt><dd>${counts.reviews ?? 0}</dd>
    </dl></div>
    ${result.problems?.length
      ? `<div class="form-error" style="margin:0"><strong>Probleme gefunden:</strong><ul style="margin:.4rem 0 0 1rem;padding:0">${result.problems.map((problem) => `<li>${esc(problem)}</li>`).join('')}</ul></div>`
      : '<div class="form-success">Datei geprüft: vollständig lesbar.</div>'}
    ${result.warnings?.length
      ? `<div class="badge badge-warning" style="white-space:normal">Hinweise: ${esc(result.warnings.join(' '))}</div>`
      : ''}
    <p class="hint" style="margin:0">Beim Wiederherstellen werden alle aktuellen Daten ersetzt. StudyForge legt vorher automatisch ein Sicherheitsbackup im Datenordner an.</p>
  </div>`;
}

export async function render(root, ctx) {
  await refreshMeta();
  const meta = state.meta;
  const counts = meta?.counts ?? {};

  root.innerHTML = `
    <div class="page-head">
      <div class="page-heading">
        <h1>Sichern &amp; Einstellungen</h1>
        <p class="page-sub">Alles bleibt auf deinem Gerät – hier verwaltest du Darstellung, Lernen und deine Daten.</p>
      </div>
    </div>

    <div class="settings-grid">
      <section class="card settings-section">
        <h2>Darstellung</h2>
        <div class="field"><span class="field-label">Design</span>
          <div class="radio-cards">
            ${[['system', 'System'], ['light', 'Hell'], ['dark', 'Dunkel']]
              .map(([value, label]) => `<label class="radio-card"><input type="radio" name="theme" value="${value}"${state.settings.theme === value ? ' checked' : ''}> ${label}</label>`)
              .join('')}
          </div>
        </div>
        <div class="field"><span class="field-label">Schriftgröße</span>
          <div class="radio-cards">
            ${[['sm', 'Klein'], ['md', 'Mittel'], ['lg', 'Groß'], ['xl', 'Sehr groß']]
              .map(([value, label]) => `<label class="radio-card"><input type="radio" name="font_size" value="${value}"${state.settings.font_size === value ? ' checked' : ''}> ${label}</label>`)
              .join('')}
          </div>
          <span class="hint">Wirkt sofort auf die gesamte Oberfläche.</span>
        </div>
        <div class="field">
          <label class="checkbox"><input type="checkbox" id="editor-split"${state.settings.editor_split === '1' ? ' checked' : ''}> Editor standardmäßig geteilt anzeigen</label>
        </div>
      </section>

      <section class="card settings-section">
        <h2>Lernen</h2>
        <div class="form-row">
          <div class="field"><label for="review-limit">Karten pro Einheit</label>
            <input class="input" type="number" id="review-limit" min="5" max="200" value="${esc(state.settings.review_limit || '20')}">
            <span class="hint">Standardwert für neue Lerneinheiten.</span></div>
          <div class="field"><label for="retention">Ziel-Merkfähigkeit</label>
            <select class="select" id="retention">
              ${[['0.8', '80 % – weniger Wiederholungen'], ['0.85', '85 %'], ['0.9', '90 % – ausgeglichen (empfohlen)'], ['0.95', '95 % – mehr Wiederholungen']]
                .map(([value, label]) => `<option value="${value}"${String(state.settings.requested_retention) === value ? ' selected' : ''}>${label}</option>`)
                .join('')}
            </select>
            <span class="hint">Höhere Werte planen kürzere Abstände. FSRS berechnet daraus die Intervalle.</span></div>
        </div>
        <div class="field">
          <label class="checkbox"><input type="checkbox" id="timer-default"${state.settings.timer_default === '1' ? ' checked' : ''}> Zeitlimit im Lernmodus standardmäßig aktivieren</label>
          <div class="row mt-1"><input class="input" type="number" id="timer-minutes" min="5" max="120" value="${esc(state.settings.timer_minutes || '25')}" style="width:90px"><span class="small subtle">Minuten</span></div>
          <span class="hint">Der Timer ist immer abschaltbar. Es gibt keine Streaks oder Strafen.</span>
        </div>
        <div class="row"><button class="btn btn-primary" id="save-learning">Lerneinstellungen speichern</button></div>
      </section>

      <section class="card settings-section">
        <h2>Speicherort</h2>
        <div class="data-path">${esc(meta?.dataDir || 'unbekannt')}</div>
        <p class="small subtle" style="margin:0">Datenbank: <span class="mono">${esc(meta?.dbPath || '')}</span><br>
          Anhänge: <span class="mono">${esc(meta?.filesDir || '')}</span></p>
        <div class="row small subtle">
          <span class="badge">${formatBytes(meta?.dbSize || 0)} Datenbank</span>
          <span class="badge">${counts.files ?? 0} Dateien</span>
          <span class="badge">${meta?.node || ''}</span>
          <span class="badge">StudyForge ${esc(meta?.version || '')} · Schema ${esc(String(meta?.schemaVersion ?? ''))}</span>
        </div>
        ${meta?.lastMigration
          ? `<p class="hint" style="margin:0">Letzte Datenbankmigration: Schema ${esc(String(meta.lastMigration.from))} → ${esc(String(meta.lastMigration.to))} am ${esc(new Date(meta.lastMigration.at).toLocaleString('de-DE'))}. Geprüfte Sicherung davor: <span class="mono">data/backups/${esc(meta.lastMigration.backup || '')}</span></p>`
          : ''}
        <p class="hint">Für einen Umzug genügt es, den gesamten Projektordner zu kopieren – oder ein vollständiges ZIP-Backup zu verwenden. Der Ordner <code>data/</code> enthält Datenbank, Anhänge und Sicherheitsbackups.</p>
        <div class="row">
          <button class="btn btn-sm" id="integrity-check">${icon('check')} Datenbank prüfen</button>
          <button class="btn btn-sm" id="refresh-meta">Aktualisieren</button>
        </div>
      </section>

      <section class="card settings-section">
        <h2>Vollständige Sicherung</h2>
        <p class="small subtle" style="margin:0">Das ZIP-Backup enthält Datenbankinhalt, Anhänge und Dokumente. Prüfsummen stellen sicher, dass nichts unbemerkt verloren geht.</p>
        <div class="row">
          <button class="btn btn-primary" id="export-backup">${icon('download')} ZIP-Backup erstellen</button>
          <button class="btn" id="export-json">JSON-Export (inkl. Dateien)</button>
          <button class="btn" id="export-markdown">Markdown-Export</button>
          <button class="btn" id="export-cards">Karten exportieren</button>
        </div>
        <p class="hint">Der JSON-Export bettet Anhänge als Base64 ein und ist vollständig wiederherstellbar. Der Markdown-Export ist zum Lesen/Archivieren gedacht.</p>
        ${meta?.backups?.length
          ? `<div><div class="tiny faint mb-1">Sicherheitsbackups</div><div class="backup-list">
              ${meta.backups.map((backup) => `<div class="row-between small"><span class="truncate mono" title="${esc(backup.name)}">${esc(backup.name)}</span>
                <span class="row" style="gap:.4rem"><span class="faint tiny">${formatBytes(backup.size)}</span><a class="btn btn-sm" href="/api/backups/${encodeURIComponent(backup.name)}">${icon('download')}</a></span></div>`).join('')}
            </div></div>`
          : '<p class="small faint" style="margin:0">Noch keine Sicherheitsbackups vorhanden.</p>'}
      </section>

      <section class="card settings-section">
        <h2>Backup wiederherstellen</h2>
        <p class="small subtle" style="margin:0">Unterstützt ZIP-Backups und JSON-Datenexporte. Die Datei wird vor dem Import geprüft.</p>
        <div class="upload-zone">
          <input type="file" id="import-file" accept=".zip,.json,application/zip,application/json">
          <div class="row mt-1"><button class="btn" id="import-inspect" disabled>${icon('upload')} Datei prüfen …</button></div>
        </div>
        <p class="hint">Ein Import ersetzt alle vorhandenen Daten. Vorher wird automatisch ein Sicherheitsbackup erstellt, sofern die aktuellen Daten lesbar sind.</p>
      </section>

      <section class="card settings-section">
        <h2>Zurücksetzen</h2>
        <div class="stack">
          <div>
            <div class="row-between"><strong class="small">Nur Einstellungen</strong>
              <button class="btn btn-sm" id="reset-settings">Einstellungen zurücksetzen</button></div>
            <p class="hint" style="margin:.3rem 0 0">Design, Schriftgröße und Lerneinstellungen gehen auf die Standardwerte zurück. Alle Inhalte bleiben erhalten.</p>
          </div>
          <div>
            <div class="row-between"><strong class="small">Alle Daten löschen</strong>
              <button class="btn btn-sm btn-danger" id="reset-all">${icon('trash')} Alles zurücksetzen …</button></div>
            <p class="hint" style="margin:.3rem 0 0">Löscht Fächer, Semester, Notizen, Karten, Dokumente, Aufgaben, Prüfungen, Kalender und eigene Vorlagen – StudyForge startet wie neu installiert. Vorher wird automatisch ein vollständiges ZIP-Backup in <code>data/backups/</code> angelegt; gelingt das nicht, wird nichts gelöscht.</p>
          </div>
        </div>
      </section>

      <section class="card settings-section">
        <h2>Datenschutz &amp; Sicherheit</h2>
        <ul class="small subtle" style="margin:0;padding-left:1.1rem;line-height:1.7">
          <li>Der Server lauscht ausschließlich auf <code>127.0.0.1</code> – nicht im Netzwerk.</li>
          <li>Keine Konten, keine Cloud, keine Telemetrie, keine Werbung, keine externen Schriftarten oder CDNs.</li>
          <li>Alle Skripte und Stylesheets liegen im Projektordner.</li>
          <li>Importierte Dateien werden kopiert, nie verändert; HTML/SVG werden nie ausgeführt.</li>
          <li>Löschvorgänge fragen nach; Notizen landen zuerst im Papierkorb.</li>
          <li>Es gibt keine automatische Synchronisierung.</li>
        </ul>
        <div class="row small subtle">${icon('offline')}<span>Offline nutzbar: Start und alle Kernfunktionen benötigen keine Internetverbindung.</span></div>
      </section>

      <section class="card settings-section">
        <h2>Tastaturkürzel</h2>
        <div class="stack small">
          <div class="row-between"><span>Suche öffnen</span><span><kbd>Strg</kbd> + <kbd>K</kbd></span></div>
          <div class="row-between"><span>Notiz speichern</span><span><kbd>Strg</kbd> + <kbd>S</kbd></span></div>
          <div class="row-between"><span>Antwort aufdecken (Lernen)</span><kbd>Leertaste</kbd></div>
          <div class="row-between"><span>Karte bewerten (Lernen)</span><span><kbd>1</kbd> – <kbd>4</kbd></span></div>
          <div class="row-between"><span>Lerneinheit beenden</span><kbd>Esc</kbd></div>
          <div class="row-between"><span>Dialog schließen</span><kbd>Esc</kbd></div>
        </div>
      </section>

      <section class="card settings-section">
        <h2>Über StudyForge</h2>
        <p class="small subtle" style="margin:0">Version ${esc(meta?.version || '–')} · Node ${esc(meta?.node || '–')} · lokale Anwendung ohne Konto.</p>
        <div class="mt-2">${countGrid(counts)}</div>
        <p class="small faint" style="margin:0">Die Anwendung ist ein persönliches Lernwerkzeug. Sie ersetzt keine fachliche Prüfung und trifft keine Aussagen über Prüfungserfolg.</p>
      </section>
    </div>`;

  // Darstellung
  root.querySelectorAll('input[name="theme"]').forEach((radio) => {
    radio.addEventListener('change', async () => {
      try {
        await saveSettings({ theme: radio.value });
        toast('Design gespeichert.', 'success');
      } catch (error) {
        errorToast(error);
      }
    });
  });
  root.querySelectorAll('input[name="font_size"]').forEach((radio) => {
    radio.addEventListener('change', async () => {
      try {
        await saveSettings({ font_size: radio.value });
        toast('Schriftgröße gespeichert.', 'success');
      } catch (error) {
        errorToast(error);
      }
    });
  });
  root.querySelector('#editor-split').addEventListener('change', async (event) => {
    try {
      await saveSettings({ editor_split: event.target.checked ? '1' : '0' });
      toast('Editor-Einstellung gespeichert.', 'success');
    } catch (error) {
      errorToast(error);
    }
  });

  root.querySelector('#save-learning').addEventListener('click', async () => {
    try {
      await saveSettings({
        review_limit: root.querySelector('#review-limit').value,
        requested_retention: root.querySelector('#retention').value,
        timer_default: root.querySelector('#timer-default').checked ? '1' : '0',
        timer_minutes: root.querySelector('#timer-minutes').value
      });
      toast('Lerneinstellungen gespeichert.', 'success');
    } catch (error) {
      errorToast(error);
    }
  });

  root.querySelector('#integrity-check').addEventListener('click', async () => {
    try {
      const result = await api.get('/health');
      toast(result.ok ? 'Datenbank ist in Ordnung.' : 'Datenbankprüfung meldet ein Problem. Bitte Backup erstellen und Terminal prüfen.', result.ok ? 'success' : 'error', 7000);
    } catch (error) {
      errorToast(error);
    }
  });
  root.querySelector('#refresh-meta').addEventListener('click', () => render(root, ctx));

  root.querySelector('#export-backup').addEventListener('click', () => downloadFromApi('/export/backup'));
  root.querySelector('#export-json').addEventListener('click', () => downloadFromApi('/export/json'));
  root.querySelector('#export-markdown').addEventListener('click', () => downloadFromApi('/export/markdown'));
  root.querySelector('#export-cards').addEventListener('click', () => downloadFromApi('/export/cards'));

  // Zurücksetzen
  root.querySelector('#reset-settings').addEventListener('click', async () => {
    if (!(await confirmDialog({ title: 'Einstellungen zurücksetzen?', message: 'Design, Schriftgröße und Lerneinstellungen werden auf die Standardwerte gesetzt. Deine Inhalte bleiben unverändert.', confirmLabel: 'Zurücksetzen' }))) return;
    try {
      await api.post('/reset', { scope: 'settings' });
      toast('Einstellungen zurückgesetzt. Die Ansicht wird neu geladen.', 'success');
      window.setTimeout(() => window.location.reload(), 800);
    } catch (error) {
      errorToast(error);
    }
  });
  root.querySelector('#reset-all').addEventListener('click', () => openResetAllDialog(counts));

  // Import
  const fileInput = root.querySelector('#import-file');
  const inspectButton = root.querySelector('#import-inspect');
  fileInput.addEventListener('change', () => {
    inspectButton.disabled = !fileInput.files[0];
    inspectButton.textContent = fileInput.files[0] ? 'Gewählte Datei prüfen' : 'Datei prüfen …';
  });
  inspectButton.addEventListener('click', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      inspectButton.disabled = true;
      inspectButton.textContent = 'Wird geprüft …';
      const result = await api.raw('/import/inspect', {
        method: 'POST',
        body: file,
        headers: { 'Content-Type': 'application/octet-stream' }
      });
      openRestoreDialog(file, result, root, ctx);
    } catch (error) {
      errorToast(error);
    } finally {
      inspectButton.disabled = false;
      inspectButton.textContent = fileInput.files[0] ? 'Gewählte Datei prüfen' : 'Datei prüfen …';
    }
  });
}

const RESET_WORD = 'ZURÜCKSETZEN';

function openResetAllDialog(counts) {
  openModal({
    title: 'Alle Daten löschen?',
    body: `<div class="form-error" data-error hidden></div>
      <p style="margin:0">Folgendes wird endgültig aus StudyForge entfernt:</p>
      <div class="mt-2">${countGrid(counts)}</div>
      <p class="small subtle">Dazu kommen Themen, Lernziele, Ordner, Tags, Kalenderquellen und -termine sowie alle Anhänge. Mitgelieferte Vorlagen und Standardeinstellungen werden neu angelegt.</p>
      <p class="hint">Vorher wird ein vollständiges ZIP-Backup in <code>data/backups/</code> erstellt. Damit kannst du alles unter „Backup wiederherstellen“ zurückholen.</p>
      <div class="field"><label for="reset-confirm">Zum Bestätigen <strong>${RESET_WORD}</strong> eingeben</label>
        <input class="input" id="reset-confirm" autocomplete="off" spellcheck="false"></div>`,
    actions: [
      { label: 'Abbrechen' },
      {
        label: 'Alles löschen',
        variant: 'danger',
        onClick: async (_close, dialog) => {
          const errorBox = dialog.querySelector('[data-error]');
          const word = dialog.querySelector('#reset-confirm').value.trim();
          if (word !== RESET_WORD) {
            errorBox.textContent = `Bitte genau „${RESET_WORD}“ eingeben.`;
            errorBox.hidden = false;
            return false;
          }
          try {
            const result = await api.post('/reset', { scope: 'all', confirm: word });
            toast(`Alle Daten gelöscht. Sicherung: ${result.safetyBackup}`, 'success', 8000);
            window.setTimeout(() => {
              window.location.hash = '#/';
              window.location.reload();
            }, 1200);
            return false;
          } catch (error) {
            errorBox.textContent = error.message;
            errorBox.hidden = false;
            return false;
          }
        }
      }
    ]
  });
}

function openRestoreDialog(file, inspection, root, ctx) {
  openModal({
    title: 'Backup wiederherstellen',
    subtitle: file.name,
    wide: true,
    body: `<div class="form-error" data-error hidden></div>
      ${backupInspectSummary(inspection)}
      ${inspection.ok
        ? `<label class="checkbox mt-2"><input type="checkbox" id="confirm-replace"> Ich verstehe, dass alle aktuellen Daten ersetzt werden.</label>`
        : '<p class="hint">Diese Datei kann nicht wiederhergestellt werden, solange Probleme gemeldet werden.</p>'}`,
    actions: inspection.ok
      ? [
          { label: 'Abbrechen' },
          {
            label: 'Daten ersetzen und wiederherstellen',
            variant: 'danger',
            onClick: async (_close, dialog) => {
              const checked = dialog.querySelector('#confirm-replace').checked;
              const errorBox = dialog.querySelector('[data-error]');
              if (!checked) {
                errorBox.textContent = 'Bitte die Bestätigung setzen.';
                errorBox.hidden = false;
                return false;
              }
              try {
                await api.raw('/import?confirm=replace', {
                  method: 'POST',
                  body: file,
                  headers: { 'Content-Type': 'application/octet-stream' }
                });
                toast('Backup wiederhergestellt. Die Ansicht wird neu geladen.', 'success', 6000);
                window.setTimeout(() => window.location.reload(), 800);
                return false;
              } catch (error) {
                errorBox.textContent = error.message;
                errorBox.hidden = false;
                return false;
              }
            }
          }
        ]
      : [{ label: 'Schließen', variant: 'primary' }]
  });
  void root;
  void ctx;
  void confirmDialog;
  void loadCore;
}
