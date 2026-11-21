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
  pickFiles: 'dialog:pick-files',
  pickFolders: 'dialog:pick-folders',
  pickOutputDir: 'dialog:pick-output-dir',
  showOutput: 'shell:show-output',
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
  /** Folder for the result; `null` = next to the input file. */
  outputDir: string | null;
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
  /**
   * Detects each file's format. Folders are scanned recursively; inside folders, hidden and
   * unsupported files are skipped. At most MAX_FILES_PER_REQUEST results.
   */
  detectFiles(paths: string[]): Promise<DetectedFile[]>;
  /** Native "open files" dialog; [] when cancelled. */
  pickFiles(): Promise<string[]>;
  /** Native "open folders" dialog; [] when cancelled. */
  pickFolders(): Promise<string[]>;
  /** Native "choose output folder" dialog; null when cancelled. */
  pickOutputDir(): Promise<string | null>;
  /** Path of a dropped file or folder (drag & drop). */
  pathForFile(file: File): string;
  /** Reveals a file this app produced in the system file manager. */
  showOutput(path: string): Promise<void>;
  /** Queues conversions; resolves with the job ids in request order. */
  startConversion(requests: ConvertRequest[]): Promise<string[]>;
  /** Cancels one job, or all jobs when no id is given. */
  cancelConversion(jobId?: string): Promise<void>;
  /** Subscribes to conversion events; returns an unsubscribe function. */
  onConversionEvent(listener: (event: ConversionEvent) => void): () => void;
}
