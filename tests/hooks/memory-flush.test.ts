import { describe, it, expect, vi } from 'vitest';
import { createMemoryFlushHook } from '../../src/hooks/memory-flush.js';
import type { FileSync } from '../../src/file-sync.js';
import type { OpenClawPluginAPI } from '../../src/types.js';

function mockFileSync(): FileSync {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    flushNow: vi.fn(async () => ({ synced: 3, changed: 2 })),
    hydrateFromCloud: vi.fn(async () => 0),
  };
}

function mockApi(): OpenClawPluginAPI & { _hooks: Record<string, Function[]> } {
  const hooks: Record<string, Function[]> = {};
  return {
    _hooks: hooks,
    config: {} as any,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    on: (event: string, handler: Function) => {
      if (!hooks[event]) hooks[event] = [];
      hooks[event].push(handler);
    },
    context: { prepend: vi.fn() },
    commands: { register: vi.fn() },
  };
}

const logger = { info: vi.fn(), warn: vi.fn() };

describe('MemoryFlushHook', () => {
  it('registers memoryFlush hook', () => {
    const fileSync = mockFileSync();
    const api = mockApi();
    const register = createMemoryFlushHook(fileSync, logger);
    register(api);

    expect(api._hooks['memoryFlush']).toBeDefined();
    expect(api._hooks['memoryFlush'].length).toBe(1);
  });

  it('calls flushNow on memoryFlush event', async () => {
    const fileSync = mockFileSync();
    const api = mockApi();
    const register = createMemoryFlushHook(fileSync, logger);
    register(api);

    await api._hooks['memoryFlush'][0]();

    expect(fileSync.flushNow).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('pre-compaction flush'),
    );
  });

  it('logs warning on flush failure', async () => {
    const fileSync = mockFileSync();
    fileSync.flushNow = vi.fn(async () => {
      throw new Error('Network timeout');
    });
    const api = mockApi();
    const register = createMemoryFlushHook(fileSync, logger);
    register(api);

    await api._hooks['memoryFlush'][0]();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('flush failed'),
    );
  });
});
