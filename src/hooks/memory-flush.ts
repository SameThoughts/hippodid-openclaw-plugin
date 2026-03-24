import type { FileSync } from '../file-sync.js';

export function createMemoryFlushHook(
  fileSync: FileSync,
  logger: { info(msg: string): void; warn(msg: string): void },
): (api: any) => void {
  return (api: any) => {
    api.on('before_compaction', async () => {
      try {
        const { synced, changed } = await fileSync.flushNow();
        logger.info(
          `hippodid: flushed ${synced} files before compaction (${changed} changed)`,
        );
      } catch (e) {
        logger.warn(
          `hippodid: compaction flush failed: ${e instanceof Error ? e.message : 'unknown'}`,
        );
      }
    });

    logger.info('hippodid: memory flush handler registered');
  };
}
