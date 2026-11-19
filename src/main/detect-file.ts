import { open, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { detectFormat, DETECT_HEAD_BYTES } from '@shared/detect';
import type { DetectedFile } from '@shared/ipc';

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
