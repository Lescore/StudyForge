import { api } from './api.js';
import { esc } from './ui.js';

export const state = {
  settings: {
    theme: 'system',
    font_size: 'md',
    review_limit: '20',
    requested_retention: '0.9',
    timer_default: '0',
    timer_minutes: '25',
    editor_split: '0'
  },
  subjects: [],
  semesters: [],
  meta: null
};

let loadPromise = null;

export async function loadCore({ force = false } = {}) {
  if (loadPromise && !force) return loadPromise;
  loadPromise = (async () => {
    const [settings, subjects, semesters, meta] = await Promise.all([
      api.get('/settings'),
      api.get('/subjects'),
      api.get('/semesters'),
      api.get('/meta')
    ]);
    state.settings = { ...state.settings, ...settings };
    state.subjects = subjects;
    state.semesters = semesters;
    state.meta = meta;
    applyAppearance();
    renderSidebarMeta();
    return state;
  })();
  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

export async function refreshSubjects() {
  state.subjects = await api.get('/subjects');
  return state.subjects;
}

export async function refreshMeta() {
  state.meta = await api.get('/meta');
  renderSidebarMeta();
  return state.meta;
}

export function applyAppearance() {
  const root = document.documentElement;
  const theme = state.settings.theme || 'system';
  root.dataset.theme = theme;
  root.dataset.font = state.settings.font_size || 'md';
}

export function resolvedTheme() {
  const theme = state.settings.theme || 'system';
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export async function toggleTheme() {
  const next = resolvedTheme() === 'dark' ? 'light' : 'dark';
  await saveSettings({ theme: next });
}

export async function saveSettings(patch) {
  state.settings = { ...state.settings, ...(await api.put('/settings', patch)) };
  applyAppearance();
  renderSidebarMeta();
  return state.settings;
}

export function renderSidebarMeta() {
  const el = document.getElementById('sidebar-meta');
  if (!el) return;
  const counts = state.meta?.counts;
  const lines = [];
  if (counts) {
    lines.push(`${counts.notes} ${counts.notes === 1 ? 'Notiz' : 'Notizen'} · ${counts.cards} ${counts.cards === 1 ? 'Karte' : 'Karten'}`);
  }
  if (state.meta?.version) lines.push(`Version ${state.meta.version} · lokal`);
  el.innerHTML = lines.map((line) => esc(line)).join('<br>');
}

export function subjectById(id) {
  return state.subjects.find((subject) => subject.id === Number(id)) ?? null;
}

export function semesterById(id) {
  return state.semesters.find((semester) => semester.id === Number(id)) ?? null;
}

export function subjectLabel(id) {
  const subject = subjectById(id);
  return subject ? subject.name : 'Ohne Fach';
}

export function subjectColor(id) {
  return subjectById(id)?.color || 'teal';
}
