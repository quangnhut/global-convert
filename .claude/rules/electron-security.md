---
paths:
  - "src/main/**"
  - "src/preload/**"
---

# Electron security rules

- Every `BrowserWindow`: `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`, `webSecurity: true`. Hidden PDF-render windows too.
- Never load remote URLs. Set a strict CSP on the renderer HTML.
- Block navigation and `window.open` (`will-navigate`, `setWindowOpenHandler` → deny).
- Preload exposes named functions only — never `ipcRenderer` itself or generic `invoke(channel)`.
- Validate every IPC payload in main (types, paths exist, are files, allowed formats).
- File paths reach main only from a dialog or drag-and-drop; never build paths from
  untrusted strings without `path.resolve` + checks.
- `shell.openPath` / `showItemInFolder` only for paths the app itself produced.
