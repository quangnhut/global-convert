import { copyFile, writeFile } from 'node:fs/promises';
import { ConvertError, type Converter, type OptionField } from '@shared/converter';
import { sofficeConvert } from '../../libreoffice';
import { openImage } from '../image/sharp-common';
import { type Section, writeDocx } from './docx-writer';
import { type ImagePiece, layoutBlocks, type PageContent, type TextPiece } from './pdf-layout';
import { dpiField, loadPdfJs, openPdf, pageRange, type PDFPageProxy, renderPage } from './pdfjs';

type Options = { mode: string; dpi: number };

/** Images smaller than this (points, both sides) are decoration and skipped. */
const MIN_IMAGE_PT = 16;
const MAX_IMAGES = 500;
const EDITABLE_MARGIN_PT = 72;

type Matrix = [number, number, number, number, number, number];
/** PDF `cm`: the new CTM is m × ctm. */
const multiply = (m: Matrix, c: Matrix): Matrix => [
  m[0] * c[0] + m[1] * c[2],
  m[0] * c[1] + m[1] * c[3],
  m[2] * c[0] + m[3] * c[2],
  m[2] * c[1] + m[3] * c[3],
  m[4] * c[0] + m[5] * c[2] + c[4],
  m[4] * c[1] + m[5] * c[3] + c[5],
];

/** How long to wait for pdfjs to deliver one decoded image before skipping it. */
const IMAGE_TIMEOUT_MS = 10_000;

/**
 * Image objects arrive from the pdfjs worker asynchronously (after the operator list), so
 * they must be requested with a callback. Resolves undefined if one never arrives.
 */
function pdfObject(store: PDFPageProxy['objs'], id: string): Promise<unknown> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), IMAGE_TIMEOUT_MS);
    store.get(id, (obj: unknown) => {
      clearTimeout(timer);
      resolve(obj);
    });
  });
}

/** Text items with font style, and images with their position, of one page. */
async function readPage(page: PDFPageProxy, imageBudget: { left: number }): Promise<PageContent> {
  const { OPS, ImageKind } = await loadPdfJs();
  // The operator list loads fonts into commonObjs and images into objs.
  const ops = await page.getOperatorList();
  const { items } = await page.getTextContent();

  const fontNames = new Map<string, string>();
  const fontName = (id: string): string => {
    let name = fontNames.get(id);
    if (name === undefined) {
      try {
        const font: unknown = page.commonObjs.get(id);
        name =
          font && typeof font === 'object' && 'name' in font && typeof font.name === 'string'
            ? font.name
            : '';
      } catch {
        name = '';
      }
      fontNames.set(id, name);
    }
    return name;
  };

  const pieces: TextPiece[] = [];
  for (const item of items) {
    if (!('str' in item) || item.str.length === 0) continue;
    const [, , c, d, x, y] = item.transform as Matrix;
    const name = fontName(item.fontName);
    pieces.push({
      str: item.str,
      x,
      y,
      width: item.width,
      size: Math.hypot(c, d) || item.height,
      bold: /bold|black|heavy|semibold|demi/i.test(name),
      italic: /italic|oblique/i.test(name),
    });
  }

  const images: ImagePiece[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i] as unknown[];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = multiply(args as Matrix, ctm);
    else if (fn === OPS.paintImageXObject && imageBudget.left > 0) {
      const widthPt = Math.hypot(ctm[0], ctm[1]);
      const heightPt = Math.hypot(ctm[2], ctm[3]);
      if (widthPt < MIN_IMAGE_PT && heightPt < MIN_IMAGE_PT) continue;
      const id = String(args[0]);
      const obj = await pdfObject(id.startsWith('g_') ? page.commonObjs : page.objs, id);
      if (!obj || typeof obj !== 'object' || !('data' in obj) || !('kind' in obj)) continue;
      const { data, kind, width, height } = obj as {
        data: Uint8Array;
        kind: number;
        width: number;
        height: number;
      };
      const channels = kind === ImageKind.RGB_24BPP ? 3 : kind === ImageKind.RGBA_32BPP ? 4 : 0;
      if (!channels) continue; // 1-bit masks/scans: not worth embedding
      const png = await openImage(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
        raw: { width, height, channels },
      })
        .png()
        .toBuffer();
      const corners = [ctm[5], ctm[5] + ctm[3], ctm[5] + ctm[1], ctm[5] + ctm[1] + ctm[3]];
      images.push({ top: Math.max(...corners), widthPt, heightPt, png });
      imageBudget.left--;
    }
  }
  return { pieces, images };
}

