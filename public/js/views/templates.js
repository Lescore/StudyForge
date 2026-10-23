import { api } from '../api.js';
import { state } from '../store.js';
import {
  esc,
  icon,
  toast,
  errorToast,
  confirmDialog,
  openModal,
  subjectOptions,
  emptyState,
  typesetMath
} from '../ui.js';
import { renderMarkdown } from '../lib/markdown.js';

const KIND_LABELS = {
  zusammenfassung: 'Zusammenfassung',
  definition: 'Definition',
  loesungsweg: 'Lösungsweg',
  dokumentation: 'Dokumentation',
  fehleranalyse: 'Fehleranalyse',
  vergleich: 'Vergleich',
  pruefung: 'Prüfungsvorbereitung',
  netzwerk: 'Netzwerkdokumentation',
  code: 'Programmierbeispiel',
  notiz: 'Notiz'
};

function templateCard(template) {
  return `<article class="template-card">
    <div class="row-between">
      <div>
        <div class="subject-name">${esc(template.name)}</div>
        <div class="list-meta"><span class="badge">${esc(KIND_LABELS[template.kind] || template.kind)}</span>${template.builtin ? '<span class="faint tiny">eingebaut · anpassbar</span>' : ''}</div>
      </div>
    </div>
    <div class="template-preview">${esc(template.content.slice(0, 220))}${template.content.length > 220 ? '…' : ''}</div>
    <div class="template-actions">
      <button class="btn btn-sm btn-primary" data-use-template="${template.id}">${icon('plus')} Notiz daraus</button>
      <button class="btn btn-sm" data-edit-template="${template.id}">${icon('edit')}</button>
      <button class="btn btn-sm" data-duplicate-template="${template.id}">${icon('templates')}</button>
      <button class="icon-btn danger" data-delete-template="${template.id}" data-name="${esc(template.name)}" aria-label="Vorlage löschen">${icon('trash')}</button>
    </div>
  </article>`;
}

