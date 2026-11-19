import { writeFile } from 'node:fs/promises';
import type { Converter } from '@shared/converter';
import {
  dpiField,
  fromPageField,
  openPdf,
  pageRange,
  type PDFPageProxy,
  renderPage,
  toPageField,
} from './pdfjs';

type Options = { dpi: number; fromPage: number; toPage: number };

/** Text of one page; `hasEOL` marks line ends, pages are separated by a blank line. */
async function pageText(page: PDFPageProxy): Promise<string> {
  const { items } = await page.getTextContent();
  let text = '';
  for (const item of items) {
    if (!('str' in item)) continue;
    text += item.str + (item.hasEOL ? '\n' : '');
  }
  return text.replace(/[ \t]+\n/g, '\n').trim();
}

export const pdf: Converter<Options> = {
  id: 'document.pdf',
  family: 'document',
  from: ['pdf'],
  to: ['txt', 'png', 'jpg'],
  optionsSchema: [dpiField, fromPageField, toPageField],
  defaults: { dpi: 150, fromPage: 1, toPage: 0 },
  notes:
    'Images: one file per page. Text: scanned PDFs without a text layer give no text (no OCR).',

  async convert(job, ctx) {
    const { options: o } = job;
    const doc = await openPdf(job.inputPath);
    try {
      const pages = pageRange(doc.numPages, o.fromPage, o.toPage);
      const texts: string[] = [];
      for (const [i, n] of pages.entries()) {
        ctx.signal.throwIfAborted();
        const page = await doc.getPage(n);
        if (job.to === 'txt') {
          texts.push(await pageText(page));
        } else {
          const image = await renderPage(page, o.dpi, job.to === 'jpg' ? 'jpg' : 'png');
          await writeFile(await ctx.reserveOutput(pages.length > 1 ? `-p${n}` : ''), image);
        }
        page.cleanup();
        ctx.progress((i + 1) / pages.length);
      }
      if (job.to === 'txt') await writeFile(await ctx.reserveOutput(), `${texts.join('\n\n')}\n`);
    } finally {
      await doc.loadingTask.destroy();
    }
  },
};
