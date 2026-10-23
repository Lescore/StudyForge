/**
 * Werkzeuge „Zeit, Leistung & Berechnungen“: Frequenz, Leistung/Energie, Prozent.
 * Rechenlogik in ../core/tech-calc.js (exakte Brüche, getestet).
 */
import { esc, field, layout, panel, resultList, steps, notice, explanation, toolActions, live, table } from '../kit.js';
import { fmt, rat, mul, div } from '../core/num.js';
import {
  FREQ_UNITS, TIME_UNITS, frequencyInfo, frequencyFromPeriod, cyclesForTime, timeForCycles, formatFreq, formatTime,
  powerFromUI, energy, batteryRuntime, energyCost, componentsEnergy, DAYS_PER_MONTH, DAYS_PER_YEAR,
  percent, change, percentPoints, ruleOfThree, reduceRatio, gcdSteps
} from '../core/tech-calc.js';
import { formatDuration } from '../core/units.js';

const f = (x, sig = 12) => fmt(x, { sig });
const freqOptions = FREQ_UNITS.map((u) => [u.id, u.id]);
const timeOptions = TIME_UNITS.map((u) => [u.id, u.id]);
const toggle = (root, attr, value) => root.querySelectorAll(`[${attr}]`).forEach((el) => (el.hidden = !el.getAttribute(attr).split(' ').includes(value)));

