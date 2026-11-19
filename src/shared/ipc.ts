/** IPC contract between main and preload. Types only — no Node/Electron imports. */
import type { ConverterInfo, OptionValues } from './converter';
import type { FormatId } from './formats';

export const IPC = {
  appVersion: 'app:version',
  converters: 'engine:converters',
  detectFiles: 'files:detect',
  convertStart: 'convert:start',
  convertCancel: 'convert:cancel',
  convertEvent: 'convert:event',
} as const;

/** Upper bound on files per request, to keep IPC payloads sane. */
export const MAX_FILES_PER_REQUEST = 5000;

export interface DetectedFile {
  path: string;
  name: string;
  size: number;
  format: FormatId | null;
  error?: string;
}

/** One conversion the renderer asks for. Main assigns the job id. */
export interface ConvertRequest {
  inputPath: string;
  from: FormatId;
  to: FormatId;
  outputDir: string;
  options: OptionValues;
}

/** Pushed main → renderer on `IPC.convertEvent`. */
export type ConversionEvent =
  | { jobId: string; status: 'queued' | 'running' | 'cancelled' }
  | { jobId: string; status: 'progress'; ratio: number }
  | { jobId: string; status: 'done'; outputs: string[] }
  | { jobId: string; status: 'failed'; message: string };

/** The API the preload script exposes on `window.api`. */
export interface RendererApi {
  getAppVersion(): Promise<string>;
  getConverters(): Promise<ConverterInfo[]>;
  detectFiles(paths: string[]): Promise<DetectedFile[]>;
  /** Queues conversions; resolves with the job ids in request order. */
  startConversion(requests: ConvertRequest[]): Promise<string[]>;
  /** Cancels one job, or all jobs when no id is given. */
  cancelConversion(jobId?: string): Promise<void>;
  /** Subscribes to conversion events; returns an unsubscribe function. */
  onConversionEvent(listener: (event: ConversionEvent) => void): () => void;
}
