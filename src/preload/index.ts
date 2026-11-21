import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import type { ConverterInfo } from '@shared/converter';
import { IPC, type ConversionEvent, type DetectedFile, type RendererApi } from '@shared/ipc';

// Expose named functions only — never ipcRenderer itself.
const api: RendererApi = {
  getAppVersion: () => ipcRenderer.invoke(IPC.appVersion) as Promise<string>,
  getConverters: () => ipcRenderer.invoke(IPC.converters) as Promise<ConverterInfo[]>,
  detectFiles: (paths) => ipcRenderer.invoke(IPC.detectFiles, paths) as Promise<DetectedFile[]>,
  pickFiles: () => ipcRenderer.invoke(IPC.pickFiles) as Promise<string[]>,
  pickFolders: () => ipcRenderer.invoke(IPC.pickFolders) as Promise<string[]>,
  pickOutputDir: () => ipcRenderer.invoke(IPC.pickOutputDir) as Promise<string | null>,
  pathForFile: (file) => webUtils.getPathForFile(file),
  showOutput: (path) => ipcRenderer.invoke(IPC.showOutput, path) as Promise<void>,
  startConversion: (requests) =>
    ipcRenderer.invoke(IPC.convertStart, requests) as Promise<string[]>,
  cancelConversion: (jobId) => ipcRenderer.invoke(IPC.convertCancel, jobId) as Promise<void>,
  onConversionEvent: (listener) => {
    const handler = (_e: IpcRendererEvent, event: ConversionEvent) => listener(event);
    ipcRenderer.on(IPC.convertEvent, handler);
    return () => ipcRenderer.removeListener(IPC.convertEvent, handler);
  },
};

contextBridge.exposeInMainWorld('api', api);
