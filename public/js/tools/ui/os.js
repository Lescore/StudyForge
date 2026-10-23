/**
 * Werkzeuge „Betriebssysteme & Linux“: Dateirechte, Befehlsreferenz,
 * Scheduling-Simulator, RAID & Backup.
 * Die Logik liegt in ../core/os-*.js (ohne DOM, getestet); hier nur Oberfläche.
 */
import {
  esc, field, segmented, layout, panel, resultList, steps, notice, explanation, toolActions,
  live, table, copyButton, createStepper, readForm, writeForm, errorHtml
} from '../kit.js';
import {
  CLASSES, SUID, SGID, STICKY, FILE_TYPES, parseOctal, parseSymbolic, toOctal, toOctalShort, toSymbolic,
  chmodOctal, chmodSymbolic, applyChmod, applyUmask, parseAny, describe
} from '../core/os-perms.js';
import { COMMANDS, CATEGORIES, PLATFORMS, filterCommands } from '../core/os-commands.js';
import { ALGORITHMS, LIMITS as SCHED, simulate } from '../core/os-sched.js';
import { TYPES as BACKUP_TYPES, planBackups, restoreChain } from '../core/os-backup.js';
import { fmt, rat } from '../core/num.js';

const PALETTE = ['indigo', 'teal', 'amber', 'rose', 'violet', 'green', 'orange', 'slate'];
const simBadge = '<span class="tool-badge-sim">Simulation</span>';

