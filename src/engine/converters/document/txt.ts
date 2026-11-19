import { readFile, writeFile } from 'node:fs/promises';
import type { Converter } from '@shared/converter';
import { baseNameOf } from '../../output';
import {
  FONTS,
  fontField,
  fontOf,
  htmlDocument,
  escapeHtml,
  marginField,
  pageSizeField,
  printOptions,
} from './html-doc';
import { mmToPt, PAGE_SIZES_PT, writeDocx } from './docx-writer';
import { decodeText, encodingField } from './text-decode';

type Options = { encoding: string; font: string; pageSize: string; margin: number };

export const txt: Converter<Options> = {
  id: 'document.txt',
  family: 'document',
  from: ['txt'],
  to: ['pdf', 'docx', 'html'],
  optionsSchema: [encodingField, fontField, pageSizeField, marginField],
  defaults: { encoding: 'auto', font: 'sans', pageSize: 'a4', margin: 20 },

  async convert(job, ctx) {
    const { options: o } = job;
    // Normalise line endings; keep everything else (spacing, blank lines) as written.
    const text = decodeText(await readFile(job.inputPath), o.encoding).replace(/\r\n?/g, '\n');
    const font = fontOf(o.font);
    ctx.signal.throwIfAborted();

    if (job.to === 'docx') {
      const [w, h] = PAGE_SIZES_PT[o.pageSize === 'letter' ? 'letter' : 'a4'];
      const blocks = text
        .replace(/\n$/, '')
        .split('\n')
        .map((line) => ({ kind: 'paragraph' as const, runs: line ? [{ text: line }] : [] }));
      const page = { widthPt: w, heightPt: h, marginPt: mmToPt(o.margin) };
      await writeFile(
        await ctx.reserveOutput(),
        await writeDocx([{ page, blocks }], FONTS[font].docx),
      );
      return;
    }

    const html = htmlDocument(
      baseNameOf(job.inputPath),
      `<pre class="plain">${escapeHtml(text)}</pre>`,
      font,
    );
    if (job.to === 'html') {
      await writeFile(await ctx.reserveOutput(), html);
      return;
    }
    const pdf = await ctx.renderHtmlToPdf(html, printOptions(o));
    await writeFile(await ctx.reserveOutput(), pdf);
  },
};
