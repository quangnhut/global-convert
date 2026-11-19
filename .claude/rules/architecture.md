# Architecture rules

- Process boundaries are strict:
  - `src/renderer/` — UI only. No Node APIs, no `require`, no file system.
  - `src/preload/` — the only bridge. Exposes a small typed API via `contextBridge`.
  - `src/main/` — windows, dialogs, IPC, job queue. Does **not** do conversions.
  - `src/engine/` — runs in a `utilityProcess`. All conversion work happens here.
  - `src/shared/` — types and pure data only. Must not import Node or Electron.
- New formats/converters are added by **registration**, never by `if/switch` on format
  inside core, queue, or UI code.
- The UI never hard-codes format lists. It asks the registry (`targetsFor`) and renders
  options from each converter's `optionsSchema`.
- Detect input type by magic bytes first, extension second.
- Never overwrite an existing output file silently; auto-suffix ` (1)`, ` (2)`...
- Keep the current plan in `.claude/plans/` in sync when scope changes.
