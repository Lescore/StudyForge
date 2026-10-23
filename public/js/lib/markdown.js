/**
 * Markdown-Renderer für StudyForge.
 * - Alles wird zuerst escaped; rohes HTML aus Notizen wird nie ausgeführt.
 * - Formeln werden als Platzhalter ausgegeben und im Browser mit dem lokal
 *   mitgelieferten KaTeX gerendert (Rückfall: lesbarer Text).
 * - Externe Bilder werden nicht automatisch geladen (Datenschutz), sondern
 *   nur als Hinweis/Link dargestellt.
 */
import { escapeHtml, highlightCode } from './highlight.js';

const TOKEN_START = '\u0000';
const TOKEN_END = '\u0000';

function tokenize(tokens, html) {
  const key = `${TOKEN_START}T${tokens.length}${TOKEN_END}`;
  tokens.push(html);
  return key;
}

function safeLinkUrl(url) {
  const value = String(url ?? '').trim();
  if (!value) return null;
  if (/^(https?:|mailto:)/i.test(value)) return value;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (value.startsWith('#')) return value;
  if (/^[\w./-]+$/.test(value) && !value.includes(':')) return value;
  return null;
}

function safeImageUrl(url) {
  const value = String(url ?? '').trim();
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(value)) return value;
  if (value.startsWith('/api/files/')) return value;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  return null;
}

export function renderInline(input) {
  const tokens = [];
  let src = String(input ?? '');

  // Code-Spans zuerst schützen.
  src = src.replace(/(`+)([\s\S]*?)\1/g, (match, ticks, code) => {
    return tokenize(tokens, `<code>${escapeHtml(code.replace(/^\s|\s$/g, ''))}</code>`);
  });

  // Inline-Formeln $...$ (nicht $$).
  src = src.replace(/(^|[^\\])\$([^$\n]+?)\$/g, (match, prefix, tex) => {
    return prefix + tokenize(tokens, `<span class="math-inline" data-tex="${escapeHtml(tex.trim())}"></span>`);
  });

  src = escapeHtml(src);

  // Bilder: nur lokale Quellen laden. (Der Text ist bereits escaped.)
  src = src.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (match, alt, url) => {
    const safe = safeImageUrl(url);
    if (safe) {
      return `<img src="${safe}" alt="${alt}" loading="lazy">`;
    }
    const link = safeLinkUrl(url);
    const label = alt || 'Bild';
    return link
      ? `<span class="img-external">Bild nicht automatisch geladen: <a href="${link}" target="_blank" rel="noopener noreferrer">${label}</a></span>`
      : `<span class="img-external">Bild nicht verfügbar: ${label}</span>`;
  });

  // Normale Links.
  src = src.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, url) => {
    const safe = safeLinkUrl(url);
    if (!safe) return label;
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  // Wikilinks [[Titel]] bzw. [[Titel|Anzeige]].
  src = src.replace(/\[\[([^\]|\n]{1,200})(?:\|([^\]\n]{1,200}))?\]\]/g, (match, title, label) => {
    const cleanTitle = title.trim();
    return `<a href="#" class="wikilink" data-note-title="${cleanTitle}">${label ? label.trim() : cleanTitle}</a>`;
  });

  // Hervorhebungen.
  src = src
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/==([^=\n]+)==/g, '<mark>$1</mark>');

  // Platzhalter zurück einsetzen.
  src = src.replace(/\u0000T(\d+)\u0000/g, (match, index) => tokens[Number(index)] ?? '');
  return src;
}

function matchListItem(line) {
  const match = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
  if (!match) return null;
  return {
    indent: match[1].replace(/\t/g, '  ').length,
    ordered: /^\d/.test(match[2]),
    text: match[3]
  };
}

function isBlockStart(lines, index) {
  const line = lines[index];
  if (line.trim() === '') return true;
  if (/^\s*(```|~~~)/.test(line)) return true;
  if (/^\s*\$\$/.test(line)) return true;
  if (/^#{1,6}\s+/.test(line)) return true;
  if (/^\s*>\s?/.test(line)) return true;
  if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) return true;
  if (matchListItem(line)) return true;
  if (/^\s*\|/.test(line)) return true;
  return false;
}

function parseList(lines, start, baseIndent) {
  const first = matchListItem(lines[start]);
  const ordered = first.ordered;
  let html = ordered ? '<ol>' : '<ul>';
  let taskList = false;
  let i = start;
  let open = false;
  while (i < lines.length) {
    const item = matchListItem(lines[i]);
    if (!item) {
      if (open && /^\s{2,}\S/.test(lines[i]) && !isBlockStart(lines, i)) {
        html += `<br>${renderInline(lines[i].trim())}`;
        i += 1;
        continue;
      }
      break;
    }
    if (item.indent < baseIndent) break;
    if (item.indent > baseIndent) {
      const nested = parseList(lines, i, item.indent);
      html += nested.html;
      i = nested.next;
      continue;
    }
    if (item.ordered !== ordered) break;
    if (open) html += '</li>';
    const task = /^\[([ xX])\]\s+(.*)$/.exec(item.text);
    if (task) taskList = true;
    html += '<li';
    if (task) html += ' class="task-item"';
    html += '>';
    if (task) html += `<input type="checkbox" disabled${task[1].toLowerCase() === 'x' ? ' checked' : ''}> `;
    html += renderInline(task ? task[2] : item.text);
    open = true;
    i += 1;
  }
  if (open) html += '</li>';
  html += ordered ? '</ol>' : '</ul>';
  if (taskList) html = html.replace(/^<ul>/, '<ul class="task-list">');
  return { html, next: i };
}

