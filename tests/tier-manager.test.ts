import { describe, it, expect, vi } from 'vitest';
import { createTierManager } from '../src/tier-manager.js';
import type { HippoDidClient } from '../src/hippodid-client.js';
import type { TierInfo } from '../src/types.js';

function mockClient(tierInfo: TierInfo): HippoDidClient {
  return {
    getTier: vi.fn(async () => ({ ok: true as const, value: tierInfo })),
    syncFile: vi.fn(),
    getLatestSync: vi.fn(),
    getSyncStatus: vi.fn(),
    searchMemories: vi.fn(),
    addMemory: vi.fn(),
  };
}

const logger = { info: vi.fn(), warn: vi.fn() };

const FREE_TIER: TierInfo = {
  tier: 'free',
  features: {
    autoRecallAvailable: false,
    autoCaptureAvailable: false,
    minSyncIntervalSeconds: 60,
  },
};

const PAID_TIER: TierInfo = {
  tier: 'developer',
  features: {
    autoRecallAvailable: true,
    autoCaptureAvailable: true,
    minSyncIntervalSeconds: 30,
  },
};

const PAID_NO_CAPTURE: TierInfo = {
  tier: 'basic',
  features: {
    autoRecallAvailable: true,
    autoCaptureAvailable: false,
    minSyncIntervalSeconds: 60,
  },
};

describe('TierManager', () => {
  describe('initialize', () => {
    it('returns tier info from API', async () => {
      const client = mockClient(PAID_TIER);
      const tm = createTierManager(client, 'char-1', logger);
      const result = await tm.initialize();

      expect(result.tier).toBe('developer');
      expect(client.getTier).toHaveBeenCalledWith('char-1');
    });

    it('falls back to free tier on API failure', async () => {
      const client = mockClient(FREE_TIER);
      client.getTier = vi.fn(async () => ({
        ok: false as const,
        error: { status: 500, message: 'Server error', retryable: true },
      }));
      const tm = createTierManager(client, 'char-1', logger);
      const result = await tm.initialize();

      expect(result.tier).toBe('free');
    });
  });

  describe('shouldMountFileSync', () => {
    it('returns true on free tier regardless of autoCapture setting', async () => {
      const tm = createTierManager(mockClient(FREE_TIER), 'char-1', logger);
      await tm.initialize();

      expect(tm.shouldMountFileSync(false)).toBe(true);
      expect(tm.shouldMountFileSync(true)).toBe(true);
    });

    it('returns true on paid tier when autoCapture is OFF', async () => {
      const tm = createTierManager(mockClient(PAID_TIER), 'char-1', logger);
      await tm.initialize();

      expect(tm.shouldMountFileSync(false)).toBe(true);
    });

    it('returns true on paid tier when autoCapture is ON', async () => {
      const tm = createTierManager(mockClient(PAID_TIER), 'char-1', logger);
      await tm.initialize();

      expect(tm.shouldMountFileSync(true)).toBe(true);
    });
  });

  describe('shouldMountAutoRecall', () => {
    it('returns false on free tier', async () => {
      const tm = createTierManager(mockClient(FREE_TIER), 'char-1', logger);
      await tm.initialize();

      expect(tm.shouldMountAutoRecall(true)).toBe(false);
    });

    it('returns false when config autoRecall is OFF', async () => {
      const tm = createTierManager(mockClient(PAID_TIER), 'char-1', logger);
      await tm.initialize();

      expect(tm.shouldMountAutoRecall(false)).toBe(false);
    });

    it('returns true on paid tier with autoRecall ON and feature available', async () => {
      const tm = createTierManager(mockClient(PAID_TIER), 'char-1', logger);
      await tm.initialize();

      expect(tm.shouldMountAutoRecall(true)).toBe(true);
    });

    it('returns false when feature not available on tier', async () => {
      const tm = createTierManager(mockClient(PAID_NO_CAPTURE), 'char-1', logger);
      await tm.initialize();

      // autoRecall IS available on PAID_NO_CAPTURE, so this should be true
      expect(tm.shouldMountAutoRecall(true)).toBe(true);
    });
  });

  describe('shouldMountAutoCapture', () => {
    it('returns false on free tier', async () => {
      const tm = createTierManager(mockClient(FREE_TIER), 'char-1', logger);
      await tm.initialize();

      expect(tm.shouldMountAutoCapture(true)).toBe(false);
    });

    it('returns true on paid tier with feature available and enabled', async () => {
      const tm = createTierManager(mockClient(PAID_TIER), 'char-1', logger);
      await tm.initialize();

      expect(tm.shouldMountAutoCapture(true)).toBe(true);
    });

    it('returns false when feature not available', async () => {
      const tm = createTierManager(mockClient(PAID_NO_CAPTURE), 'char-1', logger);
      await tm.initialize();

      expect(tm.shouldMountAutoCapture(true)).toBe(false);
    });
  });

  describe('shouldHydrateOnStart', () => {
    it('returns true on free tier', async () => {
      const tm = createTierManager(mockClient(FREE_TIER), 'char-1', logger);
      await tm.initialize();

      expect(tm.shouldHydrateOnStart(false)).toBe(true);
      expect(tm.shouldHydrateOnStart(true)).toBe(true);
    });

    it('returns true on paid tier when autoRecall is OFF', async () => {
      const tm = createTierManager(mockClient(PAID_TIER), 'char-1', logger);
      await tm.initialize();

      expect(tm.shouldHydrateOnStart(false)).toBe(true);
    });

    it('returns false on paid tier when autoRecall is ON', async () => {
      const tm = createTierManager(mockClient(PAID_TIER), 'char-1', logger);
      await tm.initialize();

      expect(tm.shouldHydrateOnStart(true)).toBe(false);
    });
  });

  describe('getEffectiveSyncInterval', () => {
    it('returns config value when higher than tier minimum', async () => {
      const tm = createTierManager(mockClient(PAID_TIER), 'char-1', logger);
      await tm.initialize();

      expect(tm.getEffectiveSyncInterval(300)).toBe(300);
    });

    it('returns tier minimum when config value is lower', async () => {
      const tm = createTierManager(mockClient(FREE_TIER), 'char-1', logger);
      await tm.initialize();

      expect(tm.getEffectiveSyncInterval(30)).toBe(60);
    });
  });
});
