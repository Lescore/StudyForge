import { api } from './api.js';
import { loadCore, state, toggleTheme, refreshMeta } from './store.js';
import { esc, icon, openModal, toast, typesetMath, debounce, errorToast } from './ui.js';
import * as notesView from './views/notes.js';
import * as dashboardView from './views/dashboard.js';
import * as subjectsView from './views/subjects.js';
import * as cardsView from './views/cards.js';
import * as studyView from './views/study.js';
import * as documentsView from './views/documents.js';
import * as tasksView from './views/tasks.js';
import * as examsView from './views/exams.js';
import * as calendarView from './views/calendar.js';
import * as toolsView from './views/tools.js';
import * as templatesView from './views/templates.js';
import * as settingsView from './views/settings.js';

const viewRoot = document.getElementById('view');
const routes = [
  { pattern: /^\/$/, view: dashboardView, nav: 'dashboard', title: 'Dashboard' },
  { pattern: /^\/notizen$/, view: notesView, nav: 'notes', title: 'Notizen' },
  { pattern: /^\/notizen\/(\d+)$/, view: notesView, nav: 'notes', title: 'Notiz', params: (m) => ({ id: Number(m[1]) }) },
  { pattern: /^\/karten$/, view: cardsView, nav: 'cards', title: 'Karteikarten' },
  { pattern: /^\/lernen$/, view: studyView, nav: 'study', title: 'Lernen' },
  { pattern: /^\/dokumente$/, view: documentsView, nav: 'documents', title: 'Dokumente' },
  { pattern: /^\/aufgaben$/, view: tasksView, nav: 'tasks', title: 'Aufgaben' },
  { pattern: /^\/pruefungen$/, view: examsView, nav: 'exams', title: 'Prüfungen' },
  { pattern: /^\/kalender$/, view: calendarView, nav: 'calendar', title: 'Kalender' },
  { pattern: /^\/faecher$/, view: subjectsView, nav: 'subjects', title: 'Fächer & Semester' },
  { pattern: /^\/faecher\/(\d+)$/, view: subjectsView, nav: 'subjects', title: 'Fach', params: (m) => ({ id: Number(m[1]) }) },
  { pattern: /^\/werkzeuge$/, view: toolsView, nav: 'tools', title: 'Informatik-Werkzeuge' },
  { pattern: /^\/werkzeuge\/([a-z0-9-]+)$/, view: toolsView, nav: 'tools', title: 'Informatik-Werkzeug', params: (m) => ({ tool: m[1] }) },
  { pattern: /^\/vorlagen$/, view: templatesView, nav: 'templates', title: 'Lernvorlagen' },
  { pattern: /^\/einstellungen$/, view: settingsView, nav: 'settings', title: 'Sichern & Einstellungen' }
];

let cleanup = null;
let renderToken = 0;

function parseHash() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart] = raw.split('?');
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  return { path: path.replace(/\/{2,}/g, '/'), query: new URLSearchParams(queryPart || '') };
}

