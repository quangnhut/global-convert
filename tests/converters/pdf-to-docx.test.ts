import { readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { findSoffice } from '../../src/engine/libreoffice';
import { listZipEntries } from '../../src/engine/converters/document/zip';
import {
  convertOk,
  docxHtml,
  expectFormat,
  FIXTURE_TEXT,
  fixturePath,
  useOutputDir,
} from './helpers';

const soffice = findSoffice();
const media = (docx: string) =>
  listZipEntries(readFileSync(docx)).filter((e) => e.name.startsWith('word/media/'));

/** One page: heading, paragraph, a 128×96 pt image, then more text below it. */
async function pdfWithImage(path: string): Promise<void> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const image = await pdf.embedPng(await readFile(fixturePath('png')));
  page.drawText('Report', { x: 72, y: 760, size: 24, font: bold });
  page.drawText('Text above the picture.', { x: 72, y: 720, size: 12, font });
  page.drawImage(image, { x: 72, y: 600, width: 128, height: 96 });
  page.drawText('Text below the picture.', { x: 72, y: 560, size: 12, font });
  writeFileSync(path, await pdf.save());
}

/** Two pages that only contain a (different) image each, like a scan: no text layer. */
async function scannedPdf(path: string): Promise<void> {
  const pdf = await PDFDocument.create();
  // Different pictures per page: identical images are stored once in a .docx.
  const images = [
    await pdf.embedPng(await readFile(fixturePath('png'))),
    await pdf.embedJpg(await readFile(fixturePath('jpg'))),
  ];
  for (const image of images)
    pdf.addPage([595, 842]).drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
  writeFileSync(path, await pdf.save());
}

describe('document.pdf-to-docx', () => {
  const dir = useOutputDir();

  it('Editable: headings as Heading styles, body text kept, page per page', async () => {
    const [out] = await convertOk(dir(), 'pdf', 'docx');
    expectFormat(out!, 'docx');
    const html = await docxHtml(out!);
    // Both pages' titles are the largest text → Heading 1.
    expect(html).toContain('<h1>Fixture Heading</h1>');
    expect(html).toContain('<h1>Second page</h1>');
    expect(html).toContain(`<p>${FIXTURE_TEXT} — page 1.</p>`);
    expect(html).toContain(`<p>${FIXTURE_TEXT} — page 2.</p>`);
    expect(media(out!)).toHaveLength(0);
  });

  it('Editable: embedded images are kept in reading order', async () => {
    const input = join(dir(), 'report.pdf');
    await pdfWithImage(input);
    const [out] = await convertOk(dir(), 'pdf', 'docx', {}, input);
    expect(media(out!)).toHaveLength(1);
    const html = await docxHtml(out!);
    const order = [
      '<h1>Report</h1>',
      'Text above the picture.',
      '<img',
      'Text below the picture.',
    ].map((s) => html.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('Exact layout: one full-page image per page', async () => {
    const [out] = await convertOk(dir(), 'pdf', 'docx', { mode: 'exact', dpi: 72 });
    expectFormat(out!, 'docx');
    expect(media(out!)).toHaveLength(2);
  });

  it('a PDF without a text layer falls back to Exact layout', async () => {
    const input = join(dir(), 'scan.pdf');
    await scannedPdf(input);
    const [out] = await convertOk(dir(), 'pdf', 'docx', { dpi: 36 }, input);
    expect(media(out!)).toHaveLength(2);
  });
});

describe.skipIf(!soffice)('document.pdf-to-docx (LibreOffice)', () => {
  const dir = useOutputDir();

  it('LibreOffice mode produces a Word file with the text', { timeout: 120_000 }, async () => {
    const [out] = await convertOk(
      dir(),
      'pdf',
      'docx',
      { mode: 'libreoffice' },
      fixturePath('pdf'),
      {
        soffice,
      },
    );
    expectFormat(out!, 'docx');
    expect(await docxHtml(out!)).toContain('Fixture Heading');
  });
});
