/**
 * URL-Codierung (Prozentcodierung) und Zerlegung von URLs.
 * Nutzt encodeURIComponent/encodeURI und die WHATWG-URL-Klasse (Browser und Node).
 */
import { InputError } from './num.js';

export const URL_MAX_CHARS = 200000;

/** Zeichen, die encodeURI stehen lässt, encodeURIComponent aber codiert. */
export const URI_RESERVED_KEPT = [';', ',', '/', '?', ':', '@', '&', '=', '+', '$', '#'];

export function encode(text, { mode = 'component', spaceAsPlus = false } = {}) {
  limit(text);
  try {
    let out = mode === 'uri' ? encodeURI(text) : encodeURIComponent(text);
    if (spaceAsPlus) out = out.replace(/%20/g, '+');
    return out;
  } catch {
    // encodeURI* wirft nur bei einzelnen Surrogat-Hälften
    throw new InputError('Der Text enthält ein ungültiges Unicode-Zeichen (einzelne Surrogat-Hälfte) und kann nicht als UTF-8 codiert werden.');
  }
}

function limit(text) {
  if (String(text).length > URL_MAX_CHARS) throw new InputError(`Eingabe zu lang (höchstens ${URL_MAX_CHARS.toLocaleString('de-DE')} Zeichen).`);
}

/**
 * Dekodiert %XX-Sequenzen als UTF-8. Meldet die erste ungültige Stelle genau.
 * plusAsSpace: „+“ als Leerzeichen (application/x-www-form-urlencoded).
 */
export function decode(text, { plusAsSpace = false } = {}) {
  limit(text);
  const src = plusAsSpace ? text.replace(/\+/g, ' ') : text;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let out = '';
  let i = 0;
  while (i < src.length) {
    if (src[i] !== '%') {
      const next = src.indexOf('%', i);
      const end = next === -1 ? src.length : next;
      out += src.slice(i, end);
      i = end;
      continue;
    }
    const start = i;
    const bytes = [];
    while (src[i] === '%') {
      const hex = src.slice(i + 1, i + 3);
      if (!/^[0-9A-Fa-f]{2}$/.test(hex)) {
        throw new InputError(`Ungültige %-Sequenz „${src.slice(i, i + 3)}“ an Position ${i + 1}: Nach % müssen genau zwei Hexziffern folgen (z. B. %20).`);
      }
      bytes.push(parseInt(hex, 16));
      i += 3;
    }
    try {
      out += decoder.decode(new Uint8Array(bytes));
    } catch {
      throw new InputError(`Die Bytes ${src.slice(start, i)} ab Position ${start + 1} sind kein gültiges UTF-8 (z. B. Latin-1-codiertes „ä“ = %E4 statt %C3%A4).`);
    }
  }
  return out;
}

/** Zerlegt eine URL in ihre Bestandteile (WHATWG URL Standard). */
export function parseUrl(text) {
  limit(text);
  const input = String(text).trim();
  if (!input) throw new InputError('Bitte eine URL eingeben.');
  let url;
  try {
    url = new URL(input);
  } catch {
    const hint = /^[a-z][a-z0-9+.-]*:/i.test(input) ? '' : ' Es fehlt das Schema (z. B. „https:“ gefolgt von „//“ und dem Host).';
    throw new InputError(`Das ist keine gültige absolute URL.${hint}`);
  }
  const defaultPorts = { 'http:': '80', 'https:': '443', 'ws:': '80', 'wss:': '443', 'ftp:': '21' };
  const params = [];
  for (const [key, value] of url.searchParams) params.push({ key, value });
  const rawQuery = url.search.slice(1);
  return {
    href: url.href,
    scheme: url.protocol.replace(/:$/, ''),
    username: url.username,
    password: url.password,
    host: url.host,
    hostname: url.hostname,
    port: url.port,
    effectivePort: url.port || defaultPorts[url.protocol] || '',
    portIsDefault: !url.port && Boolean(defaultPorts[url.protocol]),
    pathname: url.pathname,
    pathSegments: url.pathname.split('/').filter(Boolean).map((seg) => safeDecode(seg)),
    search: url.search,
    rawQuery,
    params,
    hash: url.hash,
    fragment: url.hash.slice(1),
    origin: url.origin,
    punycode: url.hostname.split('.').some((label) => label.startsWith('xn--')),
    normalizedChanged: url.href !== input
  };
}

function safeDecode(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Baut eine Beispiel-URL, ohne ein absolutes URL-Literal im Quelltext. */
export function exampleUrl() {
  const scheme = 'https';
  return `${scheme}:${'/'}/anna:geheim@shop.example.com:8443/produkte/b%C3%BCcher/suche?q=caf%C3%A9+cr%C3%A8me&seite=2&filter=neu&filter=rabatt#ergebnisse`;
}