/* ================================================================ Dateirechte */
function dateirechte(container) {
  const defaults = { sym: 'rwxr-xr-x', oct: '755', ftype: 'file', fname: 'datei' };
  const examples = [
    { label: '755 Verzeichnis', values: { oct: '755', ftype: 'dir', fname: 'projekt' } },
    { label: '644 Datei', values: { oct: '644', ftype: 'file', fname: 'bericht.txt' } },
    { label: '4755 SUID (passwd)', values: { oct: '4755', ftype: 'file', fname: '/usr/bin/passwd' } },
    { label: '1777 /tmp', values: { oct: '1777', ftype: 'dir', fname: '/tmp' } },
    { label: '2770 Team-Ordner', values: { oct: '2770', ftype: 'dir', fname: '/srv/team' } },
    { label: '-rwSr--r--', values: { sym: '-rwSr--r--', ftype: 'file', fname: 'datei' } }
  ];
  const matrix = `<div class="table-wrap os-perm-matrix"><table class="data tool-table"><thead><tr><th>Klasse</th><th>r</th><th>w</th><th>x</th><th>Spezial</th></tr></thead><tbody>
    ${CLASSES.map((c) => `<tr><th scope="row">${esc(c.label)}</th>${['r', 'w', 'x']
      .map((p, i) => `<td><input type="checkbox" class="os-bit" data-bit="${(4 >> i) << c.shift}" aria-label="${esc(c.label)}: ${p}"></td>`)
      .join('')}<td><label class="os-special"><input type="checkbox" class="os-bit" data-bit="${c.special}"> ${c.id === 'u' ? 'SUID' : c.id === 'g' ? 'SGID' : 'Sticky'}</label></td></tr>`).join('')}
  </tbody></table></div>`;
  container.innerHTML = `
    ${layout(
      panel('Rechte umrechnen', `
        <div class="form-row" id="perm-form">
          ${field({ id: 'sym', label: 'Symbolisch (ls -l)', value: defaults.sym, mono: true, hint: 'z. B. rwxr-xr-x, -rwsr-xr-x, drwxrwxrwt' })}
          ${field({ id: 'oct', label: 'Oktal', value: defaults.oct, mono: true, attrs: 'inputmode="numeric" maxlength="4"', hint: '3 oder 4 Ziffern, z. B. 755 oder 4755' })}
        </div>
        <div class="form-row">
          ${field({ id: 'ftype', label: 'Art', value: defaults.ftype, options: [['file', 'Datei'], ['dir', 'Verzeichnis']] })}
          ${field({ id: 'fname', label: 'Name für chmod-Befehl', value: defaults.fname, mono: true })}
        </div>
        ${matrix}
        ${toolActions({ examples })}
        ${explanation(`
          <p>Jede Datei hat drei Klassen – <strong>Besitzer (u)</strong>, <strong>Gruppe (g)</strong> und <strong>andere (o)</strong> – mit je den Rechten <strong>r</strong> = 4, <strong>w</strong> = 2, <strong>x</strong> = 1. Die Summe ergibt eine Oktalziffer, z. B. rwx = 7, r-x = 5.</p>
          <p>Eine vierte, vorangestellte Ziffer fasst die Spezialbits zusammen: <strong>SUID</strong> = 4, <strong>SGID</strong> = 2, <strong>Sticky</strong> = 1. In der ls-Ausgabe ersetzen sie das x der jeweiligen Klasse: <code>s</code>/<code>t</code>, wenn x zusätzlich gesetzt ist, sonst groß <code>S</code>/<code>T</code>.</p>
          <p>Bei <strong>Verzeichnissen</strong> bedeutet r „auflisten“, w „Einträge anlegen/löschen“ und x „betreten“. Zum Löschen einer Datei braucht man Schreibrecht auf das <em>Verzeichnis</em>, nicht auf die Datei.</p>
          <p>root ist von den rwx-Prüfungen weitgehend ausgenommen; ACLs (<code>+</code> hinter den Rechten) können zusätzliche Rechte gewähren.</p>`)}
      `),
      '<div id="perm-out"></div>'
    )}
    <div class="tool-layout">
      <div id="chmod-box">${panel('chmod-Ausdruck anwenden', `
        <div class="form-row">
          ${field({ id: 'cstart', label: 'Startrechte', value: '644', mono: true, hint: 'oktal oder symbolisch' })}
          ${field({ id: 'cexpr', label: 'chmod-Ausdruck', value: 'u+x,g-w', mono: true, hint: 'z. B. u+x, go-w, a=r, o=g, a+rX' })}
        </div>
        <div class="form-row">
          ${field({ id: 'ctype', label: 'Art', value: 'file', options: [['file', 'Datei'], ['dir', 'Verzeichnis']] })}
          ${field({ id: 'cumask', label: 'umask (nur ohne u/g/o/a)', value: '022', mono: true })}
        </div>
        ${toolActions({ examples: [{ label: 'u+x' }, { label: 'go-rwx' }, { label: 'a+rX (Verzeichnis)' }, { label: '+x ohne Klasse' }] })}
        <div id="chmod-out"></div>
        ${explanation(`
          <p>Aufbau: <code>[ugoa][+-=][rwxXst]</code>, mehrere Teile durch Kommas getrennt. <code>+</code> fügt hinzu, <code>-</code> entfernt, <code>=</code> setzt genau (nicht genannte Rechte der Klasse werden gelöscht). Statt Rechten kann eine Klasse kopiert werden: <code>o=g</code>.</p>
          <p><code>X</code> setzt x nur, wenn es sich um ein Verzeichnis handelt oder bereits irgendein x gesetzt ist – praktisch für <code>chmod -R a+rX</code>.</p>
          <p>Fehlt die Klasse (z. B. <code>+x</code>), wirkt GNU chmod auf alle Klassen, lässt aber Bits unberührt, die in der umask stehen. Bei Verzeichnissen bleiben SUID/SGID bei <code>=</code> erhalten, solange <code>s</code> nicht genannt wird.</p>`)}
      `)}</div>
      <div id="umask-box">${panel('umask-Rechner', `
        ${field({ id: 'umask', label: 'umask', value: '022', mono: true, hint: '3 oder 4 Oktalziffern, z. B. 022, 027, 077' })}
        ${toolActions({ examples: [{ label: '022' }, { label: '027' }, { label: '077' }, { label: '002' }] })}
        <div id="umask-out"></div>
      `)}</div>
    </div>`;

  const form = container.querySelector('.tool-inputs');
  const out = container.querySelector('#perm-out');
  const symEl = form.querySelector('#sym');
  const octEl = form.querySelector('#oct');
  const typeEl = form.querySelector('#ftype');
  let mode = 0o755;
  let typeChar = null;

  const setBoxes = () => form.querySelectorAll('.os-bit').forEach((b) => (b.checked = Boolean(mode & Number(b.dataset.bit))));
  const lsType = () => typeChar ?? (typeEl.value === 'dir' ? 'd' : '-');
  const render = () => {
    const isDir = lsType() === 'd';
    const name = form.querySelector('#fname').value.trim() || 'datei';
    const info = describe(mode, { isDir });
    const sym = toSymbolic(mode);
    const special = (mode & SUID ? 4 : 0) + (mode & SGID ? 2 : 0) + (mode & STICKY ? 1 : 0);
    const digit = (c) => {
      const b = (mode >> c.shift) & 7;
      const parts = [b & 4 ? 4 : 0, b & 2 ? 2 : 0, b & 1 ? 1 : 0];
      return `${c.label}: ${sym.slice(CLASSES.indexOf(c) * 3, CLASSES.indexOf(c) * 3 + 3)} → ${parts.join(' + ')} = ${b}`;
    };
    out.innerHTML = panel('Ergebnis', `
      ${resultList([
        { label: 'ls -l', value: `${lsType()}${sym}`, strong: true },
        { label: 'Oktal', value: toOctalShort(mode) },
        { label: 'Oktal (4-stellig)', value: toOctal(mode) },
        { label: 'chmod oktal', value: chmodOctal(mode, name) },
        { label: 'chmod symbolisch', value: chmodSymbolic(mode, name) },
        { label: 'Dateityp', value: FILE_TYPES[lsType()], mono: false, copy: false }
      ])}
      ${steps([
        ...CLASSES.map(digit),
        `Spezialbits: ${mode & SUID ? 'SUID 4' : 'SUID 0'} + ${mode & SGID ? 'SGID 2' : 'SGID 0'} + ${mode & STICKY ? 'Sticky 1' : 'Sticky 0'} = ${special}`,
        `Zusammengesetzt: ${special}${toOctal(mode).slice(1)}${special ? '' : ` (führende 0 darf entfallen: ${toOctalShort(mode)})`}`
      ])}
      ${table(['Klasse', 'Rechte', `Bedeutung (${isDir ? 'Verzeichnis' : 'Datei'})`], info.classes.map((c, i) => [c.label, sym.slice(i * 3, i * 3 + 3), { html: esc(c.text) }]), { className: 'os-perm-explain' })}
      ${info.special.map((s) => notice(s, 'info')).join('')}
      ${info.warnings.map((w) => notice(w, 'warning')).join('')}
      ${typeChar && !['-', 'd'].includes(typeChar) ? notice(`Dateityp „${typeChar}“ (${FILE_TYPES[typeChar]}): Die Erläuterung folgt den Regeln für Dateien.${typeChar === 'l' ? ' Bei symbolischen Links zeigt ls immer rwxrwxrwx; maßgeblich sind die Rechte des Ziels.' : ''}`, 'info') : ''}
    `);
  };
  const fail = (error) => {
    out.innerHTML = panel('Ergebnis', errorHtml(error));
  };
  const fromSym = () => {
    try {
      const r = parseSymbolic(symEl.value);
      mode = r.mode;
      typeChar = r.type;
      if (r.type === 'd') typeEl.value = 'dir';
      else if (r.type) typeEl.value = 'file';
      octEl.value = toOctalShort(mode);
      setBoxes();
      render();
    } catch (error) {
      fail(error);
    }
  };
  const fromOct = () => {
    try {
      mode = parseOctal(octEl.value);
      symEl.value = typeChar ? `${lsType()}${toSymbolic(mode)}` : toSymbolic(mode);
      setBoxes();
      render();
    } catch (error) {
      fail(error);
    }
  };
  const fromBoxes = () => {
    mode = 0;
    form.querySelectorAll('.os-bit').forEach((b) => {
      if (b.checked) mode |= Number(b.dataset.bit);
    });
    octEl.value = toOctalShort(mode);
    symEl.value = typeChar ? `${lsType()}${toSymbolic(mode)}` : toSymbolic(mode);
    render();
  };
  symEl.addEventListener('input', fromSym);
  octEl.addEventListener('input', fromOct);
  form.querySelectorAll('.os-bit').forEach((b) => b.addEventListener('change', fromBoxes));
  typeEl.addEventListener('change', () => {
    if (typeChar !== null) typeChar = typeEl.value === 'dir' ? 'd' : '-';
    if (typeChar) symEl.value = `${lsType()}${toSymbolic(mode)}`;
    render();
  });
  form.querySelector('#fname').addEventListener('input', render);
  form.querySelectorAll('[data-tool-example]').forEach((button) =>
    button.addEventListener('click', () => {
      const values = { ...defaults, ...examples[Number(button.dataset.toolExample)].values };
      writeForm(form, values);
      typeChar = null;
      if (examples[Number(button.dataset.toolExample)].values.sym) fromSym();
      else fromOct();
    })
  );
  form.querySelector('[data-tool-reset]').addEventListener('click', () => {
    writeForm(form, defaults);
    typeChar = null;
    fromSym();
  });
  fromSym();

  // chmod-Ausdruck
  const chmodBox = container.querySelector('#chmod-box');
  const chmodDefaults = { cstart: '644', cexpr: 'u+x,g-w', ctype: 'file', cumask: '022' };
  live(chmodBox, {
    output: '#chmod-out',
    defaults: chmodDefaults,
    examples: [
      { values: { cstart: '644', cexpr: 'u+x' } },
      { values: { cstart: '755', cexpr: 'go-rwx' } },
      { values: { cstart: '700', cexpr: 'a+rX', ctype: 'dir' } },
      { values: { cstart: '644', cexpr: '+x', cumask: '022' } }
    ],
    compute: (v) => {
      const start = parseAny(v.cstart).mode;
      const isDir = v.ctype === 'dir';
      // umask nur nötig, wenn ein Teil ohne u/g/o/a beginnt (z. B. „+x“)
      const umask = /(^|,)\s*[-+=]/.test(v.cexpr) ? applyUmask(v.cumask).umask : 0o022;
      const { mode: result, log } = applyChmod(start, v.cexpr, { isDir, umask });
      const name = isDir ? 'verzeichnis' : 'datei';
      return `${resultList([
        { label: 'Vorher', value: `${isDir ? 'd' : '-'}${toSymbolic(start)} (${toOctal(start)})` },
        { label: 'Nachher', value: `${isDir ? 'd' : '-'}${toSymbolic(result)} (${toOctal(result)})`, strong: true },
        { label: 'Befehl', value: `chmod ${v.cexpr.trim()} ${name}` },
        { label: 'Gleichwertig', value: chmodOctal(result, name) }
      ])}${steps(log, { title: 'Schritt für Schritt' })}`;
    }
  });

  // umask
  const umaskBox = container.querySelector('#umask-box');
  live(umaskBox, {
    output: '#umask-out',
    defaults: { umask: '022' },
    examples: [{ values: { umask: '022' } }, { values: { umask: '027' } }, { values: { umask: '077' } }, { values: { umask: '002' } }],
    compute: (v) => {
      const r = applyUmask(v.umask);
      const u = toOctal(r.umask).slice(1);
      return `${resultList([
        { label: 'Neue Dateien', value: `${toOctalShort(r.file)} (-${toSymbolic(r.file)})`, strong: true },
        { label: 'Neue Verzeichnisse', value: `${toOctalShort(r.dir)} (d${toSymbolic(r.dir)})`, strong: true }
      ])}${steps([
        `Dateien: Standard 666 (rw-rw-rw-), die umask-Bits ${u} werden entfernt: 666 UND NICHT ${u} = ${toOctalShort(r.file)}`,
        `Verzeichnisse: Standard 777 (rwxrwxrwx): 777 UND NICHT ${u} = ${toOctalShort(r.dir)}`,
        'Achtung: Es ist ein bitweises Entfernen, keine Subtraktion – bei umask 033 entstehen 644, nicht 633.'
      ])}${notice('Programme können beim Anlegen auch weniger Rechte anfordern (z. B. 600 für SSH-Schlüssel); die umask nimmt nur weg, sie fügt nie etwas hinzu.', 'info')}`;
    }
  });
}