function splitTableRow(line) {
  let value = line.trim();
  if (value.startsWith('|')) value = value.slice(1);
  if (value.endsWith('|')) value = value.slice(0, -1);
  const cells = [];
  let current = '';
  let inCode = false;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === '`') inCode = !inCode;
    if (ch === '|' && !inCode) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
}

function renderBlocks(lines) {
  let html = '';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    // Codeblock
    const fence = /^\s*(```+|~~~+)\s*([\w+#.-]*)\s*$/.exec(line);
    if (fence) {
      const marker = fence[1][0];
      const lang = fence[2] || '';
      const buffer = [];
      i += 1;
      while (i < lines.length && !new RegExp(`^\\s*${marker}{3,}\\s*$`).test(lines[i])) {
        buffer.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      html += `<pre class="code-lang" data-lang="${escapeHtml(lang)}"><code>${highlightCode(buffer.join('\n'), lang)}</code></pre>`;
      continue;
    }

    // Formelblock $$ ... $$
    if (/^\s*\$\$/.test(line)) {
      const rest = line.replace(/^\s*\$\$/, '');
      if (rest.includes('$$')) {
        const tex = rest.replace(/\$\$\s*$/, '').trim();
        if (tex) html += `<div class="math-block" data-tex="${escapeHtml(tex)}"></div>`;
        i += 1;
        continue;
      }
      const buffer = rest ? [rest] : [];
      i += 1;
      while (i < lines.length && !/\$\$\s*$/.test(lines[i])) {
        buffer.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) {
        const tail = lines[i].replace(/\$\$\s*$/, '');
        if (tail.trim()) buffer.push(tail);
        i += 1;
      }
      const tex = buffer.join('\n').trim();
      if (tex) html += `<div class="math-block" data-tex="${escapeHtml(tex)}"></div>`;
      continue;
    }

    // Überschrift
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      html += `<h${level}>${renderInline(heading[2])}</h${level}>`;
      i += 1;
      continue;
    }

    // Trennlinie
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      html += '<hr>';
      i += 1;
      continue;
    }

    // Zitat
    if (/^\s*>\s?/.test(line)) {
      const buffer = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buffer.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      html += `<blockquote>${renderBlocks(buffer)}</blockquote>`;
      continue;
    }

    // Tabelle
    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = splitTableRow(line);
      const separator = splitTableRow(lines[i + 1]);
      const aligns = separator.map((cell) => {
        const left = cell.startsWith(':');
        const right = cell.endsWith(':');
        if (left && right) return 'center';
        if (right) return 'right';
        return 'left';
      });
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      html += '<table><thead><tr>';
      header.forEach((cell, index) => {
        html += `<th style="text-align:${aligns[index] ?? 'left'}">${renderInline(cell)}</th>`;
      });
      html += '</tr></thead><tbody>';
      for (const row of rows) {
        html += '<tr>';
        header.forEach((_, index) => {
          html += `<td style="text-align:${aligns[index] ?? 'left'}">${renderInline(row[index] ?? '')}</td>`;
        });
        html += '</tr>';
      }
      html += '</tbody></table>';
      continue;
    }

    // Listen
    if (matchListItem(line)) {
      const list = parseList(lines, i, matchListItem(line).indent);
      html += list.html;
      i = list.next;
      continue;
    }

    // Absatz
    const buffer = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines, i)) {
      buffer.push(lines[i]);
      i += 1;
    }
    html += `<p>${buffer.map((segment) => renderInline(segment)).join('<br>')}</p>`;
  }
  return html;
}

export function renderMarkdown(source) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  return renderBlocks(lines);
}

/** Lückentext für den Lernmodus: {{...}} wird zur Lücke bzw. Lösung. */
export function renderCloze(source, reveal = false) {
  const text = String(source ?? '');
  let html = '';
  let last = 0;
  const re = /\{\{([^{}]{1,500})\}\}/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    html += escapeHtml(text.slice(last, match.index));
    html += reveal
      ? `<mark class="cloze-reveal">${escapeHtml(match[1])}</mark>`
      : '<span class="cloze-blank" aria-label="Lücke">_____</span>';
    last = re.lastIndex;
  }
  html += escapeHtml(text.slice(last));
  return html.replace(/\n/g, '<br>');
}

/** Klartext-Vorschau (ohne HTML) für Suchergebnisse etc. */
export function plainText(source, max = 200) {
  const text = String(source ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/[#>*_`~\[\]()!-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
