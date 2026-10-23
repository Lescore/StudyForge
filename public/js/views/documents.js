import { api } from '../api.js';
import { state } from '../store.js';
import {
  esc,
  icon,
  toast,
  errorToast,
  confirmDialog,
  openModal,
  formatDate,
  formatBytes,
  subjectOptions,
  emptyState,
  fileKindLabel,
  fileTypeKind,
  debounce,
  typesetMath
} from '../ui.js';
import { renderMarkdown } from '../lib/markdown.js';
import { highlightCode } from '../lib/highlight.js';

function highlightSnippet(text, query) {
  const safe = esc(text);
  const words = String(query || '')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 1)
    .slice(0, 4)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return safe;
  return safe.replace(new RegExp(`(${words.join('|')})`, 'gi'), '<mark>$1</mark>');
}

function docCard(doc, query = '') {
  const kind = fileTypeKind(doc);
  const thumb =
    kind === 'image'
      ? `<img src="/api/files/${doc.id}/raw" alt="" loading="lazy">`
      : esc(fileKindLabel(doc));
  return `<article class="doc-card">
    <div class="doc-top">
      <div class="doc-thumb">${thumb}</div>
      <div style="min-width:0;flex:1">
        <div class="doc-name">${esc(doc.title || doc.original_name)}</div>
        <div class="doc-meta">${esc(doc.subject_name || 'Ohne Fach')}${doc.topic ? ` · ${esc(doc.topic)}` : ''}</div>
        <div class="doc-meta">${formatBytes(doc.size)} · ${formatDate(doc.created_at, { short: true })}${doc.has_text ? ' · Volltext durchsuchbar' : ''}</div>
      </div>
    </div>
    ${doc.description ? `<p class="small subtle" style="margin:0">${esc(doc.description.slice(0, 160))}${doc.description.length > 160 ? '…' : ''}</p>` : ''}
    ${doc.snippet ? `<p class="doc-snippet small subtle">${highlightSnippet(doc.snippet, query)}</p>` : ''}
    ${doc.note_id ? `<a class="small" href="#/notizen/${doc.note_id}">Mit Notiz „${esc(doc.note_title || '')}“ verknüpft</a>` : ''}
    <div class="doc-actions">
      <button class="btn btn-sm btn-primary" data-view-doc="${doc.id}">Ansehen</button>
      <button class="btn btn-sm" data-edit-doc="${doc.id}">Details</button>
      <a class="btn btn-sm" href="/api/files/${doc.id}/raw?download=1">${icon('download')}</a>
      <button class="icon-btn danger" data-delete-doc="${doc.id}" data-name="${esc(doc.title || doc.original_name)}" aria-label="Dokument löschen">${icon('trash')}</button>
    </div>
  </article>`;
}

