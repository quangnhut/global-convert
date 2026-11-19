import { writeFile } from 'node:fs/promises';
import type { Converter } from '@shared/converter';
import { toEmbeddable } from './sharp-common';

export const svgWrap: Converter<Record<string, never>> = {
  id: 'image.svg-wrap',
  family: 'image',
  from: ['png', 'jpg', 'webp', 'avif', 'tiff'],
  to: ['svg'],
  optionsSchema: [],
  defaults: {},
  notes:
    'The picture is embedded inside an SVG file as a bitmap. It is not traced into vector ' +
    'shapes, so it will not scale up sharply.',

  async convert(job, ctx) {
    const img = await toEmbeddable(job.inputPath, job.from);
    ctx.signal.throwIfAborted();
    const { width: w, height: h } = img;
    const svg =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
      `width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n` +
      `  <image width="${w}" height="${h}" xlink:href="data:${img.mime};base64,${img.bytes.toString('base64')}"/>\n` +
      `</svg>\n`;
    await writeFile(await ctx.reserveOutput(), svg);
    ctx.progress(1);
  },
};
