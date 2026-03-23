import { describe, it, expect, vi } from 'vitest';
import { createAutoRecallHook } from '../../src/hooks/auto-recall.js';
import type { HippoDidClient } from '../../src/hippodid-client.js';
import type { PluginConfig, OpenClawPluginAPI } from '../../src/types.js';

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

function mockApi(): OpenClawPluginAPI & { _hooks: Record<string, Function[]> } {
  const hooks: Record<string, Function[]> = {};
  return {
    _hooks: hooks,
    config: {} as any,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    on: (event: string, handler: Function) => {
      if (!hooks[event]) hooks[event] = [];
      hooks[event].push(handler);
    },
    context: { prepend: vi.fn() },
    commands: { register: vi.fn() },
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
  it('registers before_agent_start hook', () => {
    const client = mockClient();
    const api = mockApi();
    const register = createAutoRecallHook(client, config, logger);
    register(api);

    expect(api._hooks['before_agent_start']).toBeDefined();
  });

  it('injects memories as context block', async () => {
    const client = mockClient();
    const api = mockApi();
    const register = createAutoRecallHook(client, config, logger);
    register(api);

    await api._hooks['before_agent_start'][0]({ message: 'What are my preferences?' });

    expect(client.searchMemories).toHaveBeenCalledWith('char-1', 'What are my preferences?', 5);
    expect(api.context.prepend).toHaveBeenCalledWith(
      expect.stringContaining('<hippodid-memories>'),
    );
    expect(api.context.prepend).toHaveBeenCalledWith(
      expect.stringContaining('Prefers tabs'),
    );
  });

  it('skips injection when no memories found', async () => {
    const client = mockClient();
    client.searchMemories = vi.fn(async () => ({
      ok: true as const,
      value: [],
    }));

    const api = mockApi();
    const register = createAutoRecallHook(client, config, logger);
    register(api);

    await api._hooks['before_agent_start'][0]({ message: 'hello' });

    expect(api.context.prepend).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('no relevant memories'),
    );
  });

  it('handles search failure gracefully', async () => {
    const client = mockClient();
    client.searchMemories = vi.fn(async () => ({
      ok: false as const,
      error: { status: 500, message: 'Server error', retryable: true },
    }));

    const api = mockApi();
    const register = createAutoRecallHook(client, config, logger);
    register(api);

    await api._hooks['before_agent_start'][0]({ message: 'test' });

    expect(api.context.prepend).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('recall search failed'),
    );
  });

  it('extracts message from string arg', async () => {
    const client = mockClient();
    const api = mockApi();
    const register = createAutoRecallHook(client, config, logger);
    register(api);

    await api._hooks['before_agent_start'][0]('plain text message');

    expect(client.searchMemories).toHaveBeenCalledWith('char-1', 'plain text message', 5);
  });
});
