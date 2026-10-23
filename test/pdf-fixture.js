import zlib from 'node:zlib';

/**
 * Baut ein kleines, gültiges PDF für Tests. Nur so viel Struktur wie nötig:
 * Katalog, Seitenbaum, eine Seite, Inhaltsstrom und eine Schrift.
 */
export function buildPdf({ content = 'BT /F1 12 Tf 72 720 Td (Hallo) Tj ET', compress = false, font = null, cmap = null } = {}) {
  const body = compress ? zlib.deflateSync(Buffer.from(content, 'latin1')) : Buffer.from(content, 'latin1');
  const fontObject =
    font ?? (cmap ? '<</Type /Font /Subtype /Type0 /BaseFont /Test /Encoding /Identity-H /ToUnicode 6 0 R>>' : '<</Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding>>');
  const entries = [
    '<</Type /Catalog /Pages 2 0 R>>',
    '<</Type /Pages /Kids [3 0 R] /Count 1>>',
    '<</Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources <</Font <</F1 5 0 R>>>> /Contents 4 0 R>>',
    `<</Length ${body.length}${compress ? ' /Filter /FlateDecode' : ''}>>\nstream\n${body.toString('latin1')}\nendstream`,
    fontObject
  ];
  if (cmap) entries.push(`<</Length ${cmap.length}>>\nstream\n${cmap}\nendstream`);

  let out = '%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n';
  const offsets = [];
  entries.forEach((entry, index) => {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${entry}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${entries.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<</Size ${entries.length + 1} /Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** ToUnicode-CMap für Hex-Codes, z. B. { '0001': '0047' }. */
export function cmapFor(map) {
  const rows = Object.entries(map)
    .map(([code, unicode]) => `<${code}> <${unicode}>`)
    .join('\n');
  return `begincmap\n/CMapName /Test def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${Object.keys(map).length} beginbfchar\n${rows}\nendbfchar\nendcmap`;
}
