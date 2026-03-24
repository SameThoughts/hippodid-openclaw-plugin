import { describe, it, expect, vi } from 'vitest';
import { createSessionHooks } from '../../src/hooks/session-lifecycle.js';
import type { FileSync } from '../../src/file-sync.js';
import type { TierManager } from '../../src/tier-manager.js';
import type { TierInfo } from '../../src/types.js';

const FREE_TIER: TierInfo = {
  tier: 'free',
  features: {
    autoRecallAvailable: false,
    autoCaptureAvailable: false,
    minSyncIntervalSeconds: 60,
  },
};

function mockFileSync(): FileSync {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    flushNow: vi.fn(async () => ({ synced: 2, changed: 1 })),
    hydrateFromCloud: vi.fn(async () => 3),
  };
}

function mockTierManager(): TierManager {
  return {
    initialize: vi.fn(async () => FREE_TIER),
    getCurrentTier: vi.fn(() => FREE_TIER),
    shouldMountFileSync: vi.fn(() => true),
    shouldMountAutoRecall: vi.fn(() => false),
    shouldMountAutoCapture: vi.fn(() => false),
    shouldHydrateOnStart: vi.fn(() => true),
    getEffectiveSyncInterval: vi.fn((n: number) => Math.max(n, 60)),
  };
}

const logger = { info: vi.fn(), warn: vi.fn() };

describe('SessionLifecycleHooks', () => {
  it('registers session lifecycle handlers', async () => {
    const fileSync = mockFileSync();
    const tierManager = mockTierManager();
    const api = { on: vi.fn() };

    const register = createSessionHooks(fileSync, tierManager, false, logger);
    register(api);

    expect(api.on).toHaveBeenCalledTimes(2);
    expect(api.on).toHaveBeenNthCalledWith(
      1,
      'session_start',
      expect.any(Function),
    );
    expect(api.on).toHaveBeenNthCalledWith(
      2,
      'session_end',
      expect.any(Function),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('session lifecycle hooks registered'),
    );

    const startFn = api.on.mock.calls[0][1];
    await startFn();
    expect(tierManager.initialize).toHaveBeenCalled();
    expect(fileSync.hydrateFromCloud).toHaveBeenCalled();

    const endFn = api.on.mock.calls[1][1];
    await endFn();
    expect(fileSync.flushNow).toHaveBeenCalled();
  });
});