/* ------------------------------------------------------------ Frequenz */
function frequenz(container) {
  const defaults = { fmode: 'f', fval: '3,5', funit: 'GHz', tval: '20', tunit: 'ms', cf: '3', cfu: 'GHz', ct: '1', ctu: 'ms', nf: '2', nfu: 'GHz', nn: '1000' };
  const examples = [
    { label: '3,5 GHz → Takt', values: { fmode: 'f', fval: '3,5', funit: 'GHz' } },
    { label: '50 Hz Netz', values: { fmode: 'f', fval: '50', funit: 'Hz' } },
    { label: 'Periode 1 ns', values: { fmode: 'T', tval: '1', tunit: 'ns' } },
    { label: 'Takte in 1 ms', values: { fmode: 'cycles', cf: '3', cfu: 'GHz', ct: '1', ctu: 'ms' } },
    { label: 'Zeit für 1000 Takte', values: { fmode: 'time', nf: '2', nfu: 'GHz', nn: '1000' } }
  ];
  container.innerHTML = layout(
    panel('Eingabe', `
      ${field({ id: 'fmode', label: 'Berechnung', value: defaults.fmode, options: [['f', 'Frequenz → Periodendauer'], ['T', 'Periodendauer → Frequenz'], ['cycles', 'Takte in einer Zeitspanne'], ['time', 'Zeit für n Takte']] })}
      <div class="form-row" data-fshow="f">
        ${field({ id: 'fval', label: 'Frequenz f', value: defaults.fval, mono: true, attrs: 'inputmode="decimal"' })}
        ${field({ id: 'funit', label: 'Einheit', value: defaults.funit, options: freqOptions })}
      </div>
      <div class="form-row" data-fshow="T">
        ${field({ id: 'tval', label: 'Periodendauer T', value: defaults.tval, mono: true, attrs: 'inputmode="decimal"' })}
        ${field({ id: 'tunit', label: 'Einheit', value: defaults.tunit, options: timeOptions })}
      </div>
      <div data-fshow="cycles">
        <div class="form-row">
          ${field({ id: 'cf', label: 'Taktfrequenz', value: defaults.cf, mono: true, attrs: 'inputmode="decimal"' })}
          ${field({ id: 'cfu', label: 'Einheit', value: defaults.cfu, options: freqOptions })}
        </div>
        <div class="form-row">
          ${field({ id: 'ct', label: 'Zeitspanne', value: defaults.ct, mono: true, attrs: 'inputmode="decimal"' })}
          ${field({ id: 'ctu', label: 'Einheit', value: defaults.ctu, options: timeOptions })}
        </div>
      </div>
      <div data-fshow="time">
        <div class="form-row">
          ${field({ id: 'nf', label: 'Taktfrequenz', value: defaults.nf, mono: true, attrs: 'inputmode="decimal"' })}
          ${field({ id: 'nfu', label: 'Einheit', value: defaults.nfu, options: freqOptions })}
        </div>
        ${field({ id: 'nn', label: 'Anzahl Takte n', value: defaults.nn, mono: true, attrs: 'inputmode="decimal"' })}
      </div>
      <p class="hint">Komma oder Punkt als Dezimaltrennzeichen, Exponent erlaubt (z. B. 2,4e9).</p>
      ${toolActions({ examples })}
      ${explanation(`
        <p><strong>Frequenz</strong> f gibt an, wie viele Schwingungen (Takte) pro Sekunde stattfinden: 1 Hz = 1/s, 1 GHz = 10⁹ Hz.</p>
        <p><strong>Periodendauer</strong> T ist die Dauer einer Schwingung: <code>T = 1 / f</code>. Bei 3,5 GHz dauert ein Takt etwa 0,2857 ns.</p>
        <p><strong>Takte und Zeit:</strong> In der Zeit t vergehen <code>n = f · t</code> Takte; n Takte dauern <code>t = n / f</code>.</p>
        <p>Hinweis: Moderne Prozessoren ändern ihren Takt dynamisch (Turbo, Stromsparen) und führen pro Takt unterschiedlich viele Befehle aus – die Taktzahl allein sagt nichts über die Rechenleistung.</p>
        <p>Gerechnet wird exakt mit Brüchen; „≈“ kennzeichnet gerundete Anzeigen.</p>`)}
    `),
    '<div id="out"></div>'
  );
  const ctl = live(container, {
    output: '#out',
    defaults,
    examples,
    compute: (v) => {
      toggle(container, 'data-fshow', v.fmode);
      if (v.fmode === 'f' || v.fmode === 'T') {
        const r = v.fmode === 'f' ? frequencyInfo(v.fval, v.funit) : frequencyFromPeriod(v.tval, v.tunit);
        const given = v.fmode === 'f' ? `${f(r.hz)} Hz` : `${f(r.period)} s`;
        return panel('Ergebnis', `
          ${resultList([
            { label: 'Frequenz f', value: formatFreq(r.hz, 10), strong: v.fmode === 'T' },
            { label: 'Periodendauer T', value: formatTime(r.period, 10), strong: v.fmode === 'f' }
          ])}
          ${steps(v.fmode === 'f'
            ? [`f = ${v.fval} ${v.funit} = ${f(r.hz)} Hz`, `T = 1 / f = 1 / ${f(r.hz)} Hz = ${f(r.period)} s`, `Passende Einheit: ${formatTime(r.period, 10)}`]
            : [`T = ${v.tval} ${v.tunit} = ${given}`, `f = 1 / T = ${f(r.hz)} Hz`, `Passende Einheit: ${formatFreq(r.hz, 10)}`])}
          <div class="grid grid-2 mt-2 tech-tables">
            ${table(['Frequenz', 'Wert'], r.freqs.map((x) => [x.unit, f(x.value, 10)]))}
            ${table(['Periodendauer', 'Wert'], r.periods.map((x) => [x.unit, f(x.value, 10)]))}
          </div>`);
      }
      if (v.fmode === 'cycles') {
        const r = cyclesForTime(v.cf, v.cfu, v.ct, v.ctu);
        return panel('Ergebnis', `
          ${resultList([
            { label: 'Takte n', value: f(r.cycles, 15), strong: true },
            { label: 'Dauer eines Takts', value: formatTime(div(rat(1n), r.f), 10) }
          ])}
          ${steps([`f = ${f(r.f)} Hz, t = ${f(r.t)} s`, `n = f · t = ${f(r.f)} · ${f(r.t)} = ${f(r.cycles, 15)} Takte`])}
          ${r.cycles.d !== 1n ? notice('Das Ergebnis ist keine ganze Zahl: In der Zeitspanne passt kein ganzzahliges Vielfaches eines Takts.', 'info') : ''}`);
      }
      const r = timeForCycles(v.nf, v.nfu, v.nn);
      return panel('Ergebnis', `
        ${resultList([
          { label: 'Zeit t', value: formatTime(r.time, 10), strong: true },
          { label: 'in Sekunden', value: `${f(r.time, 15)} s` },
          { label: 'pro Takt', value: formatTime(r.perCycle, 10) }
        ])}
        ${steps([`f = ${f(r.f)} Hz`, `t = n / f = ${f(r.n)} / ${f(r.f)} Hz = ${f(r.time, 15)} s`])}`);
    }
  });
  return ctl.destroy;
}

