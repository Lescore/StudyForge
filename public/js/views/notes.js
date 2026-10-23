import { api, downloadFromApi } from '../api.js';
import { state } from '../store.js';
import {
  $,
  $$,
  esc,
  icon,
  debounce,
  relativeTime,
  formatDateTimeShort,
  formatDate,
  formatBytes,
  toast,
  errorToast,
  confirmDialog,
  openModal,
  subjectOptions,
  typesetMath,
  emptyState
} from '../ui.js';
import { renderMarkdown } from '../lib/markdown.js';
import { openFolderDialog, openCardDialog, openSubjectDialog } from './dialogs.js';

function folderTree(folders) {
  const byParent = new Map();
  for (const folder of folders) {
    const key = folder.parent_id ?? 0;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(folder);
  }
  const renderNodes = (parentId, depth) => {
    const nodes = byParent.get(parentId) ?? [];
    if (!nodes.length) return '';
    return `<ul class="${depth === 0 ? 'folder-list' : 'folder-children'}">${nodes
      .map(
        (folder) => `<li>
          <div class="row" style="gap:0; flex-wrap:nowrap">
            <button class="folder-btn" data-folder-filter="${folder.id}" title="${esc(folder.path)}">
              ${icon('chevron', 'icon')}
              <span class="folder-name">${esc(folder.name)}</span>
              <span class="folder-count">${folder.note_count}</span>
            </button>
            <button class="icon-btn" style="width:24px;height:24px" data-folder-edit="${folder.id}" aria-label="Ordner ${esc(folder.name)} bearbeiten" title="Ordner bearbeiten">${icon('more')}</button>
          </div>
          ${renderNodes(folder.id, depth + 1)}
        </li>`
      )
      .join('')}</ul>`;
  };
  return renderNodes(0, 0);
}

