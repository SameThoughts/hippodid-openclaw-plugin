import type { FileSync } from '../file-sync.js';
import type { TierManager } from '../tier-manager.js';
import type { OpenClawPluginAPI } from '../types.js';

export function createSessionHooks(
  fileSync: FileSync,
  tierManager: TierManager,
  autoRecallEnabled: boolean,
  logger: { info(msg: string): void; warn(msg: string): void },
): (api: OpenClawPluginAPI) => void {
  return (api: OpenClawPluginAPI) => {
    api.on('session:start', async () => {
      try {
        await tierManager.initialize();

        if (tierManager.shouldHydrateOnStart(autoRecallEnabled)) {
          const count = await fileSync.hydrateFromCloud();
          logger.info(`hippodid: session started, hydrated ${count} files from cloud`);
        } else {
          logger.info('hippodid: session started, hydration skipped (autoRecall active)');
        }
      } catch (e) {
        logger.warn(
          `hippodid: session start error: ${e instanceof Error ? e.message : 'unknown'}`,
        );
      }
    });

    api.on('session:end', async () => {
      try {
        const { synced, changed } = await fileSync.flushNow();
        logger.info(
          `hippodid: session ended, final sync — ${synced} files (${changed} changed)`,
        );
      } catch (e) {
        logger.warn(
          `hippodid: session end flush failed: ${e instanceof Error ? e.message : 'unknown'}`,
        );
      }
    });
  };
}
