import { useState } from 'react';
import type { OptionField, OptionValue, OptionValues } from '@shared/converter';
import { FORMATS } from '@shared/formats';
import type { ConverterUse } from '../state/batch';

interface Props {
  uses: readonly ConverterUse[];
  values: Readonly<Record<string, OptionValues>>;
  disabled: boolean;
  onChange(converterId: string, key: string, value: OptionValue): void;
}

/** "PNG, JPEG → WebP" for the converter pairs in use. */
function pairsLabel(use: ConverterUse): string {
  const byTarget = new Map<string, string[]>();
  for (const { from, to } of use.pairs) {
    byTarget.set(to, [...(byTarget.get(to) ?? []), FORMATS[from].label]);
  }
  return [...byTarget]
    .map(([to, froms]) => `${froms.join(', ')} → ${FORMATS[to as keyof typeof FORMATS].label}`)
    .join('; ');
}

/** Number input that only commits valid, in-range values (reverts on bad input). */
function NumberField({
  field,
  value,
  disabled,
  onCommit,
}: {
  field: Extract<OptionField, { type: 'number' }>;
  value: number;
  disabled: boolean;
  onCommit(value: number): void;
}) {
  /** What the user is typing; null when not editing (shows the committed value). */
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(n)) {
      onCommit(Math.min(field.max, Math.max(field.min, n)));
    }
    setDraft(null);
  };
  return (
    <input
      type="number"
      min={field.min}
      max={field.max}
      step={field.step ?? 1}
      value={draft ?? String(value)}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
    />
  );
}

function Field({
  field,
  value,
  disabled,
  onChange,
}: {
  field: OptionField;
  value: OptionValue | undefined;
  disabled: boolean;
  onChange(value: OptionValue): void;
}) {
  switch (field.type) {
    case 'number':
      return (
        <label className="field">
          <span>{field.label}</span>
          <NumberField
            field={field}
            value={typeof value === 'number' ? value : field.min}
            disabled={disabled}
            onCommit={onChange}
          />
        </label>
      );
    case 'select':
      return (
        <label className="field">
          <span>{field.label}</span>
          <select
            value={typeof value === 'string' ? value : ''}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          >
            {field.choices.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      );
    case 'boolean':
      return (
        <label className="field field-check">
          <input
            type="checkbox"
            checked={value === true}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>{field.label}</span>
        </label>
      );
  }
}

/** Options of every converter the batch uses, rendered from each converter's schema. */
export function OptionsPanel({ uses, values, disabled, onChange }: Props) {
  if (uses.length === 0) return null;
  return (
    <section className="options" aria-label="Options">
      {uses.map((use) => (
        <details key={use.converter.id} className="option-group" open={uses.length === 1}>
          <summary>
            Options <span className="muted">· {pairsLabel(use)}</span>
          </summary>
          {use.converter.notes && <p className="note">{use.converter.notes}</p>}
          {use.converter.optionsSchema.length === 0 ? (
            <p className="muted">No options.</p>
          ) : (
            <div className="fields">
              {use.converter.optionsSchema.map((field) => (
                <Field
                  key={field.key}
                  field={field}
                  value={values[use.converter.id]?.[field.key]}
                  disabled={disabled}
                  onChange={(v) => onChange(use.converter.id, field.key, v)}
                />
              ))}
            </div>
          )}
        </details>
      ))}
    </section>
  );
}