function noteItem(note, { trash = false } = {}) {
  const badges = [];
  if (note.pinned) badges.push(`<span class="badge" title="Angeheftet">${icon('pin')} Angeheftet</span>`);
  if (note.favorite) badges.push(`<span class="badge badge-warning" title="Favorit">${icon('star')} Favorit</span>`);
  return `<div class="note-item" data-note-item="${note.id}">
    <div class="row-between" style="align-items:flex-start">
      <a href="#/notizen/${note.id}" style="min-width:0;text-decoration:none;color:inherit;flex:1">
        <div class="note-item-title">${esc(note.title)}</div>
        <div class="note-item-meta">
          ${note.subject ? `<span data-color="${esc(note.subject.color)}" style="display:inline-flex;align-items:center;gap:.3rem"><span class="subject-dot"></span>${esc(note.subject.name)}</span>` : '<span>Ohne Fach</span>'}
          ${note.folder_name ? `· ${esc(note.folder_name)}` : ''}
          ${note.topic ? `· ${esc(note.topic)}` : ''}
          · ${relativeTime(note.updated_at)}
          ${note.attachmentCount ? `· ${icon('documents')} ${note.attachmentCount}` : ''}
        </div>
        ${note.excerpt ? `<div class="note-item-excerpt">${esc(note.excerpt)}</div>` : ''}
        ${note.tags?.length ? `<div class="tags mt-1">${note.tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')}</div>` : ''}
      </a>
      <div class="note-item-actions">
        ${badges.join('')}
        ${trash
          ? `<button class="btn btn-sm" data-restore-note="${note.id}">Wiederherstellen</button>
             <button class="btn btn-sm btn-danger" data-purge-note="${note.id}">Endgültig löschen</button>`
          : `<button class="icon-btn ${note.favorite ? 'active' : ''}" data-favorite-note="${note.id}" aria-label="Favorit umschalten" title="Favorit">${icon('star')}</button>
             <button class="icon-btn ${note.pinned ? 'active' : ''}" data-pin-note="${note.id}" aria-label="Anheften umschalten" title="Anheften">${icon('pin')}</button>
             <button class="icon-btn danger" data-trash-note="${note.id}" aria-label="Notiz in den Papierkorb" title="In den Papierkorb">${icon('trash')}</button>`}
      </div>
    </div>
  </div>`;
}

async function listRender(root, ctx) {
  const [folders, tags] = await Promise.all([api.get('/folders'), api.get('/tags')]);
  state.folders = folders;
  state.tags = tags;

  const initialQuery = ctx.query.get('q') || '';
  const subjectId = ctx.query.get('subject_id') || '';
  const tag = ctx.query.get('tag') || '';
  const folderId = ctx.query.get('folder_id') || '';
  const favorite = ctx.query.get('favorite') === '1';
  const trash = ctx.query.get('trash') === '1';
  const sort = ctx.query.get('sort') || 'updated';

  const buildParams = (overrides = {}) => {
    const params = new URLSearchParams();
    const values = { q: initialQuery, subject_id: subjectId, tag, folder_id: folderId, favorite: favorite ? '1' : '', trash: trash ? '1' : '', sort: sort === 'updated' ? '' : sort, ...overrides };
    for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
    return params.toString();
  };
  const navigate = (overrides) => {
    const queryString = buildParams(overrides);
    history.replaceState(null, '', `#/notizen${queryString ? `?${queryString}` : ''}`);
  };

  const notesData = await api.get(`/notes?${buildParams({ limit: '500' })}`);
  const filterLabel = trash ? 'Papierkorb' : favorite ? 'Favoriten' : folderId ? folders.find((f) => f.id === Number(folderId))?.path || 'Ordner' : 'Alle Notizen';

  root.innerHTML = `
    <div class="page-head">
      <div class="page-heading">
        <h1>Notizen</h1>
        <p class="page-sub">Deine Wissenssammlung – Markdown, Formeln, Code und Verknüpfungen.</p>
      </div>
      <div class="page-actions">
        ${trash ? '<a class="btn" href="#/notizen">Zurück zu den Notizen</a>' : `<a class="btn btn-primary" href="#/notizen?neu=1">${icon('plus')} Neue Notiz</a>
        <button class="btn" id="new-folder">${icon('plus')} Ordner</button>`}
      </div>
    </div>

    <div class="toolbar">
      <div class="search-field">${icon('search')}
        <input class="input" id="note-search" type="search" placeholder="Titel, Inhalt, Schlagwörter, Anhänge …" value="${esc(initialQuery)}" autocomplete="off">
      </div>
      <select class="select" id="filter-subject" aria-label="Nach Fach filtern">
        <option value="">Alle Fächer</option>
        ${subjectOptions(state.subjects, subjectId, { includeEmpty: false })}
      </select>
      <select class="select" id="filter-tag" aria-label="Nach Schlagwort filtern">
        <option value="">Alle Schlagwörter</option>
        ${tags.map((item) => `<option value="${esc(item.name)}"${item.name === tag ? ' selected' : ''}>${esc(item.name)} (${item.count})</option>`).join('')}
      </select>
      <select class="select" id="filter-sort" aria-label="Sortierung">
        <option value="updated"${sort === 'updated' ? ' selected' : ''}>Zuletzt geändert</option>
        <option value="created"${sort === 'created' ? ' selected' : ''}>Erstellt</option>
        <option value="title"${sort === 'title' ? ' selected' : ''}>Titel A–Z</option>
      </select>
    </div>

    <div class="notes-layout">
      <aside class="folder-panel" aria-label="Ordner">
        <div class="folder-head"><span>Bibliothek</span><button class="icon-btn" id="folder-add-small" style="width:24px;height:24px" aria-label="Ordner hinzufügen">${icon('plus')}</button></div>
        <ul class="folder-list">
          <li><a class="folder-btn${!folderId && !favorite && !trash ? ' active' : ''}" href="#/notizen">${icon('notes')}<span class="folder-name">Alle Notizen</span></a></li>
          <li><a class="folder-btn${favorite ? ' active' : ''}" href="#/notizen?favorite=1">${icon('star')}<span class="folder-name">Favoriten</span></a></li>
        </ul>
        <div class="folder-head" style="margin-top:.5rem"><span>Ordner</span></div>
        ${folders.length ? folderTree(folders) : '<p class="small subtle" style="padding:0 .45rem">Noch keine Ordner.</p>'}
        <ul class="folder-list" style="margin-top:.6rem;border-top:1px solid var(--border);padding-top:.4rem">
          <li><a class="folder-btn${trash ? ' active' : ''}" href="#/notizen?trash=1">${icon('trash')}<span class="folder-name">Papierkorb</span></a></li>
        </ul>
      </aside>

      <section class="note-list-card" aria-label="Notizen">
        <div class="row-between mb-1">
          <div class="small subtle">${esc(filterLabel)}</div>
          <div class="small faint" id="note-count">${notesData.total} ${notesData.total === 1 ? 'Notiz' : 'Notizen'}</div>
        </div>
        <div id="note-results">${notesData.notes.length
          ? `<div class="note-items">${notesData.notes.map((note) => noteItem(note, { trash })).join('')}</div>`
          : emptyState(
              trash ? 'Papierkorb ist leer' : 'Keine Notizen gefunden',
              trash ? 'Gelöschte Notizen erscheinen hier und können wiederhergestellt werden.' : 'Lege eine Notiz an oder passe die Filter an.',
              trash ? '' : '<a class="btn btn-primary" href="#/notizen?neu=1">Notiz erstellen</a>'
            )}</div>
      </section>
    </div>`;

  state.folders = folders;
  state.tags = tags;

  const loadList = async (q = initialQuery) => {
    const params = buildParams({ q, limit: '500' });
    const data = await api.get(`/notes?${params}`);
    const countEl = $('#note-count', root);
    if (countEl) countEl.textContent = `${data.total} ${data.total === 1 ? 'Notiz' : 'Notizen'}`;
    const results = $('#note-results', root);
    results.innerHTML = data.notes.length
      ? `<div class="note-items">${data.notes.map((note) => noteItem(note, { trash })).join('')}</div>`
      : emptyState(
          trash ? 'Papierkorb ist leer' : 'Keine Notizen gefunden',
          trash ? 'Gelöschte Notizen erscheinen hier und können wiederhergestellt werden.' : 'Lege eine Notiz an oder passe die Filter an.',
          trash ? '' : '<a class="btn btn-primary" href="#/notizen?neu=1">Notiz erstellen</a>'
        );
    wireNoteList();
  };

  const searchNotes = debounce(async (value) => {
    navigate({ q: value });
    try {
      await loadList(value);
    } catch (error) {
      errorToast(error);
    }
  }, 260);

  const wireNoteList = () => {
    $$('[data-favorite-note]', root).forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.dataset.favoriteNote;
        const active = button.classList.contains('active');
        try {
          await api.patch(`/notes/${id}`, { favorite: !active });
          button.classList.toggle('active', !active);
          toast(!active ? 'Als Favorit markiert.' : 'Favorit entfernt.', 'success');
          await loadList($('#note-search', root).value);
        } catch (error) {
          errorToast(error);
        }
      });
    });
    $$('[data-pin-note]', root).forEach((button) => {
      button.addEventListener('click', async () => {
        const active = button.classList.contains('active');
        try {
          await api.patch(`/notes/${button.dataset.pinNote}`, { pinned: !active });
          await loadList($('#note-search', root).value);
        } catch (error) {
          errorToast(error);
        }
      });
    });
    $$('[data-trash-note]', root).forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.dataset.trashNote;
        const title = button.closest('[data-note-item]')?.querySelector('.note-item-title')?.textContent || 'diese Notiz';
        if (!(await confirmDialog({ title: 'Notiz in den Papierkorb?', message: `„${title}“ wird ausgeblendet, bleibt aber im Papierkorb, bis du sie endgültig löschst.`, confirmLabel: 'In den Papierkorb', danger: true }))) return;
        try {
          await api.delete(`/notes/${id}`);
          toast('Notiz in den Papierkorb verschoben.', 'success');
          await loadList($('#note-search', root).value);
        } catch (error) {
          errorToast(error);
        }
      });
    });
    $$('[data-restore-note]', root).forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          await api.post(`/notes/${button.dataset.restoreNote}/restore`, {});
          toast('Notiz wiederhergestellt.', 'success');
          await loadList($('#note-search', root).value);
        } catch (error) {
          errorToast(error);
        }
      });
    });
    $$('[data-purge-note]', root).forEach((button) => {
      button.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: 'Endgültig löschen?', message: 'Die Notiz und ihre Anhänge werden dauerhaft gelöscht. Das kann nicht rückgängig gemacht werden.', confirmLabel: 'Endgültig löschen', danger: true }))) return;
        try {
          await api.delete(`/notes/${button.dataset.purgeNote}?permanent=1`);
          toast('Notiz endgültig gelöscht.', 'success');
          await loadList($('#note-search', root).value);
        } catch (error) {
          errorToast(error);
        }
      });
    });
  };
  wireNoteList();

  $('#note-search', root).addEventListener('input', (event) => searchNotes(event.target.value));
  const rerender = async () => {
    const hashQuery = location.hash.split('?')[1] || '';
    await render(root, { ...ctx, query: new URLSearchParams(hashQuery) });
  };
  $('#filter-subject', root).addEventListener('change', async (event) => {
    navigate({ subject_id: event.target.value });
    await rerender();
  });
  $('#filter-tag', root).addEventListener('change', async (event) => {
    navigate({ tag: event.target.value });
    await rerender();
  });
  $('#filter-sort', root).addEventListener('change', async (event) => {
    navigate({ sort: event.target.value });
    await rerender();
  });

  const openFolder = (folder) => {
    openFolderDialog(folder, {
      parentId: folderId || null,
      onSaved: () => rerender()
    });
  };
  $('#new-folder', root)?.addEventListener('click', () => openFolder(null));
  $('#folder-add-small', root)?.addEventListener('click', () => openFolder(null));
  $$('[data-folder-filter]', root).forEach((button) => {
    button.addEventListener('click', async () => {
      navigate({ folder_id: button.dataset.folderFilter });
      await rerender();
    });
  });
  $$('[data-folder-edit]', root).forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      const folder = folders.find((f) => f.id === Number(button.dataset.folderEdit));
      if (folder) openFolder(folder);
    });
  });
}

