import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPdfText } from '../server/pdf-text.js';
import { buildPdf, cmapFor } from './pdf-fixture.js';

test('PDF-Text: unkomprimierter Inhaltsstrom mit Umlauten', () => {
  const pdf = buildPdf({ content: 'BT /F1 12 Tf 72 720 Td (Grüße aus dem Subnetting-Kurs) Tj ET' });
  const result = extractPdfText(pdf);
  assert.equal(result.reason, null);
  assert.equal(result.pages, 1);
  assert.match(result.text, /Grüße aus dem Subnetting-Kurs/);
});

test('PDF-Text: FlateDecode, TJ-Abstände und Zeilenumbrüche', () => {
  const content = [
    'BT /F1 12 Tf 72 720 Td [(Subnetting) -400 (und)] TJ',
    '0 -16 Td (CIDR) Tj',
    'ET'
  ].join('\n');
  const result = extractPdfText(buildPdf({ content, compress: true }));
  assert.equal(result.reason, null);
  assert.equal(result.text, 'Subnetting und\nCIDR');
});

test('PDF-Text: ToUnicode-CMap für Zwei-Byte-Codes', () => {
  const cmap = cmapFor({
    '0001': '0047',
    '0002': '0072',
    '0003': '00FC',
    '0004': '00DF',
    '0005': '0065'
  });
  const content = 'BT /F1 12 Tf 72 720 Td <00010002000300040005> Tj ET';
  const result = extractPdfText(buildPdf({ content, cmap }));
  assert.equal(result.reason, null);
  assert.equal(result.text, 'Grüße');
});

test('PDF-Text: Begrenzung, Nicht-PDF und verschlüsselte Datei', () => {
  const long = buildPdf({ content: `BT /F1 12 Tf 72 720 Td (${'A'.repeat(500)}) Tj ET` });
  const capped = extractPdfText(long, { maxChars: 50 });
  assert.equal(capped.text.length, 51, 'abgeschnittener Text endet mit Auslassungszeichen');
  assert.equal(capped.truncated, true);

  const notPdf = extractPdfText(Buffer.from('Das ist nur Text.'));
  assert.equal(notPdf.text, '');
  assert.match(notPdf.reason, /kein PDF/);

  const encrypted = buildPdf();
  const marker = Buffer.from('/Encrypt 9 0 R');
  const withEncrypt = Buffer.concat([encrypted.subarray(0, encrypted.length), marker]);
  assert.equal(extractPdfText(withEncrypt).encrypted, true);
});

test('PDF-Text: PDF ohne Textebene liefert Hinweis statt Fehler', () => {
  const result = extractPdfText(buildPdf({ content: 'q 0 0 100 100 re f Q' }));
  assert.equal(result.text, '');
  assert.match(result.reason, /keine Textebene/);
  assert.equal(result.pages, 1);
});
