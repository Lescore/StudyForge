/**
 * Werkzeuge „Sicherheit“: Hashes, Passwortentropie, Kryptografie-Grundlagen.
 * Alle Berechnungen lokal; kryptografische Operationen ausschließlich über die
 * Web Crypto API des Browsers. Nichts wird gespeichert oder gesendet.
 */
import { esc, field, checkbox, layout, panel, resultList, steps, notice, explanation, toolActions, live, table, readForm, writeForm, errorHtml, limitLength } from '../kit.js';
import { ALGORITHMS, getSubtle, digest, digestText, toHex, groupHex, compareHashes, checkFileSize } from '../core/crypto-hash.js';
import { charsetSize, keyspace, searchTime, parseRate, RATE_PRESETS, bigText, inspectPassword, DEFAULT_SPECIAL } from '../core/crypto-entropy.js';
import { COMPARISON, toBase64, aesGenerateKey, aesEncrypt, aesDecrypt, exportRawKeyHex, ecdsaGenerateKeys, ecdsaSign, ecdsaVerify, exportPublicKeyHex, bitDifference, caesar, caesarBruteForce } from '../core/crypto-demo.js';
import { formatDecimalText, InputError } from '../core/num.js';

const NO_CRYPTO = 'Die Web Crypto API (crypto.subtle) ist in diesem Browser bzw. Kontext nicht verfügbar. Sie wird nur in sicheren Kontexten angeboten (HTTPS, localhost oder 127.0.0.1). Rufe StudyForge über 127.0.0.1 bzw. localhost auf oder nutze einen aktuellen Browser.';

const SHA1_WARNING = 'SHA-1 ist nicht mehr kollisionssicher (praktische Kollisionen seit 2017). Nur für Altsysteme oder zum Vergleich mit vorhandenen Prüfsummen verwenden – nie für Signaturen oder Sicherheitsentscheidungen.';
const PASSWORD_HASH_NOTE = 'SHA-256 & Co. sind schnelle Hashfunktionen und deshalb KEINE geeigneten Passwort-Hashverfahren. Für Passwörter: Argon2id, scrypt, bcrypt oder PBKDF2 – jeweils mit Salt und hohem Kostenfaktor.';

