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
  it('registers both a registerHook and a registerTool', () => {
    const client = mockClient();
    const api = { registerHook: vi.fn(), registerTool: vi.fn() };
    const register = createAutoRecallHook(client, config, logger);
    register(api);

    expect(api.registerHook).toHaveBeenCalledWith(
      'before_agent_start',
      expect.any(Function),
      expect.objectContaining({ name: 'hippodid.before-agent-start' }),
    );
    expect(api.registerTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'hippodid:recall' }),
    );
  });

  it('lifecycle hook searches memories and prepends context', async () => {
    const client = mockClient();
    const api = { registerHook: vi.fn(), registerTool: vi.fn() };
    const register = createAutoRecallHook(client, config, logger);
    register(api);

    const hookFn = api.registerHook.mock.calls[0][1];
    const ctx = { prompt: 'What are my preferences?', prependContext: vi.fn() };
    await hookFn(ctx);

    expect(client.searchMemories).toHaveBeenCalledWith('char-1', 'What are my preferences?');
    expect(ctx.prependContext).toHaveBeenCalledWith(
      expect.stringContaining('Prefers tabs'),
    );
  });

  it('recall tool returns memory content', async () => {
    const client = mockClient();
    const api = { registerHook: vi.fn(), registerTool: vi.fn() };
    const register = createAutoRecallHook(client, config, logger);
    register(api);

    const toolDef = api.registerTool.mock.calls[0][0];
    const result = await toolDef.execute({ query: 'preferences' });

    expect(result).toContain('Prefers tabs');
    expect(result).toContain('Senior Java dev');
  });

  it('recall tool handles search failure', async () => {
    const client = mockClient();
    client.searchMemories = vi.fn(async () => ({
      ok: false as const,
      error: { status: 500, message: 'Server error', retryable: true },
    }));

    const api = { registerHook: vi.fn(), registerTool: vi.fn() };
    const register = createAutoRecallHook(client, config, logger);
    register(api);

    const toolDef = api.registerTool.mock.calls[0][0];
    const result = await toolDef.execute({ query: 'test' });

    expect(result).toBe('No memories found.');
  });
});
