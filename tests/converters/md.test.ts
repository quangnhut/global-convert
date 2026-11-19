import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convertOk, docxHtml, expectFormat, FIXTURE_TEXT, printed, useOutputDir } from './helpers';

const RICH = `# Title

Intro with **bold**, *italic* and \`code\`.

1. one
2. two

Between.

1. again
   - nested

> quoted

| A | B |
| - | - |
| 1 | 2 |

\`\`\`
let x = 1;
\`\`\`

---
`;

describe('document.md', () => {
  const dir = useOutputDir();

  it('md → html: rendered markdown in a CSP-protected page', async () => {
    const [out] = await convertOk(dir(), 'md', 'html');
    expectFormat(out!, 'html');
    const html = readFileSync(out!, 'utf8');
    expect(html).toContain('<h1>Fixture Heading</h1>');
    expect(html).toContain(`<p>${FIXTURE_TEXT} in <strong>Markdown</strong>.</p>`);
    expect(html).toContain("default-src 'none'");
  });

  it('md → txt: readable plain text', async () => {
    const [out] = await convertOk(dir(), 'md', 'txt');
    expect(readFileSync(out!, 'utf8')).toBe(
      `Fixture Heading\n\n${FIXTURE_TEXT} in Markdown.\n\n- item one\n- item two\n`,
    );
  });

  it('md → docx: heading style, bold run and bullet list', async () => {
    const [out] = await convertOk(dir(), 'md', 'docx');
    expectFormat(out!, 'docx');
    const html = await docxHtml(out!);
    expect(html).toContain('<h1>Fixture Heading</h1>');
    expect(html).toContain(`<p>${FIXTURE_TEXT} in <strong>Markdown</strong>.</p>`);
    expect(html).toContain('<ul><li>item one</li><li>item two</li></ul>');
  });

  it('md → pdf: prints the rendered HTML', async () => {
    const [out] = await convertOk(dir(), 'md', 'pdf');
    expectFormat(out!, 'pdf');
    expect(printed[0]!.html).toContain('<h1>Fixture Heading</h1>');
    expect(printed[0]!.options).toEqual({ pageSize: 'A4', marginMm: 20 });
  });

  it('richer markdown → docx keeps lists, quote, table and code', async () => {
    const input = join(dir(), 'rich.md');
    writeFileSync(input, RICH);
    const [out] = await convertOk(dir(), 'md', 'docx', {}, input);
    const html = await docxHtml(out!);
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toMatch(/<ol><li>one<\/li><li>two<\/li><\/ol>/);
    expect(html).toMatch(/<li>again<ul><li>nested<\/li><\/ul><\/li>/);
    expect(html).toContain('<table>');
    expect(html).toContain('let x = 1;');
    expect(html).toContain('<em>quoted</em>');
  });

  it('richer markdown → txt numbers each list from 1', async () => {
    const input = join(dir(), 'rich.md');
    writeFileSync(input, RICH);
    const [out] = await convertOk(dir(), 'md', 'txt', {}, input);
    const text = readFileSync(out!, 'utf8');
    expect(text).toContain('1. one\n2. two');
    expect(text).toContain('1. again\n  - nested');
    expect(text).toContain('A\tB\n1\t2');
  });
});