function formatBytes(n) {
  if (n < 1024) return `${n} Byte`;
  const units = ['KiB', 'MiB', 'GiB'];
  let v = n;
  let u = -1;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v.toFixed(2).replace('.', ',')} ${units[u]} (${formatDecimalText(String(n))} Byte)`;
}

/* ------------------------------------------------------------ Hashes */
function hashes(container) {
  const subtle = getSubtle();
  const algoBoxes = Object.keys(ALGORITHMS)
    .map((a) => checkbox({ id: `algo-${a}`, label: a === 'SHA-1' ? 'SHA-1 (veraltet)' : a, checked: a === 'SHA-256' }))
    .join('');
  container.innerHTML = `
    ${subtle ? '' : notice(NO_CRYPTO, 'error')}
    ${layout(
      panel('Eingabe', `
        <div id="sec-hash-in">
          ${field({ id: 'source', label: 'Quelle', value: 'text', options: [['text', 'Text (UTF-8)'], ['file', 'Lokale Datei']] })}
          <div data-src="text">${field({ id: 'text', label: 'Text', value: 'abc', rows: 4, mono: true, hint: 'Der Text wird als UTF-8 kodiert. Zeilenumbrüche und Leerzeichen zählen mit.' })}</div>
          <div data-src="file" hidden>
            <div class="field"><label for="sec-file">Datei auswählen</label><input class="input" type="file" id="sec-file"></div>
            <p class="hint">Die Datei wird nur im Browser gelesen und nicht hochgeladen. Höchstens 512 MiB.</p>
          </div>
          <fieldset class="tool-seg"><legend>Verfahren</legend><div class="sec-algos">${algoBoxes}</div></fieldset>
          ${checkbox({ id: 'upper', label: 'Hex in Großbuchstaben' })}
          ${toolActions({ examples: [{ label: '„abc“ (Testvektor)' }, { label: 'leerer Text' }] })}
        </div>
        ${explanation(`
          <p>Eine <strong>kryptografische Hashfunktion</strong> bildet beliebig lange Daten auf einen Wert fester Länge ab (SHA-256: 256 Bit = 64 Hex-Zeichen). Schon eine winzige Änderung ergibt einen völlig anderen Hash (Lawineneffekt).</p>
          <p>Einsatz: Integritätsprüfung von Downloads (Prüfsumme vergleichen), Bausteine von Signaturen, HMAC und Blockchains.</p>
          <p>Ein Hash ist <strong>keine Verschlüsselung</strong>: Es gibt keinen Schlüssel und keine Umkehrfunktion.</p>
          <p>Testvektor: SHA-256(„abc“) = ba7816bf 8f01cfea 414140de 5dae2223 b00361a3 96177a9c b410ff61 f20015ad.</p>`)}
      `),
      '<div id="sec-hash-out"></div>'
    )}
    ${panel('Hashes vergleichen', `
      <div id="sec-cmp">
        <div class="form-row">
          ${field({ id: 'h1', label: 'Hash 1 (z. B. berechnet)', value: '', mono: true })}
          ${field({ id: 'h2', label: 'Hash 2 (z. B. vom Anbieter)', value: '', mono: true })}
        </div>
        <p class="hint">Groß-/Kleinschreibung, Leerzeichen und Doppelpunkte werden ignoriert.</p>
        ${toolActions({ examples: [{ label: 'gleich (andere Schreibweise)', values: { h1: 'BA7816BF 8F01CFEA 414140DE 5DAE2223 B00361A3 96177A9C B410FF61 F20015AD', h2: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' } }, { label: 'ungleich', values: { h1: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', h2: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ae' } }] })}
        <div id="sec-cmp-out" aria-live="polite"></div>
      </div>`)}
    ${notice(PASSWORD_HASH_NOTE, 'warning')}`;

  const inRoot = container.querySelector('#sec-hash-in');
  const out = container.querySelector('#sec-hash-out');
  const fileInput = container.querySelector('#sec-file');
  let token = 0;
  let timer = null;
  let fileData = null; // { name, size, bytes }

  const selected = () => Object.keys(ALGORITHMS).filter((a) => container.querySelector(`#algo-${CSS.escape(a)}`).checked);

  const show = (results, meta) => {
    const v = readForm(inRoot);
    const rows = results.map(({ algo, hex }) => {
      const shown = v.upper ? hex.toUpperCase() : hex;
      return { label: `${algo} (${ALGORITHMS[algo].bits} Bit)`, value: shown, strong: algo === 'SHA-256' };
    });
    out.innerHTML = panel('Ergebnis', `
      ${resultList([{ label: 'Eingabe', value: meta, mono: false, copy: false }, ...rows])}
      ${results.some((r) => r.algo === 'SHA-1') ? notice(SHA1_WARNING, 'warning') : ''}
      ${steps([
        'Eingabe in Bytes umwandeln (Text: UTF-8; Datei: Rohdaten).',
        `Hashfunktion(en) über die Web Crypto API berechnen: ${results.map((r) => r.algo).join(', ')}.`,
        'Ergebnis als Hexadezimalzahl darstellen (2 Hex-Zeichen pro Byte).',
        results[0] ? `Gruppiert: ${groupHex(results[0].hex)}` : ''
      ], { title: 'Vorgehen', open: false })}`);
  };

  const run = async () => {
    const my = ++token;
    window.clearTimeout(timer);
    if (!subtle) {
      out.innerHTML = '';
      return;
    }
    const v = readForm(inRoot);
    container.querySelectorAll('[data-src]').forEach((el) => (el.hidden = el.dataset.src !== v.source));
    const algos = selected();
    if (!algos.length) {
      out.innerHTML = notice('Bitte mindestens ein Verfahren auswählen.', 'error');
      return;
    }
    try {
      let bytes;
      let meta;
      if (v.source === 'file') {
        if (!fileData) {
          out.innerHTML = notice('Noch keine Datei ausgewählt.', 'info');
          return;
        }
        bytes = fileData.bytes;
        meta = `Datei „${fileData.name}“, ${formatBytes(fileData.size)}`;
      } else {
        limitLength(v.text, 1_000_000, 'Text');
        bytes = new TextEncoder().encode(v.text);
        meta = `Text, ${[...v.text].length} Zeichen = ${formatBytes(bytes.length)} UTF-8`;
      }
      if (v.source === 'file' && bytes.length > 8 * 1024 * 1024) out.innerHTML = notice('Hash wird berechnet …', 'info');
      const results = [];
      for (const algo of algos) results.push({ algo, hex: await digest(subtle, algo, bytes) });
      if (my !== token) return;
      show(results, meta);
    } catch (error) {
      if (my !== token) return;
      out.innerHTML = errorHtml(error);
    }
  };
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(run, 150);
  };

  inRoot.addEventListener('input', (e) => (e.target === fileInput ? null : schedule()));
  inRoot.addEventListener('change', (e) => (e.target === fileInput ? null : run()));
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileData = null;
    if (!file) return run();
    try {
      checkFileSize(file.size);
      out.innerHTML = notice(`Datei wird gelesen (${formatBytes(file.size)}) …`, 'info');
      const bytes = new Uint8Array(await file.arrayBuffer());
      fileData = { name: file.name, size: file.size, bytes };
      run();
    } catch (error) {
      token += 1;
      out.innerHTML = errorHtml(error);
    }
  });
  const exampleTexts = ['abc', ''];
  inRoot.querySelectorAll('[data-tool-example]').forEach((b) => b.addEventListener('click', () => {
    writeForm(inRoot, { source: 'text', text: exampleTexts[Number(b.dataset.toolExample)] });
    run();
  }));
  inRoot.querySelector('[data-tool-reset]').addEventListener('click', () => {
    writeForm(inRoot, { source: 'text', text: 'abc', upper: false });
    Object.keys(ALGORITHMS).forEach((a) => (container.querySelector(`#algo-${CSS.escape(a)}`).checked = a === 'SHA-256'));
    fileInput.value = '';
    fileData = null;
    run();
  });
  run();

  const cmpRoot = container.querySelector('#sec-cmp');
  const cmpExamples = [
    { values: { h1: 'BA7816BF 8F01CFEA 414140DE 5DAE2223 B00361A3 96177A9C B410FF61 F20015AD', h2: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' } },
    { values: { h1: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', h2: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ae' } }
  ];
  const cmp = live(cmpRoot, {
    output: '#sec-cmp-out',
    defaults: { h1: '', h2: '' },
    examples: cmpExamples,
    compute: (v) => {
      if (!v.h1.trim() && !v.h2.trim()) return '<p class="small subtle">Zwei Hashwerte einfügen, um sie zu vergleichen.</p>';
      limitLength(v.h1, 2000, 'Hash 1');
      limitLength(v.h2, 2000, 'Hash 2');
      const r = compareHashes(v.h1, v.h2);
      return `${notice(r.equal ? 'Die Hashwerte sind gleich.' : `Die Hashwerte sind verschieden${r.firstDiff >= 0 ? ` (erste Abweichung an Stelle ${r.firstDiff + 1})` : ''}.`, r.equal ? 'success' : 'error')}
        ${r.notes.length ? `<ul class="small subtle sec-notes">${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}`;
    }
  });
  return () => {
    token += 1;
    window.clearTimeout(timer);
    cmp.destroy();
  };
}

/* ------------------------------------------------------------ Passwortentropie */
function passwortentropie(container) {
  const defaults = { pmode: 'chars', length: '12', lower: true, upper: true, digits: true, special: false, specialSize: String(DEFAULT_SPECIAL), custom: false, customN: '62', words: '6', listSize: '7776', preset: 'offline-fast', rate: '1000000' };
  const examples = [
    { label: '8 Zeichen, alle Klassen', values: { pmode: 'chars', length: '8', lower: true, upper: true, digits: true, special: true, specialSize: '32' } },
    { label: '16 Zeichen a–z', values: { pmode: 'chars', length: '16', lower: true, upper: false, digits: false, special: false } },
    { label: '6-stellige PIN online', values: { pmode: 'chars', length: '6', lower: false, upper: false, digits: true, special: false, preset: 'online-limited' } },
    { label: 'Passphrase 6 Wörter', values: { pmode: 'passphrase', words: '6', listSize: '7776' } },
    { label: '128-Bit-Zufallsschlüssel', values: { pmode: 'chars', length: '32', custom: true, customN: '16' } }
  ];
  const presetOptions = [...RATE_PRESETS.map((p) => [p.id, p.label]), ['custom', 'Eigener Wert']];
  container.innerHTML = layout(
    panel('Eingabe', `
      ${field({ id: 'pmode', label: 'Art', value: defaults.pmode, options: [['chars', 'Zufällige Zeichenfolge'], ['passphrase', 'Passphrase aus Wortliste']] })}
      <div data-ent="chars">
        ${field({ id: 'length', label: 'Länge L (Zeichen)', value: defaults.length, mono: true, attrs: 'inputmode="numeric"' })}
        <fieldset class="tool-seg"><legend>Zeichenklassen</legend>
          <div class="stack sec-classes">
            ${checkbox({ id: 'lower', label: 'Kleinbuchstaben a–z (26)', checked: true })}
            ${checkbox({ id: 'upper', label: 'Großbuchstaben A–Z (26)', checked: true })}
            ${checkbox({ id: 'digits', label: 'Ziffern 0–9 (10)', checked: true })}
            ${checkbox({ id: 'special', label: 'Sonderzeichen' })}
            ${field({ id: 'specialSize', label: 'Anzahl Sonderzeichen', value: defaults.specialSize, mono: true, attrs: 'inputmode="numeric"', hint: 'Druckbares ASCII: 32 Sonderzeichen, mit Leerzeichen 33' })}
            ${checkbox({ id: 'custom', label: 'Zeichensatzgröße N frei eingeben' })}
            ${field({ id: 'customN', label: 'N (Anzahl möglicher Zeichen)', value: defaults.customN, mono: true, attrs: 'inputmode="numeric"', hint: 'z. B. 16 für Hex, 64 für Base64' })}
          </div>
        </fieldset>
        <div class="field">
          <label for="sec-pw">Optional: Passwort analysieren (nur Länge und Klassen werden übernommen)</label>
          <input class="input mono" type="password" id="sec-pw" autocomplete="off" spellcheck="false" data-no-live>
          <span class="hint">Wird nicht gespeichert oder gesendet. Die Analyse übernimmt nur Länge und vorkommende Zeichenklassen – sie kann nicht erkennen, ob das Passwort zufällig gewählt wurde.</span>
        </div>
        <div id="sec-pw-info" class="small subtle" aria-live="polite"></div>
      </div>
      <div data-ent="passphrase">
        <div class="form-row">
          ${field({ id: 'words', label: 'Anzahl Wörter k', value: defaults.words, mono: true, attrs: 'inputmode="numeric"' })}
          ${field({ id: 'listSize', label: 'Größe der Wortliste W', value: defaults.listSize, mono: true, attrs: 'inputmode="numeric"', hint: 'Diceware: 7776 = 6⁵' })}
        </div>
      </div>
      ${field({ id: 'preset', label: 'Angenommene Versuche pro Sekunde', value: defaults.preset, options: presetOptions })}
      <div data-rate-custom>${field({ id: 'rate', label: 'Versuche pro Sekunde', value: defaults.rate, mono: true, hint: 'Ganze Zahl, auch 1e9 oder 10^12' })}</div>
      ${toolActions({ examples })}
      ${explanation(`
        <p>Bei einem <strong>zufällig und gleichverteilt</strong> gewählten Passwort aus N möglichen Zeichen und Länge L gibt es <code>S = N^L</code> Möglichkeiten. Die Entropie ist <code>H = log₂(S) = L · log₂(N)</code> Bit.</p>
        <p>Eine vollständige Suche braucht <code>S / r</code> Sekunden bei r Versuchen pro Sekunde; im Mittel wird das Passwort nach der Hälfte gefunden.</p>
        <p><strong>Grenzen:</strong> Von Menschen gewählte Passwörter (Wörter, Namen, Muster, „Passwort1!“) werden mit Wörterbüchern und Regeln in einem Bruchteil dieser Zeit gefunden – für sie gilt die Formel nicht. Wiederverwendete Passwörter aus Datenlecks helfen gar nicht, egal wie lang.</p>
        <p>Die Rate hängt vom Angriffsszenario ab: Online-Dienste begrenzen Versuche, bei gestohlenen Hashdatenbanken entscheidet das Hashverfahren (schnelles SHA-256 vs. bewusst langsames Argon2id/bcrypt).</p>`)}
    `),
    '<div id="out"></div>'
  );
  const pw = container.querySelector('#sec-pw');
  const pwInfo = container.querySelector('#sec-pw-info');
  const ctl = live(container, {
    output: '#out',
    defaults,
    examples,
    compute: (v) => {
      container.querySelectorAll('[data-ent]').forEach((el) => (el.hidden = el.dataset.ent !== v.pmode));
      container.querySelector('[data-rate-custom]').hidden = v.preset !== 'custom';
      container.querySelector('#specialSize').closest('.field').hidden = !v.special || v.custom;
      container.querySelector('#customN').closest('.field').hidden = !v.custom;
      ['lower', 'upper', 'digits', 'special'].forEach((k) => (container.querySelector(`#${k}`).disabled = v.custom));

      let N = null;
      let parts = [];
      if (v.pmode === 'chars') {
        if (v.custom) {
          N = keyspace({ mode: 'chars', length: '1', charset: v.customN }).base;
          parts = [`${N} (frei gewählt)`];
        } else {
          const c = charsetSize(v);
          N = c.n;
          parts = c.parts;
        }
      }
      const ks = keyspace({ mode: v.pmode, length: v.length, charset: N, words: v.words, listSize: v.listSize });
      const preset = RATE_PRESETS.find((p) => p.id === v.preset);
      const rate = preset ? preset.rate : parseRate(v.rate);
      const t = searchTime(ks.space, rate);
      const bitsText = `${ks.bits.toFixed(2).replace('.', ',')} Bit`;
      const rateText = bigText(rate);
      const comparison = RATE_PRESETS.map((p) => {
        const x = searchTime(ks.space, p.rate);
        return [{ html: `${esc(p.label)}${p.id === v.preset ? ' <span class="badge badge-accent">gewählt</span>' : ''}` }, x.meanText, x.fullText];
      });
      return panel('Ergebnis', `
        ${resultList([
          { label: 'Entropie H', value: `≈ ${bitsText}`, strong: true, copyText: bitsText },
          { label: 'Möglichkeiten S', value: v.pmode === 'chars' ? `${N}^${ks.exponent} = ${bigText(ks.space)}` : `${ks.base}^${ks.exponent} = ${bigText(ks.space)}` },
          { label: 'Suche im Mittel', value: t.meanText },
          { label: 'Suche vollständig', value: t.fullText },
          { label: 'Annahme Rate', value: `${rateText} Versuche/s` }
        ])}
        ${steps([
          v.pmode === 'chars' ? `Zeichensatz N = ${parts.join(' + ')} = ${N}` : `Wortliste W = ${ks.base}, Wörter k = ${ks.exponent}`,
          `${ks.formula} = ${bitsText}`,
          `S = ${v.pmode === 'chars' ? `N^L = ${N}^${ks.exponent}` : `W^k = ${ks.base}^${ks.exponent}`} = ${bigText(ks.space)}`,
          `Vollständige Suche: S / r = ${bigText(ks.space)} / ${rateText} s → ${t.fullText}`,
          `Im Mittel (Hälfte): ${t.meanText}`
        ])}
        ${preset ? notice(preset.note.replace(/^Annahme: /, ''), 'assumption') : notice('Eigene Rate – Größenordnung selbst begründen.', 'assumption')}
        ${notice('Diese Rechnung gilt nur für zufällig gewählte Passwörter. Von Menschen ausgedachte Passwörter sind meist viel schwächer, weil Angreifer Wörterbücher, bekannte Leaks und typische Muster zuerst probieren. Die Zeiten sind Größenordnungen, keine Garantie.', 'warning')}
        <h3 class="sec-sub">Vergleich der Szenarien</h3>
        ${table(['Szenario (Annahme)', 'im Mittel', 'vollständig'], comparison, { className: 'sec-compare' })}
        <p class="small subtle">Jahre mit 365,25 Tagen. Zum Einordnen: Das Universum ist etwa 1,38 × 10^10 Jahre alt.</p>`);
    }
  });
  pw.addEventListener('input', () => {
    if (!pw.value) {
      pwInfo.textContent = '';
      return;
    }
    const r = inspectPassword(pw.value);
    const classes = [r.has.lower && 'Kleinbuchstaben', r.has.upper && 'Großbuchstaben', r.has.digits && 'Ziffern', r.has.special && 'Sonderzeichen'].filter(Boolean);
    writeForm(container, { pmode: 'chars', custom: false, length: String(r.length), lower: r.has.lower, upper: r.has.upper, digits: r.has.digits, special: r.has.special });
    pwInfo.textContent = `Übernommen: Länge ${r.length}, Klassen: ${classes.join(', ') || 'keine'}${r.has.other ? ' – enthält außerdem Zeichen außerhalb von ASCII (z. B. Umlaute), die hier nicht als eigene Klasse zählen.' : '.'}`;
    if (r.length > 1024) pwInfo.textContent = 'Zu lang für die Analyse (höchstens 1024 Zeichen).';
    ctl.run();
  });
  const clearPw = () => {
    pw.value = '';
    pwInfo.textContent = '';
  };
  container.querySelector('[data-tool-reset]').addEventListener('click', clearPw);
  container.querySelectorAll('[data-tool-example]').forEach((b) => b.addEventListener('click', clearPw));
  return () => {
    clearPw();
    ctl.destroy();
  };
}

/* ------------------------------------------------------------ Krypto-Grundlagen */
function kryptoGrundlagen(container) {
  const subtle = getSubtle();
  const demoCard = (title, body) => panel(title, `<p><span class="tool-badge-sim">Beispiel</span></p>${body}`, { className: 'sec-demo' });
  container.innerHTML = `
    ${panel('Verfahren im Vergleich', `
      ${table(['Art', 'Zweck', 'Schlüssel', 'Umkehrbar?', 'Beispiele'], COMPARISON.map((r) => [{ html: `<strong>${esc(r.kind)}</strong>` }, r.purpose, r.keys, r.reversible, r.examples]), { className: 'sec-table' })}
      ${explanation(`
        <p><strong>Hashing</strong> erzeugt einen Fingerabdruck – ohne Schlüssel, nicht umkehrbar. <strong>Symmetrische Verschlüsselung</strong> nutzt einen gemeinsamen geheimen Schlüssel für Ver- und Entschlüsselung; sie ist schnell und schützt die eigentlichen Daten. <strong>Asymmetrische Verfahren</strong> arbeiten mit Schlüsselpaaren; sie lösen das Problem, wie zwei Parteien einen gemeinsamen Schlüssel vereinbaren. <strong>Signaturen</strong> beweisen, dass eine Nachricht vom Inhaber des privaten Schlüssels stammt und nicht verändert wurde.</p>
        <p>In der Praxis werden die Verfahren kombiniert (z. B. TLS: ECDHE für den Schlüsselaustausch, AES-GCM oder ChaCha20-Poly1305 für die Daten, ECDSA/RSA-PSS/Ed25519 für Zertifikatssignaturen, SHA-256 als Hash).</p>
        <p><strong>Grundregel:</strong> Keine selbst erfundenen Verfahren einsetzen – nur etablierte, geprüfte Bibliotheken und Algorithmen.</p>`, { open: true })}
    `)}
    ${subtle ? notice('Die folgenden Demonstrationen nutzen die Web Crypto API deines Browsers. Schlüssel werden frisch erzeugt, existieren nur im Arbeitsspeicher dieser Seite und werden beim Verlassen verworfen. Nichts wird gespeichert oder gesendet.', 'info') : notice(NO_CRYPTO, 'error')}
    <div class="sec-demos">
      ${demoCard('Hash: Lawineneffekt', `
        <div id="sec-av">
          ${field({ id: 'av1', label: 'Text 1', value: 'Hallo Welt', mono: true })}
          ${field({ id: 'av2', label: 'Text 2 (ein Zeichen geändert)', value: 'Hallo Welf', mono: true })}
          <div id="sec-av-out" aria-live="polite"></div>
        </div>`)}
      ${demoCard('Symmetrisch: AES-GCM (256 Bit)', `
        <div id="sec-aes">
          ${field({ id: 'aesText', label: 'Klartext', value: 'Treffen um 12 Uhr', mono: true })}
          <div class="row sec-buttons">
            <button type="button" class="btn btn-sm btn-primary" data-aes="encrypt">Schlüssel erzeugen &amp; verschlüsseln</button>
            <button type="button" class="btn btn-sm" data-aes="decrypt" disabled>Entschlüsseln</button>
            <button type="button" class="btn btn-sm" data-aes="tamper" disabled>1 Bit im Chiffrat kippen</button>
            <button type="button" class="btn btn-sm" data-aes="wrongkey" disabled>Mit anderem Schlüssel entschlüsseln</button>
          </div>
          <div id="sec-aes-out" aria-live="polite"></div>
        </div>`)}
      ${demoCard('Signatur: ECDSA P-256 mit SHA-256', `
        <div id="sec-sig">
          ${field({ id: 'sigText', label: 'Nachricht', value: 'Überweise 10 € an Konto 42', mono: true })}
          <div class="row sec-buttons"><button type="button" class="btn btn-sm btn-primary" data-sig="sign">Schlüsselpaar erzeugen &amp; signieren</button></div>
          <div id="sec-sig-keys"></div>
          ${field({ id: 'sigCheck', label: 'Zu prüfende Nachricht (ändere sie!)', value: '', mono: true })}
          <div id="sec-sig-out" aria-live="polite"></div>
        </div>`)}
      ${demoCard('Klassisch: Caesar-Chiffre', `
        <div id="sec-caesar">
          ${notice('Nur zur Veranschaulichung – völlig unsicher: Es gibt nur 25 mögliche Schlüssel, alle lassen sich sofort durchprobieren.', 'warning')}
          <div class="form-row">
            ${field({ id: 'cText', label: 'Text', value: 'Hallo Welt', mono: true })}
            ${field({ id: 'cShift', label: 'Verschiebung', value: '3', type: 'number', attrs: 'min="-25" max="25"' })}
          </div>
          <div id="sec-caesar-out" aria-live="polite"></div>
        </div>`)}
    </div>`;

  /* Lawineneffekt */
  const avRoot = container.querySelector('#sec-av');
  const avOut = container.querySelector('#sec-av-out');
  let avToken = 0;
  let avTimer = null;
  const runAv = async () => {
    if (!subtle) {
      avOut.innerHTML = notice(NO_CRYPTO, 'error');
      return;
    }
    const my = ++avToken;
    const v = readForm(avRoot);
    try {
      limitLength(v.av1, 10000, 'Text 1');
      limitLength(v.av2, 10000, 'Text 2');
      const [a, b] = await Promise.all([digestText(subtle, 'SHA-256', v.av1), digestText(subtle, 'SHA-256', v.av2)]);
      if (my !== avToken) return;
      const d = bitDifference(a, b);
      const mark = (hex, other) => [...hex].map((c, i) => (c !== other[i] ? `<mark class="sec-diff">${c}</mark>` : c)).join('');
      avOut.innerHTML = `
        <div class="mono-block mono-wrap sec-hash">${mark(a, b)}</div>
        <div class="mono-block mono-wrap sec-hash">${mark(b, a)}</div>
        ${notice(a === b ? 'Gleicher Text → gleicher Hash.' : `${d.diff} von ${d.total} Bit unterscheiden sich (${d.percent.toFixed(1).replace('.', ',')} %). Bei einer guten Hashfunktion ist im Mittel etwa die Hälfte der Bits verschieden.`, a === b ? 'info' : 'success')}`;
    } catch (error) {
      avOut.innerHTML = errorHtml(error);
    }
  };
  avRoot.addEventListener('input', () => {
    window.clearTimeout(avTimer);
    avTimer = window.setTimeout(runAv, 150);
  });
  runAv();

  /* AES-GCM */
  const aesRoot = container.querySelector('#sec-aes');
  const aesOut = container.querySelector('#sec-aes-out');
  let aes = null; // { key, iv, ciphertext, keyHex }
  const aesButtons = (on) => aesRoot.querySelectorAll('[data-aes]:not([data-aes="encrypt"])').forEach((b) => (b.disabled = !on));
  const aesView = (extra = '') => `
    ${resultList([
      { label: 'Schlüssel (256 Bit, Hex)', value: aes.keyHex },
      { label: 'Nonce/IV (96 Bit, Hex)', value: toHex(aes.iv) },
      { label: 'Chiffrat + Tag (Base64)', value: toBase64(aes.ciphertext) },
      { label: 'Länge', value: `${aes.ciphertext.length} Byte = ${aes.ciphertext.length - 16} Byte Daten + 16 Byte Authentifizierungs-Tag`, mono: false, copy: false }
    ])}
    ${extra}`;
  aesRoot.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-aes]')?.dataset.aes;
    if (!action) return;
    if (!subtle) {
      aesOut.innerHTML = notice(NO_CRYPTO, 'error');
      return;
    }
    try {
      if (action === 'encrypt') {
        const text = limitLength(readForm(aesRoot).aesText, 10000, 'Klartext');
        const key = await aesGenerateKey(subtle);
        const { iv, ciphertext } = await aesEncrypt(subtle, key, text);
        aes = { key, iv, ciphertext, keyHex: await exportRawKeyHex(subtle, key) };
        aesButtons(true);
        aesOut.innerHTML = aesView(notice('Verschlüsselt. Ohne den Schlüssel ist das Chiffrat nicht lesbar. Die Nonce darf mit demselben Schlüssel nie wiederverwendet werden.', 'success'));
      } else if (aes && action === 'decrypt') {
        const r = await aesDecrypt(subtle, aes.key, aes.iv, aes.ciphertext);
        aesOut.innerHTML = aesView(r.ok ? notice(`Entschlüsselt: „${r.text}“`, 'success') : notice('Entschlüsselung fehlgeschlagen: Die Tag-Prüfung schlägt fehl – die Daten wurden verändert.', 'error'));
      } else if (aes && action === 'tamper') {
        aes.ciphertext = aes.ciphertext.slice();
        aes.ciphertext[0] ^= 1;
        const r = await aesDecrypt(subtle, aes.key, aes.iv, aes.ciphertext);
        aesOut.innerHTML = aesView(r.ok ? notice(`Unerwartet entschlüsselt: „${r.text}“`, 'warning') : notice('Ein einziges Bit wurde verändert – AES-GCM erkennt die Manipulation (Authentifizierungs-Tag passt nicht) und gibt nichts heraus.', 'error'));
      } else if (aes && action === 'wrongkey') {
        const other = await aesGenerateKey(subtle);
        const r = await aesDecrypt(subtle, other, aes.iv, aes.ciphertext);
        aesOut.innerHTML = aesView(r.ok ? notice('Unerwartet entschlüsselt.', 'warning') : notice('Mit einem anderen (frisch erzeugten) Schlüssel schlägt die Entschlüsselung fehl.', 'error'));
      }
    } catch (error) {
      aesOut.innerHTML = errorHtml(error);
    }
  });
  aesRoot.addEventListener('input', () => {
    if (!aes) return;
    aes = null;
    aesButtons(false);
    aesOut.innerHTML = notice('Klartext geändert – bitte neu verschlüsseln.', 'info');
  });

  /* ECDSA */
  const sigRoot = container.querySelector('#sec-sig');
  const sigOut = container.querySelector('#sec-sig-out');
  const sigKeys = container.querySelector('#sec-sig-keys');
  let sig = null; // { keys, signature, message }
  let sigToken = 0;
  const verify = async () => {
    if (!sig) {
      sigOut.innerHTML = '<p class="small subtle">Erst signieren, dann prüfen.</p>';
      return;
    }
    const my = ++sigToken;
    const text = readForm(sigRoot).sigCheck;
    try {
      const ok = await ecdsaVerify(subtle, sig.keys.publicKey, sig.signature, text);
      if (my !== sigToken) return;
      sigOut.innerHTML = ok
        ? notice('Signatur gültig: Die Nachricht stimmt mit der signierten überein und wurde mit dem passenden privaten Schlüssel signiert.', 'success')
        : notice('Signatur ungültig: Die geprüfte Nachricht unterscheidet sich von der signierten (oder die Signatur gehört zu einem anderen Schlüssel).', 'error');
    } catch (error) {
      sigOut.innerHTML = errorHtml(error);
    }
  };
  sigRoot.addEventListener('click', async (event) => {
    if (event.target.closest('[data-sig]')?.dataset.sig !== 'sign') return;
    if (!subtle) {
      sigOut.innerHTML = notice(NO_CRYPTO, 'error');
      return;
    }
    try {
      const message = limitLength(readForm(sigRoot).sigText, 10000, 'Nachricht');
      const keys = await ecdsaGenerateKeys(subtle);
      const signature = await ecdsaSign(subtle, keys.privateKey, message);
      sig = { keys, signature, message };
      sigKeys.innerHTML = resultList([
        { label: 'Öffentlicher Schlüssel (Hex, unkomprimiert)', value: await exportPublicKeyHex(subtle, keys.publicKey) },
        { label: 'Signatur r‖s (64 Byte, Hex)', value: toHex(signature) },
        { label: 'Privater Schlüssel', value: 'bleibt im Speicher und wird nicht angezeigt', mono: false, copy: false }
      ]);
      writeForm(sigRoot, { sigCheck: message });
      verify();
    } catch (error) {
      sigOut.innerHTML = errorHtml(error);
    }
  });
  sigRoot.querySelector('#sigCheck').addEventListener('input', verify);
  verify();

  /* Caesar */
  const cRoot = container.querySelector('#sec-caesar');
  const cOut = container.querySelector('#sec-caesar-out');
  const runCaesar = () => {
    try {
      const v = readForm(cRoot);
      limitLength(v.cText, 2000, 'Text');
      const shift = String(v.cShift).trim();
      if (!/^-?[0-9]+$/.test(shift)) throw new InputError('Verschiebung: Bitte eine ganze Zahl von −25 bis 25 eingeben.');
      const enc = caesar(v.cText, Number(shift));
      const brute = caesarBruteForce(enc).slice(0, 25);
      cOut.innerHTML = `
        ${resultList([{ label: 'Verschlüsselt', value: enc, strong: true }, { label: 'Zurück (−Verschiebung)', value: caesar(enc, -Number(shift)) }])}
        <details class="tool-steps"><summary>Angriff: alle 25 Schlüssel durchprobieren</summary>
          ${table(['Verschiebung', 'Ergebnis'], brute.map((b) => [String(b.shift), b.text]), { className: 'sec-brute' })}
        </details>`;
    } catch (error) {
      cOut.innerHTML = errorHtml(error);
    }
  };
  cRoot.addEventListener('input', runCaesar);
  runCaesar();

  return () => {
    avToken += 1;
    sigToken += 1;
    window.clearTimeout(avTimer);
    aes = null;
    sig = null;
  };
}

const TOOLS = { hashes, passwortentropie, 'krypto-grundlagen': kryptoGrundlagen };

export function render(toolId, container, ctx) {
  const tool = TOOLS[toolId];
  if (!tool) throw new Error(`Unbekanntes Werkzeug: ${toolId}`);
  return tool(container, ctx);
}

