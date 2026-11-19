import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ConvertError } from '@shared/converter';

const TIMEOUT_MS = 180_000;

/** Path to LibreOffice's `soffice` if it is installed, else undefined. Never required. */
export function findSoffice(): string | undefined {
  const exe = process.platform === 'win32' ? 'soffice.exe' : 'soffice';
  const candidates =
    process.platform === 'win32'
      ? [process.env['ProgramFiles'], process.env['ProgramFiles(x86)']]
          .filter((dir): dir is string => Boolean(dir))
          .map((dir) => join(dir, 'LibreOffice', 'program', exe))
      : process.platform === 'darwin'
        ? ['/Applications/LibreOffice.app/Contents/MacOS/soffice']
        : [
            '/usr/bin/soffice',
            '/usr/local/bin/soffice',
            '/opt/libreoffice/program/soffice',
            '/snap/bin/libreoffice',
          ];
  const onPath = (process.env['PATH'] ?? '')
    .split(delimiter)
    .filter(Boolean)
    .map((dir) => join(dir, exe));
  return [...candidates, ...onPath].find((path) => existsSync(path));
}

export interface SofficeConvert {
  /** `--convert-to` argument, e.g. `pdf` or `docx:MS Word 2007 XML`. */
  convertTo: string;
  /** Optional `--infilter`, e.g. `writer_pdf_import`. */
  inFilter?: string;
}

/**
 * Converts `inputPath` with headless LibreOffice into a fresh folder under `tmpDir` and
 * returns the produced file. Uses a private profile so a running LibreOffice doesn't block it.
 */
export async function sofficeConvert(
  soffice: string,
  inputPath: string,
  { convertTo, inFilter }: SofficeConvert,
  tmpDir: string,
  signal: AbortSignal,
): Promise<string> {
  const outDir = join(tmpDir, 'soffice-out');
  await mkdir(outDir, { recursive: true });
  const args = [
    '--headless',
    '--norestore',
    '--nolockcheck',
    '--nologo',
    '--nodefault',
    `-env:UserInstallation=${pathToFileURL(join(tmpDir, 'soffice-profile')).href}`,
    ...(inFilter ? [`--infilter=${inFilter}`] : []),
    '--convert-to',
    convertTo,
    '--outdir',
    outDir,
    inputPath,
  ];
  const stderr = await new Promise<string>((resolve, reject) => {
    execFile(
      soffice,
      args,
      { signal, timeout: TIMEOUT_MS, windowsHide: true },
      (err, _out, errText) => {
        if (err) reject(err);
        else resolve(String(errText));
      },
    );
  }).catch((err: unknown) => {
    signal.throwIfAborted();
    const killed = err instanceof Error && 'killed' in err && err.killed;
    throw new ConvertError(
      killed
        ? 'LibreOffice took too long and was stopped.'
        : 'LibreOffice could not convert this file.',
    );
  });

  const [produced] = await readdir(outDir);
  if (!produced) {
    const detail = stderr.trim().split('\n').at(-1);
    throw new ConvertError(`LibreOffice produced no output${detail ? `: ${detail}` : '.'}`);
  }
  return join(outDir, produced);
}
