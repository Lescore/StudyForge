/**
 * Kleiner, sicherer Syntaxhervorheber (kein eval, kein externes Skript).
 * Er deckt die im Studium üblichen Sprachen ausreichend ab, ohne eine
 * vollständige Parser-Implementierung zu sein.
 */

const KEYWORDS = {
  javascript: 'const let var function return if else for while do switch case break continue class extends new this import export from default async await try catch finally throw typeof instanceof of in null undefined true false static get set yield delete void',
  typescript: 'const let var function return if else for while do switch case break continue class extends new this import export from default async await try catch finally throw typeof instanceof of in null undefined true false static get set yield delete void interface type enum implements public private protected readonly as satisfies namespace declare abstract',
  java: 'public private protected class interface extends implements static final void int long double float boolean char byte short new return if else for while do switch case break continue try catch finally throw throws import package this super null true false abstract synchronized volatile transient native instanceof enum record var',
  csharp: 'public private protected internal class interface struct enum static readonly const void int long double float bool string char byte decimal var new return if else for foreach while do switch case break continue try catch finally throw using namespace this base null true false async await override virtual abstract sealed partial record',
  c: 'int long short char float double void unsigned signed const static extern struct union enum typedef return if else for while do switch case break continue sizeof goto volatile register inline',
  cpp: 'int long short char float double void unsigned signed const static extern struct union enum typedef return if else for while do switch case break continue class public private protected namespace using template typename new delete this nullptr true false virtual override auto',
  python: 'def class return if elif else for while in not and or is None True False import from as with try except finally raise lambda yield global nonlocal pass break continue del assert async await match case self',
  sql: 'select from where insert into values update set delete create table alter drop index join left right inner outer on group by order having limit offset distinct as and or not null primary key foreign references default unique check union all case when then else end begin commit rollback transaction',
  bash: 'if then else elif fi for while do done case esac function return local export readonly echo cd ls cat grep sed awk curl wget ssh scp mkdir rm cp mv chmod chown sudo exit set unset source',
  json: 'true false null',
  css: '',
  html: '',
  yaml: 'true false null yes no on off',
  text: ''
};

const TYPE_WORDS = new Set([
  'String', 'Integer', 'Boolean', 'Float', 'Double', 'Object', 'List', 'Map', 'Set', 'Array',
  'Long', 'Character', 'Byte', 'Exception', 'Math', 'System', 'Console', 'File', 'Path',
  'Socket', 'Server', 'Client', 'Thread', 'Runnable', 'BigDecimal', 'ArrayList', 'HashMap'
]);

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function languageConfig(lang) {
  const l = String(lang || '').toLowerCase();
  if (['js', 'javascript', 'mjs', 'node'].includes(l)) return { key: 'javascript', hashComments: false, slashComments: true, block: true };
  if (['ts', 'typescript'].includes(l)) return { key: 'typescript', hashComments: false, slashComments: true, block: true };
  if (['java', 'kotlin', 'scala'].includes(l)) return { key: 'java', hashComments: false, slashComments: true, block: true };
  if (['cs', 'csharp', 'c#'].includes(l)) return { key: 'csharp', hashComments: false, slashComments: true, block: true };
  if (['c'].includes(l)) return { key: 'c', hashComments: false, slashComments: true, block: true };
  if (['cpp', 'c++', 'cc', 'h', 'hpp'].includes(l)) return { key: 'cpp', hashComments: false, slashComments: true, block: true };
  if (['py', 'python'].includes(l)) return { key: 'python', hashComments: true, slashComments: false, block: false };
  if (['sql', 'sqlite'].includes(l)) return { key: 'sql', hashComments: false, slashComments: false, block: true, dashComments: true };
  if (['sh', 'bash', 'shell', 'zsh', 'console'].includes(l)) return { key: 'bash', hashComments: true, slashComments: false, block: false };
  if (['json'].includes(l)) return { key: 'json', hashComments: false, slashComments: false, block: false };
  if (['css', 'scss'].includes(l)) return { key: 'css', hashComments: false, slashComments: true, block: true };
  if (['html', 'xml', 'svg'].includes(l)) return { key: 'html', hashComments: false, slashComments: false, block: true, html: true };
  if (['yml', 'yaml'].includes(l)) return { key: 'yaml', hashComments: true, slashComments: false, block: false };
  return { key: 'text', hashComments: false, slashComments: false, block: false };
}

function regexFor(config) {
  const commentParts = [];
  if (config.html) commentParts.push('<!--[\\s\\S]*?-->');
  if (config.slashComments && config.block) commentParts.push('\\/\\/[^\\n]*', '\\/\\*[\\s\\S]*?\\*\\/');
  else if (config.slashComments) commentParts.push('\\/\\/[^\\n]*');
  if (config.dashComments) commentParts.push('--[^\\n]*', '\\/\\*[\\s\\S]*?\\*\\/');
  if (config.hashComments) commentParts.push('#[^\\n]*');

  const parts = [
    // Feste Gruppenreihenfolge: Kommentar, Tag, String, Zahl, Wort.
    commentParts.length ? `(${commentParts.join('|')})` : '((?!))',
    config.html ? '(<\\/?[A-Za-z][^>]*>)' : '((?!))',
    '("""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'|"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'|`(?:\\\\.|[^`\\\\])*`)',
    '(\\b(?:0[xX][0-9a-fA-F]+|\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\b)',
    '([A-Za-z_$][\\w$]*)'
  ];
  return new RegExp(parts.join('|'), 'g');
}

export function highlightCode(code, lang) {
  const source = String(code ?? '');
  const config = languageConfig(lang);
  if (config.key === 'text' || !source) return escapeHtml(source);
  const words = new Set((KEYWORDS[config.key] || '').split(/\s+/).filter(Boolean));
  const re = regexFor(config);
  let out = '';
  let last = 0;
  let match;
  while ((match = re.exec(source)) !== null) {
    out += escapeHtml(source.slice(last, match.index));
    const [token, comment, tag, stringToken, numberToken, word] = match;
    if (comment) out += `<span class="tok-com">${escapeHtml(token)}</span>`;
    else if (tag) out += `<span class="tok-key">${escapeHtml(token)}</span>`;
    else if (stringToken) out += `<span class="tok-str">${escapeHtml(token)}</span>`;
    else if (numberToken) out += `<span class="tok-num">${escapeHtml(token)}</span>`;
    else if (word) {
      const isCall = /^\s*\(/.test(source.slice(re.lastIndex));
      if (words.has(word)) out += `<span class="tok-key">${escapeHtml(word)}</span>`;
      else if (TYPE_WORDS.has(word) || (config.key !== 'css' && /^[A-Z][A-Za-z0-9_]*$/.test(word) && !isCall)) {
        out += `<span class="tok-type">${escapeHtml(word)}</span>`;
      } else if (isCall) out += `<span class="tok-fn">${escapeHtml(word)}</span>`;
      else out += escapeHtml(word);
    }
    last = re.lastIndex;
  }
  out += escapeHtml(source.slice(last));
  return out;
}
