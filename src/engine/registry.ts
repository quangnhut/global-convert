import { pickConverter, targetsFor } from '@shared/capabilities';
import type { Converter, ConverterInfo, OptionValues } from '@shared/converter';
import { isFormatId, type FormatId } from '@shared/formats';
import { createDocx } from './converters/document/docx';
import { md } from './converters/document/md';
import { pdf } from './converters/document/pdf';
import { createPdfToDocx } from './converters/document/pdf-to-docx';
import { txt } from './converters/document/txt';
import { icoDecode } from './converters/image/ico-decode';
import { icoEncode } from './converters/image/ico-encode';
import { imagesToPdf } from './converters/image/images-to-pdf';
import { sharpRaster } from './converters/image/sharp-raster';
import { svgWrap } from './converters/image/svg-wrap';

export class ConverterRegistry {
  private readonly converters: Converter[] = [];

  register<O extends OptionValues>(converter: Converter<O>): this {
    if (this.converters.some((c) => c.id === converter.id)) {
      throw new Error(`Converter "${converter.id}" is already registered`);
    }
    if (converter.from.length === 0 || converter.to.length === 0) {
      throw new Error(`Converter "${converter.id}" must declare at least one from/to format`);
    }
    const unknown = [...converter.from, ...converter.to].filter((f) => !isFormatId(f));
    if (unknown.length > 0) {
      throw new Error(`Converter "${converter.id}" uses unknown formats: ${unknown.join(', ')}`);
    }
    // Safe: the host always passes options resolved against this converter's own schema.
    this.converters.push(converter as unknown as Converter);
    return this;
  }

  pick(from: FormatId, to: FormatId): Converter | undefined {
    return pickConverter(this.converters, from, to);
  }

  targetsFor(from: FormatId): FormatId[] {
    return targetsFor(this.converters, from);
  }

  /** Plain, structured-clone-safe descriptions (no functions). */
  info(): ConverterInfo[] {
    return this.converters.map(({ id, family, from, to, optionsSchema, defaults, notes }) => ({
      id,
      family,
      from: [...from],
      to: [...to],
      optionsSchema: structuredClone(optionsSchema),
      defaults: { ...defaults },
      ...(notes ? { notes } : {}),
    }));
  }
}

export interface RegistryOptions {
  /** LibreOffice `soffice` path; when set, LibreOffice engines are offered. */
  soffice?: string;
}

/** The app's converters. */
export function createRegistry({ soffice }: RegistryOptions = {}): ConverterRegistry {
  return new ConverterRegistry()
    .register(sharpRaster)
    .register(icoEncode)
    .register(icoDecode)
    .register(svgWrap)
    .register(imagesToPdf)
    .register(txt)
    .register(md)
    .register(createDocx(soffice))
    .register(pdf)
    .register(createPdfToDocx(soffice));
}
