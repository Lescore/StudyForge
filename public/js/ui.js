import { escapeHtml } from './lib/highlight.js';

export const esc = escapeHtml;

export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function $$(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

export function icon(name, className = 'icon') {
  return `<svg class="${className}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

export function toast(message, type = 'info', timeout = 4200) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  root.appendChild(el);
  window.setTimeout(() => {
    el.remove();
  }, timeout);
}

export function errorToast(error) {
  const message = error?.message || 'Unbekannter Fehler.';
  toast(message, 'error', 6000);
}

export function debounce(fn, wait = 300) {
  let timer = null;
  const wrapped = (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => window.clearTimeout(timer);
  wrapped.flush = (...args) => {
    window.clearTimeout(timer);
    fn(...args);
  };
  return wrapped;
}

/* ------------------------------------------------------------------ Modal */
export function openModal({
  title,
  subtitle = '',
  body = '',
  actions = [],
  wide = false,
  narrow = false,
  className = '',
  onMount,
  onClose
}) {
  const root = document.getElementById('modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const size = wide ? ' wide' : narrow ? ' narrow' : '';
  overlay.innerHTML = `
    <div class="modal${size}${className ? ` ${className}` : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-head">
        <div>
          <h2 id="modal-title">${esc(title)}</h2>
          ${subtitle ? `<div class="modal-sub">${esc(subtitle)}</div>` : ''}
        </div>
        <button type="button" class="icon-btn" data-modal-close aria-label="Dialog schließen">${icon('close')}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${actions.length ? `<div class="modal-foot">${actions
        .map((action, index) => `<button type="button" class="btn ${action.variant === 'primary' ? 'btn-primary' : action.variant === 'danger' ? 'btn-danger' : 'btn-ghost'}" data-action-index="${index}" ${action.id ? `id="${esc(action.id)}"` : ''}>${action.icon ? icon(action.icon) : ''}${esc(action.label)}</button>`)
        .join('')}</div>` : ''}
    </div>`;
  root.appendChild(overlay);
  const dialog = overlay.querySelector('.modal');
  const previousFocus = document.activeElement;
  let closed = false;

  const close = (result) => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
    if (onClose) onClose(result);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(
      (el) => el.offsetParent !== null
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  document.addEventListener('keydown', onKeyDown);

  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay) close();
  });
  dialog.addEventListener('submit', (event) => {
    event.preventDefault();
    dialog.querySelector('.modal-foot .btn-primary')?.click();
  });
  overlay.querySelectorAll('[data-modal-close]').forEach((btn) => btn.addEventListener('click', () => close()));
  overlay.querySelectorAll('[data-action-index]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = actions[Number(btn.dataset.actionIndex)];
      if (!action) return;
      if (action.onClick) {
        btn.disabled = true;
        try {
          const result = await action.onClick(close, dialog, btn);
          if (result !== false && !action.keepOpen && !closed) close();
        } catch (error) {
          errorToast(error);
        } finally {
          btn.disabled = false;
        }
      } else if (!action.keepOpen) close();
    });
  });

  window.setTimeout(() => {
    const preferred = dialog.querySelector('[autofocus], .modal-body input:not([type="checkbox"]), .modal-body textarea, .modal-body select, .modal-foot .btn-primary');
    if (preferred) preferred.focus();
    else dialog.focus();
  }, 20);

  if (onMount) onMount(dialog, close);
  return { close, el: dialog, body: dialog.querySelector('.modal-body'), overlay };
}

export function confirmDialog({
  title,
  message,
  confirmLabel = 'Bestätigen',
  cancelLabel = 'Abbrechen',
  danger = false
} = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const { close } = openModal({
      title,
      narrow: true,
      body: `<p style="margin:0; white-space:pre-line">${esc(message)}</p>`,
      actions: [
        {
          label: cancelLabel,
          onClick: () => {
            answered = true;
            resolve(false);
          }
        },
        {
          label: confirmLabel,
          variant: danger ? 'danger' : 'primary',
          onClick: () => {
            answered = true;
            resolve(true);
          }
        }
      ],
      onClose: () => {
        if (!answered) resolve(false);
      }
    });
    void close;
  });
}

export function promptDialog({ title, label, value = '', placeholder = '', multiline = false, confirmLabel = 'Speichern' } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    openModal({
      title,
      narrow: true,
      body: `<div class="field"><label for="prompt-input">${esc(label)}</label>${
        multiline
          ? `<textarea class="textarea" id="prompt-input" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
          : `<input class="input" id="prompt-input" value="${esc(value)}" placeholder="${esc(placeholder)}">`
      }</div>`,
      actions: [
        {
          label: 'Abbrechen',
          onClick: () => {
            answered = true;
            resolve(null);
          }
        },
        {
          label: confirmLabel,
          variant: 'primary',
          onClick: (_close, dialog) => {
            const input = dialog.querySelector('#prompt-input');
            answered = true;
            resolve(input?.value.trim() || '');
          }
        }
      ],
      onMount: (dialog) => {
        const input = dialog.querySelector('#prompt-input');
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' && !multiline) {
            event.preventDefault();
            dialog.querySelector('.modal-foot .btn-primary')?.click();
          }
        });
      },
      onClose: () => {
        if (!answered) resolve(null);
      }
    });
  });
}

