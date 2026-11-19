import type { ConverterInfo, ConvertJob } from './converter';

/** Messages main → engine (utilityProcess). */
export type MainToEngine = { type: 'convert'; job: ConvertJob } | { type: 'cancel'; jobId: string };

/** Messages engine → main. */
export type EngineToMain =
  | { type: 'ready'; converters: ConverterInfo[] }
  | { type: 'progress'; jobId: string; ratio: number }
  | { type: 'done'; jobId: string; outputs: string[] }
  | { type: 'failed'; jobId: string; message: string }
  | { type: 'cancelled'; jobId: string };
