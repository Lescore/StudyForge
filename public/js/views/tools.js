import { api } from '../api.js';
import { state } from '../store.js';
import {
  esc,
  icon,
  toast,
  errorToast,
  confirmDialog,
  openModal,
  mathPreview,
  subjectOptions,
  formatDate,
  emptyState
} from '../ui.js';
import { highlightCode } from '../lib/highlight.js';
import { saveSettings } from '../store.js';
import { CATEGORIES, TOOLS, MODULE_LOADERS, toolById, categoryById, toolsInCategory, searchTools } from '../tools/registry.js';
import { wireCopy } from '../tools/kit.js';

/** Frühere Tabs (#/werkzeuge?tab=…) führen weiter zu den entsprechenden Werkzeugen. */
const LEGACY_TABS = { netzwerk: 'ipv4-subnetting', programmierung: 'codebeispiele', mathematik: 'formelsammlung' };

/** Werkzeuge, deren Oberfläche hier in der Ansicht liegt (bestehende Funktionen aus 1.0/1.1). */
const LEGACY_PANELS = {
  'ipv4-subnetting': (root, reload) => networkPanel(root, reload),
  codebeispiele: (root, reload) => programmingPanel(root, reload),
  formelsammlung: (root, reload) => mathPanel(root, reload)
};

function subnetResultHtml(result) {
  return `<div class="mt-2">
    <div class="row mb-1"><span class="badge ${result.allCorrect ? 'badge-success' : 'badge-warning'}">${result.allCorrect ? 'Alles richtig' : 'Noch nicht vollständig richtig'}</span>
      <span class="small subtle">Netz ${esc(result.solution.network)} · Broadcast ${esc(result.solution.broadcast)} · Maske ${esc(result.solution.mask)}</span></div>
    <div class="table-wrap"><table class="data result-table">
      <thead><tr><th>Feld</th><th>Deine Antwort</th><th>Richtig</th><th></th></tr></thead>
      <tbody>
        ${result.results.map((row) => `<tr>
          <td>${esc(row.label)}</td>
          <td>${esc(row.given || '–')}</td>
          <td>${esc(row.expected ?? '–')}</td>
          <td class="${row.correct ? 'correct' : 'wrong'}">${row.correct ? '✓' : '✗'}</td>
        </tr>`).join('')}
        <tr><td>Nutzbare Hosts</td><td>${esc(result.hosts.given ?? '–')}</td><td>${result.hosts.expected}</td><td class="${result.hosts.correct ? 'correct' : 'wrong'}">${result.hosts.correct ? '✓' : '✗'}</td></tr>
      </tbody>
    </table></div>
    <div class="solution-box mt-2"><dl>
      <dt>CIDR</dt><dd>${esc(result.solution.cidr)}</dd>
      <dt>Wildcard</dt><dd>${esc(result.solution.wildcard)}</dd>
      <dt>Hostbits</dt><dd>${result.solution.host_bits}</dd>
      <dt>Nutzbare Hosts</dt><dd>${result.solution.usable_hosts}</dd>
    </dl><p class="hint mt-1" style="margin-bottom:0">${esc(result.solution.notes)}</p></div>
  </div>`;
}

function exerciseHtml(exercise) {
  return `<details class="card" style="padding:.8rem">
    <summary style="cursor:pointer" class="row-between">
      <span><strong>${esc(exercise.title)}</strong> <span class="mono small subtle">${esc(exercise.ip)}/${exercise.prefix}</span></span>
      <span class="row" style="gap:.2rem">
        <span class="badge">${esc(exercise.subject_name || 'Ohne Fach')}</span>
        <button class="icon-btn danger" style="width:26px;height:26px" data-delete-subnet="${exercise.id}" aria-label="Aufgabe löschen">${icon('trash')}</button>
      </span>
    </summary>
    <div class="solution-box mt-2"><dl>
      <dt>Netzwerk</dt><dd>${esc(exercise.answer_network)}</dd>
      <dt>Broadcast</dt><dd>${esc(exercise.answer_broadcast)}</dd>
      <dt>Erster Host</dt><dd>${esc(exercise.answer_first || '–')}</dd>
      <dt>Letzter Host</dt><dd>${esc(exercise.answer_last || '–')}</dd>
      <dt>Nutzbare Hosts</dt><dd>${exercise.answer_hosts}</dd>
    </dl></div>
    ${exercise.working ? `<div class="mt-2"><div class="tiny faint">Eigener Lösungsweg</div><div class="small" style="white-space:pre-wrap">${esc(exercise.working)}</div></div>` : ''}
  </details>`;
}