/** pdf → docx: Editable (rebuilt text), Exact layout (page images), or LibreOffice. */
export function createPdfToDocx(soffice?: string): Converter<Options> {
  const modeField: OptionField = {
    key: 'mode',
    label: 'Word output',
    type: 'select',
    choices: [
      { value: 'editable', label: 'Editable text' },
      { value: 'exact', label: 'Exact layout (pages as images, not editable)' },
      ...(soffice ? [{ value: 'libreoffice', label: 'LibreOffice' }] : []),
    ],
  };
  return {
    id: 'document.pdf-to-docx',
    family: 'document',
    from: ['pdf'],
    to: ['docx'],
    optionsSchema: [modeField, { ...dpiField, label: 'Exact layout resolution (DPI)' }],
    defaults: { mode: 'editable', dpi: 150 },
    notes:
      'Editable: text, headings, bold/italic and images are rebuilt; multi-column pages, ' +
      'tables and forms come out approximate. Scanned PDFs use Exact layout (no OCR).',

    async convert(job, ctx) {
      const { options: o } = job;
      if (o.mode === 'libreoffice' && soffice) {
        ctx.progress(0.1);
        const produced = await sofficeConvert(
          soffice,
          job.inputPath,
          { convertTo: 'docx:MS Word 2007 XML', inFilter: 'writer_pdf_import' },
          ctx.tmpDir,
          ctx.signal,
        );
        await copyFile(produced, await ctx.reserveOutput());
        return;
      }

      const doc = await openPdf(job.inputPath);
      try {
        const numbers = pageRange(doc.numPages, 1, 0);
        const sections: Section[] = [];

        if (o.mode === 'editable') {
          const pages: PageContent[] = [];
          const budget = { left: MAX_IMAGES };
          for (const [i, n] of numbers.entries()) {
            ctx.signal.throwIfAborted();
            const page = await doc.getPage(n);
            pages.push(await readPage(page, budget));
            page.cleanup();
            ctx.progress(((i + 1) / numbers.length) * 0.9);
          }
          // No text layer at all (scanned) → fall back to exact layout below.
          if (pages.some((p) => p.pieces.some((t) => t.str.trim()))) {
            const first = (await doc.getPage(numbers[0]!)).getViewport({ scale: 1 });
            sections.push({
              page: { widthPt: first.width, heightPt: first.height, marginPt: EDITABLE_MARGIN_PT },
              blocks: layoutBlocks(pages),
            });
          }
        }

        if (sections.length === 0) {
          for (const [i, n] of numbers.entries()) {
            ctx.signal.throwIfAborted();
            const page = await doc.getPage(n);
            const { width, height } = page.getViewport({ scale: 1 });
            const png = await renderPage(page, o.dpi);
            page.cleanup();
            // 2pt shorter than the page so Word never pushes the image onto an extra page.
            sections.push({
              page: { widthPt: width, heightPt: height, marginPt: 0 },
              blocks: [{ kind: 'image', png, widthPt: width, heightPt: height - 2 }],
            });
            ctx.progress((i + 1) / numbers.length);
          }
        }
        if (sections.length === 0) throw new ConvertError('The PDF has no pages.');
        await writeFile(await ctx.reserveOutput(), await writeDocx(sections, 'Calibri'));
      } finally {
        await doc.loadingTask.destroy();
      }
    },
  };
}
