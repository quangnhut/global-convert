import { formatFromExtension, type FormatId } from './formats';

/** How many leading bytes `detectFormat` needs. */
export const DETECT_HEAD_BYTES = 8192;

export interface Detection {
  format: FormatId;
  /** 'content' = magic bytes / content sniffing; 'extension' = fallback on file name. */
  by: 'content' | 'extension';
}

const ascii = (head: Uint8Array, start: number, end: number): string =>
  String.fromCharCode(...head.subarray(start, end));

const startsWith = (head: Uint8Array, bytes: readonly number[], offset = 0): boolean =>
  head.length >= offset + bytes.length && bytes.every((b, i) => head[offset + i] === b);

function sniffBinary(head: Uint8Array, fileName: string): FormatId | undefined {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(head, [0xff, 0xd8, 0xff])) return 'jpg';
  if (ascii(head, 0, 6) === 'GIF87a' || ascii(head, 0, 6) === 'GIF89a') return 'gif';
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WEBP') return 'webp';
  if (startsWith(head, [0x49, 0x49, 0x2a, 0x00]) || startsWith(head, [0x4d, 0x4d, 0x00, 0x2a])) {
    return 'tiff';
  }
  if (ascii(head, 4, 8) === 'ftyp' && isAvifBrand(head)) return 'avif';
  if (isIco(head)) return 'ico';
  // PDF header may be preceded by junk; the spec allows it within the first 1024 bytes.
  if (ascii(head, 0, Math.min(head.length, 1024)).includes('%PDF-')) return 'pdf';
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) {
    // ZIP container: docx has `word/` entries (usually near the start) — or trust the name.
    if (ascii(head, 0, head.length).includes('word/') || formatFromExtension(fileName) === 'docx')
      return 'docx';
  }
  return undefined;
}

function isAvifBrand(head: Uint8Array): boolean {
  if (head.length < 16) return false;
  const boxSize = (head[0]! << 24) | (head[1]! << 16) | (head[2]! << 8) | head[3]!;
  const end = Math.min(boxSize, head.length);
  // major brand at 8..12, compatible brands from 16 in steps of 4
  for (let i = 8; i + 4 <= end; i += i === 8 ? 8 : 4) {
    const brand = ascii(head, i, i + 4);
    if (brand === 'avif' || brand === 'avis') return true;
  }
  return false;
}

function isIco(head: Uint8Array): boolean {
  // reserved=0, type=1 (icon), count>=1, first entry: reserved byte 0, planes 0|1
  if (!startsWith(head, [0x00, 0x00, 0x01, 0x00]) || head.length < 22) return false;
  const count = head[4]! | (head[5]! << 8);
  const planes = head[10]! | (head[11]! << 8);
  return count > 0 && head[9] === 0 && planes <= 1;
}

/** True if the bytes look like text (UTF-8/ASCII or a UTF-16 BOM, no NUL bytes). */
function isText(head: Uint8Array): boolean {
  if (startsWith(head, [0xff, 0xfe]) || startsWith(head, [0xfe, 0xff])) return true;
  return !head.includes(0);
}

function decodeText(head: Uint8Array): string {
  if (startsWith(head, [0xff, 0xfe])) return new TextDecoder('utf-16le').decode(head);
  if (startsWith(head, [0xfe, 0xff])) return new TextDecoder('utf-16be').decode(head);
  return new TextDecoder('utf-8').decode(head);
}

function sniffText(head: Uint8Array, fileName: string): FormatId {
  const text = decodeText(head).trimStart(); // trimStart also strips a BOM (U+FEFF)
  const lower = text.toLowerCase();
  // Skip an XML declaration, comments and doctype before looking for <svg.
  const body = lower.replace(/^(<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!doctype svg[^>]*>|\s+)*/, '');
  if (body.startsWith('<svg')) return 'svg';
  if (lower.startsWith('<!doctype html') || lower.startsWith('<html')) return 'html';

  // Plain text family: the extension decides between txt / md / html / svg.
  const byExt = formatFromExtension(fileName);
  if (byExt && ['txt', 'md', 'html', 'svg'].includes(byExt)) return byExt;
  return 'txt';
}

/**
 * Detects a file's format from its first bytes (see DETECT_HEAD_BYTES), using the
 * file name only as a fallback. Returns null for unknown binary content.
 */
export function detectFormat(head: Uint8Array, fileName: string): Detection | null {
  const binary = sniffBinary(head, fileName);
  if (binary) return { format: binary, by: 'content' };

  if (head.length > 0 && isText(head)) {
    const format = sniffText(head, fileName);
    const byExt = formatFromExtension(fileName);
    // Content proves svg/html; for txt vs md the name is what tells them apart.
    const by = format === 'svg' || format === 'html' ? 'content' : byExt ? 'extension' : 'content';
    return { format, by };
  }

  // Unknown binary: fall back to the extension, but only for binary formats —
  // a ".txt" full of NUL bytes is not text.
  const byExt = formatFromExtension(fileName);
  if (byExt && !['txt', 'md', 'html', 'svg'].includes(byExt)) {
    return { format: byExt, by: 'extension' };
  }
  return null;
}
