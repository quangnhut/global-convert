---
name: new-plan
description: Create the next numbered plan file in .claude/plans/ for a new feature area or converter family (e.g. audio/video, archives, spreadsheets). Use when the user wants to plan a new area of the app before building it.
---

# Create a new plan

1. List `.claude/plans/` and take the next number: highest `NN` + 1, zero-padded
   (`02`, `03`, ...).
2. File name: `NN-kebab-case-topic.md`.
3. Use the same structure as `01-image-document-convert.md`:
   - Header table: Status (`Draft`), Created (today's date), Scope, Next.
   - 1 Goal + success criteria (checkboxes, testable).
   - 2 Stack / libraries for this area, with licence and why.
   - 3 Core changes — anything outside `src/engine/converters/<family>/` and
     `src/shared/formats.ts`. Aim for none; justify each one.
   - 4 Conversion matrix + options per format + known limitations.
   - 5 Phases, each ending with a **verify** line.
   - 6 Risks + mitigation.
   - 7 Open questions for the user.
4. Add a row to the table in `.claude/plans/README.md`.
5. Don't start implementing — ask the user to review the open questions first.
