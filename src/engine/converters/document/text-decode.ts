import type { OptionField } from '@shared/converter';

export const encodingField: OptionField = {
  key: 'encoding',
  label: 'Text encoding',
  type: 'select',
  choices: [
    { value: 'auto', label: 'Auto-detect' },
    { value: 'utf-8', label: 'UTF-8' },
    { value: 'utf-16le', label: 'UTF-16 LE' },
    { value: 'utf-16be', label: 'UTF-16 BE' },
    { value: 'windows-1252', label: 'Windows-1252 (Western)' },
  ],
};

/**
 * Decodes text. `auto`: a BOM decides (UTF-8 / UTF-16 LE / BE); otherwise UTF-8 if the
 * bytes are valid UTF-8, else Windows-1252. A leading BOM is never part of the result.
 */
export function decodeText(bytes: Uint8Array, encoding = 'auto'): string {
  if (encoding !== 'auto') return new TextDecoder(encoding).decode(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
