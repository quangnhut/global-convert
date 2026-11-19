import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { FormatId } from '@shared/formats';
import { buildIco } from '../../src/engine/converters/image/ico-encode';
import { convert, convertOk, expectFormat, useOutputDir } from './helpers';

const TO: FormatId[] = ['png', 'jpg', 'webp', 'avif', 'gif', 'tiff'];

/** Minimal 32-bpp BMP (DIB) icon entry: BITMAPINFOHEADER + BGRA rows bottom-up + AND mask. */
function bmpIco(size: number, bgra: [number, number, number, number]): Buffer {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // XOR + AND mask height
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  const pixels = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) pixels.set(bgra, i * 4);
  const mask = Buffer.alloc(Math.ceil(size / 32) * 4 * size);
  const dib = Buffer.concat([header, pixels, mask]);
  // buildIco only uses `png` as opaque bytes, so it can carry a DIB too.
  return buildIco([{ size, png: dib }]);
}

describe('image.ico-decode', () => {
  const dir = useOutputDir();

  it.each(TO)('ico → %s: right format, largest entry', async (to) => {
    const [out] = await convertOk(dir(), 'ico', to);
    expectFormat(out!, to);
    const meta = await sharp(out!).metadata();
    expect([meta.width, meta.height]).toEqual([32, 32]);
  });

  it('picks the largest entry of a multi-size icon', async () => {
    const png = (s: number) =>
      sharp({ create: { width: s, height: s, channels: 4, background: '#f00' } })
        .png()
        .toBuffer();
    const path = join(dir(), 'multi.ico');
    writeFileSync(
      path,
      buildIco([
        { size: 16, png: await png(16) },
        { size: 48, png: await png(48) },
        { size: 32, png: await png(32) },
      ]),
    );
    const result = await convert(dir(), 'ico', 'png', {}, path);
    expect(result.type).toBe('done');
    const meta = await sharp(result.type === 'done' ? result.outputs[0]! : '').metadata();
    expect(meta.width).toBe(48);
  });

  it('reads classic BMP entries', async () => {
    const path = join(dir(), 'bmp.ico');
    writeFileSync(path, bmpIco(16, [0, 0, 255, 255])); // opaque red in BGRA
    const result = await convert(dir(), 'ico', 'png', {}, path);
    if (result.type !== 'done') throw new Error(JSON.stringify(result));
    const { data, info } = await sharp(result.outputs[0]!)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([16, 16]);
    expect([...data.subarray(0, 3)]).toEqual([255, 0, 0]);
  });

  it('rejects a broken icon with a readable message', async () => {
    const path = join(dir(), 'bad.ico');
    writeFileSync(
      path,
      readFileSync(join(import.meta.dirname, '..', 'fixtures', 'sample.ico')).subarray(0, 30),
    );
    const result = await convert(dir(), 'ico', 'png', {}, path);
    expect(result.type).toBe('failed');
  });
});
