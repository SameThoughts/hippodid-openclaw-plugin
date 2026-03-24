import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
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

const require = createRequire(import.meta.url);
const VERSION =
  ((require('../package.json') as { version?: string }).version) ?? '0.0.0-dev';
let hasInitialized = false;

export default {
  id: 'hippodid-openclaw-plugin',

  register(api: any): void {
    try {
      if (hasInitialized) {
        return;
      }

      const config = resolveConfig(api.pluginConfig ?? api.config ?? {});
      const logger = api.logger ?? {
        info: (msg: string) => console.log(msg),
        warn: (msg: string) => console.warn(msg),
        error: (msg: string) => console.error(msg),
      };

      const apiKey = config.apiKey.trim();
      const characterId = config.characterId.trim();
      if (!apiKey || !characterId) {
        logger.warn(
          'HippoDid: apiKey and characterId required — configure in openclaw.json',
        );
        return;
      }

      hasInitialized = true;

      const client = createClient(apiKey, config.baseUrl);
      const tierManager = createTierManager(client, characterId, logger);
      const watchPaths = resolveWatchPaths(config);
      const effectiveSyncInterval = Math.max(config.syncIntervalSeconds, 60);
      const fileSync = createFileSync(
        client,
        config,
        watchPaths,
        logger,
        effectiveSyncInterval,
      );

      logger.info(`HippoDid loaded — character: ${characterId}`);

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
  if (!raw || typeof raw !== 'object') {
    return {
      apiKey: '',
      characterId: '',
      baseUrl: 'https://api.hippodid.com',
      syncIntervalSeconds: 300,
      autoRecall: false,
      autoCapture: false,
      additionalPaths: [],
    };
  }

  return {
    apiKey: raw.apiKey ?? '',
    characterId: raw.characterId ?? '',
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
  const getStatusText = async (): Promise<string> => {
    const tier = tierManager.getCurrentTier();
    const statusResult = await client.getSyncStatus(config.characterId);
    const lines = [
      'HippoDid status:',
      `- Character: ${config.characterId}`,
      `- Tier: ${tier.tier}`,
      `- Auto-Recall: ${tier.features.autoRecallAvailable ? 'available' : 'unavailable'} (config: ${config.autoRecall ? 'ON' : 'OFF'})`,
      `- Auto-Capture: ${tier.features.autoCaptureAvailable ? 'available' : 'unavailable'} (config: ${config.autoCapture ? 'ON' : 'OFF'})`,
    ];

    if (statusResult.ok) {
      lines.push(`- Synced sources: ${statusResult.value.entries.length}`);
      for (const entry of statusResult.value.entries) {
        lines.push(
          `  - ${entry.sourcePath} (${entry.label}) — last sync: ${entry.lastSyncedAt}`,
        );
      }
    } else {
      lines.push(
        `- Sync status: unavailable (${statusResult.error.message})`,
      );
    }

    return lines.join('\n');
  };

  const runImport = async (workspaceOverride?: string): Promise<string> => {
    const { readdir } = await import('node:fs/promises');
    const { join, extname } = await import('node:path');
    const { createHash } = await import('node:crypto');

    const workspacePath = workspaceOverride
      ? resolve(workspaceOverride)
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
      return 'hippodid: no memory files found to import';
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

    return `hippodid: import complete — ${imported}/${filesToImport.length} files imported`;
  };

  api.registerCommand({
    name: 'hippodid',
    description: 'Show HippoDid status and run sync/import actions.',
    acceptsArgs: true,
    handler: async (ctx: any) => {
      const args = ctx?.args?.trim() ?? '';
      const [action = 'status', ...rest] = args.split(/\s+/).filter(Boolean);

      if (action === 'status') {
        return { text: await getStatusText() };
      }

      if (action === 'sync') {
        logger.info('hippodid: manual sync triggered...');
        const { synced, changed } = await fileSync.flushNow();
        return {
          text: `hippodid: manual sync complete — ${synced} files (${changed} changed)`,
        };
      }

      if (action === 'import') {
        const workspace = rest.join(' ').trim() || undefined;
        return { text: await runImport(workspace) };
      }

      return {
        text: [
          'HippoDid commands:',
          '',
          '/hippodid status',
          '/hippodid sync',
          '/hippodid import [workspace-path]',
        ].join('\n'),
      };
    },
  });

  api.registerTool({
    name: 'hippodid:status',
    description: 'Show HippoDid tier, sync status, and watched paths',
    execute: async () => {
      const text = await getStatusText();
      for (const line of text.split('\n')) {
        logger.info(line);
      }
      return text;
    },
  });

  api.registerTool({
    name: 'hippodid:sync',
    description: 'Trigger immediate sync of all watched files',
    execute: async () => {
      logger.info('hippodid: manual sync triggered...');
      const { synced, changed } = await fileSync.flushNow();
      const text = `hippodid: manual sync complete — ${synced} files (${changed} changed)`;
      logger.info(text);
      return text;
    },
  });

  api.registerTool({
    name: 'hippodid:import',
    description: 'Import existing workspace memory into HippoDid character',
    args: [
      {
        name: 'workspace',
        description: 'Path to OpenClaw workspace (default: auto-detect)',
        required: false,
      },
    ],
    execute: async (args: Record<string, string>) => {
      const text = await runImport(args['workspace']);
      logger.info(text);
      return text;
    },
  });
}
