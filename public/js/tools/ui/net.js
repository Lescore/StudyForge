/**
 * Werkzeuge „Netzwerktechnik“: IPv6, OSI/TCP-IP, TCP-Handshake, DNS, Routing,
 * Ports, Durchsatz, IPv4-Header, Topologie.
 * Rechenlogik in ../core/net-*.js (ohne DOM, getestet); hier nur Oberfläche.
 * Alle Simulationen laufen nur im Browser – es werden keine Pakete gesendet,
 * keine DNS-Anfragen gestellt und keine Netzwerkeinstellungen verändert.
 */
import { esc, toast, field, checkbox, segmented, resultList, steps, notice, explanation, toolActions, panel, layout, writeForm, live, createStepper, table, limitLength } from '../kit.js';
import { confirmDialog } from '../../ui.js';
import { state, saveSettings } from '../../store.js';
import { fmt, mul, div, rat, InputError } from '../core/num.js';
import { RATE_UNITS, SIZE_UNITS, formatSize, formatDuration } from '../core/units.js';
import { parseIPv4, formatIPv4, prefixMask, toBinary } from '../core/net-ipv4.js';
import { compressIPv6, expandIPv6, mixedIPv6, ipv6Range, classifyIPv6, interfaceId, splitIPv6, parsePrefix128, parseIPv6WithPrefix, powerOfTwoText, toWords, longestZeroRun } from '../core/net-ipv6.js';
import { normalizeRoute, lookupRoute, routeText, EXAMPLE_ROUTES } from '../core/net-routing.js';
import { parseHexBytes, decodeIPv4Header, formatHexWords, withCorrectChecksum, HEADER_EXAMPLES } from '../core/net-header.js';
import { simulateTcp, parseIsn, parseLength, randomIsn, SCENARIOS } from '../core/net-tcp.js';
import { ACTORS, RECORD_TYPES, ZONES, defaultRecords, validateRecord, createResolverState, advanceClock, flushCache, cacheEntries, resolve } from '../core/net-dns.js';
import { PORTS, RANGES, rangeOf, searchPorts, validateCustomPort, parseCustomPorts, serializeCustomPorts, MAX_CUSTOM } from '../core/net-ports.js';
import { OSI_LAYERS, TCPIP4, TCPIP5, searchProtocols, encapsulation, quizPool, checkQuiz } from '../core/net-osi.js';
import { throughputModel, L3_HEADERS, L4_HEADERS, ETH } from '../core/net-throughput.js';
import { exampleTopology, addDevice, removeDevice, addLink, removeLink, deviceLinks, ifaceName, buildModel, tracePacket, layoutTopology, DEVICE_TYPES } from '../core/net-topology.js';

const SIM_BADGE = '<span class="tool-badge-sim">Simulation</span>';
const simHead = (text) => `<div class="net-sim-head">${SIM_BADGE}<span class="small subtle">${esc(text)}</span></div>`;
const hex4 = (n) => `0x${n.toString(16).padStart(4, '0')}`;
const de = (n) => Number(n).toLocaleString('de-DE');

