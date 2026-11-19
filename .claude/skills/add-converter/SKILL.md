---
name: add-converter
description: Add a new file-format converter (new from→to pair or a new format family) to the global-convert desktop app. Use when the user asks to support a new format or conversion, e.g. "add heic support", "convert xlsx to csv", "add audio conversion".
---

# Add a converter

Follow these steps in order. Read `.claude/rules/converters.md` first.

1. **Check scope**
   - Find the plan that owns this family in `.claude/plans/`. If the family is new
     (e.g. audio, video, archive), stop and use the `new-plan` skill first.
   - Check `src/engine/registry.ts` — does a converter already cover one side? Prefer
     extending its `from`/`to` over a new file if it uses the same library.

2. **Pick the library** — prefer pure JS/WASM or prebuilt native (like sharp). Check its
   licence (no AGPL/GPL without the user's OK) and that it works offline. Tell the user
   which library and why before installing.

3. **Register the format** in `src/shared/formats.ts`: id, label, extensions, mime,
   family, magic-byte signature for detection.

4. **Implement** `src/engine/converters/<family>/<name>.ts` implementing `Converter`:
   `id`, `family`, `from`, `to`, `optionsSchema`, `defaults`, `notes` (if lossy), `convert()`.
   Honour `ctx.signal`, call `ctx.progress`, clean up on failure.

5. **Register** it in `src/engine/registry.ts`.

6. **Fixture + tests**: add a small sample to `tests/fixtures/` and
   `tests/converters/<name>.test.ts` covering every new pair — assert magic bytes of
   the output plus one key property (dimensions / page count / text).

7. **Packaging**: if the library has native binaries or external executables, add them
   to `asarUnpack` / `extraResources` in the electron-builder config.

8. **Update the plan's conversion matrix** to mark the new cells ✔.

9. **Verify**: `npm run typecheck && npm run lint && npm test`. Report results honestly.
