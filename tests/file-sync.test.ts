import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createFileSync } from '../src/file-sync.js';
import type { HippoDidClient } from '../src/hippodid-client.js';
import type { PluginConfig, WatchPath } from '../src/types.js';

function makeConfig(overrides?: Partial<PluginConfig>): PluginConfig {
  return {
    apiKey: 'hd_sk_test',
    characterId: 'char-1',
    baseUrl: 'https://api.hippodid.com',
    syncIntervalSeconds: 1,
    autoRecall: false,
    autoCapture: false,
    additionalPaths: [],
    ...overrides,
  };
}

function mockClient(): HippoDidClient {
  return {
    getTier: vi.fn(),
    syncFile: vi.fn(async () => ({
      ok: true as const,
      value: { status: 'ok', snapshotId: 'snap-1', changed: true },
    })),
    getLatestSync: vi.fn(async () => ({
      ok: true as const,
      value: null,
    })),
    getSyncStatus: vi.fn(),
    searchMemories: vi.fn(),
    addMemory: vi.fn(),
  };
}

const logger = { info: vi.fn(), warn: vi.fn() };

describe('FileSync', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'hippodid-filesync-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('flushNow', () => {
    it('syncs files with changed content', async () => {
      const filePath = join(tmpDir, 'MEMORY.md');
      writeFileSync(filePath, '# Memory');

      const client = mockClient();
      const config = makeConfig();
      const watchPaths: WatchPath[] = [
        { path: filePath, label: 'MEMORY.md', source: 'auto-detected' },
      ];

      const sync = createFileSync(client, config, watchPaths, logger);
      const result = await sync.flushNow();

      expect(result.synced).toBe(1);
      expect(client.syncFile).toHaveBeenCalledTimes(1);

      const callArgs = (client.syncFile as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[0]).toBe('char-1');
      expect(callArgs[1]).toBe(filePath);
      expect(callArgs[2]).toBe('MEMORY.md');
    });

    it('skips unchanged files on second flush', async () => {
      const filePath = join(tmpDir, 'MEMORY.md');
      writeFileSync(filePath, '# Memory');

      const client = mockClient();
      const config = makeConfig();
      const watchPaths: WatchPath[] = [
        { path: filePath, label: 'MEMORY.md', source: 'auto-detected' },
      ];

      const sync = createFileSync(client, config, watchPaths, logger);
      await sync.flushNow();
      await sync.flushNow();

      // syncFile called once for first flush, skipped on second (same hash)
      expect(client.syncFile).toHaveBeenCalledTimes(1);
    });

    it('syncs again after file content changes', async () => {
      const filePath = join(tmpDir, 'MEMORY.md');
      writeFileSync(filePath, '# Memory v1');

      const client = mockClient();
      const config = makeConfig();
      const watchPaths: WatchPath[] = [
        { path: filePath, label: 'MEMORY.md', source: 'auto-detected' },
      ];

      const sync = createFileSync(client, config, watchPaths, logger);
      await sync.flushNow();

      writeFileSync(filePath, '# Memory v2');
      await sync.flushNow();

      expect(client.syncFile).toHaveBeenCalledTimes(2);
    });

    it('syncs all .md files in a directory', async () => {
      const memDir = join(tmpDir, 'memory');
      mkdirSync(memDir);
      writeFileSync(join(memDir, '2026-03-20.md'), 'day 1');
      writeFileSync(join(memDir, '2026-03-21.md'), 'day 2');
      writeFileSync(join(memDir, 'notes.txt'), 'not md');

      const client = mockClient();
      const config = makeConfig();
      const watchPaths: WatchPath[] = [
        { path: memDir, label: 'workspace-memory', source: 'auto-detected' },
      ];

      const sync = createFileSync(client, config, watchPaths, logger);
      const result = await sync.flushNow();

      expect(result.synced).toBe(2);
      expect(client.syncFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('hydrateFromCloud', () => {
    it('writes cloud content to local file', async () => {
      const filePath = join(tmpDir, 'MEMORY.md');
      writeFileSync(filePath, 'old content');

      const client = mockClient();
      const cloudContent = Buffer.from('# Updated from cloud').toString('base64');
      client.getLatestSync = vi.fn(async () => ({
        ok: true as const,
        value: {
          sourcePath: filePath,
          fileContent: cloudContent,
          snapshotId: 'snap-cloud',
          syncedAt: '2026-03-22T12:00:00Z',
        },
      }));

      const config = makeConfig();
      const watchPaths: WatchPath[] = [
        { path: filePath, label: 'MEMORY.md', source: 'auto-detected' },
      ];

      const sync = createFileSync(client, config, watchPaths, logger);
      const count = await sync.hydrateFromCloud();

      expect(count).toBe(1);
      expect(readFileSync(filePath, 'utf-8')).toBe('# Updated from cloud');
    });

    it('skips hydration when cloud has no data', async () => {
      const filePath = join(tmpDir, 'MEMORY.md');
      writeFileSync(filePath, 'local content');

      const client = mockClient();
      client.getLatestSync = vi.fn(async () => ({
        ok: true as const,
        value: null,
      }));

      const config = makeConfig();
      const watchPaths: WatchPath[] = [
        { path: filePath, label: 'MEMORY.md', source: 'auto-detected' },
      ];

      const sync = createFileSync(client, config, watchPaths, logger);
      const count = await sync.hydrateFromCloud();

      expect(count).toBe(0);
      expect(readFileSync(filePath, 'utf-8')).toBe('local content');
    });
  });

  describe('start/stop', () => {
    it('starts and stops without error', () => {
      const filePath = join(tmpDir, 'MEMORY.md');
      writeFileSync(filePath, '# Memory');

      const client = mockClient();
      const config = makeConfig();
      const watchPaths: WatchPath[] = [
        { path: filePath, label: 'MEMORY.md', source: 'auto-detected' },
      ];

      const sync = createFileSync(client, config, watchPaths, logger);
      sync.start();
      sync.stop();
    });
  });
});
