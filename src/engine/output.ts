import { open } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

const MAX_ATTEMPTS = 10_000;

/** File name of `inputPath` without its extension. */
export function baseNameOf(inputPath: string): string {
  const name = basename(inputPath);
  const ext = extname(name);
  return ext && ext !== name ? name.slice(0, -ext.length) : name;
}

/**
 * Atomically creates an empty, unique file `<base><suffix>.<ext>` in `dir`
 * (or `<base><suffix> (n).<ext>` if taken) and returns its path. Never overwrites.
 */
export async function reserveOutputPath(
  dir: string,
  base: string,
  ext: string,
  suffix = '',
): Promise<string> {
  for (let n = 0; n < MAX_ATTEMPTS; n++) {
    const name = n === 0 ? `${base}${suffix}.${ext}` : `${base}${suffix} (${n}).${ext}`;
    const path = join(dir, name);
    try {
      const handle = await open(path, 'wx');
      await handle.close();
      return path;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
  throw new Error(`Could not find a free file name for "${base}${suffix}.${ext}" in ${dir}`);
}
