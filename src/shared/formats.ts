/** Every format the app knows about. Future plans extend this list. */
export const FORMAT_IDS = [
  'png',
  'jpg',
  'webp',
  'avif',
  'gif',
  'tiff',
  'ico',
  'svg',
  'pdf',
  'docx',
  'txt',
  'html',
  'md',
] as const;

export type FormatId = (typeof FORMAT_IDS)[number];
export type FormatFamily = 'image' | 'document';

export interface FormatInfo {
  id: FormatId;
  label: string;
  family: FormatFamily;
  /** Lower-case, without dot. The first one is used for output files. */
  extensions: readonly string[];
  mime: string;
}

export const FORMATS: Readonly<Record<FormatId, FormatInfo>> = {
  png: { id: 'png', label: 'PNG', family: 'image', extensions: ['png'], mime: 'image/png' },
  jpg: {
    id: 'jpg',
    label: 'JPEG',
    family: 'image',
    extensions: ['jpg', 'jpeg', 'jpe', 'jfif'],
    mime: 'image/jpeg',
  },
  webp: { id: 'webp', label: 'WebP', family: 'image', extensions: ['webp'], mime: 'image/webp' },
  avif: { id: 'avif', label: 'AVIF', family: 'image', extensions: ['avif'], mime: 'image/avif' },
  gif: { id: 'gif', label: 'GIF', family: 'image', extensions: ['gif'], mime: 'image/gif' },
  tiff: {
    id: 'tiff',
    label: 'TIFF',
    family: 'image',
    extensions: ['tiff', 'tif'],
    mime: 'image/tiff',
  },
  ico: { id: 'ico', label: 'ICO', family: 'image', extensions: ['ico'], mime: 'image/x-icon' },
  svg: { id: 'svg', label: 'SVG', family: 'image', extensions: ['svg'], mime: 'image/svg+xml' },
  pdf: {
    id: 'pdf',
    label: 'PDF',
    family: 'document',
    extensions: ['pdf'],
    mime: 'application/pdf',
  },
  docx: {
    id: 'docx',
    label: 'Word (DOCX)',
    family: 'document',
    extensions: ['docx'],
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  txt: { id: 'txt', label: 'Text', family: 'document', extensions: ['txt'], mime: 'text/plain' },
  html: {
    id: 'html',
    label: 'HTML',
    family: 'document',
    extensions: ['html', 'htm'],
    mime: 'text/html',
  },
  md: {
    id: 'md',
    label: 'Markdown',
    family: 'document',
    extensions: ['md', 'markdown'],
    mime: 'text/markdown',
  },
};

export function isFormatId(value: unknown): value is FormatId {
  return typeof value === 'string' && (FORMAT_IDS as readonly string[]).includes(value);
}

/** Lower-case extension without the dot, or '' if none. */
export function extensionOf(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

export function formatFromExtension(fileName: string): FormatId | undefined {
  const ext = extensionOf(fileName);
  if (!ext) return undefined;
  return FORMAT_IDS.find((id) => FORMATS[id].extensions.includes(ext));
}
