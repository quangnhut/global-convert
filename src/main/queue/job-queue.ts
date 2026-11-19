export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export type JobEvent<R> =
  | { jobId: string; status: 'queued' | 'running' | 'cancelled' }
  | { jobId: string; status: 'progress'; ratio: number }
  | { jobId: string; status: 'done'; result: R }
  | { jobId: string; status: 'failed'; message: string };

export interface RunContext {
  signal: AbortSignal;
  progress(ratio: number): void;
}

export type JobRunner<J, R> = (job: J, ctx: RunContext) => Promise<R>;

export interface JobQueueOptions<R> {
  concurrency: number;
  onEvent(event: JobEvent<R>): void;
}

/** FIFO queue with bounded concurrency and per-job cancellation. Electron-free. */
export class JobQueue<J extends { id: string }, R> {
  private readonly waiting: J[] = [];
  private readonly active = new Map<string, AbortController>();
  private idleWaiters: (() => void)[] = [];

  constructor(
    private readonly run: JobRunner<J, R>,
    private readonly options: JobQueueOptions<R>,
  ) {
    if (!(options.concurrency >= 1)) throw new Error('concurrency must be >= 1');
  }

  add(job: J): void {
    if (this.active.has(job.id) || this.waiting.some((j) => j.id === job.id)) {
      throw new Error(`Job ${job.id} is already queued`);
    }
    this.waiting.push(job);
    this.options.onEvent({ jobId: job.id, status: 'queued' });
    this.pump();
  }

  /** Cancels a queued or running job. Returns false if the id is unknown. */
  cancel(jobId: string): boolean {
    const index = this.waiting.findIndex((j) => j.id === jobId);
    if (index >= 0) {
      this.waiting.splice(index, 1);
      this.options.onEvent({ jobId, status: 'cancelled' });
      this.notifyIdle();
      return true;
    }
    const controller = this.active.get(jobId);
    controller?.abort();
    return controller !== undefined;
  }

  cancelAll(): void {
    for (const job of this.waiting.splice(0)) {
      this.options.onEvent({ jobId: job.id, status: 'cancelled' });
    }
    for (const controller of this.active.values()) controller.abort();
    this.notifyIdle();
  }

  get size(): { waiting: number; running: number } {
    return { waiting: this.waiting.length, running: this.active.size };
  }

  /** Resolves when nothing is waiting or running. */
  idle(): Promise<void> {
    if (this.waiting.length === 0 && this.active.size === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private pump(): void {
    while (this.active.size < this.options.concurrency && this.waiting.length > 0) {
      void this.start(this.waiting.shift()!);
    }
  }

  private async start(job: J): Promise<void> {
    const controller = new AbortController();
    this.active.set(job.id, controller);
    const { onEvent } = this.options;
    onEvent({ jobId: job.id, status: 'running' });

    try {
      const result = await this.run(job, {
        signal: controller.signal,
        progress: (ratio) => {
          if (!controller.signal.aborted) onEvent({ jobId: job.id, status: 'progress', ratio });
        },
      });
      if (controller.signal.aborted) onEvent({ jobId: job.id, status: 'cancelled' });
      else onEvent({ jobId: job.id, status: 'done', result });
    } catch (err) {
      if (controller.signal.aborted) onEvent({ jobId: job.id, status: 'cancelled' });
      else
        onEvent({
          jobId: job.id,
          status: 'failed',
          message: err instanceof Error ? err.message : String(err),
        });
    } finally {
      this.active.delete(job.id);
      this.pump();
      this.notifyIdle();
    }
  }

  private notifyIdle(): void {
    if (this.waiting.length > 0 || this.active.size > 0) return;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    waiters.forEach((resolve) => resolve());
  }
}