/** Kleine Hilfe: Debounce mit Aufräumfunktion. */
function debouncer(fn, wait = 150) {
  let timer = null;
  const run = (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
  run.cancel = () => window.clearTimeout(timer);
  return run;
}

function showError(el, error) {
  el.innerHTML = notice(error?.message || String(error), 'error');
  if (error?.name !== 'InputError') console.error(error);
}

/* ================================================================== IPv6 */
function ipv6Tool(container) {
  const defaults = { addr: '2001:db8:abcd:12::1', prefix: '56', split: '64', limit: '8' };
  const examples = [
    { label: 'RFC 5952', values: { addr: '2001:0DB8:0000:0000:0001:0000:0000:0001', prefix: '64', split: '' } },
    { label: 'Link-Local mit Zone', values: { addr: 'fe80::21a:2bff:fe3c:4d5e%eth0', prefix: '64', split: '' } },
    { label: 'IPv4-mapped', values: { addr: '::ffff:192.0.2.1', prefix: '96', split: '' } },
    { label: 'Multicast', values: { addr: 'ff02::1:ff3c:4d5e', prefix: '128', split: '' } },
    { label: 'ULA /48 in /52', values: { addr: 'fd12:3456:789a::', prefix: '48', split: '52', limit: '16' } }
  ];
  container.innerHTML = layout(
    panel('Eingabe', `
      ${field({ id: 'addr', label: 'IPv6-Adresse', value: defaults.addr, mono: true, hint: 'Kurz- oder Langform, optional mit /Präfix, eingebettetem IPv4 (::ffff:192.0.2.1) oder Zonen-Index (%eth0).' })}
      <div class="form-row">
        ${field({ id: 'prefix', label: 'Präfixlänge (/0–/128)', value: defaults.prefix, mono: true, attrs: 'inputmode="numeric"' })}
        ${field({ id: 'split', label: 'Aufteilen in /m (optional)', value: defaults.split, mono: true, attrs: 'inputmode="numeric"' })}
        ${field({ id: 'limit', label: 'Subnetze auflisten', value: defaults.limit, mono: true, attrs: 'inputmode="numeric"', hint: 'höchstens 256' })}
      </div>
      ${toolActions({ examples })}
      ${explanation(`
        <p><strong>Aufbau:</strong> 128 Bit in 8 Gruppen à 16 Bit, hexadezimal mit Doppelpunkten. Führende Nullen einer Gruppe dürfen entfallen; <em>eine</em> Folge von Nullgruppen darf durch <code>::</code> ersetzt werden.</p>
        <p><strong>RFC 5952 (kanonische Form):</strong> Kleinbuchstaben, keine führenden Nullen, <code>::</code> ersetzt die längste Folge von mindestens zwei Nullgruppen – bei Gleichstand die erste. Eine einzelne Nullgruppe bleibt <code>0</code>.</p>
        <p><strong>Präfix:</strong> Die ersten n Bit sind das Netz, der Rest adressiert Schnittstellen. Im LAN ist /64 üblich (64 Bit Interface-ID, nötig für SLAAC). IPv6 kennt keinen Broadcast – es gibt keine „Netz- und Broadcastadresse abziehen“-Regel wie bei IPv4.</p>
        <p><strong>Subnetting:</strong> Präfixe am besten auf 4-Bit-Grenzen planen (/48, /52, /56, /60, /64) – dann entspricht jede Subnetz-Hexziffer genau 4 Bit.</p>
        <p>Für IPv4 gibt es den eigenen <a href="#/werkzeuge/ipv4-subnetting">IPv4-Subnetting-Rechner</a>.</p>`)}
    `),
    '<div id="out"></div>'
  );
  live(container, {
    output: '#out',
    defaults,
    examples,
    compute: (v) => {
      limitLength(v.addr, 120, 'Adresse');
      const p = parseIPv6WithPrefix(v.addr, v.prefix);
      const { value, prefix } = p;
      const range = ipv6Range(value, prefix);
      const cls = classifyIPv6(value);
      const iid = interfaceId(value);
      const words = toWords(value);
      const run = longestZeroRun(words);
      const showMixed = p.embeddedIPv4 || ['mapped', 'nat64', 'compat'].includes(cls.primary.id);
      const rows = [
        { label: 'Kanonisch (RFC 5952)', value: compressIPv6(value), strong: true },
        { label: 'Ausgeschrieben', value: expandIPv6(value) },
        showMixed ? { label: 'Gemischte Schreibweise', value: mixedIPv6(value) } : null,
        p.zone ? { label: 'Zonen-Index', value: `%${p.zone} (abgetrennt; nur lokal auf diesem Host gültig)`, copyText: p.zone } : null,
        { label: 'Adresstyp', value: cls.primary.name, mono: false, strong: true },
        { label: 'Netz (Präfix)', value: `${compressIPv6(range.network)}/${prefix}` },
        { label: 'Erste Adresse', value: compressIPv6(range.network) },
        { label: 'Letzte Adresse', value: compressIPv6(range.last) },
        { label: 'Anzahl Adressen', value: powerOfTwoText(range.hostBits), copyText: range.count.toString() },
        prefix === 64
          ? { label: 'Netzwerkpräfix | Interface-ID', value: `${compressIPv6(range.network)}/64 | ${iid.text}`, copyText: iid.text }
          : { label: 'Interface-ID (untere 64 Bit)', value: `${iid.text}${prefix > 64 ? ' – Präfix länger als /64: Teile davon gehören zum Netz' : ''}`, copyText: iid.text },
        iid.eui64 ? { label: 'EUI-64 erkannt', value: `ff:fe in der Mitte → MAC ${iid.mac} (7. Bit invertiert)`, copyText: iid.mac } : null
      ];
      const groupHtml = words
        .map((w, i) => {
          const start = i * 16;
          const cls2 = start + 16 <= prefix ? 'net' : start >= prefix ? 'host' : 'split';
          return `<span class="net-v6-g ${cls2}">${w.toString(16).padStart(4, '0')}</span>`;
        })
        .join('<span class="net-v6-sep">:</span>');
      let splitInfo = '';
      if (prefix % 16 !== 0 && prefix > 0 && prefix < 128) {
        const g = Math.floor(prefix / 16);
        const bits = words[g].toString(2).padStart(16, '0');
        const k = prefix - g * 16;
        splitInfo = `<p class="small mt-1 mb-0">Gruppe ${g + 1} binär: <span class="mono"><span class="net-bits-net">${bits.slice(0, k).replace(/(.{4})(?=.)/g, '$1 ')}</span>|<span class="net-bits-host">${bits.slice(k).replace(/(.{4})(?=.)/g, '$1 ')}</span></span> (${k} Netzbits, ${16 - k} Hostbits)</p>`;
      }
      const typeTable = table(
        ['Bereich', 'Bedeutung', 'Scope'],
        cls.all.length
          ? cls.all.map((t) => [`${compressIPv6(t.net)}/${t.prefix}`, { html: `<strong>${esc(t.name)}</strong><br><span class="small subtle">${esc(t.desc)}</span>` }, t.scope])
          : [['–', { html: `<strong>${esc(cls.primary.name)}</strong><br><span class="small subtle">${esc(cls.primary.desc)}</span>` }, '–']]
      );
      const details = cls.details.length ? resultList(cls.details.map((d) => ({ label: d.label, value: d.value, mono: false, copy: false }))) : '';
      const zeroText = run.start < 0
        ? 'Keine Folge von mindestens zwei Nullgruppen → kein „::“.'
        : `Längste Nullfolge: Gruppen ${run.start + 1}–${run.start + run.len} (${run.len} Gruppen) → durch „::“ ersetzt.`;
      let subnetHtml = '';
      if (String(v.split ?? '').trim()) {
        const m = parsePrefix128(v.split, 'Aufteilen in /m');
        const limitRaw = String(v.limit ?? '').trim() || '8';
        if (!/^\d{1,3}$/.test(limitRaw) || Number(limitRaw) < 1 || Number(limitRaw) > 256) throw new InputError('Subnetze auflisten: 1 bis 256.');
        const s = splitIPv6(value, prefix, m, Number(limitRaw));
        const rowsS = s.list.map((x) => [x.index.toString(), `${compressIPv6(x.network)}/${m}`, compressIPv6(x.last)]);
        if (s.truncated) {
          rowsS.push([{ html: '<span class="faint">…</span>' }, { html: '<span class="faint">…</span>' }, '']);
          rowsS.push([(s.count - 1n).toString(), `${compressIPv6(s.lastNet)}/${m}`, compressIPv6(s.lastLast)]);
        }
        subnetHtml = panel(`Aufteilung /${prefix} → /${m}`, `
          ${resultList([
            { label: 'Anzahl Subnetze', value: powerOfTwoText(m - prefix), copyText: s.count.toString(), strong: true },
            { label: 'Adressen je Subnetz', value: powerOfTwoText(128 - m), copyText: (1n << BigInt(128 - m)).toString() }
          ])}
          ${steps(s.explain, { title: 'Bits und Hex-Grenzen' })}
          <div class="mt-1">${table(['Nr.', 'Subnetz', 'Letzte Adresse'], rowsS)}</div>
          ${s.truncated ? `<p class="hint">Gezeigt: die ersten ${s.list.length} und das letzte Subnetz.</p>` : ''}
        `);
      }
      return `${panel('Ergebnis', `
        ${resultList(rows)}
        ${range.hostBitsSet ? notice(`Die eingegebene Adresse hat Bits hinter /${prefix} gesetzt – sie ist eine Adresse <em>im</em> Netz ${esc(compressIPv6(range.network))}/${prefix}, nicht die Netzadresse.`, 'info', { html: true }) : ''}
        <h3 class="net-sub">Präfixgrenze</h3>
        <div class="net-v6-groups mono" aria-label="Gruppen: Netzanteil hervorgehoben">${groupHtml}</div>
        <p class="tiny subtle mt-1 mb-0"><span class="net-legend net">Netzanteil</span> <span class="net-legend split">geteilte Gruppe</span> <span class="net-legend host">Interface-/Hostanteil</span></p>
        ${splitInfo}
        ${steps([
          `Ausschreiben: ${expandIPv6(value)} (fehlende Nullgruppen für „::“ ergänzt, jede Gruppe auf 4 Hexziffern)`,
          'Führende Nullen je Gruppe streichen, Kleinbuchstaben verwenden.',
          zeroText,
          `Netzadresse: die ersten ${prefix} Bit übernehmen, die übrigen ${range.hostBits} Bit auf 0 → ${compressIPv6(range.network)}`,
          `Letzte Adresse: die ${range.hostBits} Hostbits auf 1 → ${compressIPv6(range.last)}`,
          `Anzahl: 2^(128 − ${prefix}) = ${powerOfTwoText(range.hostBits)}`
        ])}
        <h3 class="net-sub">Adresstyp</h3>
        ${typeTable}
        ${details}
      `)}${subnetHtml}`;
    }
  });
}

/* ================================================================== OSI */
function osiTool(container) {
  const cleanups = [];
  container.innerHTML = `
    ${panel('Schichtenmodelle', `
      ${segmented({ name: 'osi-model', label: 'TCP/IP-Modell daneben', value: '4', options: [['4', '4 Schichten (RFC 1122)'], ['5', '5 Schichten (Lehrbuch)']] })}
      <div id="osi-table"></div>
    `)}
    ${panel('Protokolle zuordnen', `
      ${field({ id: 'osi-q', label: 'Protokoll suchen (Name oder Schichtnummer 1–7)', value: '', attrs: 'placeholder="z. B. TLS, ARP, 4" data-no-live' })}
      <div id="osi-proto" class="net-proto-scroll"></div>
    `)}
    ${panel('Kapselung Schritt für Schritt', `
      ${simHead('Schematische Darstellung – es wird nichts gesendet.')}
      <div class="form-row net-encap-form">
        ${field({ id: 'enc-payload', label: 'Nutzdaten (Byte)', value: '100', mono: true, attrs: 'inputmode="numeric"' })}
        ${field({ id: 'enc-l4', label: 'Transport', value: 'tcp', options: [['tcp', 'TCP'], ['udp', 'UDP']] })}
        ${field({ id: 'enc-l3', label: 'Vermittlung', value: 'ipv4', options: [['ipv4', 'IPv4'], ['ipv6', 'IPv6']] })}
      </div>
      <div id="enc-error"></div>
      <div id="enc-stepper"></div>
      <div id="enc-view" aria-live="polite"></div>
    `)}
    ${panel('Übung: Protokoll der Schicht zuordnen', `
      <div id="osi-quiz"></div>
    `)}
    ${explanation(`
      <p><strong>OSI-Modell</strong> (ISO/IEC 7498-1): Referenzmodell mit 7 Schichten. Jede Schicht nutzt die Dienste der darunterliegenden und bietet der darüberliegenden Dienste an.</p>
      <p><strong>TCP/IP-Modell:</strong> Das Internet folgt praktisch dem TCP/IP-Modell. RFC 1122 beschreibt 4 Schichten (Link, Internet, Transport, Application); viele Lehrbücher teilen die unterste in Sicherung und Bitübertragung (5 Schichten).</p>
      <p><strong>Kapselung:</strong> Beim Senden fügt jede Schicht ihren Header (bei Ethernet zusätzlich einen Trailer, die FCS) hinzu; die PDU der oberen Schicht wird zur Nutzlast der unteren. Beim Empfang wird in umgekehrter Reihenfolge ausgepackt.</p>
      <p>Merksatz (von 7 nach 1): „<em>Alle Deutschen Studenten Trinken Verschiedene Sorten Bier</em>“ – Application, Presentation, Session, Transport, Network, Data Link, Physical.</p>`)}
  `;

  // Schichtentabelle
  const tableEl = container.querySelector('#osi-table');
  const drawTable = (mode) => {
    const model = mode === '5' ? TCPIP5 : TCPIP4;
    const rows = OSI_LAYERS.map((l) => {
      const group = model.find((g) => g.osi[0] === l.n);
      const tcpCell = group ? `<td rowspan="${group.osi.length}" class="net-osi-tcp">${esc(group.name)}</td>` : '';
      return `<tr class="net-osi-l${l.n}"><td class="mono">${l.n}</td><td><strong>${esc(l.de)}</strong><br><span class="small subtle">${esc(l.name)}</span></td><td>${esc(l.pdu)}</td><td class="net-osi-task">${esc(l.task)}</td><td class="small">${esc(l.devices)}</td>${tcpCell}</tr>`;
    }).join('');
    tableEl.innerHTML = `<div class="table-wrap"><table class="data tool-table net-osi-table"><thead><tr><th>Nr.</th><th>OSI-Schicht</th><th>PDU</th><th>Aufgabe</th><th>Geräte</th><th>TCP/IP (${mode})</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  };
  container.querySelectorAll('input[name="osi-model"]').forEach((el) => el.addEventListener('change', () => drawTable(el.value)));
  drawTable('4');

  // Protokollsuche
  const protoEl = container.querySelector('#osi-proto');
  const drawProto = () => {
    const q = container.querySelector('#osi-q').value;
    const list = searchProtocols(limitLength(q, 60, 'Suche'));
    protoEl.innerHTML = list.length
      ? table(['Protokoll', 'OSI', 'TCP/IP', 'Hinweis'], list.map((p) => [
          { html: `<strong>${esc(p.name)}</strong><br><span class="small subtle">${esc(p.full)}</span>` },
          p.osi.join(' / '),
          p.tcpip,
          { html: `${p.disputed ? `<span class="badge badge-warning">umstritten</span> <span class="small">${esc(p.disputed)}</span>` : `<span class="small">${esc(p.note ?? '')}</span>`}` }
        ]), { className: 'net-proto-table' })
      : notice(`Kein Protokoll zu „${q}“ gefunden.`, 'info');
  };
  const dp = debouncer(drawProto, 120);
  cleanups.push(dp.cancel);
  container.querySelector('#osi-q').addEventListener('input', dp);
  drawProto();

  // Kapselung
  let enc = null;
  const view = container.querySelector('#enc-view');
  const encErr = container.querySelector('#enc-error');
  const blockHtml = (b) => `<span class="net-blk net-blk-${b.kind}" style="flex-grow:${(Math.sqrt(Math.max(b.bytes, 1)) + 2).toFixed(2)}"><span>${esc(b.label)}</span><span class="tiny">${de(b.bytes)} B</span></span>`;
  const stepper = createStepper({
    count: () => enc?.steps.length ?? 1,
    label: 'Kapselung',
    interval: 1400,
    show: (i) => {
      if (!enc) {
        view.innerHTML = '';
        return;
      }
      const s = enc.steps[i];
      const layerList = OSI_LAYERS.map((l) => `<li class="${l.n === s.layer ? 'active' : ''}${(s.side === 'sender' ? l.n > s.layer : l.n < s.layer) ? ' done' : ''}"><span class="mono">${l.n}</span> ${esc(l.de)}</li>`).join('');
      view.innerHTML = `
        <div class="net-encap">
          <ol class="net-encap-layers" aria-label="Schichten">${layerList}</ol>
          <div class="net-encap-main">
            <p class="net-encap-title"><span class="badge ${s.side === 'sender' ? 'badge-accent' : 'badge-info'}">${s.side === 'sender' ? 'Sender: Kapselung ↓' : 'Empfänger: Entkapselung ↑'}</span> <strong>${esc(s.title)}</strong></p>
            <p class="small">PDU: <strong>${esc(s.pdu)}</strong></p>
            <div class="net-blocks" role="img" aria-label="${esc(s.blocks.map((b) => `${b.label} ${b.bytes} Byte`).join(', '))}">${s.blocks.map(blockHtml).join('')}</div>
            <p class="tiny faint mt-1 mb-0">Blockbreiten nicht maßstabsgetreu.</p>
            <p class="small mt-1">${esc(s.text)}</p>
          </div>
        </div>
        ${enc.notes.map((n) => notice(n, 'warning')).join('')}
        <p class="small subtle mb-0">Frame ${de(enc.frameLen)} Byte; auf der Leitung inkl. Präambel/SFD und Interframe Gap ${de(enc.wireBytes)} Byte-Zeiten, davon ${de(enc.wireBytes - enc.overhead)} Byte Nutzdaten.</p>`;
    }
  });
  container.querySelector('#enc-stepper').innerHTML = stepper.html;
  stepper.mount(container);
  cleanups.push(stepper.destroy);
  const rebuild = () => {
    try {
      const raw = container.querySelector('#enc-payload').value.trim();
      if (!/^\d{1,5}$/.test(raw)) throw new InputError('Nutzdaten: Bitte eine ganze Zahl von 0 bis 65 000 eingeben.');
      enc = encapsulation({ payload: Number(raw), transport: container.querySelector('#enc-l4').value, ip: container.querySelector('#enc-l3').value });
      encErr.innerHTML = '';
    } catch (error) {
      enc = null;
      showError(encErr, error);
    }
    stepper.refresh(0);
  };
  const rb = debouncer(rebuild, 200);
  cleanups.push(rb.cancel);
  container.querySelector('.net-encap-form').addEventListener('input', rb);
  container.querySelector('.net-encap-form').addEventListener('change', rebuild);
  rebuild();

  // Übung
  const quizEl = container.querySelector('#osi-quiz');
  const pool = quizPool();
  let current = null;
  let score = { right: 0, total: 0 };
  const newQuestion = () => {
    let next;
    do next = pool[Math.floor(Math.random() * pool.length)];
    while (pool.length > 1 && next === current);
    current = next;
    quizEl.innerHTML = `
      <p>Zu welcher OSI-Schicht gehört <strong>${esc(current.name)}</strong> <span class="small subtle">(${esc(current.full)})</span>?</p>
      <div class="row net-quiz-buttons" role="group" aria-label="Schicht wählen">
        ${OSI_LAYERS.slice().reverse().map((l) => `<button type="button" class="btn btn-sm" data-quiz="${l.n}">${l.n} · ${esc(l.de.replace('schicht', ''))}</button>`).join('')}
      </div>
      <div data-quiz-feedback aria-live="polite"></div>
      <div class="row mt-1"><button type="button" class="btn btn-sm btn-primary" data-quiz-next>Nächste Frage</button><span class="small subtle">Richtig: ${score.right} von ${score.total}</span></div>
      <p class="hint">Gefragt werden nur Protokolle mit eindeutiger Zuordnung; umstrittene Fälle (TLS, ARP …) stehen in der Tabelle oben.</p>`;
  };
  quizEl.addEventListener('click', (event) => {
    const pick = event.target.closest('[data-quiz]');
    if (pick && current) {
      const res = checkQuiz(current.name, pick.dataset.quiz);
      score.total += 1;
      if (res.correct) score.right += 1;
      quizEl.querySelectorAll('[data-quiz]').forEach((b) => (b.disabled = true));
      const layer = OSI_LAYERS.find((l) => l.n === res.expected[0]);
      quizEl.querySelector('[data-quiz-feedback]').innerHTML = notice(
        res.correct ? `Richtig: ${current.name} gehört zur Schicht ${layer.n} (${layer.de}).` : `Nicht ganz: ${current.name} gehört zur Schicht ${layer.n} (${layer.de}).${current.note ? ` ${current.note}.` : ''}`,
        res.correct ? 'success' : 'warning'
      );
      quizEl.querySelector('.row.mt-1 .small').textContent = `Richtig: ${score.right} von ${score.total}`;
      quizEl.querySelector('[data-quiz-next]').focus();
    }
    if (event.target.closest('[data-quiz-next]')) newQuestion();
  });
  newQuestion();
  return () => cleanups.forEach((fn) => fn());
}

/* ================================================================== TCP */
function tcpTool(container) {
  const defaults = { cisn: '1000', sisn: '5000', scenario: 'normal', cdata: '100', sdata: '200', close: true };
  const examples = [
    { label: 'Normaler Ablauf', values: {} },
    { label: 'SYN verloren', values: { scenario: 'lost-syn', cdata: '0', sdata: '0', close: false } },
    { label: 'RST', values: { scenario: 'rst' } },
    { label: 'Überlauf 2³²', values: { cisn: '4294967290', sisn: '4294967295', cdata: '10', sdata: '0' } }
  ];
  container.innerHTML = layout(
    panel('Einstellungen', `
      <div class="form-row">
        ${field({ id: 'cisn', label: 'ISN Client', value: defaults.cisn, mono: true, attrs: 'inputmode="numeric"' })}
        ${field({ id: 'sisn', label: 'ISN Server', value: defaults.sisn, mono: true, attrs: 'inputmode="numeric"' })}
      </div>
      <button type="button" class="btn btn-sm" data-random-isn>Zufällige ISNs</button>
      ${field({ id: 'scenario', label: 'Szenario', value: defaults.scenario, options: SCENARIOS })}
      <div class="form-row">
        ${field({ id: 'cdata', label: 'Daten Client → Server (Byte)', value: defaults.cdata, mono: true, attrs: 'inputmode="numeric"' })}
        ${field({ id: 'sdata', label: 'Daten Server → Client (Byte)', value: defaults.sdata, mono: true, attrs: 'inputmode="numeric"' })}
      </div>
      ${checkbox({ id: 'close', label: 'Verbindung danach abbauen (FIN/ACK beidseitig)', checked: defaults.close })}
      <div id="tcp-error"></div>
      ${toolActions({ examples })}
      ${explanation(`
        <p><strong>Drei-Wege-Handshake:</strong> SYN (Client wählt ISN x) → SYN-ACK (Server wählt ISN y, ack = x+1) → ACK (ack = y+1). Danach ESTABLISHED.</p>
        <p><strong>Regeln:</strong> SYN und FIN verbrauchen je eine Sequenznummer, Daten so viele, wie Byte gesendet werden. Die Bestätigungsnummer (ack) ist immer die <em>nächste erwartete</em> Sequenznummer. Ein reines ACK verbraucht keine Nummer. Gerechnet wird modulo 2^32.</p>
        <p><strong>Abbau:</strong> Jede Richtung wird einzeln mit FIN geschlossen und bestätigt (oft 4 Segmente). Wer aktiv schließt, wartet in TIME-WAIT 2 × MSL.</p>
        <p><strong>Vereinfachungen:</strong> keine Fenster, Optionen (MSS, SACK, Window Scale), kein Slow Start, ISNs frei wählbar (real zufällig, RFC 6528).</p>`)}
    `),
    `<div class="card tool-panel-card">
      <h2 class="tool-panel-title">Sequenzdiagramm</h2>
      ${simHead('Nichts verlässt deinen Rechner – reine Darstellung im Browser.')}
      <div id="tcp-stepper"></div>
      <div id="tcp-view"></div>
    </div>`
  );
  let events = [];
  const view = container.querySelector('#tcp-view');
  const segLabel = (e) => `${e.flags.join(', ')}${e.seq !== null && e.seq !== undefined ? ` seq=${e.seq}` : ''}${e.ack !== null && e.ack !== undefined ? ` ack=${e.ack}` : ''}${e.len ? ` len=${e.len}` : ''}`;
  const stepper = createStepper({
    count: () => events.length,
    label: 'TCP-Simulation',
    show: (i) => {
      if (!events.length) {
        view.innerHTML = '';
        return;
      }
      const cur = events[i];
      const rows = events.slice(0, i + 1).map((e, k) => {
        const current = k === i ? ' current' : '';
        if (e.kind !== 'segment') {
          return `<li class="net-seq-row event${current}"><span class="net-seq-state">${esc(e.client)}</span><span class="net-seq-event">${e.kind === 'timeout' ? '⏱ ' : ''}${esc(e.kind === 'start' ? 'Start' : e.side === 'server' ? 'Timeout (Server)' : 'Timeout (Client)')}</span><span class="net-seq-state">${esc(e.server)}</span></li>`;
        }
        return `<li class="net-seq-row from-${e.from}${e.lost ? ' lost' : ''}${current}">
          <span class="net-seq-state">${esc(e.client)}</span>
          <span class="net-seq-arrow"><span class="net-seq-label mono">${esc(segLabel(e))}${e.lost ? ' ✗ verloren' : ''}</span></span>
          <span class="net-seq-state">${esc(e.server)}</span></li>`;
      }).join('');
      view.innerHTML = `
        <div class="net-seq-head"><span>Client</span><span></span><span>Server</span></div>
        <ol class="net-seq" aria-label="Ablauf bis Schritt ${i + 1}">${rows}</ol>
        <div class="net-seq-note">
          <div class="row"><span class="badge badge-accent">Client: ${esc(cur.client)}</span><span class="badge badge-info">Server: ${esc(cur.server)}</span></div>
          <p class="small mt-1 mb-0">${esc(cur.note)}</p>
        </div>`;
    }
  });
  container.querySelector('#tcp-stepper').innerHTML = stepper.html;
  stepper.mount(container);
  const errEl = container.querySelector('#tcp-error');
  const controller = live(container.querySelector('.tool-inputs'), {
    output: errEl,
    defaults,
    examples,
    compute: (v) => {
      try {
        events = simulateTcp({
          clientIsn: parseIsn(v.cisn, 'ISN Client'),
          serverIsn: parseIsn(v.sisn, 'ISN Server'),
          scenario: v.scenario,
          clientData: parseLength(v.cdata, 'Daten Client'),
          serverData: parseLength(v.sdata, 'Daten Server'),
          close: v.close
        });
      } catch (error) {
        events = [];
        stepper.refresh(0);
        throw error;
      }
      stepper.refresh(0);
      return '';
    }
  });
  container.querySelector('[data-random-isn]').addEventListener('click', () => {
    writeForm(container, { cisn: String(randomIsn()), sisn: String(randomIsn()) });
    controller.run();
  });
  return () => {
    stepper.destroy();
    controller.destroy();
  };
}

/* ================================================================== DNS */
function dnsTool(container) {
  const records = defaultRecords();
  const resolver = createResolverState();
  let result = null;
  container.innerHTML = `
    ${layout(
      panel('Anfrage', `
        ${simHead('Keine echten DNS-Anfragen – Zonen und Server sind Beispiele.')}
        <form id="dns-form" class="stack">
          <div class="form-row">
            ${field({ id: 'dns-name', label: 'Name', value: 'www.example.com', mono: true })}
            ${field({ id: 'dns-type', label: 'Typ', value: 'A', options: RECORD_TYPES.map((t) => [t, t]) })}
          </div>
          <div class="row"><button type="submit" class="btn btn-primary">Auflösen</button>
            <button type="button" class="btn btn-sm" data-dns-q="shop.example.com|A">shop.example.com (CNAME-Kette)</button>
            <button type="button" class="btn btn-sm" data-dns-q="example.net|MX">MX example.net</button>
            <button type="button" class="btn btn-sm" data-dns-q="gibtsnicht.example.org|A">NXDOMAIN</button></div>
        </form>
        <div id="dns-error"></div>
        <h3 class="net-sub">Simulierte Uhr und Resolver-Cache</h3>
        <div class="row net-clock"><span class="mono" id="dns-now"></span>
          <button type="button" class="btn btn-sm" data-dns-adv="10">+10 s</button>
          <button type="button" class="btn btn-sm" data-dns-adv="60">+60 s</button>
          <button type="button" class="btn btn-sm" data-dns-adv="300">+5 min</button>
          <button type="button" class="btn btn-sm" data-dns-adv="3600">+1 h</button>
          <button type="button" class="btn btn-sm btn-ghost" data-dns-flush>Cache leeren</button></div>
        <div id="dns-cache"></div>
      `),
      `<div class="card tool-panel-card"><h2 class="tool-panel-title">Ablauf</h2>
        <div class="net-dns-actors" id="dns-actors"></div>
        <div id="dns-stepper"></div>
        <div id="dns-view" aria-live="polite"></div></div>`
    )}
    ${panel('Beispielzonen', `
      <p class="small subtle">Zonen ${ZONES.map((z) => `<code>${esc(z)}</code>`).join(', ')} mit Adressen aus Dokumentationsbereichen (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24, 2001:db8::/32). Eigene Einträge gelten nur bis zum Verlassen der Seite.</p>
      <div id="dns-records"></div>
      <form id="dns-add" class="net-dns-add">
        <div class="form-row">
          ${field({ id: 'rec-name', label: 'Name', value: '', mono: true, attrs: 'placeholder="test.example.com"' })}
          ${field({ id: 'rec-type', label: 'Typ', value: 'A', options: RECORD_TYPES.map((t) => [t, t]) })}
          ${field({ id: 'rec-value', label: 'Wert', value: '', mono: true, attrs: 'placeholder="192.0.2.99 / 10 mail.example.com"' })}
          ${field({ id: 'rec-ttl', label: 'TTL (s)', value: '300', mono: true, attrs: 'inputmode="numeric"' })}
        </div>
        <button type="submit" class="btn btn-sm">Eintrag hinzufügen</button>
        <div id="rec-error"></div>
      </form>
      ${explanation(`
        <p><strong>Rekursiver Resolver:</strong> Der Client fragt nur seinen Resolver (z. B. im Router oder beim Provider). Dieser fragt iterativ: Root-Server → TLD-Server → autoritativer Nameserver, und folgt dabei Verweisen (Referrals).</p>
        <p><strong>Cache und TTL:</strong> Jede Antwort darf so lange zwischengespeichert werden, wie ihre TTL angibt. Auch Delegationen (NS) und negative Antworten (NXDOMAIN, RFC 2308) werden gecacht. Eine zweite Anfrage kommt daher oft direkt aus dem Cache.</p>
        <p><strong>CNAME:</strong> Ein Alias verweist auf einen anderen Namen, der weiter aufgelöst wird – ggf. in einer anderen Zone. Neben einem CNAME dürfen keine anderen Records stehen.</p>
        <p><strong>Vereinfachungen:</strong> ein Nameserver pro Ebene, kein DNSSEC, keine Glue-Details, keine Lastverteilung zwischen Root-Servern, keine echten Server-Adressen.</p>`)}
    `)}
  `;
  const view = container.querySelector('#dns-view');
  const actorsEl = container.querySelector('#dns-actors');
  const drawActors = (from, to) => {
    actorsEl.innerHTML = Object.entries(ACTORS).map(([id, a]) => `<div class="net-actor${id === from ? ' from' : ''}${id === to ? ' to' : ''}"><strong>${esc(a.label)}</strong><span class="tiny">${esc(a.sub)}</span></div>`).join('');
  };
  const stepper = createStepper({
    count: () => result?.steps.length ?? 1,
    label: 'DNS-Auflösung',
    interval: 1100,
    show: (i) => {
      if (!result) {
        drawActors(null, null);
        view.innerHTML = '<p class="small subtle">Noch keine Anfrage. Wähle einen Namen und klicke „Auflösen“.</p>';
        return;
      }
      const s = result.steps[i];
      drawActors(s.from, s.to === s.from ? null : s.to);
      const dir = s.from === s.to ? `${ACTORS[s.from].label} (intern)` : `${ACTORS[s.from].label} → ${ACTORS[s.to].label}`;
      view.innerHTML = `
        <div class="net-dns-msg ${s.cache ? `cache-${s.cache}` : ''}">
          <div class="small subtle">${esc(dir)}${s.cache === 'hit' ? ' · <span class="badge badge-success">Cache-Treffer</span>' : s.cache === 'miss' ? ' · <span class="badge">Cache-Fehlschlag</span>' : ''}</div>
          <p class="mb-0"><strong>${esc(s.title)}</strong></p>
          <p class="small mt-1 mb-0">${esc(s.detail)}</p>
          ${s.lines?.length ? `<div class="mono-block mono-wrap mt-1">${esc(s.lines.join('\n'))}</div>` : ''}
        </div>
        <ol class="net-dns-log small">${result.steps.map((x, k) => `<li class="${k === i ? 'current' : k > i ? 'future' : ''}">${esc(x.title)}</li>`).join('')}</ol>
        <p class="small mb-0">Ergebnis: <span class="badge ${result.rcode === 'NOERROR' ? 'badge-success' : 'badge-warning'}">${esc(result.rcode)}</span> für <span class="mono">${esc(result.qname)} ${esc(result.type)}</span> zur Zeit t = ${de(result.time)} s</p>`;
    }
  });
  container.querySelector('#dns-stepper').innerHTML = stepper.html;
  stepper.mount(container);

  const drawCache = () => {
    container.querySelector('#dns-now').textContent = `t = ${de(resolver.now)} s`;
    const entries = cacheEntries(resolver);
    const kind = { answer: 'Antwort', referral: 'Delegation', negative: 'NXDOMAIN (negativ)', nodata: 'NODATA (negativ)' };
    container.querySelector('#dns-cache').innerHTML = entries.length
      ? table(['Name', 'Typ', 'Art', 'Rest-TTL'], entries.map((e) => [e.name, e.type === '*NX' ? '–' : e.type, kind[e.kind] ?? e.kind, `${de(e.remaining)} s`]))
      : '<p class="small subtle">Cache ist leer.</p>';
  };
  const drawRecords = () => {
    container.querySelector('#dns-records').innerHTML = `<div class="table-wrap"><table class="data tool-table"><thead><tr><th>Name</th><th>TTL</th><th>Typ</th><th>Wert</th><th>Aktion</th></tr></thead><tbody>${records
      .map((r, i) => `<tr><td>${esc(r.name)}</td><td>${r.ttl}</td><td>${esc(r.type)}</td><td>${esc(r.value)}</td><td>${r.builtin ? '<span class="tiny faint">Beispiel</span>' : `<span class="badge badge-accent">eigener</span> <button type="button" class="btn btn-sm btn-ghost" data-del-rec="${i}" aria-label="Eintrag ${esc(r.name)} ${esc(r.type)} entfernen">Entfernen</button>`}</td></tr>`)
      .join('')}</tbody></table></div>`;
  };
  const errEl = container.querySelector('#dns-error');
  const doResolve = () => {
    try {
      const name = limitLength(container.querySelector('#dns-name').value, 253, 'Name');
      const type = container.querySelector('#dns-type').value;
      result = { ...resolve(resolver, records, name, type), time: resolver.now };
      errEl.innerHTML = '';
    } catch (error) {
      showError(errEl, error);
      return;
    }
    stepper.refresh(0);
    drawCache();
  };
  container.querySelector('#dns-form').addEventListener('submit', (event) => {
    event.preventDefault();
    doResolve();
  });
  container.querySelectorAll('[data-dns-q]').forEach((b) => b.addEventListener('click', () => {
    const [name, type] = b.dataset.dnsQ.split('|');
    container.querySelector('#dns-name').value = name;
    container.querySelector('#dns-type').value = type;
    doResolve();
  }));
  container.querySelectorAll('[data-dns-adv]').forEach((b) => b.addEventListener('click', () => {
    advanceClock(resolver, Number(b.dataset.dnsAdv));
    drawCache();
  }));
  container.querySelector('[data-dns-flush]').addEventListener('click', () => {
    flushCache(resolver);
    drawCache();
    toast('Cache geleert (nur in der Simulation).', 'success', 1600);
  });
  container.querySelector('#dns-add').addEventListener('submit', (event) => {
    event.preventDefault();
    const box = container.querySelector('#rec-error');
    try {
      const rec = validateRecord({
        name: container.querySelector('#rec-name').value,
        type: container.querySelector('#rec-type').value,
        value: limitLength(container.querySelector('#rec-value').value, 300, 'Wert'),
        ttl: container.querySelector('#rec-ttl').value
      }, records);
      if (records.filter((r) => !r.builtin).length >= 50) throw new InputError('Höchstens 50 eigene Einträge.');
      records.push(rec);
      box.innerHTML = notice(`${rec.name} ${rec.type} ${rec.value} hinzugefügt. Achtung: Ein schon gecachter Eintrag bleibt bis zum Ablauf seiner TTL gültig – wie in echt.`, 'success');
      drawRecords();
    } catch (error) {
      showError(box, error);
    }
  });
  container.querySelector('#dns-records').addEventListener('click', (event) => {
    const b = event.target.closest('[data-del-rec]');
    if (!b) return;
    records.splice(Number(b.dataset.delRec), 1);
    drawRecords();
  });
  drawRecords();
  drawCache();
  stepper.refresh(0);
  return () => stepper.destroy();
}

/* ================================================================== Routing */
function routingTool(container) {
  let rows = EXAMPLE_ROUTES.map((r) => ({ ...r }));
  const defaultDst = '10.20.30.40';
  const dstButtons = ['10.20.30.40', '10.20.99.1', '10.1.2.3', '192.168.1.50', '203.0.113.9'];
  container.innerHTML = layout(
    panel('Routing-Tabelle', `
      ${simHead('Nur im Speicher dieser Seite – deine echte Routing-Tabelle wird nicht gelesen oder geändert.')}
      ${field({ id: 'rt-dst', label: 'Ziel-IP-Adresse', value: defaultDst, mono: true })}
      <div class="row net-dst-buttons">${dstButtons.map((d) => `<button type="button" class="btn btn-sm" data-rt-dst="${d}">${d}</button>`).join('')}</div>
      <div id="rt-editor" class="mt-1"></div>
      <div class="row mt-1">
        <button type="button" class="btn btn-sm" data-rt-add>Route hinzufügen</button>
        <button type="button" class="btn btn-sm" data-rt-example>Beispieltabelle</button>
        <button type="button" class="btn btn-sm" data-rt-nodefault>Beispiel ohne Standardroute</button>
        <button type="button" class="btn btn-sm btn-ghost" data-rt-reset>Zurücksetzen</button>
      </div>
      <p class="hint">Next Hop: IP-Adresse des nächsten Routers oder „direkt“ für direkt verbundene Netze. Standardroute: 0.0.0.0/0.</p>
      ${explanation(`
        <p><strong>Longest-Prefix-Match:</strong> Ein Router vergleicht die Ziel-IP mit jedem Eintrag (Ziel-IP UND Netzmaske = Netzadresse?). Von allen passenden Einträgen gewinnt der mit dem <em>längsten</em> Präfix – er beschreibt das Ziel am genauesten.</p>
        <p><strong>Metrik:</strong> Bei gleicher Präfixlänge entscheidet die niedrigere Metrik (Kosten). Zwischen verschiedenen Routingquellen (statisch, OSPF …) entscheidet in echten Routern zuerst die administrative Distanz – hier nicht modelliert.</p>
        <p><strong>Standardroute 0.0.0.0/0</strong> passt auf jede Adresse, hat aber das kürzeste Präfix und greift daher nur, wenn nichts anderes passt. Ohne sie und ohne passenden Eintrag ist das Ziel nicht erreichbar (ICMP Destination Unreachable).</p>`)}
    `),
    '<div id="rt-out"></div>'
  );
  const editor = container.querySelector('#rt-editor');
  const out = container.querySelector('#rt-out');
  const drawEditor = () => {
    editor.innerHTML = `<div class="table-wrap"><table class="data tool-table net-rt-edit"><thead><tr><th>#</th><th>Ziel/Präfix</th><th>Next Hop</th><th>Interface</th><th>Metrik</th><th>Aktion</th></tr></thead><tbody>${rows
      .map((r, i) => `<tr>
        <td>${i + 1}</td>
        <td><input class="input mono" data-rt="${i}" data-key="dest" value="${esc(r.dest)}" aria-label="Route ${i + 1}: Ziel/Präfix" spellcheck="false"></td>
        <td><input class="input mono" data-rt="${i}" data-key="gateway" value="${esc(r.gateway)}" aria-label="Route ${i + 1}: Next Hop" spellcheck="false"></td>
        <td><input class="input mono net-rt-short" data-rt="${i}" data-key="iface" value="${esc(r.iface)}" aria-label="Route ${i + 1}: Interface" spellcheck="false"></td>
        <td><input class="input mono net-rt-short" data-rt="${i}" data-key="metric" value="${esc(r.metric)}" aria-label="Route ${i + 1}: Metrik" inputmode="numeric"></td>
        <td><button type="button" class="btn btn-sm btn-ghost" data-rt-del="${i}" aria-label="Route ${i + 1} entfernen">✕</button></td></tr>`)
      .join('')}</tbody></table></div>`;
  };
  const compute = () => {
    try {
      const dstText = container.querySelector('#rt-dst').value;
      limitLength(dstText, 40, 'Ziel-IP');
      const dst = parseIPv4(dstText, 'Ziel-IP');
      const problems = [];
      const valid = [];
      rows.forEach((r, i) => {
        try {
          const route = normalizeRoute(r, `Zeile ${i + 1}`);
          route.row = i;
          valid.push(route);
          route.warnings.forEach((w) => problems.push({ kind: 'warning', text: `Zeile ${i + 1}: ${w}` }));
        } catch (error) {
          problems.push({ kind: 'error', text: `${error.message} – Zeile wird ignoriert.` });
        }
      });
      const res = lookupRoute(valid, dst);
      const gwText = (route) => (route.gateway === null ? 'direkt verbunden' : formatIPv4(route.gateway));
      const candRows = res.candidates.map((c) => `<tr class="${c === res.chosen ? 'highlight' : ''}">
        <td>${c.route.row + 1}</td><td>${esc(routeText(c.route))}</td><td>${esc(gwText(c.route))}</td><td>${esc(c.route.iface || '–')}</td><td>${c.route.metric}</td>
        <td>${c.matches ? '<span class="badge badge-success">passt</span>' : '<span class="badge">passt nicht</span>'}</td>
        <td class="net-rt-reason">${esc(c.matches ? c.verdict : '')}<br><span class="tiny subtle">${esc(c.reason)}</span></td></tr>`).join('');
      const chosen = res.chosen?.route;
      const summary = chosen
        ? resultList([
            { label: 'Ziel', value: formatIPv4(dst) },
            { label: 'Gewählte Route', value: `Zeile ${chosen.row + 1}: ${routeText(chosen)}`, strong: true, copyText: routeText(chosen) },
            { label: 'Next Hop', value: chosen.gateway === null ? `direkt zustellen an ${formatIPv4(dst)} (Netz direkt verbunden)` : formatIPv4(chosen.gateway), copyText: chosen.gateway === null ? formatIPv4(dst) : formatIPv4(chosen.gateway) },
            { label: 'Interface', value: chosen.iface || '–', copy: false },
            { label: 'Begründung', value: res.reason, mono: false, copy: false }
          ])
        : notice(`Ziel ${formatIPv4(dst)} nicht erreichbar. ${res.reason}`, 'error');
      const mask = chosen ? prefixMask(chosen.prefix) : 0;
      return panel('Entscheidung', `
        ${summary}
        ${problems.map((p) => notice(p.text, p.kind)).join('')}
        ${chosen ? steps([
          `Ziel binär:   ${toBinary(dst)}`,
          `Maske /${chosen.prefix}: ${toBinary(mask)}`,
          `UND-Ergebnis: ${toBinary((dst & mask) >>> 0)} = ${formatIPv4((dst & mask) >>> 0)} → stimmt mit dem Netz ${routeText(chosen)} überein.`,
          `Von ${res.candidates.filter((c) => c.matches).length} passenden Einträgen hat dieser das längste Präfix${res.candidates.filter((c) => c.matches && c.route.prefix === chosen.prefix).length > 1 ? ' und die niedrigste Metrik' : ''}.`
        ]) : ''}
        <h3 class="net-sub">Alle Einträge geprüft</h3>
        <div class="table-wrap"><table class="data tool-table"><thead><tr><th>#</th><th>Ziel</th><th>Next Hop</th><th>Interface</th><th>Metrik</th><th>Prüfung</th><th>Bewertung</th></tr></thead><tbody>${candRows || '<tr><td colspan="7">Keine gültigen Einträge.</td></tr>'}</tbody></table></div>
      `);
    } catch (error) {
      if (error?.name !== 'InputError') console.error(error);
      return notice(error.message, 'error');
    }
  };
  const run = () => {
    out.innerHTML = compute();
  };
  const schedule = debouncer(run, 150);
  editor.addEventListener('input', (event) => {
    const el = event.target.closest('[data-rt]');
    if (!el) return;
    rows[Number(el.dataset.rt)][el.dataset.key] = el.value;
    schedule();
  });
  container.querySelector('#rt-dst').addEventListener('input', schedule);
  editor.addEventListener('click', (event) => {
    const del = event.target.closest('[data-rt-del]');
    if (!del) return;
    rows.splice(Number(del.dataset.rtDel), 1);
    drawEditor();
    run();
  });
  const load = (list, dst = defaultDst) => {
    rows = list.map((r) => ({ ...r }));
    container.querySelector('#rt-dst').value = dst;
    drawEditor();
    run();
  };
  container.querySelector('[data-rt-add]').addEventListener('click', () => {
    if (rows.length >= 30) {
      toast('Höchstens 30 Einträge.', 'error');
      return;
    }
    rows.push({ dest: '0.0.0.0/0', gateway: '', iface: '', metric: '1' });
    drawEditor();
    run();
    editor.querySelector(`[data-rt="${rows.length - 1}"][data-key="dest"]`)?.focus();
  });
  container.querySelector('[data-rt-example]').addEventListener('click', () => load(EXAMPLE_ROUTES));
  container.querySelector('[data-rt-reset]').addEventListener('click', () => load(EXAMPLE_ROUTES));
  container.querySelector('[data-rt-nodefault]').addEventListener('click', () => load(EXAMPLE_ROUTES.filter((r) => r.dest !== '0.0.0.0/0'), '203.0.113.9'));
  container.querySelectorAll('[data-rt-dst]').forEach((b) => b.addEventListener('click', () => {
    container.querySelector('#rt-dst').value = b.dataset.rtDst;
    run();
  }));
  drawEditor();
  run();
  return () => schedule.cancel();
}

/* ================================================================== Ports */
function portsTool(container) {
  let custom = parseCustomPorts(state.settings.tools_custom_ports);
  container.innerHTML = `
    ${panel('Ports durchsuchen', `
      <div class="form-row">
        ${field({ id: 'pt-q', label: 'Suche (Nummer, Bereich wie 20-25, Name oder Stichwort)', value: '', attrs: 'placeholder="z. B. 443, ssh, mail"' })}
      </div>
      ${segmented({ name: 'pt-proto', label: 'Protokoll', value: 'alle', options: [['alle', 'Alle'], ['TCP', 'TCP'], ['UDP', 'UDP']] })}
      ${notice('Portnummern sind Konventionen: Ein Dienst kann auf jedem Port laufen, und auf einem bekannten Port kann etwas ganz anderes lauschen. Die Nummer allein beweist nicht zuverlässig, welcher Dienst tatsächlich läuft.', 'warning')}
      <div id="pt-range"></div>
      <div id="pt-out"></div>
    `)}
    ${panel('Eigener Eintrag', `
      <form id="pt-form">
        <div class="form-row">
          ${field({ id: 'pt-port', label: 'Port', value: '', mono: true, attrs: 'inputmode="numeric" placeholder="8081"' })}
          ${field({ id: 'pt-proto-new', label: 'Protokoll', value: 'TCP', options: [['TCP', 'TCP'], ['UDP', 'UDP'], ['TCP/UDP', 'TCP/UDP']] })}
          ${field({ id: 'pt-name', label: 'Name', value: '', attrs: 'maxlength="60" placeholder="Mein Dienst"' })}
          ${field({ id: 'pt-desc', label: 'Beschreibung (optional)', value: '', attrs: 'maxlength="200"' })}
        </div>
        <button type="submit" class="btn btn-primary btn-sm">Eintrag speichern</button>
        <p class="hint">Eigene Einträge werden erst beim Klick auf „Eintrag speichern“ dauerhaft in deinen lokalen Einstellungen abgelegt und erscheinen markiert in der Liste.</p>
        <div id="pt-msg" aria-live="polite"></div>
      </form>
    `)}
    ${panel('Portbereiche', `${table(['Bereich', 'Bezeichnung', 'Bedeutung'], RANGES.map((r) => [`${r.from}–${r.to}`, r.name, { html: `<span class="small">${esc(r.desc)}</span>` }]))}
      ${explanation(`
        <p><strong>Port:</strong> 16-Bit-Nummer (0–65535) im TCP- oder UDP-Header, die den Dienst bzw. Prozess auf einem Host adressiert. Eine Verbindung ist eindeutig durch Quell-IP, Quellport, Ziel-IP, Zielport und Protokoll (5-Tupel).</p>
        <p><strong>TCP und UDP</strong> haben getrennte Portbereiche: TCP 53 und UDP 53 sind verschiedene Endpunkte, auch wenn beide für DNS registriert sind.</p>
        <p>Zuordnungen nach IANA-Registrierung bzw. verbreiteter Praxis; Abweichungen sind in der Liste vermerkt.</p>`)}`)}
  `;
  const out = container.querySelector('#pt-out');
  const rangeEl = container.querySelector('#pt-range');
  const all = () => [...custom, ...PORTS].sort((a, b) => a.port - b.port || (a.custom ? -1 : 1));
  const draw = () => {
    const q = limitLength(container.querySelector('#pt-q').value, 60, 'Suche');
    const proto = container.querySelector('input[name="pt-proto"]:checked')?.value ?? 'alle';
    const list = searchPorts(all(), q, proto);
    const num = /^\d{1,5}$/.test(q.trim()) ? Number(q.trim()) : null;
    if (num !== null && num <= 65535) {
      const r = rangeOf(num);
      rangeEl.innerHTML = notice(`Port ${num}: ${r.name} (${r.from}–${r.to}).`, 'info');
    } else if (num !== null) rangeEl.innerHTML = notice('Portnummern reichen nur bis 65535 (16 Bit).', 'error');
    else rangeEl.innerHTML = '';
    out.innerHTML = list.length
      ? `<p class="small subtle">${list.length} ${list.length === 1 ? 'Eintrag' : 'Einträge'}</p>
        <div class="table-wrap"><table class="data tool-table net-port-table"><thead><tr><th>Port</th><th>Protokoll</th><th>Dienst</th><th>Beschreibung</th></tr></thead><tbody>${list
          .map((e) => `<tr${e.custom ? ' class="net-port-custom"' : ''}><td>${e.port}</td><td>${e.proto.map((p) => `<span class="badge ${p === 'TCP' ? 'badge-info' : 'badge-accent'}">${p}</span>`).join(' ')}</td>
            <td><strong>${esc(e.name)}</strong>${e.custom ? ` <span class="badge badge-warning">eigener Eintrag</span> <button type="button" class="btn btn-sm btn-ghost" data-pt-del="${custom.indexOf(e)}" aria-label="Eigenen Eintrag ${e.port} ${esc(e.name)} löschen">Löschen</button>` : ''}</td>
            <td class="net-port-desc">${esc(e.desc)}${e.note ? `<br><span class="tiny subtle">${esc(e.note)}</span>` : ''}</td></tr>`)
          .join('')}</tbody></table></div>`
      : notice('Kein passender Eintrag. Du kannst unten einen eigenen anlegen.', 'info');
  };
  const persist = async (next, message) => {
    const json = serializeCustomPorts(next);
    await saveSettings({ tools_custom_ports: json });
    custom = next;
    draw();
    toast(message, 'success', 1800);
  };
  const schedule = debouncer(() => {
    try {
      draw();
    } catch (error) {
      showError(out, error);
    }
  }, 120);
  container.querySelector('#pt-q').addEventListener('input', schedule);
  container.querySelectorAll('input[name="pt-proto"]').forEach((el) => el.addEventListener('change', schedule));
  container.querySelector('#pt-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const msg = container.querySelector('#pt-msg');
    const button = event.submitter ?? container.querySelector('#pt-form [type="submit"]');
    try {
      const entry = validateCustomPort({
        port: container.querySelector('#pt-port').value,
        proto: container.querySelector('#pt-proto-new').value,
        name: container.querySelector('#pt-name').value,
        desc: container.querySelector('#pt-desc').value
      });
      if (custom.length >= MAX_CUSTOM) throw new InputError(`Höchstens ${MAX_CUSTOM} eigene Einträge.`);
      if (custom.some((c) => c.port === entry.port && c.name.toLowerCase() === entry.name.toLowerCase() && c.proto.join() === entry.proto.join())) throw new InputError('Diesen Eintrag gibt es bereits.');
      button.disabled = true;
      await persist([...custom, entry], 'Eintrag gespeichert.');
      msg.innerHTML = notice(`Port ${entry.port} „${entry.name}“ gespeichert.`, 'success');
      writeForm(container.querySelector('#pt-form'), { 'pt-port': '', 'pt-name': '', 'pt-desc': '' });
    } catch (error) {
      msg.innerHTML = notice(error.name === 'InputError' ? error.message : `Speichern fehlgeschlagen: ${error.message}`, 'error');
    } finally {
      button.disabled = false;
    }
  });
  out.addEventListener('click', async (event) => {
    const b = event.target.closest('[data-pt-del]');
    if (!b) return;
    const idx = Number(b.dataset.ptDel);
    const entry = custom[idx];
    if (!entry) return;
    if (!(await confirmDialog({ title: 'Eigenen Eintrag löschen?', message: `Port ${entry.port} „${entry.name}“ wird aus deinen Einstellungen entfernt.`, confirmLabel: 'Löschen', danger: true }))) return;
    try {
      await persist(custom.filter((_, i) => i !== idx), 'Eintrag gelöscht.');
    } catch (error) {
      toast(`Löschen fehlgeschlagen: ${error.message}`, 'error');
    }
  });
  draw();
  return () => schedule.cancel();
}

/* ================================================================== Durchsatz */
function throughputTool(container) {
  const rateOptions = [
    { group: 'Bit pro Sekunde', options: RATE_UNITS.filter((u) => u.id.includes('bit')).map((u) => [u.id, u.label]) },
    { group: 'Byte pro Sekunde', options: RATE_UNITS.filter((u) => !u.id.includes('bit')).map((u) => [u.id, u.label]) }
  ];
  const sizeOptions = SIZE_UNITS.filter((u) => !u.id.includes('bit') || u.id === 'bit').map((u) => [u.id, u.label]);
  const defaults = { rate: '100', rateUnit: 'Mbit/s', rttMs: '20', size: '100', sizeUnit: 'MB', window: '64', windowUnit: 'KiB', setupRtts: '1', overhead: true, mtu: '1500', l3: 'ipv4', l4: 'tcp', vlan: false };
  const examples = [
    { label: '100 Mbit/s, 20 ms', values: {} },
    { label: '1 Gbit/s, 80 ms, 64 KiB Fenster', values: { rate: '1', rateUnit: 'Gbit/s', rttMs: '80', size: '1', sizeUnit: 'GB', window: '64', windowUnit: 'KiB' } },
    { label: 'mit Window Scaling', values: { rate: '1', rateUnit: 'Gbit/s', rttMs: '80', size: '1', sizeUnit: 'GB', window: '16', windowUnit: 'MiB' } },
    { label: 'Jumbo-Frames', values: { rate: '10', rateUnit: 'Gbit/s', rttMs: '0,5', size: '10', sizeUnit: 'GB', window: '4', windowUnit: 'MiB', mtu: '9000' } }
  ];
  container.innerHTML = layout(
    panel('Eingabe', `
      <div class="form-row">
        ${field({ id: 'rate', label: 'Bandbreite (Leitungsrate)', value: defaults.rate, mono: true, attrs: 'inputmode="decimal"' })}
        ${field({ id: 'rateUnit', label: 'Einheit', value: defaults.rateUnit, options: rateOptions })}
      </div>
      <div class="form-row">
        ${field({ id: 'rttMs', label: 'Round-Trip-Time (ms)', value: defaults.rttMs, mono: true, attrs: 'inputmode="decimal"' })}
        ${field({ id: 'setupRtts', label: 'RTTs vor den Daten', value: defaults.setupRtts, mono: true, attrs: 'inputmode="numeric"', hint: 'z. B. 1 für den TCP-Handshake, +1 für TLS 1.3' })}
      </div>
      <div class="form-row">
        ${field({ id: 'size', label: 'Datenmenge', value: defaults.size, mono: true, attrs: 'inputmode="decimal"' })}
        ${field({ id: 'sizeUnit', label: 'Einheit', value: defaults.sizeUnit, options: sizeOptions })}
      </div>
      <div class="form-row">
        ${field({ id: 'window', label: 'TCP-Fenster (Empfangsfenster)', value: defaults.window, mono: true, attrs: 'inputmode="decimal"' })}
        ${field({ id: 'windowUnit', label: 'Einheit', value: defaults.windowUnit, options: sizeOptions })}
      </div>
      ${checkbox({ id: 'overhead', label: 'Protokoll-Overhead berücksichtigen (Ethernet + IP + TCP/UDP)', checked: defaults.overhead })}
      <div class="form-row mt-1">
        ${field({ id: 'mtu', label: 'MTU (Byte)', value: defaults.mtu, mono: true, attrs: 'inputmode="numeric"' })}
        ${field({ id: 'l3', label: 'IP', value: defaults.l3, options: Object.entries(L3_HEADERS).map(([k, x]) => [k, x.label]) })}
        ${field({ id: 'l4', label: 'Transport', value: defaults.l4, options: Object.entries(L4_HEADERS).map(([k, x]) => [k, x.label]) })}
      </div>
      ${checkbox({ id: 'vlan', label: 'VLAN-Tag (+4 Byte)', checked: defaults.vlan })}
      ${toolActions({ examples })}
      <p class="hint">Nur Dauer aus Menge und Rate (mit Wirkungsgrad)? Dafür gibt es den Rechner <a href="#/werkzeuge/uebertragungszeit">Übertragungszeit</a>.</p>
      ${explanation(`
        <p><strong>Overhead:</strong> Bei MTU 1500 trägt ein TCP/IPv4-Paket 1500 − 20 − 20 = 1460 Byte Nutzdaten. Auf der Leitung belegt es 8 (Präambel+SFD) + 14 (Ethernet-Header) + 1500 + 4 (FCS) + 12 (Interframe Gap) = 1538 Byte-Zeiten → Wirkungsgrad ≈ 94,9 %.</p>
        <p><strong>Bandwidth-Delay-Product:</strong> BDP = Rate × RTT – so viele Daten sind „unterwegs“, bevor die erste Bestätigung zurückkommt. Ist das TCP-Fenster kleiner als das BDP, wartet der Sender auf ACKs: maximaler Durchsatz = Fenster ÷ RTT.</p>
        <p><strong>Modell:</strong> Dauer = (RTTs vor den Daten) × RTT + Datenmenge ÷ effektiver Durchsatz. Nicht berücksichtigt: Slow Start, Paketverluste, Staukontrolle, Bestätigungsverkehr, TCP-Optionen außer gewählt. Echte Werte liegen daher meist darunter.</p>`)}
    `),
    '<div id="out"></div>'
  );
  const bitsRate = (bits) => `${formatSize(bits, 'si', { rate: true, bytes: false })} = ${formatSize(bits, 'si', { rate: true, bytes: true })}`;
  live(container, {
    output: '#out',
    defaults,
    examples,
    compute: (v) => {
      const m = throughputModel(v);
      const oh = m.overhead;
      const pct = (x) => `${fmt(mul(x, rat(100n)), { sig: 4 })} %`;
      const bdpBytes = m.bdpBytes;
      const windowBytes = div(m.windowBits, rat(8n));
      return panel('Ergebnis (theoretisches Modell)', `
        ${notice('Theoretisches Modell ohne Verluste, Slow Start und Staukontrolle – reale Messwerte liegen meist darunter.', 'assumption')}
        ${resultList([
          { label: 'Leitungsrate', value: bitsRate(m.rate) },
          oh ? { label: 'Wirkungsgrad', value: `${oh.payload} / ${oh.wire} Byte = ${pct(oh.efficiency)}`, copyText: pct(oh.efficiency) } : null,
          { label: 'Nutzdatenrate (Goodput)', value: bitsRate(m.goodput) },
          { label: 'Bandwidth-Delay-Product', value: `${fmt(bdpBytes, { sig: 8 })} Byte (${formatSize(m.bdpBits, 'iec')})`, copyText: fmt(bdpBytes, { sig: 8, approxMark: false }) },
          m.windowLimit ? { label: 'Fenstergrenze W/RTT', value: bitsRate(m.windowLimit) } : { label: 'Fenstergrenze', value: 'RTT = 0 → keine Begrenzung', copy: false },
          { label: 'Effektiver Durchsatz', value: `${bitsRate(m.effective)} – begrenzt durch ${m.limitedBy === 'Fenster' ? 'das TCP-Fenster' : 'die Leitung'}`, strong: true, copyText: formatSize(m.effective, 'si', { rate: true, bytes: false }) },
          { label: 'Übertragungsdauer', value: `${formatDuration(m.total)} (Vorlauf ${formatDuration(m.setupTime)} + Daten ${formatDuration(m.transfer)})`, strong: true, copyText: formatDuration(m.total) },
          oh ? { label: 'Pakete', value: `${de(m.packets)} à ${oh.payload} Byte Nutzlast`, copy: false } : null
        ])}
        ${m.limitedBy === 'Fenster' ? notice(`Das Fenster (${fmt(windowBytes, { sig: 8 })} Byte) ist kleiner als das nötige Fenster für volle Auslastung (${fmt(m.neededWindowBytes, { sig: 8 })} Byte). Die Leitung wird nur zu ${pct(m.utilisation)} genutzt. Abhilfe: TCP Window Scaling (RFC 7323).`, 'warning') : ''}
        ${steps([
          oh ? `Nutzlast je Paket: MTU ${oh.mtu} − ${oh.l3.bytes} (IP) − ${oh.l4.bytes} (Transport) = ${oh.payload} Byte` : 'Overhead nicht berücksichtigt: Nutzdatenrate = Leitungsrate.',
          oh ? `Auf der Leitung: ${ETH.preamble} (Präambel+SFD) + ${ETH.header}${oh.vlan ? ' + 4 (VLAN)' : ''} (Ethernet) + ${oh.mtu + oh.padding}${oh.padding ? ' (inkl. Padding)' : ''} + ${ETH.fcs} (FCS) + ${ETH.ifg} (IFG) = ${oh.wire} Byte-Zeiten` : null,
          oh ? `Goodput = ${formatSize(m.rate, 'si', { rate: true, bytes: false })} × ${oh.payload}/${oh.wire} = ${formatSize(m.goodput, 'si', { rate: true, bytes: false })}` : null,
          `BDP = ${formatSize(m.rate, 'si', { rate: true, bytes: false })} × ${fmt(m.rttMs)} ms = ${fmt(m.bdpBits, { sig: 10 })} bit = ${fmt(bdpBytes, { sig: 10 })} Byte`,
          m.windowLimit ? `Fenstergrenze = ${fmt(windowBytes, { sig: 10 })} Byte × 8 ÷ ${fmt(m.rtt)} s = ${formatSize(m.windowLimit, 'si', { rate: true, bytes: false })}` : null,
          `Effektiv = min(Goodput, Fenstergrenze) = ${formatSize(m.effective, 'si', { rate: true, bytes: false })}`,
          `Dauer = ${m.setup} × ${fmt(m.rttMs)} ms + ${formatSize(m.sizeBits, 'si')} ÷ ${formatSize(m.effective, 'si', { rate: true, bytes: false })} = ${formatDuration(m.setupTime)} + ${formatDuration(m.transfer)} = ${formatDuration(m.total)}`
        ])}
      `).replace(/= ≈/g, '≈');
    }
  });
}

/* ================================================================== IPv4-Header */
function headerTool(container) {
  const defaults = { hex: HEADER_EXAMPLES[0].hex };
  const examples = HEADER_EXAMPLES.map((e) => ({ label: e.label, values: { hex: e.hex } }));
  container.innerHTML = layout(
    panel('Eingabe', `
      ${field({ id: 'hex', label: 'Header als Hex-Bytes', value: defaults.hex, rows: 4, mono: true, hint: 'Leerzeichen, Zeilenumbrüche, Doppelpunkte und Bindestriche sind erlaubt (z. B. aus Wireshark kopiert).' })}
      ${toolActions({ examples })}
      ${explanation(`
        <p><strong>Aufbau:</strong> Mindestens 20 Byte (5 Worte à 32 Bit), mit Optionen bis 60 Byte. IHL gibt die Headerlänge in 32-Bit-Worten an, die Gesamtlänge umfasst Header und Nutzdaten in Byte.</p>
        <p><strong>Fragmentierung:</strong> DF = nicht fragmentieren, MF = weitere Fragmente folgen; der Fragment Offset zählt in Einheiten von 8 Byte.</p>
        <p><strong>Prüfsumme (RFC 1071):</strong> Header in 16-Bit-Worte teilen, das Prüfsummenfeld als 0 ansetzen, alle Worte addieren, Überträge über 16 Bit wieder unten aufaddieren (Einerkomplement-Summe) und das Ergebnis invertieren. Zur Kontrolle ergibt die Summe aller Worte <em>mit</em> Prüfsumme 0xFFFF. Weil jeder Router die TTL ändert, muss er die Prüfsumme neu berechnen.</p>`)}
    `),
    '<div id="out"></div>'
  );
  let lastBytes = null;
  const controller = live(container, {
    output: '#out',
    defaults,
    examples,
    compute: (v) => {
      const bytes = parseHexBytes(v.hex);
      lastBytes = bytes;
      const h = decodeIPv4Header(bytes);
      const msgs = [...h.errors.map((e) => notice(e, 'error')), ...h.warnings.map((w) => notice(w, 'warning')), ...(h.infos ?? []).map((w) => notice(w, 'info'))].join('');
      if (!h.fields.length) return panel('Ergebnis', msgs);
      const fixed = formatHexWords(withCorrectChecksum(bytes).slice(0, h.headerAvailable ? h.headerLength : 20));
      // Bitfeld-Diagramm
      const ruler = Array.from({ length: 32 }, (_, i) => `<span class="net-bf-tick">${i % 4 === 0 ? i : ''}</span>`).join('');
      const cells = h.fields.filter((f) => f.key !== 'options').map((f) => `<div class="net-bf-cell net-bf-${f.key}${f.key === 'checksum' && !h.checksum.valid ? ' bad' : ''}" style="grid-column: span ${f.bits}" title="${esc(`${f.name}: ${f.detail}`)}"><span class="net-bf-name">${esc(f.name)}</span><span class="net-bf-val mono">${esc(f.value)}</span></div>`).join('');
      const optWords = h.options?.length ? (h.headerLength - 20) / 4 : 0;
      const optCells = Array.from({ length: optWords }, (_, i) => `<div class="net-bf-cell net-bf-options" style="grid-column: span 32"><span class="net-bf-name">Optionen ${i + 1}</span><span class="net-bf-val mono">${esc(formatHexWords(bytes.slice(20 + i * 4, 24 + i * 4)))}</span></div>`).join('');
      const fieldRows = h.fields.map((f) => [f.name, `${f.bits} Bit`, f.value, { html: `<span class="small">${esc(f.detail)}</span>` }]);
      const calc = h.checksum.calc;
      const fold = [];
      let s = calc.raw;
      while (s > 0xffff) {
        const n = (s & 0xffff) + (s >>> 16);
        fold.push(`Übertrag falten: 0x${s.toString(16)} → 0x${(s & 0xffff).toString(16)} + 0x${(s >>> 16).toString(16)} = 0x${n.toString(16)}`);
        s = n;
      }
      const optTable = h.options?.length ? table(['Offset', 'Typ', 'Name', 'Länge', 'Bits'], h.options.map((o) => [String(20 + o.offset), o.type === null ? '–' : String(o.type), o.problem ? { html: `<span class="badge badge-warning">Problem</span> ${esc(o.name)}${o.note ? ` – ${esc(o.note)}` : ''}` } : o.name, `${o.length} B`, o.meta])) : '';
      return panel('Ergebnis', `
        ${h.ok && h.checksum.valid ? notice('Header formal gültig, Prüfsumme korrekt.', 'success') : ''}
        ${msgs}
        ${resultList([
          { label: 'Quelle → Ziel', value: `${h.fields.find((f) => f.key === 'src').value} → ${h.fields.find((f) => f.key === 'dst').value}`, strong: true },
          { label: 'Protokoll', value: h.fields.find((f) => f.key === 'protocol').detail, copy: false },
          { label: 'Prüfsumme', value: h.checksum.valid ? `${hex4(h.checksum.given)} ✓ gültig` : `${hex4(h.checksum.given)} ✗ – richtig: ${hex4(h.checksum.computed)}`, copyText: hex4(h.checksum.computed) },
          !h.checksum.valid ? { label: 'Korrigierter Header', value: fixed } : null
        ])}
        ${!h.checksum.valid ? '<button type="button" class="btn btn-sm mt-1" data-fix-checksum>Prüfsumme in der Eingabe korrigieren</button>' : ''}
        <h3 class="net-sub">Bitfeld-Diagramm (32 Bit pro Zeile)</h3>
        <div class="net-bf-wrap"><div class="net-bf" role="img" aria-label="IPv4-Header als Bitfelder">${ruler}${cells}${optCells}</div></div>
        <h3 class="net-sub">Felder</h3>
        ${table(['Feld', 'Größe', 'Wert', 'Bedeutung'], fieldRows)}
        ${optTable ? `<h3 class="net-sub">Optionen</h3>${optTable}` : ''}
        ${steps([
          `16-Bit-Worte (Prüfsummenfeld als 0000): ${calc.words.map((w) => w.toString(16).padStart(4, '0')).join(' + ')}`,
          `Summe = 0x${calc.raw.toString(16)}`,
          ...fold,
          `Einerkomplement (invertieren): ~0x${calc.sum.toString(16).padStart(4, '0')} = ${hex4(calc.checksum)}`,
          `Vergleich mit dem Feld: ${hex4(h.checksum.given)} → ${h.checksum.valid ? 'stimmt' : 'stimmt nicht'}${h.checksum.partial ? ' (nur über die ersten 20 Byte gerechnet, Optionen fehlen)' : ''}`
        ], { title: 'Prüfsumme berechnen' })}
      `);
    }
  });
  container.addEventListener('click', (event) => {
    if (!event.target.closest('[data-fix-checksum]') || !lastBytes) return;
    container.querySelector('#hex').value = formatHexWords(withCorrectChecksum(lastBytes));
    controller.run();
  });
  return () => controller.destroy();
}

/* ================================================================== Topologie */
function topologyTool(container) {
  let topo = exampleTopology();
  let trace = null;
  container.innerHTML = `
    ${panel('Netzplan', `
      ${simHead('Simulierte Topologie – keine echte Netzwerkkonfiguration, keine realen Pakete.')}
      <div class="net-topo-wrap" id="topo-svg"></div>
      <div id="topo-issues"></div>
    `)}
    ${layout(
      panel('Paket senden', `
        <form id="topo-form">
          <div class="form-row">
            ${field({ id: 'topo-src', label: 'Quelle', value: 'pc1', options: [] })}
            ${field({ id: 'topo-dst', label: 'Ziel-IP', value: '192.168.2.20', mono: true })}
            ${field({ id: 'topo-ttl', label: 'Start-TTL', value: '64', mono: true, attrs: 'inputmode="numeric"' })}
          </div>
          <div class="row"><button type="submit" class="btn btn-primary">Weg berechnen</button>
            <button type="button" class="btn btn-sm" data-topo-try="192.168.2.30|64">Ins andere Netz (PC3)</button>
            <button type="button" class="btn btn-sm" data-topo-try="203.0.113.5|64">Ohne passende Route</button>
            <button type="button" class="btn btn-sm" data-topo-try="192.168.2.20|1">TTL 1</button></div>
        </form>
        <div id="topo-error"></div>
        ${explanation(`
          <p><strong>Gleiches Netz?</strong> Der Absender vergleicht Ziel-IP UND eigene Maske mit dem eigenen Netz. Gleich → direkt zustellen (ARP liefert die MAC des Ziels). Sonst → an das Default-Gateway.</p>
          <p><strong>Switches</strong> arbeiten auf Schicht 2: Sie leiten Frames anhand der MAC-Adresse weiter und ändern weder IP-Adressen noch TTL.</p>
          <p><strong>Router</strong> verringern die TTL um 1, wählen per Longest-Prefix-Match aus direkt verbundenen Netzen und statischen Routen und schicken das Paket zum Next Hop. Die Ziel-IP bleibt gleich, nur die MAC-Adressen wechseln pro Abschnitt.</p>
          <p><strong>Vereinfachungen:</strong> kein ARP-Cache, keine MAC-Tabellen, kein NAT, keine Rückantwort; Schleifen werden erkannt, sobald ein Router zum zweiten Mal erreicht wird.</p>`)}
      `),
      `<div class="card tool-panel-card"><h2 class="tool-panel-title">Paketweg</h2><div id="topo-stepper"></div><div id="topo-steps" aria-live="polite"></div></div>`
    )}
    ${panel('Geräte und Verbindungen bearbeiten', `
      <div class="row mb-1">
        <button type="button" class="btn btn-sm" data-topo-add="client">+ Client</button>
        <button type="button" class="btn btn-sm" data-topo-add="switch">+ Switch</button>
        <button type="button" class="btn btn-sm" data-topo-add="router">+ Router</button>
        <button type="button" class="btn btn-sm btn-ghost" data-topo-reset>Beispiel wiederherstellen</button>
      </div>
      <div id="topo-devices" class="net-topo-devices"></div>
      <h3 class="net-sub">Verbindungen</h3>
      <div id="topo-links"></div>
      <div class="form-row mt-1 net-topo-linkform">
        ${field({ id: 'link-a', label: 'Gerät A', value: '', options: [] })}
        ${field({ id: 'link-b', label: 'Gerät B', value: '', options: [] })}
      </div>
      <button type="button" class="btn btn-sm" data-topo-link>Verbinden</button>
      <div id="topo-link-error"></div>
      <p class="hint">Routen je Zeile: <code>Netz/Präfix via Gateway</code>, optional <code>metric N</code>, z. B. <code>0.0.0.0/0 via 10.0.0.2</code>. Direkt verbundene Netze ergeben sich aus den Interface-Adressen.</p>
    `)}
  `;
  const svgEl = container.querySelector('#topo-svg');
  const stepsEl = container.querySelector('#topo-steps');
  const devEl = container.querySelector('#topo-devices');
  const linksEl = container.querySelector('#topo-links');
  const nameOf = (id) => topo.devices.find((d) => d.id === id)?.name ?? id;

  const drawSvg = (activeLinks = new Set(), activeDevice = null, failDevice = null) => {
    if (!topo.devices.length) {
      svgEl.innerHTML = '<p class="small subtle">Keine Geräte. Füge unten Geräte hinzu.</p>';
      return;
    }
    const { pos, width, height } = layoutTopology(topo);
    const model = buildModel(topo);
    const lines = topo.links.map((l) => {
      const a = pos[l.a];
      const b = pos[l.b];
      return `<line class="net-topo-link${activeLinks.has(l.id) ? ' active' : ''}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
    }).join('');
    const ifLabels = topo.links.flatMap((l) => [l.a, l.b].filter((id) => topo.devices.find((d) => d.id === id)?.type === 'router').map((rid) => {
      const r = pos[rid];
      const o = pos[l.a === rid ? l.b : l.a];
      const x = r.x + (o.x - r.x) * 0.3;
      const y = r.y + (o.y - r.y) * 0.3 - 6;
      const host = String(topo.devices.find((d) => d.id === rid).ifaces?.[l.id] ?? '').split('/')[0].split('.')[3];
      return `<text class="net-topo-if" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle">${esc(ifaceName(topo, rid, l.id))}${host ? ` .${esc(host)}` : ''}</text>`;
    })).join('');
    const nodes = topo.devices.map((d) => {
      const p = pos[d.id];
      const m = model.devices.get(d.id);
      const cls = `net-topo-node ${d.type}${d.id === activeDevice ? ' active' : ''}${d.id === failDevice ? ' fail' : ''}`;
      const shape = d.type === 'router'
        ? `<circle cx="${p.x}" cy="${p.y}" r="20"/><path class="net-topo-glyph" d="M${p.x - 9} ${p.y}h18M${p.x} ${p.y - 9}v18"/>`
        : d.type === 'switch'
          ? `<rect x="${p.x - 24}" y="${p.y - 13}" width="48" height="26" rx="4"/><path class="net-topo-glyph" d="M${p.x - 14} ${p.y - 4}h28M${p.x - 14} ${p.y + 4}h28"/>`
          : `<rect x="${p.x - 20}" y="${p.y - 15}" width="40" height="30" rx="7"/><path class="net-topo-glyph" d="M${p.x - 10} ${p.y + 4}h20"/>`;
      const sub = d.type === 'client' ? (m?.addr !== undefined ? `${formatIPv4(m.addr)}/${m.prefix}` : 'keine IP') : d.type === 'router' ? `${m?.interfaces?.length ?? 0} Interfaces` : 'Layer 2';
      return `<g class="${cls}"><title>${esc(`${DEVICE_TYPES[d.type]} ${d.name}`)}</title>${shape}<text class="net-topo-name" x="${p.x}" y="${p.y + 36}" text-anchor="middle">${esc(d.name)}</text><text class="net-topo-sub" x="${p.x}" y="${p.y + 49}" text-anchor="middle">${esc(sub)}</text></g>`;
    }).join('');
    svgEl.innerHTML = `<svg class="net-topo" viewBox="0 0 ${Math.max(width, 200)} ${height + 30}" role="img" aria-label="Netzplan mit ${topo.devices.length} Geräten und ${topo.links.length} Verbindungen" style="min-width:${Math.min(Math.max(width, 200), 560)}px">${lines}${ifLabels}${nodes}</svg>`;
  };

  const drawIssues = () => {
    const { issues } = buildModel(topo);
    container.querySelector('#topo-issues').innerHTML = issues.length
      ? notice(`Konfiguration unvollständig: ${issues.map((i) => i.text).join(' · ')}`, 'warning')
      : '';
  };

  const drawSelects = () => {
    const opts = (filter) => topo.devices.filter(filter).map((d) => `<option value="${esc(d.id)}">${esc(d.name)} (${DEVICE_TYPES[d.type]})</option>`).join('');
    const src = container.querySelector('#topo-src');
    const prev = src.value;
    src.innerHTML = opts((d) => d.type === 'client') || '<option value="">– kein Client –</option>';
    if ([...src.options].some((o) => o.value === prev)) src.value = prev;
    for (const id of ['#link-a', '#link-b']) {
      const sel = container.querySelector(id);
      const p = sel.value;
      sel.innerHTML = opts(() => true);
      if ([...sel.options].some((o) => o.value === p)) sel.value = p;
    }
    if (container.querySelector('#link-a').value === container.querySelector('#link-b').value && topo.devices.length > 1) container.querySelector('#link-b').selectedIndex = 1;
  };

  const drawEditor = () => {
    devEl.innerHTML = topo.devices.map((d) => {
      const head = `<div class="row-between"><strong>${esc(DEVICE_TYPES[d.type])}</strong><button type="button" class="btn btn-sm btn-ghost" data-topo-del="${esc(d.id)}" aria-label="${esc(d.name)} entfernen">Entfernen</button></div>
        ${field({ id: `dev-${d.id}-name`, label: 'Name', value: d.name, attrs: `maxlength="12" data-dev="${esc(d.id)}" data-key="name"` })}`;
      let body = '';
      if (d.type === 'client') {
        body = `${field({ id: `dev-${d.id}-cidr`, label: 'IP/Präfix', value: d.cidr, mono: true, attrs: `data-dev="${esc(d.id)}" data-key="cidr" placeholder="192.168.1.10/24"` })}
          ${field({ id: `dev-${d.id}-gw`, label: 'Default-Gateway', value: d.gateway, mono: true, attrs: `data-dev="${esc(d.id)}" data-key="gateway" placeholder="leer = keins"` })}`;
      } else if (d.type === 'router') {
        const links = deviceLinks(topo, d.id);
        body = links.length
          ? links.map((l) => field({ id: `dev-${d.id}-if-${l.id}`, label: `${ifaceName(topo, d.id, l.id)} → ${nameOf(l.a === d.id ? l.b : l.a)} (IP/Präfix)`, value: d.ifaces?.[l.id] ?? '', mono: true, attrs: `data-dev="${esc(d.id)}" data-iface="${esc(l.id)}" placeholder="10.0.0.1/30"` })).join('')
          : '<p class="small subtle">Noch keine Verbindung – Interfaces entstehen durch Verbindungen.</p>';
        body += field({ id: `dev-${d.id}-routes`, label: 'Statische Routen', value: d.routes, rows: 3, mono: true, attrs: `data-dev="${esc(d.id)}" data-key="routes" placeholder="0.0.0.0/0 via 10.0.0.2"` });
      } else body = '<p class="small subtle">Switch: Layer 2, keine IP-Konfiguration nötig.</p>';
      return `<div class="net-topo-dev net-topo-dev-${d.type}">${head}${body}</div>`;
    }).join('');
    drawLinks();
  };
  const drawLinks = () => {
    linksEl.innerHTML = topo.links.length
      ? `<ul class="net-topo-linklist">${topo.links.map((l) => `<li><span>${esc(nameOf(l.a))} — ${esc(nameOf(l.b))}</span><button type="button" class="btn btn-sm btn-ghost" data-topo-unlink="${esc(l.id)}" aria-label="Verbindung ${esc(nameOf(l.a))} – ${esc(nameOf(l.b))} entfernen">Trennen</button></li>`).join('')}</ul>`
      : '<p class="small subtle">Keine Verbindungen.</p>';
    drawSelects();
  };

  const errEl = container.querySelector('#topo-error');
  const stepper = createStepper({
    count: () => trace?.steps.length ?? 1,
    label: 'Paketweg',
    interval: 1100,
    show: (i) => {
      if (!trace) {
        stepsEl.innerHTML = '<p class="small subtle">Noch kein Paket gesendet.</p>';
        drawSvg();
        return;
      }
      const shown = trace.steps.slice(0, i + 1);
      const active = new Set(shown.flatMap((s) => s.links));
      const cur = trace.steps[i];
      drawSvg(active, cur.device, cur.kind === 'error' ? cur.device : null);
      stepsEl.innerHTML = `<ol class="net-topo-steps">${shown.map((s, k) => `<li class="${s.kind}${k === i ? ' current' : ''}"><span class="badge">${esc(nameOf(s.device))} · TTL ${s.ttl}</span> ${esc(s.text)}</li>`).join('')}</ol>
        ${i === trace.steps.length - 1 ? notice(trace.ok ? 'Paket zugestellt.' : `Paket nicht zugestellt: ${trace.reason}`, trace.ok ? 'success' : 'error') : ''}`;
    }
  });
  container.querySelector('#topo-stepper').innerHTML = stepper.html;
  stepper.mount(container);

  const runTrace = (keepEmpty = false, index = 0) => {
    try {
      const dst = limitLength(container.querySelector('#topo-dst').value, 40, 'Ziel-IP');
      trace = tracePacket(topo, container.querySelector('#topo-src').value, dst, container.querySelector('#topo-ttl').value);
      errEl.innerHTML = '';
    } catch (error) {
      trace = null;
      if (!keepEmpty) showError(errEl, error);
    }
    stepper.refresh(trace ? Math.min(index, trace.steps.length - 1) : 0);
  };
  const refreshAll = () => {
    drawEditor();
    drawIssues();
    if (trace) runTrace(true, stepper.index);
    else drawSvg();
  };
  container.querySelector('#topo-form').addEventListener('submit', (event) => {
    event.preventDefault();
    runTrace();
  });
  container.querySelectorAll('[data-topo-try]').forEach((b) => b.addEventListener('click', () => {
    const [dst, ttl] = b.dataset.topoTry.split('|');
    if (topo.devices.some((d) => d.id === 'pc1' && d.type === 'client')) container.querySelector('#topo-src').value = 'pc1';
    container.querySelector('#topo-dst').value = dst;
    container.querySelector('#topo-ttl').value = ttl;
    runTrace();
  }));
  const onEdit = debouncer(() => {
    drawIssues();
    if (trace) runTrace(true, stepper.index);
    else drawSvg();
  }, 250);
  devEl.addEventListener('input', (event) => {
    const el = event.target;
    const dev = topo.devices.find((d) => d.id === el.dataset.dev);
    if (!dev) return;
    if (el.dataset.iface) dev.ifaces[el.dataset.iface] = el.value.slice(0, 40);
    else if (el.dataset.key === 'name') dev.name = el.value.trim().slice(0, 12) || dev.id;
    else if (el.dataset.key === 'routes') dev.routes = el.value.slice(0, 2000);
    else if (el.dataset.key) dev[el.dataset.key] = el.value.slice(0, 40);
    onEdit();
  });
  devEl.addEventListener('change', (event) => {
    if (event.target.dataset.key === 'name') drawLinks();
  });
  devEl.addEventListener('click', (event) => {
    const del = event.target.closest('[data-topo-del]');
    if (!del) return;
    removeDevice(topo, del.dataset.topoDel);
    refreshAll();
  });
  linksEl.addEventListener('click', (event) => {
    const b = event.target.closest('[data-topo-unlink]');
    if (!b) return;
    removeLink(topo, b.dataset.topoUnlink);
    refreshAll();
  });
  container.querySelectorAll('[data-topo-add]').forEach((b) => b.addEventListener('click', () => {
    try {
      const d = addDevice(topo, b.dataset.topoAdd);
      refreshAll();
      container.querySelector(`#dev-${d.id}-name`)?.focus();
    } catch (error) {
      toast(error.message, 'error');
    }
  }));
  container.querySelector('[data-topo-reset]').addEventListener('click', () => {
    topo = exampleTopology();
    trace = null;
    errEl.innerHTML = '';
    writeForm(container, { 'topo-dst': '192.168.2.20', 'topo-ttl': '64' });
    refreshAll();
    container.querySelector('#topo-src').value = 'pc1';
    stepper.refresh(0);
  });
  container.querySelector('[data-topo-link]').addEventListener('click', () => {
    const box = container.querySelector('#topo-link-error');
    try {
      addLink(topo, container.querySelector('#link-a').value, container.querySelector('#link-b').value);
      box.innerHTML = '';
      refreshAll();
    } catch (error) {
      showError(box, error);
    }
  });
  drawEditor();
  drawIssues();
  container.querySelector('#topo-src').value = 'pc1';
  stepper.refresh(0);
  return () => {
    stepper.destroy();
    onEdit.cancel();
  };
}

const TOOLS = {
  ipv6: ipv6Tool,
  'osi-modell': osiTool,
  'tcp-handshake': tcpTool,
  'dns-simulator': dnsTool,
  'routing-tabelle': routingTool,
  ports: portsTool,
  netzwerkdurchsatz: throughputTool,
  'ipv4-header': headerTool,
  topologie: topologyTool
};

export function render(toolId, container, ctx) {
  const tool = TOOLS[toolId];
  if (!tool) throw new Error(`Unbekanntes Werkzeug: ${toolId}`);
  return tool(container, ctx);
}

