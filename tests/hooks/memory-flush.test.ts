import { describe, it, expect, vi } from 'vitest';
import { createMemoryFlushHook } from '../../src/hooks/memory-flush.js';
import type { FileSync } from '../../src/file-sync.js';

function mockFileSync(): FileSync {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    flushNow: vi.fn(async () => ({ synced: 3, changed: 2 })),
    hydrateFromCloud: vi.fn(async () => 0),
  };
}

const logger = { info: vi.fn(), warn: vi.fn() };

describe('MemoryFlushHook', () => {
  it('registers a compaction flush handler', async () => {
    const fileSync = mockFileSync();
    const api = { on: vi.fn() };
    const register = createMemoryFlushHook(fileSync, logger);
    register(api);

    expect(api.on).toHaveBeenCalledWith(
      'before_compaction',
      expect.any(Function),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('memory flush handler registered'),
    );

    const hookFn = api.on.mock.calls[0][1];
    await hookFn();

    expect(fileSync.flushNow).toHaveBeenCalled();
  });
});
