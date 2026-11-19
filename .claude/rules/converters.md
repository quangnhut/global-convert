---
paths:
  - "src/engine/**"
  - "src/shared/formats.ts"
  - "src/shared/converter.ts"
  - "tests/converters/**"
---

# Converter rules

- One converter = one file in `src/engine/converters/<family>/`, implementing
  `Converter` from `src/shared/converter.ts`, exported and registered in
  `src/engine/registry.ts`.
- `convert()` must:
  - honour `ctx.signal` (check between pages/frames; abort long operations),
  - call `ctx.progress()` for anything that takes more than ~1s,
  - write temp files only inside `ctx.tmpDir`, and clean up partial output on failure/cancel,
  - return every file it produced in `outputs` (multi-page → multiple files).
- Throw `ConvertError` with a user-readable message (shown in the UI). Don't swallow errors.
- Guard against hostile input: set `limitInputPixels` for sharp, cap page counts / sizes,
  never execute content from documents.
- If output is lossy or approximate (e.g. raster → svg wrapper, docx → pdf via html),
  say so in the converter's `notes` so the UI can show it.
- Every new `from → to` pair needs a fixture in `tests/fixtures/` and a test that checks
  the output's **magic bytes** (not just the extension) and a key property
  (dimensions, page count, contained text).
- No AGPL/GPL dependencies without an explicit decision recorded in the plan.
