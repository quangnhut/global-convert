#!/usr/bin/env node
// PreToolUse (Edit|Write|MultiEdit): block edits to generated / sensitive files.
// Exit 2 = block; stderr is shown to Claude.
import path from 'node:path';

const PROTECTED = [
  /(^|\/)\.env(\..*)?$/,
  /(^|\/)package-lock\.json$/,
  /(^|\/)(dist|out|release|node_modules)\//,
];

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let filePath = '';
  try {
    filePath = JSON.parse(raw)?.tool_input?.file_path ?? '';
  } catch {
    process.exit(0);
  }
  if (!filePath) process.exit(0);

  const rel = path.relative(process.cwd(), filePath).split(path.sep).join('/');
  const hit = PROTECTED.find((re) => re.test(rel));
  if (hit) {
    process.stderr.write(
      `Blocked: "${rel}" is a protected/generated file. ` +
        `Change it through its tool (npm install, build) or ask the user.\n`,
    );
    process.exit(2);
  }
  process.exit(0);
});
