import { describe, expect, it } from 'vitest';
import {
  groupLines,
  layoutBlocks,
  type TextPiece,
} from '../../src/engine/converters/document/pdf-layout';

const piece = (
  str: string,
  x: number,
  y: number,
  size = 12,
  extra: Partial<TextPiece> = {},
): TextPiece => ({
  str,
  x,
  y,
  size,
  width: str.length * size * 0.5,
  bold: false,
  italic: false,
  ...extra,
});

describe('groupLines', () => {
  it('joins pieces on one baseline left to right, inserting spaces at gaps', () => {
    const lines = groupLines([piece('world', 110, 700), piece('Hello', 72, 700.5)]);
    expect(lines.map((l) => l.text)).toEqual(['Hello world']);
  });

  it('keeps adjacent pieces together and splits runs by style', () => {
    const [line] = groupLines([
      piece('Bold', 72, 700, 12, { bold: true }),
      piece(' and plain', 96, 700),
    ]);
    expect(line!.runs).toEqual([{ text: 'Bold', bold: true }, { text: ' and plain' }]);
  });

  it('orders lines top to bottom', () => {
    expect(
      groupLines([piece('second', 72, 680), piece('first', 72, 700)]).map((l) => l.text),
    ).toEqual(['first', 'second']);
  });
});

describe('layoutBlocks', () => {
  it('merges close lines into a paragraph and removes soft hyphens', () => {
    const blocks = layoutBlocks([
      { pieces: [piece('A long para-', 72, 700), piece('graph continues', 72, 686)], images: [] },
    ]);
    expect(blocks).toEqual([{ kind: 'paragraph', runs: [{ text: 'A long paragraph continues' }] }]);
  });

  it('starts a new paragraph after a larger gap', () => {
    const blocks = layoutBlocks([
      { pieces: [piece('One.', 72, 700), piece('Two.', 72, 660)], images: [] },
    ]);
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'paragraph']);
  });

  it('ranks larger sizes as heading levels across the document', () => {
    const body = 'Body text that is long enough to be the most common size.';
    const blocks = layoutBlocks([
      {
        pieces: [piece('Big', 72, 760, 24), piece('Medium', 72, 720, 16), piece(body, 72, 690)],
        images: [],
      },
      { pieces: [piece('Medium again', 72, 760, 16), piece(body, 72, 730)], images: [] },
    ]);
    expect(blocks.map((b) => (b.kind === 'heading' ? `h${b.level}` : b.kind))).toEqual([
      'h1',
      'h2',
      'paragraph',
      'page-break',
      'h2',
      'paragraph',
    ]);
  });
});
