import { describe, it, expect, vi } from 'vitest';
import { createSessionHooks } from '../../src/hooks/session-lifecycle.js';
import type { FileSync } from '../../src/file-sync.js';
import type { TierManager } from '../../src/tier-manager.js';
import type { OpenClawPluginAPI, TierInfo } from '../../src/types.js';

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

function mockTierManager(shouldHydrate: boolean): TierManager {
  return {
    initialize: vi.fn(async () => FREE_TIER),
    getCurrentTier: vi.fn(() => FREE_TIER),
    shouldMountFileSync: vi.fn(() => true),
    shouldMountAutoRecall: vi.fn(() => false),
    shouldMountAutoCapture: vi.fn(() => false),
    shouldHydrateOnStart: vi.fn(() => shouldHydrate),
    getEffectiveSyncInterval: vi.fn((n: number) => Math.max(n, 60)),
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

describe('SessionLifecycleHooks', () => {
  describe('session:start', () => {
    it('initializes tier and hydrates from cloud when shouldHydrateOnStart is true', async () => {
      const fileSync = mockFileSync();
      const tierManager = mockTierManager(true);
      const api = mockApi();

      const register = createSessionHooks(fileSync, tierManager, false, logger);
      register(api);

      await api._hooks['session:start'][0]();

      expect(tierManager.initialize).toHaveBeenCalledTimes(1);
      expect(fileSync.hydrateFromCloud).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('hydrated 3 files'),
      );
    });

    it('skips hydration when shouldHydrateOnStart is false', async () => {
      const fileSync = mockFileSync();
      const tierManager = mockTierManager(false);
      const api = mockApi();

      const register = createSessionHooks(fileSync, tierManager, true, logger);
      register(api);

      await api._hooks['session:start'][0]();

      expect(tierManager.initialize).toHaveBeenCalledTimes(1);
      expect(fileSync.hydrateFromCloud).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('hydration skipped'),
      );
    });

    it('handles initialization error gracefully', async () => {
      const fileSync = mockFileSync();
      const tierManager = mockTierManager(true);
      tierManager.initialize = vi.fn(async () => {
        throw new Error('Network timeout');
      });
      const api = mockApi();

      const register = createSessionHooks(fileSync, tierManager, false, logger);
      register(api);

      await api._hooks['session:start'][0]();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('session start error'),
      );
    });
  });

  describe('session:end', () => {
    it('flushes files on session end', async () => {
      const fileSync = mockFileSync();
      const tierManager = mockTierManager(true);
      const api = mockApi();

      const register = createSessionHooks(fileSync, tierManager, false, logger);
      register(api);

      await api._hooks['session:end'][0]();

      expect(fileSync.flushNow).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('session ended'),
      );
    });

    it('handles flush error gracefully', async () => {
      const fileSync = mockFileSync();
      fileSync.flushNow = vi.fn(async () => {
        throw new Error('Flush failed');
      });
      const tierManager = mockTierManager(true);
      const api = mockApi();

      const register = createSessionHooks(fileSync, tierManager, false, logger);
      register(api);

      await api._hooks['session:end'][0]();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('session end flush failed'),
      );
    });
  });
});
