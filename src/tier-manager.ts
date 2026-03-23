import type { HippoDidClient } from './hippodid-client.js';
import type { TierInfo } from './types.js';

export interface TierManager {
  initialize(): Promise<TierInfo>;
  getCurrentTier(): TierInfo;
  shouldMountFileSync(autoCaptureEnabled: boolean): boolean;
  shouldMountAutoRecall(autoRecallEnabled: boolean): boolean;
  shouldMountAutoCapture(autoCaptureEnabled: boolean): boolean;
  shouldHydrateOnStart(autoRecallEnabled: boolean): boolean;
  getEffectiveSyncInterval(configInterval: number): number;
}

const FREE_TIER_FALLBACK: TierInfo = {
  tier: 'free',
  features: {
    autoRecallAvailable: false,
    autoCaptureAvailable: false,
    minSyncIntervalSeconds: 60,
  },
};

export function createTierManager(
  client: HippoDidClient,
  characterId: string,
  logger: { info(msg: string): void; warn(msg: string): void },
): TierManager {
  let currentTier: TierInfo = FREE_TIER_FALLBACK;

  return {
    async initialize(): Promise<TierInfo> {
      const result = await client.getTier(characterId);

      if (result.ok) {
        currentTier = result.value;
      } else {
        logger.warn(
          `hippodid: failed to fetch tier, defaulting to free: ${result.error.message}`,
        );
        currentTier = FREE_TIER_FALLBACK;
      }

      logger.info(
        `hippodid: tier=${currentTier.tier}, autoRecall=${currentTier.features.autoRecallAvailable ? 'available' : 'unavailable'}, autoCapture=${currentTier.features.autoCaptureAvailable ? 'available' : 'unavailable'}`,
      );

      return currentTier;
    },

    getCurrentTier(): TierInfo {
      return currentTier;
    },

    shouldMountFileSync(autoCaptureEnabled: boolean): boolean {
      const isFree = !isPaidTier(currentTier);
      if (isFree) return true;
      return !autoCaptureEnabled;
    },

    shouldMountAutoRecall(autoRecallEnabled: boolean): boolean {
      return (
        isPaidTier(currentTier) &&
        autoRecallEnabled &&
        currentTier.features.autoRecallAvailable
      );
    },

    shouldMountAutoCapture(autoCaptureEnabled: boolean): boolean {
      return (
        isPaidTier(currentTier) &&
        autoCaptureEnabled &&
        currentTier.features.autoCaptureAvailable
      );
    },

    shouldHydrateOnStart(autoRecallEnabled: boolean): boolean {
      const isFree = !isPaidTier(currentTier);
      if (isFree) return true;
      return !autoRecallEnabled;
    },

    getEffectiveSyncInterval(configInterval: number): number {
      return Math.max(configInterval, currentTier.features.minSyncIntervalSeconds);
    },
  };
}

function isPaidTier(tier: TierInfo): boolean {
  return tier.tier !== 'free';
}
