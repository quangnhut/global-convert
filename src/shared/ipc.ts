/** IPC channel names shared by main and preload. Types only — no Node/Electron imports. */
export const IPC = {
  appVersion: 'app:version',
} as const;

/** The API the preload script exposes on `window.api`. */
export interface RendererApi {
  getAppVersion(): Promise<string>;
}
