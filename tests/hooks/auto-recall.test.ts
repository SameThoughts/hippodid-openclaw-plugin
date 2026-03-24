import { describe, it, expect, vi } from 'vitest';
import { createAutoRecallHook } from '../../src/hooks/auto-recall.js';
import type { HippoDidClient } from '../../src/hippodid-client.js';
import type { PluginConfig } from '../../src/types.js';

function mockClient(): HippoDidClient {
  return {
    getTier: vi.fn(),
    syncFile: vi.fn(),
    getLatestSync: vi.fn(),
    getSyncStatus: vi.fn(),
    searchMemories: vi.fn(async () => ({
      ok: true as const,
      value: [
        { content: 'Prefers tabs', category: 'Preferences', score: 0.9, createdAt: '2026-03-01' },
        { content: 'Senior Java dev', category: 'Skills', score: 0.85, createdAt: '2026-03-01' },
      ],
    })),
    addMemory: vi.fn(),
  };
}

const config: PluginConfig = {
  apiKey: 'hd_sk_test',
  characterId: 'char-1',
  baseUrl: 'https://api.hippodid.com',
  syncIntervalSeconds: 300,
  autoRecall: true,
  autoCapture: false,
  additionalPaths: [],
};

const logger = { info: vi.fn(), warn: vi.fn() };

describe('AutoRecallHook', () => {
  it('registers hippodid:recall tool via api.registerTool', () => {
    const client = mockClient();
    const api = { registerTool: vi.fn() };
    const register = createAutoRecallHook(client, config, logger);
    register(api);

    expect(api.registerTool).toHaveBeenCalledWith(
      'hippodid:recall',
      expect.objectContaining({ description: expect.any(String) }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('hippodid:recall'),
    );
  });

  it('recall tool handler returns memory content', async () => {
    const client = mockClient();
    const api = { registerTool: vi.fn() };
    const register = createAutoRecallHook(client, config, logger);
    register(api);

    const toolDef = api.registerTool.mock.calls[0][1];
    const result = await toolDef.handler({ query: 'preferences' });

    expect(client.searchMemories).toHaveBeenCalledWith('char-1', 'preferences');
    expect(result).toContain('Prefers tabs');
    expect(result).toContain('Senior Java dev');
  });

  it('recall tool handler handles search failure', async () => {
    const client = mockClient();
    client.searchMemories = vi.fn(async () => ({
      ok: false as const,
      error: { status: 500, message: 'Server error', retryable: true },
    }));

    const api = { registerTool: vi.fn() };
    const register = createAutoRecallHook(client, config, logger);
    register(api);

    const toolDef = api.registerTool.mock.calls[0][1];
    const result = await toolDef.handler({ query: 'test' });

    expect(result).toBe('No memories found.');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('recall failed'),
    );
  });
});
