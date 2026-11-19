import type { ConverterInfo } from './converter';
import { FORMAT_IDS, type FormatId } from './formats';

/** First registered converter that handles `from → to` wins. */
export function pickConverter<T extends ConverterInfo>(
  converters: readonly T[],
  from: FormatId,
  to: FormatId,
): T | undefined {
  return converters.find((c) => c.from.includes(from) && c.to.includes(to));
}

/** Formats reachable from `from` in one step, in FORMAT_IDS order. */
export function targetsFor(converters: readonly ConverterInfo[], from: FormatId): FormatId[] {
  const reachable = new Set<FormatId>();
  for (const c of converters) if (c.from.includes(from)) c.to.forEach((t) => reachable.add(t));
  return FORMAT_IDS.filter((id) => reachable.has(id));
}
