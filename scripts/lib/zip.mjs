// Minimal ZIP / CRX3 reading and writing with Node's standard library only.
//
// writeZip makes the release package reproducible: entries are sorted, stored without
// compression (so the bytes don't depend on the zlib version), dated 1980-01-01 00:00 and
// marked as regular files with mode 0644. The same files always give the same zip.

import { inflateRawSync, deflateRawSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const DOS_TIME = 0; // 00:00:00
const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
const UTF8_FLAG = 0x0800;
const UNIX_FILE_0644 = (0o100644 << 16) >>> 0;
const VERSION_MADE_BY = (3 << 8) | 20; // Unix, ZIP 2.0

/**
 * @param {{name: string, data: Buffer}[]} files  paths use "/" and no leading "/"
 * @param {{compress?: boolean}} [options]  compress: deflate entries (only for tests –
 *   releases are stored, see above)
 * @returns {Buffer}
 */
export function writeZip(files, { compress = false } = {}) {
  const sorted = [...files].sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)));
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data } of sorted) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const body = compress ? deflateRawSync(data) : data;
    const method = compress ? 8 : 0;
    const version = compress ? 20 : 10;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(version, 4);
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(VERSION_MADE_BY, 4);
    central.writeUInt16LE(version, 6);
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(UNIX_FILE_0644, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(sorted.length, 8);
  end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

/**
 * Reads every file of a ZIP (stored or deflated). Directory entries are skipped.
 * @returns {Map<string, Buffer>}
 */
export function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a ZIP file (no end of central directory).');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Broken ZIP central directory.');
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;

    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const raw = buf.subarray(start, start + compressedSize);
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = inflateRawSync(raw);
    else throw new Error(`${name}: unsupported ZIP compression method ${method}.`);
    if (data.length !== size) throw new Error(`${name}: size mismatch after unpacking.`);
    files.set(name, data);
  }
  return files;
}

/**
 * The ZIP inside a CRX3 file (as served by the Chrome Web Store): "Cr24", version 3,
 * header length, signed header, then the ZIP. A plain ZIP is returned unchanged.
 */
export function zipFromCrx(buf) {
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'Cr24') {
    const version = buf.readUInt32LE(4);
    if (version !== 3) throw new Error(`Unsupported CRX version ${version} (expected 3).`);
    const headerSize = buf.readUInt32LE(8);
    return buf.subarray(12 + headerSize);
  }
  return buf;
}
