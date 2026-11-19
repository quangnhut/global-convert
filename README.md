# GlobalConvert

Offline desktop app (Electron + React + TypeScript) that converts images and documents
between formats.

## First-time setup (after cloning)

### Prerequisites

- **Git**
- **Node.js 22 LTS or newer** (with npm). Check with:

  ```bash
  node -v
  npm -v
  ```

### 1. Clone the source

```bash
git clone https://github.com/quangnhut/global-convert.git
cd global-convert
```

### 2. Install dependencies

Use `npm ci` so the exact versions from `package-lock.json` are installed:

```bash
npm ci
```

### 3. Download the Electron binary

Newer npm versions (12+) don't run dependency install scripts by default, so Electron's
binary never gets downloaded. Run its installer once yourself. This is safe to run on any
npm version:

```bash
node node_modules/electron/install.js
```

### 4. Verify the project (type check, lint, tests)

```bash
npm run typecheck
npm run lint
npm test
```

### 5. Build

```bash
npm run build
```

The compiled app goes to `out/` (`out/main`, `out/preload`, `out/renderer`).

### 6. Run the app

Run the production build:

```bash
npm run preview
```

Or, during development, run it with hot reload:

```bash
npm run dev
```

> **Running from a VS Code terminal?** VS Code may set `ELECTRON_RUN_AS_NODE=1`. Electron
> then starts as plain Node and fails with
> `The requested module 'electron' does not provide an export named 'BrowserWindow'`.
> Unset it first:
>
> ```bash
> unset ELECTRON_RUN_AS_NODE
> ```

## Quick reference

All of the above, in order:

```bash
git clone https://github.com/quangnhut/global-convert.git
cd global-convert
npm ci
node node_modules/electron/install.js
npm run typecheck && npm run lint && npm test
npm run build
npm run preview
```

## Other scripts

| Command                | What it does                                      |
| ---------------------- | ------------------------------------------------- |
| `npm run test:watch`   | Run tests in watch mode                           |
| `npm run format`       | Format all files with Prettier                    |
| `npm run format:check` | Check formatting without changing files           |
| `npm run icons`        | Regenerate app icons from `build/logo-source.png` |
| `npm run fixtures`     | Regenerate the sample files in `tests/fixtures/`  |

The generated icons and test fixtures are committed, so you don't need to run `icons` or
`fixtures` on a fresh clone.
