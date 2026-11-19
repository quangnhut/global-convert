# Plans

One file per feature area, numbered in the order they were started.

- Name: `NN-kebab-case-topic.md` (e.g. `02-audio-video-convert.md`).
- Each plan has: header table (Status / Created / Scope), Goal + success criteria,
  conversion matrix (if it adds converters), phases with a **verify** step, risks,
  open questions.
- Status values: `Draft` → `Approved` → `In progress` → `Done` (or `Dropped`).
- A new converter family = a new plan. It must only add modules under
  `src/engine/converters/<family>/` and entries in `src/shared/formats.ts`.
  If it needs core changes, call them out in a "Core changes" section.

Use the `new-plan` skill to create the next plan.

| #  | Plan                                   | Status |
| -- | -------------------------------------- | ------ |
| 01 | [Image & document convert](01-image-document-convert.md) | In progress |