export async function render(root, ctx) {
  const initialQuery = ctx.query.get('q') || '';
  const initialSubject = ctx.query.get('subject_id') || '';
  let documents = [];

  const fetchDocs = async (q = initialQuery, subjectId = initialSubject) => {
    const params = new URLSearchParams({ kind: 'document' });
    if (q) params.set('q', q);
    if (subjectId) params.set('subject_id', subjectId);
    return api.get(`/files?${params.toString()}`);
  };

  documents = await fetchDocs();

  root.innerHTML = `
    <div class="page-head">
      <div class="page-heading">
        <h1>Dokumente</h1>
        <p class="page-sub">Skripte, Übungen, Screenshots und eigene Zusammenfassungen – lokal gespeichert.</p>
      </div>
      <div class="page-actions">
        <a class="btn" href="#/notizen?neu=1">${icon('plus')} Eigene Zusammenfassung</a>
        <button class="btn btn-primary" id="upload-doc">${icon('upload')} Dokument hinzufügen</button>
      </div>
    </div>

    <div class="toolbar">
      <div class="search-field">${icon('search')}
        <input class="input" id="doc-search" type="search" placeholder="Titel, Thema, Schlagwörter, Dateiname …" value="${esc(initialQuery)}">
      </div>
      <select class="select" id="doc-subject">
        <option value="">Alle Fächer</option>
        ${subjectOptions(state.subjects, initialSubject, { includeEmpty: false })}
      </select>
      <span class="small faint" id="doc-count"></span>
    </div>

    <div id="doc-results"></div>

    <div class="card mt-3">
      <div class="row small subtle">
        ${icon('offline')}
        <span>Originaldateien werden beim Import nur gelesen und in den Datenordner kopiert – nie verändert. Nicht darstellbare Formate bleiben als Download verfügbar.</span>
      </div>
    </div>`;

  const results = root.querySelector('#doc-results');
  const countEl = root.querySelector('#doc-count');

  const renderDocs = (list) => {
    const query = root.querySelector('#doc-search')?.value || '';
    countEl.textContent = `${list.length} ${list.length === 1 ? 'Dokument' : 'Dokumente'}`;
    results.innerHTML = list.length
      ? `<div class="doc-grid">${list.map((doc) => docCard(doc, query)).join('')}</div>`
      : emptyState(
          'Noch keine Dokumente',
          'Lade Skripte, Übungsblätter, Screenshots oder eigene Markdown-Dateien hoch. PDFs lassen sich direkt in der App lesen.',
          '<button class="btn btn-primary" data-upload-empty>Erstes Dokument hinzufügen</button>'
        );
    wireCards();
  };

  const reload = async () => {
    documents = await fetchDocs(root.querySelector('#doc-search').value, root.querySelector('#doc-subject').value);
    renderDocs(documents);
  };

  const wireCards = () => {
    results.querySelectorAll('[data-view-doc]').forEach((button) => {
      button.addEventListener('click', () => {
        const doc = documents.find((item) => item.id === Number(button.dataset.viewDoc));
        if (doc) openViewer(doc, { onChanged: reload });
      });
    });
    results.querySelectorAll('[data-edit-doc]').forEach((button) => {
      button.addEventListener('click', () => {
        const doc = documents.find((item) => item.id === Number(button.dataset.editDoc));
        if (doc) openMetadataDialog(doc, { onSaved: reload });
      });
    });
    results.querySelectorAll('[data-delete-doc]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: 'Dokument löschen?', message: `„${button.dataset.name}“ wird aus StudyForge entfernt. Falls du die Datei behalten willst, lade sie vorher herunter.`, confirmLabel: 'Dokument löschen', danger: true }))) return;
        try {
          await api.delete(`/files/${button.dataset.deleteDoc}`);
          toast('Dokument gelöscht.', 'success');
          await reload();
        } catch (error) {
          errorToast(error);
        }
      });
    });
    results.querySelectorAll('[data-upload-empty]').forEach((button) => button.addEventListener('click', openUploadDialog));
  };

  renderDocs(documents);

  const requestedDoc = Number(ctx.query.get('doc'));
  if (requestedDoc) {
    const doc = documents.find((item) => item.id === requestedDoc);
    if (doc) openViewer(doc, { onChanged: reload });
  }

  root.querySelector('#upload-doc').addEventListener('click', openUploadDialog);
  root.querySelector('#doc-search').addEventListener(
    'input',
    debounce(async (event) => {
      try {
        documents = await fetchDocs(event.target.value, root.querySelector('#doc-subject').value);
        renderDocs(documents);
        const query = new URLSearchParams();
        if (event.target.value) query.set('q', event.target.value);
        if (root.querySelector('#doc-subject').value) query.set('subject_id', root.querySelector('#doc-subject').value);
        history.replaceState(null, '', `#/dokumente${query.toString() ? `?${query.toString()}` : ''}`);
      } catch (error) {
        errorToast(error);
      }
    }, 300)
  );
  root.querySelector('#doc-subject').addEventListener('change', async (event) => {
    try {
      documents = await fetchDocs(root.querySelector('#doc-search').value, event.target.value);
      renderDocs(documents);
    } catch (error) {
      errorToast(error);
    }
  });

  function openUploadDialog() {
    api
      .get('/notes?limit=300&sort=updated')
      .then((notesResponse) => {
        const notes = Array.isArray(notesResponse) ? notesResponse : notesResponse?.notes ?? [];
        openModal({
          title: 'Dokument hinzufügen',
          subtitle: 'Die Datei wird kopiert; das Original bleibt unverändert.',
          body: `<form id="upload-form">
            <div class="form-error" data-error hidden></div>
            <div class="field"><label for="upload-file">Datei <span class="required">*</span></label>
              <input type="file" id="upload-file" required>
              <span class="hint">PDF, Bilder, Text, Markdown, Quellcode, Office-Dateien u. a. – max. 64 MB pro Datei.</span></div>
            <div class="field"><label for="upload-title">Titel</label>
              <input class="input" id="upload-title" name="title" placeholder="Wird sonst aus dem Dateinamen übernommen"></div>
            <div class="form-row">
              <div class="field"><label for="upload-subject">Fach</label>
                <select class="select" id="upload-subject" name="subject_id"><option value="">Kein Fach</option>${subjectOptions(state.subjects, null, { includeEmpty: false })}</select></div>
              <div class="field"><label for="upload-topic">Thema</label>
                <input class="input" id="upload-topic" name="topic" placeholder="z. B. Subnetting"></div>
            </div>
            <div class="field"><label for="upload-description">Beschreibung</label>
              <textarea class="textarea" id="upload-description" name="description" rows="2"></textarea></div>
            <div class="field"><label for="upload-note">Mit Notiz verknüpfen</label>
              <select class="select" id="upload-note" name="note_id"><option value="">Keine Notiz</option>${notes.map((note) => `<option value="${note.id}">${esc(note.title)}</option>`).join('')}</select></div>
          </form>`,
          actions: [
            { label: 'Abbrechen' },
            {
              label: 'Hochladen',
              variant: 'primary',
              keepOpen: true,
              onClick: async (close, dialog) => {
                const file = dialog.querySelector('#upload-file').files[0];
                const error = dialog.querySelector('[data-error]');
                if (!file) {
                  error.textContent = 'Bitte eine Datei auswählen.';
                  error.hidden = false;
                  return false;
                }
                if (file.size > 64 * 1024 * 1024) {
                  error.textContent = 'Die Datei ist größer als 64 MB.';
                  error.hidden = false;
                  return false;
                }
                const params = new URLSearchParams({ kind: 'document', filename: file.name });
                const title = dialog.querySelector('#upload-title').value.trim();
                if (title) params.set('title', title);
                if (dialog.querySelector('#upload-subject').value) params.set('subject_id', dialog.querySelector('#upload-subject').value);
                if (dialog.querySelector('#upload-topic').value) params.set('topic', dialog.querySelector('#upload-topic').value);
                if (dialog.querySelector('#upload-description').value) params.set('description', dialog.querySelector('#upload-description').value);
                if (dialog.querySelector('#upload-note').value) params.set('note_id', dialog.querySelector('#upload-note').value);
                try {
                  const created = await api.upload(`/files?${params.toString()}`, file, { 'Content-Type': file.type || 'application/octet-stream' });
                  toast(`„${file.name}“ hinzugefügt.`, 'success');
                  if (created?.text_hint) toast(created.text_hint, 'info', 7000);
                  close();
                  await reload();
                } catch (err) {
                  error.textContent = err.message;
                  error.hidden = false;
                  return false;
                }
              }
            }
          ]
        });
      })
      .catch((error) => errorToast(error));
  }

  if (ctx.query.get('upload') === '1') {
    openUploadDialog();
  }

  if (!state.subjects.length) {
    results.querySelector('.empty')?.insertAdjacentHTML(
      'beforeend',
      '<p class="small subtle">Tipp: Lege unter „Fächer“ ein Fach an, um Dokumente zuzuordnen.</p>'
    );
  }
}