/* ------------------------------------------------------------ Leistung */
function leistung(container) {
  const defaults = {
    lmode: 'battery', u: '12', i: '2,5', p: '60', t: '8', tu: 'h', price: '30', priceu: 'ct',
    cap: '5000', capu: 'mAh', volt: '3,7', bp: '2', eta: '90'
  };
  const defaultItems = () => [
    { name: 'Desktop-PC', watt: '150', hours: '8' },
    { name: 'Monitor', watt: '25', hours: '8' },
    { name: 'Router', watt: '10', hours: '24' }
  ];
  let items = defaultItems();
  const examples = [
    { label: 'Smartphone-Akku', values: { lmode: 'battery', cap: '5000', capu: 'mAh', volt: '3,85', bp: '1,5', eta: '90' } },
    { label: 'Notebook 60 Wh', values: { lmode: 'battery', cap: '60', capu: 'Wh', bp: '15', eta: '100' } },
    { label: 'Netzteil 12 V/2,5 A', values: { lmode: 'pui', u: '12', i: '2,5' } },
    { label: 'Server 24/7', values: { lmode: 'energy', p: '200', t: '1', tu: 'd', price: '30', priceu: 'ct' } },
    { label: 'Arbeitsplatz', values: { lmode: 'components', price: '30', priceu: 'ct' }, items: defaultItems }
  ];
  container.innerHTML = layout(
    panel('Eingabe', `
      ${field({ id: 'lmode', label: 'Berechnung', value: defaults.lmode, options: [['pui', 'Leistung P = U · I'], ['energy', 'Energie E = P · t und Kosten'], ['battery', 'Akkulaufzeit'], ['components', 'Mehrere Verbraucher (Tag/Monat/Jahr)']] })}
      <div class="form-row" data-lshow="pui">
        ${field({ id: 'u', label: 'Spannung U in V', value: defaults.u, mono: true, attrs: 'inputmode="decimal"' })}
        ${field({ id: 'i', label: 'Stromstärke I in A', value: defaults.i, mono: true, attrs: 'inputmode="decimal"' })}
      </div>
      <div data-lshow="energy">
        ${field({ id: 'p', label: 'Leistung P in W', value: defaults.p, mono: true, attrs: 'inputmode="decimal"' })}
        <div class="form-row">
          ${field({ id: 't', label: 'Dauer t', value: defaults.t, mono: true, attrs: 'inputmode="decimal"' })}
          ${field({ id: 'tu', label: 'Einheit', value: defaults.tu, options: [['s', 'Sekunden'], ['min', 'Minuten'], ['h', 'Stunden'], ['d', 'Tage']] })}
        </div>
      </div>
      <div data-lshow="battery">
        <div class="form-row">
          ${field({ id: 'cap', label: 'Kapazität', value: defaults.cap, mono: true, attrs: 'inputmode="decimal"' })}
          ${field({ id: 'capu', label: 'Einheit', value: defaults.capu, options: [['mAh', 'mAh'], ['Wh', 'Wh']] })}
        </div>
        <div data-capshow>${field({ id: 'volt', label: 'Nennspannung in V (nur bei mAh)', value: defaults.volt, mono: true, attrs: 'inputmode="decimal"', hint: 'Li-Ionen-Zellen: typisch 3,6–3,85 V' })}</div>
        <div class="form-row">
          ${field({ id: 'bp', label: 'Leistungsaufnahme in W', value: defaults.bp, mono: true, attrs: 'inputmode="decimal"' })}
          ${field({ id: 'eta', label: 'Wirkungsgrad in % (Annahme)', value: defaults.eta, mono: true, attrs: 'inputmode="decimal"' })}
        </div>
      </div>
      <div data-lshow="components">
        <div id="tech-items" class="stack tech-items"></div>
        <button type="button" class="btn btn-sm mt-2" id="tech-add">+ Verbraucher hinzufügen</button>
      </div>
      <div class="form-row" data-lshow="energy components">
        ${field({ id: 'price', label: 'Strompreis (Annahme)', value: defaults.price, mono: true, attrs: 'inputmode="decimal"' })}
        ${field({ id: 'priceu', label: 'Einheit', value: defaults.priceu, options: [['ct', 'Cent pro kWh'], ['eur', 'Euro pro kWh']] })}
      </div>
      ${toolActions({ examples })}
      ${explanation(`
        <p><strong>Leistung</strong> (Watt): <code>P = U · I</code> – Spannung mal Stromstärke (für Gleichstrom bzw. Wirkleistung).</p>
        <p><strong>Energie</strong>: <code>E = P · t</code>. 1 Wh = 3600 J (Wattsekunden), 1 kWh = 1000 Wh.</p>
        <p><strong>Akkukapazität</strong>: Angaben in mAh sind eine Ladungsmenge; erst mit der Nennspannung wird daraus Energie: <code>Wh = mAh · V / 1000</code>. Laufzeit: <code>t = nutzbare Energie / P</code>.</p>
        <p><strong>Voraussetzungen:</strong> konstante Last, Nennspannung über die gesamte Entladung, Kapazität wie angegeben (Alterung, Temperatur und Entladeschlussspannung verringern sie real). Der Wirkungsgrad (Wandlerverluste) ist eine Annahme.</p>`)}
    `),
    '<div id="out"></div>'
  );
  const list = container.querySelector('#tech-items');
  const renderItems = () => {
    list.innerHTML = items.map((it, k) => `
      <div class="tech-item" data-item="${k}">
        ${field({ id: `cn${k}`, label: 'Name', value: it.name, attrs: `data-key="name" data-no-live maxlength="40"` })}
        ${field({ id: `cw${k}`, label: 'Leistung W', value: it.watt, mono: true, attrs: 'data-key="watt" data-no-live inputmode="decimal"' })}
        ${field({ id: `ch${k}`, label: 'h pro Tag', value: it.hours, mono: true, attrs: 'data-key="hours" data-no-live inputmode="decimal"' })}
        <button type="button" class="icon-btn tech-remove" data-remove="${k}" aria-label="Verbraucher ${k + 1} entfernen" title="Entfernen"${items.length === 1 ? ' disabled' : ''}>✕</button>
      </div>`).join('');
  };
  renderItems();
  let ctl;
  list.addEventListener('input', (event) => {
    const row = event.target.closest('[data-item]');
    if (!row || !event.target.dataset.key) return;
    items[Number(row.dataset.item)][event.target.dataset.key] = event.target.value;
    ctl?.run();
  });
  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove]');
    if (!button) return;
    items.splice(Number(button.dataset.remove), 1);
    renderItems();
    ctl.run();
  });
  container.querySelector('#tech-add').addEventListener('click', () => {
    if (items.length >= 50) return;
    items.push({ name: '', watt: '', hours: '' });
    renderItems();
    list.querySelector(`#cn${items.length - 1}`).focus();
    ctl.run();
  });
  // Vor live() registriert, damit die Liste vor der Neuberechnung gesetzt ist.
  container.querySelectorAll('[data-tool-example]').forEach((b) => b.addEventListener('click', () => {
    const ex = examples[Number(b.dataset.toolExample)];
    if (ex.items) {
      items = ex.items();
      renderItems();
    }
  }));
  container.querySelector('[data-tool-reset]').addEventListener('click', () => {
    items = defaultItems();
    renderItems();
  });

  const costRows = (kwh, v) => {
    const c = energyCost(kwh, v.price, v.priceu);
    return { c, text: `${fmt(c.euro, { maxFrac: 2 })} €` };
  };
  ctl = live(container, {
    output: '#out',
    defaults,
    examples,
    compute: (v) => {
      toggle(container, 'data-lshow', v.lmode);
      container.querySelector('[data-capshow]').hidden = v.capu !== 'mAh';
      const priceNote = notice(`Strompreis ${esc(v.price)} ${v.priceu === 'ct' ? 'ct' : '€'}/kWh ist eine Annahme – tatsächliche Tarife unterscheiden sich (Grundgebühr nicht berücksichtigt).`, 'assumption', { html: true });
      if (v.lmode === 'pui') {
        const r = powerFromUI(v.u, v.i);
        return panel('Ergebnis', `
          ${resultList([{ label: 'Leistung P', value: `${f(r.P)} W`, strong: true }])}
          ${steps([`P = U · I = ${f(r.U)} V · ${f(r.I)} A = ${f(r.P)} W`])}
          ${notice('Gilt für Gleichstrom bzw. ohmsche Last. Bei Wechselstrom mit Phasenverschiebung ist die Wirkleistung P = U · I · cos φ kleiner.', 'info')}`);
      }
      if (v.lmode === 'energy') {
        const r = energy(v.p, v.t, v.tu);
        const cost = costRows(r.kwh, v);
        return panel('Ergebnis', `
          ${resultList([
            { label: 'Energie', value: `${f(r.wh)} Wh`, strong: true },
            { label: 'in kWh', value: `${f(r.kwh)} kWh` },
            { label: 'in Joule', value: `${f(r.joule)} J` },
            { label: 'Kosten', value: cost.text }
          ])}
          ${steps([
            `t = ${v.t} ${v.tu} = ${f(r.hours)} h`,
            `E = P · t = ${f(r.P)} W · ${f(r.hours)} h = ${f(r.wh)} Wh = ${f(r.kwh)} kWh`,
            `In Joule: ${f(r.wh)} Wh · 3600 J/Wh = ${f(r.joule)} J`,
            `Kosten = ${f(r.kwh)} kWh · ${f(cost.c.euroPerKwh)} €/kWh = ${cost.text}`
          ])}
          ${priceNote}`);
      }
      if (v.lmode === 'battery') {
        const r = batteryRuntime({ capacity: v.cap, capUnit: v.capu, voltage: v.volt, power: v.bp, efficiency: v.eta });
        return panel('Ergebnis', `
          ${resultList([
            { label: 'Laufzeit', value: formatDuration(r.seconds), strong: true },
            { label: 'in Stunden', value: `${f(r.hours, 8)} h` },
            { label: 'Energieinhalt', value: `${f(r.wh)} Wh` },
            { label: 'nutzbar', value: `${f(r.usable)} Wh` }
          ])}
          ${steps([
            r.V ? `Energie = ${v.cap} mAh · ${f(r.V)} V / 1000 = ${f(r.wh)} Wh` : `Energie = ${f(r.wh)} Wh`,
            `Nutzbar = ${f(r.wh)} Wh · ${f(r.eta)} % = ${f(r.usable)} Wh`,
            `t = ${f(r.usable)} Wh / ${f(r.P)} W = ${f(r.hours, 10)} h`
          ])}
          ${notice(`Wirkungsgrad ${esc(v.eta)} %, konstante Leistungsaufnahme und Nennspannung über die ganze Entladung. Reale Laufzeiten weichen ab (Last schwankt, Akku altert, Temperatur).`, 'assumption', { html: true })}`);
      }
      const r = componentsEnergy(items);
      const day = costRows(r.dayKwh, v);
      const month = costRows(r.monthKwh, v);
      const year = costRows(r.yearKwh, v);
      return panel('Ergebnis', `
        ${resultList([
          { label: 'pro Tag', value: `${f(r.dayKwh, 6)} kWh · ${day.text}`, copyText: `${f(r.dayKwh, 6)} kWh` },
          { label: 'pro Monat', value: `${f(r.monthKwh, 6)} kWh · ${month.text}`, copyText: `${f(r.monthKwh, 6)} kWh` },
          { label: 'pro Jahr', value: `${f(r.yearKwh, 6)} kWh · ${year.text}`, strong: true, copyText: `${f(r.yearKwh, 6)} kWh` },
          { label: 'Summe Leistung', value: `${f(r.totalW)} W (wenn alle gleichzeitig laufen)` }
        ])}
        <div class="mt-2">${table(['Verbraucher', 'W', 'h/Tag', 'Wh/Tag'], r.rows.map((x) => [x.name, f(x.W), f(x.h), f(x.wh)]))}</div>
        ${steps([
          `Tagesenergie = Σ (P · h) = ${r.rows.map((x) => `${f(x.W)} · ${f(x.h)}`).join(' + ')} = ${f(r.dayWh)} Wh = ${f(r.dayKwh, 8)} kWh`,
          `Monat = Tag · ${f(DAYS_PER_MONTH)} Tage = ${f(r.monthKwh, 8)} kWh`,
          `Jahr = Tag · ${f(DAYS_PER_YEAR)} Tage = ${f(r.yearKwh, 8)} kWh`
        ])}
        ${notice('Ein Jahr wird mit 365,25 Tagen gerechnet, ein Monat mit 365,25 / 12 = 30,4375 Tagen. Leistungen sind als konstant angenommen (Typenschild-Werte sind meist Höchstwerte).', 'assumption')}
        ${priceNote}`);
    }
  });
  return ctl.destroy;
}

