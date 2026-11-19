import { describe, expect, it } from 'vitest';
import { ConvertError, type OptionField } from '@shared/converter';
import { resolveOptions } from '@shared/options';

const schema: OptionField[] = [
  { key: 'quality', label: 'Quality', type: 'number', min: 1, max: 100 },
  {
    key: 'fit',
    label: 'Fit',
    type: 'select',
    choices: [
      { value: 'cover', label: 'Cover' },
      { value: 'contain', label: 'Contain' },
    ],
  },
  { key: 'strip', label: 'Strip metadata', type: 'boolean' },
];
const defaults = { quality: 80, fit: 'cover', strip: true };

describe('resolveOptions', () => {
  it('returns defaults for missing / non-object input', () => {
    expect(resolveOptions(schema, defaults, undefined)).toEqual(defaults);
    expect(resolveOptions(schema, defaults, 'nope')).toEqual(defaults);
    expect(resolveOptions(schema, defaults, [1, 2])).toEqual(defaults);
  });

  it('overrides valid values and drops unknown keys', () => {
    expect(
      resolveOptions(schema, defaults, { quality: 50, fit: 'contain', strip: false, evil: 1 }),
    ).toEqual({ quality: 50, fit: 'contain', strip: false });
  });

  it.each([
    [{ quality: 0 }, /between 1 and 100/],
    [{ quality: 101 }, /between 1 and 100/],
    [{ quality: '50' }, /must be a number/],
    [{ quality: Number.NaN }, /must be a number/],
    [{ fit: 'stretch' }, /invalid choice/],
    [{ strip: 'yes' }, /on or off/],
  ])('rejects %o', (input, message) => {
    expect(() => resolveOptions(schema, defaults, input)).toThrow(ConvertError);
    expect(() => resolveOptions(schema, defaults, input)).toThrow(message);
  });
});
