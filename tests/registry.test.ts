import { describe, expect, it } from 'vitest';
import type { Converter } from '@shared/converter';
import type { FormatId } from '@shared/formats';
import { ConverterRegistry } from '../src/engine/registry';

const fake = (id: string, from: FormatId[], to: FormatId[]): Converter => ({
  id,
  family: 'image',
  from,
  to,
  optionsSchema: [],
  defaults: {},
  convert: async () => undefined,
});

describe('ConverterRegistry', () => {
  it('targetsFor returns union of targets in canonical order, without duplicates', () => {
    const r = new ConverterRegistry()
      .register(fake('a', ['png', 'jpg'], ['webp', 'png']))
      .register(fake('b', ['png'], ['pdf', 'webp']));
    expect(r.targetsFor('png')).toEqual(['webp', 'pdf']);
    expect(r.targetsFor('jpg')).toEqual(['png', 'webp']);
    expect(r.targetsFor('docx')).toEqual([]);
  });

  it('never offers or picks a same-format conversion', () => {
    const r = new ConverterRegistry().register(fake('a', ['png', 'gif'], ['png', 'gif']));
    expect(r.targetsFor('gif')).toEqual(['png']);
    expect(r.pick('gif', 'gif')).toBeUndefined();
    expect(r.pick('gif', 'png')?.id).toBe('a');
  });

  it('pick returns the first registered converter for a pair', () => {
    const r = new ConverterRegistry()
      .register(fake('first', ['docx'], ['pdf']))
      .register(fake('second', ['docx'], ['pdf', 'txt']));
    expect(r.pick('docx', 'pdf')?.id).toBe('first');
    expect(r.pick('docx', 'txt')?.id).toBe('second');
    expect(r.pick('pdf', 'docx')).toBeUndefined();
  });

  it('rejects duplicate ids, empty from/to and unknown formats', () => {
    const r = new ConverterRegistry().register(fake('a', ['png'], ['jpg']));
    expect(() => r.register(fake('a', ['png'], ['webp']))).toThrow(/already registered/);
    expect(() => r.register(fake('b', [], ['webp']))).toThrow(/at least one/);
    expect(() => r.register(fake('c', ['heic' as FormatId], ['png']))).toThrow(/unknown formats/);
  });

  it('info() is structured-clone safe and has no functions', () => {
    const r = new ConverterRegistry().register({
      ...fake('a', ['png'], ['jpg']),
      notes: 'lossy',
      optionsSchema: [{ key: 'q', label: 'Quality', type: 'number', min: 1, max: 100 }],
      defaults: { q: 80 },
    });
    const info = r.info();
    expect(structuredClone(info)).toEqual(info);
    expect(info[0]).not.toHaveProperty('convert');
    expect(info[0]).toMatchObject({ id: 'a', notes: 'lossy', defaults: { q: 80 } });
  });
});
