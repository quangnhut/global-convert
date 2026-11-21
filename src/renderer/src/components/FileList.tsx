import { targetsFor } from '@shared/capabilities';
import type { ConverterInfo } from '@shared/converter';
import { FORMATS, type FormatId } from '@shared/formats';
import { formatBytes, formatOf, isActive, type Row, targetOf } from '../state/batch';

interface Props {
  rows: readonly Row[];
  converters: readonly ConverterInfo[];
  batchTarget: FormatId | null;
  onTarget(path: string, target: FormatId | null): void;
  onRemove(path: string): void;
  onCancel(jobId: string): void;
  onShow(path: string): void;
}

function Status({
  row,
  onCancel,
  onShow,
}: {
  row: Row;
  onCancel(id: string): void;
  onShow(p: string): void;
}) {
  const job = row.job;
  if (row.error) return <span className="status status-error">{row.error}</span>;
  if (!job) return <span className="muted">Ready</span>;
  switch (job.status) {
    case 'queued':
    case 'running':
      return (
        <span className="status">
          <progress
            max={1}
            value={job.status === 'running' ? job.ratio : undefined}
            aria-label="Progress"
          />
          <button type="button" className="link" onClick={() => onCancel(job.jobId)}>
            Cancel
          </button>
        </span>
      );
    case 'done':
      return (
        <span className="status status-done">
          {job.outputs.length === 1 ? 'Done' : `Done · ${job.outputs.length} files`}
          {job.outputs[0] && (
            <button type="button" className="link" onClick={() => onShow(job.outputs[0]!)}>
              Show
            </button>
          )}
        </span>
      );
    case 'failed':
      return (
        <span className="status status-error" title={job.message}>
          Failed: {job.message}
        </span>
      );
    case 'cancelled':
      return <span className="muted">Cancelled</span>;
  }
}

/** The file list: detected type, size, per-file target override and conversion status. */
export function FileList({
  rows,
  converters,
  batchTarget,
  onTarget,
  onRemove,
  onCancel,
  onShow,
}: Props) {
  return (
    <table className="files">
      <thead>
        <tr>
          <th>File</th>
          <th>Type</th>
          <th className="num">Size</th>
          <th>Convert to</th>
          <th>Status</th>
          <th aria-label="Remove" />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const format = formatOf(row);
          const targets = format ? targetsFor(converters, format) : [];
          const effective = targetOf(converters, row, batchTarget);
          const active = isActive(row);
          return (
            <tr key={row.path} className={row.error ? 'row-error' : undefined}>
              <td className="name" title={row.path}>
                {row.name}
              </td>
              <td>{row.format ? FORMATS[row.format].label : '—'}</td>
              <td className="num">{row.error ? '' : formatBytes(row.size)}</td>
              <td>
                {format && targets.length > 0 ? (
                  <select
                    aria-label={`Convert ${row.name} to`}
                    value={row.target ?? ''}
                    disabled={active}
                    onChange={(e) =>
                      onTarget(row.path, (e.target.value || null) as FormatId | null)
                    }
                  >
                    <option value="">
                      {effective && !row.target
                        ? `${FORMATS[effective].label} (batch)`
                        : 'Batch target'}
                    </option>
                    {targets.map((t) => (
                      <option key={t} value={t}>
                        {FORMATS[t].label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td>
                <Status row={row} onCancel={onCancel} onShow={onShow} />
              </td>
              <td>
                <button
                  type="button"
                  className="icon"
                  aria-label={`Remove ${row.name}`}
                  title="Remove"
                  disabled={active}
                  onClick={() => onRemove(row.path)}
                >
                  ×
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
