import { basename } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { FormatId } from '@shared/formats';
import { convert, convertOk, expectFormat, FIXTURE_SIZE, useOutputDir } from './helpers';

const FROM: FormatId[] = ['png', 'jpg', 'webp', 'avif', 'gif', 'tiff', 'svg'];
const TO: FormatId[] = ['png', 'jpg', 'webp', 'avif', 'gif', 'tiff'];
const CELLS = FROM.flatMap((from) => TO.filter((to) => to !== from).map((to) => [from, to]));

describe('image.sharp-raster', () => {
  const dir = useOutputDir();

  it.each(CELLS)('%s → %s: right format and dimensions', async (from, to) => {
    const [out, ...rest] = await convertOk(dir(), from as FormatId, to as FormatId);
    expect(rest).toEqual([]);
    expectFormat(out!, to as FormatId);
    const meta = await sharp(out!).metadata();
    expect([meta.width, meta.pageHeight ?? meta.height]).toEqual(FIXTURE_SIZE[from as FormatId]);
  });

  it('animated gif → webp keeps all frames', async () => {
    const [out] = await convertOk(dir(), 'gif', 'webp');
    const meta = await sharp(out!, { animated: true }).metadata();
    expect(meta.pages).toBe(3);
    expect(meta.pageHeight).toBe(32);
  });

  it('animated gif → avif takes the first frame (sharp cannot write animated AVIF)', async () => {
    const [out] = await convertOk(dir(), 'gif', 'avif');
    const meta = await sharp(out!).metadata();
    expect([meta.width, meta.height, meta.pages ?? 1]).toEqual([32, 32, 1]);
  });

  it('frames = all exports one file per frame', async () => {
    const outs = await convertOk(dir(), 'gif', 'png', { frames: 'all' });
    expect(outs.map((p) => basename(p))).toEqual([
      'sample-animated-f1.png',
      'sample-animated-f2.png',
      'sample-animated-f3.png',
    ]);
    const firstPixel = async (p: string) => [...(await sharp(p).raw().toBuffer()).subarray(0, 3)];
    expect(await firstPixel(outs[0]!)).not.toEqual(await firstPixel(outs[1]!));
  });

  it('resizes with width only, keeping aspect ratio', async () => {
    const [out] = await convertOk(dir(), 'png', 'webp', { width: 32 });
    const meta = await sharp(out!).metadata();
    expect([meta.width, meta.height]).toEqual([32, 24]);
  });

  it('cover crops to the exact box', async () => {
    const [out] = await convertOk(dir(), 'png', 'jpg', { width: 20, height: 20, fit: 'cover' });
    const meta = await sharp(out!).metadata();
    expect([meta.width, meta.height]).toEqual([20, 20]);
  });

  it('flattens transparency onto the chosen background for jpg', async () => {
    // The png fixture's top-left 8×8 corner is transparent.
    const [out] = await convertOk(dir(), 'png', 'jpg', { background: '#000000' });
    const [r, g, b] = await sharp(out!).raw().toBuffer();
    expect(Math.max(r!, g!, b!)).toBeLessThan(20);
  });

  it('SVG density scales the render', async () => {
    const [out] = await convertOk(dir(), 'svg', 'png', { density: 144 });
    const meta = await sharp(out!).metadata();
    expect([meta.width, meta.height]).toEqual([128, 96]);
  });

  it('a corrupt file fails with a readable message and leaves no output', async () => {
    const { writeFile, readdir } = await import('node:fs/promises');
    const bad = `${dir()}/broken.png`;
    await writeFile(bad, 'not really a png');
    const result = await convert(dir(), 'png', 'jpg', {}, bad);
    expect(result).toMatchObject({ type: 'failed' });
    expect(result.type === 'failed' && result.message).toMatch(/^Could not read the image/);
    expect(await readdir(dir())).toEqual(['broken.png']);
  });
});
