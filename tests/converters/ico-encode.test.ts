import { readFileSync } from 'node:fs';
import decodeIco from 'decode-ico';
import { describe, expect, it } from 'vitest';
import type { FormatId } from '@shared/formats';
import { convert, convertOk, expectFormat, useOutputDir } from './helpers';

const FROM: FormatId[] = ['png', 'jpg', 'webp', 'avif', 'gif', 'tiff', 'svg'];

const entrySizes = (path: string) =>
  decodeIco(readFileSync(path)).map((e) => [e.width, e.height, e.type]);

describe('image.ico-encode', () => {
  const dir = useOutputDir();

  it.each(FROM)('%s → ico: valid icon with the default sizes', async (from) => {
    const [out] = await convertOk(dir(), from, 'ico');
    expectFormat(out!, 'ico');
    expect(entrySizes(out!)).toEqual([
      [16, 16, 'png'],
      [32, 32, 'png'],
      [48, 48, 'png'],
      [256, 256, 'png'],
    ]);
  });

  it('writes exactly the chosen sizes', async () => {
    const options = { size16: false, size32: false, size48: false, size256: false, size24: true };
    const [out] = await convertOk(dir(), 'png', 'ico', { ...options, size64: true });
    expect(entrySizes(out!)).toEqual([
      [24, 24, 'png'],
      [64, 64, 'png'],
    ]);
  });

  it('fails clearly when no size is chosen', async () => {
    const none = { size16: false, size32: false, size48: false, size256: false };
    expect(await convert(dir(), 'png', 'ico', none)).toMatchObject({
      type: 'failed',
      message: 'Choose at least one icon size.',
    });
  });
});
