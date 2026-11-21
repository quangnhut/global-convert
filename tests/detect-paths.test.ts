import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectPaths } from '../src/main/detect-file';

let dir: string;
const png = readFileSync(resolve(import.meta.dirname, 'fixtures', 'sample.png'));

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gc-detect-'));
  mkdirSync(join(dir, 'sub', 'deeper'), { recursive: true });
  mkdirSync(join(dir, '.hidden'));
  writeFileSync(join(dir, 'b.png'), png);
  writeFileSync(join(dir, 'a.png'), png);
  writeFileSync(join(dir, 'notes.bin'), Buffer.from([0, 1, 2, 3]));
  writeFileSync(join(dir, '.secret.png'), png);
  writeFileSync(join(dir, '.hidden', 'x.png'), png);
  writeFileSync(join(dir, 'sub', 'deeper', 'c.png'), png);
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe('detectPaths', () => {
  it('scans folders recursively, in name order, skipping hidden and unsupported files', async () => {
    const found = await detectPaths([dir]);
    expect(found.map((f) => f.path.slice(dir.length + 1))).toEqual([
      'a.png',
      'b.png',
      join('sub', 'deeper', 'c.png'),
    ]);
    expect(found.every((f) => f.format === 'png')).toBe(true);
  });

  it('reports files given directly, even unsupported or missing ones', async () => {
    const found = await detectPaths([join(dir, 'notes.bin'), join(dir, 'missing.png')]);
    expect(found.map((f) => f.error)).toEqual(['Unsupported file type', 'File not found']);
  });

  it('stops at the limit', async () => {
    expect(await detectPaths([dir], 2)).toHaveLength(2);
  });
});
