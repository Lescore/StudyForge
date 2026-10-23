/**
 * Werkzeuge „Datenmengen & Zahlensysteme“.
 * Die Rechenlogik liegt in ../core/ (ohne DOM, getestet); hier nur Oberfläche.
 */
import { esc, field, segmented, checkbox, layout, panel, resultList, steps, notice, explanation, toolActions, live, table, copyButton } from '../kit.js';
import { fmt, mul, div, rat, add, sub, cmp, parseDecimal, toSignificant, formatDecimalText, toNumber, ZERO, InputError, groupDigits } from '../core/num.js';
import { SIZE_UNITS, RATE_UNITS, TIME_UNITS, convertAll, unitDefinition, sizeUnit, rateUnit, formatDuration, bestUnit } from '../core/units.js';
import { transfer, parseFileList, usage, mediaNeeded, growth, periodsUntilFull } from '../core/storage.js';
import { raidCapacity, LEVELS } from '../core/raid.js';
import { convertBase, divisionSteps, positionalTerms, BASE_NAMES, DIGITS } from '../core/bases.js';
import { parseInteger, toPattern, describe, compute, twosComplementSteps, toggleBit, ranges, bitString, OPERATIONS, WIDTHS } from '../core/bits.js';
import { analyzeText, parseBytes, decodeUtf8, formatBytes, utf8BitLayout } from '../core/utf8.js';
import { patternFromNumberText, patternFromBits, decode, exactDecimal, limits } from '../core/ieee754.js';
import { addressSpace, bitsNeeded, parseAddress, hexAddress, layoutRanges, parseFields, structLayout, optimizedOrder, ABIS } from '../core/address.js';

const sizeOptions = [
  { group: 'Bit', options: SIZE_UNITS.filter((u) => u.id.includes('bit')).map((u) => [u.id, u.label]) },
  { group: 'Byte – SI (Basis 1000)', options: SIZE_UNITS.filter((u) => !u.id.includes('bit') && u.system !== 'iec').map((u) => [u.id, u.label]) },
  { group: 'Byte – IEC (Basis 1024)', options: SIZE_UNITS.filter((u) => !u.id.includes('bit') && u.system === 'iec').map((u) => [u.id, u.label]) }
];
const rateOptions = [
  { group: 'Bit pro Sekunde', options: RATE_UNITS.filter((u) => u.id.includes('bit')).map((u) => [u.id, u.label]) },
  { group: 'Byte pro Sekunde', options: RATE_UNITS.filter((u) => !u.id.includes('bit')).map((u) => [u.id, u.label]) }
];

/* ------------------------------------------------------------ 3.1 Datenmengen */
function datenmengen(container) {
  const defaults = { kind: 'size', value: '1', unit: 'GiB', rvalue: '100', runit: 'Mbit/s' };
  const examples = [
    { label: '1 MiB in Byte', values: { kind: 'size', value: '1', unit: 'MiB' } },
    { label: '500 GB Festplatte', values: { kind: 'size', value: '500', unit: 'GB' } },
    { label: '100 Mbit/s in MB/s', values: { kind: 'rate', rvalue: '100', runit: 'Mbit/s' } }
  ];
  container.innerHTML = layout(
    panel('Eingabe', `
      ${field({ id: 'kind', label: 'Art', value: defaults.kind, options: [['size', 'Datenmenge'], ['rate', 'Datenrate (pro Sekunde)']] })}
      <div class="form-row" data-show="size">
        ${field({ id: 'value', label: 'Wert', value: defaults.value, mono: true, attrs: 'inputmode="decimal"' })}
        ${field({ id: 'unit', label: 'Einheit', value: defaults.unit, options: sizeOptions })}
      </div>
      <div class="form-row" data-show="rate">
        ${field({ id: 'rvalue', label: 'Wert', value: defaults.rvalue, mono: true, attrs: 'inputmode="decimal"' })}
        ${field({ id: 'runit', label: 'Einheit', value: defaults.runit, options: rateOptions })}
      </div>
      <p class="hint">Dezimaltrennzeichen Komma oder Punkt, Exponent erlaubt (z. B. 1,5e6). Bitte keine Tausenderpunkte.</p>
      ${toolActions({ examples })}
      ${explanation(`
        <p><strong>SI-Präfixe</strong> (k, M, G, T …) sind Zehnerpotenzen: 1 kB = 1000 Byte, 1 MB = 1 000 000 Byte. So rechnen Hersteller von Festplatten und Netzwerken.</p>
        <p><strong>IEC-Präfixe</strong> (Ki, Mi, Gi …) sind Zweierpotenzen: 1 KiB = 1024 Byte, 1 MiB = 1 048 576 Byte. So rechnen Arbeitsspeicher und viele Betriebssysteme – Windows schreibt dabei allerdings „GB“, meint aber GiB.</p>
        <p><strong>Bit und Byte:</strong> 1 Byte = 8 Bit. Datenraten werden meist in Bit pro Sekunde angegeben (Mbit/s), Dateigrößen in Byte. 100 Mbit/s sind daher nur 12,5 MB/s.</p>
        <p>Alle Ergebnisse werden mit exakten Brüchen berechnet; „≈“ markiert eine gerundete Anzeige.</p>`)}
    `),
    '<div id="out"></div>'
  );
  const toggle = (kind) => container.querySelectorAll('[data-show]').forEach((el) => (el.hidden = el.dataset.show !== kind));
  live(container, {
    output: '#out',
    defaults,
    examples,
    compute: (v) => {
      toggle(v.kind);
      const isRate = v.kind === 'rate';
      const { from, value, bits, list } = convertAll(isRate ? v.rvalue : v.value, isRate ? v.runit : v.unit);
      const bytes = div(bits, rat(8n));
      const rows = list.map(({ unit, value: converted }) => [
        { html: `${esc(unit.id)}${unit.system === 'iec' ? ' <span class="tiny faint">IEC</span>' : unit.system === 'si' ? ' <span class="tiny faint">SI</span>' : ''}` },
        fmt(converted, { sig: 15 })
      ]);
      const valueText = fmt(value, { sig: 20 });
      return panel('Ergebnis', `
        ${resultList([
          { label: 'Eingabe', value: `${valueText} ${from.id}`, strong: true },
          { label: 'in Bit', value: `${fmt(bits, { sig: 30 })} bit${isRate ? '/s' : ''}` },
          { label: 'in Byte', value: `${fmt(bytes, { sig: 30 })} B${isRate ? '/s' : ''}` }
        ])}
        ${steps([
          unitDefinition(from),
          `${valueText} × ${fmt(from.bits, { sig: 30 })} = ${fmt(bits, { sig: 30 })} Bit${isRate ? '/s' : ''}`,
          `Bit → Byte: ${fmt(bits, { sig: 30 })} ÷ 8 = ${fmt(bytes, { sig: 30 })} Byte${isRate ? '/s' : ''}`,
          'Zieleinheit: Bitmenge ÷ Bit pro Zieleinheit (z. B. ÷ 8 388 608 für MiB)'
        ])}
        <div class="mt-2">${table(['Einheit', 'Wert'], rows)}</div>
        ${isRate || from.system === 'bit' ? '' : notice(`SI ↔ IEC: ${valueText} ${from.id} = ${fmt(div(bits, sizeUnit(from.system === 'iec' ? 'GB' : 'GiB').bits), { sig: 8 })} ${from.system === 'iec' ? 'GB' : 'GiB'}. Windows zeigt GiB-Werte mit der Beschriftung „GB“ an.`, 'info')}
      `);
    }
  });
}

