import type { FileSync } from '../file-sync.js';
import type { OpenClawPluginAPI } from '../types.js';

export function createMemoryFlushHook(
  fileSync: FileSync,
  logger: { info(msg: string): void; warn(msg: string): void },
): (api: OpenClawPluginAPI) => void {
  return (api: OpenClawPluginAPI) => {
    api.hooks.on('memoryFlush', async () => {
      try {
        const { synced, changed } = await fileSync.flushNow();
        logger.info(
          `hippodid: pre-compaction flush — synced ${synced} files (${changed} changed)`,
        );
      } catch (e) {
        logger.warn(
          `hippodid: pre-compaction flush failed: ${e instanceof Error ? e.message : 'unknown'}`,
        );
      }
    });
  };
}
