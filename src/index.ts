import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { PluginConfig } from './types.js';
import { createClient, type HippoDidClient } from './hippodid-client.js';
import { createFileSync, type FileSync } from './file-sync.js';
import { resolveWatchPaths } from './workspace-detector.js';
import { createTierManager, type TierManager } from './tier-manager.js';
import { createMemoryFlushHook } from './hooks/memory-flush.js';
import { createSessionHooks } from './hooks/session-lifecycle.js';
import { createAutoRecallHook } from './hooks/auto-recall.js';
import { createAutoCaptureHook } from './hooks/auto-capture.js';

const VERSION = '1.0.0';

export default {
  id: 'hippodid',

  register(api: any): void {
    try {
      const config = resolveConfig(api.config);
      const logger = api.logger ?? {
        info: (msg: string) => console.log(msg),
        warn: (msg: string) => console.warn(msg),
        error: (msg: string) => console.error(msg),
      };

      const client = createClient(config.apiKey, config.baseUrl);
      const tierManager = createTierManager(
        client,
        config.characterId,
        logger,
      );
      const watchPaths = resolveWatchPaths(config);
      const effectiveSyncInterval = Math.max(
        config.syncIntervalSeconds,
        60,
      );
      const fileSync = createFileSync(
        client,
        config,
        watchPaths,
        logger,
        effectiveSyncInterval,
      );

      logger.info(`HippoDid loaded — character: ${config.characterId}`);

      const registerMemoryFlush = createMemoryFlushHook(fileSync, logger);
      registerMemoryFlush(api);

      const registerSessionHooks = createSessionHooks(
        fileSync,
        tierManager,
        config.autoRecall,
        logger,
      );
      registerSessionHooks(api);

      tierManager
        .initialize()
        .then((tier) => {
          if (tierManager.shouldMountAutoRecall(config.autoRecall)) {
            const registerAutoRecall = createAutoRecallHook(
              client,
              config,
              logger,
            );
            registerAutoRecall(api);
          }

          if (tierManager.shouldMountAutoCapture(config.autoCapture)) {
            const registerAutoCapture = createAutoCaptureHook(
              client,
              config,
              logger,
            );
            registerAutoCapture(api);
          }

          if (tierManager.shouldMountFileSync(config.autoCapture)) {
            fileSync.start();
          }

          const autoRecallStatus = tierManager.shouldMountAutoRecall(
            config.autoRecall,
          )
            ? 'ON'
            : 'OFF';
          const autoCaptureStatus = tierManager.shouldMountAutoCapture(
            config.autoCapture,
          )
            ? 'ON'
            : 'OFF';

          logger.info(
            `hippodid: v${VERSION} | character: ${config.characterId} | tier: ${tier.tier} | watching ${watchPaths.length} paths | autoRecall: ${autoRecallStatus} | autoCapture: ${autoCaptureStatus}`,
          );
        })
        .catch((e) => {
          logger.warn(
            `hippodid: tier initialization failed, running in free mode: ${e instanceof Error ? e.message : 'unknown'}`,
          );
          fileSync.start();
        });

      registerCommands(api, config, client, fileSync, tierManager, logger);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      (api.logger ?? console).error(
        `hippodid: plugin initialization failed: ${msg}`,
      );
    }
  },
};

function resolveConfig(raw: any): PluginConfig {
  return {
    apiKey: raw.apiKey,
    characterId: raw.characterId,
    baseUrl: raw.baseUrl ?? 'https://api.hippodid.com',
    syncIntervalSeconds: raw.syncIntervalSeconds ?? 300,
    autoRecall: raw.autoRecall ?? false,
    autoCapture: raw.autoCapture ?? false,
    additionalPaths: raw.additionalPaths ?? [],
  };
}

function registerCommands(
  api: any,
  config: PluginConfig,
  client: HippoDidClient,
  fileSync: FileSync,
  tierManager: TierManager,
  logger: { info(msg: string): void; warn(msg: string): void },
): void {
  api.registerTool('hippodid:status', {
    description: 'Show HippoDid tier, sync status, and watched paths',
    handler: async () => {
      const tier = tierManager.getCurrentTier();
      const statusResult = await client.getSyncStatus(config.characterId);

      logger.info(`--- HippoDid Status ---`);
      logger.info(`Character: ${config.characterId}`);
      logger.info(`Tier: ${tier.tier}`);
      logger.info(
        `Auto-Recall: ${tier.features.autoRecallAvailable ? 'available' : 'unavailable'} (config: ${config.autoRecall ? 'ON' : 'OFF'})`,
      );
      logger.info(
        `Auto-Capture: ${tier.features.autoCaptureAvailable ? 'available' : 'unavailable'} (config: ${config.autoCapture ? 'ON' : 'OFF'})`,
      );

      if (statusResult.ok) {
        logger.info(`Synced sources: ${statusResult.value.entries.length}`);
        for (const entry of statusResult.value.entries) {
          logger.info(
            `  ${entry.sourcePath} (${entry.label}) — last sync: ${entry.lastSyncedAt}`,
          );
        }
      } else {
        logger.warn(
          `Could not fetch sync status: ${statusResult.error.message}`,
        );
      }
    },
  });

  api.registerTool('hippodid:sync', {
    description: 'Trigger immediate sync of all watched files',
    handler: async () => {
      logger.info('hippodid: manual sync triggered...');
      const { synced, changed } = await fileSync.flushNow();
      logger.info(
        `hippodid: manual sync complete — ${synced} files (${changed} changed)`,
      );
    },
  });

  api.registerTool('hippodid:import', {
    description: 'Import existing workspace memory into HippoDid character',
    args: [
      {
        name: 'workspace',
        description: 'Path to OpenClaw workspace (default: auto-detect)',
        required: false,
      },
    ],
    handler: async (args: Record<string, string>) => {
      const { readdir } = await import('node:fs/promises');
      const { join, extname } = await import('node:path');
      const { createHash } = await import('node:crypto');

      const workspacePath = args['workspace']
        ? resolve(args['workspace'])
        : resolve(process.cwd());

      const memoryDir = join(workspacePath, 'memory');
      const memoryMd = join(workspacePath, 'MEMORY.md');
      const filesToImport: Array<{ path: string; label: string }> = [];

      try {
        const entries = await readdir(memoryDir);
        for (const entry of entries) {
          if (extname(entry) === '.md') {
            filesToImport.push({
              path: join(memoryDir, entry),
              label: 'workspace-memory',
            });
          }
        }
      } catch {
        // memory dir may not exist
      }

      try {
        await readFile(memoryMd);
        filesToImport.push({ path: memoryMd, label: 'MEMORY.md' });
      } catch {
        // MEMORY.md may not exist
      }

      if (filesToImport.length === 0) {
        logger.info('hippodid: no memory files found to import');
        return;
      }

      logger.info(
        `hippodid: importing ${filesToImport.length} files from ${workspacePath}...`,
      );

      let imported = 0;
      for (const file of filesToImport) {
        try {
          const content = await readFile(file.path);
          const hash = createHash('sha256').update(content).digest('hex');
          const base64 = content.toString('base64');
          const result = await client.syncFile(
            config.characterId,
            file.path,
            file.label,
            base64,
            hash,
          );
          if (result.ok) imported++;
        } catch (e) {
          logger.warn(
            `hippodid: import failed for ${file.path}: ${e instanceof Error ? e.message : 'unknown'}`,
          );
        }
      }

      logger.info(
        `hippodid: import complete — ${imported}/${filesToImport.length} files imported`,
      );
    },
  });
}