async function networkPanel(root, reload) {
  const [exercises] = await Promise.all([api.get('/subnets')]);
  root.innerHTML = `
    <div class="grid grid-2">
      <section class="card">
        <div class="card-head"><h2>IPv4-Subnetting üben</h2></div>
        <form id="subnet-form">
          <div class="form-row">
            <div class="field"><label for="subnet-ip">IPv4-Adresse</label>
              <input class="input mono" id="subnet-ip" value="192.168.10.130" placeholder="192.168.10.130"></div>
            <div class="field"><label for="subnet-prefix">Präfix</label>
              <input class="input" id="subnet-prefix" type="number" min="0" max="32" value="26"></div>
          </div>
          <p class="hint">Berechne Netzwerk, Broadcast, nutzbaren Hostbereich und Hostanzahl – oder prüfe deine eigenen Ergebnisse.</p>
          <div class="form-row">
            <div class="field"><label for="answer-network">Netzwerkadresse</label><input class="input mono" id="answer-network" placeholder="192.168.10.128"></div>
            <div class="field"><label for="answer-broadcast">Broadcastadresse</label><input class="input mono" id="answer-broadcast" placeholder="192.168.10.191"></div>
            <div class="field"><label for="answer-first">Erster Host</label><input class="input mono" id="answer-first"></div>
            <div class="field"><label for="answer-last">Letzter Host</label><input class="input mono" id="answer-last"></div>
            <div class="field"><label for="answer-hosts">Nutzbare Hosts</label><input class="input" id="answer-hosts" type="number" min="0"></div>
          </div>
          <div class="row">
            <button class="btn btn-primary" type="submit">${icon('check')} Prüfen</button>
            <button class="btn" type="button" id="subnet-solution">Lösungsweg anzeigen</button>
            <button class="btn" type="button" id="subnet-save">${icon('plus')} Als Aufgabe speichern</button>
          </div>
        </form>
        <div id="subnet-feedback"></div>
      </section>

      <section class="card">
        <div class="card-head"><h2>Merksätze</h2></div>
        <div class="small" style="line-height:1.7">
          <p><strong>Schritt 1:</strong> Maske aus dem Präfix ableiten (z. B. /26 → 255.255.255.192).</p>
          <p><strong>Schritt 2:</strong> Netzwerkadresse = IP bitweise UND Maske.</p>
          <p><strong>Schritt 3:</strong> Broadcast = Netzwerk + (Anzahl Adressen − 1).</p>
          <p><strong>Schritt 4:</strong> Nutzbare Hosts = 2<sup>Hostbits</sup> − 2 (Ausnahme /31 und /32).</p>
          <p class="subtle">Eigene Lösungswege kannst du beim Speichern der Aufgabe festhalten. Karten zu OSI, TCP/IP, DNS, DHCP und Routing legst du im Kartenbereich an.</p>
        </div>
        <div class="row mt-2">
          <a class="btn btn-sm" href="#/karten?neu=1">${icon('cards')} Netzwerk-Karte anlegen</a>
          <a class="btn btn-sm" href="#/notizen?neu=1">${icon('notes')} Netzwerkdokumentation</a>
        </div>
      </section>
    </div>

    <section class="mt-3">
      <div class="row-between mb-2"><h2 style="margin:0;font-size:1rem">Gespeicherte Aufgaben</h2><span class="small faint">${exercises.length}</span></div>
      <div class="stack" id="subnet-list">
        ${exercises.length ? exercises.map(exerciseHtml).join('') : '<p class="small subtle">Noch keine gespeicherten Subnetting-Aufgaben.</p>'}
      </div>
    </section>`;

  const ipInput = root.querySelector('#subnet-ip');
  const prefixInput = root.querySelector('#subnet-prefix');
  const feedback = root.querySelector('#subnet-feedback');
  let lastSolution = null;

  const check = async (event) => {
    event.preventDefault();
    const values = {
      ip: ipInput.value.trim(),
      prefix: Number(prefixInput.value),
      network: root.querySelector('#answer-network').value.trim(),
      broadcast: root.querySelector('#answer-broadcast').value.trim(),
      first: root.querySelector('#answer-first').value.trim(),
      last: root.querySelector('#answer-last').value.trim(),
      usable_hosts: root.querySelector('#answer-hosts').value.trim()
    };
    try {
      const result = await api.post('/tools/subnet/check', values);
      lastSolution = result.solution;
      feedback.innerHTML = subnetResultHtml(result);
    } catch (error) {
      errorToast(error);
    }
  };
  root.querySelector('#subnet-form').addEventListener('submit', check);

  root.querySelector('#subnet-solution').addEventListener('click', async () => {
    try {
      const solution = await api.get(`/tools/subnet/calculate?ip=${encodeURIComponent(ipInput.value)}&prefix=${encodeURIComponent(prefixInput.value)}`);
      lastSolution = solution;
      root.querySelector('#answer-network').value = solution.network;
      root.querySelector('#answer-broadcast').value = solution.broadcast;
      root.querySelector('#answer-first').value = solution.first ?? '';
      root.querySelector('#answer-last').value = solution.last ?? '';
      root.querySelector('#answer-hosts').value = String(solution.usable_hosts);
      feedback.innerHTML = `<div class="solution-box mt-2"><dl>
        <dt>Netzwerk</dt><dd>${esc(solution.network)}</dd>
        <dt>Broadcast</dt><dd>${esc(solution.broadcast)}</dd>
        <dt>Erster Host</dt><dd>${esc(solution.first ?? '–')}</dd>
        <dt>Letzter Host</dt><dd>${esc(solution.last ?? '–')}</dd>
        <dt>Maske</dt><dd>${esc(solution.mask)}</dd>
        <dt>Nutzbare Hosts</dt><dd>${solution.usable_hosts}</dd>
      </dl><p class="hint mt-1" style="margin-bottom:0">${esc(solution.notes)}</p></div>`;
    } catch (error) {
      errorToast(error);
    }
  });

  root.querySelector('#subnet-save').addEventListener('click', () => {
    openModal({
      title: 'Subnetting-Aufgabe speichern',
      body: `<div class="form-error" data-error hidden></div>
        <div class="field"><label for="save-subnet-title">Titel</label>
          <input class="input" id="save-subnet-title" value="${esc(ipInput.value)}/${esc(prefixInput.value)}"></div>
        <div class="field"><label for="save-subnet-subject">Fach</label>
          <select class="select" id="save-subnet-subject"><option value="">Kein Fach</option>${subjectOptions(state.subjects, state.settings.last_subject_id, { includeEmpty: false })}</select></div>
        <div class="field"><label for="save-subnet-working">Eigener Lösungsweg (optional)</label>
          <textarea class="textarea" id="save-subnet-working" rows="4" placeholder="Wie hast du gerechnet?"></textarea></div>
        <p class="hint">Die berechnete Lösung wird mitgespeichert. Die Aufgabe erscheint danach in der Liste.</p>`,
      actions: [
        { label: 'Abbrechen' },
        {
          label: 'Speichern',
          variant: 'primary',
          onClick: async (_close, dialog) => {
            try {
              await api.post('/subnets', {
                title: dialog.querySelector('#save-subnet-title').value,
                ip: ipInput.value.trim(),
                prefix: Number(prefixInput.value),
                subject_id: dialog.querySelector('#save-subnet-subject').value || null,
                working: dialog.querySelector('#save-subnet-working').value
              });
              toast('Subnetting-Aufgabe gespeichert.', 'success');
              await reload();
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
  });

  root.querySelectorAll('[data-delete-subnet]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      if (!(await confirmDialog({ title: 'Aufgabe löschen?', message: 'Die gespeicherte Subnetting-Aufgabe wird entfernt.', confirmLabel: 'Löschen', danger: true }))) return;
      try {
        await api.delete(`/subnets/${button.dataset.deleteSubnet}`);
        await reload();
      } catch (error) {
        errorToast(error);
      }
    });
  });
  void formatDate;
}

function snippetHtml(snippet) {
  return `<article class="card">
    <div class="row-between">
      <div>
        <h3 style="margin:0;font-size:1rem">${esc(snippet.title)}</h3>
        <div class="list-meta">${esc(snippet.language)}${snippet.subject_name ? ` · ${esc(snippet.subject_name)}` : ''}${snippet.topic ? ` · ${esc(snippet.topic)}` : ''}</div>
      </div>
      <div class="row" style="gap:.2rem">
        <button class="icon-btn" data-edit-snippet="${snippet.id}" aria-label="Codebeispiel bearbeiten">${icon('edit')}</button>
        <button class="icon-btn danger" data-delete-snippet="${snippet.id}" aria-label="Codebeispiel löschen">${icon('trash')}</button>
      </div>
    </div>
    <pre class="code-block-preview" style="margin:.6rem 0"><code>${highlightCode(snippet.code, snippet.language)}</code></pre>
    ${snippet.explanation ? `<div class="small" style="white-space:pre-wrap">${esc(snippet.explanation)}</div>` : ''}
    <p class="hint" style="margin-bottom:0">Nur Anzeige – Code wird nie ausgeführt.</p>
  </article>`;
}

function openSnippetDialog(snippet, onDone) {
  openModal({
    title: snippet ? 'Codebeispiel bearbeiten' : 'Codebeispiel hinzufügen',
    wide: true,
    body: `<div class="form-error" data-error hidden></div>
      <div class="field"><label for="snippet-title">Titel</label><input class="input" id="snippet-title" value="${esc(snippet?.title ?? '')}" placeholder="z. B. Binäre Suche in Java"></div>
      <div class="form-row">
        <div class="field"><label for="snippet-language">Sprache</label>
          <select class="select" id="snippet-language">${['java', 'python', 'javascript', 'typescript', 'c', 'cpp', 'csharp', 'sql', 'bash', 'html', 'css', 'json', 'text'].map((lang) => `<option value="${lang}"${snippet?.language === lang ? ' selected' : ''}>${lang}</option>`).join('')}</select></div>
        <div class="field"><label for="snippet-subject">Fach</label>
          <select class="select" id="snippet-subject"><option value="">Kein Fach</option>${subjectOptions(state.subjects, snippet?.subject_id, { includeEmpty: false })}</select></div>
        <div class="field"><label for="snippet-topic">Thema</label><input class="input" id="snippet-topic" value="${esc(snippet?.topic ?? '')}"></div>
      </div>
      <div class="field"><label for="snippet-code">Code</label><textarea class="textarea mono" id="snippet-code" rows="10" spellcheck="false">${esc(snippet?.code ?? '')}</textarea></div>
      <div class="field"><label for="snippet-explanation">Erklärung / Kommentar</label><textarea class="textarea" id="snippet-explanation" rows="4">${esc(snippet?.explanation ?? '')}</textarea></div>`,
    actions: [
      { label: 'Abbrechen' },
      {
        label: 'Speichern',
        variant: 'primary',
        onClick: async (_close, dialog) => {
          try {
            const payload = {
              title: dialog.querySelector('#snippet-title').value,
              language: dialog.querySelector('#snippet-language').value,
              subject_id: dialog.querySelector('#snippet-subject').value || null,
              topic: dialog.querySelector('#snippet-topic').value,
              code: dialog.querySelector('#snippet-code').value,
              explanation: dialog.querySelector('#snippet-explanation').value
            };
            if (snippet) await api.patch(`/snippets/${snippet.id}`, payload);
            else await api.post('/snippets', payload);
            toast('Codebeispiel gespeichert.', 'success');
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

async function programmingPanel(root, reload) {
  const snippets = await api.get('/snippets');
  root.innerHTML = `
    <div class="row mb-2"><button class="btn btn-primary" id="new-snippet">${icon('plus')} Codebeispiel</button></div>
    <div class="grid grid-2">
      ${snippets.length ? snippets.map(snippetHtml).join('') : emptyState('Noch keine Codebeispiele', 'Speichere kleine, verstandene Beispiele – nicht nur kopierten Code. Beschreibe, was jede Stelle tut.', '<button class="btn btn-primary" data-new-snippet>Erstes Beispiel anlegen</button>')}
    </div>`;
  root.querySelector('#new-snippet').addEventListener('click', () => openSnippetDialog(null, reload));
  root.querySelector('[data-new-snippet]')?.addEventListener('click', () => openSnippetDialog(null, reload));
  root.querySelectorAll('[data-edit-snippet]').forEach((button) => {
    button.addEventListener('click', () => {
      const snippet = snippets.find((item) => item.id === Number(button.dataset.editSnippet));
      if (snippet) openSnippetDialog(snippet, reload);
    });
  });
  root.querySelectorAll('[data-delete-snippet]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Codebeispiel löschen?', message: 'Das Beispiel wird dauerhaft entfernt.', confirmLabel: 'Löschen', danger: true }))) return;
      try {
        await api.delete(`/snippets/${button.dataset.deleteSnippet}`);
        await reload();
      } catch (error) {
        errorToast(error);
      }
    });
  });
}

function openFormulaDialog(formula, onDone) {
  const { body } = openModal({
    title: formula ? 'Formel bearbeiten' : 'Formel hinzufügen',
    body: `<div class="form-error" data-error hidden></div>
      <div class="field"><label for="formula-name">Name</label><input class="input" id="formula-name" value="${esc(formula?.name ?? '')}" placeholder="z. B. Satz des Pythagoras"></div>
      <div class="field"><label for="formula-latex">LaTeX</label><textarea class="textarea mono" id="formula-latex" rows="3" spellcheck="false">${esc(formula?.latex ?? '')}</textarea>
        <span class="hint">Beispiel: <code>a^2 + b^2 = c^2</code> oder <code>\\frac{U}{R}</code></span></div>
      <div class="field"><span class="field-label">Vorschau</span><div class="formula-render" id="formula-preview"></div></div>
      <div class="form-row">
        <div class="field"><label for="formula-subject">Fach</label><select class="select" id="formula-subject"><option value="">Kein Fach</option>${subjectOptions(state.subjects, formula?.subject_id, { includeEmpty: false })}</select></div>
        <div class="field"><label for="formula-topic">Thema</label><input class="input" id="formula-topic" value="${esc(formula?.topic ?? '')}"></div>
      </div>
      <div class="field"><label for="formula-description">Erklärung / Herleitung</label><textarea class="textarea" id="formula-description" rows="3">${esc(formula?.description ?? '')}</textarea></div>`,
    actions: [
      { label: 'Abbrechen' },
      {
        label: 'Speichern',
        variant: 'primary',
        onClick: async (_close, dialog) => {
          try {
            const payload = {
              name: dialog.querySelector('#formula-name').value,
              latex: dialog.querySelector('#formula-latex').value,
              description: dialog.querySelector('#formula-description').value,
              subject_id: dialog.querySelector('#formula-subject').value || null,
              topic: dialog.querySelector('#formula-topic').value
            };
            if (formula) await api.patch(`/formulas/${formula.id}`, payload);
            else await api.post('/formulas', payload);
            toast('Formel gespeichert.', 'success');
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
  const latex = body.querySelector('#formula-latex');
  const preview = body.querySelector('#formula-preview');
  const update = () => {
    preview.innerHTML = mathPreview(latex.value || '\\text{Keine Formel}', true);
  };
  latex.addEventListener('input', update);
  update();
}

async function mathPanel(root, reload) {
  const formulas = await api.get('/formulas');
  root.innerHTML = `
    <div class="row mb-2"><button class="btn btn-primary" id="new-formula">${icon('plus')} Formel</button></div>
    <div class="formula-grid">
      ${formulas.length
        ? formulas
            .map(
              (formula) => `<article class="formula-card">
                <div class="row-between"><strong>${esc(formula.name)}</strong>
                  <div class="row" style="gap:.15rem">
                    <button class="icon-btn" data-edit-formula="${formula.id}" aria-label="Formel bearbeiten">${icon('edit')}</button>
                    <button class="icon-btn danger" data-delete-formula="${formula.id}" aria-label="Formel löschen">${icon('trash')}</button>
                  </div></div>
                <div class="formula-render">${mathPreview(formula.latex, true)}</div>
                <div class="tiny faint">${esc(formula.subject_name || 'Ohne Fach')}${formula.topic ? ` · ${esc(formula.topic)}` : ''}</div>
                ${formula.description ? `<div class="small subtle">${esc(formula.description)}</div>` : ''}
              </article>`
            )
            .join('')
        : emptyState('Noch keine Formeln', 'Notiere Formeln mit LaTeX und beschreibe, wann du sie verwendest. So entsteht eine persönliche Formelsammlung.', '<button class="btn btn-primary" data-new-formula>Erste Formel anlegen</button>')}
    </div>`;
  root.querySelector('#new-formula').addEventListener('click', () => openFormulaDialog(null, reload));
  root.querySelector('[data-new-formula]')?.addEventListener('click', () => openFormulaDialog(null, reload));
  root.querySelectorAll('[data-edit-formula]').forEach((button) => {
    button.addEventListener('click', () => {
      const formula = formulas.find((item) => item.id === Number(button.dataset.editFormula));
      if (formula) openFormulaDialog(formula, reload);
    });
  });
  root.querySelectorAll('[data-delete-formula]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Formel löschen?', message: 'Die Formel wird dauerhaft entfernt.', confirmLabel: 'Löschen', danger: true }))) return;
      try {
        await api.delete(`/formulas/${button.dataset.deleteFormula}`);
        await reload();
      } catch (error) {
        errorToast(error);
      }
    });
  });
}

function favorites() {
  try {
    const list = JSON.parse(state.settings.tools_favorites || '[]');
    return Array.isArray(list) ? list.filter((id) => toolById(id)) : [];
  } catch {
    return [];
  }
}

async function toggleFavorite(id) {
  const list = favorites();
  const next = list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  await saveSettings({ tools_favorites: JSON.stringify(next) });
  return next.includes(id);
}

function toolCard(tool, favs, { showCategory = false } = {}) {
  const fav = favs.includes(tool.id);
  return `<div class="tool-card-wrap" style="position:relative">
    <a class="tool-card" href="#/werkzeuge/${tool.id}">
      <span class="tool-card-title">${esc(tool.title)}</span>
      <span class="tool-card-desc">${esc(tool.desc)}</span>
      ${showCategory ? `<span class="tool-card-cat">${esc(categoryById(tool.cat)?.title ?? '')}</span>` : ''}
    </a>
    <button type="button" class="icon-btn tool-fav${fav ? ' active' : ''}" data-fav="${tool.id}" aria-pressed="${fav}" aria-label="${fav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}: ${esc(tool.title)}" title="${fav ? 'Favorit entfernen' : 'Als Favorit merken'}">${icon('star')}</button>
  </div>`;
}

function wireFavorites(root, rerender) {
  root.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-fav]');
    if (!button) return;
    event.preventDefault();
    try {
      const active = await toggleFavorite(button.dataset.fav);
      toast(active ? 'Als Favorit gemerkt.' : 'Favorit entfernt.', 'success', 1600);
      rerender();
    } catch (error) {
      errorToast(error);
    }
  });
}