/* ------------------------------------------------------------ gemeinsame Helfer */
const SIZE_SHORT = [
  { group: 'SI (Basis 1000)', options: ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB'].map((id) => [id, id]) },
  { group: 'IEC (Basis 1024)', options: ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB'].map((id) => [id, id]) },
  { group: 'Bit', options: ['bit', 'kbit', 'Mbit', 'Gbit', 'Tbit'].map((id) => [id, id]) }
];
const RATE_SHORT = [
  { group: 'Bit pro Sekunde', options: ['bit/s', 'kbit/s', 'Mbit/s', 'Gbit/s', 'Tbit/s'].map((id) => [id, id]) },
  { group: 'Byte pro Sekunde (SI)', options: ['B/s', 'kB/s', 'MB/s', 'GB/s'].map((id) => [id, id]) },
  { group: 'Byte pro Sekunde (IEC)', options: ['KiB/s', 'MiB/s', 'GiB/s'].map((id) => [id, id]) }
];
const TIME_OPTIONS = TIME_UNITS.map((u) => [u.id, u.label]);

const bitsOf = (valueText, unitId, label) => mul(parseDecimal(valueText, { label, allowNegative: false }), sizeUnit(unitId).bits);
/** Bitmenge in SI- und IEC-Einheit, z. B. „1,5 GB (≈ 1,397 GiB)“. */
const both = (bits, opts = {}) => {
  const si = bestUnit(bits, 'si', opts);
  const iec = bestUnit(bits, 'iec', opts);
  const a = `${fmt(si.value, { sig: 8 })} ${si.unit.id}`;
  const b = `${fmt(iec.value, { sig: 8 })} ${iec.unit.id}`;
  return si.unit.id === iec.unit.id ? a : `${a} (${b})`;
};
const bytesText = (bits) => `${fmt(div(bits, rat(8n)), { sig: 30 })} Byte`;

/* ------------------------------------------------------------ 3.2 Übertragungszeit */
function uebertragungszeit(container) {
  const defaults = { mode: 'time', size: '4,7', sizeUnit: 'GB', rate: '100', rateUnit: 'Mbit/s', time: '10', timeUnit: 'min', eff: '100' };
  const examples = [
    { label: '4,7 GB bei 100 Mbit/s', values: { mode: 'time', size: '4,7', sizeUnit: 'GB', rate: '100', rateUnit: 'Mbit/s', eff: '100' } },
    { label: '1 TB über Gigabit, 90 %', values: { mode: 'time', size: '1', sizeUnit: 'TB', rate: '1', rateUnit: 'Gbit/s', eff: '90' } },
    { label: 'Rate für 20 GiB in 1 h', values: { mode: 'rate', size: '20', sizeUnit: 'GiB', time: '1', timeUnit: 'h', eff: '100' } },
    { label: 'Menge in 8 h mit 50 Mbit/s', values: { mode: 'size', rate: '50', rateUnit: 'Mbit/s', time: '8', timeUnit: 'h', eff: '100' } }
  ];
  container.innerHTML = layout(
    panel('Eingabe', `
      ${segmented({ name: 'mode', label: 'Was soll berechnet werden?', value: defaults.mode, options: [['time', 'Dauer'], ['rate', 'Nötige Datenrate'], ['size', 'Übertragbare Menge']] })}
      <div class="form-row" data-need="size">
        ${field({ id: 'size', label: 'Datenmenge', value: defaults.size, mono: true, attrs: 'inputmode="decimal"' })}
        ${field({ id: 'sizeUnit', label: 'Einheit', value: defaults.sizeUnit, options: SIZE_SHORT })}
      </div>
      <div class="form-row" data-need="rate">
        ${field({ id: 'rate', label: 'Datenrate (nominal)', value: defaults.rate, mono: true, attrs: 'inputmode="decimal"' })}
        ${field({ id: 'rateUnit', label: 'Einheit', value: defaults.rateUnit, options: RATE_SHORT })}
      </div>
      <div class="form-row" data-need="time">
        ${field({ id: 'time', label: 'Zeit', value: defaults.time, mono: true, attrs: 'inputmode="decimal"' })}
        ${field({ id: 'timeUnit', label: 'Einheit', value: defaults.timeUnit, options: TIME_OPTIONS })}
      </div>
      ${field({ id: 'eff', label: 'Wirkungsgrad in % (Annahme)', value: defaults.eff, mono: true, attrs: 'inputmode="decimal"', hint: '100 % = theoretischer Wert. Kleiner Wert = Verluste durch Protokoll-Overhead, Auslastung usw.' })}
      ${toolActions({ examples })}
      ${explanation(`
        <p>Grundformel: <code>Zeit = Datenmenge ÷ Datenrate</code>. Dafür müssen beide in derselben Einheit vorliegen – hier wird alles in Bit und Bit/s umgerechnet.</p>
        <p>Typische Falle: Leitungen werden in <strong>Bit</strong>/s angegeben (Mbit/s), Dateien in <strong>Byte</strong>. 100 Mbit/s übertragen höchstens 12,5 MB pro Sekunde.</p>
        <p>Der <strong>Wirkungsgrad</strong> ist eine Annahme: Ethernet-, IP- und TCP-Header, WLAN-Verwaltung, Verschlüsselung und gleichzeitige Nutzung reduzieren die Nutzdatenrate. Ein Wert um 90–95 % ist bei kabelgebundenem Ethernet mit großen Paketen plausibel, bei WLAN oft deutlich weniger. Messwerte ersetzt er nicht.</p>
        <p>Für Latenz, RTT und Fenstergröße siehe <a href="#/werkzeuge/netzwerkdurchsatz">Durchsatz &amp; Latenz</a>.</p>`)}
    `),
    '<div id="out"></div>'
  );
  live(container, {
    output: '#out',
    defaults,
    examples,
    compute: (v) => {
      container.querySelectorAll('[data-need]').forEach((el) => (el.hidden = el.dataset.need === v.mode));
      const r = transfer({ mode: v.mode, size: v.size, sizeUnitId: v.sizeUnit, rate: v.rate, rateUnitId: v.rateUnit, time: v.time, timeUnitId: v.timeUnit, efficiencyPercent: v.eff });
      const effText = fmt(mul(r.eff, rat(100n)), { sig: 6 });
      const effectiveText = `${fmt(div(r.effectiveRate, rateUnit('Mbit/s').bits), { sig: 8 })} Mbit/s = ${fmt(div(r.effectiveRate, rateUnit('MB/s').bits), { sig: 8 })} MB/s`;
      const secondsText = `${fmt(r.seconds, { sig: 10 })} s`;
      const rows = [];
      const lines = [];
      if (v.mode === 'time') {
        rows.push({ label: 'Dauer', value: formatDuration(r.seconds), strong: true }, { label: 'in Sekunden', value: secondsText });
        lines.push(
          `Datenmenge: ${v.size} ${v.sizeUnit} = ${fmt(r.sizeBits, { sig: 30 })} Bit`,
          `Datenrate: ${v.rate} ${v.rateUnit} = ${fmt(r.rateBits, { sig: 30 })} Bit/s`,
          `Wirkungsgrad ${effText} %: nutzbar ${fmt(r.effectiveRate, { sig: 15 })} Bit/s`,
          `Zeit = ${fmt(r.sizeBits, { sig: 30 })} Bit ÷ ${fmt(r.effectiveRate, { sig: 15 })} Bit/s = ${secondsText}`
        );
      } else if (v.mode === 'rate') {
        rows.push(
          { label: 'Nötige Nennrate', value: `${fmt(div(r.rateBits, rateUnit('Mbit/s').bits), { sig: 8 })} Mbit/s`, strong: true },
          { label: 'entspricht', value: `${fmt(div(r.rateBits, rateUnit('MB/s').bits), { sig: 8 })} MB/s · ${fmt(div(r.rateBits, rateUnit('MiB/s').bits), { sig: 8 })} MiB/s` },
          { label: 'Nutzdatenrate', value: effectiveText }
        );
        lines.push(
          `Datenmenge: ${v.size} ${v.sizeUnit} = ${fmt(r.sizeBits, { sig: 30 })} Bit`,
          `Zeit: ${v.time} ${v.timeUnit} = ${secondsText}`,
          `Nutzdatenrate = ${fmt(r.sizeBits, { sig: 30 })} Bit ÷ ${secondsText} = ${fmt(r.effectiveRate, { sig: 12 })} Bit/s`,
          `Bei ${effText} % Wirkungsgrad: Nennrate = Nutzdatenrate ÷ ${fmt(r.eff, { sig: 6 })} = ${fmt(r.rateBits, { sig: 12 })} Bit/s`
        );
      } else {
        rows.push({ label: 'Übertragbare Menge', value: both(r.sizeBits), strong: true }, { label: 'in Byte', value: bytesText(r.sizeBits) });
        lines.push(
          `Datenrate: ${v.rate} ${v.rateUnit} = ${fmt(r.rateBits, { sig: 30 })} Bit/s, nutzbar bei ${effText} %: ${fmt(r.effectiveRate, { sig: 15 })} Bit/s`,
          `Zeit: ${v.time} ${v.timeUnit} = ${secondsText}`,
          `Menge = ${fmt(r.effectiveRate, { sig: 15 })} Bit/s × ${secondsText} = ${fmt(r.sizeBits, { sig: 20 })} Bit`
        );
      }
      return panel('Ergebnis', `
        ${resultList(rows)}
        ${steps(lines)}
        ${cmp(r.eff, rat(1n)) < 0 ? notice(`Mit ${effText} % Wirkungsgrad gerechnet – das ist eine Annahme, kein Messwert.`, 'assumption') : notice('Theoretischer Wert ohne Overhead und ohne Latenz. Reale Übertragungen dauern länger.', 'info')}
      `);
    }
  });
}

/* ------------------------------------------------------------ 3.3 Speicherplatz */
function speicherplatz(container) {
  const defaults = {
    mode: 'liste', list: '120 × 4,5 MB\n2500 × 800 KiB\n3 GiB', capacity: '1', capacityUnit: 'TB', used: '640', usedUnit: 'GB',
    data: '2', dataUnit: 'TB', medium: '500', mediumUnit: 'GB', reserve: '0', vendor: '2', vendorUnit: 'TB',
    start: '200', startUnit: 'GB', growthKind: 'percent', growthRate: '3', growthAdd: '20', growthAddUnit: 'GB', periods: '24', periodName: 'Monat', limit: '1', limitUnit: 'TB'
  };
  const examples = [
    { label: 'Fotos + Videos', values: { mode: 'liste', list: '4000 × 6 MB  # Fotos\n35 × 1,2 GB  # Videos' } },
    { label: '2-TB-Platte im OS', values: { mode: 'hersteller', vendor: '2', vendorUnit: 'TB' } },
    { label: 'Backup auf 25-GB-Blu-rays', values: { mode: 'medien', data: '180', dataUnit: 'GB', medium: '25', mediumUnit: 'GB', reserve: '5' } },
    { label: '+3 %/Monat', values: { mode: 'wachstum', start: '200', startUnit: 'GB', growthKind: 'percent', growthRate: '3', periods: '36', limit: '1', limitUnit: 'TB' } }
  ];
  const modes = [['liste', 'Gesamtgröße'], ['belegung', 'Belegung'], ['medien', 'Medienanzahl'], ['hersteller', 'Hersteller vs. OS'], ['wachstum', 'Wachstum']];
  container.innerHTML = layout(
    panel('Eingabe', `
      ${segmented({ name: 'mode', label: 'Berechnung', value: defaults.mode, options: modes })}
      <div data-mode="liste">
        ${field({ id: 'list', label: 'Dateien (eine Zeile je Posten)', value: defaults.list, rows: 6, mono: true, hint: 'Format: „Anzahl × Größe Einheit“ oder „Größe Einheit“. Kommentare mit #. Einheiten: B, kB, MB, GB, TB, KiB, MiB, GiB, TiB …' })}
      </div>
      <div data-mode="belegung" class="form-row">
        ${field({ id: 'capacity', label: 'Kapazität', value: defaults.capacity, mono: true })}
        ${field({ id: 'capacityUnit', label: 'Einheit', value: defaults.capacityUnit, options: SIZE_SHORT })}
        ${field({ id: 'used', label: 'Belegt', value: defaults.used, mono: true })}
        ${field({ id: 'usedUnit', label: 'Einheit', value: defaults.usedUnit, options: SIZE_SHORT })}
      </div>
      <div data-mode="medien" class="form-row">
        ${field({ id: 'data', label: 'Datenmenge', value: defaults.data, mono: true })}
        ${field({ id: 'dataUnit', label: 'Einheit', value: defaults.dataUnit, options: SIZE_SHORT })}
        ${field({ id: 'medium', label: 'Kapazität je Medium', value: defaults.medium, mono: true })}
        ${field({ id: 'mediumUnit', label: 'Einheit', value: defaults.mediumUnit, options: SIZE_SHORT })}
        ${field({ id: 'reserve', label: 'Reserve je Medium in %', value: defaults.reserve, mono: true, hint: 'z. B. für Dateisystem-Verwaltung' })}
      </div>
      <div data-mode="hersteller" class="form-row">
        ${field({ id: 'vendor', label: 'Herstellerangabe', value: defaults.vendor, mono: true })}
        ${field({ id: 'vendorUnit', label: 'Einheit', value: defaults.vendorUnit, options: [['GB', 'GB'], ['TB', 'TB'], ['PB', 'PB']] })}
      </div>
      <div data-mode="wachstum">
        <div class="form-row">
          ${field({ id: 'start', label: 'Startbestand', value: defaults.start, mono: true })}
          ${field({ id: 'startUnit', label: 'Einheit', value: defaults.startUnit, options: SIZE_SHORT })}
          ${field({ id: 'periodName', label: 'Periode', value: defaults.periodName, options: [['Monat', 'Monat'], ['Jahr', 'Jahr']] })}
          ${field({ id: 'periods', label: 'Anzahl Perioden', value: defaults.periods, type: 'number', attrs: 'min="1" max="600"' })}
        </div>
        ${segmented({ name: 'growthKind', label: 'Wachstum', value: defaults.growthKind, options: [['percent', 'Prozentual (Zinseszins)'], ['absolute', 'Fester Zuwachs']] })}
        <div class="form-row">
          <div data-growth="percent">${field({ id: 'growthRate', label: 'Wachstum je Periode in %', value: defaults.growthRate, mono: true })}</div>
          <div data-growth="absolute">${field({ id: 'growthAdd', label: 'Zuwachs je Periode', value: defaults.growthAdd, mono: true })}</div>
          <div data-growth="absolute">${field({ id: 'growthAddUnit', label: 'Einheit', value: defaults.growthAddUnit, options: SIZE_SHORT })}</div>
          ${field({ id: 'limit', label: 'Verfügbare Kapazität (optional)', value: defaults.limit, mono: true })}
          ${field({ id: 'limitUnit', label: 'Einheit', value: defaults.limitUnit, options: SIZE_SHORT })}
        </div>
      </div>
      ${toolActions({ examples })}
      ${explanation(`
        <p><strong>Hersteller</strong> geben Kapazitäten fast immer dezimal an (1 TB = 10<sup>12</sup> Byte). <strong>Windows</strong> rechnet binär (1 „GB“ = 2<sup>30</sup> Byte = 1 GiB), beschriftet aber mit „GB“/„TB“. Deshalb erscheint eine 2-TB-Platte dort als etwa 1,81 „TB“. <strong>macOS</strong> (seit 10.6) und viele Linux-Werkzeuge zeigen dezimal an; <code>df -h</code> zeigt dagegen binäre Werte mit „G“.</p>
        <p>Formatierte Datenträger bieten zusätzlich etwas weniger Platz, weil das Dateisystem Verwaltungsdaten anlegt – wie viel, hängt vom Dateisystem ab und wird hier nicht geschätzt.</p>
        <p>Prozentuales Wachstum ist Zinseszins: <code>Bestand × (1 + p)^n</code>. Ein fester Zuwachs wächst linear: <code>Bestand + n × Zuwachs</code>.</p>`)}
    `),
    '<div id="out"></div>'
  );
  live(container, {
    output: '#out',
    defaults,
    examples,
    compute: (v) => {
      container.querySelectorAll('[data-mode]').forEach((el) => (el.hidden = el.dataset.mode !== v.mode));
      container.querySelectorAll('[data-growth]').forEach((el) => (el.hidden = el.dataset.growth !== v.growthKind));
      if (v.mode === 'liste') {
        const { items, totalBits } = parseFileList(v.list);
        if (!items.length) throw new InputError('Bitte mindestens einen Posten eingeben.');
        return panel('Ergebnis', `
          ${resultList([{ label: 'Gesamt', value: both(totalBits), strong: true }, { label: 'in Byte', value: bytesText(totalBits) }])}
          <div class="mt-2">${table(['Zeile', 'Posten', 'Summe'], items.map((it) => [String(it.line), `${fmt(it.count)} × ${fmt(it.size)} ${it.unit.id}`, both(it.bits)]))}</div>
          ${steps(['Jede Zeile: Anzahl × Größe × Bit pro Einheit', 'Alle Zeilen in Bit addieren, dann in die passende Einheit umrechnen'])}`);
      }
      if (v.mode === 'belegung') {
        const cap = bitsOf(v.capacity, v.capacityUnit, 'Kapazität');
        const used = bitsOf(v.used, v.usedUnit, 'Belegt');
        const u = usage(cap, used);
        const pct = Math.max(0, Math.min(100, toNumber(u.percentUsed)));
        return panel('Ergebnis', `
          ${resultList([
            { label: 'Belegt', value: `${fmt(u.percentUsed, { maxFrac: 2 })} %`, strong: true },
            { label: u.overfull ? 'Fehlt' : 'Frei', value: both(u.overfull ? sub(used, cap) : u.free) },
            { label: 'Frei in %', value: `${fmt(u.percentFree, { maxFrac: 2 })} %` }
          ])}
          <div class="progress mt-2" role="progressbar" aria-valuenow="${pct.toFixed(1)}" aria-valuemin="0" aria-valuemax="100" aria-label="Belegung"><span style="width:${pct}%;${pct > 90 ? 'background:var(--danger)' : ''}"></span></div>
          ${u.overfull ? notice('Die belegte Menge ist größer als die Kapazität.', 'error') : ''}
          ${steps([`Kapazität: ${v.capacity} ${v.capacityUnit} = ${bytesText(cap)}`, `Belegt: ${v.used} ${v.usedUnit} = ${bytesText(used)}`, 'Belegung = belegt ÷ Kapazität × 100 %', 'Frei = Kapazität − belegt'])}`);
      }
      if (v.mode === 'medien') {
        const data = bitsOf(v.data, v.dataUnit, 'Datenmenge');
        const medium = bitsOf(v.medium, v.mediumUnit, 'Kapazität je Medium');
        const m = mediaNeeded(data, medium, parseDecimal(v.reserve || '0', { label: 'Reserve', allowNegative: false }));
        return panel('Ergebnis', `
          ${resultList([{ label: 'Benötigte Medien', value: m.count.toString(), strong: true }, { label: 'rechnerisch', value: fmt(m.exact, { sig: 8 }) }, { label: 'Nutzbar je Medium', value: both(m.usable) }])}
          ${steps([`Nutzbar je Medium = ${v.medium} ${v.mediumUnit} × (1 − ${v.reserve || 0} %)`, `Medien = Datenmenge ÷ nutzbare Kapazität = ${fmt(m.exact, { sig: 8 })}`, 'Aufrunden, weil nur ganze Medien möglich sind'])}
          ${notice('Dateien lassen sich beliebig über Medien verteilen. Große Einzeldateien, die nicht aufgeteilt werden können, erfordern unter Umständen mehr Medien.', 'assumption')}`);
      }
      if (v.mode === 'hersteller') {
        const bits = bitsOf(v.vendor, v.vendorUnit, 'Herstellerangabe');
        const giB = div(bits, sizeUnit('GiB').bits);
        const tiB = div(bits, sizeUnit('TiB').bits);
        const diff = mul(sub(rat(1n), div(div(bits, sizeUnit(v.vendorUnit === 'GB' ? 'GiB' : v.vendorUnit === 'TB' ? 'TiB' : 'PiB').bits), parseDecimal(v.vendor, { label: 'Herstellerangabe' }))), rat(100n));
        return panel('Ergebnis', `
          ${resultList([
            { label: 'In Byte', value: bytesText(bits) },
            { label: 'Binär (GiB)', value: `${fmt(giB, { sig: 8 })} GiB`, strong: true },
            { label: 'Binär (TiB)', value: `${fmt(tiB, { sig: 8 })} TiB` },
            { label: 'Windows zeigt', value: `≈ ${formatDecimalText(toSignificant(cmp(tiB, rat(1n)) >= 0 ? tiB : giB, 4).text)} ${cmp(tiB, rat(1n)) >= 0 ? 'TB' : 'GB'} (gemeint: ${cmp(tiB, rat(1n)) >= 0 ? 'TiB' : 'GiB'})` },
            { label: 'Scheinbarer Verlust', value: `${fmt(diff, { maxFrac: 2 })} %` }
          ])}
          ${steps([`${v.vendor} ${v.vendorUnit} = ${bytesText(bits)} (dezimal)`, `÷ 1 073 741 824 = ${fmt(giB, { sig: 10 })} GiB`, 'Es geht kein Speicher verloren – nur die Einheit ist eine andere.'])}`);
      }
      // Wachstum
      const startBits = bitsOf(v.start, v.startUnit, 'Startbestand');
      const opts = { kind: v.growthKind, rateText: v.growthRate, addBits: v.growthKind === 'absolute' ? bitsOf(v.growthAdd, v.growthAddUnit, 'Zuwachs') : ZERO, periods: Number(v.periods) };
      const g = growth(startBits, opts);
      const limitBits = v.limit.trim() ? bitsOf(v.limit, v.limitUnit, 'Kapazität') : null;
      const full = limitBits ? periodsUntilFull(startBits, limitBits, { ...opts, maxPeriods: 600 }) : undefined;
      const plural = v.periodName === 'Monat' ? 'Monate' : 'Jahre';
      const shown = g.rows.filter((row, i) => g.rows.length <= 24 || i % Math.ceil(g.rows.length / 24) === 0 || i === g.rows.length - 1);
      return panel('Ergebnis', `
        ${resultList([
          { label: `Nach ${v.periods} ${Number(v.periods) === 1 ? v.periodName : plural}`, value: both(g.end), strong: true },
          { label: 'Zuwachs', value: both(sub(g.end, startBits)) },
          limitBits ? { label: 'Kapazität reicht', value: full === 0 ? 'schon jetzt nicht' : full === null ? 'länger als 600 Perioden' : `${full - 1} ${full - 1 === 1 ? v.periodName : plural} – in Periode ${full} wird sie überschritten` } : null
        ])}
        <div class="mt-2">${table([v.periodName, 'Bestand'], shown.map((row) => [String(row.period), both(row.value)]))}</div>
        ${steps([v.growthKind === 'percent' ? `Bestand nach n Perioden = ${v.start} ${v.startUnit} × (1 + ${v.growthRate} %)^n` : `Bestand nach n Perioden = ${v.start} ${v.startUnit} + n × ${v.growthAdd} ${v.growthAddUnit}`])}
        ${notice('Wachstumsraten sind Annahmen. Reale Datenbestände wachsen selten gleichmäßig.', 'assumption')}`);
    }
  });
}

/* ------------------------------------------------------------ 3.4 RAID */
function raid(container) {
  const defaults = { level: '5', count: '4', size: '4', unit: 'TB', mixed: false, sizes: '4 TB\n4 TB\n8 TB\n8 TB', reserve: '0' };
  const examples = [
    { label: 'RAID 5 aus 4 × 4 TB', values: { level: '5', count: '4', size: '4', unit: 'TB', mixed: false } },
    { label: 'RAID 1 aus 2 × 2 TB', values: { level: '1', count: '2', size: '2', unit: 'TB', mixed: false } },
    { label: 'RAID 6, gemischte Größen', values: { level: '6', mixed: true, sizes: '4 TB\n4 TB\n6 TB\n8 TB\n8 TB' } },
    { label: 'RAID 10 aus 6 Platten', values: { level: '10', count: '6', size: '2', unit: 'TB', mixed: false } }
  ];
  container.innerHTML = layout(
    panel('Eingabe', `
      ${field({ id: 'level', label: 'RAID-Level', value: defaults.level, options: Object.entries(LEVELS).map(([k, l]) => [k, l.label]) })}
      ${checkbox({ id: 'mixed', label: 'Unterschiedliche Laufwerksgrößen eingeben' })}
      <div class="form-row mt-1" data-mixed="0">
        ${field({ id: 'count', label: 'Anzahl Laufwerke', value: defaults.count, type: 'number', attrs: 'min="1" max="64"' })}
        ${field({ id: 'size', label: 'Kapazität je Laufwerk', value: defaults.size, mono: true })}
        ${field({ id: 'unit', label: 'Einheit', value: defaults.unit, options: SIZE_SHORT })}
      </div>
      <div data-mixed="1">${field({ id: 'sizes', label: 'Laufwerke (eine Zeile je Laufwerk)', value: defaults.sizes, rows: 5, mono: true, hint: 'z. B. „4 TB“ oder „3,64 TiB“. Bei RAID 10 bilden Zeile 1+2, 3+4, … je ein Spiegelpaar.' })}</div>
      ${field({ id: 'reserve', label: 'Reserve in % (optional)', value: defaults.reserve, mono: true, hint: 'Anteil der nutzbaren Kapazität, der frei bleiben soll.' })}
      ${toolActions({ examples })}
      ${explanation(`
        <ul>
          <li><strong>RAID 0</strong> verteilt Daten auf alle Laufwerke – schnell, aber ohne Redundanz.</li>
          <li><strong>RAID 1</strong> spiegelt – jedes Laufwerk enthält alles.</li>
          <li><strong>RAID 5</strong> speichert verteilte Parität im Umfang eines Laufwerks, <strong>RAID 6</strong> im Umfang von zwei.</li>
          <li><strong>RAID 10</strong> stript über Spiegelpaare.</li>
        </ul>
        <p>Grundlagen zu RAID und Backup: <a href="#/werkzeuge/raid-backup">RAID &amp; Backup-Grundlagen</a>.</p>`)}
    `),
    '<div id="out"></div>'
  );
  live(container, {
    output: '#out',
    defaults,
    examples,
    compute: (v) => {
      container.querySelectorAll('[data-mixed]').forEach((el) => (el.hidden = el.dataset.mixed !== (v.mixed ? '1' : '0')));
      let drives;
      if (v.mixed) {
        drives = v.sizes.split('\n').map((line) => line.trim()).filter(Boolean).map((line, i) => {
          const m = /^([\d\s.,]+)\s*([A-Za-z]+)$/.exec(line);
          if (!m) throw new InputError(`Laufwerk ${i + 1}: „${line}“ nicht verstanden (Beispiel: 4 TB).`);
          return bitsOf(m[1], m[2], `Laufwerk ${i + 1}`);
        });
      } else {
        const n = Number(v.count);
        if (!Number.isInteger(n) || n < 1 || n > 64) throw new InputError('Anzahl Laufwerke: 1 bis 64.');
        drives = Array(n).fill(bitsOf(v.size, v.unit, 'Kapazität je Laufwerk'));
      }
      const r = raidCapacity(v.level, drives, parseDecimal(v.reserve || '0', { label: 'Reserve', allowNegative: false }));
      const pct = toNumber(r.efficiency);
      return panel('Ergebnis', `
        ${resultList([
          { label: 'Nutzbar', value: both(r.usable), strong: true },
          cmp(r.reserve, ZERO) > 0 ? { label: 'Nach Reserve', value: both(r.usableAfterReserve) } : null,
          { label: 'Rohkapazität', value: both(r.raw) },
          { label: 'Für Redundanz/ungenutzt', value: both(r.lost) },
          cmp(r.unusedByMismatch, ZERO) > 0 ? { label: 'davon ungenutzt (Größenunterschied)', value: both(r.unusedByMismatch) } : null,
          { label: 'Effizienz', value: `${fmt(r.efficiency, { maxFrac: 1 })} %` },
          { label: 'Fehlertoleranz', value: r.toleranceText, mono: false }
        ])}
        <div class="progress mt-2" role="img" aria-label="Kapazitätseffizienz ${pct.toFixed(1)} Prozent"><span style="width:${pct}%"></span></div>
        ${steps([`${r.label}, ${r.n} Laufwerke, kleinstes: ${both(r.smallest)}`, `Formel: ${r.formula}`, `= ${both(r.usable)}`, `Effizienz = nutzbar ÷ Rohkapazität = ${fmt(r.efficiency, { maxFrac: 2 })} %`])}
        ${r.warnings.map((w) => notice(w, 'warning')).join('')}
        ${notice('Theoretische Bruttokapazität des RAID-Verbunds. Dateisystem, Metadaten und Hersteller-Reserven verringern den tatsächlich nutzbaren Platz zusätzlich.', 'info')}
        ${notice('RAID ersetzt kein Backup: Es schützt nicht vor versehentlichem Löschen, Ransomware, Softwarefehlern, Diebstahl oder Brand.', 'warning')}`);
    }
  });
}

/* ------------------------------------------------------------ 3.5 Zahlensysteme */
function zahlensysteme(container) {
  const baseOptions = Array.from({ length: 35 }, (_, i) => i + 2).map((b) => [String(b), `${b}${BASE_NAMES[b] ? ` – ${BASE_NAMES[b]}` : ''}`]);
  const defaults = { value: '2024', from: '10', to: '2', precision: '16' };
  const examples = [
    { label: '255 → hex', values: { value: '255', from: '10', to: '16' } },
    { label: '0,1 → binär', values: { value: '0,1', from: '10', to: '2', precision: '24' } },
    { label: 'Hex mit Komma', values: { value: 'A7.C', from: '16', to: '10' } },
    { label: 'Große Zahl', values: { value: '340282366920938463463374607431768211455', from: '10', to: '16' } }
  ];
  container.innerHTML = layout(
    panel('Eingabe', `
      ${field({ id: 'value', label: 'Zahl', value: defaults.value, mono: true, hint: 'Ziffern 0–9 und A–Z (je nach Basis), optional Vorzeichen und Komma/Punkt. Präfixe 0b, 0o, 0x werden erkannt.' })}
      <div class="form-row">
        ${field({ id: 'from', label: 'Von Basis', value: defaults.from, options: baseOptions })}
        ${field({ id: 'to', label: 'Nach Basis', value: defaults.to, options: baseOptions })}
        ${field({ id: 'precision', label: 'Nachkommastellen (max.)', value: defaults.precision, type: 'number', attrs: 'min="0" max="200"' })}
      </div>
      <div class="row"><button type="button" class="btn btn-sm" id="swap">⇄ Basen tauschen</button></div>
      ${toolActions({ examples })}
      ${explanation(`
        <p><strong>Stellenwertsystem:</strong> Jede Ziffer wird mit einer Potenz der Basis multipliziert: <code>1011₂ = 1·2³ + 0·2² + 1·2¹ + 1·2⁰ = 11</code>.</p>
        <p><strong>Ganzzahlteil in eine andere Basis:</strong> fortgesetzt durch die Zielbasis teilen, die Reste von unten nach oben lesen.</p>
        <p><strong>Nachkommateil:</strong> fortgesetzt mit der Zielbasis multiplizieren, die Ganzzahlteile von oben nach unten lesen. Endet das nicht, ist die Darstellung periodisch – z. B. 0,1 dezimal ist binär unendlich lang. Deshalb kann 0,1 in Gleitkommazahlen nicht exakt gespeichert werden.</p>
        <p>Ganze Zahlen werden mit BigInt ohne Präzisionsverlust gerechnet.</p>`)}
    `),
    '<div id="out"></div>'
  );
  container.querySelector('#swap').addEventListener('click', () => {
    const from = container.querySelector('#from');
    const to = container.querySelector('#to');
    [from.value, to.value] = [to.value, from.value];
    from.dispatchEvent(new Event('change', { bubbles: true }));
  });
  live(container, {
    output: '#out',
    defaults,
    examples,
    compute: (v) => {
      const precision = Number(v.precision);
      if (!Number.isInteger(precision) || precision < 0 || precision > 200) throw new InputError('Nachkommastellen: 0 bis 200.');
      const { parsed, result, others } = convertBase(v.value, Number(v.from), Number(v.to), precision);
      const from = Number(v.from);
      const to = Number(v.to);
      const pos = positionalTerms(parsed.intDigits, parsed.fracDigits, from);
      const div = divisionSteps(parsed.intValue, to, 40);
      const lines = [
        { html: `Stellenwerte in Basis ${from}: ${pos.terms.map((t) => `<code>${esc(t.digit)}·${from}<sup>${t.power}</sup></code>`).join(' + ')}${pos.truncated ? ' + …' : ''}` },
        `Dezimalwert: ${others.find((o) => o.base === 10).text}${others.find((o) => o.base === 10).exact ? '' : ' … (gekürzt)'}`
      ];
      if (to !== 10 || from !== 10) {
        lines.push({ html: `Ganzzahlteil: fortgesetzte Division durch ${to}:<br>${div.steps.map((s) => `<code>${s.dividend} ÷ ${to} = ${s.quotient} Rest ${s.remainder}${s.remainder > 9n ? ` (${DIGITS[Number(s.remainder)]})` : ''}</code>`).join('<br>')}${div.truncated ? '<br>… (weitere Schritte ausgeblendet)' : ''}<br>Reste von unten nach oben gelesen: <code>${esc(result.intPart.toString(to).toUpperCase())}</code>` });
      }
      if (result.fracSteps.length) {
        lines.push({ html: `Nachkommateil: fortgesetzte Multiplikation mit ${to}:<br>${result.fracSteps.slice(0, 16).map((s) => `<code>${fmt(s.before, { sig: 10 })} × ${to} = ${fmt(s.product, { sig: 10 })} → Ziffer ${DIGITS[s.digit]}</code>`).join('<br>')}${result.fracSteps.length > 16 ? '<br>…' : ''}` });
      }
      return panel('Ergebnis', `
        ${resultList([
          { label: `Basis ${to}`, value: result.text, strong: true },
          ...others.filter((o) => o.base !== to).map((o) => ({ label: `${BASE_NAMES[o.base]} (${o.base})`, value: o.text }))
        ])}
        ${!result.exact ? notice(`Nach ${precision} Nachkommastellen abgeschnitten – ${result.terminates ? 'mit mehr Stellen wäre das Ergebnis exakt.' : 'die Darstellung ist in Basis ' + to + ' unendlich (periodisch).'}`, 'warning') : ''}
        ${steps(lines)}`);
    }
  });
}

/* ------------------------------------------------------------ 3.6 Bit-Inspektor */
function bitGrid(d, { clickable = true } = {}) {
  const cells = [...d.bits].map((bit, i) => {
    const index = d.width - 1 - i;
    return `<button type="button" class="bit-cell${bit === '1' ? ' on' : ''}${i === 0 ? ' sign' : ''}" ${clickable ? `data-bit="${index}"` : 'disabled'} aria-pressed="${bit === '1'}" aria-label="Bit ${index}: ${bit}">${bit}<small>${index}</small></button>`;
  });
  const bytes = [];
  for (let i = 0; i < cells.length; i += 8) {
    bytes.push(`<div class="bit-byte"><span class="bit-nibble">${cells.slice(i, i + 4).join('')}</span><span class="bit-nibble">${cells.slice(i + 4, i + 8).join('')}</span></div>`);
  }
  return `<div class="bit-row" role="group" aria-label="Bits">${bytes.join('')}</div>`;
}

function bitInspektor(container) {
  const defaults = { value: '-42', width: '16', endian: 'little' };
  const examples = [
    { label: '−1 (8 Bit)', values: { value: '-1', width: '8' } },
    { label: '0xCAFE', values: { value: '0xCAFE', width: '16' } },
    { label: 'INT32_MIN', values: { value: '-2147483648', width: '32' } },
    { label: '2^63', values: { value: '9223372036854775808', width: '64' } }
  ];
  container.innerHTML = layout(
    panel('Eingabe', `
      ${field({ id: 'value', label: 'Wert', value: defaults.value, mono: true, hint: 'Dezimal (auch negativ), 0x…, 0b… oder 0o…' })}
      <div class="form-row">
        ${field({ id: 'width', label: 'Bitbreite', value: defaults.width, options: WIDTHS.map((w) => [String(w), `${w} Bit`]) })}
        ${field({ id: 'endian', label: 'Bytefolge im Speicher', value: defaults.endian, options: [['little', 'Little Endian (x86, ARM)'], ['big', 'Big Endian (Netzwerk)']] })}
      </div>
      <p class="hint">Klicke auf ein Bit, um es umzuschalten. Das orange markierte Bit ist das höchstwertige (bei vorzeichenbehafteten Zahlen das Vorzeichen).</p>
      ${toolActions({ examples })}
      ${explanation(`
        <p><strong>Bitbreite:</strong> Ein Wert wird immer mit fester Breite gespeichert. Führende Nullen gehören dazu: 5 ist in 8 Bit <code>00000101</code>.</p>
        <p><strong>Vorzeichen:</strong> Dasselbe Bitmuster bedeutet vorzeichenlos etwas anderes als im Zweierkomplement: <code>11111111</code> ist 255 oder −1.</p>
        <p><strong>Überlauf:</strong> Passt ein Wert nicht in die Breite, gehen Bits verloren – hier wird das abgelehnt statt still abgeschnitten.</p>
        <p><strong>Endianness:</strong> Little Endian legt das niederwertigste Byte zuerst ab (x86, die meisten ARM-Systeme), Big Endian das höchstwertige (Netzwerkprotokolle).</p>`)}
    `),
    '<div id="out"></div>'
  );
  const run = live(container, {
    output: '#out',
    defaults,
    examples,
    compute: (v) => {
      const w = Number(v.width);
      const pattern = toPattern(parseInteger(v.value), w);
      const d = describe(pattern, w);
      const r = ranges(w);
      const memBytes = v.endian === 'little' ? d.bytesLittle : d.bytesBig;
      return panel('Darstellungen', `
        ${bitGrid(d)}
        ${resultList([
          { label: 'Vorzeichenlos', value: d.unsigned.toString(), strong: true },
          { label: 'Zweierkomplement', value: d.signed.toString(), strong: true },
          { label: 'Hexadezimal', value: `0x${d.hex}` },
          { label: 'Binär', value: d.grouped },
          { label: 'Oktal', value: `0o${d.oct}` },
          { label: `Bytes (${v.endian === 'little' ? 'Little' : 'Big'} Endian)`, value: memBytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ') },
          { label: 'Gesetzte Bits', value: `${d.setBits} von ${w}`, copy: false },
          { label: 'Führende Nullen', value: String(d.leadingZeros), copy: false }
        ])}
        ${steps([
          `Bereich vorzeichenlos: 0 bis ${r.unsignedMax} (2^${w} − 1)`,
          `Bereich vorzeichenbehaftet: ${r.signedMin} bis ${r.signedMax}`,
          d.signBit ? `Höchstes Bit ist 1 → vorzeichenbehaftet negativ: ${d.unsigned} − 2^${w} = ${d.signed}` : 'Höchstes Bit ist 0 → beide Interpretationen sind gleich'
        ], { title: 'Erklärung zu diesem Wert' })}`);
    }
  });
  container.addEventListener('click', (event) => {
    const button = event.target.closest('[data-bit]');
    if (!button) return;
    const w = Number(container.querySelector('#width').value);
    try {
      const pattern = toPattern(parseInteger(container.querySelector('#value').value), w);
      const next = toggleBit(pattern, w, Number(button.dataset.bit));
      const input = container.querySelector('#value');
      input.value = input.value.trim().startsWith('0x') ? `0x${next.toString(16).toUpperCase()}` : input.value.trim().startsWith('0b') ? `0b${bitString(next, w)}` : String(next);
      run.run();
      container.querySelector(`[data-bit="${button.dataset.bit}"]`)?.focus();
    } catch {
      /* ungültige Eingabe – Fehlermeldung steht schon da */
    }
  });
}

/* ------------------------------------------------------------ 3.7 Binärarithmetik */
function binaerarithmetik(container) {
  const defaults = { op: 'add', a: '100', b: '50', width: '8', mode: 'signed', shift: '1' };
  const examples = [
    { label: '127 + 1 (Überlauf)', values: { op: 'add', a: '127', b: '1', width: '8' } },
    { label: '5 − 7', values: { op: 'sub', a: '5', b: '7', width: '8' } },
    { label: '−7 ÷ 2', values: { op: 'div', a: '-7', b: '2', width: '8', mode: 'signed' } },
    { label: '−16 >> 2', values: { op: 'sar', a: '-16', width: '8', shift: '2' } },
    { label: '0b1100 XOR 0b1010', values: { op: 'xor', a: '0b1100', b: '0b1010', width: '8' } }
  ];
  container.innerHTML = layout(
    panel('Eingabe', `
      ${field({ id: 'op', label: 'Operation', value: defaults.op, options: Object.entries(OPERATIONS).map(([k, o]) => [k, o.label]) })}
      <div class="form-row">
        ${field({ id: 'a', label: 'A', value: defaults.a, mono: true })}
        <div data-binary>${field({ id: 'b', label: 'B', value: defaults.b, mono: true })}</div>
        <div data-shift>${field({ id: 'shift', label: 'Verschiebung n', value: defaults.shift, type: 'number', attrs: 'min="0" max="64"' })}</div>
      </div>
      <div class="form-row">
        ${field({ id: 'width', label: 'Bitbreite', value: defaults.width, options: WIDTHS.map((w) => [String(w), `${w} Bit`]) })}
        ${field({ id: 'mode', label: 'Interpretation', value: defaults.mode, options: [['signed', 'Vorzeichenbehaftet (Zweierkomplement)'], ['unsigned', 'Vorzeichenlos']] })}
      </div>
      <p class="hint">Eingabe dezimal (auch negativ), 0x…, 0b… oder 0o…</p>
      ${toolActions({ examples })}
      ${explanation(`
        <p><strong>Zweierkomplement:</strong> −x entsteht durch Invertieren aller Bits von x und Addieren von 1. Dadurch funktioniert Subtraktion als Addition: <code>A − B = A + (~B + 1)</code>.</p>
        <p><strong>Carry</strong> (Übertrag aus dem höchsten Bit) zeigt einen Überlauf bei <em>vorzeichenlosen</em> Zahlen. <strong>Overflow</strong> zeigt einen Überlauf bei <em>vorzeichenbehafteten</em> Zahlen: Er tritt auf, wenn zwei Operanden mit gleichem Vorzeichen ein Ergebnis mit anderem Vorzeichen liefern.</p>
        <p><strong>Logischer</strong> Rechtsshift füllt mit 0 auf (für vorzeichenlose Werte), <strong>arithmetischer</strong> mit dem Vorzeichenbit (für vorzeichenbehaftete Werte, rundet Richtung −∞).</p>`)}
    `),
    '<div id="out"></div>'
  );
  live(container, {
    output: '#out',
    defaults,
    examples,
    compute: (v) => {
      const info = OPERATIONS[v.op];
      container.querySelector('[data-binary]').hidden = !info.binary;
      container.querySelector('[data-shift]').hidden = !info.shift;
      const w = Number(v.width);
      const a = parseInteger(v.a, 'A');
      const b = info.binary ? parseInteger(v.b, 'B') : 0n;
      const r = compute(v.op, a, b, w, { mode: v.mode, shift: Number(v.shift) });
      const bs = (x) => bitString(x, w);
      const sym = { add: '+', sub: '−', mul: '×', div: '÷', and: '&', or: '|', xor: '^' }[v.op];
      const rowsHtml = [];
      if (r.carries) rowsHtml.push(`<span class="faint">Überträge</span><span class="faint">${r.carries}</span>`);
      rowsHtml.push(`<span>A</span><span>${bs(r.a)}</span>`);
      if (info.binary) rowsHtml.push(`<span>${sym} B</span><span>${bs(r.b)}</span>`);
      if (info.shift) rowsHtml.push(`<span>${v.op === 'shl' ? '<<' : v.op === 'shr' ? '>>>' : '>>'} ${r.shift}</span><span class="faint">herausgeschoben: ${r.shiftedOut || '–'}</span>`);
      rowsHtml.push(`<span>=</span><span class="data-result-bits">${bs(r.result)}</span>`);
      const flags = [];
      if ('carry' in r.flags) flags.push(`<span class="badge ${r.flags.carry ? 'badge-warning' : ''}">Carry ${r.flags.carry ? '1' : '0'}</span>`);
      if ('borrow' in r.flags) flags.push(`<span class="badge ${r.flags.borrow ? 'badge-warning' : ''}">Borrow ${r.flags.borrow ? '1' : '0'}</span>`);
      if ('overflow' in r.flags) flags.push(`<span class="badge ${r.flags.overflow ? 'badge-danger' : ''}">Overflow ${r.flags.overflow ? '1' : '0'}</span>`);
      const lines = [];
      if (v.op === 'sub') lines.push(`Zweierkomplement von B: ~${bs(r.b)} + 1 = ${bs(r.complementOfB)}`, `A + (−B) = ${bs(r.a)} + ${bs(r.complementOfB)}`);
      if (r.exactSigned !== undefined) lines.push(`Exaktes Ergebnis vorzeichenbehaftet: ${r.exactSigned} → ${r.flags.overflow ? `passt nicht in ${w} Bit (Überlauf)` : 'passt'}`);
      if (r.exactUnsigned !== undefined) lines.push(`Exaktes Ergebnis vorzeichenlos: ${r.exactUnsigned} → ${r.exactUnsigned < 0n || r.exactUnsigned > ranges(w).unsignedMax ? `außerhalb 0…${ranges(w).unsignedMax}, Ergebnis modulo 2^${w}` : 'passt'}`);
      if (r.fullProduct !== undefined) lines.push(`Volles Produkt (${2 * w} Bit): ${bitString(r.fullProduct, 2 * w)} – davon bleiben die unteren ${w} Bit`);
      if (r.remainder !== undefined) lines.push(`Rest: ${r.remainder}`);
      lines.push(...r.notes);
      return panel('Ergebnis', `
        <div class="data-arith mono" role="table" aria-label="Rechnung in Binärdarstellung">${rowsHtml.map((row) => `<div class="data-arith-row" role="row">${row}</div>`).join('')}</div>
        <div class="row mt-1">${flags.join('')}</div>
        ${resultList([
          { label: 'Ergebnis vorzeichenlos', value: r.result.toString(), strong: v.mode === 'unsigned' },
          { label: 'Ergebnis vorzeichenbehaftet', value: r.resultSigned.toString(), strong: v.mode === 'signed' },
          { label: 'Hex', value: `0x${r.result.toString(16).toUpperCase().padStart(w / 4, '0')}` },
          r.remainder !== undefined ? { label: 'Rest', value: r.remainder.toString() } : null
        ])}
        ${steps(lines)}
        ${(() => {
          if (a >= 0n) return '';
          const tc = twosComplementSteps(a, w);
          return tc.special
            ? notice(`${a} ist der kleinste Wert in ${w} Bit; sein Betrag ist vorzeichenbehaftet nicht darstellbar. Bitmuster: ${tc.result}.`, 'info')
            : steps([`|A| = ${tc.magnitude}`, `invertiert: ${tc.inverted}`, `+ 1: ${tc.result}`], { title: `Zweierkomplement von A = ${a}` });
        })()}`);
    }
  });
}

/* ------------------------------------------------------------ 3.8 Text & UTF-8 */
function textcodierung(container) {
  const defaults = { mode: 'encode', text: 'Grüße aus Zürich 👋🏽', bytes: '48 61 6C 6C C3 B6 20 F0 9F 98 80', format: 'hex' };
  const examples = [
    { label: 'Umlaute', values: { mode: 'encode', text: 'Ä Ö Ü ä ö ü ß' } },
    { label: 'Emoji mit Hautfarbe', values: { mode: 'encode', text: '👍🏽' } },
    { label: 'Familie (ZWJ)', values: { mode: 'encode', text: '👨‍👩‍👧' } },
    { label: 'Bytes → Text', values: { mode: 'decode', bytes: '48 61 6C 6C C3 B6 20 F0 9F 98 80', format: 'hex' } },
    { label: 'Ungültige Folge', values: { mode: 'decode', bytes: '48 C3 28 41', format: 'hex' } }
  ];
  container.innerHTML = layout(
    panel('Eingabe', `
      ${segmented({ name: 'mode', label: 'Richtung', value: defaults.mode, options: [['encode', 'Text → Bytes'], ['decode', 'Bytes → Text']] })}
      <div data-dir="encode">${field({ id: 'text', label: 'Text', value: defaults.text, rows: 4 })}</div>
      <div data-dir="decode">
        ${field({ id: 'format', label: 'Eingabeformat', value: defaults.format, options: [['hex', 'Hexadezimal (48 65 6C …)'], ['bin', 'Binär (01001000 …)'], ['dec', 'Dezimal (72 101 …)']] })}
        ${field({ id: 'bytes', label: 'Bytes', value: defaults.bytes, rows: 4, mono: true })}
      </div>
      ${toolActions({ examples })}
      ${explanation(`
        <p><strong>Codepoint</strong> = Nummer eines Zeichens in Unicode (z. B. U+00FC für „ü“). <strong>UTF-8</strong> speichert einen Codepoint in 1 bis 4 Byte: ASCII in 1 Byte, Umlaute in 2, das Euro-Zeichen in 3, Emojis in 4.</p>
        <p>Ein <strong>sichtbares Zeichen</strong> (Graphem) kann aus mehreren Codepoints bestehen, z. B. ein Emoji mit Hautfarbe oder ein Familien-Emoji mit Zero-Width-Joiner.</p>
        <p>JavaScript zählt mit <code>"…".length</code> UTF-16-Einheiten – Zeichen außerhalb der Basic Multilingual Plane (über U+FFFF) zählen dort doppelt.</p>
        <p>Für einzelne Zeichen und Tabellen siehe <a href="#/werkzeuge/zeichentabelle">ASCII- &amp; Unicode-Tabelle</a>.</p>`)}
    `),
    '<div id="out"></div>'
  );
  const hex = (b) => b.toString(16).toUpperCase().padStart(2, '0');
  live(container, {
    output: '#out',
    defaults,
    examples,
    compute: (v) => {
      container.querySelectorAll('[data-dir]').forEach((el) => (el.hidden = el.dataset.dir !== v.mode));
      if (v.mode === 'encode') {
        const a = analyzeText(v.text);
        const rows = a.codepoints.slice(0, 200).map((c) => [
          { html: `<span class="data-glyph">${esc(c.char === ' ' ? '␠' : c.char)}</span>` },
          c.label,
          c.bytes.map(hex).join(' '),
          utf8BitLayout(c.cp).map((x) => x.bits).join(' '),
          String(c.bytes.length)
        ]);
        return panel('Ergebnis', `
          ${resultList([
            { label: 'Sichtbare Zeichen', value: a.counts.graphemes === null ? 'nicht ermittelbar (Intl.Segmenter fehlt)' : String(a.counts.graphemes), copy: false },
            { label: 'Codepoints', value: String(a.counts.codepoints), copy: false },
            { label: 'UTF-16-Einheiten (JS length)', value: String(a.counts.utf16Units), copy: false },
            { label: 'UTF-8-Bytes', value: String(a.counts.bytes), strong: true, copy: false },
            { label: 'Hex', value: formatBytes(a.bytes, 'hex') },
            { label: 'Binär', value: formatBytes(a.bytes, 'bin') },
            { label: 'Dezimal', value: formatBytes(a.bytes, 'dec') }
          ])}
          ${a.loneSurrogates ? notice('Der Text enthält einzelne UTF-16-Surrogate; UTF-8 kann sie nicht darstellen – sie werden als U+FFFD (EF BF BD) codiert.', 'warning') : ''}
          <div class="mt-2">${table(['Zeichen', 'Codepoint', 'UTF-8 (hex)', 'UTF-8 (binär)', 'Bytes'], rows)}</div>
          ${a.codepoints.length > 200 ? notice('Tabelle zeigt die ersten 200 Codepoints.', 'info') : ''}`);
      }
      const bytes = parseBytes(v.bytes, v.format);
      const d = decodeUtf8(bytes);
      return panel('Ergebnis', d.ok
        ? `${resultList([
            { label: 'Text', value: d.text, strong: true, mono: false },
            { label: 'Bytes', value: String(bytes.length), copy: false },
            { label: 'Codepoints', value: String([...d.text].length), copy: false },
            { label: 'Codepoint-Liste', value: [...d.text].map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(' ') }
          ])}${bytes.length ? '' : notice('Keine Bytes eingegeben.', 'info')}`
        : `${notice(d.message, 'error')}
           ${resultList([
             { label: 'Fehler bei Byte', value: `${d.index + 1} von ${bytes.length}`, copy: false },
             { label: 'Ersatzdarstellung', value: d.lossy, mono: false }
           ])}
           <p class="hint">Die Ersatzdarstellung zeigt, wie ein toleranter Decoder ungültige Stellen durch „�“ (U+FFFD) ersetzt.</p>`);
    }
  });
}

/* ------------------------------------------------------------ 3.9 IEEE 754 */
function ieee754(container) {
  const defaults = { mode: 'number', number: '0,1', bits: '3DCCCCCD', width: '32' };
  const examples = [
    { label: '0,1 (float)', values: { mode: 'number', number: '0,1', width: '32' } },
    { label: '−0', values: { mode: 'number', number: '-0', width: '32' } },
    { label: 'Kleinste Subnormalzahl', values: { mode: 'bits', bits: '00000001', width: '32' } },
    { label: 'NaN', values: { mode: 'bits', bits: '7FC00000', width: '32' } },
    { label: '0,1 (double)', values: { mode: 'number', number: '0,1', width: '64' } },
    { label: '1e40 → ∞ (float)', values: { mode: 'number', number: '1e40', width: '32' } }
  ];
  container.innerHTML = layout(
    panel('Eingabe', `
      ${segmented({ name: 'mode', label: 'Eingabe als', value: defaults.mode, options: [['number', 'Dezimalzahl'], ['bits', 'Bitmuster (Hex/Binär)']] })}
      <div data-in="number">${field({ id: 'number', label: 'Zahl', value: defaults.number, mono: true, hint: 'Auch „inf“, „-inf“, „NaN“, Exponent (1e-3).' })}</div>
      <div data-in="bits">${field({ id: 'bits', label: 'Bitmuster', value: defaults.bits, mono: true, hint: 'Hex (3F800000) oder 0b… / vollständige Binärfolge' })}</div>
      ${field({ id: 'width', label: 'Format', value: defaults.width, options: [['32', 'binary32 – float (32 Bit)'], ['64', 'binary64 – double (64 Bit)']] })}
      ${toolActions({ examples })}
      ${explanation(`
        <p>Wert = (−1)<sup>Vorzeichen</sup> × 1,Mantisse<sub>2</sub> × 2<sup>Exponent − Bias</sup>. Bias: 127 (float), 1023 (double).</p>
        <ul>
          <li><strong>Exponent 0</strong>: ±0 (Mantisse 0) oder <strong>subnormal</strong> (ohne führende 1, Exponent fest 1 − Bias) – füllt die Lücke um 0, mit weniger Genauigkeit.</li>
          <li><strong>Exponent nur Einsen</strong>: ±∞ (Mantisse 0) oder NaN (Mantisse ≠ 0).</li>
        </ul>
        <p>Viele Dezimalzahlen (z. B. 0,1) sind binär periodisch und werden auf den nächstgelegenen darstellbaren Wert gerundet (round to nearest, ties to even). Darum ist <code>0.1 + 0.2 !== 0.3</code>.</p>`)}
    `),
    '<div id="out"></div>'
  );
  live(container, {
    output: '#out',
    defaults,
    examples,
    compute: (v) => {
      container.querySelectorAll('[data-in]').forEach((el) => (el.hidden = el.dataset.in !== v.mode));
      const w = Number(v.width);
      const { pattern } = v.mode === 'number' ? patternFromNumberText(v.number, w) : patternFromBits(v.bits, w);
      const d = decode(pattern, w);
      const kinds = { normal: 'Normalisierte Zahl', subnormal: 'Subnormale Zahl', zero: d.sign ? 'Negative Null (−0)' : 'Positive Null (+0)', infinity: d.sign ? '−Unendlich' : '+Unendlich', nan: `NaN (${d.quiet ? 'quiet' : 'signaling'})` };
      const exactText = d.exact ? exactDecimal(d.exact) : null;
      let errorRow = null;
      if (v.mode === 'number' && d.exact) {
        try {
          const wanted = parseDecimal(v.number, { label: 'Zahl' });
          const diff = sub(d.exact, wanted);
          errorRow = { label: 'Rundungsfehler', value: cmp(diff, ZERO) === 0 ? '0 (exakt darstellbar)' : `${fmt(diff, { sig: 6 })}`, copy: false };
        } catch {
          errorRow = null;
        }
      }
      const lim = limits(w);
      const fieldBits = `<div class="data-ieee mono" aria-label="Bitfelder">
        <span class="data-ieee-sign" title="Vorzeichen">${d.signBit}</span><span class="data-ieee-exp" title="Exponent">${d.exponentBits}</span><span class="data-ieee-frac" title="Mantisse">${d.fractionBits}</span>
      </div>
      <div class="row small mt-1"><span class="badge data-ieee-sign">Vorzeichen 1 Bit</span><span class="badge data-ieee-exp">Exponent ${d.format.expBits} Bit</span><span class="badge data-ieee-frac">Mantisse ${d.format.fracBits} Bit</span></div>`;
      const lines = [];
      if (d.kind === 'normal' || d.kind === 'subnormal') {
        lines.push(
          `Vorzeichen: ${d.sign} → ${d.sign ? 'negativ' : 'positiv'}`,
          d.kind === 'normal' ? `Exponent: ${d.exponentBits}₂ = ${d.exponentField} − Bias ${d.format.bias} = ${d.unbiasedExponent}` : `Exponent: alle Bits 0 → subnormal, Exponent = 1 − ${d.format.bias} = ${d.unbiasedExponent}`,
          `Mantisse: ${d.kind === 'normal' ? '1' : '0'},${d.fractionBits.replace(/0+$/, '') || '0'}₂`,
          `Wert = ${d.sign ? '−' : ''}${d.kind === 'normal' ? '1' : '0'},…₂ × 2^${d.unbiasedExponent} = ${exactText}`
        );
      }
      return panel('Ergebnis', `
        ${fieldBits}
        ${resultList([
          { label: 'Art', value: kinds[d.kind], mono: false, copy: false, strong: true },
          { label: 'Hex', value: `0x${d.hex}` },
          { label: 'Wert (JavaScript)', value: Object.is(d.number, -0) ? '-0' : String(d.number) },
          exactText !== null ? { label: 'Exakt gespeichert', value: exactText } : null,
          errorRow,
          d.kind === 'normal' || d.kind === 'subnormal' ? { label: 'Exponent (unverzerrt)', value: String(d.unbiasedExponent), copy: false } : null
        ])}
        ${steps(lines)}
        ${v.mode === 'number' && w === 32 ? notice('Die Eingabe wird zuerst als double gelesen und dann auf float gerundet. In sehr seltenen Grenzfällen kann diese doppelte Rundung um eine Stelle von einer direkten Rundung abweichen.', 'info') : ''}
        <div class="mt-2">${table(['Grenze', 'Wert'], [
          ['Größte endliche Zahl', String(lim.maxNormal.number)],
          ['Kleinste normalisierte Zahl', String(lim.minNormal.number)],
          ['Kleinste Subnormalzahl', String(lim.minSub.number)],
          ['Maschinengenauigkeit ε (Abstand 1 → nächste Zahl)', `2^−${d.format.fracBits} ≈ ${fmt(lim.epsilon, { sig: 6, approxMark: false })}`],
          ['Dezimale Genauigkeit', `${lim.digits} Stellen`]
        ])}</div>`);
    }
  });
}

/* ------------------------------------------------------------ 3.10 Adressraum */
function adressraum(container) {
  const defaults = {
    bits: '32', word: '1', size: '256', sizeUnit: 'MiB', sizeWord: '1', rangeBits: '16', rangeStart: '0x0000', ranges: 'ROM 16 KiB\nRAM 32 KiB\nI/O 256 B',
    abi: 'lp64', pack: '0', fields: 'char flag;\nint count;\nchar code;\ndouble value;\nshort id;'
  };
  const examples = [
    { label: '32-Bit-Adressraum', values: { bits: '32', word: '1' } },
    { label: '16 Bit, wortadressiert', values: { bits: '16', word: '2' } },
    { label: 'Adressbits für 4 GiB', values: { size: '4', sizeUnit: 'GiB', sizeWord: '1' } }
  ];
  const sizeUnits = [['B', 'Byte'], ['KiB', 'KiB'], ['MiB', 'MiB'], ['GiB', 'GiB'], ['TiB', 'TiB'], ['kB', 'kB'], ['MB', 'MB'], ['GB', 'GB']];
  container.innerHTML = layout(
    panel('Eingabe', `
      <h3 class="data-sub">Adressraum</h3>
      <div class="form-row">
        ${field({ id: 'bits', label: 'Adressbreite (Bit)', value: defaults.bits, type: 'number', attrs: 'min="1" max="128"' })}
        ${field({ id: 'word', label: 'Byte je Adresse', value: defaults.word, options: [['1', '1 – byteadressiert'], ['2', '2 – 16-Bit-Wort'], ['4', '4 – 32-Bit-Wort'], ['8', '8 – 64-Bit-Wort']] })}
      </div>
      <h3 class="data-sub">Benötigte Adressbits</h3>
      <div class="form-row">
        ${field({ id: 'size', label: 'Speichergröße', value: defaults.size, mono: true })}
        ${field({ id: 'sizeUnit', label: 'Einheit', value: defaults.sizeUnit, options: sizeUnits })}
        ${field({ id: 'sizeWord', label: 'Byte je Adresse', value: defaults.sizeWord, options: [['1', '1'], ['2', '2'], ['4', '4'], ['8', '8']] })}
      </div>
      <h3 class="data-sub">Speicherbereiche</h3>
      <div class="form-row">
        ${field({ id: 'rangeBits', label: 'Adressbreite (Bit)', value: defaults.rangeBits, type: 'number', attrs: 'min="1" max="64"' })}
        ${field({ id: 'rangeStart', label: 'Startadresse', value: defaults.rangeStart, mono: true })}
      </div>
      ${field({ id: 'ranges', label: 'Bereiche (Name Größe Einheit)', value: defaults.ranges, rows: 3, mono: true })}
      <h3 class="data-sub">Struct-Layout (C)</h3>
      <div class="form-row">
        ${field({ id: 'abi', label: 'Datenmodell (Annahme)', value: defaults.abi, options: Object.entries(ABIS).map(([k, a]) => [k, a.label]) })}
        ${field({ id: 'pack', label: 'Packen', value: defaults.pack, options: [['0', 'normal'], ['1', '#pragma pack(1)'], ['2', '#pragma pack(2)'], ['4', '#pragma pack(4)']] })}
      </div>
      ${field({ id: 'fields', label: 'Felder', value: defaults.fields, rows: 6, mono: true, hint: '„typ name“, „typ name[n]“, „typ* name“ oder „name size=12 align=4“' })}
      ${toolActions({ examples })}
      ${explanation(`
        <p>Mit <strong>n Adressbits</strong> lassen sich 2<sup>n</sup> Speicherstellen ansprechen. Bei <strong>byteadressiertem</strong> Speicher (heute üblich) ist jede Stelle 1 Byte groß, bei <strong>wortadressiertem</strong> ein ganzes Wort.</p>
        <p><strong>Alignment:</strong> Viele Prozessoren lesen einen Wert der Größe k am schnellsten (oder nur) von Adressen, die ein Vielfaches von k sind. Der Compiler fügt deshalb Füllbytes (<strong>Padding</strong>) zwischen Felder und am Ende eines Structs ein, damit auch Arrays des Structs korrekt ausgerichtet sind.</p>
        <p>Typgrößen hängen vom Datenmodell ab (z. B. <code>long</code>: 8 Byte unter 64-Bit-Linux, 4 Byte unter 64-Bit-Windows). Die Werte hier sind die üblichen Vorgaben dieser ABIs; Compileroptionen können abweichen.</p>`)}
    `),
    '<div id="out"></div>'
  );
  const unitBytes = (id) => div(sizeUnit(id).bits, rat(8n));
  live(container, {
    output: '#out',
    defaults,
    examples,
    compute: (v) => {
      const sections = [];
      const tryPart = (title, fn) => {
        try {
          sections.push(panel(title, fn()));
        } catch (error) {
          sections.push(panel(title, notice(error.message, 'error')));
        }
      };
      tryPart('Adressraum', () => {
        const s = addressSpace(v.bits, v.word);
        const sizeBits = mul(rat(s.bytes), rat(8n));
        return `${resultList([
          { label: 'Adressierbare Stellen', value: `2^${s.bits} = ${groupDigits(s.locations.toString())}`, strong: true },
          { label: 'Adressraum', value: both(sizeBits) },
          { label: 'in Byte', value: groupDigits(s.bytes.toString()) },
          { label: 'Adressen', value: `${hexAddress(0n, s.bits)} bis ${hexAddress(s.maxAddress, s.bits)}` }
        ])}
        ${notice(`${s.wordBytes === 1 ? 'byteadressiert – jede Adresse bezeichnet genau 1 Byte.' : `wortadressiert – jede Adresse bezeichnet ${s.wordBytes} Byte.`}`, 'assumption')}`;
      });
      tryPart('Benötigte Adressbits', () => {
        const bytes = mul(parseDecimal(v.size, { label: 'Speichergröße', allowNegative: false }), unitBytes(v.sizeUnit));
        if (bytes.d !== 1n) throw new InputError('Die Speichergröße muss eine ganze Zahl von Byte ergeben.');
        const r = bitsNeeded(bytes.n, Number(v.sizeWord));
        return `${resultList([
          { label: 'Adressbits', value: String(r.bits), strong: true },
          { label: 'Speicherstellen', value: groupDigits(r.locations.toString()) },
          { label: 'Damit adressierbar', value: both(mul(rat(r.capacityWithBits), rat(8n))) }
        ])}
        ${steps([`Speicherstellen = ${groupDigits(bytes.n.toString())} Byte ÷ ${v.sizeWord} Byte = ${groupDigits(r.locations.toString())}`, `Adressbits = ⌈log₂(${groupDigits(r.locations.toString())})⌉ = ${r.bits}`, r.exactPowerOfTwo ? 'Die Größe ist eine Zweierpotenz – alle Adressen werden genutzt.' : 'Keine Zweierpotenz – einige Adressen bleiben ungenutzt.'])}`;
      });
      tryPart('Speicherbereiche', () => {
        const bits = Number(v.rangeBits);
        const items = v.ranges.split('\n').map((l) => l.trim()).filter(Boolean).map((line, i) => {
          const m = /^(\S+)\s+([\d.,]+)\s*([A-Za-z]+)$/.exec(line);
          if (!m) throw new InputError(`Bereich ${i + 1}: „${line}“ nicht verstanden (Beispiel: RAM 32 KiB).`);
          const bytes = mul(parseDecimal(m[2], { label: m[1], allowNegative: false }), unitBytes(m[3]));
          if (bytes.d !== 1n) throw new InputError(`${m[1]}: keine ganze Byteanzahl.`);
          return { name: m[1], size: bytes.n };
        });
        const ranges = layoutRanges(parseAddress(v.rangeStart, 'Startadresse'), items, bits);
        return table(['Bereich', 'Start', 'Ende', 'Größe'], ranges.map((r) => [r.name, hexAddress(r.first, bits), hexAddress(r.last, bits), `${groupDigits(r.size.toString())} B`]))
          + notice('Ende = Start + Größe − 1. Byteadressiert angenommen.', 'assumption');
      });
      tryPart('Struct-Layout', () => {
        const fields = parseFields(v.fields, v.abi);
        const pack = Number(v.pack);
        const l = structLayout(fields, { pack });
        const o = optimizedOrder(fields, { pack });
        const map = [];
        l.rows.forEach((r) => {
          for (let i = 0; i < r.padding; i++) map.push('<span class="data-mem pad" title="Padding"></span>');
          for (let i = 0; i < Math.min(r.size, 64); i++) map.push(`<span class="data-mem" title="${esc(r.name)}">${i === 0 ? esc(r.name.slice(0, 1)) : ''}</span>`);
        });
        for (let i = 0; i < l.tailPadding; i++) map.push('<span class="data-mem pad" title="Padding am Ende"></span>');
        return `${table(['Feld', 'Typ', 'Offset', 'Größe', 'Ausrichtung', 'Padding davor'], l.rows.map((r) => [r.name, r.type, String(r.offset), String(r.size), String(r.effectiveAlign), r.padding ? String(r.padding) : '–']))}
          ${resultList([
            { label: 'sizeof', value: `${l.size} Byte`, strong: true },
            { label: 'Ausrichtung des Structs', value: `${l.align} Byte` },
            { label: 'Padding gesamt', value: `${l.paddingTotal} Byte (davon ${l.tailPadding} am Ende)` },
            { label: 'Nach Ausrichtung sortiert', value: `${o.size} Byte (${o.rows.map((r) => r.name).join(', ')})` }
          ])}
          ${l.size <= 256 ? `<div class="data-memmap mt-1" aria-label="Speicherbelegung, je Kästchen 1 Byte, schraffiert = Padding">${map.join('')}</div>` : ''}
          ${notice(`${ABIS[v.abi].label}${pack ? `, gepackt auf ${pack} Byte` : ''}. Gepackte Structs sparen Platz, können aber langsamer oder auf manchen Prozessoren gar nicht direkt zugreifbar sein.`, 'assumption')}`;
      });
      return sections.join('');
    }
  });
}

const TOOLS = {
  datenmengen,
  uebertragungszeit,
  speicherplatz,
  raid,
  zahlensysteme,
  'bit-inspektor': bitInspektor,
  binaerarithmetik,
  textcodierung,
  ieee754,
  adressraum
};

export function render(toolId, container, ctx) {
  const tool = TOOLS[toolId];
  if (!tool) throw new Error(`Unbekanntes Werkzeug: ${toolId}`);
  return tool(container, ctx);
}