/* ================================================================ Befehle */
function befehle(container) {
  container.innerHTML = `
    ${panel('', `
      ${notice('Reine Referenz – hier wird nichts ausgeführt. Befehle vor dem Einsatz verstehen; markierte Befehle können Daten unwiderruflich löschen.', 'info')}
      <div class="form-row os-cmd-filter">
        ${field({ id: 'q', label: 'Suche', value: '', hint: 'Befehl, Zweck oder Stichwort (z. B. „port“, „dns“, „log“)', attrs: 'type="search"' })}
        ${field({ id: 'cat', label: 'Kategorie', value: 'all', options: [['all', 'Alle Kategorien'], ...Object.entries(CATEGORIES)] })}
      </div>
      ${segmented({ name: 'platform', label: 'Plattform', value: 'all', options: [['all', 'Alle'], ['linux', 'Linux'], ['windows', 'Windows (cmd + PowerShell)'], ['cmd', 'nur cmd'], ['ps', 'nur PowerShell']] })}
      ${toolActions({ examples: [] })}
      ${explanation(`
        <p><strong>Linux</strong>: Befehle für die bash mit GNU coreutils, systemd und den Paketverwaltungen apt (Debian/Ubuntu) bzw. dnf (Fedora/RHEL). Root-Rechte erhält man pro Befehl mit <code>sudo</code>.</p>
        <p><strong>Windows cmd</strong>: klassische Eingabeaufforderung. Als cmd gekennzeichnete Programme wie <code>ipconfig</code>, <code>ping</code> oder <code>winget</code> sind eigenständige .exe-Dateien und funktionieren auch in PowerShell; cmd-interne Befehle wie <code>dir</code> oder <code>copy</code> sind dort dagegen nur Aliase für Cmdlets mit anderen Optionen.</p>
        <p><strong>PowerShell</strong>: Cmdlets nach dem Schema Verb-Substantiv, die Objekte statt Text weiterreichen. „Als Administrator ausführen“ entspricht sudo.</p>
        <p>Gleichnamige Programme (ping, ssh, curl) unterscheiden sich je System in den Optionen – sie sind deshalb getrennt aufgeführt.</p>`)}
    `)}
    <div id="cmd-out"></div>`;
  const platBadge = { linux: 'badge-success', cmd: 'badge-info', ps: 'badge-accent' };
  const entry = (c) => `<article class="os-cmd${c.danger ? ' os-cmd-danger' : ''}">
      <div class="os-cmd-head"><code class="os-cmd-name">${esc(c.cmd)}</code><span class="badge ${platBadge[c.platform]}">${esc(PLATFORMS[c.platform])}</span></div>
      <p class="os-cmd-purpose">${esc(c.purpose)}</p>
      <div class="os-cmd-example"><code>${esc(c.example)}</code>${copyButton(c.example, `Beispiel kopieren: ${c.example}`)}</div>
      ${c.danger ? notice(c.note || 'Kann Daten unwiderruflich löschen.', 'warning') : c.note ? `<p class="os-cmd-note small subtle">${esc(c.note)}</p>` : ''}
    </article>`;
  live(container, {
    output: '#cmd-out',
    defaults: { q: '', cat: 'all', platform: 'all' },
    compute: (v) => {
      const list = filterCommands({ platform: v.platform, cat: v.cat, query: v.q });
      if (!list.length) return panel('', notice('Keine Befehle gefunden. Suche oder Filter ändern.', 'info'));
      const cats = Object.keys(CATEGORIES).filter((k) => list.some((c) => c.cat === k));
      return `<p class="small subtle">${list.length} von ${COMMANDS.length} Einträgen</p>${cats
        .map((k) => {
          const groups = ['linux', 'cmd', 'ps']
            .map((p) => [p, list.filter((c) => c.cat === k && c.platform === p)])
            .filter(([, items]) => items.length);
          return panel(CATEGORIES[k], `<div class="os-cmd-cols">${groups
            .map(([p, items]) => `<div class="os-cmd-col"><h3 class="os-cmd-plat">${esc(PLATFORMS[p])}</h3>${items.map(entry).join('')}</div>`)
            .join('')}</div>`);
        })
        .join('')}`;
    }
  });
}

