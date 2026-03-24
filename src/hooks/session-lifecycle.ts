import type { FileSync } from '../file-sync.js';
import type { TierManager } from '../tier-manager.js';

export function createSessionHooks(
  _fileSync: FileSync,
  _tierManager: TierManager,
  _autoRecall: boolean,
  logger: { info(msg: string): void; warn(msg: string): void },
): (api: any) => void {
  return (_api: any) => {
    logger.info('hippodid: session lifecycle handler ready');
  };
}
