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
  it('logs ready message without calling api.on', () => {
    const fileSync = mockFileSync();
    const api = { registerTool: vi.fn() };
    const register = createMemoryFlushHook(fileSync, logger);
    register(api);

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('memory flush handler ready'),
    );
  });
});