function openMetadataDialog(doc, { onSaved }) {
  api
    .get('/notes?limit=300&sort=updated')
    .then((notesResponse) => {
      const notes = Array.isArray(notesResponse) ? notesResponse : notesResponse?.notes ?? [];
      openModal({
        title: 'Dokumentdetails',
        body: `<form id="meta-form">
          <div class="form-error" data-error hidden></div>
          <div class="field"><label for="meta-title">Titel</label>
            <input class="input" id="meta-title" value="${esc(doc.title || doc.original_name)}"></div>
          <div class="field"><label for="meta-subject">Fach</label>
            <select class="select" id="meta-subject"><option value="">Kein Fach</option>${subjectOptions(state.subjects, doc.subject_id, { includeEmpty: false })}</select></div>
          <div class="field"><label for="meta-topic">Thema</label>
            <input class="input" id="meta-topic" value="${esc(doc.topic || '')}"></div>
          <div class="field"><label for="meta-note">Verknüpfte Notiz</label>
            <select class="select" id="meta-note"><option value="">Keine</option>${notes.map((note) => `<option value="${note.id}"${doc.note_id === note.id ? ' selected' : ''}>${esc(note.title)}</option>`).join('')}${doc.note_id && !notes.some((note) => note.id === doc.note_id) ? `<option value="${doc.note_id}" selected>Notiz #${doc.note_id}</option>` : ''}</select></div>
          <div class="field"><label for="meta-desc">Beschreibung</label>
            <textarea class="textarea" id="meta-desc" rows="3">${esc(doc.description || '')}</textarea></div>
          <p class="hint">Dateiname: ${esc(doc.original_name)} · ${formatBytes(doc.size)} · ${esc(doc.mime)}</p>
        </form>`,
        actions: [
          { label: 'Abbrechen' },
          {
            label: 'Speichern',
            variant: 'primary',
            onClick: async (_close, dialog) => {
              try {
                await api.patch(`/files/${doc.id}`, {
                  title: dialog.querySelector('#meta-title').value,
                  subject_id: dialog.querySelector('#meta-subject').value || null,
                  topic: dialog.querySelector('#meta-topic').value,
                  note_id: dialog.querySelector('#meta-note').value || null,
                  description: dialog.querySelector('#meta-desc').value
                });
                toast('Dokumentdetails gespeichert.', 'success');
                onSaved?.();
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
    })
    .catch((error) => errorToast(error));
}

function wireExtract(doc, target, onChanged) {
  const holder = target.querySelector('#doc-extract');
  const button = target.querySelector('#doc-reindex');

  const render = (text, chars) => {
    holder.innerHTML = text
      ? `<details class="card"><summary class="small">Textauszug · ${chars.toLocaleString('de-DE')} Zeichen durchsuchbar</summary>
          <pre class="doc-text mt-2">${esc(text.slice(0, 20000))}${text.length > 20000 ? '\n…' : ''}</pre></details>`
      : `<p class="small subtle" style="margin:0">Kein Text erkannt – vermutlich ein gescanntes PDF. Ohne Textebene findet die Suche nur Titel und Metadaten.</p>`;
  };

  const load = async () => {
    try {
      const data = await api.get(`/files/${doc.id}/text`);
      render(data.text || '', data.chars || 0);
    } catch (error) {
      holder.innerHTML = `<p class="small subtle">Textauszug konnte nicht geladen werden: ${esc(error.message)}</p>`;
    }
  };

  button?.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const result = await api.post(`/files/${doc.id}/reindex`, {});
      if (result.chars > 0) toast(`Text erkannt: ${result.chars.toLocaleString('de-DE')} Zeichen.`, 'success');
      else toast(result.reason || 'Kein Text erkannt.', 'info', 7000);
      doc.has_text = result.chars > 0;
      doc.text_chars = result.chars;
      await load();
      onChanged?.();
    } catch (error) {
      errorToast(error);
    } finally {
      button.disabled = false;
    }
  });

  load();
}

async function openViewer(doc, { onChanged }) {
  const kind = fileTypeKind(doc);
  const { body } = openModal({
    title: doc.title || doc.original_name,
    subtitle: `${doc.original_name} · ${formatBytes(doc.size)} · ${doc.subject_name || 'Ohne Fach'}${doc.topic ? ` · ${doc.topic}` : ''}`,
    wide: true,
    body: '<div class="doc-viewer"><div class="loading">Datei wird geladen …</div></div>',
    actions: [
      {
        label: 'Herunterladen',
        onClick: () => {
          window.location.href = `/api/files/${doc.id}/raw?download=1`;
        }
      },
      {
        label: 'Details bearbeiten',
        onClick: () => openMetadataDialog(doc, { onSaved: onChanged })
      },
      {
        label: 'Löschen',
        variant: 'danger',
        onClick: async () => {
          if (!(await confirmDialog({ title: 'Dokument löschen?', message: 'Die Datei wird aus StudyForge entfernt.', confirmLabel: 'Löschen', danger: true }))) return false;
          await api.delete(`/files/${doc.id}`);
          toast('Dokument gelöscht.', 'success');
          onChanged?.();
          return true;
        }
      },
      { label: 'Schließen', variant: 'primary' }
    ]
  });
  const target = body.querySelector('.doc-viewer');

  try {
    if (kind === 'pdf') {
      target.innerHTML = `<iframe class="doc-frame" src="/api/files/${doc.id}/raw" title="PDF-Vorschau: ${esc(doc.title || doc.original_name)}"></iframe>
        <div class="row-between mt-2" style="gap:.5rem;flex-wrap:wrap">
          <p class="small subtle" style="margin:0">Der Text wird lokal ausgelesen und ist durchsuchbar. Gescannte Seiten ohne Textebene brauchen OCR – die gibt es hier nicht.</p>
          <button class="btn btn-sm" id="doc-reindex">${icon('search')} Text neu einlesen</button>
        </div>
        <div id="doc-extract" class="mt-2"><p class="small subtle">Textauszug wird geladen …</p></div>`;
      wireExtract(doc, target, onChanged);
    } else if (kind === 'image') {
      target.innerHTML = `<img class="doc-image" src="/api/files/${doc.id}/raw" alt="${esc(doc.title || doc.original_name)}">`;
    } else if (kind === 'text') {
      const response = await fetch(`/api/files/${doc.id}/raw`);
      if (!response.ok) throw new Error(`Die Datei konnte nicht gelesen werden (${response.status}).`);
      const text = await response.text();
      const extension = (doc.original_name.split('.').pop() || '').toLowerCase();
      if (extension === 'md' || extension === 'markdown') {
        target.innerHTML = `<div class="tabs" style="margin-bottom:.4rem">
            <button class="tab active" data-text-view="rendered">Vorschau</button>
            <button class="tab" data-text-view="raw">Markdown</button>
          </div>
          <div id="doc-text-body" class="markdown">${renderMarkdown(text)}</div>`;
        typesetMath(target.querySelector('#doc-text-body'));
        target.querySelectorAll('[data-text-view]').forEach((tab) => {
          tab.addEventListener('click', () => {
            target.querySelectorAll('[data-text-view]').forEach((other) => other.classList.toggle('active', other === tab));
            const content = target.querySelector('#doc-text-body');
            if (tab.dataset.textView === 'rendered') {
              content.className = 'markdown';
              content.innerHTML = renderMarkdown(text);
              typesetMath(content);
            } else {
              content.className = 'doc-text';
              content.textContent = text;
            }
          });
        });
      } else {
        const language = extension === 'txt' ? 'text' : extension;
        target.innerHTML = `<pre class="doc-text"><code>${highlightCode(text, language)}</code></pre>
          <p class="small subtle" style="margin:0">Nur Anzeige – importierter Code wird niemals ausgeführt.</p>`;
      }
    } else {
      target.innerHTML = `<div class="empty" style="border:0">
        ${icon('documents')}
        <h3>Dieses Format kann nicht direkt angezeigt werden</h3>
        <p>StudyForge verliert die Datei nicht: Du kannst sie herunterladen und mit einem passenden Programm öffnen.</p>
        <a class="btn btn-primary" href="/api/files/${doc.id}/raw?download=1">Datei herunterladen</a>
      </div>
      ${fileTypeKind(doc) === 'other' ? '<p class="small subtle center">Aus Sicherheitsgründen werden HTML-, SVG- und ähnliche Dateien nie in der App ausgeführt.</p>' : ''}`;
    }
  } catch (error) {
    target.innerHTML = `<div class="empty" style="border:0">${icon('alert')}<h3>Datei nicht lesbar</h3><p>${esc(error.message)}</p></div>`;
  }
}