/* ------------------------------------------------------------ Prozent */
function prozent(container) {
  const defaults = { pmode: 'percent', find: 'value', base: '250', rate: '20', value: '50', old: '80', neu: '100', p1: '4', p2: '5', a1: '3', b1: '12', a2: '5', kind: 'prop', ratio: '1920:1080' };
  const examples = [
    { label: '20 % von 250', values: { pmode: 'percent', find: 'value', base: '250', rate: '20' } },
    { label: '80 → 100', values: { pmode: 'change', old: '80', neu: '100' } },
    { label: '4 % → 5 %', values: { pmode: 'points', p1: '4', p2: '5' } },
    { label: '4 Server, 6 h → 8 Server', values: { pmode: 'three', a1: '4', b1: '6', a2: '8', kind: 'anti' } },
    { label: '1920:1080', values: { pmode: 'ratio', ratio: '1920:1080' } }
  ];
  container.innerHTML = layout(
    panel('Eingabe', `
      ${field({ id: 'pmode', label: 'Berechnung', value: defaults.pmode, options: [['percent', 'Prozentwert / Grundwert / Prozentsatz'], ['change', 'Prozentuale Veränderung'], ['points', 'Prozent vs. Prozentpunkte'], ['three', 'Dreisatz'], ['ratio', 'Verhältnis kürzen']] })}
      <div data-pshow="percent">
        ${field({ id: 'find', label: 'Gesucht', value: defaults.find, options: [['value', 'Prozentwert W'], ['base', 'Grundwert G'], ['rate', 'Prozentsatz p']] })}
        <div class="form-row">
          <div data-findshow="value rate">${field({ id: 'base', label: 'Grundwert G', value: defaults.base, mono: true, attrs: 'inputmode="decimal"' })}</div>
          <div data-findshow="value base">${field({ id: 'rate', label: 'Prozentsatz p in %', value: defaults.rate, mono: true, attrs: 'inputmode="decimal"' })}</div>
          <div data-findshow="base rate">${field({ id: 'value', label: 'Prozentwert W', value: defaults.value, mono: true, attrs: 'inputmode="decimal"' })}</div>
        </div>
      </div>
      <div class="form-row" data-pshow="change">
        ${field({ id: 'old', label: 'Alter Wert', value: defaults.old, mono: true, attrs: 'inputmode="decimal"' })}
        ${field({ id: 'neu', label: 'Neuer Wert', value: defaults.neu, mono: true, attrs: 'inputmode="decimal"' })}
      </div>
      <div class="form-row" data-pshow="points">
        ${field({ id: 'p1', label: 'Vorher in %', value: defaults.p1, mono: true, attrs: 'inputmode="decimal"' })}
        ${field({ id: 'p2', label: 'Nachher in %', value: defaults.p2, mono: true, attrs: 'inputmode="decimal"' })}
      </div>
      <div data-pshow="three">
        ${field({ id: 'kind', label: 'Zuordnung', value: defaults.kind, options: [['prop', 'proportional (je mehr, desto mehr)'], ['anti', 'antiproportional (je mehr, desto weniger)']] })}
        <div class="form-row">
          ${field({ id: 'a1', label: 'a₁ (bekannt)', value: defaults.a1, mono: true, attrs: 'inputmode="decimal"' })}
          ${field({ id: 'b1', label: 'b₁ (gehört zu a₁)', value: defaults.b1, mono: true, attrs: 'inputmode="decimal"' })}
          ${field({ id: 'a2', label: 'a₂ (neu)', value: defaults.a2, mono: true, attrs: 'inputmode="decimal"' })}
        </div>
      </div>
      <div data-pshow="ratio">
        ${field({ id: 'ratio', label: 'Verhältnis (2–4 Glieder)', value: defaults.ratio, mono: true, hint: 'Getrennt mit „:“, „/“ oder „x“, z. B. 1920:1080 oder 1,5:2,25' })}
      </div>
      ${toolActions({ examples })}
      <p class="small subtle">Speicherwachstum und Kapazitäten: <a href="#/werkzeuge/speicherplatz">Speicherplatz &amp; Kapazität</a> · Datenrate und Dauer: <a href="#/werkzeuge/uebertragungszeit">Übertragungszeit</a></p>
      ${explanation(`
        <p><strong>Grundformel:</strong> <code>W = G · p / 100</code> (Prozentwert = Grundwert · Prozentsatz / 100).</p>
        <p><strong>Veränderung:</strong> <code>(neu − alt) / alt · 100 %</code>. Achtung: +25 % und danach −20 % ergibt wieder den Ausgangswert – Prozente beziehen sich immer auf den jeweiligen Grundwert.</p>
        <p><strong>Prozentpunkte</strong> sind die Differenz zweier Prozentangaben: von 4 % auf 5 % sind es 1 Prozentpunkt, aber eine Steigerung um 25 %.</p>
        <p><strong>Dreisatz:</strong> proportional <code>b₂ = b₁ · a₂ / a₁</code>, antiproportional <code>b₂ = b₁ · a₁ / a₂</code> (z. B. doppelt so viele Server → halbe Zeit, sofern die Arbeit perfekt aufteilbar ist).</p>
        <p><strong>Verhältnis kürzen:</strong> alle Glieder durch den größten gemeinsamen Teiler (ggT, euklidischer Algorithmus) teilen.</p>`)}
    `),
    '<div id="out"></div>'
  );
  const ctl = live(container, {
    output: '#out',
    defaults,
    examples,
    compute: (v) => {
      toggle(container, 'data-pshow', v.pmode);
      toggle(container, 'data-findshow', v.find);
      if (v.pmode === 'percent') {
        const r = percent({ find: v.find, base: v.base, rate: v.rate, value: v.value });
        const G = r.G;
        const W = r.W;
        const p = r.p;
        const label = { value: ['Prozentwert W', `${f(W)}`], base: ['Grundwert G', `${f(G)}`], rate: ['Prozentsatz p', `${f(p)} %`] }[v.find];
        const calc = {
          value: `W = ${f(G)} · ${f(p)} / 100 = ${f(W)}`,
          base: `G = ${f(W)} · 100 / ${f(p)} = ${f(G)}`,
          rate: `p = ${f(W)} / ${f(G)} · 100 = ${f(p)} %`
        }[v.find];
        return panel('Ergebnis', `${resultList([{ label: label[0], value: label[1], strong: true }])}${steps([`Formel: ${r.formula}`, calc])}`);
      }
      if (v.pmode === 'change') {
        const r = change(v.old, v.neu);
        return panel('Ergebnis', `
          ${resultList([
            { label: 'Veränderung', value: `${r.pct.n > 0n ? '+' : ''}${f(r.pct)} %`, strong: true },
            { label: 'absolut', value: f(r.diff) },
            { label: 'Faktor', value: f(r.factor) }
          ])}
          ${steps([`Differenz = ${f(r.b)} − ${f(r.a)} = ${f(r.diff)}`, `Veränderung = ${f(r.diff)} / ${f(r.a.n < 0n ? mul(r.a, rat(-1n)) : r.a)} · 100 % = ${f(r.pct)} %`, `Faktor = neu / alt = ${f(r.factor)}`])}
          ${r.a.n < 0n ? notice('Bei negativem Ausgangswert wird durch den Betrag geteilt; die Aussage „Prozent“ ist dann nur eingeschränkt sinnvoll.', 'warning') : ''}`);
      }
      if (v.pmode === 'points') {
        const r = percentPoints(v.p1, v.p2);
        return panel('Ergebnis', `
          ${resultList([
            { label: 'Differenz', value: `${r.points.n > 0n ? '+' : ''}${f(r.points)} Prozentpunkte`, strong: true },
            { label: 'relative Veränderung', value: r.relative ? `${r.relative.n > 0n ? '+' : ''}${f(r.relative)} %` : 'nicht definiert (Ausgangswert 0 %)' }
          ])}
          ${steps([`Prozentpunkte = ${f(r.b)} % − ${f(r.a)} % = ${f(r.points)} Prozentpunkte`, r.relative ? `Relativ = ${f(r.points)} / ${f(r.a)} · 100 % = ${f(r.relative)} %` : ''])}
          ${notice('Prozentpunkte beschreiben den Abstand zweier Prozentangaben, Prozent die relative Veränderung – beides wird oft verwechselt.', 'info')}`);
      }
      if (v.pmode === 'three') {
        const r = ruleOfThree(v);
        return panel('Ergebnis', `
          ${resultList([{ label: 'b₂', value: f(r.B2), strong: true }])}
          ${steps([
            v.kind === 'anti' ? 'Antiproportional: Das Produkt a · b bleibt gleich.' : 'Proportional: Der Quotient b / a bleibt gleich.',
            v.kind === 'anti' ? `Auf 1: ${f(r.A1)} · ${f(r.B1)} = ${f(mul(r.A1, r.B1))}` : `Auf 1: ${f(r.B1)} / ${f(r.A1)} = ${f(div(r.B1, r.A1))}`,
            `${r.formula.replace('b₂ = ', 'b₂ = ')} → ${v.kind === 'anti' ? `${f(r.B1)} · ${f(r.A1)} / ${f(r.A2)}` : `${f(r.B1)} · ${f(r.A2)} / ${f(r.A1)}`} = ${f(r.B2)}`
          ])}`);
      }
      const r = reduceRatio(v.ratio);
      const g2 = r.ints.length === 2 ? gcdSteps(r.ints[0], r.ints[1]) : null;
      return panel('Ergebnis', `
        ${resultList([
          { label: 'gekürzt', value: r.reduced.join(':'), strong: true },
          { label: 'ggT', value: String(r.gcd) },
          r.reduced.length === 2 ? { label: 'als Dezimalzahl', value: `${f(r.decimal, 8)} : 1` } : null
        ])}
        ${steps([
          r.scale !== 1n ? `Dezimalstellen beseitigen: alle Glieder · ${r.scale} → ${r.ints.join(':')}` : '',
          ...(g2 ? g2.steps.map((s) => `Euklid: ${s}`) : []),
          `ggT = ${r.gcd}`,
          `${r.ints.join(':')} ÷ ${r.gcd} = ${r.reduced.join(':')}`
        ])}`);
    }
  });
  return ctl.destroy;
}

const TOOLS = { frequenz, leistung, prozent };

export function render(toolId, container, ctx) {
  const tool = TOOLS[toolId];
  if (!tool) throw new Error(`Unbekanntes Werkzeug: ${toolId}`);
  return tool(container, ctx);
}
