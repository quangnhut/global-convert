import { join } from 'node:path';
import { app, BrowserWindow, shell } from 'electron';
import icon from '../../resources/icon.png?asset';
import { EngineClient } from './engine-client';
import { registerIpc } from './ipc/register';

const engine = new EngineClient(join(__dirname, 'engine.js'));

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 760,
    minHeight: 520,
    title: 'GlobalConvert',
    show: false,
    // Packaged Windows/macOS builds use the executable's icon; this covers Linux and dev.
    ...(process.platform !== 'darwin' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  // No in-app navigation and no new windows; open http(s) links in the system browser.
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}

app.whenReady().then(() => {
  // macOS dev: show the logo in the Dock (packaged builds use the .icns from build/icon.png).
  if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(icon);

  const queue = registerIpc(engine);
  app.on('before-quit', () => {
    queue.cancelAll();
    engine.stop();
  });

  createMainWindow();
  // Start the engine early so the first conversion doesn't wait for it.
  engine.converters().catch((err: unknown) => console.error('[engine]', err));
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
