/**
 * Minimale ZIP-Implementierung (nur was StudyForge braucht):
 * - Schreiben mit Deflate oder Store
 * - Lesen zentraler Verzeichnisse inkl. Deflate/Store
 * - Schutz gegen Pfadmanipulation und ZIP-Bomben
 * Bewusst ohne externe Abhängigkeit; Deckt keine ZIP64-Archive > 4 GB ab.
 */
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

export function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function dosDateTime(date) {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f);
  const day = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f);
  return { time, day };
}

/**
 * @param {{name: string, data: Buffer|string, compress?: boolean}[]} entries
 * @returns {Buffer}
 */
export function createZip(entries, { date = new Date() } = {}) {
  if (entries.length > 65000) throw new Error('Zu viele Dateien für ein ZIP-Archiv (max. 65000).');
  const { time, day } = dosDateTime(date);
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    if (!name.length || name.length > 65535) throw new Error('Ungültiger Dateiname im Archiv.');
    if (entry.name.startsWith('/') || entry.name.includes('..')) {
      throw new Error('Unsicherer Dateiname im Archiv.');
    }
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), 'utf8');
    const method = entry.compress === false ? 0 : 8;
    const compressed = method === 8 ? zlib.deflateRawSync(raw, { level: 6 }) : raw;
    const checksum = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    locals.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x031e, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + compressed.length;
    if (offset > 0xffffffff) throw new Error('Archiv zu groß (max. 4 GB).');
  }

  const centralBuffer = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuffer, end]);
}

function findEndOfCentralDirectory(buffer) {
  const min = Math.max(0, buffer.length - 22 - 65535);
  for (let i = buffer.length - 22; i >= min; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

/**
 * @param {Buffer} buffer
 * @returns {Map<string, Buffer>}
 */
export function readZip(buffer, { maxEntries = 5000, maxTotalBytes = 512 * 1024 * 1024 } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw new Error('Keine gültige ZIP-Datei.');
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) throw new Error('ZIP-Datei ist beschädigt (Ende des Verzeichnisses fehlt).');
  const count = buffer.readUInt16LE(eocd + 10);
  const cdSize = buffer.readUInt32LE(eocd + 12);
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  if (count > maxEntries) throw new Error('ZIP-Archiv enthält zu viele Dateien.');
  if (cdOffset + cdSize > buffer.length || cdOffset < 0) throw new Error('ZIP-Verzeichnis liegt außerhalb der Datei.');

  const entries = new Map();
  let ptr = cdOffset;
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    if (ptr + 46 > buffer.length || buffer.readUInt32LE(ptr) !== 0x02014b50) {
      throw new Error('ZIP-Verzeichnis ist beschädigt.');
    }
    const flags = buffer.readUInt16LE(ptr + 8);
    const method = buffer.readUInt16LE(ptr + 10);
    const crc = buffer.readUInt32LE(ptr + 16);
    const compSize = buffer.readUInt32LE(ptr + 20);
    const size = buffer.readUInt32LE(ptr + 24);
    const nameLen = buffer.readUInt16LE(ptr + 28);
    const extraLen = buffer.readUInt16LE(ptr + 30);
    const commentLen = buffer.readUInt16LE(ptr + 32);
    const localOffset = buffer.readUInt32LE(ptr + 42);
    const name = buffer.toString(flags & 0x0800 ? 'utf8' : 'latin1', ptr + 46, ptr + 46 + nameLen);
    const safeName = name.replace(/\\/g, '/');
    if (safeName.startsWith('/') || safeName.split('/').includes('..') || /^[a-zA-Z]:/.test(safeName)) {
      throw new Error(`Unsicherer Pfad im Archiv: ${name}`);
    }
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`Datei ${name} ist beschädigt (lokaler Kopf fehlt).`);
    }
    const localNameLen = buffer.readUInt16LE(localOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compSize;
    if (dataStart < 0 || dataEnd > buffer.length) throw new Error(`Datei ${name} ist abgeschnitten.`);
    total += size;
    if (total > maxTotalBytes) throw new Error('ZIP-Archiv ist entpackt zu groß.');
    if (size > maxTotalBytes) throw new Error(`Datei ${name} ist zu groß.`);

    const compressed = buffer.subarray(dataStart, dataEnd);
    let data;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) {
      try {
        data = zlib.inflateRawSync(compressed, { maxOutputLength: Math.max(size, 1) + 1024 });
      } catch (err) {
        throw new Error(`Datei ${name} konnte nicht entpackt werden: ${err.message}`);
      }
    } else {
      throw new Error(`Nicht unterstütztes ZIP-Komprimierungsverfahren (${method}) bei ${name}.`);
    }
    if (data.length !== size) throw new Error(`Dateigröße von ${name} stimmt nicht.`);
    if (crc32(data) !== crc) throw new Error(`Prüfsumme von ${name} stimmt nicht (Datei beschädigt).`);
    entries.set(safeName, data);
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
