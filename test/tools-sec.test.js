import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { toHex, groupHex, normalizeHash, compareHashes, digestText, digest, getSubtle, checkFileSize, guessAlgorithm, MAX_FILE_BYTES } from '../public/js/tools/core/crypto-hash.js';
import { keyspace, charsetSize, searchTime, sci, humanTime, log2Big, parseRate, bigText, inspectPassword, RATE_PRESETS } from '../public/js/tools/core/crypto-entropy.js';
import { caesar, caesarBruteForce, bitDifference, toBase64, aesGenerateKey, aesEncrypt, aesDecrypt, ecdsaGenerateKeys, ecdsaSign, ecdsaVerify, requireSubtle, COMPARISON } from '../public/js/tools/core/crypto-demo.js';
import { rat } from '../public/js/tools/core/num.js';

const subtle = webcrypto.subtle;

/* ---------------------------------------------------------------- Hashes */

test('Hex-Formatierung', () => {
  assert.equal(toHex(new Uint8Array([0, 1, 15, 16, 255])), '00010f10ff');
  assert.equal(toHex(new Uint8Array([171, 205]).buffer, { upper: true }), 'ABCD');
  assert.equal(groupHex('0123456789abcdef01', 8), '01234567 89abcdef 01');
});

test('Hash-Vergleich ignoriert Groß-/Kleinschreibung und Leerzeichen', () => {
  const a = 'BA7816BF 8F01CFEA 414140DE 5DAE2223 B00361A3 96177A9C B410FF61 F20015AD';
  const b = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  const r = compareHashes(a, b);
  assert.equal(r.equal, true);
  assert.equal(r.firstDiff, -1);
  assert.ok(r.notes.some((n) => /SHA-256/.test(n)));
  const c = compareHashes(b, b.replace(/d$/, 'e'));
  assert.equal(c.equal, false);
  assert.equal(c.firstDiff, 63);
  const d = compareHashes('abc', 'abcd');
  assert.equal(d.equal, false);
  assert.ok(d.notes.some((n) => /Unterschiedliche Länge/.test(n)));
  assert.ok(compareHashes('xyz', 'xyz').notes.some((n) => /keine Hex-Ziffern/.test(n)));
  assert.throws(() => compareHashes('', 'ab'), /beide Hashwerte/);
  assert.equal(normalizeHash(' AB:cd \n'), 'abcd');
  assert.equal(guessAlgorithm('a'.repeat(128)), 'SHA-512');
});