/* ------------------------------------------------------------------ Dates */
export function todayISO() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function parseDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value, { withTime = false, short = false } = {}) {
  if (!value) return '–';
  const date = parseDate(value);
  if (!date) return String(value);
  const dateText = date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: short ? '2-digit' : 'long',
    year: 'numeric'
  });
  if (!withTime) return dateText;
  return `${dateText}, ${date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
}

export function formatDateTimeShort(value) {
  if (!value) return '–';
  const date = parseDate(value);
  if (!date) return String(value);
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ', ' + date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export function relativeTime(value) {
  if (!value) return '–';
  const date = parseDate(value);
  if (!date) return String(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'gestern';
  if (days < 7) return `vor ${days} Tagen`;
  return formatDate(value, { short: true });
}

export function daysUntil(value) {
  if (!value) return null;
  const date = parseDate(value);
  if (!date) return null;
  const today = parseDate(todayISO());
  return Math.round((date.getTime() - today.getTime()) / 86400000);
}

export function deadlineLabel(value) {
  const days = daysUntil(value);
  if (days === null) return '';
  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? 'Tag' : 'Tage'} überfällig`;
  if (days === 0) return 'heute';
  if (days === 1) return 'morgen';
  if (days <= 7) return `in ${days} Tagen`;
  return formatDate(value, { short: true });
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1).replace('.', ',')} ${units[index]}`;
}

/* ------------------------------------------------------------------ Math */
export function typesetMath(root = document) {
  if (!root || !window.katex) return;
  root.querySelectorAll('.math-inline, .math-block').forEach((element) => {
    if (element.dataset.typeset === '1') return;
    const tex = element.dataset.tex;
    if (!tex) return;
    try {
      window.katex.render(tex, element, {
        displayMode: element.classList.contains('math-block'),
        throwOnError: true,
        strict: 'ignore',
        trust: false,
        output: 'html'
      });
      element.dataset.typeset = '1';
    } catch {
      element.classList.add('math-error');
      element.textContent = `Formel nicht darstellbar: ${tex}`;
      element.title = 'Bitte die LaTeX-Syntax prüfen.';
    }
  });
}

export function mathPreview(tex, displayMode = true) {
  if (!window.katex) return esc(tex);
  try {
    return window.katex.renderToString(tex, { displayMode, throwOnError: true, strict: 'ignore', trust: false, output: 'html' });
  } catch {
    return `<span class="field-error">LaTeX-Syntax nicht darstellbar.</span>`;
  }
}

/* ------------------------------------------------------------------ Misc */
export function emptyState(title, text, action = '') {
  return `<div class="empty">${icon('notes')}<h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
}

export function subjectOptions(subjects, selectedId, { includeEmpty = true, emptyLabel = 'Kein Fach' } = {}) {
  return `${includeEmpty ? `<option value="">${esc(emptyLabel)}</option>` : ''}${subjects
    .map((subject) => `<option value="${subject.id}"${Number(selectedId) === subject.id ? ' selected' : ''}>${esc(subject.name)}</option>`)
    .join('')}`;
}

export function deckOptions(decks, selectedId, { includeEmpty = true, emptyLabel = 'Kein Stapel' } = {}) {
  return `${includeEmpty ? `<option value="">${esc(emptyLabel)}</option>` : ''}${decks
    .map((deck) => `<option value="${deck.id}"${Number(selectedId) === deck.id ? ' selected' : ''}>${esc(deck.name)}${deck.subject_name ? ` – ${esc(deck.subject_name)}` : ''}</option>`)
    .join('')}`;
}

export function tagsToInput(tags) {
  return Array.isArray(tags) ? tags.join(', ') : '';
}

export function fileKindLabel(file) {
  const ext = String(file.original_name || '').split('.').pop()?.toUpperCase().slice(0, 4) || 'DATEI';
  return ext;
}

export function fileTypeKind(file) {
  const mime = String(file.mime || '');
  const name = String(file.original_name || '').toLowerCase();
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (mime.startsWith('image/') && mime !== 'image/svg+xml') return 'image';
  if (mime.startsWith('text/') || /\.(md|txt|java|py|c|cpp|cs|js|ts|sql|json|yml|yaml|sh)$/.test(name)) return 'text';
  return 'other';
}

export function setBusy(button, busy, label = 'Bitte warten …') {
  if (!button) return;
  if (busy) {
    button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.textContent = label;
  } else {
    button.disabled = false;
    if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
  }
}

export function formValues(form) {
  const data = {};
  for (const element of form.elements) {
    if (!element.name) continue;
    if (element.type === 'checkbox') data[element.name] = element.checked;
    else if (element.type === 'radio') {
      if (element.checked) data[element.name] = element.value;
    } else data[element.name] = element.value;
  }
  return data;
}
