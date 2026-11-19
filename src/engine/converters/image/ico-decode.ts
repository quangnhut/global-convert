import { readFile } from 'node:fs/promises';
import decodeIco from 'decode-ico';
import { ConvertError, type Converter } from '@shared/converter';
import { backgroundField, encodeRaster, errorText, openImage, qualityField } from './sharp-common';

type Options = { quality: number; background: string };

export const icoDecode: Converter<Options> = {
  id: 'image.ico-decode',
  family: 'image',
  from: ['ico'],
  to: ['png', 'jpg', 'webp', 'avif', 'gif', 'tiff'],
  optionsSchema: [qualityField, backgroundField],
  defaults: { quality: 85, background: '#ffffff' },
  notes: 'An icon holds several sizes; the largest one is converted.',

  async convert(job, ctx) {
    let entries: ReturnType<typeof decodeIco>;
    try {
      entries = decodeIco(await readFile(job.inputPath));
    } catch (err) {
      throw new ConvertError(`Could not read the icon: ${errorText(err)}`);
    }
    const area = (e: (typeof entries)[number]) => e.width * e.height;
    const best = entries.reduce<(typeof entries)[number] | undefined>(
      (a, b) => (!a || area(b) > area(a) || (area(b) === area(a) && b.bpp > a.bpp) ? b : a),
      undefined,
    );
    if (!best) throw new ConvertError('The icon contains no images.');
    ctx.signal.throwIfAborted();

    const image =
      best.type === 'png'
        ? openImage(Buffer.from(best.data))
        : openImage(Buffer.from(best.data.buffer, best.data.byteOffset, best.data.byteLength), {
            raw: { width: best.width, height: best.height, channels: 4 },
          });
    await encodeRaster(image, job.to, job.options).toFile(await ctx.reserveOutput());
    ctx.progress(1);
  },
};
