import { pathToFileURL } from 'node:url';
import { BrowserWindow, session, type Session } from 'electron';
import type { PdfPrintOptions } from '@shared/converter';
import { isEngineHtmlPath } from './engine-html-path';

/** In-memory session (no `persist:` prefix) used only for printing. */
const PARTITION = 'pdf-render';
const TIMEOUT_MS = 60_000;
/** file:// URLs currently being printed; every other non-data: request is blocked. */
const allowedUrls = new Set<string>();
let renderSession: Session | undefined;

function getSession(): Session {
  if (renderSession) return renderSession;
  const ses = session.fromPartition(PARTITION);
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !(details.url.startsWith('data:') || allowedUrls.has(details.url)) });
  });
  renderSession = ses;
  return ses;
}

/** Prints a local HTML file to PDF in a hidden, locked-down window. */
export async function renderHtmlFileToPdf(
  htmlPath: string,
  { pageSize, marginMm }: PdfPrintOptions,
): Promise<Uint8Array> {
  if (!isEngineHtmlPath(htmlPath))
    throw new Error('Refusing to print a file outside the engine temp dir');
  const url = pathToFileURL(htmlPath).href;
  allowedUrls.add(url);
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      session: getSession(),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      javascript: false,
    },
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  let timer: NodeJS.Timeout | undefined;
  try {
    const margin = marginMm / 25.4; // printToPDF wants inches
    const print = (async () => {
      await win.loadURL(url);
      return win.webContents.printToPDF({
        pageSize,
        printBackground: true,
        margins: { top: margin, bottom: margin, left: margin, right: margin },
      });
    })();
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timed out')), TIMEOUT_MS);
    });
    return new Uint8Array(await Promise.race([print, timeout]));
  } finally {
    clearTimeout(timer);
    allowedUrls.delete(url);
    win.destroy();
  }
}
