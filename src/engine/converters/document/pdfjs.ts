import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { ConvertError, type OptionField } from '@shared/converter';
import { LIMIT_INPUT_PIXELS } from '../image/sharp-common';

// The legacy build runs in Node without browser APIs.
type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
type PDFDocumentProxy = Awaited<ReturnType<PdfJs['getDocument']>['promise']>;
export type PDFPageProxy = Awaited<ReturnType<PDFDocumentProxy['getPage']>>;
type RenderCanvas = Parameters<PDFPageProxy['render']>[0]['canvas'];

/** Upper bound on pages processed in one job. */
export const MAX_PAGES = 2000;

/**
 * pdfjs enables its Node code paths (fs font loading, @napi-rs/canvas, DOMMatrix/Path2D
 * polyfills, no web worker) only if `process.type` is unset or 'browser' — evaluated once,
 * when its modules load. In Electron's utilityProcess it is 'utility', so we hide it while
 * loading, and hand pdfjs its worker module so it runs on this thread.
 */
async function importPdfJs(): Promise<PdfJs> {
  const hasType = Object.prototype.hasOwnProperty.call(process, 'type');
  const type: unknown = (process as { type?: unknown }).type;
  const hide = type !== undefined && type !== 'browser';
  if (hide)
    Object.defineProperty(process, 'type', {
      value: undefined,
      configurable: true,
      writable: true,
    });
  try {
    const [lib, worker] = await Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.mjs'),
    ]);
    (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
    return lib;
  } finally {
    if (hide) {
      if (hasType)
        Object.defineProperty(process, 'type', { value: type, configurable: true, writable: true });
      else delete (process as { type?: unknown }).type;
    }
  }
}

let pdfjs: Promise<PdfJs> | undefined;
export const loadPdfJs = (): Promise<PdfJs> => (pdfjs ??= importPdfJs());

/** pdfjs data folders (fonts for non-embedded standard fonts, CMaps for CJK text). */
const pdfjsDir = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
const dataUrl = (name: string) => `${pathToFileURL(join(pdfjsDir, name)).href}/`;

export const dpiField: OptionField = {
  key: 'dpi',
  label: 'Render resolution (DPI)',
  type: 'number',
  min: 36,
  max: 600,
};
export const fromPageField: OptionField = {
  key: 'fromPage',
  label: 'From page',
  type: 'number',
  min: 1,
  max: 100000,
};
export const toPageField: OptionField = {
  key: 'toPage',
  label: 'To page (0 = last)',
  type: 'number',
  min: 0,
  max: 100000,
};

/** Opens a PDF read-only. Fonts are parsed but never executed; no network access. */
export async function openPdf(path: string): Promise<PDFDocumentProxy> {
  const { getDocument } = await loadPdfJs();
  // Copy into a fresh, offset-0 array: pdfjs transfers the buffer to its worker.
  const data = new Uint8Array(await readFile(path));
  try {
    return await getDocument({
      data,
      standardFontDataUrl: dataUrl('standard_fonts'),
      cMapUrl: dataUrl('cmaps'),
      cMapPacked: true,
      isOffscreenCanvasSupported: false,
      isImageDecoderSupported: false,
      fontExtraProperties: true, // exposes real font names (bold/italic detection)
      enableXfa: false,
      verbosity: 0,
    }).promise;
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'PasswordException') throw new ConvertError('This PDF is password-protected.');
    throw new ConvertError(
      `Could not read the PDF: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** 1-based inclusive page numbers to process. */
export function pageRange(numPages: number, fromPage: number, toPage: number): number[] {
  const last = toPage === 0 ? numPages : Math.min(toPage, numPages);
  if (fromPage > last)
    throw new ConvertError(`The page range is empty (the PDF has ${numPages} pages).`);
  const count = last - fromPage + 1;
  if (count > MAX_PAGES)
    throw new ConvertError(`Too many pages (${count}); the limit is ${MAX_PAGES} per file.`);
  return Array.from({ length: count }, (_, i) => fromPage + i);
}

/** Renders one page on white at `dpi`; returns PNG or JPEG bytes. */
export async function renderPage(
  page: PDFPageProxy,
  dpi: number,
  format: 'png' | 'jpg' = 'png',
): Promise<Buffer> {
  const viewport = page.getViewport({ scale: dpi / 72 });
  const width = Math.max(1, Math.ceil(viewport.width));
  const height = Math.max(1, Math.ceil(viewport.height));
  if (width * height > LIMIT_INPUT_PIXELS) {
    throw new ConvertError(
      `Page ${page.pageNumber} is too large at ${dpi} DPI; choose a lower resolution.`,
    );
  }
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  // @napi-rs/canvas implements the subset of the canvas API pdfjs uses in Node.
  await page.render({ canvas: canvas as unknown as RenderCanvas, viewport }).promise;
  return format === 'jpg' ? canvas.toBuffer('image/jpeg', 90) : canvas.toBuffer('image/png');
}
