# Plan 01 — Image & Document Conversion (MVP)

| Field   | Value                                    |
| ------- | ---------------------------------------- |
| Status  | In progress — Phases 0–3 done, Phase 4 next |
| Created | 2026-11-19                               |
| Product | **GlobalConvert**                        |
| Targets | Windows, macOS, Linux                    |
| Scope   | Desktop app skeleton + image & document converters |
| Next    | `02-*` (e.g. audio/video via ffmpeg) — not started |

---

## 1. Goal

**GlobalConvert** — a desktop app for Windows, macOS and Linux where the user drops files, picks a
target format, and gets converted files written to an output folder. Works **offline**.
No uploads.

The architecture must let future plans add new converter families (audio, video,
archives, spreadsheets, ebooks…) **without touching the core or the UI** — only by
adding a converter module and registering it.

### Success criteria

- [ ] Drop 1..N files (mixed types) → app shows only valid target formats for each.
- [ ] Batch convert with per-file progress, cancel, and clear error messages.
- [ ] Every conversion in the matrix below (§4) has a passing automated test using a fixture.
- [ ] UI never freezes during a 50-file batch (conversion runs off the main thread).
- [ ] Installable builds that run on a clean machine: Windows (NSIS `.exe`),
      macOS (`.dmg`, x64 + arm64), Linux (`.AppImage` + `.deb`).

---

## 2. Stack (assumptions — confirm before Phase 1)