test('SHA-Testvektoren über Web Crypto (Node)', async () => {
  assert.ok(getSubtle({ crypto: webcrypto }));
  assert.equal(getSubtle({}), null);
  assert.equal(await digestText(subtle, 'SHA-256', 'abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(await digestText(subtle, 'SHA-256', ''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(await digestText(subtle, 'SHA-1', 'abc'), 'a9993e364706816aba3e25717850c26c9cd0d89d');
  assert.equal(
    await digestText(subtle, 'SHA-384', 'abc'),
    'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7'
  );
  assert.equal(
    await digestText(subtle, 'SHA-512', 'abc'),
    'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f'
  );
  // UTF-8: „ä“ = C3 A4
  assert.equal(await digestText(subtle, 'SHA-256', 'ä'), await digest(subtle, 'SHA-256', new Uint8Array([0xc3, 0xa4])));
  await assert.rejects(() => digestText(subtle, 'MD5', 'abc'), /Nicht unterstütztes Verfahren/);
  await assert.rejects(() => digestText(null, 'SHA-256', 'abc'), /nicht verfügbar/);
});

test('Dateigrößenlimit', () => {
  assert.doesNotThrow(() => checkFileSize(MAX_FILE_BYTES));
  assert.throws(() => checkFileSize(MAX_FILE_BYTES + 1), /zu groß .*512 MiB/);
});

/* ---------------------------------------------------------------- Entropie */

test('Entropie H = L · log2(N)', () => {
  const ks = keyspace({ mode: 'chars', length: '8', charset: 26 });
  assert.equal(ks.space, 26n ** 8n);
  assert.ok(Math.abs(ks.bits - 8 * Math.log2(26)) < 1e-12);
  const all = charsetSize({ lower: true, upper: true, digits: true, special: true, specialSize: '33' });
  assert.equal(all.n, 95);
  const k20 = keyspace({ mode: 'chars', length: '20', charset: all.n });
  assert.equal(k20.space, 95n ** 20n);
  assert.ok(Math.abs(k20.bits - 131.4) < 0.05);
  const phrase = keyspace({ mode: 'passphrase', words: '6', listSize: '7776' });
  assert.equal(phrase.space, 7776n ** 6n);
  assert.ok(Math.abs(phrase.bits - 77.55) < 0.01);
  assert.throws(() => charsetSize({}), /mindestens eine Zeichenklasse/);
  assert.throws(() => keyspace({ mode: 'chars', length: '0', charset: 10 }), /Länge: erlaubt sind 1/);
  assert.throws(() => keyspace({ mode: 'chars', length: 'acht', charset: 10 }), /ganze Zahl/);
});

test('log2 großer Zahlen und wissenschaftliche Schreibweise', () => {
  assert.equal(log2Big(2n ** 128n), 128);
  assert.ok(Math.abs(log2Big(95n ** 20n) - 20 * Math.log2(95)) < 1e-9);
  assert.equal(sci(rat(2n ** 128n)), '≈ 3,4 × 10^38');
  assert.equal(sci(rat(2n ** 128n), 4), '≈ 3,403 × 10^38');
  assert.equal(sci(rat(1n, 1000000n)), '1 × 10^-6');
  assert.equal(sci(rat(999n)), '999');
  assert.equal(sci(rat(9995n, 10n ** 10n)), '≈ 1 × 10^-6');
  assert.equal(bigText(2n ** 20n), '1 048 576');
  assert.match(bigText(2n ** 300n), /× 10\^90 \(91 Dezimalstellen\)/);
});

test('Suchdauer: vollständig und im Mittel (Hälfte)', () => {
  // 10^6 Kombinationen bei 1000/s → 1000 s = 16,7 min; Mittel 500 s = 8,33 min
  const t = searchTime(10n ** 6n, 1000n);
  assert.equal(t.fullText, '≈ 16,7 Minuten');
  assert.equal(t.meanText, '≈ 8,33 Minuten');
  // 2^128 bei 10^12/s ≈ 1,08 × 10^19 Jahre (365,25 Tage)
  const big = searchTime(2n ** 128n, 10n ** 12n);
  assert.equal(big.fullText, '≈ 1,08 × 10^19 Jahre');
  assert.equal(humanTime(rat(1n, 10n)), '0,1 Sekunden');
  assert.throws(() => searchTime(10n, 0n), /größer als 0/);
  assert.equal(parseRate('1e9'), 10n ** 9n);
  assert.equal(parseRate('10^12'), 10n ** 12n);
  assert.equal(parseRate('1 000 000'), 1000000n);
  assert.throws(() => parseRate('schnell'), /ganze Zahl/);
  assert.ok(RATE_PRESETS.every((p) => p.note.startsWith('Annahme')));
});

test('Passwortanalyse leitet nur Länge und Klassen ab', () => {
  const r = inspectPassword('Tr0ub4dor&3');
  assert.equal(r.length, 11);
  assert.deepEqual(r.has, { lower: true, upper: true, digits: true, special: true, other: false });
  assert.equal(JSON.stringify(r).includes('Tr0ub'), false);
  assert.equal(inspectPassword('äöü').has.other, true);
  assert.equal(inspectPassword('👍').length, 1);
});

/* ---------------------------------------------------------------- Demos */

test('Caesar-Chiffre und Brute Force', () => {
  assert.equal(caesar('Hallo, Welt!', 3), 'Kdoor, Zhow!');
  assert.equal(caesar('Kdoor, Zhow!', -3), 'Hallo, Welt!');
  assert.equal(caesar('xyz', 3), 'abc');
  assert.equal(caesar('Äpfel', 1), 'Äqgfm');
  assert.throws(() => caesar('a', 26), /−25 bis 25/);
  const all = caesarBruteForce('Kdoor');
  assert.equal(all.length, 25);
  assert.equal(all.find((x) => x.shift === 3).text, 'Hallo');
});

test('Lawineneffekt: Bitunterschied', () => {
  assert.deepEqual(bitDifference('00', 'ff').diff, 8);
  assert.equal(bitDifference('0f', '0e').diff, 1);
  assert.throws(() => bitDifference('ab', 'abc'), /gleich lang/);
});

test('Lawineneffekt mit SHA-256: ein Zeichen ändert etwa die Hälfte der Bits', async () => {
  const a = await digestText(subtle, 'SHA-256', 'Hallo Welt');
  const b = await digestText(subtle, 'SHA-256', 'Hallo Welf');
  const d = bitDifference(a, b);
  assert.equal(d.total, 256);
  assert.ok(d.diff > 80 && d.diff < 176, `${d.diff}`);
});

test('Base64', () => {
  assert.equal(toBase64(new TextEncoder().encode('')), '');
  assert.equal(toBase64(new TextEncoder().encode('f')), 'Zg==');
  assert.equal(toBase64(new TextEncoder().encode('fo')), 'Zm8=');
  assert.equal(toBase64(new TextEncoder().encode('foobar')), 'Zm9vYmFy');
  assert.equal(toBase64(new Uint8Array([255, 254, 253])), Buffer.from([255, 254, 253]).toString('base64'));
});

test('AES-GCM: Ver- und Entschlüsseln, Manipulation wird erkannt', async () => {
  const key = await aesGenerateKey(subtle);
  const iv = new Uint8Array(12);
  webcrypto.getRandomValues(iv);
  const { ciphertext } = await aesEncrypt(subtle, key, 'Geheime Nachricht', iv);
  assert.equal(ciphertext.length, new TextEncoder().encode('Geheime Nachricht').length + 16); // + 128-Bit-Tag
  assert.deepEqual(await aesDecrypt(subtle, key, iv, ciphertext), { ok: true, text: 'Geheime Nachricht' });
  const tampered = ciphertext.slice();
  tampered[0] ^= 1;
  assert.equal((await aesDecrypt(subtle, key, iv, tampered)).ok, false);
  const other = await aesGenerateKey(subtle);
  assert.equal((await aesDecrypt(subtle, other, iv, ciphertext)).ok, false);
});

test('ECDSA: Signatur gültig, nach Textänderung ungültig', async () => {
  const pair = await ecdsaGenerateKeys(subtle);
  const sig = await ecdsaSign(subtle, pair.privateKey, 'Überweise 10 €');
  assert.equal(sig.length, 64); // r || s bei P-256
  assert.equal(await ecdsaVerify(subtle, pair.publicKey, sig, 'Überweise 10 €'), true);
  assert.equal(await ecdsaVerify(subtle, pair.publicKey, sig, 'Überweise 100 €'), false);
  assert.throws(() => requireSubtle(null), /sicheren Kontext/);
  assert.equal(COMPARISON.length, 4);
});
