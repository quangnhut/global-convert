# Code style & workflow

- TypeScript `strict`. No `any` — use `unknown` and narrow.
- ESM imports, named exports. File names `kebab-case.ts`, React components `PascalCase.tsx`.
- Prettier formats on save (the PostToolUse hook runs it after every edit).
- Before saying a task is done run: `npm run typecheck && npm run lint && npm test`.
- Don't edit `package-lock.json`, `dist/`, `out/`, `release/` by hand (a PreToolUse hook blocks it).
- Add dependencies with `npm install`, and state in the reply why each new dependency is needed.
