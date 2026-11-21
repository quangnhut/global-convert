import { describe, expect, it } from 'vitest';
import type { ConverterInfo } from '@shared/converter';
import type { DetectedFile } from '@shared/ipc';
import {
  addFiles,
  applyEvent,
  assignJobs,
  buildRequests,
  commonTargets,
  convertersInUse,
  formatBytes,
  type Row,
  summarize,
  targetOf,
} from '../src/renderer/src/state/batch';

const converters: ConverterInfo[] = [
  {
    id: 'raster',
    family: 'image',
    from: ['png', 'jpg'],
    to: ['png', 'jpg', 'webp'],
    optionsSchema: [],
    defaults: { quality: 80 },
  },
  {
    id: 'img-pdf',
    family: 'image',
    from: ['png', 'jpg'],
    to: ['pdf'],
    optionsSchema: [],
    defaults: {},
  },
  {
    id: 'doc',
    family: 'document',
    from: ['docx'],
    to: ['pdf', 'txt'],
    optionsSchema: [],
    defaults: {},
  },
];

const file = (name: string, format: DetectedFile['format'], error?: string): DetectedFile => ({
  path: `/in/${name}`,
  name,
  size: 2048,
  format,
  ...(error ? { error } : {}),
});

const rows = (...files: DetectedFile[]): Row[] => addFiles([], files);

describe('batch state', () => {
  it('addFiles skips paths already in the list', () => {
    const list = addFiles(rows(file('a.png', 'png')), [file('a.png', 'png'), file('b.jpg', 'jpg')]);
    expect(list.map((r) => r.name)).toEqual(['a.png', 'b.jpg']);
  });

  it('commonTargets intersects targets, never including a file’s own format', () => {
    expect(commonTargets(converters, rows(file('a.png', 'png'), file('b.jpg', 'jpg')))).toEqual([
      'webp',
      'pdf',
    ]);
    // png + docx share only pdf
    expect(commonTargets(converters, rows(file('a.png', 'png'), file('c.docx', 'docx')))).toEqual([
      'pdf',
    ]);
  });

  it('files with errors or their own target do not restrict the batch target', () => {
    const list = rows(
      file('a.png', 'png'),
      file('bad.xyz', null, 'Unsupported file type'),
      file('c.docx', 'docx'),
    );
    list[2] = { ...list[2]!, target: 'txt' };
    expect(commonTargets(converters, list)).toEqual(['jpg', 'webp', 'pdf']);
  });

  it('targetOf: override wins, else batch target if reachable', () => {
    const [png, docx] = rows(file('a.png', 'png'), file('c.docx', 'docx'));
    expect(targetOf(converters, png!, 'webp')).toBe('webp');
    expect(targetOf(converters, docx!, 'webp')).toBeNull();
    expect(targetOf(converters, { ...docx!, target: 'txt' }, 'webp')).toBe('txt');
  });

  it('convertersInUse lists each converter once with its pairs', () => {
    const list = rows(file('a.png', 'png'), file('b.jpg', 'jpg'), file('c.docx', 'docx'));
    const uses = convertersInUse(converters, list, 'pdf');
    expect(uses.map((u) => [u.converter.id, u.pairs])).toEqual([
      [
        'img-pdf',
        [
          { from: 'png', to: 'pdf' },
          { from: 'jpg', to: 'pdf' },
        ],
      ],
      ['doc', [{ from: 'docx', to: 'pdf' }]],
    ]);
  });

  it('buildRequests uses each converter’s options and skips rows without a target', () => {
    const list = rows(file('a.png', 'png'), file('c.docx', 'docx'));
    const requests = buildRequests(converters, list, 'webp', { raster: { quality: 55 } }, null);
    expect(requests).toEqual([
      {
        inputPath: '/in/a.png',
        from: 'png',
        to: 'webp',
        outputDir: null,
        options: { quality: 55 },
      },
    ]);
  });

  it('running rows are not converted again', () => {
    let list = rows(file('a.png', 'png'), file('b.jpg', 'jpg'));
    const [first] = buildRequests(converters, list, 'webp', {}, null);
    list = assignJobs(list, [first!], ['job-a']);
    expect(buildRequests(converters, list, 'webp', {}, null).map((r) => r.inputPath)).toEqual([
      '/in/b.jpg',
    ]);
  });

  it('done rows are skipped until their settings change; failed rows are retried', () => {
    let list = rows(file('a.png', 'png'), file('b.jpg', 'jpg'));
    const opts = { raster: { quality: 80 } };
    list = assignJobs(list, buildRequests(converters, list, 'webp', opts, null), ['j1', 'j2']);
    list = applyEvent(list, { jobId: 'j1', status: 'done', outputs: ['/in/a.webp'] });
    list = applyEvent(list, { jobId: 'j2', status: 'failed', message: 'x' });
    const paths = (o: typeof opts, dir: string | null, target: 'webp' | 'pdf' = 'webp') =>
      buildRequests(converters, list, target, o, dir).map((r) => r.inputPath);
    expect(paths(opts, null)).toEqual(['/in/b.jpg']);
    expect(paths({ raster: { quality: 50 } }, null)).toEqual(['/in/a.png', '/in/b.jpg']);
    expect(paths(opts, '/out')).toEqual(['/in/a.png', '/in/b.jpg']);
    expect(paths(opts, null, 'pdf')).toEqual(['/in/a.png', '/in/b.jpg']);
  });

  it('applyEvent tracks a job through progress to done / failed', () => {
    const start = rows(file('a.png', 'png'), file('b.jpg', 'jpg'));
    let list = assignJobs(start, buildRequests(converters, start, 'webp', {}, null), ['j1', 'j2']);
    list = applyEvent(list, { jobId: 'j1', status: 'progress', ratio: 0.5 });
    expect(list[0]!.job).toEqual({ jobId: 'j1', status: 'running', ratio: 0.5 });
    list = applyEvent(list, { jobId: 'j1', status: 'done', outputs: ['/in/a.webp'] });
    list = applyEvent(list, { jobId: 'j2', status: 'failed', message: 'Broken' });
    list = applyEvent(list, { jobId: 'unknown', status: 'cancelled' });
    expect(summarize(list)).toEqual({ total: 2, active: 0, done: 1, failed: 1, cancelled: 0 });
  });

  it('formatBytes', () => {
    expect([
      formatBytes(900),
      formatBytes(2048),
      formatBytes(5 * 1024 * 1024),
      formatBytes(300 * 1024),
    ]).toEqual(['900 B', '2.0 KB', '5.0 MB', '300 KB']);
  });
});
