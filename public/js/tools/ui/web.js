/**
 * Werkzeuge „Webtechnologien & Datenformate“: JSON, URL, Base64, Zeitstempel,
 * Diff, UUID, HTTP-Statuscodes, MIME-Typen. Alles läuft lokal im Browser.
 */
import { esc, field, checkbox, segmented, layout, panel, resultList, steps, notice, explanation, toolActions, live, table, copyButton, limitLength } from '../kit.js';
import { processJson, JSON_MAX_CHARS } from '../core/web-json.js';
import { encode, decode, parseUrl, exampleUrl, URI_RESERVED_KEPT } from '../core/web-url.js';
import { encodeBytes, decodeToBytes, utf8Decode, encodedLength, bytesToHex, sniffType, utf8Encode } from '../core/web-base64.js';
import { parseTimestamp, describeInstant, isoUtc, httpDate, relativeTime, epochInfo, parseIsoDate, zonedToUtc, INT32_MAX } from '../core/web-time.js';
import { diffText, sideBySide, unifiedDiff, DIFF_MAX_LINES } from '../core/web-diff.js';
import { generateUuids, analyzeUuid, formatUuid } from '../core/web-uuid.js';
import { HTTP_STATUS, HTTP_CLASSES, searchStatus } from '../core/web-http-status.js';
import { MIME_TYPES, searchMime, parseContentType } from '../core/web-mime.js';

const nf = (n) => Number(n).toLocaleString('de-DE');
const plural = (n, one, many) => `${nf(n)} ${n === 1 ? one : many}`;
const byteText = (n) => (n < 1024 ? plural(n, 'Byte', 'Byte') : n < 1048576 ? `${plural(n, 'Byte', 'Byte')} (${(n / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} KiB)` : `${plural(n, 'Byte', 'Byte')} (${(n / 1048576).toLocaleString('de-DE', { maximumFractionDigits: 2 })} MiB)`);

/* ================================================================ JSON */

function json(container) {
  const defaults = { input: '{"name":"StudyForge","version":"1.2.0","module":["db","web"],"offline":true,"limits":{"maxRows":500,"timeout":2.5},"author":null}', mode: 'format', indent: '2', sortKeys: false };
  const examples = [
    { label: 'gültig', values: { input: defaults.input } },
    { label: 'Komma am Ende', values: { input: '{\n  "kurs": "Datenbanken",\n  "ects": 6,\n  "dozent": "Schmidt",\n}' } },
    { label: 'einfache Anführungszeichen', values: { input: "{\n  'kurs': 'Datenbanken'\n}" } },
    { label: 'große Zahl', values: { input: '{"id": 12345678901234567890, "id": 2, "zahl": 1.5e3}' } }
  ];
  container.innerHTML = layout(
    panel('Eingabe', `
      ${field({ id: 'input', label: 'JSON', value: defaults.input, rows: 12, mono: true, attrs: `maxlength="${JSON_MAX_CHARS}"` })}
      ${segmented({ name: 'mode', label: 'Ausgabe', value: defaults.mode, options: [['format', 'Formatieren'], ['minify', 'Komprimieren (minify)']] })}
      <div class="form-row">
        ${field({ id: 'indent', label: 'Einrückung', value: defaults.indent, options: [['2', '2 Leerzeichen'], ['4', '4 Leerzeichen'], ['tab', 'Tabulator']] })}
      </div>
      ${checkbox({ id: 'sortKeys', label: 'Schlüssel alphabetisch sortieren' })}
      ${toolActions({ examples })}
      ${explanation(`
        <p><strong>JSON</strong> (RFC 8259) kennt Objekte <code>{}</code>, Arrays <code>[]</code>, Zeichenketten in <strong>doppelten</strong> Anführungszeichen, Zahlen, <code>true</code>, <code>false</code> und <code>null</code>. Nicht erlaubt: Kommentare, Komma nach dem letzten Element, einfache Anführungszeichen, <code>NaN</code>/<code>Infinity</code>, führende Nullen.</p>
        <p>Dieses Werkzeug nutzt einen eigenen Parser: Fehler werden mit Zeile und Spalte gemeldet, Zahlen bleiben exakt erhalten (JavaScript würde z. B. 12345678901234567890 runden), und doppelte Schlüssel werden gemeldet.</p>
        <p><strong>Größe:</strong> „Zeichen“ zählt Unicode-Codepoints; gespeichert bzw. übertragen wird JSON als UTF-8 – Umlaute brauchen 2, Emojis 4 Byte.</p>`)}
    `),
    '<div id="out"></div>'
  );
  container.querySelector('#input').closest('.field').classList.add('field-wide');
  live(container, {
    output: '#out',
    defaults,
    examples,
    delay: 250,
    compute: (v) => {
      if (!v.input.trim()) return panel('Ergebnis', notice('Bitte JSON eingeben.', 'info'));
      let r;
      try {
        r = processJson(v.input, { mode: v.mode, indent: v.indent === 'tab' ? '\t' : Number(v.indent), sortKeys: v.sortKeys });
      } catch (error) {
        if (error.line === undefined) throw error;
        const lines = v.input.split('\n');
        const lineText = lines[error.line - 1] ?? '';
        const shown = [...lineText].slice(Math.max(0, error.column - 40), error.column + 40).join('');
        const caretPos = Math.min(error.column - 1, 39);
        return panel('Ergebnis', `
          <p><span class="badge badge-danger">Ungültiges JSON</span></p>
          ${notice(error.message, 'error')}
          <div class="mono-block web-json-context">${esc(shown)}\n${' '.repeat(caretPos)}^</div>
          ${resultList([{ label: 'Position', value: `Zeile ${error.line}, Spalte ${error.column} (Zeichen ${nf(error.offset + 1)})`, copy: false }])}
        `);
      }
      const rows = [
        { label: 'Wurzel', value: { object: 'Objekt', array: 'Array', string: 'Zeichenkette', number: 'Zahl' }[r.rootType] ?? r.rootType, copy: false, mono: false },
        { label: 'Eingabe', value: `${plural(r.input.chars, 'Zeichen', 'Zeichen')} · ${byteText(r.input.bytes)} UTF-8`, copy: false },
        { label: 'Ausgabe', value: `${plural(r.result.chars, 'Zeichen', 'Zeichen')} · ${byteText(r.result.bytes)} UTF-8`, copy: false },
        { label: 'Inhalt', value: `${plural(r.stats.objects, 'Objekt', 'Objekte')}, ${plural(r.stats.arrays, 'Array', 'Arrays')}, ${plural(r.stats.keys, 'Schlüssel', 'Schlüssel')}, Tiefe ${r.stats.maxDepth}`, copy: false, mono: false }
      ];
      const preview = r.output.length > 200000 ? `${r.output.slice(0, 200000)}\n… (Anzeige gekürzt – Kopieren liefert alles)` : r.output;
      return panel('Ergebnis', `
        <p><span class="badge badge-success">✓ Gültiges JSON</span></p>
        ${r.warnings.map((w) => notice(w, 'warning')).join('')}
        ${resultList(rows)}
        <div class="row-between web-out-head"><strong class="small">${v.mode === 'minify' ? 'Komprimiert' : 'Formatiert'}</strong>${copyButton(r.output, 'Ergebnis kopieren')}</div>
        <pre class="mono-block web-pre">${esc(preview)}</pre>
      `);
    }
  });
}

