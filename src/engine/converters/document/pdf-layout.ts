import type { Block, Run } from './docx-writer';

/** One positioned text item from a PDF page (PDF coordinates: y grows upwards, baseline). */
export interface TextPiece {
  str: string;
  x: number;
  y: number;
  width: number;
  /** Font size in points. */
  size: number;
  bold: boolean;
  italic: boolean;
}

/** An image placed on the page; `top` is its upper edge in PDF coordinates. */
export interface ImagePiece {
  top: number;
  widthPt: number;
  heightPt: number;
  png: Buffer;
}

export interface PageContent {
  pieces: TextPiece[];
  images: ImagePiece[];
}

export interface Line {
  y: number;
  size: number;
  runs: Run[];
  text: string;
}

/** Pieces on (almost) the same baseline become one line, read left to right. */
export function groupLines(pieces: readonly TextPiece[]): Line[] {
  const sorted = pieces.filter((p) => p.str.length > 0).sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: { y: number; size: number; pieces: TextPiece[] }[] = [];
  for (const p of sorted) {
    const group = groups.at(-1);
    if (group && Math.abs(group.y - p.y) <= Math.max(group.size, p.size) * 0.5) {
      group.pieces.push(p);
      group.size = Math.max(group.size, p.size);
    } else {
      groups.push({ y: p.y, size: p.size, pieces: [p] });
    }
  }

  return groups.map((group) => {
    const runs: (Run & { bold: boolean; italic: boolean })[] = [];
    let end = -Infinity;
    for (const p of group.pieces.sort((a, b) => a.x - b.x)) {
      let text = p.str;
      const last = runs.at(-1);
      // A visible gap between items is a word break.
      if (last && p.x - end > p.size * 0.2 && !/\s$/.test(last.text) && !/^\s/.test(text)) {
        text = ` ${text}`;
      }
      if (last && last.bold === p.bold && last.italic === p.italic) last.text += text;
      else runs.push({ text, bold: p.bold, italic: p.italic });
      end = Math.max(end, p.x + p.width);
    }
    const clean = runs.map(({ text, bold, italic }) => ({
      text,
      ...(bold ? { bold } : {}),
      ...(italic ? { italic } : {}),
    }));
    return { y: group.y, size: group.size, runs: clean, text: clean.map((r) => r.text).join('') };
  });
}

const roundSize = (size: number) => Math.round(size * 2) / 2;

/** The most common font size, weighted by amount of text. */
export function bodySize(lines: readonly Line[]): number {
  const weight = new Map<number, number>();
  for (const line of lines) {
    const size = roundSize(line.size);
    weight.set(size, (weight.get(size) ?? 0) + line.text.length);
  }
  let best = 12;
  let bestWeight = -1;
  for (const [size, w] of weight) {
    if (w > bestWeight) [best, bestWeight] = [size, w];
  }
  return best;
}

/** Appends `next` to `runs`, joining lines with a space (or removing a soft hyphen). */
function joinLine(runs: Run[], next: readonly Run[]): void {
  const last = runs.at(-1);
  const first = next[0];
  if (!last || !first) {
    runs.push(...next.map((r) => ({ ...r })));
    return;
  }
  if (/[a-zà-ỹ]-$/i.test(last.text) && /^[a-zà-ỹ]/.test(first.text))
    last.text = last.text.slice(0, -1);
  else if (!/\s$/.test(last.text)) last.text += ' ';
  for (const r of next) {
    const tail = runs.at(-1)!;
    if (tail.bold === r.bold && tail.italic === r.italic) tail.text += r.text;
    else runs.push({ ...r });
  }
}

/**
 * Turns the text and images of all pages into document blocks: lines → paragraphs, larger
 * font sizes → headings (sizes ranked across the whole document), images in reading order,
 * and a page break between pages.
 */
export function layoutBlocks(pages: readonly PageContent[]): Block[] {
  const pageLines = pages.map((p) => groupLines(p.pieces));
  const body = bodySize(pageLines.flat());
  const isHeadingSize = (size: number) => roundSize(size) >= body * 1.15;
  const headingSizes = [
    ...new Set(
      pageLines
        .flat()
        .map((l) => roundSize(l.size))
        .filter(isHeadingSize),
    ),
  ].sort((a, b) => b - a);
  const levelOf = (size: number) => Math.min(6, headingSizes.indexOf(roundSize(size)) + 1);

  const blocks: Block[] = [];
  pages.forEach((page, index) => {
    if (index > 0) blocks.push({ kind: 'page-break' });
    const placed: { top: number; block: Block }[] = [];

    let current:
      { size: number; top: number; lastY: number; lastSize: number; runs: Run[] } | undefined;
    const flush = () => {
      if (!current) return;
      const text = current.runs.map((r) => r.text).join('');
      const heading = isHeadingSize(current.size) && text.length < 200;
      // Heading styles are bold already; an all-bold heading needs no extra bold runs.
      const headingRuns = current.runs.every((r) => r.bold)
        ? current.runs.map(({ bold: _bold, ...rest }) => rest)
        : current.runs;
      placed.push({
        top: current.top,
        block: heading
          ? { kind: 'heading', level: levelOf(current.size), runs: headingRuns }
          : { kind: 'paragraph', runs: current.runs },
      });
      current = undefined;
    };

    for (const line of pageLines[index]!) {
      const sameSize = current && Math.abs(roundSize(line.size) - roundSize(current.size)) < 1;
      const closeBelow = current && current.lastY - line.y <= current.lastSize * 1.6;
      if (current && sameSize && closeBelow) {
        joinLine(current.runs, line.runs);
        current.lastY = line.y;
        current.lastSize = line.size;
      } else {
        flush();
        current = {
          size: line.size,
          top: line.y + line.size,
          lastY: line.y,
          lastSize: line.size,
          runs: line.runs.map((r) => ({ ...r })),
        };
      }
    }
    flush();

    for (const img of page.images) {
      placed.push({
        top: img.top,
        block: { kind: 'image', png: img.png, widthPt: img.widthPt, heightPt: img.heightPt },
      });
    }
    // Stable sort keeps text order for equal tops.
    placed.sort((a, b) => b.top - a.top);
    blocks.push(...placed.map((p) => p.block));
  });
  return blocks;
}
