import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { targetsFor } from '@shared/capabilities';
import type { ConverterInfo, OptionValue, OptionValues } from '@shared/converter';
import { FORMAT_IDS, FORMATS, type FormatId } from '@shared/formats';
import type { ConversionEvent } from '@shared/ipc';
import logo from './assets/logo.png';
import { DropZone } from './components/DropZone';
import { FileList } from './components/FileList';
import { FormatPicker } from './components/FormatPicker';
import { OptionsPanel } from './components/OptionsPanel';
import {
  addFiles,
  applyEvent,
  assignJobs,
  buildRequests,
  commonTargets,
  convertersInUse,
  defaultOptions,
  type Row,
  summarize,
} from './state/batch';

const errorText = (err: unknown) =>
  (err instanceof Error ? err.message : String(err)).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    '',
  );

export function App() {
  const [converters, setConverters] = useState<ConverterInfo[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [chosenTarget, setBatchTarget] = useState<FormatId | null>(null);
  const [options, setOptions] = useState<Record<string, OptionValues>>({});
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState('');
  /** Events for job ids we haven't been told about yet (they can beat the start reply). */
  const early = useRef(new Map<string, ConversionEvent[]>());
  const knownJobs = useRef(new Set<string>());

  useEffect(() => {
    void window.api.getAppVersion().then(setVersion);
    window.api
      .getConverters()
      .then((list) => {
        setConverters(list);
        setOptions(defaultOptions(list));
      })
      .catch((err: unknown) => setError(errorText(err)));
    return window.api.onConversionEvent((event) => {
      if (!knownJobs.current.has(event.jobId)) {
        const queue = early.current.get(event.jobId) ?? [];
        queue.push(event);
        early.current.set(event.jobId, queue);
        return;
      }
      setRows((current) => applyEvent(current, event));
    });
  }, []);

  const accepts = useMemo(
    () =>
      FORMAT_IDS.filter((f) => targetsFor(converters, f).length > 0).map((f) => FORMATS[f].label),
    [converters],
  );
  const targets = useMemo(() => commonTargets(converters, rows), [converters, rows]);
  // The chosen batch target, unless the current files can no longer reach it.
  const batchTarget = chosenTarget && targets.includes(chosenTarget) ? chosenTarget : null;
  const uses = useMemo(
    () => convertersInUse(converters, rows, batchTarget),
    [converters, rows, batchTarget],
  );
  const pending = useMemo(
    () => buildRequests(converters, rows, batchTarget, options, outputDir),
    [converters, rows, batchTarget, options, outputDir],
  );
  const summary = useMemo(() => summarize(rows), [rows]);
  const busy = summary.active > 0;

  const addPaths = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return;
    setScanning(true);
    setError(null);
    try {
      const files = await window.api.detectFiles(paths);
      setRows((current) => addFiles(current, files));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setScanning(false);
    }
  }, []);

  const pickFiles = useCallback(() => void window.api.pickFiles().then(addPaths), [addPaths]);
  const pickFolders = useCallback(() => void window.api.pickFolders().then(addPaths), [addPaths]);

  const setOption = (converterId: string, key: string, value: OptionValue) =>
    setOptions((current) => ({
      ...current,
      [converterId]: { ...current[converterId], [key]: value },
    }));

  const start = async () => {
    const requests = pending;
    if (requests.length === 0) return;
    setError(null);
    try {
      const jobIds = await window.api.startConversion(requests);
      jobIds.forEach((id) => knownJobs.current.add(id));
      setRows((current) => {
        let next = assignJobs(current, requests, jobIds);
        for (const id of jobIds) {
          for (const event of early.current.get(id) ?? []) next = applyEvent(next, event);
          early.current.delete(id);
        }
        return next;
      });
    } catch (err) {
      setError(errorText(err));
    }
  };

  const showOutput = (path: string) =>
    void window.api.showOutput(path).catch((err: unknown) => setError(errorText(err)));

  const firstOutput = rows.flatMap((r) => (r.job?.status === 'done' ? r.job.outputs : []))[0];

  return (
    <div className="app">
      <header className="header">
        <img className="logo" src={logo} alt="" width={28} height={28} />
        <h1>GlobalConvert</h1>
        <span className="muted version">v{version}</span>
      </header>

      <main className="content">
        <DropZone
          compact={rows.length > 0}
          scanning={scanning}
          accepts={accepts}
          onPaths={(paths) => void addPaths(paths)}
          onPickFiles={pickFiles}
          onPickFolders={pickFolders}
        />

        {error && (
          <div className="banner banner-error" role="alert">
            {error}
            <button
              type="button"
              className="icon"
              aria-label="Dismiss"
              onClick={() => setError(null)}
            >
              ×
            </button>
          </div>
        )}

        {rows.length > 0 && (
          <>
            <section className="toolbar" aria-label="Conversion settings">
              <FormatPicker
                targets={targets}
                value={batchTarget}
                disabled={busy}
                onChange={setBatchTarget}
              />
              <div className="output">
                <span>Save to</span>
                <label className="field-check">
                  <input
                    type="radio"
                    name="output"
                    checked={outputDir === null}
                    disabled={busy}
                    onChange={() => setOutputDir(null)}
                  />
                  <span>Same folder as each file</span>
                </label>
                <label className="field-check">
                  <input
                    type="radio"
                    name="output"
                    checked={outputDir !== null}
                    disabled={busy}
                    onChange={() =>
                      void window.api.pickOutputDir().then((dir) => dir && setOutputDir(dir))
                    }
                  />
                  <span>Folder:</span>
                </label>
                <button
                  type="button"
                  className="path"
                  disabled={busy}
                  title={outputDir ?? undefined}
                  onClick={() =>
                    void window.api.pickOutputDir().then((dir) => dir && setOutputDir(dir))
                  }
                >
                  {outputDir ?? 'Choose…'}
                </button>
              </div>
            </section>

            <OptionsPanel uses={uses} values={options} disabled={busy} onChange={setOption} />

            <section className="actions" aria-label="Actions">
              <button
                type="button"
                className="primary"
                disabled={busy || pending.length === 0}
                onClick={() => void start()}
              >
                {pending.length === 1 ? 'Convert 1 file' : `Convert ${pending.length} files`}
              </button>
              {busy && (
                <button type="button" onClick={() => void window.api.cancelConversion()}>
                  Cancel all
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setRows([]);
                  setBatchTarget(null);
                }}
              >
                Clear list
              </button>
              <span className="muted summary" aria-live="polite">
                {summary.total} files
                {summary.active > 0 && ` · ${summary.active} in progress`}
                {summary.done > 0 && ` · ${summary.done} done`}
                {summary.failed > 0 && ` · ${summary.failed} failed`}
                {summary.cancelled > 0 && ` · ${summary.cancelled} cancelled`}
              </span>
              {firstOutput && !busy && (
                <button type="button" className="link" onClick={() => showOutput(firstOutput)}>
                  Open output folder
                </button>
              )}
            </section>

            <FileList
              rows={rows}
              converters={converters}
              batchTarget={batchTarget}
              onTarget={(path, target) =>
                setRows((current) => current.map((r) => (r.path === path ? { ...r, target } : r)))
              }
              onRemove={(path) => setRows((current) => current.filter((r) => r.path !== path))}
              onCancel={(jobId) => void window.api.cancelConversion(jobId)}
              onShow={showOutput}
            />
          </>
        )}
      </main>
    </div>
  );
}
