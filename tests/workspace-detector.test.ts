import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  detectWorkspaceMemoryDir,
  detectMemoryMdPath,
  resolveWatchPaths,
} from '../src/workspace-detector.js';
import type { PluginConfig } from '../src/types.js';

describe('WorkspaceDetector', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = realpathSync(mkdtempSync(join(tmpdir(), 'hippodid-test-')));
    originalEnv = process.env['OPENCLAW_WORKSPACE'];
    originalCwd = process.cwd();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env['OPENCLAW_WORKSPACE'] = originalEnv;
    } else {
      delete process.env['OPENCLAW_WORKSPACE'];
    }
    process.chdir(originalCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('detectWorkspaceMemoryDir', () => {
    it('detects via OPENCLAW_WORKSPACE env var', () => {
      const memDir = join(tmpDir, 'memory');
      mkdirSync(memDir, { recursive: true });
      writeFileSync(join(memDir, '2026-03-22.md'), 'test');
      process.env['OPENCLAW_WORKSPACE'] = tmpDir;

      const result = detectWorkspaceMemoryDir();
      expect(result).toBe(memDir);
    });

    it('returns null when no workspace found', () => {
      delete process.env['OPENCLAW_WORKSPACE'];
      process.chdir(tmpDir);

      const result = detectWorkspaceMemoryDir();
      expect(result).toBeNull();
    });

    it('detects via cwd/memory/ when it contains .md files', () => {
      const memDir = join(tmpDir, 'memory');
      mkdirSync(memDir, { recursive: true });
      writeFileSync(join(memDir, 'test.md'), 'content');
      process.chdir(tmpDir);
      delete process.env['OPENCLAW_WORKSPACE'];

      const result = detectWorkspaceMemoryDir();
      expect(result).toBe(memDir);
    });

    it('skips directory with no .md files', () => {
      const memDir = join(tmpDir, 'memory');
      mkdirSync(memDir, { recursive: true });
      writeFileSync(join(memDir, 'test.txt'), 'not markdown');
      process.chdir(tmpDir);
      delete process.env['OPENCLAW_WORKSPACE'];

      const result = detectWorkspaceMemoryDir();
      expect(result).toBeNull();
    });
  });

  describe('detectMemoryMdPath', () => {
    it('detects MEMORY.md via env var', () => {
      writeFileSync(join(tmpDir, 'MEMORY.md'), '# Memory');
      process.env['OPENCLAW_WORKSPACE'] = tmpDir;

      const result = detectMemoryMdPath();
      expect(result).toBe(join(tmpDir, 'MEMORY.md'));
    });

    it('detects MEMORY.md in cwd', () => {
      writeFileSync(join(tmpDir, 'MEMORY.md'), '# Memory');
      process.chdir(tmpDir);
      delete process.env['OPENCLAW_WORKSPACE'];

      const result = detectMemoryMdPath();
      expect(result).toBe(join(tmpDir, 'MEMORY.md'));
    });

    it('returns null when MEMORY.md not found', () => {
      delete process.env['OPENCLAW_WORKSPACE'];
      process.chdir(tmpDir);

      const result = detectMemoryMdPath();
      expect(result).toBeNull();
    });
  });

  describe('resolveWatchPaths', () => {
    it('combines auto-detected and user-specified paths', () => {
      const memDir = join(tmpDir, 'memory');
      mkdirSync(memDir, { recursive: true });
      writeFileSync(join(memDir, 'log.md'), 'daily log');
      writeFileSync(join(tmpDir, 'MEMORY.md'), '# Memory');
      process.env['OPENCLAW_WORKSPACE'] = tmpDir;

      const config: PluginConfig = {
        apiKey: 'hd_sk_test',
        characterId: 'char-1',
        baseUrl: 'https://api.hippodid.com',
        syncIntervalSeconds: 300,
        autoRecall: false,
        autoCapture: false,
        additionalPaths: [{ path: join(tmpDir, 'extra.md'), label: 'extra' }],
      };

      const paths = resolveWatchPaths(config);

      expect(paths.length).toBe(3);
      expect(paths[0].source).toBe('auto-detected');
      expect(paths[0].label).toBe('workspace-memory');
      expect(paths[1].source).toBe('auto-detected');
      expect(paths[1].label).toBe('MEMORY.md');
      expect(paths[2].source).toBe('user-specified');
      expect(paths[2].label).toBe('extra');
    });

    it('deduplicates overlapping paths', () => {
      const memDir = join(tmpDir, 'memory');
      mkdirSync(memDir, { recursive: true });
      writeFileSync(join(memDir, 'log.md'), 'daily log');
      process.env['OPENCLAW_WORKSPACE'] = tmpDir;

      const config: PluginConfig = {
        apiKey: 'hd_sk_test',
        characterId: 'char-1',
        baseUrl: 'https://api.hippodid.com',
        syncIntervalSeconds: 300,
        autoRecall: false,
        autoCapture: false,
        additionalPaths: [{ path: memDir }],
      };

      const paths = resolveWatchPaths(config);

      const memDirPaths = paths.filter((p) => p.path === memDir);
      expect(memDirPaths.length).toBe(1);
    });
  });
});