/* ================================================================ Scheduling */
const SCHED_EXAMPLES = [
  { label: 'Lehrbuch FCFS (24, 3, 3)', algo: 'fcfs', procs: [['P1', 0, 24, 1], ['P2', 0, 3, 1], ['P3', 0, 3, 1]] },
  { label: 'SJF mit Ankünften', algo: 'sjf', procs: [['P1', 0, 7, 1], ['P2', 2, 4, 1], ['P3', 4, 1, 1], ['P4', 5, 4, 1]] },
  { label: 'SRTF (8, 4, 9, 5)', algo: 'srtf', procs: [['P1', 0, 8, 1], ['P2', 1, 4, 1], ['P3', 2, 9, 1], ['P4', 3, 5, 1]] },
  { label: 'Priority (Lehrbuch)', algo: 'prio', procs: [['P1', 0, 10, 3], ['P2', 0, 1, 1], ['P3', 0, 2, 4], ['P4', 0, 1, 5], ['P5', 0, 5, 2]] },
  { label: 'Round Robin q = 2', algo: 'rr', quantum: 2, procs: [['P1', 0, 5, 1], ['P2', 1, 3, 1], ['P3', 3, 2, 1], ['P4', 12, 2, 1]] }
];

function scheduling(container) {
  let procs = SCHED_EXAMPLES[4].procs.map(([name, arrival, burst, priority]) => ({ name, arrival: String(arrival), burst: String(burst), priority: String(priority) }));
  const defaults = { algo: 'rr', quantum: '2', prio: 'low' };
  let result = null;
  const colorOf = (name) => (result ? PALETTE[result.procs.findIndex((p) => p.name === name) % PALETTE.length] : 'slate');

  container.innerHTML = `
    ${panel('', `<div class="row-between"><p class="small subtle mb-0">Modell eines Einprozessorsystems: ganzzahlige Zeiteinheiten, Kontextwechsel ohne Kosten, keine Ein-/Ausgabe-Wartezeiten.</p>${simBadge}</div>`)}
    ${layout(
      panel('Prozesse', `
        <div id="sched-form">
          <div class="table-wrap"><table class="data tool-table os-proc-table"><thead><tr><th>Name</th><th><abbr title="Ankunftszeit">Ankunft</abbr></th><th><abbr title="Laufzeit (Burst)">Dauer</abbr></th><th><abbr title="Priorität">Prio</abbr></th><th aria-label="Entfernen"></th></tr></thead><tbody id="proc-rows"></tbody></table></div>
          <div class="row mt-1"><button type="button" class="btn btn-sm" id="proc-add">+ Prozess hinzufügen</button><span class="small subtle">höchstens ${SCHED.maxProcesses} Prozesse; Ankunft 0–${SCHED.maxArrival}, Laufzeit 1–${SCHED.maxBurst}</span></div>
          <div class="form-row mt-1">
            ${field({ id: 'algo', label: 'Algorithmus', value: defaults.algo, options: Object.entries(ALGORITHMS) })}
            <div data-show="rr">${field({ id: 'quantum', label: 'Zeitquantum q', value: defaults.quantum, mono: true, attrs: 'inputmode="numeric"' })}</div>
          </div>
          <div data-show="prio">${segmented({ name: 'prio', label: 'Prioritätskonvention', value: defaults.prio, options: [['low', 'kleinere Zahl = höhere Priorität'], ['high', 'größere Zahl = höhere Priorität']] })}</div>
          <div class="tool-actions row">${SCHED_EXAMPLES.map((e, i) => `<button type="button" class="btn btn-sm" data-sched-example="${i}">Beispiel: ${esc(e.label)}</button>`).join('')}<button type="button" class="btn btn-sm btn-ghost" id="sched-reset">Zurücksetzen</button></div>
        </div>
        ${explanation(`
          <ul>
            <li><strong>FCFS</strong>: in Ankunftsreihenfolge, jeder Prozess läuft bis zum Ende.</li>
            <li><strong>SJF</strong> (nicht präemptiv): Unter den bereiten Prozessen läuft der mit der kürzesten Laufzeit bis zum Ende. Minimiert die mittlere Wartezeit, wenn alle gleichzeitig ankommen – setzt aber bekannte Laufzeiten voraus.</li>
            <li><strong>SRTF</strong> (präemptiv): Kommt ein Prozess mit kürzerer Restlaufzeit an, verdrängt er den laufenden.</li>
            <li><strong>Priority</strong> (nicht präemptiv): höchste Priorität zuerst; Gefahr des Verhungerns (Starvation) niedriger Prioritäten, Abhilfe: Aging.</li>
            <li><strong>Round Robin</strong>: Jeder Prozess erhält reihum höchstens q Zeiteinheiten.</li>
          </ul>
          <p><strong>Kennzahlen</strong>: Durchlaufzeit (Turnaround) = Fertigstellung − Ankunft; Wartezeit = Durchlaufzeit − Laufzeit; Antwortzeit = erster CPU-Zugriff − Ankunft.</p>
          <p><strong>Gleichstandsregel</strong>: frühere Ankunft zuerst, danach Reihenfolge der Eingabe. Bei SRTF behält der laufende Prozess bei gleicher Restlaufzeit die CPU.</p>
          <p><strong>Round-Robin-Konvention</strong>: Prozesse, die während eines Zeitschlitzes oder genau zu dessen Ende ankommen, werden <em>vor</em> dem gerade unterbrochenen Prozess in die Warteschlange gestellt. Lehrbücher handhaben das unterschiedlich – Ergebnisse können daher abweichen.</p>`)}
      `),
      '<div id="sched-out"></div><div id="sched-sim"></div>'
    )}`;

  const form = container.querySelector('#sched-form');
  const rowsEl = container.querySelector('#proc-rows');
  const out = container.querySelector('#sched-out');
  const sim = container.querySelector('#sched-sim');
  const stepper = createStepper({ count: () => result?.frames.length ?? 1, show: (i) => showFrame(i), interval: 1100, label: 'Scheduling-Simulation' });

  const drawRows = () => {
    rowsEl.innerHTML = procs
      .map((p, i) => `<tr data-row="${i}">
        <td><input class="input mono" data-k="name" value="${esc(p.name)}" aria-label="Name Prozess ${i + 1}" maxlength="12" data-no-live></td>
        <td><input class="input mono" data-k="arrival" value="${esc(p.arrival)}" inputmode="numeric" aria-label="Ankunftszeit Prozess ${i + 1}" data-no-live></td>
        <td><input class="input mono" data-k="burst" value="${esc(p.burst)}" inputmode="numeric" aria-label="Laufzeit Prozess ${i + 1}" data-no-live></td>
        <td><input class="input mono" data-k="priority" value="${esc(p.priority)}" inputmode="numeric" aria-label="Priorität Prozess ${i + 1}" data-no-live></td>
        <td><button type="button" class="icon-btn danger" data-remove="${i}" aria-label="Prozess ${i + 1} entfernen" title="Entfernen"${procs.length <= 1 ? ' disabled' : ''}>✕</button></td>
      </tr>`)
      .join('');
    container.querySelector('#proc-add').disabled = procs.length >= SCHED.maxProcesses;
  };

  const gantt = (segments, end, upTo = Infinity) => {
    const total = Math.max(1, end);
    return `<div class="os-gantt-wrap"><div class="os-gantt" style="min-width:${Math.min(1400, Math.max(280, total * 14))}px">${segments
      .map((s) => {
        const visible = s.start < upTo;
        const cls = s.name === null ? 'os-gantt-idle' : `os-c-${colorOf(s.name)}`;
        return `<div class="os-gantt-seg ${cls}${visible ? '' : ' os-gantt-future'}" style="flex:${s.end - s.start}" title="${esc(s.name ?? 'Leerlauf')}: ${s.start}–${s.end}"><span class="os-gantt-label">${esc(s.name ?? 'idle')}</span><span class="os-gantt-t">${s.start}</span></div>`;
      })
      .join('')}<span class="os-gantt-end">${end}</span></div></div>`;
  };

  const avgText = (sum, n) => {
    const v = rat(BigInt(sum), BigInt(n));
    return `${fmt(v, { maxFrac: 2 })}${v.d !== 1n ? ` (= ${sum}/${n})` : ''}`;
  };

  const compute = () => {
    const v = readForm(form);
    form.querySelectorAll('[data-show]').forEach((el) => (el.hidden = !(el.dataset.show === v.algo)));
    try {
      result = simulate(procs, { algorithm: v.algo, quantum: v.quantum, lowerIsHigher: v.prio !== 'high' });
    } catch (error) {
      result = null;
      out.innerHTML = panel('Ergebnis', errorHtml(error));
      sim.innerHTML = '';
      return;
    }
    const r = result;
    const n = r.avg.n;
    out.innerHTML = panel(`Ergebnis – ${ALGORITHMS[v.algo]}${v.algo === 'rr' ? `, q = ${v.quantum}` : ''}`, `
      <h3 class="os-sub">Gantt-Diagramm</h3>
      ${gantt(r.segments, r.end)}
      ${table(
        ['Prozess', 'Ankunft', 'Laufzeit', ...(v.algo === 'prio' ? ['Priorität'] : []), 'Start', 'Ende', 'Durchlauf', 'Warten', 'Antwort'],
        r.results.map((x) => [{ html: `<span class="os-dot os-c-${colorOf(x.name)}"></span>${esc(x.name)}` }, x.arrival, x.burst, ...(v.algo === 'prio' ? [x.priority] : []), x.start, x.completion, x.turnaround, x.waiting, x.response])
      )}
      ${resultList([
        { label: 'Ø Wartezeit', value: avgText(r.avg.waiting, n), strong: true },
        { label: 'Ø Durchlaufzeit', value: avgText(r.avg.turnaround, n) },
        { label: 'Ø Antwortzeit', value: avgText(r.avg.response, n) },
        { label: 'Gesamtdauer', value: `${r.end} Zeiteinheiten`, copy: false }
      ])}
      ${steps([
        'Durchlaufzeit = Ende − Ankunft; Wartezeit = Durchlaufzeit − Laufzeit; Antwortzeit = Start − Ankunft',
        ...r.results.map((x) => `${x.name}: Durchlauf ${x.completion} − ${x.arrival} = ${x.turnaround}; Warten ${x.turnaround} − ${x.burst} = ${x.waiting}; Antwort ${x.start} − ${x.arrival} = ${x.response}`),
        `Ø Wartezeit = (${r.results.map((x) => x.waiting).join(' + ')}) / ${n} = ${avgText(r.avg.waiting, n)}`
      ], { open: false })}
    `);
    sim.innerHTML = panel('Schritt für Schritt', `${stepper.html}<div id="sched-frame"></div>`);
    stepper.mount(sim);
    stepper.refresh(0);
  };

  function showFrame(i) {
    const el = sim.querySelector('#sched-frame');
    if (!el || !result) return;
    const f = result.frames[i];
    const chip = (name) => `<span class="os-chip os-c-${colorOf(name)}">${esc(name)}</span>`;
    el.innerHTML = `
      <p class="os-frame-time"><strong>t = ${f.time}</strong> – ${esc(f.note)}</p>
      ${f.arrived.length ? `<p class="small">Neu angekommen: ${f.arrived.map(chip).join(' ')}</p>` : ''}
      <dl class="tool-result os-frame">
        <dt>CPU</dt><dd>${f.running ? chip(f.running) : '<span class="subtle">frei</span>'}</dd>
        <dt>Ready-Queue</dt><dd class="os-queue">${f.ready.length ? f.ready.map(chip).join('<span class="faint">→</span>') : '<span class="subtle">leer</span>'}</dd>
        <dt>Fertig</dt><dd>${f.done.length ? f.done.map(chip).join(' ') : '<span class="subtle">noch keiner</span>'}</dd>
        <dt>Restlaufzeit</dt><dd class="small">${f.remaining.map((p) => `${esc(p.name)}: ${p.remaining}`).join(' · ')}</dd>
      </dl>
      <p class="small subtle mt-1">Bisheriger Verlauf:</p>
      ${f.segments.length ? gantt(f.segments, f.segments.at(-1).end) : '<p class="small subtle">noch nichts gelaufen</p>'}`;
  }

  let timer = null;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(compute, 250);
  };
  rowsEl.addEventListener('input', (event) => {
    const input = event.target.closest('[data-k]');
    if (!input) return;
    procs[Number(input.closest('tr').dataset.row)][input.dataset.k] = input.value;
    schedule();
  });
  rowsEl.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove]');
    if (!button || procs.length <= 1) return;
    procs.splice(Number(button.dataset.remove), 1);
    drawRows();
    compute();
  });
  container.querySelector('#proc-add').addEventListener('click', () => {
    if (procs.length >= SCHED.maxProcesses) return;
    let k = procs.length + 1;
    while (procs.some((p) => p.name === `P${k}`)) k += 1;
    const last = procs[procs.length - 1];
    procs.push({ name: `P${k}`, arrival: last ? last.arrival : '0', burst: '3', priority: '1' });
    drawRows();
    compute();
    rowsEl.querySelector('tr:last-child input')?.focus();
  });
  form.addEventListener('change', (event) => {
    if (event.target.closest('[data-k]')) return;
    compute();
  });
  form.querySelector('#quantum').addEventListener('input', schedule);
  const load = (ex) => {
    procs = ex.procs.map(([name, arrival, burst, priority]) => ({ name, arrival: String(arrival), burst: String(burst), priority: String(priority) }));
    writeForm(form, { ...defaults, algo: ex.algo, quantum: String(ex.quantum ?? 2) });
    drawRows();
    compute();
  };
  form.querySelectorAll('[data-sched-example]').forEach((b) => b.addEventListener('click', () => load(SCHED_EXAMPLES[Number(b.dataset.schedExample)])));
  form.querySelector('#sched-reset').addEventListener('click', () => load(SCHED_EXAMPLES[4]));
  drawRows();
  compute();
  return () => {
    window.clearTimeout(timer);
    stepper.destroy();
  };
}

