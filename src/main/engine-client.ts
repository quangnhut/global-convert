import { utilityProcess, type UtilityProcess } from 'electron';
import type { ConverterInfo, ConvertJob, ConvertResult, PdfPrintOptions } from '@shared/converter';
import type { EngineToMain, MainToEngine } from '@shared/engine-protocol';
import type { RunContext } from './queue/job-queue';

/** Main-process services the engine can call while a job runs. */
export interface EngineServices {
  renderHtmlToPdf(htmlPath: string, options: PdfPrintOptions): Promise<Uint8Array>;
}

interface Pending {
  resolve(result: ConvertResult): void;
  reject(err: Error): void;
  progress(ratio: number): void;
}

/**
 * Owns the engine utilityProcess. Starts it lazily, and restarts it on the next
 * request if it crashes (in-flight jobs fail with a clear error).
 */
export class EngineClient {
  private proc: UtilityProcess | undefined;
  private ready: Promise<ConverterInfo[]> | undefined;
  private readonly pending = new Map<string, Pending>();

  constructor(
    private readonly entryPath: string,
    private readonly services: EngineServices,
  ) {}

  converters(): Promise<ConverterInfo[]> {
    return this.ensure();
  }

  async convert(job: ConvertJob, { signal, progress }: RunContext): Promise<ConvertResult> {
    await this.ensure();
    signal.throwIfAborted();

    return new Promise<ConvertResult>((resolve, reject) => {
      const onAbort = () => this.send({ type: 'cancel', jobId: job.id });
      const settle = () => signal.removeEventListener('abort', onAbort);
      this.pending.set(job.id, {
        resolve: (r) => (settle(), resolve(r)),
        reject: (e) => (settle(), reject(e)),
        progress,
      });
      signal.addEventListener('abort', onAbort, { once: true });
      this.send({ type: 'convert', job });
    });
  }

  stop(): void {
    this.proc?.kill();
  }

  private send(msg: MainToEngine): void {
    this.proc?.postMessage(msg);
  }

  private ensure(): Promise<ConverterInfo[]> {
    if (this.ready) return this.ready;

    const proc = utilityProcess.fork(this.entryPath, [], {
      serviceName: 'GlobalConvert Engine',
      stdio: 'inherit',
    });
    this.proc = proc;

    this.ready = new Promise<ConverterInfo[]>((resolve, reject) => {
      proc.on('message', (msg: EngineToMain) => {
        if (msg.type === 'ready') resolve(msg.converters);
        else if (msg.type === 'render-pdf') void this.onRenderPdf(msg);
        else this.onJobMessage(msg);
      });
      proc.once('exit', (code) => {
        const error = new Error(`The conversion engine stopped unexpectedly (exit code ${code}).`);
        reject(error);
        for (const p of this.pending.values()) p.reject(error);
        this.pending.clear();
        this.proc = undefined;
        this.ready = undefined;
      });
    });
    return this.ready;
  }

  private async onRenderPdf(msg: Extract<EngineToMain, { type: 'render-pdf' }>): Promise<void> {
    try {
      const pdf = await this.services.renderHtmlToPdf(msg.htmlPath, msg.options);
      this.send({ type: 'render-pdf-result', requestId: msg.requestId, pdf });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.send({ type: 'render-pdf-result', requestId: msg.requestId, error });
    }
  }

  private onJobMessage(msg: Exclude<EngineToMain, { type: 'ready' | 'render-pdf' }>): void {
    const pending = this.pending.get(msg.jobId);
    if (!pending) return;
    switch (msg.type) {
      case 'progress':
        pending.progress(msg.ratio);
        return;
      case 'done':
        this.pending.delete(msg.jobId);
        pending.resolve({ outputs: msg.outputs });
        return;
      case 'failed':
        this.pending.delete(msg.jobId);
        pending.reject(new Error(msg.message));
        return;
      case 'cancelled':
        this.pending.delete(msg.jobId);
        pending.reject(new DOMException('Cancelled', 'AbortError'));
        return;
    }
  }
}
