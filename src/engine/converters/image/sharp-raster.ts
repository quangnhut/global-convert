import type { Sharp } from 'sharp';
import { ConvertError, type Converter } from '@shared/converter';
import type { FormatId } from '@shared/formats';
import {
  backgroundField,
  encodeRaster,
  errorText,
  openImage,
  qualityField,
  readMetadata,
} from './sharp-common';

/** Formats whose files can hold an animation that sharp reads and writes. */
const ANIMATED_FORMATS: readonly FormatId[] = ['gif', 'webp'];
/** Upper bound on files written by "export all frames". */
const MAX_FRAMES = 500;

type Options = {
  quality: number;
  width: number;
  height: number;
  fit: string;
  background: string;
  stripMetadata: boolean;
  frames: string;
  density: number;
};

const FITS = { inside: 'inside', cover: 'cover', fill: 'fill' } as const;

export const sharpRaster: Converter<Options> = {
  id: 'image.sharp-raster',
  family: 'image',
  from: ['png', 'jpg', 'webp', 'avif', 'gif', 'tiff', 'svg'],
  to: ['png', 'jpg', 'webp', 'avif', 'gif', 'tiff'],
  optionsSchema: [
    qualityField,
    { key: 'width', label: 'Width (px, 0 = keep)', type: 'number', min: 0, max: 16384 },
    { key: 'height', label: 'Height (px, 0 = keep)', type: 'number', min: 0, max: 16384 },
    {
      key: 'fit',
      label: 'Resize fit',
      type: 'select',
      choices: [
        { value: 'inside', label: 'Fit inside (keep aspect ratio)' },
        { value: 'cover', label: 'Crop to fill' },
        { value: 'fill', label: 'Stretch' },
      ],
    },
    backgroundField,
    { key: 'stripMetadata', label: 'Strip metadata (EXIF, GPS…)', type: 'boolean' },
    {
      key: 'frames',
      label: 'Animated / multi-page input',
      type: 'select',
      choices: [
        { value: 'first', label: 'First frame only' },
        { value: 'all', label: 'Export every frame as a file' },
      ],
    },
    { key: 'density', label: 'SVG render density (DPI)', type: 'number', min: 24, max: 1200 },
  ],
  defaults: {
    quality: 85,
    width: 0,
    height: 0,
    fit: 'inside',
    background: '#ffffff',
    stripMetadata: true,
    frames: 'first',
    density: 72,
  },
  notes:
    'Animation is kept only for GIF ↔ WebP. Other targets take the first frame, or every ' +
    'frame as separate files.',

  async convert(job, ctx) {
    const { options: o, from, to } = job;
    const input = from === 'svg' ? { density: o.density } : {};
    const pages = (await readMetadata(job.inputPath, input)).pages ?? 1;

    const finish = async (image: Sharp, out: string) => {
      let result = image;
      if (o.width > 0 || o.height > 0) {
        result = result.resize({
          width: o.width || undefined,
          height: o.height || undefined,
          fit: FITS[o.fit as keyof typeof FITS] ?? 'inside',
        });
      }
      if (!o.stripMetadata) result = result.keepMetadata();
      try {
        await encodeRaster(result, to, o).toFile(out);
      } catch (err) {
        // The header was readable (metadata passed) but the pixel data is not.
        throw new ConvertError(`The image is damaged or incomplete (${errorText(err)}).`);
      }
    };

    if (pages > 1 && ANIMATED_FORMATS.includes(from) && ANIMATED_FORMATS.includes(to)) {
      await finish(
        openImage(job.inputPath, { ...input, animated: true }),
        await ctx.reserveOutput(),
      );
      ctx.progress(1);
      return;
    }

    if (pages > 1 && o.frames === 'all') {
      if (pages > MAX_FRAMES) {
        throw new ConvertError(`This file has ${pages} frames; the limit is ${MAX_FRAMES}.`);
      }
      for (let page = 0; page < pages; page++) {
        ctx.signal.throwIfAborted();
        const image = openImage(job.inputPath, { ...input, page, autoOrient: true });
        await finish(image, await ctx.reserveOutput(`-f${page + 1}`));
        ctx.progress((page + 1) / pages);
      }
      return;
    }

    await finish(
      openImage(job.inputPath, { ...input, autoOrient: true }),
      await ctx.reserveOutput(),
    );
    ctx.progress(1);
  },
};
