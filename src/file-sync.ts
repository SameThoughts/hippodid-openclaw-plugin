import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import type { HippoDidClient } from './hippodid-client.js';
import type { PluginConfig, FileTrackingEntry, WatchPath } from './types.js';

export interface FileSync {
  start(): void;
  stop(): void;
  flushNow(): Promise<{ synced: number; changed: number }>;
  hydrateFromCloud(): Promise<number>;
}

interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

export function createFileSync(
  client: HippoDidClient,
  config: PluginConfig,
  watchPaths: WatchPath[],
  logger: Logger,
  effectiveSyncIntervalSeconds?: number,
): FileSync {
  const syncIntervalMs = (effectiveSyncIntervalSeconds ?? config.syncIntervalSeconds) * 1000;
  const tracking = new Map<string, FileTrackingEntry>();
  const watchers: FSWatcher[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingChanges = new Set<string>();

  async function computeHash(filePath: string): Promise<string> {
    const content = await readFile(filePath);
    return createHash('sha256').update(content).digest('hex');
  }

  function toBase64(buffer: Buffer): string {
    return buffer.toString('base64');
  }

  function fromBase64(content: string): string {
    return Buffer.from(content, 'base64').toString('utf-8');
  }

  async function resolveFilesForPath(wp: WatchPath): Promise<string[]> {
    try {
      const s = await stat(wp.path);
      if (s.isDirectory()) {
        const entries = await readdir(wp.path);
        return entries
          .filter((e) => extname(e) === '.md')
          .map((e) => resolve(join(wp.path, e)));
      }
      return [resolve(wp.path)];
    } catch {
      return [];
    }
  }

  async function resolveAllFiles(): Promise<
    Array<{ filePath: string; label: string }>
  > {
    const files: Array<{ filePath: string; label: string }> = [];
    const seen = new Set<string>();

    for (const wp of watchPaths) {
      const resolved = await resolveFilesForPath(wp);
      for (const filePath of resolved) {
        if (!seen.has(filePath)) {
          seen.add(filePath);
          files.push({ filePath, label: wp.label });
        }
      }
    }
    return files;
  }

  async function syncFile(
    filePath: string,
    label: string,
  ): Promise<boolean> {
    try {
      const content = await readFile(filePath);
      const hash = createHash('sha256').update(content).digest('hex');
      const existing = tracking.get(filePath);

      if (existing && existing.hash === hash) {
        return false;
      }

      const base64Content = toBase64(content);
      const result = await client.syncFile(
        config.characterId,
        filePath,
        label,
        base64Content,
        hash,
      );

      if (result.ok) {
        tracking.set(filePath, { hash, lastSyncedAt: new Date() });
        return result.value.changed;
      }

      logger.warn(`hippodid: sync failed for ${filePath}: ${result.error.message}`);
      return false;
    } catch (e) {
      logger.warn(
        `hippodid: error syncing ${filePath}: ${e instanceof Error ? e.message : 'unknown'}`,
      );
      return false;
    }
  }

  async function runSync(): Promise<{ synced: number; changed: number }> {
    const files = await resolveAllFiles();
    let synced = 0;
    let changed = 0;

    for (const { filePath, label } of files) {
      const wasChanged = await syncFile(filePath, label);
      synced++;
      if (wasChanged) changed++;
    }

    logger.info(
      `hippodid: synced ${synced} files (${changed} changed, ${synced - changed} unchanged)`,
    );
    return { synced, changed };
  }

  function scheduleDebouncedSync(): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(
      () => {
        debounceTimer = null;
        runSync().catch((e) => {
          logger.warn(
            `hippodid: debounced sync error: ${e instanceof Error ? e.message : 'unknown'}`,
          );
        });
      },
      syncIntervalMs,
    );
  }

  function onFileChange(filePath: string): void {
    pendingChanges.add(filePath);
    scheduleDebouncedSync();
  }

  return {
    start(): void {
      for (const wp of watchPaths) {
        try {
          const watcher = watch(wp.path, { persistent: false }, (_event, filename) => {
            if (filename && extname(filename) === '.md') {
              const fullPath = resolve(
                join(
                  wp.path.endsWith('.md') ? resolve(wp.path, '..') : wp.path,
                  filename,
                ),
              );
              onFileChange(fullPath);
            } else if (wp.path.endsWith('.md')) {
              onFileChange(resolve(wp.path));
            }
          });
          watcher.on('error', (err) => {
            logger.warn(
              `hippodid: watcher error for ${wp.path}: ${err instanceof Error ? err.message : 'unknown'}`,
            );
          });
          watchers.push(watcher);
        } catch (e) {
          logger.warn(
            `hippodid: failed to watch ${wp.path}: ${e instanceof Error ? e.message : 'unknown'}`,
          );
        }
      }

      scheduleDebouncedSync();
    },

    stop(): void {
      for (const w of watchers) {
        w.close();
      }
      watchers.length = 0;

      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }

      pendingChanges.clear();
    },

    async flushNow(): Promise<{ synced: number; changed: number }> {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      return runSync();
    },

    async hydrateFromCloud(): Promise<number> {
      const files = await resolveAllFiles();
      let hydrated = 0;

      for (const { filePath } of files) {
        try {
          const result = await client.getLatestSync(
            config.characterId,
            filePath,
          );
          if (!result.ok) {
            logger.warn(
              `hippodid: hydration lookup failed for ${filePath}: ${result.error.message}`,
            );
            continue;
          }

          if (result.value === null) {
            continue;
          }

          const cloudContent = fromBase64(result.value.fileContent);
          await writeFile(filePath, cloudContent, 'utf-8');

          const hash = createHash('sha256')
            .update(Buffer.from(cloudContent))
            .digest('hex');
          tracking.set(filePath, { hash, lastSyncedAt: new Date() });
          hydrated++;
        } catch (e) {
          logger.warn(
            `hippodid: hydration error for ${filePath}: ${e instanceof Error ? e.message : 'unknown'}`,
          );
        }
      }

      logger.info(`hippodid: hydrated ${hydrated} files from cloud`);
      return hydrated;
    },
  };
}