/* ================================================================ URL */

function url(container) {
  const defaults = { mode: 'encode', text: 'Grüße & Küsse: 50% Rabatt? ja/nein #1', variant: 'component', plus: false, urlInput: exampleUrl() };
  const examples = [
    { label: 'Codieren', values: { mode: 'encode', text: defaults.text } },
    { label: 'Decodieren', values: { mode: 'decode', text: 'caf%C3%A9%20cr%C3%A8me+br%C3%BBl%C3%A9e', plus: true } },
    { label: 'ungültige %-Sequenz', values: { mode: 'decode', text: 'Rabatt: 100%!' } },
    { label: 'URL zerlegen', values: { mode: 'parse', urlInput: exampleUrl() } }
  ];
  container.innerHTML = layout(
    panel('Eingabe', `
      ${segmented({ name: 'mode', label: 'Aufgabe', value: defaults.mode, options: [['encode', 'Codieren'], ['decode', 'Decodieren'], ['parse', 'URL zerlegen']] })}
      <div data-show="encode decode">
        ${field({ id: 'text', label: 'Text', value: defaults.text, rows: 3, mono: true })}
        <div data-show="encode">${field({ id: 'variant', label: 'Funktion', value: defaults.variant, options: [['component', 'encodeURIComponent (für einzelne Werte)'], ['uri', 'encodeURI (für ganze URLs)']] })}</div>
        ${checkbox({ id: 'plus', label: 'Leerzeichen als „+“ (Formular-Codierung application/x-www-form-urlencoded)' })}
      </div>
      <div data-show="parse">${field({ id: 'urlInput', label: 'URL', value: defaults.urlInput, rows: 3, mono: true })}</div>
      ${toolActions({ examples })}
      ${explanation(`
        <p><strong>Prozentcodierung:</strong> Zeichen, die in einer URL nicht vorkommen dürfen oder eine Sonderbedeutung haben, werden als UTF-8-Bytes in der Form <code>%XX</code> geschrieben – „ä“ wird zu <code>%C3%A4</code>, ein Leerzeichen zu <code>%20</code>.</p>
        <p><strong>encodeURIComponent</strong> codiert alles außer <code>A–Z a–z 0–9 - _ . ! ~ * ' ( )</code> – richtig für einzelne Werte, z. B. einen Suchbegriff in <code>?q=…</code>. <strong>encodeURI</strong> lässt zusätzlich die URL-Trennzeichen <code>${URI_RESERVED_KEPT.map(esc).join(' ')}</code> stehen – richtig für eine komplette URL, falsch für Werte: Ein „&amp;“ im Wert würde sonst einen neuen Parameter beginnen.</p>
        <p>Das „+“ für Leerzeichen gilt nur in Formulardaten (Query-String von HTML-Formularen), nicht im Pfad.</p>
        <p>Die Zerlegung nutzt die <code>URL</code>-Klasse des Browsers (WHATWG URL Standard). Internationale Domainnamen werden dabei in Punycode (<code>xn--…</code>) umgewandelt.</p>`)}
    `),
    '<div id="out"></div>'
  );
  const toggle = (mode) => container.querySelectorAll('[data-show]').forEach((el) => (el.hidden = !el.dataset.show.split(' ').includes(mode)));
  live(container, {
    output: '#out',
    defaults,
    examples,
    compute: (v) => {
      toggle(v.mode);
      if (v.mode === 'encode') {
        const comp = encode(v.text, { mode: 'component', spaceAsPlus: v.plus });
        const uri = encode(v.text, { mode: 'uri', spaceAsPlus: v.plus });
        const main = v.variant === 'uri' ? uri : comp;
        const bytes = utf8Encode(v.text).length;
        return panel('Ergebnis', `
          ${resultList([
            { label: v.variant === 'uri' ? 'encodeURI' : 'encodeURIComponent', value: main, strong: true },
            { label: 'Länge', value: `${nf([...v.text].length)} → ${nf(main.length)} Zeichen (${nf(bytes)} UTF-8-Bytes)`, copy: false }
          ])}
          <h3 class="web-sub">Vergleich</h3>
          ${table(['Funktion', 'Ergebnis'], [['encodeURIComponent', comp], ['encodeURI', uri]])}
          ${comp !== uri ? notice(`Unterschied: encodeURI lässt ${[...new Set([...v.text].filter((c) => URI_RESERVED_KEPT.includes(c)))].map((c) => `„${c}“`).join(', ')} stehen.`, 'info') : ''}
        `);
      }
      if (v.mode === 'decode') {
        const out = decode(v.text, { plusAsSpace: v.plus });
        return panel('Ergebnis', `
          ${resultList([{ label: 'Decodiert', value: out, strong: true }])}
          ${!v.plus && v.text.includes('+') ? notice('Die Eingabe enthält „+“. In Formulardaten steht es für ein Leerzeichen – dann die Option oben einschalten.', 'info') : ''}
        `);
      }
      const u = parseUrl(v.urlInput);
      const rows = [
        { label: 'Schema', value: u.scheme },
        u.username ? { label: 'Benutzer', value: u.username } : null,
        u.password ? { label: 'Passwort', value: u.password } : null,
        { label: 'Host', value: u.hostname || '–' },
        { label: 'Port', value: u.port ? u.port : u.effectivePort ? `${u.effectivePort} (Standard, nicht angegeben)` : '–', copy: Boolean(u.port) },
        { label: 'Pfad', value: u.pathname },
        { label: 'Query', value: u.search || '–', copy: Boolean(u.search) },
        { label: 'Fragment', value: u.hash || '–', copy: Boolean(u.hash) },
        { label: 'Origin', value: u.origin },
        { label: 'Normalisiert', value: u.href }
      ];
      return panel('Bestandteile', `
        ${u.password ? notice('Zugangsdaten in URLs sind unsicher (Verlauf, Logs, Referer) und werden von Browsern teils blockiert.', 'warning') : ''}
        ${u.punycode ? notice('Der Hostname enthält Punycode (xn--…): So werden internationale Domainnamen im DNS dargestellt.', 'info') : ''}
        ${resultList(rows)}
        ${u.pathSegments.length ? `<h3 class="web-sub">Pfadsegmente (decodiert)</h3>${table(['#', 'Segment'], u.pathSegments.map((s, i) => [String(i + 1), s]))}` : ''}
        <h3 class="web-sub">Query-Parameter (decodiert)</h3>
        ${u.params.length ? table(['Name', 'Wert'], u.params.map((p) => [p.key, p.value])) : '<p class="small subtle">Keine Parameter.</p>'}
        ${u.params.length !== new Set(u.params.map((p) => p.key)).size ? notice('Ein Parametername kommt mehrfach vor – das ist erlaubt (z. B. für Listen); wie er ausgewertet wird, entscheidet der Server.', 'info') : ''}
        ${u.normalizedChanged ? notice('Die URL-Klasse hat die Eingabe normalisiert (z. B. Kleinschreibung des Hosts, Prozentcodierung, abschließender Schrägstrich).', 'info') : ''}
      `);
    }
  });
}

