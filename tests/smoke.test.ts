import { describe, expect, it } from 'vitest';
import { IPC } from '@shared/ipc';

describe('scaffold', () => {
  it('shared module resolves via @shared alias', () => {
    expect(IPC.appVersion).toBe('app:version');
  });
});
