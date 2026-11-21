import { FORMATS, type FormatId } from '@shared/formats';

interface Props {
  /** Targets every file without its own target can reach. */
  targets: readonly FormatId[];
  value: FormatId | null;
  disabled: boolean;
  onChange(target: FormatId | null): void;
}

/** Batch target: only formats that all (non-overridden) files can convert to. */
export function FormatPicker({ targets, value, disabled, onChange }: Props) {
  if (targets.length === 0) {
    return <span className="muted">No common format — choose a target per file below.</span>;
  }
  return (
    <label className="field inline">
      <span>Convert to</span>
      <select
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange((e.target.value || null) as FormatId | null)}
      >
        <option value="" disabled>
          Choose format…
        </option>
        {targets.map((t) => (
          <option key={t} value={t}>
            {FORMATS[t].label}
          </option>
        ))}
      </select>
    </label>
  );
}