function setActiveNav(nav) {
  document.querySelectorAll('[data-nav]').forEach((item) => {
    item.classList.toggle('active', item.dataset.nav === nav);
    if (item.dataset.nav === nav) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-backdrop').hidden = true;
  document.getElementById('menu-toggle')?.setAttribute('aria-expanded', 'false');
}

async function renderRoute() {
  const token = ++renderToken;
  closeSidebar();
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  const { path, query } = parseHash();
  const route = routes.find((candidate) => candidate.pattern.test(path));
  if (!route) {
    viewRoot.innerHTML = `<div class="empty">${icon('alert')}<h3>Seite nicht gefunden</h3><p>Die Adresse „${esc(path)}“ gibt es nicht.</p><a class="btn btn-primary" href="#/">Zum Dashboard</a></div>`;
    return;
  }
  const match = route.pattern.exec(path);
  const params = route.params ? route.params(match) : {};
  setActiveNav(route.nav);
  document.title = `${route.title} · StudyForge`;
  viewRoot.innerHTML = '<div class="loading">Wird geladen …</div>';
  try {
    const result = await route.view.render(viewRoot, { ...params, query, params });
    if (token !== renderToken) return;
    cleanup = result;
    typesetMath(viewRoot);
    window.scrollTo({ top: 0, behavior: 'auto' });
    refreshMeta().catch(() => {});
  } catch (error) {
    if (token !== renderToken) return;
    console.error(error);
    viewRoot.innerHTML = `<div class="empty">${icon('alert')}<h3>Ansicht konnte nicht geladen werden</h3><p>${esc(error?.message || 'Unbekannter Fehler.')}</p><button class="btn btn-primary" id="retry-view">Erneut versuchen</button></div>`;
    document.getElementById('retry-view')?.addEventListener('click', () => renderRoute());
  }
}

/* ------------------------------------------------------------------ Suche */
function openSearch(initial = '') {
  const { body, close } = openModal({
    title: 'Suche',
    className: 'command-modal',
    body: `<div class="command-input-wrap">${icon('search')}
        <input type="search" id="command-input" placeholder="Notizen, Dokumente, Karten, Aufgaben durchsuchen …" autocomplete="off" spellcheck="false" value="${esc(initial)}">
      </div>
      <div class="command-results" id="command-results">
        <div class="command-empty">Mindestens zwei Zeichen eingeben.</div>
      </div>
      <div class="command-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> auswählen</span><span><kbd>Enter</kbd> öffnen</span><span><kbd>Esc</kbd> schließen</span></div>`,
    actions: []
  });
  const input = body.querySelector('#command-input');
  const results = body.querySelector('#command-results');
  let items = [];
  let selected = 0;

  const select = (index) => {
    const nodes = results.querySelectorAll('.command-item');
    if (!nodes.length) return;
    selected = (index + nodes.length) % nodes.length;
    nodes.forEach((node, i) => node.classList.toggle('selected', i === selected));
    nodes[selected]?.scrollIntoView({ block: 'nearest' });
  };

  const runSearch = debounce(async (query) => {
    if (query.trim().length < 2) {
      items = [];
      results.innerHTML = '<div class="command-empty">Mindestens zwei Zeichen eingeben.</div>';
      return;
    }
    try {
      const data = await api.get(`/search?q=${encodeURIComponent(query)}`);
      items = [];
      const sections = [
        ['Notizen', 'notes', 'notes', data.notes, (item) => ({ sub: item.subject_name || 'Ohne Fach' })],
        ['Dokumente', 'documents', 'documents', data.documents, (item) => ({ sub: item.snippet || item.subject_name || item.mime || '' })],
        ['Karteikarten', 'cards', 'cards', data.cards, () => ({ sub: 'Karte' })],
        ['Aufgaben', 'tasks', 'tasks', data.tasks, (item) => ({ sub: item.status })]
      ];
      results.innerHTML = sections
        .filter(([, , , list]) => list.length)
        .map(([label, kind, , list, extra]) => {
          const rendered = list.map((item) => {
            const index = items.length;
            items.push({ kind, item });
            const title = kind === 'cards' ? item.front : item.title || item.original_name;
            return `<a class="command-item" href="#" data-index="${index}">
              ${icon(kind === 'notes' ? 'notes' : kind === 'documents' ? 'documents' : kind === 'cards' ? 'cards' : 'tasks')}
              <span class="truncate">${esc(String(title).slice(0, 140))}</span>
              <span class="command-sub">${esc(extra(item).sub.slice(0, kind === 'documents' ? 86 : 40))}</span>
            </a>`;
          }).join('');
          return `<div class="command-group-label">${label}</div>${rendered}`;
        })
        .join('') || '<div class="command-empty">Keine Treffer.</div>';
      selected = 0;
      select(0);
      results.querySelectorAll('.command-item').forEach((node) => {
        node.addEventListener('click', (event) => {
          event.preventDefault();
          openItem(items[Number(node.dataset.index)]);
        });
      });
    } catch (error) {
      results.innerHTML = `<div class="command-empty">${esc(error.message)}</div>`;
    }
  }, 180);

  const openItem = (entry) => {
    if (!entry) return;
    close();
    if (entry.kind === 'notes') window.location.hash = `#/notizen/${entry.item.id}`;
    else if (entry.kind === 'documents') window.location.hash = `#/dokumente?doc=${entry.item.id}`;
    else if (entry.kind === 'cards') window.location.hash = `#/karten?q=${encodeURIComponent(input.value.trim())}`;
    else if (entry.kind === 'tasks') window.location.hash = `#/aufgaben?q=${encodeURIComponent(input.value.trim())}`;
  };

  input.addEventListener('input', () => runSearch(input.value));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      select(selected + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      select(selected - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      openItem(items[selected]);
    }
  });
  if (initial) runSearch(initial);
  window.setTimeout(() => input.focus(), 30);
}

/* ------------------------------------------------------------------ Start */
function wireGlobal() {
  document.getElementById('menu-toggle').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    const open = sidebar.classList.toggle('open');
    document.getElementById('sidebar-backdrop').hidden = !open;
    document.getElementById('menu-toggle').setAttribute('aria-expanded', String(open));
  });
  document.getElementById('sidebar-backdrop').addEventListener('click', closeSidebar);
  document.getElementById('theme-toggle').addEventListener('click', async () => {
    try {
      await toggleTheme();
    } catch (error) {
      errorToast(error);
    }
  });
  document.getElementById('search-trigger').addEventListener('click', () => openSearch());
  document.getElementById('quick-add-btn').addEventListener('click', (event) => {
    event.stopPropagation();
    const menu = document.getElementById('quick-add-menu');
    const isHidden = menu.hidden;
    menu.hidden = !isHidden;
    document.getElementById('quick-add-btn').setAttribute('aria-expanded', String(isHidden));
  });
  document.getElementById('quick-add-menu').addEventListener('click', () => {
    document.getElementById('quick-add-menu').hidden = true;
    document.getElementById('quick-add-btn').setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('click', (event) => {
    const menu = document.getElementById('quick-add-menu');
    if (!menu.hidden && !event.target.closest('#quick-add')) {
      menu.hidden = true;
      document.getElementById('quick-add-btn').setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openSearch();
    }
    if (event.key === 'Escape') closeSidebar();
  });
  document.addEventListener('click', async (event) => {
    const link = event.target.closest('a.wikilink');
    if (!link) return;
    event.preventDefault();
    const title = link.dataset.noteTitle;
    try {
      const data = await api.get(`/search?q=${encodeURIComponent(title)}`);
      const found =
        data.notes.find((note) => note.title.toLowerCase() === title.toLowerCase()) || data.notes[0];
      if (found) window.location.hash = `#/notizen/${found.id}`;
      else toast(`Keine Notiz mit dem Titel „${title}“ gefunden.`, 'warning');
    } catch (error) {
      errorToast(error);
    }
  });
  window.addEventListener('hashchange', renderRoute);
  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason?.name === 'ApiError') {
      errorToast(event.reason);
      event.preventDefault();
    }
  });
}

async function boot() {
  try {
    await loadCore();
  } catch (error) {
    viewRoot.innerHTML = `<div class="empty">${icon('alert')}<h3>StudyForge konnte nicht geladen werden</h3><p>${esc(error.message)}</p><p class="small">Läuft der lokale Starthelfer noch? Starte StudyForge über <code>start.sh</code> bzw. <code>start.cmd</code> neu.</p></div>`;
    return;
  }
  wireGlobal();
  await renderRoute();
}

boot();
void state;
