import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { FormatId } from '@shared/formats';
import { convertOk, expectFormat, FIXTURE_SIZE, useOutputDir } from './helpers';

const FROM: FormatId[] = ['png', 'jpg', 'webp', 'avif', 'gif', 'tiff', 'svg'];

const pages = async (path: string) =>
  (await PDFDocument.load(readFileSync(path))).getPages().map((p) => {
    const { width, height } = p.getSize();
    return [Math.round(width), Math.round(height)];
  });

describe('image.images-to-pdf', () => {
  const dir = useOutputDir();

  it.each(FROM)('%s → pdf: one page sized to the image', async (from) => {
    const [out] = await convertOk(dir(), from, 'pdf');
    expectFormat(out!, 'pdf');
    // Fixtures carry no DPI, so 1 px = 1 pt (72 DPI); SVG uses its nominal size.
    expect(await pages(out!)).toEqual([FIXTURE_SIZE[from]]);
  });

  it('A4 page, landscape for a landscape image', async () => {
    const [out] = await convertOk(dir(), 'png', 'pdf', { pageSize: 'a4' });
    expect(await pages(out!)).toEqual([[842, 595]]);
  });

  it('US Letter page, portrait for a square image', async () => {
    const [out] = await convertOk(dir(), 'gif', 'pdf', { pageSize: 'letter' });
    expect(await pages(out!)).toEqual([[612, 792]]);
  });
});
