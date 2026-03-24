import type { FileSync } from '../file-sync.js';
import type { TierManager } from '../tier-manager.js';

export function createSessionHooks(
  fileSync: FileSync,
  tierManager: TierManager,
  autoRecall: boolean,
  logger: { info(msg: string): void; warn(msg: string): void },
): (api: any) => void {
  return (api: any) => {
    api.on('session_start', async () => {
      try {
        await tierManager.initialize();
        if (!tierManager.shouldHydrateOnStart(autoRecall)) {
          logger.info(
            'hippodid: session start hydration skipped because auto-recall is active',
          );
          return;
        }

        const hydrated = await fileSync.hydrateFromCloud();
        logger.info(`hippodid: session started, hydrated ${hydrated} files`);
      } catch (e) {
        logger.warn(
          `hippodid: session start error: ${e instanceof Error ? e.message : 'unknown'}`,
        );
      }
    });

    api.on('session_end', async () => {
      try {
        const { synced, changed } = await fileSync.flushNow();
        logger.info(
          `hippodid: session ended, flushed ${synced} files (${changed} changed)`,
        );
      } catch (e) {
        logger.warn(
          `hippodid: session end error: ${e instanceof Error ? e.message : 'unknown'}`,
        );
      }
    });

    logger.info('hippodid: session lifecycle hooks registered');
  };
}
