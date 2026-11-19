import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type RendererApi } from '@shared/ipc';

// Expose named functions only — never ipcRenderer itself.
const api: RendererApi = {
  getAppVersion: () => ipcRenderer.invoke(IPC.appVersion) as Promise<string>,
};

contextBridge.exposeInMainWorld('api', api);
