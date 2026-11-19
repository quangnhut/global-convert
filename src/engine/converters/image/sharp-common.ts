import { readFile } from 'node:fs/promises';
import sharp, { type Sharp, type SharpOptions } from 'sharp';
import { ConvertError, type OptionField } from '@shared/converter';
import type { FormatId } from '@shared/formats';

/** Refuse inputs above ~100 megapixels (decompression-bomb guard). */
export const LIMIT_INPUT_PIXELS = 100_000_000;

/** Opens an image with the app's safety limits applied. */
export function openImage(input: string | Buffer, options: SharpOptions = {}): Sharp {
  return sharp(input, { limitInputPixels: LIMIT_INPUT_PIXELS, ...options });
}

/** Reads image metadata, turning "not an image" into a readable error. */
export async function readMetadata(input: string | Buffer, options: SharpOptions = {}) {
  try {
    return await openImage(input, options).metadata();
  } catch (err) {
    throw new ConvertError(`Could not read the image: ${errorText(err)}`);
  }
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const qualityField: OptionField = {
  key: 'quality',
  label: 'Quality (JPEG/WebP/AVIF)',
  type: 'number',
  min: 1,
  max: 100,
};

export const backgroundField: OptionField = {
  key: 'background',
  label: 'Background for transparency (JPEG)',
  type: 'select',
  choices: [
    { value: '#ffffff', label: 'White' },
    { value: '#000000', label: 'Black' },
  ],
};

export interface EncodeOptions {
  quality: number;
  background: string;
}

/** Sets the output encoder for a raster target on `image`. */
export function encodeRaster(image: Sharp, to: FormatId, { quality, background }: EncodeOptions) {
  switch (to) {
    case 'png':
      return image.png();
    case 'jpg':
      return image.flatten({ background }).jpeg({ quality, mozjpeg: true });
    case 'webp':
      return image.webp({ quality });
    case 'avif':
      return image.avif({ quality });
    case 'gif':
      return image.gif();
    case 'tiff':
      return image.tiff({ compression: 'lzw' });
    default:
      throw new ConvertError(`Cannot write ${to} with the raster encoder.`);
  }
}

export interface EmbeddableImage {
  bytes: Buffer;
  mime: 'image/png' | 'image/jpeg';
  /** Pixel size after EXIF orientation. */
  width: number;
  height: number;
  /** Pixels per inch of `bytes` (72 when the file doesn't say). */
  density: number;
}

/**
 * Bytes suitable for embedding in another container (SVG, PDF). PNG and JPEG files that
 * need no rotation are used as-is (no re-encoding); everything else becomes PNG. Only the
 * first frame/page is used. `density` is the SVG render resolution.
 */
export async function toEmbeddable(
  inputPath: string,
  from: FormatId,
  density?: number,
): Promise<EmbeddableImage> {
  const options: SharpOptions = density ? { density } : {};
  const meta = await readMetadata(inputPath, options);
  const upright = (meta.orientation ?? 1) === 1;
  if ((from === 'png' || from === 'jpg') && upright) {
    return {
      bytes: await readFile(inputPath),
      mime: from === 'png' ? 'image/png' : 'image/jpeg',
      width: meta.width,
      height: meta.height,
      density: meta.density ?? 72,
    };
  }
  const { data, info } = await openImage(inputPath, { ...options, autoOrient: true })
    .png()
    .toBuffer({ resolveWithObject: true });
  return {
    bytes: data,
    mime: 'image/png',
    width: info.width,
    height: info.height,
    density: meta.density ?? 72,
  };
}