function overview(root, ctx) {
  const categoryId = categoryById(ctx.query.get('kategorie')) ? ctx.query.get('kategorie') : null;
  const category = categoryId ? categoryById(categoryId) : null;
  const initialQuery = ctx.query.get('q') ?? '';

  root.innerHTML = `
    <div class="page-head">
      <div class="page-heading">
        ${category ? `<div class="breadcrumb"><a href="#/werkzeuge">Werkzeuge</a><span>/</span><span>${esc(category.title)}</span></div>` : ''}
        <h1>${category ? esc(category.title) : 'Informatik-Werkzeuge'}</h1>
        <p class="page-sub">${category ? esc(category.desc) : `${TOOLS.length} Rechner, Simulationen und Nachschlagewerke – vollständig lokal, mit nachvollziehbarem Rechenweg.`}</p>
      </div>
    </div>
    <div class="tools-toolbar">
      <div class="tools-search">${icon('search')}<input class="input" type="search" id="tools-search" placeholder="Werkzeug suchen, z. B. „MiB“, „chmod“, „IPv6“" aria-label="Werkzeuge durchsuchen" value="${esc(initialQuery)}" autocomplete="off"></div>
    </div>
    <nav class="tools-cats" aria-label="Kategorien">
      <a class="chip${category ? '' : ' active'}" href="#/werkzeuge">Alle Kategorien</a>
      ${CATEGORIES.map((c) => `<a class="chip${c.id === categoryId ? ' active' : ''}" href="#/werkzeuge?kategorie=${c.id}">${esc(c.title)} <span class="count">${toolsInCategory(c.id).length}</span></a>`).join('')}
    </nav>
    <div id="tools-content"></div>`;

  const content = root.querySelector('#tools-content');
  const input = root.querySelector('#tools-search');

  const draw = () => {
    const favs = favorites();
    const query = input.value.trim();
    if (query) {
      const found = searchTools(query).filter((tool) => !categoryId || tool.cat === categoryId || tool.also.includes(categoryId));
      content.innerHTML = found.length
        ? `<p class="small subtle">${found.length} ${found.length === 1 ? 'Treffer' : 'Treffer'} für „${esc(query)}“${category ? ` in ${esc(category.title)}` : ''}</p>
           <div class="tool-grid">${found.map((tool) => toolCard(tool, favs, { showCategory: true })).join('')}</div>`
        : emptyState('Kein Werkzeug gefunden', `Zu „${query}“ passt kein Werkzeug${category ? ' in dieser Kategorie' : ''}. Versuche einen anderen Begriff.`);
      return;
    }
    if (category) {
      content.innerHTML = `<div class="tool-grid">${toolsInCategory(category.id).map((tool) => toolCard(tool, favs, { showCategory: tool.cat !== category.id })).join('')}</div>`;
      return;
    }
    const favTools = favs.map(toolById).filter(Boolean);
    content.innerHTML = `
      ${favTools.length ? `<h2 class="tools-section-title">Favoriten</h2><div class="tool-grid">${favTools.map((tool) => toolCard(tool, favs, { showCategory: true })).join('')}</div>` : ''}
      <h2 class="tools-section-title">Kategorien</h2>
      <div class="tool-cat-grid">
        ${CATEGORIES.map((c) => `<a class="card tool-cat-card" href="#/werkzeuge?kategorie=${c.id}">
          <h2>${icon(c.icon)} ${esc(c.title)}</h2>
          <p class="small subtle">${esc(c.desc)}</p>
          <span class="tiny faint">${toolsInCategory(c.id).length} Werkzeuge</span>
        </a>`).join('')}
      </div>
      <section class="card mt-3">
        <h2 style="font-size:1rem">Was diese Werkzeuge sind – und was nicht</h2>
        <p class="small subtle" style="margin:0">Alle Berechnungen laufen lokal im Browser bzw. auf deinem Rechner und zeigen ihren Rechenweg. Simulationen (TCP, DNS, Routing, Git, Topologie, Speicher) verändern nichts an deinem System und senden keine Pakete. StudyForge ersetzt keinen Compiler, Netzwerk-Simulator oder Computeralgebra-System.</p>
        <div class="quick-actions mt-2">
          <a class="quick-action" href="#/karten?neu=1">${icon('cards')} Definitionskarte</a>
          <a class="quick-action" href="#/notizen?neu=1">${icon('notes')} Konzeptnotiz</a>
          <a class="quick-action" href="#/vorlagen">${icon('templates')} Vorlage „Definition“</a>
        </div>
      </section>`;
  };

  let timer = null;
  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(draw, 120);
  });
  wireFavorites(content, draw);
  draw();
  if (initialQuery) input.focus();
  return () => window.clearTimeout(timer);
}

