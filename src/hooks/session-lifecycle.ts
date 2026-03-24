import type { FileSync } from '../file-sync.js';
import type { TierManager } from '../tier-manager.js';

export function createSessionHooks(
  fileSync: FileSync,
  tierManager: TierManager,
  autoRecall: boolean,
  logger: { info(msg: string): void; warn(msg: string): void },
): (api: any) => void {
  return (_api: any) => {
    // OpenClaw 2026 does not support api.on() for session lifecycle events.
    // Session start hydration happens automatically via fileSync.start()
    // which pulls cloud state on initialization.
    logger.info('hippodid: session lifecycle handler ready');
  };
}
