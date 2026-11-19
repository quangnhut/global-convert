import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, isAbsolute, resolve } from 'node:path';

/**
 * True for `<tmp>/globalconvert-*\/*.html` — the only files the engine may ask us to print
 * (it writes them into its per-job temp dir).
 */
export function isEngineHtmlPath(path: string, tmpRoot = tmpdir()): boolean {
  if (!isAbsolute(path) || resolve(path) !== path || extname(path) !== '.html') return false;
  const jobDir = dirname(path);
  const roots = new Set([resolve(tmpRoot)]);
  try {
    roots.add(realpathSync(tmpRoot));
  } catch {
    // tmp root missing: only the literal path can match
  }
  return roots.has(dirname(jobDir)) && basename(jobDir).startsWith('globalconvert-');
}
