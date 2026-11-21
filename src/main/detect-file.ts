import { open, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { detectFormat, DETECT_HEAD_BYTES } from '@shared/detect';
import { MAX_FILES_PER_REQUEST, type DetectedFile } from '@shared/ipc';

/** Reads the head of a file and detects its format. Never throws. */
export async function detectFile(path: string): Promise<DetectedFile> {
  const name = basename(path);
  try {
    const info = await stat(path);
    if (!info.isFile()) return { path, name, size: 0, format: null, error: 'Not a file' };

    const handle = await open(path, 'r');
    try {
      const head = new Uint8Array(Math.min(DETECT_HEAD_BYTES, info.size));
      await handle.read(head, 0, head.length, 0);
      const detection = detectFormat(head, name);
      return {
        path,
        name,
        size: info.size,
        format: detection?.format ?? null,
        ...(detection ? {} : { error: 'Unsupported file type' }),
      };
    } finally {
      await handle.close();
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const error =
      code === 'ENOENT'
        ? 'File not found'
        : code === 'EACCES'
          ? 'Access denied'
          : 'Cannot read file';
    return { path, name, size: 0, format: null, error };
  }
}

/** Files under `dir`, depth-first in name order. Skips hidden entries and symlinks (no loops). */
async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // unreadable folder: skip it
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}

/**
 * Detects files and the contents of folders (recursively). A path given directly is always
 * reported (with an error if unusable); files found inside folders are reported only if
 * their format is supported. Stops after `limit` results.
 */
export async function detectPaths(
  paths: readonly string[],
  limit = MAX_FILES_PER_REQUEST,
): Promise<DetectedFile[]> {
  const results: DetectedFile[] = [];
  for (const path of paths) {
    if (results.length >= limit) break;
    const info = await stat(path).catch(() => null);
    if (!info?.isDirectory()) {
      results.push(await detectFile(path));
      continue;
    }
    for await (const file of walk(path)) {
      if (results.length >= limit) break;
      const detected = await detectFile(file);
      if (detected.format) results.push(detected);
    }
  }
  return results;
}
