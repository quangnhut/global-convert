import { useEffect, useState } from 'react';

interface Props {
  /** Small bar instead of the big empty-state area. */
  compact: boolean;
  scanning: boolean;
  /** Labels of the input formats the converters accept (from the registry). */
  accepts: readonly string[];
  onPaths(paths: string[]): void;
  onPickFiles(): void;
  onPickFolders(): void;
}

/** Accepts files/folders dropped anywhere in the window, plus Add files / Add folder buttons. */
export function DropZone({
  compact,
  scanning,
  accepts,
  onPaths,
  onPickFiles,
  onPickFolders,
}: Props) {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let depth = 0; // dragenter/dragleave fire for every child element
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onOver = (e: DragEvent) => {
      e.preventDefault(); // allow dropping
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const paths = [...(e.dataTransfer?.files ?? [])]
        .map((file) => window.api.pathForFile(file))
        .filter((p) => p.length > 0);
      if (paths.length > 0) onPaths(paths);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [onPaths]);

  const buttons = (
    <div className="row gap">
      <button type="button" onClick={onPickFiles} disabled={scanning}>
        Add files…
      </button>
      <button type="button" onClick={onPickFolders} disabled={scanning}>
        Add folder…
      </button>
    </div>
  );

  return (
    <>
      {compact ? (
        <section className="dropbar" aria-label="Add files">
          <span className="muted">
            {scanning ? 'Scanning…' : 'Drop more files or folders anywhere'}
          </span>
          {buttons}
        </section>
      ) : (
        <section className="dropzone" aria-label="Add files">
          <p className="dropzone-title">{scanning ? 'Scanning…' : 'Drop files or folders here'}</p>
          {accepts.length > 0 && <p className="muted">Supported: {accepts.join(', ')}</p>}
          {buttons}
        </section>
      )}
      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <p>Drop to add</p>
        </div>
      )}
    </>
  );
}