/* ================================================================ RAID & Backup */
const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const BACKUP_EXAMPLES = [
  { label: 'Voll + inkrementell', types: ['full', 'incr', 'incr', 'incr', 'incr', 'incr', 'incr'] },
  { label: 'Voll + differenziell', types: ['full', 'diff', 'diff', 'diff', 'diff', 'diff', 'diff'] },
  { label: 'Gemischt', types: ['full', 'incr', 'incr', 'diff', 'incr', 'incr', 'none'] },
  { label: 'Täglich voll', types: ['full', 'full', 'full', 'full', 'full', 'full', 'full'] }
];
const CHANGES = ['5', '12', '8', '20', '6', '3', '2'];

function raidBackup(container) {
  const raidRows = [
    ['RAID 0', 'Striping: Daten blockweise auf alle Platten verteilt, keine Redundanz', '2', 'n × C', 'keine – fällt eine Platte aus, sind alle Daten verloren', 'Lesen und Schreiben schnell (parallel)', 'kein Rebuild möglich'],
    ['RAID 1', 'Spiegelung: jede Platte enthält dieselben Daten', '2', 'C (eine Platte)', 'n − 1 Platten', 'Lesen schnell (von beiden Spiegeln), Schreiben wie eine Platte', 'Kopie vom Spiegelpartner; vergleichsweise unkritisch'],
    ['RAID 5', 'Striping mit verteilter Parität (XOR)', '3', '(n − 1) × C', '1 Platte', 'Lesen gut; kleine Schreibzugriffe langsamer (Parität lesen, neu berechnen, schreiben)', 'alle übrigen Platten werden vollständig gelesen – bei großen Platten Stunden bis Tage ohne Redundanz; ein zweiter Ausfall oder ein nicht lesbarer Sektor gefährdet die Daten'],
    ['RAID 6', 'Striping mit doppelter Parität', '4', '(n − 2) × C', '2 Platten', 'Lesen gut; Schreiben langsamer als RAID 5', 'auch während des Rebuilds noch gegen einen weiteren Ausfall geschützt'],
    ['RAID 10', 'Stripe über Spiegelpaare (RAID 1+0)', '4 (gerade Anzahl)', 'n/2 × C', 'mind. 1, bis zu einer Platte je Spiegelpaar', 'Lesen und Schreiben schnell', 'schnell: nur der Spiegelpartner wird kopiert; fällt dieser währenddessen aus, ist das Array verloren']
  ];
  container.innerHTML = `
    ${panel('RAID-Level im Überblick', `
      ${notice('Nutzbare Kapazität für konkrete Plattengrößen berechnet das Werkzeug <a href="#/werkzeuge/raid">RAID-Kapazität</a>.', 'info', { html: true })}
      ${table(['Level', 'Prinzip', 'Mind. Platten', 'Kapazität', 'Fehlertoleranz', 'Lesen/Schreiben', 'Rebuild'], raidRows, { className: 'os-raid-table' })}
      <p class="small subtle mt-1">n = Anzahl Platten, C = Kapazität der kleinsten Platte. Angaben gelten für klassisches Hardware-/Software-RAID (z. B. Linux mdadm); Dateisysteme wie ZFS oder Btrfs haben eigene Varianten.</p>
      ${notice('<strong>RAID ersetzt kein Backup.</strong> RAID schützt nur vor dem Ausfall einzelner Platten. Gelöschte oder von Ransomware verschlüsselte Dateien, Softwarefehler, Diebstahl, Brand oder Überspannung treffen alle Platten des Arrays gleichzeitig – Änderungen werden sofort auf alle Platten übernommen.', 'warning', { html: true })}
    `)}
    ${panel('Backup-Arten', `
      ${table(['Art', 'Sichert', 'Speicherbedarf', 'Sicherung', 'Wiederherstellung'], [
        ['Vollsicherung', 'alle Daten', 'hoch (jedes Mal alles)', 'langsam', 'einfach: nur die letzte Vollsicherung'],
        ['Inkrementell', 'Änderungen seit der letzten Sicherung (gleich welcher Art)', 'gering', 'schnell', 'aufwendig: Vollsicherung + alle folgenden Inkremente; fehlt eines, ist alles danach unbrauchbar'],
        ['Differenziell', 'Änderungen seit der letzten Vollsicherung', 'wächst bis zur nächsten Vollsicherung', 'mittel, wird täglich langsamer', 'Vollsicherung + nur die letzte differenzielle Sicherung']
      ], { className: 'os-text-table' })}
    `)}
    ${layout(
      panel('Wochenplan ausprobieren', `
        <div id="bk-form">
          ${field({ id: 'total', label: 'Datenbestand (GB)', value: '500', mono: true, attrs: 'inputmode="decimal"' })}
          <div class="table-wrap"><table class="data tool-table os-bk-table"><thead><tr><th>Tag</th><th>Sicherung</th><th><abbr title="an diesem Tag geänderte Daten in GB">Δ GB</abbr></th></tr></thead><tbody>
            ${DAYS.map((d, i) => `<tr><th scope="row">${d}</th><td><select class="select" name="t${i}" aria-label="Sicherungsart ${d}">${Object.entries(BACKUP_TYPES).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></td><td><input class="input mono" name="c${i}" value="${CHANGES[i]}" inputmode="decimal" aria-label="An ${d} geänderte Daten in GB"></td></tr>`).join('')}
          </tbody></table></div>
          <p class="hint">Sicherung jeweils abends; Δ GB = an diesem Tag geänderte Daten.</p>
          ${field({ id: 'restore', label: 'Wiederherstellen: Stand vom', value: '4', options: DAYS.map((d, i) => [String(i), `${d} (nach der Sicherung)`]) })}
          ${toolActions({ examples: BACKUP_EXAMPLES })}
        </div>
      `),
      '<div id="bk-out"></div>'
    )}
    ${panel('3-2-1-Regel und Wiederherstellungstests', `
      <ul class="os-list">
        <li><strong>3</strong> Kopien der Daten (das Original plus zwei Sicherungen),</li>
        <li>auf <strong>2</strong> verschiedenen Medien bzw. Systemen (z. B. NAS und externe Festplatte),</li>
        <li><strong>1</strong> Kopie außer Haus bzw. offline (getrennt vom Netz – schützt vor Brand, Diebstahl und Ransomware).</li>
      </ul>
      ${notice('Ein Backup ist erst dann etwas wert, wenn die Wiederherstellung funktioniert: Restore regelmäßig testen (Stichproben und vollständige Wiederherstellung), Sicherungsprotokolle prüfen und die Dauer einer Wiederherstellung kennen.', 'info')}
    `)}`;

  const form = container.querySelector('#bk-form');
  const defaults = Object.fromEntries([['total', '500'], ['restore', '4'], ...DAYS.map((_, i) => [`t${i}`, BACKUP_EXAMPLES[2].types[i]]), ...DAYS.map((_, i) => [`c${i}`, CHANGES[i]])]);
  writeForm(form, defaults);
  live(form, {
    output: container.querySelector('#bk-out'),
    defaults,
    examples: BACKUP_EXAMPLES.map((e) => ({ values: Object.fromEntries(e.types.map((t, i) => [`t${i}`, t])) })),
    compute: (v) => {
      const days = DAYS.map((d, i) => ({ label: d, type: v[`t${i}`], changed: v[`c${i}`] }));
      const plan = planBackups(days, v.total);
      const target = Number(v.restore);
      const chain = restoreChain(plan.rows, target);
      const gb = (x) => `${x.toLocaleString('de-DE', { maximumFractionDigits: 2 })} GB`;
      const rows = plan.rows.map((r, i) => {
        const inChain = chain.ok && chain.chain.includes(i);
        return [
          { html: `${esc(r.label)}${i === target ? ' <span class="badge badge-info">Ziel</span>' : ''}` },
          { html: `${esc(BACKUP_TYPES[r.type])}${inChain ? ' <span class="badge badge-success">nötig</span>' : ''}` },
          r.type === 'none' ? '–' : gb(r.size),
          { html: `<span class="small">${esc(r.note)}</span>` }
        ];
      });
      return panel('Ergebnis', `
        ${table(['Tag', 'Sicherung', 'Größe', 'Inhalt'], rows, { className: 'os-bk-result' })}
        ${resultList([
          { label: 'Speicherbedarf der Woche', value: gb(plan.totalStored), strong: true },
          { label: `Für ${DAYS[target]} nötig`, value: chain.ok ? chain.chain.map((i) => `${DAYS[i]} (${BACKUP_TYPES[plan.rows[i].type]})`).join(' → ') : '–', mono: false },
          chain.ok ? { label: 'Einzuspielen', value: `${chain.chain.length} Sicherung${chain.chain.length === 1 ? '' : 'en'}, ${gb(chain.size)}`, mono: false, copy: false } : null
        ])}
        ${chain.ok ? '' : notice(chain.message, 'error')}
        ${chain.ok && chain.lost.length ? notice(`An ${chain.lost.map((i) => DAYS[i]).join(', ')} wurde nicht gesichert – diese Änderungen fehlen bei der Wiederherstellung.`, 'warning') : ''}
        ${steps([
          'Letzte Vollsicherung bis zum Zieltag suchen.',
          'Gibt es danach eine differenzielle Sicherung, genügt die jüngste davon.',
          'Danach jede inkrementelle Sicherung in zeitlicher Reihenfolge einspielen.'
        ], { title: 'Regel für die Wiederherstellung', open: false })}
        ${notice('Annahmen: gleich bleibender Datenbestand; die an verschiedenen Tagen geänderten Daten überschneiden sich nicht (sonst wären differenzielle Sicherungen kleiner); keine Kompression oder Deduplizierung.', 'assumption')}
      `);
    }
  });
}

const TOOLS = {
  dateirechte,
  befehle,
  scheduling,
  'raid-backup': raidBackup
};

export function render(toolId, container, ctx) {
  const tool = TOOLS[toolId];
  if (!tool) throw new Error(`Unbekanntes Werkzeug: ${toolId}`);
  return tool(container, ctx);
}