/* ================================================================ Base64 */

const FILE_LIMIT = 5 * 1024 * 1024;

function base64(container) {
  let lastBytes = null;
  let fileName = 'decodiert.bin';
  const timers = new Set();
  const defaults = { dir: 'encode', text: 'Grüße aus StudyForge 😀', urlSafe: false, padding: true };
  const examples = [
    { label: 'Text mit Emoji', values: { dir: 'encode', text: defaults.text } },
    { label: 'Decodieren', values: { dir: 'decode', text: 'SGFsbG8gV2VsdCEgw4TDlsOcIOKCrA==' } },
    { label: 'Base64url', values: { dir: 'encode', text: '<<???>>', urlSafe: true, padding: false } },
    { label: 'ungültig', values: { dir: 'decode', text: 'SGFsbG8*V2VsdA==' } }
  ];
  container.innerHTML = layout(
    panel('Eingabe', `
      ${notice('Base64 ist eine <strong>Codierung, keine Verschlüsselung</strong>: Jeder kann sie ohne Schlüssel rückgängig machen. Für Geheimnisse ungeeignet.', 'warning', { html: true })}
      ${segmented({ name: 'dir', label: 'Richtung', value: defaults.dir, options: [['encode', 'Text → Base64'], ['decode', 'Base64 → Text/Bytes']] })}
      ${field({ id: 'text', label: 'Eingabe', value: defaults.text, rows: 5, mono: true })}
      ${checkbox({ id: 'urlSafe', label: 'Base64url (- und _ statt + und /)' })}
      ${checkbox({ id: 'padding', label: 'Füllzeichen „=“ anhängen (Padding)', checked: true })}
      ${toolActions({ examples })}
      <div class="web-file" data-no-live>
        <h3 class="web-sub">Datei codieren (lokal)</h3>
        <label class="small" for="b64-file">Datei wählen (höchstens 5 MiB; wird nicht hochgeladen)</label>
        <input class="input" type="file" id="b64-file" data-no-live>
        <div id="b64-file-out"></div>
      </div>
      ${explanation(`
        <p><strong>Base64</strong> (RFC 4648) stellt beliebige Bytes mit 64 druckbaren Zeichen dar: Je 3 Byte (24 Bit) werden zu 4 Zeichen à 6 Bit. Die Daten wachsen dadurch um etwa ein Drittel (Faktor 4/3).</p>
        <p>Bleiben am Ende 1 oder 2 Byte übrig, wird mit „=“ auf ein Vielfaches von 4 Zeichen aufgefüllt. <strong>Base64url</strong> ersetzt <code>+</code> und <code>/</code> durch <code>-</code> und <code>_</code>, damit das Ergebnis in URLs und Dateinamen funktioniert (z. B. bei JWT, dort meist ohne Padding).</p>
        <p>Text wird vorher als <strong>UTF-8</strong> in Bytes umgewandelt – deshalb funktionieren hier auch Umlaute und Emojis (das eingebaute <code>btoa()</code> kann das nicht).</p>`)}
    `),
    '<div id="out"></div>'
  );
  const $ = (s) => container.querySelector(s);
  live(container, {
    output: '#out',
    defaults,
    examples,
    compute: (v) => {
      limitLength(v.text, 7000000, 'Eingabe');
      if (v.dir === 'encode') {
        const bytes = utf8Encode(v.text);
        const out = encodeBytes(bytes, { urlSafe: v.urlSafe, padding: v.padding });
        lastBytes = null;
        return panel('Ergebnis', `
          ${resultList([
            { label: v.urlSafe ? 'Base64url' : 'Base64', value: out || '(leer)', strong: true, copy: Boolean(out) },
            { label: 'Größe', value: `${byteText(bytes.length)} → ${plural(out.length, 'Zeichen', 'Zeichen')}${bytes.length ? ` (+${Math.round((out.length / bytes.length - 1) * 100)} %)` : ''}`, copy: false }
          ])}
          ${steps([
            `Text als UTF-8: ${plural(bytes.length, 'Byte', 'Byte')}${bytes.length ? ` (${bytesToHex(bytes, 24)})` : ''}`,
            `In Gruppen zu 3 Byte = 24 Bit: ${nf(Math.floor(bytes.length / 3))} volle Gruppe(n), Rest ${bytes.length % 3} Byte`,
            `Je 6 Bit → ein Zeichen: ${nf(encodedLength(bytes.length, false))} Zeichen${v.padding && bytes.length % 3 ? ` + ${3 - (bytes.length % 3)} × „=“` : ''}`,
            `Erwartete Länge mit Padding: 4 × ⌈${nf(bytes.length)} / 3⌉ = ${nf(encodedLength(bytes.length))} Zeichen`
          ])}
        `);
      }
      const { bytes, variant, padded, warnings } = decodeToBytes(v.text);
      lastBytes = bytes;
      const utf = utf8Decode(bytes);
      const type = sniffType(bytes);
      fileName = `decodiert.${type?.ext ?? 'bin'}`;
      return panel('Ergebnis', `
        ${warnings.map((w) => notice(w, 'info')).join('')}
        ${resultList([
          utf.ok ? { label: 'Text (UTF-8)', value: utf.text, strong: true } : null,
          { label: 'Variante', value: `${variant}${padded ? ' mit Padding' : ''}`, copy: false, mono: false },
          { label: 'Größe', value: `${plural(v.text.replace(/\s/g, '').length, 'Zeichen', 'Zeichen')} → ${byteText(bytes.length)}`, copy: false },
          { label: 'Bytes (Hex)', value: bytesToHex(bytes, 48) || '–', copy: false },
          type ? { label: 'Erkannt (Signatur)', value: `${type.mime} – nur ein Hinweis anhand der ersten Bytes`, copy: false, mono: false } : null
        ])}
        ${utf.ok ? '' : notice('Die Bytes sind kein gültiger UTF-8-Text (vermutlich Binärdaten wie ein Bild). Lade sie als Datei herunter.', 'warning')}
        <button type="button" class="btn btn-sm" id="b64-download" data-no-live>Bytes als Datei herunterladen (${esc(fileName)})</button>
      `);
    }
  });
  $('#out').addEventListener('click', (event) => {
    if (!event.target.closest('#b64-download') || !lastBytes) return;
    const blobUrl = URL.createObjectURL(new Blob([lastBytes], { type: 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    const t = window.setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
      timers.delete(t);
    }, 2000);
    timers.add(t);
  });
  $('#b64-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    const out = $('#b64-file-out');
    if (!file) {
      out.innerHTML = '';
      return;
    }
    if (file.size > FILE_LIMIT) {
      out.innerHTML = notice(`Die Datei ist ${byteText(file.size)} groß – höchstens 5 MiB.`, 'error');
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const v = { urlSafe: $('#urlSafe').checked, padding: $('#padding').checked };
    const encoded = encodeBytes(bytes, v);
    const shown = encoded.length > 100000 ? `${encoded.slice(0, 100000)} … (Anzeige gekürzt)` : encoded;
    out.innerHTML = `${resultList([
      { label: 'Datei', value: `${file.name} · ${file.type || 'Typ unbekannt'}`, copy: false, mono: false },
      { label: 'Größe', value: `${byteText(bytes.length)} → ${plural(encoded.length, 'Zeichen', 'Zeichen')} (Faktor ${(bytes.length ? encoded.length / bytes.length : 0).toLocaleString('de-DE', { maximumFractionDigits: 3 })})`, copy: false },
      { label: 'Data-URL', value: `data:${file.type || 'application/octet-stream'};base64,…`, copy: false }
    ])}<div class="row-between web-out-head"><strong class="small">Base64</strong>${copyButton(encoded, 'Base64 kopieren')}</div><pre class="mono-block mono-wrap web-pre web-pre-short">${esc(shown)}</pre>`;
  });
  return () => timers.forEach((t) => window.clearTimeout(t));
}

/* ================================================================ Zeitstempel */

function timeZones() {
  try {
    if (typeof Intl.supportedValuesOf === 'function') return ['UTC', ...Intl.supportedValuesOf('timeZone').filter((z) => z !== 'UTC')];
  } catch {
    /* ältere Browser */
  }
  return ['UTC', 'Europe/Berlin', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Asia/Kolkata', 'Australia/Sydney'];
}

function zeitstempel(container) {
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const zones = timeZones();
  const defaults1 = { ts: '1700000000', unit: 'auto', tz: 'America/New_York' };
  const examples1 = [
    { label: '1700000000', values: { ts: '1700000000' } },
    { label: 'Millisekunden', values: { ts: '1700000000123' } },
    { label: 'Jahr-2038-Grenze', values: { ts: String(INT32_MAX), tz: 'UTC' } },
    { label: 'negativ (vor 1970)', values: { ts: '-14182940', tz: 'America/New_York' } }
  ];
  const defaults2 = { dmode: 'iso', iso: '2026-10-25T02:30', date: '2026-03-29', time: '02:30', ztz: 'Europe/Berlin' };
  const examples2 = [
    { label: 'ISO mit Z', values: { dmode: 'iso', iso: '2026-10-23T14:30:00Z' } },
    { label: 'ISO mit Versatz', values: { dmode: 'iso', iso: '2026-10-23T14:30:00+02:00' } },
    { label: 'doppelte Stunde', values: { dmode: 'iso', iso: '2026-10-25T02:30', ztz: 'Europe/Berlin' } },
    { label: 'Sommerzeit-Lücke', values: { dmode: 'fields', date: '2026-03-29', time: '02:30', ztz: 'Europe/Berlin' } }
  ];
  const zoneList = `<datalist id="web-tz-list">${zones.map((z) => `<option value="${esc(z)}"></option>`).join('')}</datalist>`;
  container.innerHTML = `${zoneList}
    <div id="ts-a">${layout(
      panel('Zeitstempel → Datum', `
        <div class="form-row">
          ${field({ id: 'ts', label: 'Unix-Zeitstempel', value: defaults1.ts, mono: true, attrs: 'inputmode="numeric"' })}
          ${field({ id: 'unit', label: 'Einheit', value: defaults1.unit, options: [['auto', 'automatisch erkennen'], ['s', 'Sekunden'], ['ms', 'Millisekunden'], ['us', 'Mikrosekunden'], ['ns', 'Nanosekunden']] })}
        </div>
        ${field({ id: 'tz', label: 'Zusätzliche Zeitzone (IANA)', value: defaults1.tz, attrs: 'list="web-tz-list"', hint: `Deine lokale Zeitzone: ${localTz}` })}
        ${toolActions({ examples: examples1, extra: '<button type="button" class="btn btn-sm btn-primary" data-now>Jetzt</button>' })}
      `),
      '<div id="out-a"></div>'
    )}</div>
    <div id="ts-b" class="mt-2">${layout(
      panel('Datum → Zeitstempel', `
        ${segmented({ name: 'dmode', label: 'Eingabe', value: defaults2.dmode, options: [['iso', 'ISO 8601'], ['fields', 'Datum und Uhrzeit']] })}
        <div data-show="iso">${field({ id: 'iso', label: 'ISO-8601-Datum', value: defaults2.iso, mono: true, hint: 'z. B. 2026-10-23, 2026-10-23T14:30, …T14:30:00Z oder …T14:30:00+02:00' })}</div>
        <div class="form-row" data-show="fields">
          ${field({ id: 'date', label: 'Datum', value: defaults2.date, type: 'date' })}
          ${field({ id: 'time', label: 'Uhrzeit', value: defaults2.time, type: 'time', attrs: 'step="1"' })}
        </div>
        ${field({ id: 'ztz', label: 'Zeitzone der Eingabe (ohne Versatzangabe)', value: defaults2.ztz, attrs: 'list="web-tz-list"' })}
        ${toolActions({ examples: examples2, extra: '<button type="button" class="btn btn-sm btn-primary" data-now2>Jetzt</button>' })}
      `),
      '<div id="out-b"></div>'
    )}</div>
    ${explanation(`
      <p><strong>Unix-Zeit</strong> zählt die Sekunden seit dem 1. Januar 1970, 00:00:00 UTC („Epoche“). Sie ist unabhängig von Zeitzonen – erst bei der Anzeige wird in eine Zone umgerechnet. JavaScript und viele APIs nutzen <strong>Millisekunden</strong>; die Erkennung schätzt die Einheit anhand der Größenordnung (Sekundenwerte bis ca. 10<sup>11</sup> reichen bis ins Jahr 5138).</p>
      <p><strong>Schaltsekunden</strong> ignoriert die Unix-Zeit: Jeder Tag hat genau 86 400 Sekunden. Eine eingeschobene Schaltsekunde (z. B. 2016-12-31T23:59:60Z) lässt sich nicht darstellen – Systeme wiederholen oder „verschmieren“ (smearing) dann eine Sekunde.</p>
      <p><strong>Jahr-2038-Problem:</strong> Als 32-Bit-Ganzzahl mit Vorzeichen gespeichert, ist 2 147 483 647 der größte Wert – das ist 2038-01-19T03:14:07Z. Eine Sekunde später läuft der Zähler über und springt auf 1901-12-13T20:45:52Z. 64-Bit-Zeitstempel haben das Problem nicht.</p>
      <p><strong>Formate:</strong> ISO 8601 (<code>2026-10-23T14:30:00+02:00</code>), RFC 2822 (E-Mail-Header) und das HTTP-Datum (RFC 9110, immer GMT). Zeitzonen und Sommerzeitregeln stammen aus der IANA-Zeitzonendatenbank deines Browsers.</p>`)}`;
  const rootA = container.querySelector('#ts-a');
  const rootB = container.querySelector('#ts-b');

  const a = live(rootA, {
    output: '#out-a',
    defaults: defaults1,
    examples: examples1,
    compute: (v) => {
      if (!v.ts.trim()) return panel('Ergebnis', notice('Bitte einen Zeitstempel eingeben oder „Jetzt“ wählen.', 'info'));
      const p = parseTimestamp(v.ts, v.unit);
      const tz = v.tz.trim() || 'UTC';
      const local = describeInstant(p.ms, localTz);
      const zone = describeInstant(p.ms, tz);
      const info = epochInfo(p.ms);
      return panel('Ergebnis', `
        ${p.auto ? notice(`Erkannt als <strong>${esc(p.unitLabel)}</strong> (anhand der Größenordnung). Falls das nicht stimmt, wähle die Einheit oben aus.`, 'info', { html: true }) : ''}
        ${p.subMs ? notice('Anteile unter einer Millisekunde werden bei der Anzeige abgeschnitten.', 'info') : ''}
        ${resultList([
          { label: 'UTC (ISO 8601)', value: isoUtc(p.ms), strong: true },
          { label: `Lokal (${localTz})`, value: local.iso },
          { label: `${tz}`, value: zone.iso },
          { label: 'Lesbar', value: zone.readable, mono: false },
          { label: 'Wochentag', value: `${zone.weekday}, KW ${zone.isoWeek.week}/${zone.isoWeek.year}, Tag ${zone.dayOfYear} des Jahres`, mono: false, copy: false },
          { label: 'RFC 2822', value: zone.rfc2822 },
          { label: 'HTTP-Datum', value: httpDate(p.ms) },
          { label: 'Relativ', value: relativeTime(p.ms, Date.now()), mono: false, copy: false },
          { label: 'Sekunden', value: String(info.seconds) },
          { label: 'Millisekunden', value: String(p.ms) }
        ])}
        ${info.int32 ? '' : notice(`Dieser Zeitpunkt passt nicht in eine 32-Bit-Ganzzahl mit Vorzeichen (−2 147 483 648 bis 2 147 483 647 s) – betroffen vom Jahr-2038-Problem.`, 'warning')}
        ${info.seconds === INT32_MAX ? notice('Genau der größte 32-Bit-Wert: Eine Sekunde später würde ein 32-Bit-Zähler überlaufen.', 'warning') : ''}
        ${steps([
          `${v.ts.trim()} ${p.unitLabel} = ${nf(p.ms)} ms seit 1970-01-01T00:00:00Z`,
          `${nf(Math.floor(p.ms / 86400000))} volle Tage à 86 400 s (ohne Schaltsekunden) + ${nf(((p.ms % 86400000) + 86400000) % 86400000)} ms`,
          `Versatz ${tz}: UTC${zone.offsetText} → ${zone.iso}`
        ], { open: false })}
      `);
    }
  });
  rootA.querySelector('[data-now]').addEventListener('click', () => {
    rootA.querySelector('#ts').value = String(Math.floor(Date.now() / 1000));
    rootA.querySelector('#unit').value = 's';
    a.run();
  });

  const toggle = (mode) => rootB.querySelectorAll('[data-show]').forEach((el) => (el.hidden = el.dataset.show !== mode));
  const b = live(rootB, {
    output: '#out-b',
    defaults: defaults2,
    examples: examples2,
    compute: (v) => {
      toggle(v.dmode);
      const tz = v.ztz.trim() || 'UTC';
      let r;
      if (v.dmode === 'iso') {
        if (!v.iso.trim()) return panel('Ergebnis', notice('Bitte ein Datum eingeben.', 'info'));
        r = parseIsoDate(v.iso, tz);
      } else {
        const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.date);
        const tm = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(v.time || '00:00');
        if (!dm) return panel('Ergebnis', notice('Bitte ein Datum wählen.', 'info'));
        if (!tm) return panel('Ergebnis', notice('Bitte eine Uhrzeit wählen.', 'info'));
        r = zonedToUtc({ year: +dm[1], month: +dm[2], day: +dm[3], hour: +tm[1], minute: +tm[2], second: +(tm[3] ?? 0), millisecond: 0 }, tz);
        r.hasOffset = false;
      }
      const zone = describeInstant(r.ms, tz);
      return panel('Ergebnis', `
        ${r.hasOffset ? notice('Die Eingabe enthält einen Versatz zu UTC – die gewählte Zeitzone wird nur für die Anzeige genutzt.', 'info') : notice(`Ohne Versatzangabe wird die Eingabe als Ortszeit in ${tz} interpretiert.`, 'assumption')}
        ${r.status === 'gap' ? notice(`Diese Uhrzeit gibt es in ${tz} nicht (Zeitumstellung: Die Uhr springt vor). Gerechnet wurde mit dem Versatz vor der Umstellung; das entspricht ${zone.iso}.`, 'warning') : ''}
        ${r.status === 'ambiguous' ? notice(`Diese Uhrzeit gibt es in ${tz} zweimal (Zeitumstellung: Die Uhr wird zurückgestellt). Gezeigt wird der frühere Zeitpunkt; der spätere wäre ${isoUtc(r.alternatives[1])} = Zeitstempel ${Math.floor(r.alternatives[1] / 1000)}.`, 'warning') : ''}
        ${resultList([
          { label: 'Unix-Zeit (s)', value: String(Math.floor(r.ms / 1000)), strong: true },
          { label: 'Millisekunden', value: String(r.ms) },
          { label: 'UTC (ISO 8601)', value: isoUtc(r.ms) },
          { label: `In ${tz}`, value: zone.iso },
          { label: 'Wochentag', value: zone.weekday, mono: false, copy: false }
        ])}
      `);
    }
  });
  rootB.querySelector('[data-now2]').addEventListener('click', () => {
    const now = describeInstant(Date.now(), rootB.querySelector('#ztz').value.trim() || 'UTC');
    rootB.querySelector('#iso').value = now.iso.replace(/\.\d+/, '');
    rootB.querySelector('[name="dmode"][value="iso"]').checked = true;
    b.run();
  });
  return () => {
    a.destroy();
    b.destroy();
  };
}

/* ================================================================ Diff */

function diff(container) {
  const defaults = {
    left: 'function summe(liste) {\n  let s = 0;\n  for (let i = 0; i <= liste.length; i++) {\n    s += liste[i];\n  }\n  return s;\n}\n',
    right: 'function summe(liste) {\n  let s = 0;\n  for (let i = 0; i < liste.length; i++) {\n    s += liste[i];   \n  }\n  // Ergebnis zurückgeben\n  return s;\n}\n',
    view: 'side',
    ignoreTrailing: false,
    ignoreCase: false
  };
  const examples = [
    { label: 'Code', values: { left: defaults.left, right: defaults.right } },
    { label: 'Einkaufsliste', values: { left: 'Milch\nBrot\nÄpfel\nKäse\nButter', right: 'Milch\nbrot\nBirnen\nKäse\nButter\nEier', view: 'unified' } }
  ];
  container.innerHTML = `
    ${panel('Texte', `
      <div class="web-diff-inputs">
        ${field({ id: 'left', label: 'Original (A)', value: defaults.left, rows: 10, mono: true })}
        ${field({ id: 'right', label: 'Geändert (B)', value: defaults.right, rows: 10, mono: true })}
      </div>
      <div class="row web-diff-options">
        ${segmented({ name: 'view', label: 'Darstellung', value: defaults.view, options: [['side', 'Nebeneinander'], ['unified', 'Vereinheitlicht (unified)']] })}
        <div class="stack">
          ${checkbox({ id: 'ignoreTrailing', label: 'Leerzeichen am Zeilenende ignorieren' })}
          ${checkbox({ id: 'ignoreCase', label: 'Groß-/Kleinschreibung ignorieren' })}
        </div>
      </div>
      ${toolActions({ examples })}
      ${explanation(`
        <p>Verglichen wird <strong>zeilenweise</strong> mit dem Algorithmus von Myers (1986), den auch <code>git diff</code> standardmäßig nutzt: Er findet eine kürzeste Folge von Einfügungen und Löschungen, die A in B überführt – gleichbedeutend mit der längsten gemeinsamen Teilfolge (LCS) der Zeilen.</p>
        <p>Eine geänderte Zeile erscheint als Löschung (−) plus Einfügung (+). Das <strong>unified</strong>-Format zeigt Änderungsblöcke („Hunks“) mit je 3 Kontextzeilen; <code>@@ -1,4 +1,5 @@</code> heißt: ab Zeile 1, 4 Zeilen in A bzw. 5 Zeilen in B.</p>
        <p>Grenze: höchstens ${nf(DIFF_MAX_LINES)} Zeilen je Seite.</p>`)}
    `)}
    <div id="out" class="mt-2" aria-live="polite"></div>`;
  live(container, {
    output: '#out',
    defaults,
    examples,
    delay: 300,
    compute: (v) => {
      const r = diffText(v.left, v.right, { ignoreTrailing: v.ignoreTrailing, ignoreCase: v.ignoreCase });
      const stats = `<div class="row web-diff-stats">
        <span class="badge badge-success">+${nf(r.stats.added)} hinzugefügt</span>
        <span class="badge badge-danger">−${nf(r.stats.removed)} entfernt</span>
        <span class="badge">${nf(r.stats.unchanged)} unverändert</span>
        ${r.identical ? '<span class="badge badge-accent">Texte gleich</span>' : ''}</div>`;
      if (r.identical) return panel('Ergebnis', `${stats}${notice(v.ignoreCase || v.ignoreTrailing ? 'Keine Unterschiede (unter Berücksichtigung der gewählten Optionen).' : 'Die Texte sind zeilenweise identisch.', 'success')}`);
      const u = unifiedDiff(r, { nameA: 'A (Original)', nameB: 'B (Geändert)' });
      let body;
      if (v.view === 'unified') {
        body = `<div class="row-between web-out-head"><strong class="small">Unified-Diff</strong>${copyButton(u.text, 'Diff kopieren')}</div>
          <div class="web-diff-unified mono-block">${u.hunks
            .map((h) => `<div class="web-diff-hunk">${esc(h.header)}</div>${h.lines.map((l) => `<div class="web-diff-line ${l.sign === '+' ? 'add' : l.sign === '-' ? 'del' : ''}"><span class="web-diff-sign" aria-hidden="true">${l.sign === '-' ? '−' : esc(l.sign)}</span>${esc(l.text) || ' '}</div>`).join('')}`)
            .join('')}</div>`;
      } else {
        const rows = sideBySide(r);
        const cell = (side, cls) => (side ? `<td class="web-diff-n">${side.n}</td><td class="web-diff-t ${cls}">${esc(side.text) || ' '}</td>` : '<td class="web-diff-n"></td><td class="web-diff-t empty"></td>');
        body = `<div class="row-between web-out-head"><strong class="small">Nebeneinander</strong>${copyButton(u.text, 'Unified-Diff kopieren')}</div>
          <div class="table-wrap"><table class="web-diff-side" aria-label="Vergleich nebeneinander"><thead><tr><th colspan="2">A (Original)</th><th colspan="2">B (Geändert)</th></tr></thead><tbody>${rows
            .map((row) => `<tr class="${row.kind}">${cell(row.left, row.kind === 'equal' ? '' : 'del')}${cell(row.right, row.kind === 'equal' ? '' : 'add')}</tr>`)
            .join('')}</tbody></table></div>`;
      }
      return panel('Ergebnis', `${stats}${body}`);
    }
  });
}

/* ================================================================ UUID */

function uuid(container) {
  const defaults = { version: '4', count: '5', upper: false, hyphens: true, check: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' };
  const examples = [
    { label: 'v4 prüfen', values: { check: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' } },
    { label: 'v7 prüfen', values: { check: '017f22e2-79b0-7cc3-98c4-dc0c0c07398f' } },
    { label: 'v1 (zeitbasiert)', values: { check: 'urn:uuid:c232ab00-9414-11ec-b3c8-9f6bdeced846' } },
    { label: 'Nil-UUID', values: { check: '00000000-0000-0000-0000-000000000000' } },
    { label: 'ungültig', values: { check: '1234-5678' } }
  ];
  container.innerHTML = layout(
    panel('Erzeugen & prüfen', `
      <div class="form-row">
        ${field({ id: 'version', label: 'Version', value: defaults.version, options: [['4', 'Version 4 (zufällig)'], ['7', 'Version 7 (Zeit + Zufall, sortierbar)']] })}
        ${field({ id: 'count', label: 'Anzahl (1–100)', value: defaults.count, type: 'number', attrs: 'min="1" max="100" step="1"' })}
      </div>
      ${checkbox({ id: 'upper', label: 'Großbuchstaben' })}
      ${checkbox({ id: 'hyphens', label: 'Mit Bindestrichen', checked: true })}
      <div class="row web-uuid-actions"><button type="button" class="btn btn-primary btn-sm" id="uuid-new">Neu erzeugen</button></div>
      ${field({ id: 'check', label: 'UUID prüfen / analysieren', value: defaults.check, mono: true })}
      ${toolActions({ examples })}
      ${explanation(`
        <p>Eine <strong>UUID</strong> (RFC 9562, früher RFC 4122) ist eine 128-Bit-Kennung, geschrieben als 32 Hexziffern im Muster 8-4-4-4-12. Die erste Ziffer des dritten Blocks ist die <strong>Version</strong>, die obersten Bits der ersten Ziffer des vierten Blocks die <strong>Variante</strong> (bei RFC-UUIDs 8, 9, a oder b).</p>
        <p><strong>Version 4</strong> besteht aus 122 Zufallsbits – Kollisionen sind praktisch ausgeschlossen (erst bei rund 2,7 · 10<sup>18</sup> UUIDs liegt die Wahrscheinlichkeit einer Dopplung bei 50 %). <strong>Version 7</strong> beginnt mit dem Unix-Zeitstempel in Millisekunden (48 Bit) und ist dadurch zeitlich sortierbar – gut für Datenbank-Indizes. Achtung: v7 verrät den Erzeugungszeitpunkt.</p>
        <p>Die Zufallsbits stammen aus <code>crypto.getRandomValues</code> (kryptografisch sicherer Zufall des Browsers). Innerhalb derselben Millisekunde nutzt v7 einen Zähler (RFC 9562, Abschnitt 6.2), damit die Reihenfolge erhalten bleibt.</p>`)}
    `),
    '<div id="out"></div>'
  );
  const handle = live(container, {
    output: '#out',
    defaults,
    examples,
    compute: (v) => {
      const list = generateUuids({ version: Number(v.version), count: v.count, randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)) }).map((u) => formatUuid(u, { upper: v.upper, hyphens: v.hyphens }));
      let analysis = '';
      if (v.check.trim()) {
        try {
          const a = analyzeUuid(v.check);
          analysis = `${a.notes.map((n) => notice(n, 'info')).join('')}${resultList([
            { label: 'Kanonisch', value: a.canonical, strong: true },
            a.special ? { label: 'Besonderheit', value: a.special === 'nil' ? 'Nil-UUID (alle 128 Bit 0) – steht für „keine UUID“' : 'Max-UUID (alle 128 Bit 1, RFC 9562)', mono: false, copy: false } : null,
            a.special ? null : { label: 'Variante', value: a.variant.label, mono: false, copy: false },
            a.special ? null : { label: 'Version', value: a.versionLabel, mono: false, copy: false },
            a.timestampMs !== null && a.timestampMs !== undefined ? { label: 'Zeitstempel', value: `${new Date(a.timestampMs).toISOString()} (aus der UUID gelesen)` } : null,
            a.randomBits ? { label: 'Zufallsbits', value: '122', copy: false } : null
          ])}`;
        } catch (error) {
          analysis = notice(error.message, 'error');
        }
      }
      return `${panel(`Erzeugt: ${list.length} × Version ${v.version}`, `
        <div class="row-between web-out-head"><span class="small subtle">Jede Zeile eine UUID</span>${copyButton(list.join('\n'), 'Alle kopieren')}</div>
        <pre class="mono-block web-pre web-uuid-list">${esc(list.join('\n'))}</pre>`)}
        ${panel('Analyse', analysis || '<p class="small subtle">Gib oben eine UUID ein.</p>', { className: 'mt-2' })}`;
    }
  });
  container.querySelector('#uuid-new').addEventListener('click', () => {
    handle.run();
  });
}

/* ================================================================ HTTP-Statuscodes */

function httpStatus(container) {
  container.innerHTML = `${panel('Suche', `
    <div class="form-row">
      ${field({ id: 'q', label: 'Code oder Stichwort', value: '', attrs: 'placeholder="z. B. 404, 4xx, umleitung, cache"' })}
      ${field({ id: 'cls', label: 'Klasse', value: '0', options: [['0', 'Alle Klassen'], ...Object.entries(HTTP_CLASSES)] })}
    </div>
    ${toolActions({ examples: [{ label: '404' }, { label: 'Umleitungen' }, { label: '418' }] })}
    ${explanation(`
      <p>Der <strong>Statuscode</strong> steht in der ersten Zeile jeder HTTP-Antwort. Die erste Ziffer bestimmt die Klasse: 1xx Information, 2xx Erfolg, 3xx Umleitung, 4xx Fehler des Clients (Anfrage falsch), 5xx Fehler des Servers.</p>
      <p>Clients müssen unbekannte Codes wie den Basiscode ihrer Klasse behandeln (z. B. 499 wie 400). Grundlage ist RFC 9110 (HTTP-Semantik, 2022), ergänzt um Codes aus weiteren RFCs.</p>
      <p><strong>401 vs. 403:</strong> 401 heißt „nicht angemeldet“, 403 „angemeldet (oder egal), aber nicht berechtigt“. <strong>301/302 vs. 307/308:</strong> Nur bei 307/308 bleibt die Methode garantiert erhalten.</p>`)}
  `)}<div id="out" class="mt-2" aria-live="polite"></div>`;
  const examples = [{ values: { q: '404', cls: '0' } }, { values: { q: '', cls: '3' } }, { values: { q: '418', cls: '0' } }];
  live(container, {
    output: '#out',
    defaults: { q: '', cls: '0' },
    examples,
    compute: (v) => {
      limitLength(v.q, 100, 'Suchbegriff');
      const list = searchStatus(v.q, v.cls);
      if (!list.length) return panel('Treffer', notice('Kein Statuscode gefunden. Versuche es mit einer Zahl (z. B. 50) oder einem Stichwort.', 'info'));
      return panel(`${list.length} Statuscode${list.length === 1 ? '' : 's'}`, `<ul class="web-status-list">${list
        .map(
          (s) => `<li class="web-status web-status-${Math.floor(s.code / 100)}">
            <div class="web-status-head"><span class="web-status-code mono">${s.code}</span><strong>${esc(s.name)}</strong>${s.joke ? ' <span class="badge badge-warning">Scherz-Code</span>' : ''}<span class="tiny faint web-status-ref">${esc(s.ref)}</span></div>
            <div class="small"><strong>${esc(s.de)}</strong> – ${esc(s.use)}</div>
          </li>`
        )
        .join('')}</ul>`);
    }
  });
}

/* ================================================================ MIME-Typen */

function mimeTypen(container) {
  container.innerHTML = `${panel('Suche', `
    ${field({ id: 'q', label: 'Dateiendung oder MIME-Typ', value: '', attrs: 'placeholder="z. B. .png, docx, image/svg+xml, text/html; charset=utf-8"' })}
    ${toolActions({ examples: [{ label: '.pdf' }, { label: 'image/' }, { label: 'text/html; charset=utf-8' }, { label: 'docx' }] })}
    ${notice('Die Endung allein beweist nichts: Welcher Typ gilt, entscheidet beim Abruf der <strong>Content-Type-Header</strong> des Servers – und was wirklich in der Datei steckt, zeigt erst ihr Inhalt (z. B. die „magischen Bytes“ am Anfang). Eine „bild.png“ kann auch ein umbenanntes Programm sein.', 'warning', { html: true })}
    ${explanation(`
      <p>Ein <strong>MIME-Typ</strong> (Medientyp, RFC 6838) hat die Form <code>typ/untertyp</code>, z. B. <code>image/png</code>. Obertypen: text, image, audio, video, font, application, message, multipart, model.</p>
      <p>Untertypen mit <code>vnd.</code> sind herstellerspezifisch, <code>x-</code> kennzeichnet nicht registrierte Typen; ein Suffix wie <code>+xml</code> oder <code>+json</code> nennt das zugrunde liegende Format.</p>
      <p><strong>Parameter:</strong> Bei Text-Typen gibt <code>charset</code> die Zeichencodierung an, z. B. <code>text/html; charset=utf-8</code>. Fehlt er, raten Browser – das führt zu kaputten Umlauten. Für <code>application/json</code> ist kein charset definiert (JSON ist immer UTF-8).</p>
      <p>Mit dem Header <code>X-Content-Type-Options: nosniff</code> verbietet der Server dem Browser, den Typ selbst zu raten (MIME-Sniffing).</p>`)}
  `)}<div id="out" class="mt-2" aria-live="polite"></div>`;
  live(container, {
    output: '#out',
    defaults: { q: '' },
    examples: [{ values: { q: '.pdf' } }, { values: { q: 'image/' } }, { values: { q: 'text/html; charset=utf-8' } }, { values: { q: 'docx' } }],
    compute: (v) => {
      limitLength(v.q, 200, 'Suchbegriff');
      const list = searchMime(v.q);
      const ct = v.q.includes('/') ? parseContentType(v.q) : null;
      const ctHtml = ct
        ? panel('Content-Type zerlegt', resultList([
            { label: 'Obertyp', value: ct.type },
            { label: 'Untertyp', value: ct.subtype },
            { label: 'Baum', value: ct.tree, mono: false, copy: false },
            ct.suffix ? { label: 'Suffix', value: `+${ct.suffix} (Format: ${ct.suffix.toUpperCase()})`, copy: false } : null,
            ...ct.params.map((p) => ({ label: `Parameter ${p.name}`, value: p.value || '(ohne Wert)' }))
          ]))
        : '';
      const rows = list.map((m) => [
        m.ext.map((e) => `.${e}`).join(' '),
        { html: `<span class="web-mime-type">${esc(m.type)}</span>${m.charset ? ' <span class="tiny faint">+ charset</span>' : ''}` },
        { html: `<span class="web-mime-desc">${esc(m.desc)}${m.note ? `<br><span class="tiny faint">${esc(m.note)}</span>` : ''}</span>` }
      ]);
      return `${ctHtml}${panel(`${list.length} von ${MIME_TYPES.length} Einträgen`, list.length ? table(['Endung', 'MIME-Typ', 'Beschreibung'], rows, { className: 'web-mime-table' }) : notice('Nichts gefunden. Unbekannte Binärdaten liefern Server üblicherweise als application/octet-stream aus.', 'info'), { className: ct ? 'mt-2' : '' })}`;
    }
  });
}

const TOOLS = {
  json,
  url,
  base64,
  zeitstempel,
  diff,
  uuid,
  'http-status': httpStatus,
  'mime-typen': mimeTypen
};

export function render(toolId, container, ctx) {
  const tool = TOOLS[toolId];
  if (!tool) throw new Error(`Unbekanntes Werkzeug: ${toolId}`);
  return tool(container, ctx);
}

