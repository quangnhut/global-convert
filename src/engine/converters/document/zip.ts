import { ConvertError } from '@shared/converter';

export interface ZipEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
}

/** Lists a ZIP's entries from its central directory, without decompressing anything. */
export function listZipEntries(zip: Uint8Array): ZipEntry[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // End-of-central-directory record: last 22 bytes + up to 64 KiB comment.
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ConvertError('The file is not a valid ZIP-based document.');

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (p + 46 > zip.length || view.getUint32(p, true) !== 0x02014b50) {
      throw new ConvertError('The document is damaged (bad ZIP directory).');
    }
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    entries.push({
      compressedSize: view.getUint32(p + 20, true),
      uncompressedSize: view.getUint32(p + 24, true),
      name: decoder.decode(zip.subarray(p + 46, p + 46 + nameLength)),
    });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Rejects ZIP bombs: too large when unpacked, or a suspicious compression ratio. */
export function assertSafeZip(zip: Uint8Array, maxUnpackedBytes = 500 * 1024 * 1024): void {
  const entries = listZipEntries(zip);
  let total = 0;
  for (const e of entries) {
    // 0xffffffff = ZIP64 marker; real Word documents never need it.
    if (e.uncompressedSize === 0xffffffff || e.compressedSize === 0xffffffff) {
      throw new ConvertError('The document is too large to open.');
    }
    total += e.uncompressedSize;
    if (e.uncompressedSize > 10 * 1024 * 1024 && e.uncompressedSize > e.compressedSize * 200) {
      throw new ConvertError('The document looks malformed (suspicious compression).');
    }
  }
  if (total > maxUnpackedBytes) throw new ConvertError('The document is too large to open.');
}
