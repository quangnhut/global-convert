import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  IpcValidationError,
  validateConvertRequests,
  validateJobId,
  validatePath,
  validatePaths,
} from '../src/main/ipc/validate';

const abs = resolve('some', 'file.png');
const absDir = resolve('out');
const good = { inputPath: abs, outputDir: absDir, from: 'png', to: 'webp', options: { q: 80 } };

describe('IPC validation', () => {
  it('accepts absolute paths and rejects others', () => {
    expect(validatePaths([abs])).toEqual([abs]);
    expect(() => validatePaths(['relative/file.png'])).toThrow(IpcValidationError);
    expect(() => validatePaths([''])).toThrow(IpcValidationError);
    expect(() => validatePaths([`${abs}\0.exe`])).toThrow(IpcValidationError);
    expect(() => validatePaths('not-an-array')).toThrow(IpcValidationError);
    expect(() => validatePaths(Array(5001).fill(abs))).toThrow(/more than/);
  });

  it('accepts a valid convert request', () => {
    expect(validateConvertRequests([good])).toEqual([good]);
    expect(validateConvertRequests([{ ...good, options: undefined }])[0]?.options).toEqual({});
  });

  it('outputDir may be null (= next to the input file)', () => {
    expect(validateConvertRequests([{ ...good, outputDir: null }])[0]?.outputDir).toBeNull();
  });

  it('validatePath accepts one absolute path', () => {
    expect(validatePath(abs)).toBe(abs);
    expect(() => validatePath('rel.png')).toThrow(IpcValidationError);
    expect(() => validatePath(undefined)).toThrow(IpcValidationError);
  });

  it.each([
    [{ ...good, from: 'heic' }, /from is not a known format/],
    [{ ...good, to: 'exe' }, /to is not a known format/],
    [{ ...good, inputPath: 'x.png' }, /absolute/],
    [{ ...good, outputDir: 42 }, /non-empty path/],
    [{ ...good, options: [] }, /must be an object/],
    [{ ...good, options: { q: { nested: true } } }, /number, string or boolean/],
    [null, /must be an object/],
  ])('rejects %o', (request, message) => {
    expect(() => validateConvertRequests([request])).toThrow(message);
  });

  it('job id is optional string', () => {
    expect(validateJobId(undefined)).toBeUndefined();
    expect(validateJobId('abc')).toBe('abc');
    expect(() => validateJobId(5)).toThrow(IpcValidationError);
  });
});