| Concern            | Choice                               | Why |
| ------------------ | ------------------------------------ | --- |
| Shell              | **Electron** + **electron-vite**     | Node ecosystem has the best conversion libs; one language end-to-end |
| Language           | **TypeScript** (strict)              | |
| UI                 | **React** + plain CSS modules        | Keep it simple; no UI framework until needed |
| Raster images      | **sharp** (libvips)                  | Fast, covers png/jpg/webp/avif/gif/tiff, reads SVG |
| ICO                | built-in writer (PNG entries), **decode-ico** (read, MIT) | sharp has no ICO support; writing PNG-entry ICOs is ~30 lines, no dep needed |
| DOCX read          | **mammoth**                          | docx → html / raw text |
| DOCX write         | **docx**                             | Generate .docx from text |
| PDF read           | **pdfjs-dist** + **@napi-rs/canvas** | Text extraction + page rendering (canvas = pdfjs's Node render target, prebuilt per OS) |
| Markdown           | **marked**                           | md → html / tokens |
| PDF write          | **pdf-lib** + Electron `webContents.printToPDF` | images→pdf, html→pdf without external deps |
| Tests              | **Vitest**                           | |
| Packaging          | **electron-builder** (NSIS / dmg / AppImage + deb) | One config for all three OSes |

**Alternative considered:** Tauri (Rust) — smaller binary, but conversion libraries
(docx, pdf) are weaker in Rust and we'd write two languages. Revisit only if binary size
becomes a real complaint.

**Optional high-fidelity engine:** if **LibreOffice** is installed, detect `soffice`
and offer it as a better docx→pdf engine. Never required; never bundled in Plan 01.

---

## 3. Architecture

```
┌──────────── Renderer (React, sandboxed) ────────────┐
│ DropZone → FileList → FormatPicker → Options → Run   │
└───────────────▲─────────────────────┬────────────────┘
                │ progress events     │ ipc: convert.start / cancel
┌───────────────┴──── Main process ───▼────────────────┐
│ IPC handlers (validated) · dialogs · settings        │
│ JobQueue (concurrency = cpus-1)                      │
└───────────────▲─────────────────────┬────────────────┘
                │ messages            │
┌───────────────┴── utilityProcess "engine" ───────────┐
│ ConverterRegistry ── converters/image/*              │
│                   └─ converters/document/*           │
└──────────────────────────────────────────────────────┘
```

- Heavy work runs in an Electron **utilityProcess**, never in main or renderer.
- `printToPDF` needs a `BrowserWindow`, so html→pdf converters request a hidden
  window from main via a small `ctx.renderHtmlToPdf()` service.

### 3.1 Converter contract (the extension point)

As implemented in Phase 1 (`src/shared/converter.ts`, `src/shared/formats.ts`):

```ts
// FORMAT_IDS in formats.ts — future plans extend this list
export type FormatId = 'png' | 'jpg' | 'webp' | 'avif' | 'gif' | 'tiff' | 'ico' | 'svg'
  | 'pdf' | 'docx' | 'txt' | 'html' | 'md';

export interface Converter<O extends OptionValues = OptionValues> extends ConverterInfo {
  id: string;                         // 'image.sharp-raster'
  family: 'image' | 'document';       // future: 'audio' | 'video' | ...
  from: readonly FormatId[];
  to: readonly FormatId[];
  optionsSchema: readonly OptionField[]; // number | select | boolean — drives the Options UI
  defaults: O;
  notes?: string;                     // shown when output is lossy/approximate
  convert(job: ConvertJob<O>, ctx: ConvertContext): Promise<void>;
}

export interface ConvertContext {
  signal: AbortSignal;                       // cancel
  progress(ratio: number): void;             // 0..1
  tmpDir: string;                            // per job, auto-deleted
  reserveOutput(suffix?: string): Promise<string>; // unique output path, never overwrites
}
```

- Outputs = every path the converter got from `reserveOutput` (multi-page → one call per
  page with a suffix like `-p1`). On failure/cancel the engine deletes them.
- Options are validated against `optionsSchema` (`resolveOptions`) before `convert` runs.
- `ctx.renderHtmlToPdf(html, { pageSize, marginMm })` (Phase 3): the engine writes the HTML
  into the job's temp dir and sends `render-pdf`; main validates the path
  (`<tmp>/globalconvert-*/*.html`), prints it in a hidden window (sandboxed, JavaScript off,
  private in-memory session that blocks every request except that file and `data:` URLs)
  and replies `render-pdf-result`. Generated HTML also carries a CSP that blocks scripts.

- `ConverterRegistry.targetsFor(format)` → list of reachable formats (UI uses this).
- `ConverterRegistry.pick(from, to)` → best converter (first registered wins; an
  explicit `priority` field can be added when two engines compete, e.g. LibreOffice).
- **Same-format pairs are never offered** (`from === to`), matching the matrix diagonal.
- **No automatic chaining** in Plan 01. If a pair isn't directly supported, it isn't
  offered. Chaining (graph path-finding) is a candidate for a later plan.

### 3.2 Folder layout

```
src/
  shared/          formats.ts, converter.ts, ipc.ts (types only, no Node imports)
  main/            index.ts, ipc/, queue/, windows/, services/pdf-render.ts
  engine/          index.ts (utilityProcess entry), registry.ts
    converters/
      image/       sharp-common.ts, sharp-raster.ts, ico-encode.ts, ico-decode.ts,
                   svg-wrap.ts, images-to-pdf.ts
      document/    txt.ts, md.ts, docx.ts, pdf.ts, pdf-to-docx.ts, pdf-layout.ts,
                   pdfjs.ts, docx-writer.ts, html-doc.ts, text-decode.ts, zip.ts
    libreoffice.ts (find + run soffice; optional)
  preload/         index.ts (contextBridge, typed API)
  renderer/        App.tsx, components/, hooks/, styles/
tests/
  fixtures/        one small sample per format
  converters/      <converter>.test.ts
```

---

## 4. Conversion matrix (Plan 01)

### Images

| From \ To          | png | jpg | webp | avif | gif | tiff | ico | svg¹ | pdf |
| ------------------ | :-: | :-: | :--: | :--: | :-: | :--: | :-: | :--: | :-: |
| png/jpg/webp/avif/tiff | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| gif (animated²)    | ✔ | ✔ | ✔ | ✔ | — | ✔ | ✔ | — | ✔ |
| svg                | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ |
| ico                | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | — | — |

¹ raster → svg = PNG **embedded** in an `<svg>` wrapper (not vectorization). Label it
honestly in the UI. True tracing (potrace) is out of scope.
² animated gif → webp keeps animation; → png/jpg/tiff/avif takes the first frame
(option: export all frames). sharp cannot write animated AVIF.

Image options: quality (1–100), resize (width/height/fit), strip metadata,
background colour (for transparency → jpg), ICO sizes (16/24/32/48/64/128/256),
SVG render density (DPI).

### Documents

| From \ To | pdf | docx | txt | html | png/jpg (per page) |
| --------- | :-: | :--: | :-: | :--: | :----------------: |
| docx      | ✔ (mammoth→html→printToPDF; LibreOffice if present) | — | ✔ | ✔ | — |
| pdf       | — | ✔³ | ✔ | — | ✔ |
| txt       | ✔ | ✔ | — | ✔ | — |
| md        | ✔ | ✔ | ✔ | ✔ | — |
| images    | ✔ (one page per image; merge deferred⁴) | — | — | — | — |

³ pdf → docx (built in, no external tools) offers two modes, picked in Options:
- **Editable** (default): pdfjs text items with positions/fonts → group into lines and
  paragraphs, infer headings from font size, bold/italic from font name, keep embedded
  images in reading order → write with `docx`. Good for text documents; complex
  layouts (multi-column, tables, forms) come out approximate.
- **Exact layout**: each page rendered to an image and placed full-page in the docx.
  Looks identical, but the text is not editable.
- If LibreOffice is detected, offer it as a third engine (`--infilter=writer_pdf_import`).
Scanned PDFs (no text layer) fall back to Exact layout; OCR is out of scope.

⁴ Merging several images into one PDF needs a multi-input job; the job contract has one
input file. Deferred to Phase 4 (queue/UI), where batches exist.

Document options: page size (A4/Letter), margins, font (txt/md → pdf/docx),
text encoding (txt input: auto-detect UTF-8/UTF-16/Windows-1252),
render DPI (pdf → image), page range.

**Known limitations to show in the UI:** docx→pdf via mammoth loses complex layout
(headers/footers, floating images, exact fonts). Suggest LibreOffice when detected as
missing and the user cares about fidelity.

---

## 5. Phases

Each phase ends in a working, testable state.

### Phase 0 — Scaffold ✅ Done 2026-11-19
1. electron-vite React-TS template, strict tsconfig, ESLint + Prettier, Vitest.
2. Secure window defaults (see `rules/electron-security.md`).
3. `npm run dev`, `npm test`, `npm run typecheck`, `npm run lint` all work.
- **verify:** app window opens; empty test suite passes; typecheck clean.

### Phase 1 — Core engine ✅ Done 2026-11-19
1. `shared/converter.ts`, `shared/formats.ts` (id, label, extensions, mime, family).
2. Engine utilityProcess + message protocol; `ConverterRegistry`.
3. `JobQueue` in main with concurrency, cancel (AbortSignal), per-job progress.
4. Format detection by **magic bytes** first, extension as fallback.
- **verify:** unit tests for registry (`targetsFor`, `pick`), queue (concurrency, cancel),
  detection (each fixture detected correctly, renamed file detected by content).
- **result:** 65 tests pass (detect, registry, options, queue, engine host, IPC validation).
  Also added: main IPC (`engine:converters`, `files:detect`, `convert:start/cancel`,
  `convert:event`) with payload validation; fixtures via `npm run fixtures`.
  Checked in the running app: engine process starts and reports in; detection and
  validation work over IPC. A full engine conversion round-trip in the real app is
  first exercised in Phase 2 (no converters registered yet).

### Phase 2 — Image converters
1. `sharp-raster` (png/jpg/webp/avif/gif/tiff, svg input, animation handling).
2. `ico` (read + write multi-size).
3. `svg-wrap`, `images-to-pdf` (pdf-lib).
- **verify:** one test per matrix cell: output exists, magic bytes match target,
  dimensions as expected. Animated gif → webp keeps frame count.
- **result:** ✅ Done 2026-11-20. 142 tests pass (77 new in `tests/converters/`, run through
  the real engine host + registry: all 61 image matrix cells plus options, animation,
  ICO sizes/BMP entries, corrupt input). Checked in a real Electron `utilityProcess`
  (built `out/main/engine.js`): gif→webp, png→ico, ico→png, svg→pdf, jpg→svg all succeed.
  Changes from the plan: ICO writer is built in (no png-to-ico); animated AVIF not
  possible with sharp (first frame); same-format pairs never offered; image merge → PDF
  deferred (⁴). Image options: quality, width/height/fit, background (jpg), strip
  metadata, frames (first/all), SVG density; ICO sizes; PDF page size (image/A4/Letter).

### Phase 3 — Document converters
1. `txt` (encoding detection; → pdf/docx/html).
2. `md` (marked → html; → pdf/docx/txt).
3. `docx` (mammoth → html/txt; → pdf via `ctx.renderHtmlToPdf`; optional LibreOffice engine).
4. `pdf` (pdfjs → txt; → png/jpg per page with DPI + page range).
5. `pdf-to-docx` (Editable + Exact layout modes, see §4 note ³).
- **verify:** tests per matrix cell; pdf→txt contains known fixture string;
  pdf→png produces N files for N pages; pdf→docx (Editable) contains the fixture's
  heading as a Heading style and its body text; pdf→docx (Exact) has N images for N pages.
- **result:** ✅ Done 2026-11-20. 189 tests pass (47 new: every document matrix cell, encodings,
  rich Markdown, zip-bomb guard, page ranges, Editable/Exact/scanned pdf→docx, layout units,
  render protocol incl. cancel, path check; LibreOffice tests run when `soffice` is installed).
  Checked end-to-end in real Electron (real `EngineClient` + hidden-window printing + built
  engine): txt/md/docx→pdf, docx→pdf via LibreOffice, docx→html, pdf→png/txt, pdf→docx
  (Editable + Exact), md→docx. Printed PDFs render UTF-8 (café, 日本語); generated .docx
  files reopen in LibreOffice with the right page count (Exact: no spill-over pages).
  Notes: LibreOffice engines appear in options only when `soffice` is found at engine
  start (docx→pdf defaults to it then; pdf→docx offers it as a third mode). Images in
  Markdown load only as `data:` URLs. Every docx input passes a ZIP-bomb check first.
  pdfjs needs a workaround in the utilityProcess (see Risks).

### Phase 4 — UI
1. DropZone (drag & drop + file picker + folder picker, recursive).
2. FileList with detected type, size, per-file target override.
3. FormatPicker shows intersection of targets for selected files.
4. OptionsPanel rendered from `optionsSchema`.
5. Output: same folder / chosen folder; name pattern `{name}.{ext}`; conflict =
   auto-suffix ` (1)`; never overwrite silently.
6. Progress list, cancel all, "open output folder", error details.
- **verify:** manual checklist in §7 passes; no renderer access to Node APIs.

### Phase 5 — Packaging
1. electron-builder config: Windows NSIS, macOS dmg (x64 + arm64), Linux AppImage + deb;
   `asarUnpack` for sharp native binaries.
2. GitHub Actions matrix (windows/macos/ubuntu runners) — sharp ships per-OS native
   binaries, so each OS must build on its own runner.
3. App icons: logo source is `build/logo-source.png`; `npm run icons` produces
   `build/icon.png` (1024², transparent), `resources/icon.png` (window icon) and
   `src/renderer/src/assets/logo.png`. electron-builder derives `.ico` / `.icns` from
   `build/icon.png` automatically.
4. Code signing: Windows certificate and Apple Developer ID + notarization are needed to
   avoid SmartScreen / Gatekeeper warnings. Unsigned builds are fine for testing; signing
   needs the user's certificates (decision before public release).
- **verify:** on each OS's clean machine/VM, install and convert png→webp, docx→pdf, pdf→docx.

---

## 6. Risks

| Risk | Mitigation |
| ---- | ---------- |
| sharp native binary missing in packaged app | `asarUnpack: ["**/node_modules/sharp/**", "**/node_modules/@img/**"]`; Phase 5 clean-machine test |
| docx→pdf fidelity complaints | Clear UI note + optional LibreOffice engine |
| Large PDFs (500+ pages) → memory | Render page-by-page, stream to disk, respect page range |
| Malicious files (zip bombs in docx, huge SVG) | Size limits, pixel limit (`sharp({ limitInputPixels })`), timeouts per job, engine process isolation |
| sharp under Electron on Linux prints many `GLib-GObject-CRITICAL` warnings (sharp warns `SharpElectronLinux`); output is still correct in testing | Phase 5: verify on clean Linux installs (AppImage + deb); follow sharp's "Electron and Linux" install notes if it misbehaves |
| pdfjs treats Electron's utilityProcess as a browser (`process.type === 'utility'`) and skips its Node setup | `pdfjs.ts` hides `process.type` while pdfjs loads and runs the worker in-thread; re-check on pdfjs upgrades (e2e run in Electron caught it, Node tests can't) |
| AGPL licences (e.g. mupdf, ghostscript) | Don't add AGPL deps without explicit decision |

---

## 7. Manual test checklist (Phase 4)

- [ ] Drop 20 mixed files → only common targets shown; per-file override works.
- [ ] Cancel mid-batch → remaining jobs stop, partial outputs cleaned up.
- [ ] Output name conflict → `photo (1).webp`, original untouched.
- [ ] Corrupt file → that row shows an error; batch continues.
- [ ] Window resize / dark mode look fine.

---

## 8. Decisions (2026-11-19)

1. Stack: Electron + React + TypeScript.
2. Product name: **GlobalConvert**.
3. Platforms: Windows, macOS, Linux.
4. pdf → docx: **in scope** (built-in Editable + Exact layout modes).
5. Excluded from Plan 01: bmp, heic, jxl, xlsx, pptx, epub, rtf, odt.

## 9. Open questions

1. Code signing certificates (Windows / Apple) — needed before public release (Phase 5).