/* ------------------------------------------------------------------ Editor */
function printNote(note) {
  const printRoot = document.getElementById('print-root');
  printRoot.innerHTML = `<div class="print-note-head">
      <h1>${esc(note.title)}</h1>
      <div class="print-note-meta">${esc(note.subject?.name || 'Ohne Fach')}${note.topic ? ` · ${esc(note.topic)}` : ''} · Stand ${esc(formatDate(note.updated_at, { withTime: true }))}</div>
    </div>
    <div class="print-note-content markdown">${renderMarkdown(note.content)}</div>
    ${note.attachments?.length ? `<h2>Anhänge</h2><ul>${note.attachments.map((file) => `<li>${esc(file.original_name)}</li>`).join('')}</ul>` : ''}`;
  typesetMath(printRoot);
  window.print();
  window.setTimeout(() => {
    printRoot.innerHTML = '';
  }, 500);
}

async function editorRender(root, ctx) {
  if (!state.folders) state.folders = await api.get('/folders');
  const [note, folders] = await Promise.all([api.get(`/notes/${ctx.id}`), api.get('/folders')]);
  state.folders = folders;

  if (note.deleted_at) {
    root.innerHTML = `<div class="empty">${icon('trash')}<h3>Diese Notiz liegt im Papierkorb</h3>
      <p>Du kannst sie wiederherstellen oder endgültig löschen.</p>
      <div class="row" style="justify-content:center">
        <button class="btn btn-primary" id="restore-deleted">Wiederherstellen</button>
        <button class="btn btn-danger" id="purge-deleted">Endgültig löschen</button>
        <a class="btn" href="#/notizen?trash=1">Zum Papierkorb</a>
      </div></div>`;
    $('#restore-deleted', root).addEventListener('click', async () => {
      await api.post(`/notes/${note.id}/restore`, {});
      window.location.reload();
    });
    $('#purge-deleted', root).addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Endgültig löschen?', message: 'Notiz und Anhänge werden dauerhaft gelöscht.', confirmLabel: 'Endgültig löschen', danger: true }))) return;
      await api.delete(`/notes/${note.id}?permanent=1`);
      window.location.hash = '#/notizen';
    });
    return;
  }

  const folderOptions = folders
    .map((folder) => `<option value="${folder.id}"${note.folder_id === folder.id ? ' selected' : ''}>${esc(folder.path)}</option>`)
    .join('');

  root.innerHTML = `<div class="editor-shell">
    <div class="editor-head">
      <a class="btn btn-ghost btn-sm" href="#/notizen">${icon('arrow-left')} Notizen</a>
      <span class="save-state" id="save-state" aria-live="polite">Gespeichert</span>
      <div class="spacer"></div>
      <button class="icon-btn ${note.favorite ? 'active' : ''}" id="toggle-favorite" aria-label="Favorit" aria-pressed="${note.favorite}" title="Favorit">${icon('star')}</button>
      <button class="icon-btn ${note.pinned ? 'active' : ''}" id="toggle-pin" aria-label="Anheften" aria-pressed="${note.pinned}" title="Anheften">${icon('pin')}</button>
      <div class="quick-add">
        <button class="btn btn-sm" id="note-menu-btn" aria-haspopup="menu" aria-expanded="false">${icon('more')} Mehr</button>
        <div class="menu" id="note-menu" role="menu" hidden>
          <button data-menu-action="card">${icon('cards')} Als Karteikarte</button>
          <button data-menu-action="versions">${icon('clock')} Versionen</button>
          <button data-menu-action="export">${icon('download')} Markdown exportieren</button>
          <button data-menu-action="print">${icon('download')} Als PDF drucken</button>
          <hr>
          <button data-menu-action="trash" class="danger-text">${icon('trash')} In den Papierkorb</button>
        </div>
      </div>
    </div>

    <div class="editor-title-row">
      <input class="editor-title" id="note-title" value="${esc(note.title)}" placeholder="Titel der Notiz" aria-label="Titel der Notiz">
    </div>

    <div class="editor-meta">
      <label class="sr-only" for="note-subject">Fach</label>
      <select class="select" id="note-subject"><option value="">Kein Fach</option>${subjectOptions(state.subjects, note.subject_id, { includeEmpty: false })}</select>
      <label class="sr-only" for="note-folder">Ordner</label>
      <select class="select" id="note-folder"><option value="">Kein Ordner</option>${folderOptions}</select>
      <label class="sr-only" for="note-topic">Thema</label>
      <input class="input" id="note-topic" placeholder="Thema" value="${esc(note.topic)}">
      <label class="sr-only" for="note-tags">Schlagwörter</label>
      <input class="input tags-input" id="note-tags" placeholder="Schlagwörter, kommagetrennt" value="${esc(note.tags.join(', '))}">
    </div>

    <div class="editor-toolbar" role="toolbar" aria-label="Formatierung">
      <div class="row" style="gap:.15rem;flex-wrap:wrap">
        <button class="icon-btn" data-md="bold" title="Fett (Strg+B)" aria-label="Fett"><strong>B</strong></button>
        <button class="icon-btn" data-md="italic" title="Kursiv (Strg+I)" aria-label="Kursiv"><em>I</em></button>
        <button class="icon-btn" data-md="heading" title="Überschrift" aria-label="Überschrift">H2</button>
        <span class="sep"></span>
        <button class="icon-btn" data-md="list" title="Liste" aria-label="Liste">≡</button>
        <button class="icon-btn" data-md="task" title="Aufgabenliste" aria-label="Aufgabenliste">☑</button>
        <button class="icon-btn" data-md="quote" title="Zitat" aria-label="Zitat">❝</button>
        <span class="sep"></span>
        <button class="icon-btn" data-md="inline-code" title="Code" aria-label="Code">${icon('code')}</button>
        <button class="icon-btn" data-md="code" title="Codeblock" aria-label="Codeblock">⌨</button>
        <button class="icon-btn" data-md="math" title="Formel" aria-label="Formel">∑</button>
        <span class="sep"></span>
        <button class="icon-btn" data-md="link" title="Link" aria-label="Link">${icon('link')}</button>
        <button class="icon-btn" data-md="wiki" title="Interne Verknüpfung" aria-label="Interne Verknüpfung">[[…]]</button>
        <button class="icon-btn" data-md="table" title="Tabelle" aria-label="Tabelle">▦</button>
      </div>
      <div class="spacer"></div>
      <div class="row" style="gap:.15rem">
        <button class="btn btn-sm" data-view="write" aria-pressed="false">Schreiben</button>
        <button class="btn btn-sm" data-view="split" aria-pressed="false">Geteilt</button>
        <button class="btn btn-sm" data-view="preview" aria-pressed="false">Vorschau</button>
      </div>
    </div>
    <div class="editor-split" id="editor-split">
      <div class="md-input-pane">
        <textarea class="md-textarea" id="note-content" spellcheck="true" aria-label="Notizinhalt in Markdown" placeholder="# Überschrift&#10;&#10;Schreibe hier … Markdown, $Formeln$, Tabellen und Codeblöcke werden unterstützt.">${esc(note.content)}</textarea>
      </div>
      <div class="md-preview-pane" id="note-preview" aria-label="Vorschau"></div>
    </div>
    <div class="editor-foot">
      <span id="word-count"></span>
      <span>Erstellt ${formatDate(note.created_at, { withTime: true })} · Geändert <span id="updated-at">${formatDateTimeShort(note.updated_at)}</span></span>
    </div>

    <div class="editor-side">
      <section class="card">
        <div class="card-head">
          <h2 style="font-size:.95rem">Anhänge</h2>
          <div class="card-actions">
            <label class="btn btn-sm" style="cursor:pointer">${icon('upload')} Datei anhängen
              <input type="file" id="attachment-input" multiple hidden>
            </label>
          </div>
        </div>
        <div class="attachment-list" id="attachment-list"></div>
        <p class="hint mt-1">PDFs, Bilder, Skripte und andere Dateien werden kopiert; die Originaldatei bleibt unverändert.</p>
      </section>
      <section class="card">
        <div class="card-head"><h2 style="font-size:.95rem">Verknüpfungen</h2></div>
        <div id="note-links"></div>
      </section>
    </div>
  </div>`;

  const titleInput = $('#note-title', root);
  const contentInput = $('#note-content', root);
  const preview = $('#note-preview', root);
  const split = $('#editor-split', root);
  const saveState = $('#save-state', root);
  const subjectSelect = $('#note-subject', root);
  const folderSelect = $('#note-folder', root);
  const topicInput = $('#note-topic', root);
  const tagsInput = $('#note-tags', root);
  let current = note;
  let dirty = false;
  let saving = false;
  let pendingSave = false;
  let saveTimer = null;

  const setState = (text, kind = '') => {
    saveState.textContent = text;
    saveState.style.color = kind === 'error' ? 'var(--danger)' : kind === 'saved' ? 'var(--success)' : '';
  };

  const updatePreview = () => {
    preview.innerHTML = renderMarkdown(contentInput.value);
    typesetMath(preview);
    const words = contentInput.value.trim() ? contentInput.value.trim().split(/\s+/).length : 0;
    $('#word-count', root).textContent = `${words} ${words === 1 ? 'Wort' : 'Wörter'} · ${contentInput.value.length} Zeichen`;
  };
  const previewDebounced = debounce(updatePreview, 160);

  const collect = () => ({
    title: titleInput.value,
    content: contentInput.value,
    subject_id: subjectSelect.value || null,
    folder_id: folderSelect.value || null,
    topic: topicInput.value,
    tags: tagsInput.value,
    pinned: current.pinned,
    favorite: current.favorite
  });

  const save = async (immediate = false) => {
    window.clearTimeout(saveTimer);
    if (saving) {
      pendingSave = true;
      return;
    }
    saving = true;
    setState('Speichert …');
    try {
      const updated = await api.patch(`/notes/${note.id}`, collect());
      current = { ...current, ...updated };
      dirty = false;
      setState(`Gespeichert ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`, 'saved');
      if (titleInput.value !== updated.title) titleInput.value = updated.title;
      const updatedAt = root.querySelector('#updated-at');
      if (updatedAt) updatedAt.textContent = formatDateTimeShort(updated.updated_at);
      renderAttachments(updated.attachments || []);
      renderLinks(updated);
      if (state.tags) {
        api.get('/tags').then((tags) => {
          state.tags = tags;
        }).catch(() => {});
      }
    } catch (error) {
      dirty = true;
      setState('Nicht gespeichert', 'error');
      errorToast(error);
    } finally {
      saving = false;
      if (pendingSave) {
        pendingSave = false;
        if (dirty) await save();
      } else if (immediate) {
        setState(`Gespeichert ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`, 'saved');
      }
    }
  };

  const scheduleSave = () => {
    dirty = true;
    setState('Ungespeichert');
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => save(), 700);
    previewDebounced();
  };

  const renderAttachments = (attachments) => {
    const container = $('#attachment-list', root);
    if (!container) return;
    container.innerHTML = attachments.length
      ? attachments
          .map((file) => `<div class="attachment">
            <span class="attachment-icon">${esc((file.original_name.split('.').pop() || '?').slice(0, 4).toUpperCase())}</span>
            <div class="attachment-body">
              <div class="attachment-name" title="${esc(file.original_name)}">${esc(file.original_name)}</div>
              <div class="attachment-meta">${formatBytes(file.size)} · ${esc(file.mime)}</div>
            </div>
            <div class="attachment-actions">
              <a class="icon-btn" href="/api/files/${file.id}/raw" target="_blank" rel="noopener" aria-label="Anhang öffnen" title="Öffnen">${icon('external')}</a>
              <a class="icon-btn" href="/api/files/${file.id}/raw?download=1" aria-label="Anhang herunterladen" title="Herunterladen">${icon('download')}</a>
              <button class="icon-btn danger" data-delete-attachment="${file.id}" data-name="${esc(file.original_name)}" aria-label="Anhang löschen" title="Löschen">${icon('trash')}</button>
            </div>
          </div>`)
          .join('')
      : '<p class="small subtle" style="margin:0">Noch keine Anhänge.</p>';
    $$('[data-delete-attachment]', container).forEach((button) => {
      button.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: 'Anhang löschen?', message: `„${button.dataset.name}“ wird dauerhaft aus StudyForge entfernt. Die Originaldatei auf deinem Rechner bleibt bestehen.`, confirmLabel: 'Anhang löschen', danger: true }))) return;
        try {
          await api.delete(`/files/${button.dataset.deleteAttachment}`);
          current.attachments = current.attachments.filter((f) => f.id !== Number(button.dataset.deleteAttachment));
          renderAttachments(current.attachments);
          toast('Anhang entfernt.', 'success');
        } catch (error) {
          errorToast(error);
        }
      });
    });
  };

  const renderLinks = (data) => {
    const container = $('#note-links', root);
    if (!container) return;
    const links = data.links ?? [];
    const backlinks = data.backlinks ?? [];
    container.innerHTML = `
      <div class="mb-2">
        <div class="tiny faint mb-1">Verweist auf</div>
        ${links.length ? `<div class="backlink-list">${links.map((link) => `<a href="#/notizen/${link.id}">→ ${esc(link.title)}</a>`).join('')}</div>` : '<p class="small subtle" style="margin:0">Keine internen Verweise.</p>'}
      </div>
      <div>
        <div class="tiny faint mb-1">Wird verwiesen von</div>
        ${backlinks.length ? `<div class="backlink-list">${backlinks.map((link) => `<a href="#/notizen/${link.id}">← ${esc(link.title)}</a>`).join('')}</div>` : '<p class="small subtle" style="margin:0">Noch keine Backlinks.</p>'}
      </div>`;
  };

  renderAttachments(note.attachments);
  renderLinks(note);
  updatePreview();

  titleInput.addEventListener('input', scheduleSave);
  contentInput.addEventListener('input', scheduleSave);
  topicInput.addEventListener('input', scheduleSave);
  tagsInput.addEventListener('input', scheduleSave);
  subjectSelect.addEventListener('change', () => save(true));
  folderSelect.addEventListener('change', () => save(true));

  $('#toggle-favorite', root).addEventListener('click', async (event) => {
    const active = event.currentTarget.getAttribute('aria-pressed') === 'true';
    current.favorite = !active;
    event.currentTarget.setAttribute('aria-pressed', String(!active));
    event.currentTarget.classList.toggle('active', !active);
    await save(true);
  });
  $('#toggle-pin', root).addEventListener('click', async (event) => {
    const active = event.currentTarget.getAttribute('aria-pressed') === 'true';
    current.pinned = !active;
    event.currentTarget.setAttribute('aria-pressed', String(!active));
    event.currentTarget.classList.toggle('active', !active);
    await save(true);
  });

  // Ansicht umschalten
  const setView = (mode) => {
    split.classList.remove('preview-only', 'write-only');
    if (mode === 'preview') split.classList.add('preview-only');
    if (mode === 'write') split.classList.add('write-only');
    $$('[data-view]', root).forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.view === mode)));
    if (mode !== 'write') updatePreview();
  };
  setView(state.settings.editor_split === '1' ? 'split' : 'write');
  $$('[data-view]', root).forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });

  // Formatierungshilfen
  const insert = (before, after = '', placeholder = '') => {
    const start = contentInput.selectionStart;
    const end = contentInput.selectionEnd;
    const selected = contentInput.value.slice(start, end) || placeholder;
    contentInput.setRangeText(before + selected + after, start, end, 'end');
    contentInput.focus();
    contentInput.selectionStart = start + before.length;
    contentInput.selectionEnd = start + before.length + selected.length;
    scheduleSave();
  };
  const linePrefix = (prefix) => {
    const start = contentInput.selectionStart;
    const lineStart = contentInput.value.lastIndexOf('\n', start - 1) + 1;
    contentInput.setRangeText(prefix, lineStart, lineStart, 'end');
    contentInput.focus();
    scheduleSave();
  };
  const actions = {
    bold: () => insert('**', '**', 'Text'),
    italic: () => insert('*', '*', 'Text'),
    heading: () => linePrefix('## '),
    list: () => linePrefix('- '),
    task: () => linePrefix('- [ ] '),
    quote: () => linePrefix('> '),
    'inline-code': () => insert('`', '`', 'code'),
    code: () => insert('```\n', '\n```', '// Code'),
    math: () => insert('$', '$', 'a^2 + b^2 = c^2'),
    link: () => insert('[', '](https://)', 'Linktext'),
    wiki: () => insert('[[', ']]', 'Notiztitel'),
    table: () => insert('| Spalte A | Spalte B |\n| --- | --- |\n|  |  |\n', '', '')
  };
  $$('[data-md]', root).forEach((button) => {
    button.addEventListener('click', () => actions[button.dataset.md]?.());
  });
  const keyHandler = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save(true);
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      actions.bold();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'i') {
      event.preventDefault();
      actions.italic();
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      save(true);
      toast('Notiz gespeichert.', 'success');
    }
  };
  document.addEventListener('keydown', keyHandler);

  // Anhänge hochladen
  $('#attachment-input', root).addEventListener('change', async (event) => {
    const files = [...event.target.files];
    if (!files.length) return;
    for (const file of files) {
      try {
        await api.upload(
          `/files?kind=attachment&note_id=${note.id}&filename=${encodeURIComponent(file.name)}`,
          file,
          { 'Content-Type': file.type || 'application/octet-stream' }
        );
        toast(`„${file.name}“ angehängt.`, 'success');
      } catch (error) {
        errorToast(error);
      }
    }
    event.target.value = '';
    try {
      const fresh = await api.get(`/notes/${note.id}`);
      current.attachments = fresh.attachments;
      renderAttachments(fresh.attachments);
    } catch (error) {
      errorToast(error);
    }
  });

  // Menü
  const menuBtn = $('#note-menu-btn', root);
  const menu = $('#note-menu', root);
  menuBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    menu.hidden = !menu.hidden;
    menuBtn.setAttribute('aria-expanded', String(!menu.hidden));
  });
  const outsideMenu = (event) => {
    if (!menu.hidden && !event.target.closest('#note-menu') && !event.target.closest('#note-menu-btn')) {
      menu.hidden = true;
      menuBtn.setAttribute('aria-expanded', 'false');
    }
  };
  document.addEventListener('click', outsideMenu);
  $$('[data-menu-action]', menu).forEach((button) => {
    button.addEventListener('click', async () => {
      menu.hidden = true;
      const action = button.dataset.menuAction;
      if (action === 'export') downloadFromApi(`/export/note/${note.id}`);
      else if (action === 'print') {
        if (dirty) await save(true);
        printNote({ ...current, content: contentInput.value, title: titleInput.value });
      } else if (action === 'card') {
        openCardDialog(null, {
          sourceNoteId: note.id,
          deckId: null,
          onSaved: () => {}
        });
      } else if (action === 'versions') {
        openVersions(note.id);
      } else if (action === 'trash') {
        if (!(await confirmDialog({ title: 'Notiz in den Papierkorb?', message: 'Die Notiz bleibt im Papierkorb, bis du sie endgültig löschst.', confirmLabel: 'In den Papierkorb', danger: true }))) return;
        if (dirty) await save(true);
        await api.delete(`/notes/${note.id}`);
        toast('Notiz in den Papierkorb verschoben.', 'success');
        window.location.hash = '#/notizen';
      }
    });
  });

  const beforeUnload = (event) => {
    if (dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', beforeUnload);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && dirty) save();
  });

  return () => {
    window.removeEventListener('beforeunload', beforeUnload);
    document.removeEventListener('keydown', keyHandler);
    document.removeEventListener('click', outsideMenu);
    window.clearTimeout(saveTimer);
    if (dirty) save();
  };
}

