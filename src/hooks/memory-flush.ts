import type { FileSync } from '../file-sync.js';

export function createMemoryFlushHook(
  fileSync: FileSync,
  logger: { info(msg: string): void; warn(msg: string): void },
): (api: any) => void {
  return (_api: any) => {
    // OpenClaw 2026 does not support api.on() for event hooks.
    // Pre-compaction flush is available via the hippodid:sync tool,
    // which agents can call explicitly before a compaction.
    // Background sync is handled by fileSync.start() interval.
    logger.info('hippodid: memory flush handler ready (use hippodid:sync tool to trigger)');
  };
}