function openTemplateEditor(template, onDone) {
  openModal({
    title: template ? 'Vorlage bearbeiten' : 'Neue Vorlage',
    wide: true,
    subtitle: 'Markdown mit Platzhaltern wie {{Titel}} – Inhalte sind keine automatisch geprüften Aussagen.',
    body: `<div class="form-error" data-error hidden></div>
      <div class="form-row">
        <div class="field"><label for="template-name">Name</label><input class="input" id="template-name" value="${esc(template?.name ?? '')}" placeholder="z. B. Meine Kapitel-Zusammenfassung"></div>
        <div class="field"><label for="template-kind">Art</label>
          <select class="select" id="template-kind">${Object.entries(KIND_LABELS).map(([value, label]) => `<option value="${value}"${(template?.kind ?? 'notiz') === value ? ' selected' : ''}>${label}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label for="template-content">Inhalt (Markdown)</label>
        <textarea class="textarea mono" id="template-content" rows="16" spellcheck="true">${esc(template?.content ?? '# {{Titel}}\n\n## Kernaussagen\n\n- \n\n## Offene Fragen\n\n- [ ] \n')}</textarea>
        <span class="hint">{{Titel}} wird beim Verwenden durch den gewählten Titel ersetzt. Formeln mit $…$ und Codeblöcke werden unterstützt.</span></div>`,
    actions: [
      { label: 'Abbrechen' },
      {
        label: 'Speichern',
        variant: 'primary',
        onClick: async (_close, dialog) => {
          try {
            const payload = {
              name: dialog.querySelector('#template-name').value,
              kind: dialog.querySelector('#template-kind').value,
              content: dialog.querySelector('#template-content').value
            };
            if (template) await api.patch(`/templates/${template.id}`, payload);
            else await api.post('/templates', payload);
            toast('Vorlage gespeichert.', 'success');
            await onDone();
          } catch (error) {
            const box = dialog.querySelector('[data-error]');
            box.textContent = error.message;
            box.hidden = false;
            return false;
          }
        }
      }
    ]
  });
}

async function openUseTemplate(template, onDone) {
  let folders = [];
  try {
    folders = await api.get('/folders');
  } catch {
    folders = [];
  }
  const { body } = openModal({
    title: 'Notiz aus Vorlage erstellen',
    subtitle: template.name,
    wide: true,
    body: `<div class="form-error" data-error hidden></div>
      <div class="form-row">
        <div class="field"><label for="use-template-title">Titel der Notiz</label><input class="input" id="use-template-title" value="${esc(template.name)}"></div>
        <div class="field"><label for="use-template-subject">Fach</label>
          <select class="select" id="use-template-subject"><option value="">Kein Fach</option>${subjectOptions(state.subjects, state.settings.last_subject_id, { includeEmpty: false })}</select></div>
        <div class="field"><label for="use-template-folder">Ordner</label>
          <select class="select" id="use-template-folder"><option value="">Kein Ordner</option>${folders.map((folder) => `<option value="${folder.id}">${esc(folder.path || folder.name)}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label for="use-template-topic">Thema</label><input class="input" id="use-template-topic"></div>
      <div class="field"><span class="field-label">Vorschau</span>
        <div class="markdown" id="template-preview" style="max-height:320px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:.8rem"></div>
      </div>
      <p class="hint">Du kannst die Notiz nach dem Erstellen vollständig bearbeiten. Die Vorlage bleibt unverändert.</p>`,
    actions: [
      { label: 'Abbrechen' },
      {
        label: 'Notiz erstellen',
        variant: 'primary',
        onClick: async (_close, dialog) => {
          try {
            const title = dialog.querySelector('#use-template-title').value.trim() || 'Neue Notiz';
            const content = template.content.replaceAll('{{Titel}}', title);
            const note = await api.post('/notes', {
              title,
              content,
              subject_id: dialog.querySelector('#use-template-subject').value || null,
              folder_id: dialog.querySelector('#use-template-folder').value || null,
              topic: dialog.querySelector('#use-template-topic').value
            });
            toast('Notiz aus Vorlage erstellt.', 'success');
            window.location.hash = `#/notizen/${note.id}`;
            await onDone();
          } catch (error) {
            const box = dialog.querySelector('[data-error]');
            box.textContent = error.message;
            box.hidden = false;
            return false;
          }
        }
      }
    ]
  });
  const renderPreview = () => {
    const title = body.querySelector('#use-template-title').value.trim() || 'Neue Notiz';
    const preview = body.querySelector('#template-preview');
    preview.innerHTML = renderMarkdown(template.content.replaceAll('{{Titel}}', title));
    typesetMath(preview);
  };
  body.querySelector('#use-template-title').addEventListener('input', renderPreview);
  renderPreview();
}

export async function render(root, ctx) {
  const templates = await api.get('/templates');
  root.innerHTML = `
    <div class="page-head">
      <div class="page-heading">
        <h1>Lernvorlagen</h1>
        <p class="page-sub">Wiederkehrende Strukturen für Zusammenfassungen, Lösungswege und Prüfungsvorbereitung.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="new-template">${icon('plus')} Eigene Vorlage</button>
      </div>
    </div>

    <div class="card mb-2">
      <div class="row small subtle">
        ${icon('alert')}
        <span>Vorlagen strukturieren nur deine Gedanken. Sie ersetzen keine Prüfung der Inhalte – was du schreibst, bleibt deine eigene Darstellung.</span>
      </div>
    </div>

    <div class="grid grid-3">
      ${templates.length
        ? templates.map(templateCard).join('')
        : emptyState('Keine Vorlagen', 'Erstelle eine eigene Vorlage für Inhalte, die du immer wieder brauchst.', '<button class="btn btn-primary" data-new-template>Vorlage erstellen</button>')}
    </div>`;

  const reload = () => render(root, ctx);
  const openEditor = (template = null) => openTemplateEditor(template, reload);
  root.querySelector('#new-template').addEventListener('click', () => openEditor());
  root.querySelector('[data-new-template]')?.addEventListener('click', () => openEditor());
  root.querySelectorAll('[data-use-template]').forEach((button) => {
    button.addEventListener('click', () => {
      const template = templates.find((item) => item.id === Number(button.dataset.useTemplate));
      if (template) openUseTemplate(template, reload);
    });
  });
  root.querySelectorAll('[data-edit-template]').forEach((button) => {
    button.addEventListener('click', () => {
      const template = templates.find((item) => item.id === Number(button.dataset.editTemplate));
      if (template) openEditor(template);
    });
  });
  root.querySelectorAll('[data-duplicate-template]').forEach((button) => {
    button.addEventListener('click', async () => {
      const template = templates.find((item) => item.id === Number(button.dataset.duplicateTemplate));
      if (!template) return;
      try {
        await api.post('/templates', {
          name: `${template.name} (Kopie)`,
          kind: template.kind,
          content: template.content
        });
        toast('Vorlage dupliziert.', 'success');
        await reload();
      } catch (error) {
        errorToast(error);
      }
    });
  });
  root.querySelectorAll('[data-delete-template]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Vorlage löschen?', message: `„${button.dataset.name}“ wird entfernt. Notizen, die daraus entstanden sind, bleiben erhalten.`, confirmLabel: 'Löschen', danger: true }))) return;
      try {
        await api.delete(`/templates/${button.dataset.deleteTemplate}`);
        toast('Vorlage gelöscht.', 'success');
        await reload();
      } catch (error) {
        errorToast(error);
      }
    });
  });
}
