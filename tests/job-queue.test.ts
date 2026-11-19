import { describe, expect, it } from 'vitest';
import { JobQueue, type JobEvent, type RunContext } from '../src/main/queue/job-queue';

type Job = { id: string; ms?: number; fail?: boolean };

/** Runner that waits `ms`, honours abort, and records concurrency. */
function setup(concurrency: number) {
  const events: JobEvent<string>[] = [];
  let running = 0;
  let maxRunning = 0;
  const started: string[] = [];

  const run = (job: Job, { signal, progress }: RunContext) =>
    new Promise<string>((resolve, reject) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      started.push(job.id);
      progress(0.5);
      const timer = setTimeout(() => {
        running--;
        if (job.fail) reject(new Error(`boom ${job.id}`));
        else resolve(`ok ${job.id}`);
      }, job.ms ?? 10);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        running--;
        reject(new DOMException('Cancelled', 'AbortError'));
      });
    });

  const queue = new JobQueue<Job, string>(run, { concurrency, onEvent: (e) => events.push(e) });
  const statusOf = (id: string) =>
    events.filter((e) => e.jobId === id && e.status !== 'progress').map((e) => e.status);
  return { queue, events, started, statusOf, maxRunning: () => maxRunning };
}

describe('JobQueue', () => {
  it('never exceeds concurrency and runs jobs FIFO', async () => {
    const { queue, started, maxRunning, statusOf } = setup(2);
    for (let i = 1; i <= 6; i++) queue.add({ id: `j${i}` });
    await queue.idle();
    expect(maxRunning()).toBe(2);
    expect(started).toEqual(['j1', 'j2', 'j3', 'j4', 'j5', 'j6']);
    expect(statusOf('j6')).toEqual(['queued', 'running', 'done']);
  });

  it('reports result, progress and failures', async () => {
    const { queue, events, statusOf } = setup(1);
    queue.add({ id: 'good' });
    queue.add({ id: 'bad', fail: true });
    await queue.idle();
    expect(events).toContainEqual({ jobId: 'good', status: 'done', result: 'ok good' });
    expect(events).toContainEqual({ jobId: 'good', status: 'progress', ratio: 0.5 });
    expect(events).toContainEqual({ jobId: 'bad', status: 'failed', message: 'boom bad' });
    expect(statusOf('bad')).toEqual(['queued', 'running', 'failed']);
  });

  it('cancels a queued job without running it', async () => {
    const { queue, started, statusOf } = setup(1);
    queue.add({ id: 'a', ms: 30 });
    queue.add({ id: 'b' });
    expect(queue.cancel('b')).toBe(true);
    await queue.idle();
    expect(started).toEqual(['a']);
    expect(statusOf('b')).toEqual(['queued', 'cancelled']);
  });

  it('cancels a running job via its AbortSignal', async () => {
    const { queue, statusOf } = setup(1);
    queue.add({ id: 'slow', ms: 10_000 });
    await Promise.resolve();
    expect(queue.cancel('slow')).toBe(true);
    await queue.idle();
    expect(statusOf('slow')).toEqual(['queued', 'running', 'cancelled']);
  });

  it('cancelAll stops running and queued jobs; next jobs still run', async () => {
    const { queue, statusOf } = setup(2);
    ['a', 'b', 'c', 'd'].forEach((id) => queue.add({ id, ms: 10_000 }));
    queue.cancelAll();
    await queue.idle();
    for (const id of ['a', 'b']) expect(statusOf(id)).toEqual(['queued', 'running', 'cancelled']);
    for (const id of ['c', 'd']) expect(statusOf(id)).toEqual(['queued', 'cancelled']);

    queue.add({ id: 'e' });
    await queue.idle();
    expect(statusOf('e')).toEqual(['queued', 'running', 'done']);
  });

  it('rejects duplicate ids and unknown cancels', () => {
    const { queue } = setup(1);
    queue.add({ id: 'x', ms: 5 });
    expect(() => queue.add({ id: 'x' })).toThrow(/already queued/);
    expect(queue.cancel('nope')).toBe(false);
  });
});
