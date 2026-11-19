import { ConvertError, type OptionField, type OptionValues } from './converter';

/**
 * Merges user-supplied options over a converter's defaults and validates them against
 * its schema. Unknown keys are dropped. Throws ConvertError on an invalid value.
 */
export function resolveOptions(
  schema: readonly OptionField[],
  defaults: OptionValues,
  input: unknown,
): OptionValues {
  const given: Record<string, unknown> =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const result: OptionValues = { ...defaults };

  for (const field of schema) {
    if (!(field.key in given) || given[field.key] === undefined) continue;
    const value = given[field.key];

    switch (field.type) {
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          throw new ConvertError(`${field.label} must be a number.`);
        }
        if (value < field.min || value > field.max) {
          throw new ConvertError(`${field.label} must be between ${field.min} and ${field.max}.`);
        }
        result[field.key] = value;
        break;
      case 'select':
        if (typeof value !== 'string' || !field.choices.some((c) => c.value === value)) {
          throw new ConvertError(`${field.label} has an invalid choice.`);
        }
        result[field.key] = value;
        break;
      case 'boolean':
        if (typeof value !== 'boolean') throw new ConvertError(`${field.label} must be on or off.`);
        result[field.key] = value;
        break;
    }
  }
  return result;
}
