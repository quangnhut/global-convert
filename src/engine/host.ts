import { mkdtemp, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConvertError, type ConvertJob } from '@shared/converter';
import type { EngineToMain, MainToEngine } from '@shared/engine-protocol';
import { FORMATS } from '@shared/formats';
import { resolveOptions } from '@shared/options';
import { baseNameOf, reserveOutputPath } from './output';
import type { ConverterRegistry } from './registry';

export interface EngineHostOptions {
  /** Where per-job temp dirs are created. Defaults to the OS temp dir. */
  tmpRoot?: string;
}

/**
 * Runs conversion jobs inside the engine process. Transport-agnostic: the caller wires
 * `handle` to incoming messages and `send` to outgoing ones (utilityProcess or tests).
 */
export function createEngineHost(
  registry: ConverterRegistry,
  send: (msg: EngineToMain) => void,
  { tmpRoot = tmpdir() }: EngineHostOptions = {},
) {
  const running = new Map<string, AbortController>();

  async function run(job: ConvertJob): Promise<void> {
    if (running.has(job.id)) {
      send({ type: 'failed', jobId: job.id, message: `Duplicate job id ${job.id}` });
      return;
    }
    const controller = new AbortController();
    running.set(job.id, controller);
    const outputs: string[] = [];
    let tmpDir: string | undefined;

    try {
      const converter = registry.pick(job.from, job.to);
      if (!converter) {
        throw new ConvertError(
          `Converting ${FORMATS[job.from].label} to ${FORMATS[job.to].label} is not supported.`,
        );
      }
      const options = resolveOptions(converter.optionsSchema, converter.defaults, job.options);
      tmpDir = await mkdtemp(join(tmpRoot, 'globalconvert-'));
      const base = baseNameOf(job.inputPath);
      const ext = FORMATS[job.to].extensions[0]!;

      await converter.convert(
        { ...job, options },
        {
          signal: controller.signal,
          tmpDir,
          progress: (ratio) => {
            if (!controller.signal.aborted) {
              send({ type: 'progress', jobId: job.id, ratio: Math.min(1, Math.max(0, ratio)) });
            }
          },
          reserveOutput: async (suffix) => {
            const path = await reserveOutputPath(job.outputDir, base, ext, suffix);
            outputs.push(path);
            return path;
          },
        },
      );
      controller.signal.throwIfAborted();
      send({ type: 'done', jobId: job.id, outputs });
    } catch (err) {
      await Promise.all(outputs.map((p) => unlink(p).catch(() => undefined)));
      if (controller.signal.aborted) {
        send({ type: 'cancelled', jobId: job.id });
      } else {
        const message =
          err instanceof ConvertError
            ? err.message
            : `Conversion failed: ${err instanceof Error ? err.message : String(err)}`;
        send({ type: 'failed', jobId: job.id, message });
      }
    } finally {
      running.delete(job.id);
      if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  return {
    /** Announce available converters to main. */
    ready(): void {
      send({ type: 'ready', converters: registry.info() });
    },
    /** Handle one message from main. Resolves when a `convert` job has finished. */
    handle(msg: MainToEngine): Promise<void> {
      switch (msg.type) {
        case 'convert':
          return run(msg.job);
        case 'cancel':
          running.get(msg.jobId)?.abort();
          return Promise.resolve();
      }
    },
  };
}
