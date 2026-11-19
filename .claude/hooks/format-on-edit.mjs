#!/usr/bin/env node
// PostToolUse (Edit|Write|MultiEdit): run Prettier on the edited file.
// No-op until Prettier is installed locally. Never blocks.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.css', '.html', '.md']);

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let filePath = '';
  try {
    filePath = JSON.parse(raw)?.tool_input?.file_path ?? '';
  } catch {
    process.exit(0);
  }
  if (!filePath || !EXT.has(path.extname(filePath).toLowerCase())) process.exit(0);

  const prettier = path.join(process.cwd(), 'node_modules', 'prettier', 'bin', 'prettier.cjs');
  if (!existsSync(prettier)) process.exit(0);

  spawnSync(process.execPath, [prettier, '--write', '--log-level', 'warn', filePath], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  process.exit(0);
});
