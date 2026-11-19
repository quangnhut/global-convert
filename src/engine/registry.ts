import { pickConverter, targetsFor } from '@shared/capabilities';
import type { Converter, ConverterInfo } from '@shared/converter';
import { isFormatId, type FormatId } from '@shared/formats';

export class ConverterRegistry {
  private readonly converters: Converter[] = [];

  register(converter: Converter): this {
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
    this.converters.push(converter);
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

/** The app's converters. Phase 2/3 register image and document converters here. */
export function createRegistry(): ConverterRegistry {
  return new ConverterRegistry();
}
