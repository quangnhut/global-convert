import type { FormatFamily, FormatId } from './formats';

/** One field in a converter's Options panel. The UI renders these generically. */
export type OptionField =
  | { key: string; label: string; type: 'number'; min: number; max: number; step?: number }
  | {
      key: string;
      label: string;
      type: 'select';
      choices: readonly { value: string; label: string }[];
    }
  | { key: string; label: string; type: 'boolean' };

export type OptionValue = number | string | boolean;
export type OptionValues = Record<string, OptionValue>;

/** Serializable description of a converter (sent from engine → main → renderer). */
export interface ConverterInfo {
  id: string;
  family: FormatFamily;
  from: readonly FormatId[];
  to: readonly FormatId[];
  optionsSchema: readonly OptionField[];
  defaults: OptionValues;
  /** Shown in the UI when the result is lossy or approximate. */
  notes?: string;
}

export interface ConvertJob<O extends OptionValues = OptionValues> {
  id: string;
  inputPath: string;
  from: FormatId;
  to: FormatId;
  outputDir: string;
  options: O;
}

export interface ConvertContext {
  /** Aborted when the user cancels. Check it between pages/frames. */
  signal: AbortSignal;
  /** Report progress, 0..1. */
  progress(ratio: number): void;
  /** Per-job scratch directory; deleted after the job. */
  tmpDir: string;
  /**
   * Atomically creates a new, empty, uniquely named output file in the job's output
   * directory and returns its path: `<name><suffix>.<ext>`, or `<name><suffix> (1).<ext>`
   * if taken. Every reserved path is reported as an output, and removed on failure/cancel.
   */
  reserveOutput(suffix?: string): Promise<string>;
  /**
   * Prints a self-contained HTML document to PDF with Chromium (runs in main, in a hidden
   * window with scripts and network disabled; only `data:` resources load).
   */
  renderHtmlToPdf(html: string, options: PdfPrintOptions): Promise<Uint8Array>;
}

export interface PdfPrintOptions {
  pageSize: 'A4' | 'Letter';
  marginMm: number;
}

export interface Converter<O extends OptionValues = OptionValues> extends ConverterInfo {
  defaults: O;
  convert(job: ConvertJob<O>, ctx: ConvertContext): Promise<void>;
}

export interface ConvertResult {
  outputs: string[];
}

/** An error whose message is safe and useful to show to the user. */
export class ConvertError extends Error {
  override name = 'ConvertError';
}
