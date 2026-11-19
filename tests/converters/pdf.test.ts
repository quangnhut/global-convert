import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { convert, convertOk, expectFormat, FIXTURE_TEXT, useOutputDir } from './helpers';

// The fixture has two A4 pages (595 × 842 pt).
const px = (pt: number, dpi: number) => Math.ceil((pt * dpi) / 72);

describe('document.pdf', () => {
  const dir = useOutputDir();

  it('pdf → txt: text of every page', async () => {
    const [out] = await convertOk(dir(), 'pdf', 'txt');
    const text = readFileSync(out!, 'utf8');
    expect(text).toContain('Fixture Heading');
    expect(text).toContain(`${FIXTURE_TEXT} — page 1.`);
    expect(text).toContain(`${FIXTURE_TEXT} — page 2.`);
  });

  it.each(['png', 'jpg'] as const)('pdf → %s: one image per page at the chosen DPI', async (to) => {
    const outs = await convertOk(dir(), 'pdf', to, { dpi: 72 });
    expect(outs.map((p) => basename(p))).toEqual([`sample-p1.${to}`, `sample-p2.${to}`]);
    for (const out of outs) {
      expectFormat(out, to);
      const meta = await sharp(out).metadata();
      expect([meta.width, meta.height]).toEqual([px(595, 72), px(842, 72)]);
    }
  });

  it('renders actual content (not a blank page)', async () => {
    const [out] = await convertOk(dir(), 'pdf', 'png', { dpi: 72, toPage: 1 });
    const stats = await sharp(out!).stats();
    expect(stats.channels[0]!.min).toBeLessThan(50); // dark text pixels exist
  });

  it('page range: a single page has no suffix', async () => {
    const outs = await convertOk(dir(), 'pdf', 'png', { dpi: 36, fromPage: 2, toPage: 2 });
    expect(outs.map((p) => basename(p))).toEqual(['sample.png']);
  });

  it('page range applies to text too', async () => {
    const [out] = await convertOk(dir(), 'pdf', 'txt', { fromPage: 2 });
    const text = readFileSync(out!, 'utf8');
    expect(text).toContain('page 2');
    expect(text).not.toContain('page 1');
  });

  it('an empty page range fails clearly', async () => {
    expect(await convert(dir(), 'pdf', 'txt', { fromPage: 5 })).toMatchObject({
      type: 'failed',
      message: 'The page range is empty (the PDF has 2 pages).',
    });
  });
});
