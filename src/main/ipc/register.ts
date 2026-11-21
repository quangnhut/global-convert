import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { dirname } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import { pickConverter } from '@shared/capabilities';
import type { ConvertJob, ConvertResult } from '@shared/converter';
import { FORMATS } from '@shared/formats';
import { IPC, type ConversionEvent } from '@shared/ipc';
import { detectPaths } from '../detect-file';
import type { EngineClient } from '../engine-client';
import { JobQueue, type JobEvent } from '../queue/job-queue';
import { validateConvertRequests, validateJobId, validatePath, validatePaths } from './validate';

/** sharp/libvips already uses several threads per job, so keep job concurrency modest. */
const CONCURRENCY = Math.min(4, Math.max(1, availableParallelism() - 1));

function broadcast(event: ConversionEvent): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(IPC.convertEvent, event);
}

function toConversionEvent(event: JobEvent<ConvertResult>): ConversionEvent {
  return event.status === 'done'
    ? { jobId: event.jobId, status: 'done', outputs: event.result.outputs }
    : event;
}

/** Shows a native open dialog attached to the requesting window. */
async function openDialog(
  event: IpcMainInvokeEvent,
  options: Electron.OpenDialogOptions,
): Promise<string[]> {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? [] : result.filePaths;
}

export function registerIpc(engine: EngineClient): JobQueue<ConvertJob, ConvertResult> {
  /** Files this app wrote; only these may be revealed in the file manager. */
  const produced = new Set<string>();
  const queue = new JobQueue<ConvertJob, ConvertResult>((job, ctx) => engine.convert(job, ctx), {
    concurrency: CONCURRENCY,
    onEvent: (e) => {
      if (e.status === 'done') e.result.outputs.forEach((p) => produced.add(p));
      broadcast(toConversionEvent(e));
    },
  });

  ipcMain.handle(IPC.appVersion, () => app.getVersion());

  ipcMain.handle(IPC.converters, () => engine.converters());

  ipcMain.handle(IPC.detectFiles, (_e, paths: unknown) => detectPaths(validatePaths(paths)));

  ipcMain.handle(IPC.pickFiles, (e) =>
    openDialog(e, { properties: ['openFile', 'multiSelections'] }),
  );

  ipcMain.handle(IPC.pickFolders, (e) =>
    openDialog(e, { properties: ['openDirectory', 'multiSelections'] }),
  );

  ipcMain.handle(IPC.pickOutputDir, async (e) => {
    const [dir] = await openDialog(e, {
      title: 'Choose output folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    return dir ?? null;
  });

  ipcMain.handle(IPC.showOutput, (_e, path: unknown) => {
    const file = validatePath(path);
    if (!produced.has(file)) throw new Error('Not a file produced by this app');
    shell.showItemInFolder(file);
  });

  ipcMain.handle(IPC.convertStart, async (_e, payload: unknown) => {
    const requests = validateConvertRequests(payload);
    const converters = await engine.converters();

    // Validate everything before queueing anything, so a batch is all-or-nothing.
    const jobs: ConvertJob[] = [];
    for (const r of requests) {
      if (!pickConverter(converters, r.from, r.to)) {
        throw new Error(`${FORMATS[r.from].label} → ${FORMATS[r.to].label} is not supported`);
      }
      const outputDir = r.outputDir ?? dirname(r.inputPath);
      const [input, outDir] = await Promise.all([
        stat(r.inputPath).catch(() => null),
        stat(outputDir).catch(() => null),
      ]);
      if (!input?.isFile()) throw new Error(`Input file not found: ${r.inputPath}`);
      if (!outDir?.isDirectory()) throw new Error(`Output folder not found: ${outputDir}`);
      jobs.push({ id: randomUUID(), ...r, outputDir });
    }
    jobs.forEach((job) => queue.add(job));
    return jobs.map((j) => j.id);
  });

  ipcMain.handle(IPC.convertCancel, (_e, jobId: unknown) => {
    const id = validateJobId(jobId);
    if (id) queue.cancel(id);
    else queue.cancelAll();
  });

  return queue;
}
