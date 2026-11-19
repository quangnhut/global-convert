import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect } from 'vitest';
import { detectFormat, DETECT_HEAD_BYTES } from '@shared/detect';
import type { EngineToMain } from '@shared/engine-protocol';
import type { FormatId } from '@shared/formats';
import { createEngineHost } from '../../src/engine/host';
import { createRegistry } from '../../src/engine/registry';

export const FIXTURE: Record<string, string> = {
  png: 'sample.png',
  jpg: 'sample.jpg',
  webp: 'sample.webp',
  avif: 'sample.avif',
  gif: 'sample-animated.gif',
  tiff: 'sample.tiff',
  svg: 'sample.svg',
  ico: 'sample.ico',
};

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

/** Runs one job through the real engine host + registry; returns the final message. */
export async function convert(
  outputDir: string,
  from: FormatId,
  to: FormatId,
  options: Record<string, unknown> = {},
  inputPath = fixturePath(from),
): Promise<EngineToMain> {
  const sent: EngineToMain[] = [];
  const host = createEngineHost(createRegistry(), (m) => sent.push(m));
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
): Promise<string[]> {
  const result = await convert(outputDir, from, to, options);
  if (result.type !== 'done') throw new Error(`Expected done, got ${JSON.stringify(result)}`);
  return result.outputs;
}

/** Asserts the file's content (not its name) is detected as `format`. */
export function expectFormat(path: string, format: FormatId): void {
  const head = new Uint8Array(readFileSync(path)).subarray(0, DETECT_HEAD_BYTES);
  expect(detectFormat(head, 'no-extension')).toEqual({ format, by: 'content' });
}
