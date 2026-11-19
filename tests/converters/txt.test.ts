import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { decodeText } from '../../src/engine/converters/document/text-decode';
import { convertOk, docxHtml, expectFormat, FIXTURE_TEXT, printed, useOutputDir } from './helpers';

describe('document.txt', () => {
  const dir = useOutputDir();

  it('txt → html: escaped text in a pre block, UTF-8 kept', async () => {
    const [out] = await convertOk(dir(), 'txt', 'html');
    expectFormat(out!, 'html');
    const html = readFileSync(out!, 'utf8');
    expect(html).toContain(
      `<pre class="plain">${FIXTURE_TEXT}\nSecond line — with UTF-8: café, 日本語.`,
    );
    expect(html).toContain('Content-Security-Policy');
  });

  it('txt → docx: one paragraph per line', async () => {
    const [out] = await convertOk(dir(), 'txt', 'docx');
    expectFormat(out!, 'docx');
    const html = await docxHtml(out!);
    expect(html).toContain(`<p>${FIXTURE_TEXT}</p>`);
    expect(html).toContain('<p>Second line — with UTF-8: café, 日本語.</p>');
  });

  it('txt → pdf: prints the text with the chosen page size', async () => {
    const [out] = await convertOk(dir(), 'txt', 'pdf', { pageSize: 'letter', margin: 10 });
    expectFormat(out!, 'pdf');
    expect(printed).toHaveLength(1);
    expect(printed[0]!.html).toContain(FIXTURE_TEXT);
    expect(printed[0]!.options).toEqual({ pageSize: 'Letter', marginMm: 10 });
    const pdf = await PDFDocument.load(readFileSync(out!));
    expect(pdf.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  });

  it('escapes markup so text never becomes HTML', async () => {
    const input = join(dir(), 'markup.txt');
    writeFileSync(input, '<script>alert(1)</script> & co');
    const [out] = await convertOk(dir(), 'txt', 'html', {}, input);
    expect(readFileSync(out!, 'utf8')).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; co');
  });

  it('auto-detects Windows-1252 and UTF-16 (BOM) input', async () => {
    const latin = join(dir(), 'latin.txt');
    writeFileSync(latin, Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x20, 0x80])); // "café €"
    const [a] = await convertOk(dir(), 'txt', 'html', {}, latin);
    expect(readFileSync(a!, 'utf8')).toContain('café €');

    const utf16 = join(dir(), 'utf16.txt');
    writeFileSync(
      utf16,
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Xin chào', 'utf16le')]),
    );
    const [b] = await convertOk(dir(), 'txt', 'html', {}, utf16);
    expect(readFileSync(b!, 'utf8')).toContain('<pre class="plain">Xin chào</pre>');
  });
});

describe('decodeText', () => {
  it('strips a UTF-8 BOM and honours an explicit encoding', () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x61]))).toBe('a');
    expect(decodeText(new Uint8Array([0xe9]), 'windows-1252')).toBe('é');
    expect(decodeText(new Uint8Array([0x00, 0x61]), 'utf-16be')).toBe('a');
  });
});