async function toolPage(root, ctx, tool) {
  const category = categoryById(tool.cat);
  const fav = favorites().includes(tool.id);
  root.innerHTML = `
    <div class="page-head tool-page-head">
      <div class="page-heading">
        <div class="breadcrumb"><a href="#/werkzeuge">Werkzeuge</a><span>/</span><a href="#/werkzeuge?kategorie=${category.id}">${esc(category.title)}</a><span>/</span><span>${esc(tool.title)}</span></div>
        <h1>${esc(tool.title)}</h1>
        <p class="page-sub">${esc(tool.desc)}</p>
      </div>
      <div class="tool-head-actions">
        <button type="button" class="btn btn-sm tool-fav-btn" data-fav="${tool.id}" aria-pressed="${fav}">${icon('star')} ${fav ? 'Favorit' : 'Merken'}</button>
        <a class="btn btn-sm" href="#/werkzeuge?kategorie=${category.id}">${icon('arrow-left')} ${esc(category.title)}</a>
      </div>
    </div>
    <div class="tool-body" id="tool-body"></div>`;

  root.querySelector('[data-fav]').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    try {
      const active = await toggleFavorite(tool.id);
      button.setAttribute('aria-pressed', String(active));
      button.innerHTML = `${icon('star')} ${active ? 'Favorit' : 'Merken'}`;
      toast(active ? 'Als Favorit gemerkt.' : 'Favorit entfernt.', 'success', 1600);
    } catch (error) {
      errorToast(error);
    }
  });

  const body = root.querySelector('#tool-body');
  wireCopy(body);
  if (tool.module === 'legacy') {
    const reload = () => LEGACY_PANELS[tool.id](body, reload);
    await reload();
    return undefined;
  }
  const module = await MODULE_LOADERS[tool.module]();
  return module.render(tool.id, body, { query: ctx.query, tool });
}

export async function render(root, ctx) {
  const legacy = LEGACY_TABS[ctx.query.get('tab')];
  if (legacy && !ctx.tool) {
    window.location.replace(`#/werkzeuge/${legacy}`);
    return undefined;
  }
  if (ctx.tool) {
    const tool = toolById(ctx.tool);
    if (!tool) {
      root.innerHTML = emptyState('Werkzeug nicht gefunden', `Ein Werkzeug „${ctx.tool}“ gibt es nicht.`, '<a class="btn btn-primary" href="#/werkzeuge">Zur Übersicht</a>');
      return undefined;
    }
    return toolPage(root, ctx, tool);
  }
  return overview(root, ctx);
}
