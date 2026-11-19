import { copyFile, readFile, writeFile } from 'node:fs/promises';
import mammoth from 'mammoth';
import { ConvertError, type Converter, type OptionField } from '@shared/converter';
import { baseNameOf } from '../../output';
import { sofficeConvert } from '../../libreoffice';
import { htmlDocument, marginField, pageSizeField, printOptions } from './html-doc';
import { assertSafeZip } from './zip';

type Options = { engine: string; pageSize: string; margin: number };

/** docx → html / txt (mammoth) and → pdf (mammoth + Chromium, or LibreOffice if installed). */
export function createDocx(soffice?: string): Converter<Options> {
  const engineField: OptionField = {
    key: 'engine',
    label: 'PDF engine',
    type: 'select',
    choices: [
      { value: 'libreoffice', label: 'LibreOffice (best layout)' },
      { value: 'builtin', label: 'Built-in' },
    ],
  };
  return {
    id: 'document.docx',
    family: 'document',
    from: ['docx'],
    to: ['pdf', 'txt', 'html'],
    optionsSchema: soffice
      ? [engineField, pageSizeField, marginField]
      : [pageSizeField, marginField],
    defaults: { engine: soffice ? 'libreoffice' : 'builtin', pageSize: 'a4', margin: 20 },
    notes: soffice
      ? 'The built-in PDF engine loses complex layout (headers/footers, floating images, exact fonts); LibreOffice keeps it.'
      : 'PDF output loses complex layout (headers/footers, floating images, exact fonts). ' +
        'Install LibreOffice for high-fidelity Word → PDF.',

    async convert(job, ctx) {
      const { options: o } = job;
      const buffer = await readFile(job.inputPath);
      assertSafeZip(buffer);
      ctx.signal.throwIfAborted();

      if (job.to === 'pdf' && soffice && o.engine === 'libreoffice') {
        ctx.progress(0.1);
        const produced = await sofficeConvert(
          soffice,
          job.inputPath,
          { convertTo: 'pdf' },
          ctx.tmpDir,
          ctx.signal,
        );
        await copyFile(produced, await ctx.reserveOutput());
        return;
      }

      try {
        if (job.to === 'txt') {
          const { value } = await mammoth.extractRawText({ buffer });
          await writeFile(await ctx.reserveOutput(), value);
          return;
        }
        const { value: body } = await mammoth.convertToHtml({ buffer });
        ctx.progress(0.4);
        const html = htmlDocument(baseNameOf(job.inputPath), body);
        if (job.to === 'html') {
          await writeFile(await ctx.reserveOutput(), html);
          return;
        }
        await writeFile(
          await ctx.reserveOutput(),
          await ctx.renderHtmlToPdf(html, printOptions(o)),
        );
      } catch (err) {
        if (err instanceof ConvertError || ctx.signal.aborted) throw err;
        throw new ConvertError(
          `Could not read the Word document: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  };
}
