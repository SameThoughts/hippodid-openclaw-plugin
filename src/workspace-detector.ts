import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import type { PluginConfig, WatchPath } from './types.js';

export function detectWorkspaceMemoryDir(): string | null {
  const candidates: string[] = [];

  const envWorkspace = process.env['OPENCLAW_WORKSPACE'];
  if (envWorkspace) {
    candidates.push(resolve(join(envWorkspace, 'memory')));
  }

  candidates.push(resolve(join(homedir(), '.openclaw', 'workspace', 'memory')));
  candidates.push(resolve(join(process.cwd(), 'memory')));

  for (const candidate of candidates) {
    if (isValidMemoryDir(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function detectMemoryMdPath(): string | null {
  const candidates: string[] = [];

  const envWorkspace = process.env['OPENCLAW_WORKSPACE'];
  if (envWorkspace) {
    candidates.push(resolve(join(envWorkspace, 'MEMORY.md')));
  }

  candidates.push(
    resolve(join(homedir(), '.openclaw', 'workspace', 'MEMORY.md')),
  );
  candidates.push(resolve(join(process.cwd(), 'MEMORY.md')));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function resolveWatchPaths(config: PluginConfig): WatchPath[] {
  const paths: WatchPath[] = [];
  const seen = new Set<string>();

  const memoryDir = detectWorkspaceMemoryDir();
  if (memoryDir) {
    const resolved = resolve(memoryDir);
    if (!seen.has(resolved)) {
      seen.add(resolved);
      paths.push({
        path: resolved,
        label: 'workspace-memory',
        source: 'auto-detected',
      });
    }
  }

  const memoryMd = detectMemoryMdPath();
  if (memoryMd) {
    const resolved = resolve(memoryMd);
    if (!seen.has(resolved)) {
      seen.add(resolved);
      paths.push({
        path: resolved,
        label: 'MEMORY.md',
        source: 'auto-detected',
      });
    }
  }

  for (const additional of config.additionalPaths) {
    const resolved = resolve(additional.path);
    if (!seen.has(resolved)) {
      seen.add(resolved);
      paths.push({
        path: resolved,
        label: additional.label ?? resolved,
        source: 'user-specified',
      });
    }
  }

  return paths;
}

function isValidMemoryDir(dirPath: string): boolean {
  try {
    if (!existsSync(dirPath)) return false;
    const s = statSync(dirPath);
    if (!s.isDirectory()) return false;

    const entries = readdirSync(dirPath);
    return entries.some((e) => e.endsWith('.md'));
  } catch {
    return false;
  }
}
