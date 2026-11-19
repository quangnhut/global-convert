import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ISectionOptions,
  type ParagraphChild,
} from 'docx';

/** A run of text with uniform style. */
export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

/** Format-neutral document blocks; converters build these, `writeDocx` renders them. */
export type Block =
  | { kind: 'heading'; level: number; runs: Run[] }
  | { kind: 'paragraph'; runs: Run[] }
  /** `list` identifies one list, so each numbered list restarts at 1. */
  | { kind: 'list-item'; ordered: boolean; level: number; list: number; runs: Run[] }
  | { kind: 'code'; text: string }
  | { kind: 'quote'; runs: Run[] }
  | { kind: 'rule' }
  | { kind: 'table'; rows: Run[][][] }
  /** Size in points. */
  | { kind: 'image'; png: Buffer; widthPt: number; heightPt: number }
  | { kind: 'page-break' };

export interface Section {
  /** Page size and margin in points. */
  page: { widthPt: number; heightPt: number; marginPt: number };
  blocks: Block[];
}

export const PAGE_SIZES_PT = { a4: [595.28, 841.89], letter: [612, 792] } as const;
export const mmToPt = (mm: number) => (mm * 72) / 25.4;

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;
const MONO = 'Courier New';
const ORDERED = 'ordered-list';
const twips = (pt: number) => Math.round(pt * 20);
/** docx sizes images in pixels at 96 DPI. */
const px = (pt: number) => Math.max(1, Math.round((pt * 96) / 72));

function runs(list: readonly Run[], extra: { italic?: boolean } = {}): TextRun[] {
  return list.map(
    (r) =>
      new TextRun({
        text: r.text,
        bold: r.bold,
        italics: r.italic || extra.italic,
        ...(r.code ? { font: MONO } : {}),
      }),
  );
}

function blockToChildren(block: Block, contentWidthPt: number): (Paragraph | Table)[] {
  switch (block.kind) {
    case 'heading':
      return [
        new Paragraph({
          heading: HEADINGS[Math.min(6, Math.max(1, block.level)) - 1],
          children: runs(block.runs),
        }),
      ];
    case 'paragraph':
      return [new Paragraph({ children: runs(block.runs) })];
    case 'list-item':
      return [
        new Paragraph({
          children: runs(block.runs),
          ...(block.ordered
            ? { numbering: { reference: ORDERED, level: block.level, instance: block.list } }
            : { bullet: { level: block.level } }),
        }),
      ];
    case 'code':
      return block.text.split('\n').map(
        (line) =>
          new Paragraph({
            spacing: { before: 0, after: 0 },
            shading: { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' },
            children: [new TextRun({ text: line, font: MONO })],
          }),
      );
    case 'quote':
      return [
        new Paragraph({ indent: { left: 720 }, children: runs(block.runs, { italic: true }) }),
      ];
    case 'rule':
      return [
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'AAAAAA', space: 1 } },
          children: [],
        }),
      ];
    case 'table':
      if (block.rows.length === 0) return [];
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: block.rows.map(
            (row, r) =>
              new TableRow({
                tableHeader: r === 0,
                children: row.map(
                  (cell) =>
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: runs(r === 0 ? cell.map((c) => ({ ...c, bold: true })) : cell),
                        }),
                      ],
                    }),
                ),
              }),
          ),
        }),
      ];
    case 'image': {
      // Shrink (never enlarge) to the text width.
      const scale = Math.min(1, contentWidthPt / block.widthPt);
      const image: ParagraphChild = new ImageRun({
        type: 'png',
        data: block.png,
        transformation: { width: px(block.widthPt * scale), height: px(block.heightPt * scale) },
      });
      return [new Paragraph({ spacing: { before: 0, after: 0 }, children: [image] })];
    }
    case 'page-break':
      return [new Paragraph({ children: [new PageBreak()] })];
  }
}

/** Renders sections of blocks to a .docx file. */
export async function writeDocx(sections: readonly Section[], font: string): Promise<Buffer> {
  const doc = new Document({
    styles: { default: { document: { run: { font } } } },
    numbering: {
      config: [
        {
          reference: ORDERED,
          levels: Array.from({ length: 9 }, (_, level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: sections.map(({ page, blocks }): ISectionOptions => {
      const content = page.widthPt - 2 * page.marginPt;
      const margin = twips(page.marginPt);
      return {
        properties: {
          page: {
            size: { width: twips(page.widthPt), height: twips(page.heightPt) },
            margin: {
              top: margin,
              bottom: margin,
              left: margin,
              right: margin,
              header: 0,
              footer: 0,
            },
          },
        },
        children: blocks.flatMap((b) => blockToChildren(b, content)),
      };
    }),
  });
  return Packer.toBuffer(doc);
}
