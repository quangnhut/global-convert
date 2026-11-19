import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findSoffice } from '../../src/engine/libreoffice';
import { assertSafeZip, listZipEntries } from '../../src/engine/converters/document/zip';
import { openPdf } from '../../src/engine/converters/document/pdfjs';
import {
  convert,
  convertOk,
  expectFormat,
  FIXTURE_TEXT,
  fixturePath,
  printed,
  useOutputDir,
} from './helpers';

const soffice = findSoffice();

/** A ZIP with one central-directory entry claiming the given sizes (no real data). */
function fakeZip(compressed: number, uncompressed: number): Uint8Array {
  const name = Buffer.from('word/document.xml');
  const cd = Buffer.alloc(46 + name.length);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt32LE(compressed, 20);
  cd.writeUInt32LE(uncompressed, 24);
  cd.writeUInt16LE(name.length, 28);
  name.copy(cd, 46);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(0, 16);
  return Buffer.concat([cd, eocd]);
}

describe('document.docx (built-in)', () => {
  const dir = useOutputDir();

  it('docx → txt: raw text', async () => {
    const [out] = await convertOk(dir(), 'docx', 'txt');
    const text = readFileSync(out!, 'utf8');
    expect(text).toContain('Fixture Heading');
    expect(text).toContain(`${FIXTURE_TEXT} in a Word document.`);
  });

  it('docx → html: heading and paragraph', async () => {
    const [out] = await convertOk(dir(), 'docx', 'html');
    expectFormat(out!, 'html');
    const html = readFileSync(out!, 'utf8');
    expect(html).toContain('<h1>Fixture Heading</h1>');
    expect(html).toContain(`<p>${FIXTURE_TEXT} in a Word document.</p>`);
  });

  it('docx → pdf: prints the converted HTML (no engine choice without LibreOffice)', async () => {
    const [out] = await convertOk(dir(), 'docx', 'pdf');
    expectFormat(out!, 'pdf');
    expect(printed[0]!.html).toContain('<h1>Fixture Heading</h1>');
  });

  it('a damaged file fails with a readable message', async () => {
    const bad = join(dir(), 'bad.docx');
    writeFileSync(bad, 'PK\u0003\u0004 definitely not a document');
    const result = await convert(dir(), 'docx', 'txt', {}, bad);
    expect(result).toMatchObject({
      type: 'failed',
      message: 'The file is not a valid ZIP-based document.',
    });
  });
});

describe('zip guard', () => {
  it('lists the fixture entries without unpacking', () => {
    const names = listZipEntries(readFileSync(fixturePath('docx'))).map((e) => e.name);
    expect(names).toContain('word/document.xml');
  });

  it('rejects zip bombs and oversized documents', () => {
    expect(() => assertSafeZip(fakeZip(100_000, 900_000_000))).toThrow(/suspicious/);
    expect(() => assertSafeZip(fakeZip(400_000_000, 600_000_000))).toThrow(/too large/);
    expect(() => assertSafeZip(fakeZip(1000, 5000))).not.toThrow();
  });
});

describe.skipIf(!soffice)('document.docx (LibreOffice)', () => {
  const dir = useOutputDir();

  it(
    'docx → pdf with LibreOffice: real PDF containing the text',
    { timeout: 120_000 },
    async () => {
      const [out] = await convertOk(dir(), 'docx', 'pdf', {}, fixturePath('docx'), { soffice });
      expectFormat(out!, 'pdf');
      expect(printed).toHaveLength(0); // Chromium not used
      const doc = await openPdf(out!);
      const page = await doc.getPage(1);
      const text = (await page.getTextContent()).items
        .map((i) => ('str' in i ? i.str : ''))
        .join(' ');
      expect(text).toContain('Fixture Heading');
      await doc.loadingTask.destroy();
    },
  );
});
