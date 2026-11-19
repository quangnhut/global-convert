import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isEngineHtmlPath } from '../src/main/services/engine-html-path';

const tmp = '/tmp/x';

describe('isEngineHtmlPath', () => {
  it('accepts HTML files directly inside an engine job dir', () => {
    expect(isEngineHtmlPath(join(tmp, 'globalconvert-abc', 'render-1.html'), tmp)).toBe(true);
  });

  it.each([
    ['relative path', 'globalconvert-abc/render-1.html'],
    ['not .html', join(tmp, 'globalconvert-abc', 'render-1.pdf')],
    ['other dir', join(tmp, 'other', 'render-1.html')],
    ['nested deeper', join(tmp, 'globalconvert-abc', 'sub', 'x.html')],
    ['traversal', `${tmp}/globalconvert-abc/../../etc/x.html`],
    ['outside tmp', '/home/user/globalconvert-abc/x.html'],
  ])('rejects %s', (_label, path) => {
    expect(isEngineHtmlPath(path, tmp)).toBe(false);
  });
});
