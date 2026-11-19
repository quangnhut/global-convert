import { writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import type { Converter } from '@shared/converter';
import { toEmbeddable } from './sharp-common';

/** Page sizes in PDF points (1/72 inch), portrait. */
const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] } as const;
const MARGIN = 36; // 0.5 inch
/** SVG is rendered at 4× its nominal size so the page stays sharp when zoomed. */
const SVG_DENSITY = 288;

type Options = { pageSize: string };

export const imagesToPdf: Converter<Options> = {
  id: 'image.images-to-pdf',
  family: 'image',
  from: ['png', 'jpg', 'webp', 'avif', 'gif', 'tiff', 'svg'],
  to: ['pdf'],
  optionsSchema: [
    {
      key: 'pageSize',
      label: 'Page size',
      type: 'select',
      choices: [
        { value: 'image', label: 'Same as image' },
        { value: 'a4', label: 'A4' },
        { value: 'letter', label: 'US Letter' },
      ],
    },
  ],
  defaults: { pageSize: 'image' },
  notes: 'One page per image. Animated or multi-page input uses the first frame.',

  async convert(job, ctx) {
    const img = await toEmbeddable(
      job.inputPath,
      job.from,
      job.from === 'svg' ? SVG_DENSITY : undefined,
    );
    ctx.progress(0.3);
    ctx.signal.throwIfAborted();

    const pdf = await PDFDocument.create();
    const embedded =
      img.mime === 'image/jpeg' ? await pdf.embedJpg(img.bytes) : await pdf.embedPng(img.bytes);
    ctx.progress(0.7);
    ctx.signal.throwIfAborted();

    // Natural size of the image in points.
    const w = (img.width * 72) / img.density;
    const h = (img.height * 72) / img.density;
    const fixed = PAGE_SIZES[job.options.pageSize as keyof typeof PAGE_SIZES];
    if (!fixed) {
      pdf.addPage([w, h]).drawImage(embedded, { x: 0, y: 0, width: w, height: h });
    } else {
      // Landscape page for landscape images; scale down (never up) to fit inside the margins.
      const [pw, ph] = w > h ? [fixed[1], fixed[0]] : fixed;
      const scale = Math.min(1, (pw - 2 * MARGIN) / w, (ph - 2 * MARGIN) / h);
      const [dw, dh] = [w * scale, h * scale];
      pdf.addPage([pw, ph]).drawImage(embedded, {
        x: (pw - dw) / 2,
        y: (ph - dh) / 2,
        width: dw,
        height: dh,
      });
    }
    await writeFile(await ctx.reserveOutput(), await pdf.save());
    ctx.progress(1);
  },
};