async function openVersions(noteId) {
  let versions = [];
  try {
    versions = await api.get(`/notes/${noteId}/versions`);
  } catch (error) {
    errorToast(error);
    return;
  }
  const { body } = openModal({
    title: 'Versionen',
    subtitle: 'StudyForge sichert beim Bearbeiten regelmäßig Zwischenstände (max. 30).',
    wide: true,
    body: versions.length
      ? `<div class="grid" style="grid-template-columns:minmax(180px, 260px) minmax(0,1fr); gap:1rem">
          <div class="stack" style="max-height:50vh;overflow:auto">${versions
            .map((version) => `<button class="btn" style="justify-content:flex-start;text-align:left" data-version="${version.id}">
              <span><strong>${esc(version.title || 'Ohne Titel')}</strong><br><span class="tiny subtle">${formatDate(version.created_at, { withTime: true })} · ${formatBytes(version.size)}</span></span>
            </button>`)
            .join('')}</div>
          <div id="version-preview" class="markdown" style="max-height:50vh;overflow:auto;border-left:1px solid var(--border);padding-left:1rem">Version auswählen.</div>
        </div>`
      : '<p class="subtle">Noch keine Zwischenstände gesichert. Beim nächsten Bearbeiten entsteht automatisch eine Version.</p>',
    actions: [{ label: 'Schließen' }]
  });
  body.querySelectorAll('[data-version]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        const version = await api.get(`/notes/${noteId}/versions/${button.dataset.version}`);
        const preview = body.querySelector('#version-preview');
        preview.innerHTML = renderMarkdown(version.content);
        typesetMath(preview);
        const restore = document.createElement('button');
        restore.className = 'btn btn-primary btn-sm mt-2';
        restore.textContent = 'Diese Version wiederherstellen';
        restore.addEventListener('click', async () => {
          if (!(await confirmDialog({ title: 'Version wiederherstellen?', message: 'Der aktuelle Stand wird vorher als Version gesichert.', confirmLabel: 'Wiederherstellen' }))) return;
          try {
            await api.post(`/notes/${noteId}/versions/${button.dataset.version}/restore`, {});
            toast('Version wiederhergestellt.', 'success');
            window.location.reload();
          } catch (error) {
            errorToast(error);
          }
        });
        preview.appendChild(restore);
      } catch (error) {
        errorToast(error);
      }
    });
  });
}

export async function render(root, ctx) {
  if (ctx.id) return editorRender(root, ctx);
  if (ctx.query.get('neu') === '1') {
    const subjectId = state.settings.last_subject_id ? Number(state.settings.last_subject_id) : null;
    const created = await api.post('/notes', {
      title: 'Unbenannte Notiz',
      content: '',
      subject_id: subjectId
    });
    window.location.replace(`#/notizen/${created.id}`);
    return;
  }
  await listRender(root, ctx);
  // Hinweis für leere Sammlung mit Aktion zum Fach anlegen.
  if (!state.subjects.length) {
    const sub = root.querySelector('#note-results');
    if (sub && sub.querySelector('.empty')) {
      const button = document.createElement('button');
      button.className = 'btn';
      button.textContent = 'Zuerst ein Fach anlegen';
      button.addEventListener('click', () => openSubjectDialog(null, () => window.location.reload()));
      sub.querySelector('.empty').appendChild(button);
    }
  }
}
