import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConvertError, type Converter, type ConvertJob } from '@shared/converter';
import type { EngineToMain } from '@shared/engine-protocol';
import { createEngineHost } from '../src/engine/host';
import { ConverterRegistry } from '../src/engine/registry';

let dir: string;
let tmpRoot: string;
let input: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gc-host-out-'));
  tmpRoot = await mkdtemp(join(tmpdir(), 'gc-host-tmp-'));
  input = join(dir, 'photo.txt');
  await writeFile(input, 'hello');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  await rm(tmpRoot, { recursive: true, force: true });
});

/** txt → md converter that upper-cases; behaviour controlled by options. */
const upper: Converter<{ mode: string; pages: number }> = {
  id: 'test.upper',
  family: 'document',
  from: ['txt'],
  to: ['md'],
  optionsSchema: [
    {
      key: 'mode',
      label: 'Mode',
      type: 'select',
      choices: ['ok', 'fail', 'crash', 'hang'].map((v) => ({ value: v, label: v })),
    },
    { key: 'pages', label: 'Pages', type: 'number', min: 1, max: 5 },
  ],
  defaults: { mode: 'ok', pages: 1 },
  async convert(job, ctx) {
    expect(existsSync(ctx.tmpDir)).toBe(true);
    const text = readFileSync(job.inputPath, 'utf8').toUpperCase();
    for (let p = 1; p <= job.options.pages; p++) {
      const out = await ctx.reserveOutput(job.options.pages > 1 ? `-p${p}` : '');
      writeFileSync(out, text);
      ctx.progress(p / job.options.pages);
    }
    if (job.options.mode === 'fail') throw new ConvertError('Nice message for the user.');
    if (job.options.mode === 'crash') throw new TypeError('x is undefined');
    if (job.options.mode === 'hang') {
      await new Promise((_, reject) =>
        ctx.signal.addEventListener('abort', () => reject(ctx.signal.reason)),
      );
    }
  },
};

function setup() {
  const sent: EngineToMain[] = [];
  const registry = new ConverterRegistry().register(upper as unknown as Converter);
  const host = createEngineHost(registry, (m) => sent.push(m), { tmpRoot });
  const job = (options: Record<string, unknown> = {}, id = 'job1'): ConvertJob => ({
    id,
    inputPath: input,
    from: 'txt',
    to: 'md',
    outputDir: dir,
    options: options as ConvertJob['options'],
  });
  return { host, sent, job };
}

describe('engine host', () => {
  it('announces converters on ready', () => {
    const { host, sent } = setup();
    host.ready();
    expect(sent[0]).toMatchObject({ type: 'ready', converters: [{ id: 'test.upper' }] });
  });

  it('converts, reports progress and outputs, and cleans its temp dir', async () => {
    const { host, sent, job } = setup();
    await host.handle({ type: 'convert', job: job({ pages: 2 }) });
    expect(sent.filter((m) => m.type === 'progress').map((m) => 'ratio' in m && m.ratio)).toEqual([
      0.5, 1,
    ]);
    const done = sent.at(-1);
    expect(done).toEqual({
      type: 'done',
      jobId: 'job1',
      outputs: [join(dir, 'photo-p1.md'), join(dir, 'photo-p2.md')],
    });
    expect(readFileSync(join(dir, 'photo-p1.md'), 'utf8')).toBe('HELLO');
    expect(readdirSync(tmpRoot)).toEqual([]);
  });

  it('never overwrites: picks "name (1).ext" when taken', async () => {
    const { host, sent, job } = setup();
    writeFileSync(join(dir, 'photo.md'), 'keep me');
    await host.handle({ type: 'convert', job: job() });
    expect(sent.at(-1)).toMatchObject({ type: 'done', outputs: [join(dir, 'photo (1).md')] });
    expect(readFileSync(join(dir, 'photo.md'), 'utf8')).toBe('keep me');
  });

  it('ConvertError message is passed through and partial outputs are removed', async () => {
    const { host, sent, job } = setup();
    await host.handle({ type: 'convert', job: job({ mode: 'fail', pages: 3 }) });
    expect(sent.at(-1)).toEqual({
      type: 'failed',
      jobId: 'job1',
      message: 'Nice message for the user.',
    });
    expect(readdirSync(dir)).toEqual(['photo.txt']);
    expect(readdirSync(tmpRoot)).toEqual([]);
  });

  it('unexpected errors are prefixed', async () => {
    const { host, sent, job } = setup();
    await host.handle({ type: 'convert', job: job({ mode: 'crash' }) });
    expect(sent.at(-1)).toEqual({
      type: 'failed',
      jobId: 'job1',
      message: 'Conversion failed: x is undefined',
    });
  });

  it('invalid options fail before running', async () => {
    const { host, sent, job } = setup();
    await host.handle({ type: 'convert', job: job({ pages: 99 }) });
    expect(sent.at(-1)).toMatchObject({
      type: 'failed',
      message: 'Pages must be between 1 and 5.',
    });
  });

  it('unsupported pair fails with a readable message', async () => {
    const { host, sent, job } = setup();
    await host.handle({ type: 'convert', job: { ...job(), to: 'pdf' } });
    expect(sent.at(-1)).toMatchObject({
      type: 'failed',
      message: 'Converting Text to PDF is not supported.',
    });
  });

  it('cancel aborts a running job and removes its outputs', async () => {
    const { host, sent, job } = setup();
    const running = host.handle({ type: 'convert', job: job({ mode: 'hang' }) });
    await new Promise((r) => setTimeout(r, 20));
    await host.handle({ type: 'cancel', jobId: 'job1' });
    await running;
    expect(sent.at(-1)).toEqual({ type: 'cancelled', jobId: 'job1' });
    expect(readdirSync(dir)).toEqual(['photo.txt']);
    expect(readdirSync(tmpRoot)).toEqual([]);
  });
});
