import type { ConverterInfo, ConvertJob, PdfPrintOptions } from './converter';

/** Messages main → engine (utilityProcess). */
export type MainToEngine =
  | { type: 'convert'; job: ConvertJob }
  | { type: 'cancel'; jobId: string }
  /** Answer to `render-pdf`: exactly one of `pdf` / `error` is set. */
  | { type: 'render-pdf-result'; requestId: string; pdf?: Uint8Array; error?: string };

/** Messages engine → main. */
export type EngineToMain =
  | { type: 'ready'; converters: ConverterInfo[] }
  | { type: 'progress'; jobId: string; ratio: number }
  | { type: 'done'; jobId: string; outputs: string[] }
  | { type: 'failed'; jobId: string; message: string }
  | { type: 'cancelled'; jobId: string }
  /** Ask main to print the HTML file (inside the job's temp dir) to PDF. */
  | { type: 'render-pdf'; requestId: string; htmlPath: string; options: PdfPrintOptions };
