/**
 * MIME-Typen (Medientypen, IANA-Registrierung) zu Dateiendungen.
 * Gruppen: text, image, audio, video, font, application.
 * `note` markiert Besonderheiten (veraltete Alias-Typen, uneinheitliche Praxis).
 */
export const MIME_TYPES = [
  // Text & Web
  { ext: ['html', 'htm'], type: 'text/html', desc: 'HTML-Dokument', charset: true },
  { ext: ['css'], type: 'text/css', desc: 'Stylesheet (CSS)', charset: true },
  { ext: ['js', 'mjs'], type: 'text/javascript', desc: 'JavaScript', charset: true, note: 'Laut RFC 9239 der einzig empfohlene Typ; „application/javascript“ ist veraltet, wird aber noch akzeptiert.' },
  { ext: ['json'], type: 'application/json', desc: 'JSON-Daten', note: 'JSON ist immer UTF-8 (RFC 8259); ein charset-Parameter ist nicht definiert und wird ignoriert.' },
  { ext: ['jsonld'], type: 'application/ld+json', desc: 'JSON-LD (verknüpfte Daten)' },
  { ext: ['map'], type: 'application/json', desc: 'Source-Map (JSON)' },
  { ext: ['xml'], type: 'application/xml', desc: 'XML-Dokument', note: '„text/xml“ ist ebenfalls registriert; application/xml wird bevorzugt (RFC 7303).' },
  { ext: ['xhtml', 'xht'], type: 'application/xhtml+xml', desc: 'XHTML-Dokument' },
  { ext: ['svg'], type: 'image/svg+xml', desc: 'SVG-Vektorgrafik (XML)' },
  { ext: ['txt', 'text'], type: 'text/plain', desc: 'Reiner Text', charset: true },
  { ext: ['csv'], type: 'text/csv', desc: 'Kommagetrennte Werte (CSV, RFC 4180)', charset: true },
  { ext: ['tsv'], type: 'text/tab-separated-values', desc: 'Tabulatorgetrennte Werte', charset: true },
  { ext: ['md', 'markdown'], type: 'text/markdown', desc: 'Markdown (RFC 7763)', charset: true },
  { ext: ['ics', 'ifb'], type: 'text/calendar', desc: 'iCalendar-Termine', charset: true },
  { ext: ['vcf', 'vcard'], type: 'text/vcard', desc: 'vCard-Kontakt', charset: true },
  { ext: ['rtf'], type: 'application/rtf', desc: 'Rich Text Format' },
  { ext: ['yaml', 'yml'], type: 'application/yaml', desc: 'YAML (seit RFC 9512 registriert)', note: 'Vorher verbreitet: text/yaml oder application/x-yaml.' },
  { ext: ['wasm'], type: 'application/wasm', desc: 'WebAssembly-Modul' },
  { ext: ['webmanifest'], type: 'application/manifest+json', desc: 'Web-App-Manifest' },
  { ext: ['atom'], type: 'application/atom+xml', desc: 'Atom-Feed' },
  { ext: ['rss'], type: 'application/rss+xml', desc: 'RSS-Feed', note: 'Nicht bei der IANA registriert, aber üblich.' },
  // Bilder
  { ext: ['png'], type: 'image/png', desc: 'PNG-Bild (verlustfrei)' },
  { ext: ['jpg', 'jpeg', 'jpe'], type: 'image/jpeg', desc: 'JPEG-Bild', note: '„image/jpg“ gibt es offiziell nicht.' },
  { ext: ['gif'], type: 'image/gif', desc: 'GIF-Bild/Animation' },
  { ext: ['webp'], type: 'image/webp', desc: 'WebP-Bild' },
  { ext: ['avif'], type: 'image/avif', desc: 'AVIF-Bild (AV1-basiert)' },
  { ext: ['bmp'], type: 'image/bmp', desc: 'Windows-Bitmap' },
  { ext: ['ico'], type: 'image/vnd.microsoft.icon', desc: 'Icon (Favicon)', note: 'In der Praxis oft auch image/x-icon.' },
  { ext: ['tif', 'tiff'], type: 'image/tiff', desc: 'TIFF-Bild' },
  { ext: ['heic'], type: 'image/heic', desc: 'HEIC-Bild (HEIF mit HEVC)' },
  // Audio
  { ext: ['mp3'], type: 'audio/mpeg', desc: 'MP3-Audio' },
  { ext: ['m4a'], type: 'audio/mp4', desc: 'AAC/ALAC-Audio im MP4-Container' },
  { ext: ['aac'], type: 'audio/aac', desc: 'AAC-Audio (ADTS)' },
  { ext: ['oga', 'ogg'], type: 'audio/ogg', desc: 'Ogg-Audio (Vorbis/Opus)', note: '„.ogg“ kann auch Video enthalten; dann video/ogg.' },
  { ext: ['opus'], type: 'audio/ogg', desc: 'Opus-Audio im Ogg-Container', note: 'Oft auch mit Parameter: audio/ogg; codecs=opus.' },
  { ext: ['wav'], type: 'audio/wav', desc: 'WAV-Audio', note: 'Registriert ist audio/vnd.wave; in der Praxis üblich sind audio/wav bzw. audio/x-wav.' },
  { ext: ['flac'], type: 'audio/flac', desc: 'FLAC-Audio (verlustfrei)' },
  { ext: ['weba'], type: 'audio/webm', desc: 'WebM-Audio' },
  { ext: ['mid', 'midi'], type: 'audio/midi', desc: 'MIDI-Steuerdaten', note: 'Nicht bei der IANA registriert, aber üblich (auch audio/x-midi).' },
  // Video
  { ext: ['mp4', 'm4v'], type: 'video/mp4', desc: 'MP4-Video' },
  { ext: ['webm'], type: 'video/webm', desc: 'WebM-Video' },
  { ext: ['ogv'], type: 'video/ogg', desc: 'Ogg-Video' },
  { ext: ['mov'], type: 'video/quicktime', desc: 'QuickTime-Video' },
  { ext: ['avi'], type: 'video/x-msvideo', desc: 'AVI-Video', note: 'Nicht registriert (x-Präfix), aber üblich.' },
  { ext: ['mkv'], type: 'video/x-matroska', desc: 'Matroska-Video', note: 'Seit 2024 auch registriert als video/matroska.' },
  { ext: ['mpeg', 'mpg'], type: 'video/mpeg', desc: 'MPEG-Video' },
  { ext: ['ts'], type: 'video/mp2t', desc: 'MPEG-Transportstrom', note: 'Achtung: „.ts“ ist auch die Endung von TypeScript-Quelltext (dann meist text/plain oder application/typescript).' },
  { ext: ['3gp'], type: 'video/3gpp', desc: '3GPP-Video (Mobilfunk)' },
  // Schriften
  { ext: ['woff2'], type: 'font/woff2', desc: 'Web Open Font Format 2' },
  { ext: ['woff'], type: 'font/woff', desc: 'Web Open Font Format' },
  { ext: ['ttf'], type: 'font/ttf', desc: 'TrueType-Schrift' },
  { ext: ['otf'], type: 'font/otf', desc: 'OpenType-Schrift' },
  { ext: ['eot'], type: 'application/vnd.ms-fontobject', desc: 'Embedded OpenType (veraltet)' },
  // Dokumente
  { ext: ['pdf'], type: 'application/pdf', desc: 'PDF-Dokument' },
  { ext: ['doc'], type: 'application/msword', desc: 'Word-Dokument (alt, binär)' },
  { ext: ['docx'], type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', desc: 'Word-Dokument (Office Open XML)' },
  { ext: ['xls'], type: 'application/vnd.ms-excel', desc: 'Excel-Tabelle (alt, binär)' },
  { ext: ['xlsx'], type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', desc: 'Excel-Tabelle (Office Open XML)' },
  { ext: ['ppt'], type: 'application/vnd.ms-powerpoint', desc: 'PowerPoint-Präsentation (alt, binär)' },
  { ext: ['pptx'], type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', desc: 'PowerPoint-Präsentation (Office Open XML)' },
  { ext: ['odt'], type: 'application/vnd.oasis.opendocument.text', desc: 'OpenDocument-Text' },
  { ext: ['ods'], type: 'application/vnd.oasis.opendocument.spreadsheet', desc: 'OpenDocument-Tabelle' },
  { ext: ['odp'], type: 'application/vnd.oasis.opendocument.presentation', desc: 'OpenDocument-Präsentation' },
  { ext: ['epub'], type: 'application/epub+zip', desc: 'E-Book (EPUB)' },
  // Archive & Binärdaten
  { ext: ['zip'], type: 'application/zip', desc: 'ZIP-Archiv' },
  { ext: ['gz'], type: 'application/gzip', desc: 'gzip-komprimiert' },
  { ext: ['tar'], type: 'application/x-tar', desc: 'tar-Archiv (unkomprimiert)' },
  { ext: ['7z'], type: 'application/x-7z-compressed', desc: '7-Zip-Archiv' },
  { ext: ['rar'], type: 'application/vnd.rar', desc: 'RAR-Archiv' },
  { ext: ['bz2'], type: 'application/x-bzip2', desc: 'bzip2-komprimiert' },
  { ext: ['xz'], type: 'application/x-xz', desc: 'xz-komprimiert' },
  { ext: ['zst'], type: 'application/zstd', desc: 'Zstandard-komprimiert' },
  { ext: ['bin', 'exe', 'dll', 'iso', 'img'], type: 'application/octet-stream', desc: 'Beliebige Binärdaten (Standard für Unbekanntes)', note: 'Browser bieten solche Dateien zum Herunterladen an, statt sie anzuzeigen.' },
  { ext: ['jar'], type: 'application/java-archive', desc: 'Java-Archiv' },
  { ext: ['apk'], type: 'application/vnd.android.package-archive', desc: 'Android-App-Paket' },
  { ext: ['sqlite', 'db'], type: 'application/vnd.sqlite3', desc: 'SQLite-Datenbank' },
  { ext: ['eml'], type: 'message/rfc822', desc: 'E-Mail-Nachricht' },
  { ext: ['sh'], type: 'application/x-sh', desc: 'Shell-Skript', note: 'Nicht registriert; Webserver liefern Skripte oft als text/plain aus.' },
  { ext: ['py'], type: 'text/x-python', desc: 'Python-Quelltext', note: 'Nicht registriert; häufig auch text/plain.' }
];

/** Suche in beiden Richtungen: Endung (mit/ohne Punkt), Typ oder Beschreibung. */
export function searchMime(query = '') {
  const raw = String(query).trim().toLowerCase();
  if (!raw) return MIME_TYPES;
  const q = raw.replace(/^\*?\./, '').split(';')[0].trim();
  const exact = MIME_TYPES.filter((m) => m.ext.includes(q) || m.type === q);
  const rest = MIME_TYPES.filter((m) => !exact.includes(m) && (m.ext.some((e) => e.startsWith(q)) || m.type.includes(q) || m.desc.toLowerCase().includes(q)));
  return [...exact, ...rest];
}

/** Zerlegt einen Content-Type-Header: Typ, Untertyp, Suffix, Parameter. */
export function parseContentType(value) {
  const [main, ...params] = String(value).split(';');
  const m = /^\s*([a-z0-9!#$&^_.+-]+)\/([a-z0-9!#$&^_.+-]+)\s*$/i.exec(main);
  if (!m) return null;
  const subtype = m[2].toLowerCase();
  const suffix = subtype.includes('+') ? subtype.slice(subtype.lastIndexOf('+') + 1) : null;
  return {
    type: m[1].toLowerCase(),
    subtype,
    suffix,
    tree: subtype.startsWith('vnd.') ? 'Hersteller (vnd.)' : subtype.startsWith('prs.') ? 'Persönlich (prs.)' : subtype.startsWith('x-') ? 'Nicht registriert (x-)' : 'Standard',
    params: params
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const i = p.indexOf('=');
        return i === -1 ? { name: p.toLowerCase(), value: '' } : { name: p.slice(0, i).trim().toLowerCase(), value: p.slice(i + 1).trim().replace(/^"(.*)"$/, '$1') };
      })
  };
}
