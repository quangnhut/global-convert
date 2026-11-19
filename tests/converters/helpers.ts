import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import type { PdfPrintOptions } from '@shared/converter';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect } from 'vitest';
import { detectFormat, DETECT_HEAD_BYTES } from '@shared/detect';
import type { EngineToMain } from '@shared/engine-protocol';
import type { FormatId } from '@shared/formats';
import { createEngineHost } from '../../src/engine/host';
import { createRegistry, type RegistryOptions } from '../../src/engine/registry';

export const FIXTURE: Record<string, string> = {
  png: 'sample.png',
  jpg: 'sample.jpg',
  webp: 'sample.webp',
  avif: 'sample.avif',
  gif: 'sample-animated.gif',
  tiff: 'sample.tiff',
  svg: 'sample.svg',
  ico: 'sample.ico',
  pdf: 'sample.pdf',
  docx: 'sample.docx',
  txt: 'sample.txt',
  md: 'sample.md',
};

/** Text that the document fixtures contain (see scripts/make-fixtures.mjs). */
export const FIXTURE_TEXT = 'GlobalConvert fixture';

/** Pixel size of each image fixture. */
export const FIXTURE_SIZE: Record<string, [number, number]> = {
  png: [64, 48],
  jpg: [64, 48],
  webp: [64, 48],
  avif: [64, 48],
  gif: [32, 32],
  tiff: [64, 48],
  svg: [64, 48],
  ico: [32, 32],
};

export const fixturePath = (format: string) =>
  resolve(import.meta.dirname, '..', 'fixtures', FIXTURE[format]!);

/** Creates (and removes after each test) a temp output dir. */
export function useOutputDir(): () => string {
  let dir = '';
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'gc-conv-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  return () => dir;
}

/** HTML documents the engine asked main to print during the last `convert` call. */
export const printed: { html: string; options: PdfPrintOptions }[] = [];

/**
 * Stand-in for main's Chromium printer: records the HTML and answers with a blank PDF
 * whose page size follows the requested options (real printing is checked in Electron).
 */
async function fakePrint(html: string, options: PdfPrintOptions): Promise<Uint8Array> {
  printed.push({ html, options });
  const pdf = await PDFDocument.create();
  pdf.addPage(options.pageSize === 'Letter' ? [612, 792] : [595.28, 841.89]);
  return pdf.save();
}

/** Runs one job through the real engine host + registry; returns the final message. */
export async function convert(
  outputDir: string,
  from: FormatId,
  to: FormatId,
  options: Record<string, unknown> = {},
  inputPath = fixturePath(from),
  registryOptions: RegistryOptions = {},
): Promise<EngineToMain> {
  const sent: EngineToMain[] = [];
  printed.length = 0;
  const host = createEngineHost(createRegistry(registryOptions), (m) => {
    sent.push(m);
    if (m.type === 'render-pdf') {
      const html = readFileSync(m.htmlPath, 'utf8');
      void fakePrint(html, m.options).then((pdf) =>
        host.handle({ type: 'render-pdf-result', requestId: m.requestId, pdf }),
      );
    }
  });
  await host.handle({
    type: 'convert',
    job: { id: 'j', inputPath, from, to, outputDir, options: options as never },
  });
  return sent.at(-1)!;
}

/** Like `convert`, but asserts success and returns the output paths. */
export async function convertOk(
  outputDir: string,
  from: FormatId,
  to: FormatId,
  options: Record<string, unknown> = {},
  inputPath = fixturePath(from),
  registryOptions: RegistryOptions = {},
): Promise<string[]> {
  const result = await convert(outputDir, from, to, options, inputPath, registryOptions);
  if (result.type !== 'done') throw new Error(`Expected done, got ${JSON.stringify(result)}`);
  return result.outputs;
}

/** Reads a .docx back as HTML (headings become <h1>…, lists <ul>/<ol>). */
export async function docxHtml(path: string): Promise<string> {
  const mammoth = (await import('mammoth')).default;
  return (await mammoth.convertToHtml({ path })).value;
}

/** Asserts the file's content (not its name) is detected as `format`. */
export function expectFormat(path: string, format: FormatId): void {
  const head = new Uint8Array(readFileSync(path)).subarray(0, DETECT_HEAD_BYTES);
  expect(detectFormat(head, 'no-extension')).toEqual({ format, by: 'content' });
}
