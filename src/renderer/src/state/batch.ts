// Pure batch state helpers (no React, no DOM) — unit-tested in tests/batch.test.ts.
import { pickConverter, targetsFor } from '@shared/capabilities';
import type { ConverterInfo, OptionValues } from '@shared/converter';
import type { FormatId } from '@shared/formats';
import type { ConversionEvent, ConvertRequest, DetectedFile } from '@shared/ipc';

export type JobState =
  | { jobId: string; status: 'queued' | 'running'; ratio: number }
  | { jobId: string; status: 'done'; outputs: string[] }
  | { jobId: string; status: 'failed'; message: string }
  | { jobId: string; status: 'cancelled' };

export interface Row extends DetectedFile {
  /** Per-file target; null = use the batch target. */
  target: FormatId | null;
  /** State of the latest conversion of this row, if any. */
  job?: JobState;
  /** What the latest conversion asked for (to detect changed settings). */
  lastRequest?: ConvertRequest;
}

/** Appends new files; a path already in the list is not added twice. */
export function addFiles(rows: readonly Row[], files: readonly DetectedFile[]): Row[] {
  const known = new Set(rows.map((r) => r.path));
  const added: Row[] = [];
  for (const file of files) {
    if (known.has(file.path)) continue;
    known.add(file.path);
    added.push({ ...file, target: null });
  }
  return [...rows, ...added];
}

/** The row's format, if it can be converted at all. */
export function formatOf(row: Row): FormatId | null {
  return row.error ? null : row.format;
}

export const isActive = (row: Row) => row.job?.status === 'queued' || row.job?.status === 'running';

/** Targets offered for every convertible row that follows the batch target (no override). */
export function commonTargets(
  converters: readonly ConverterInfo[],
  rows: readonly Row[],
): FormatId[] {
  let common: FormatId[] | undefined;
  for (const row of rows) {
    const format = formatOf(row);
    if (!format || row.target) continue;
    const targets = targetsFor(converters, format);
    common = common ? common.filter((t) => targets.includes(t)) : targets;
  }
  return common ?? [];
}

/** Where this row converts to: its override, else the batch target if reachable. */
export function targetOf(
  converters: readonly ConverterInfo[],
  row: Row,
  batchTarget: FormatId | null,
): FormatId | null {
  const format = formatOf(row);
  if (!format) return null;
  if (row.target) return row.target;
  return batchTarget && targetsFor(converters, format).includes(batchTarget) ? batchTarget : null;
}

/** One converter in use by the batch, with the from → to pairs it will handle. */
export interface ConverterUse {
  converter: ConverterInfo;
  pairs: { from: FormatId; to: FormatId }[];
}

/** Converters the batch will use (in first-use order), for the Options panel. */
export function convertersInUse(
  converters: readonly ConverterInfo[],
  rows: readonly Row[],
  batchTarget: FormatId | null,
): ConverterUse[] {
  const uses = new Map<string, ConverterUse>();
  for (const row of rows) {
    const from = formatOf(row);
    const to = targetOf(converters, row, batchTarget);
    if (!from || !to) continue;
    const converter = pickConverter(converters, from, to);
    if (!converter) continue;
    const use = uses.get(converter.id) ?? { converter, pairs: [] };
    if (!use.pairs.some((p) => p.from === from && p.to === to)) use.pairs.push({ from, to });
    uses.set(converter.id, use);
  }
  return [...uses.values()];
}

/** The request this row would send now, or null if it has no target. */
export function requestFor(
  converters: readonly ConverterInfo[],
  row: Row,
  batchTarget: FormatId | null,
  options: Readonly<Record<string, OptionValues>>,
  outputDir: string | null,
): ConvertRequest | null {
  const from = formatOf(row);
  const to = targetOf(converters, row, batchTarget);
  const converter = from && to ? pickConverter(converters, from, to) : undefined;
  if (!from || !to || !converter) return null;
  return { inputPath: row.path, from, to, outputDir, options: options[converter.id] ?? {} };
}

function sameRequest(a: ConvertRequest, b: ConvertRequest): boolean {
  const keys = new Set([...Object.keys(a.options), ...Object.keys(b.options)]);
  return (
    a.to === b.to &&
    a.outputDir === b.outputDir &&
    [...keys].every((k) => a.options[k] === b.options[k])
  );
}

/**
 * Requests for rows that need converting now: not running, and not already converted
 * successfully with exactly these settings. Failed/cancelled rows are retried.
 */
export function buildRequests(
  converters: readonly ConverterInfo[],
  rows: readonly Row[],
  batchTarget: FormatId | null,
  options: Readonly<Record<string, OptionValues>>,
  outputDir: string | null,
): ConvertRequest[] {
  const requests: ConvertRequest[] = [];
  for (const row of rows) {
    if (isActive(row)) continue;
    const request = requestFor(converters, row, batchTarget, options, outputDir);
    if (!request) continue;
    if (row.job?.status === 'done' && row.lastRequest && sameRequest(row.lastRequest, request)) {
      continue;
    }
    requests.push(request);
  }
  return requests;
}

/** Applies a main → renderer conversion event to the row that owns the job. */
export function applyEvent(rows: readonly Row[], event: ConversionEvent): Row[] {
  const index = rows.findIndex((r) => r.job?.jobId === event.jobId);
  if (index < 0) return rows as Row[];
  const { jobId } = event;
  let job: JobState;
  switch (event.status) {
    case 'queued':
      job = { jobId, status: 'queued', ratio: 0 };
      break;
    case 'running':
      job = { jobId, status: 'running', ratio: 0 };
      break;
    case 'progress':
      job = { jobId, status: 'running', ratio: event.ratio };
      break;
    case 'done':
      job = { jobId, status: 'done', outputs: event.outputs };
      break;
    case 'failed':
      job = { jobId, status: 'failed', message: event.message };
      break;
    case 'cancelled':
      job = { jobId, status: 'cancelled' };
      break;
  }
  const next = [...rows];
  next[index] = { ...rows[index]!, job };
  return next;
}

/** Marks rows as queued with the job ids main assigned (same order as the requests). */
export function assignJobs(
  rows: readonly Row[],
  requests: readonly ConvertRequest[],
  jobIds: readonly string[],
): Row[] {
  const byPath = new Map(requests.map((r, i) => [r.inputPath, { request: r, jobId: jobIds[i]! }]));
  return rows.map((r) => {
    const started = byPath.get(r.path);
    if (!started) return r;
    return {
      ...r,
      job: { jobId: started.jobId, status: 'queued', ratio: 0 },
      lastRequest: started.request,
    };
  });
}

export interface Summary {
  total: number;
  active: number;
  done: number;
  failed: number;
  cancelled: number;
}

export function summarize(rows: readonly Row[]): Summary {
  const s: Summary = { total: rows.length, active: 0, done: 0, failed: 0, cancelled: 0 };
  for (const r of rows) {
    if (isActive(r)) s.active++;
    else if (r.job?.status === 'done') s.done++;
    else if (r.job?.status === 'failed') s.failed++;
    else if (r.job?.status === 'cancelled') s.cancelled++;
  }
  return s;
}

/** Each converter's defaults, keyed by converter id. */
export function defaultOptions(converters: readonly ConverterInfo[]): Record<string, OptionValues> {
  return Object.fromEntries(converters.map((c) => [c.id, { ...c.defaults }]));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
