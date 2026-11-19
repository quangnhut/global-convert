import { readFile, writeFile } from 'node:fs/promises';
import { marked, type Token, type Tokens } from 'marked';
import type { Converter } from '@shared/converter';
import { baseNameOf } from '../../output';
import { type Block, mmToPt, PAGE_SIZES_PT, type Run, writeDocx } from './docx-writer';
import {
  FONTS,
  fontField,
  fontOf,
  htmlDocument,
  marginField,
  pageSizeField,
  printOptions,
} from './html-doc';
import { decodeText } from './text-decode';

type Options = { font: string; pageSize: string; margin: number };
type Style = Pick<Run, 'bold' | 'italic' | 'code'>;

const children = (t: Token): Token[] => ('tokens' in t && Array.isArray(t.tokens) ? t.tokens : []);

/** Inline tokens → styled runs. */
function inlineRuns(tokens: readonly Token[], style: Style = {}): Run[] {
  const out: Run[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case 'strong':
        out.push(...inlineRuns(children(t), { ...style, bold: true }));
        break;
      case 'em':
        out.push(...inlineRuns(children(t), { ...style, italic: true }));
        break;
      case 'codespan':
        out.push({ ...style, code: true, text: (t as Tokens.Codespan).text });
        break;
      case 'br':
        out.push({ ...style, text: '\n' });
        break;
      case 'image':
        out.push({ ...style, text: (t as Tokens.Image).text });
        break;
      case 'html':
        break; // raw inline HTML has no meaning outside HTML
      default: {
        const nested = children(t);
        if (nested.length > 0) out.push(...inlineRuns(nested, style));
        else if ('text' in t && typeof t.text === 'string') out.push({ ...style, text: t.text });
      }
    }
  }
  return out;
}

const plain = (runs: readonly Run[]) => runs.map((r) => r.text).join('');

/** Block tokens → document blocks. */
export function markdownBlocks(tokens: readonly Token[]): Block[] {
  const blocks: Block[] = [];
  let listCount = 0;

  const list = (token: Tokens.List, level: number) => {
    const id = ++listCount;
    for (const item of token.items) {
      const runs: Run[] = [];
      const nested: Tokens.List[] = [];
      for (const t of item.tokens) {
        if (t.type === 'list') nested.push(t as Tokens.List);
        else {
          if (runs.length > 0) runs.push({ text: ' ' });
          runs.push(...inlineRuns(children(t).length ? children(t) : [t]));
        }
      }
      if (item.task) runs.unshift({ text: item.checked ? '☑ ' : '☐ ' });
      blocks.push({ kind: 'list-item', ordered: token.ordered, level, list: id, runs });
      nested.forEach((n) => list(n, level + 1));
    }
  };

  for (const t of tokens) {
    switch (t.type) {
      case 'heading':
        blocks.push({
          kind: 'heading',
          level: (t as Tokens.Heading).depth,
          runs: inlineRuns(children(t)),
        });
        break;
      case 'paragraph':
      case 'text':
        blocks.push({
          kind: 'paragraph',
          runs: inlineRuns(children(t).length ? children(t) : [t]),
        });
        break;
      case 'list':
        list(t as Tokens.List, 0);
        break;
      case 'code':
        blocks.push({ kind: 'code', text: (t as Tokens.Code).text });
        break;
      case 'blockquote':
        for (const b of markdownBlocks(children(t))) {
          blocks.push('runs' in b ? { kind: 'quote', runs: b.runs } : b);
        }
        break;
      case 'hr':
        blocks.push({ kind: 'rule' });
        break;
      case 'table': {
        const table = t as Tokens.Table;
        const cells = (row: Tokens.TableCell[]) => row.map((c) => inlineRuns(c.tokens));
        blocks.push({ kind: 'table', rows: [cells(table.header), ...table.rows.map(cells)] });
        break;
      }
      // 'space', block 'html' and anything unknown are dropped.
    }
  }
  return blocks;
}

/** Document blocks → readable plain text. */
export function blocksToText(blocks: readonly Block[]): string {
  const lines: string[] = [];
  const counters = new Map<string, number>();
  for (const b of blocks) {
    switch (b.kind) {
      case 'heading':
      case 'paragraph':
        lines.push(plain(b.runs), '');
        break;
      case 'quote':
        lines.push(`> ${plain(b.runs)}`, '');
        break;
      case 'list-item': {
        const key = `${b.list}:${b.level}`;
        const n = (counters.get(key) ?? 0) + 1;
        counters.set(key, n);
        lines.push(`${'  '.repeat(b.level)}${b.ordered ? `${n}.` : '-'} ${plain(b.runs)}`);
        break;
      }
      case 'code':
        lines.push(b.text, '');
        break;
      case 'rule':
        lines.push('----------', '');
        break;
      case 'table':
        lines.push(...b.rows.map((row) => row.map(plain).join('\t')), '');
        break;
      case 'image':
      case 'page-break':
        break;
    }
  }
  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
}

export const md: Converter<Options> = {
  id: 'document.md',
  family: 'document',
  from: ['md'],
  to: ['pdf', 'docx', 'txt', 'html'],
  optionsSchema: [fontField, pageSizeField, marginField],
  defaults: { font: 'sans', pageSize: 'a4', margin: 20 },
  notes:
    'Images are embedded in HTML only when they are data URLs; linked local or web images ' +
    'are not loaded into PDF or Word output.',

  async convert(job, ctx) {
    const { options: o } = job;
    const source = decodeText(await readFile(job.inputPath)).replace(/\r\n?/g, '\n');
    const font = fontOf(o.font);
    ctx.signal.throwIfAborted();

    if (job.to === 'docx' || job.to === 'txt') {
      const blocks = markdownBlocks(marked.lexer(source, { gfm: true }));
      if (job.to === 'txt') {
        await writeFile(await ctx.reserveOutput(), blocksToText(blocks));
        return;
      }
      const [w, h] = PAGE_SIZES_PT[o.pageSize === 'letter' ? 'letter' : 'a4'];
      const page = { widthPt: w, heightPt: h, marginPt: mmToPt(o.margin) };
      await writeFile(
        await ctx.reserveOutput(),
        await writeDocx([{ page, blocks }], FONTS[font].docx),
      );
      return;
    }

    const body = marked.parse(source, { gfm: true, async: false });
    const html = htmlDocument(baseNameOf(job.inputPath), body, font);
    if (job.to === 'html') {
      await writeFile(await ctx.reserveOutput(), html);
      return;
    }
    await writeFile(await ctx.reserveOutput(), await ctx.renderHtmlToPdf(html, printOptions(o)));
  },
};
