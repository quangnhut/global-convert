import { isAbsolute } from 'node:path';
import type { OptionValues } from '@shared/converter';
import { isFormatId } from '@shared/formats';
import { MAX_FILES_PER_REQUEST, type ConvertRequest } from '@shared/ipc';

/** Thrown for malformed IPC payloads (a bug or a compromised renderer, not user error). */
export class IpcValidationError extends Error {
  override name = 'IpcValidationError';
}

const fail = (msg: string): never => {
  throw new IpcValidationError(msg);
};

function absolutePath(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 4096 ||
    value.includes('\0')
  ) {
    fail(`${field} must be a non-empty path`);
  }
  if (!isAbsolute(value as string)) fail(`${field} must be an absolute path`);
  return value as string;
}

function list(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) return fail(`${field} must be an array`);
  if (value.length > MAX_FILES_PER_REQUEST)
    fail(`${field} has more than ${MAX_FILES_PER_REQUEST} items`);
  return value;
}

export function validatePaths(value: unknown): string[] {
  return list(value, 'paths').map((p, i) => absolutePath(p, `paths[${i}]`));
}

function optionValues(value: unknown, field: string): OptionValues {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${field} must be an object`);
  const out: OptionValues = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v !== 'number' && typeof v !== 'string' && typeof v !== 'boolean') {
      fail(`${field}.${k} must be a number, string or boolean`);
    }
    out[k] = v as OptionValues[string];
  }
  return out;
}

/** Shape-only validation; file-system checks happen in the handler. */
export function validateConvertRequests(value: unknown): ConvertRequest[] {
  return list(value, 'requests').map((item, i) => {
    const field = `requests[${i}]`;
    if (!item || typeof item !== 'object') return fail(`${field} must be an object`);
    const r = item as Record<string, unknown>;
    if (!isFormatId(r.from)) fail(`${field}.from is not a known format`);
    if (!isFormatId(r.to)) fail(`${field}.to is not a known format`);
    return {
      inputPath: absolutePath(r.inputPath, `${field}.inputPath`),
      outputDir: absolutePath(r.outputDir, `${field}.outputDir`),
      from: r.from as ConvertRequest['from'],
      to: r.to as ConvertRequest['to'],
      options: optionValues(r.options, `${field}.options`),
    };
  });
}

export function validateJobId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0 || value.length > 100)
    fail('jobId must be a string');
  return value as string;
}
