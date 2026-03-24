import type { FileSync } from '../file-sync.js';

export function createMemoryFlushHook(
  _fileSync: FileSync,
  logger: { info(msg: string): void; warn(msg: string): void },
): (api: any) => void {
  return (_api: any) => {
    logger.info(
      'hippodid: memory flush handler ready (use hippodid:sync tool to trigger)',
    );
  };
}
