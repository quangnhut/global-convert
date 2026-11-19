import { writeFile } from 'node:fs/promises';
import { ConvertError, type Converter } from '@shared/converter';
import { openImage, readMetadata } from './sharp-common';

const SIZES = [16, 24, 32, 48, 64, 128, 256] as const;
type SizeKey = `size${(typeof SIZES)[number]}`;
type Options = Record<SizeKey, boolean>;

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/** Builds an .ico file from square PNG images (PNG entries are valid since Windows Vista). */
export function buildIco(images: readonly { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, entry); // 0 means 256
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2); // no palette
    header.writeUInt8(0, entry + 3); // reserved
    header.writeUInt16LE(1, entry + 4); // colour planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map((img) => img.png)]);
}

export const icoEncode: Converter<Options> = {
  id: 'image.ico-encode',
  family: 'image',
  from: ['png', 'jpg', 'webp', 'avif', 'gif', 'tiff', 'svg'],
  to: ['ico'],
  optionsSchema: SIZES.map((size) => ({
    key: `size${size}`,
    label: `Include ${size}×${size}`,
    type: 'boolean' as const,
  })),
  defaults: {
    size16: true,
    size24: false,
    size32: true,
    size48: true,
    size64: false,
    size128: false,
    size256: true,
  },
  notes:
    'Non-square images are centred on a transparent square. Animated input uses the first frame.',

  async convert(job, ctx) {
    const sizes = SIZES.filter((s) => job.options[`size${s}`]);
    if (sizes.length === 0) throw new ConvertError('Choose at least one icon size.');
    const largest = sizes.at(-1)!;

    // Render SVG straight at the largest icon size instead of upscaling a 72-DPI render.
    let density: number | undefined;
    if (job.from === 'svg') {
      const meta = await readMetadata(job.inputPath);
      density = Math.min(2400, Math.max(1, (72 * largest) / Math.max(meta.width, meta.height)));
    } else {
      await readMetadata(job.inputPath);
    }
    const source = await openImage(job.inputPath, { density, autoOrient: true }).png().toBuffer();

    const images: { size: number; png: Buffer }[] = [];
    for (const size of sizes) {
      ctx.signal.throwIfAborted();
      const png = await openImage(source)
        .resize(size, size, { fit: 'contain', background: TRANSPARENT })
        .png()
        .toBuffer();
      images.push({ size, png });
      ctx.progress(images.length / sizes.length);
    }
    await writeFile(await ctx.reserveOutput(), buildIco(images));
  },
};
