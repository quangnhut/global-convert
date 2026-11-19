import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { FormatId } from '@shared/formats';
import { convertOk, expectFormat, FIXTURE_SIZE, useOutputDir } from './helpers';

const FROM: FormatId[] = ['png', 'jpg', 'webp', 'avif', 'tiff'];

describe('image.svg-wrap', () => {
  const dir = useOutputDir();

  it.each(FROM)('%s → svg: valid SVG with the image size, renders back', async (from) => {
    const [out] = await convertOk(dir(), from, 'svg');
    expectFormat(out!, 'svg');
    const [w, h] = FIXTURE_SIZE[from]!;
    const text = readFileSync(out!, 'utf8');
    expect(text).toContain(`width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"`);
    expect(text).toMatch(from === 'jpg' ? /data:image\/jpeg;base64,/ : /data:image\/png;base64,/);
    const meta = await sharp(out!).metadata();
    expect([meta.width, meta.height]).toEqual([w, h]);
  });
});
