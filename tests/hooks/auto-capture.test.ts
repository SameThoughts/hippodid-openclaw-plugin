import { describe, it, expect, vi } from 'vitest';
import { createAutoCaptureHook } from '../../src/hooks/auto-capture.js';
import type { HippoDidClient } from '../../src/hippodid-client.js';
import type { PluginConfig, OpenClawPluginAPI } from '../../src/types.js';

function mockClient(): HippoDidClient {
  return {
    getTier: vi.fn(),
    syncFile: vi.fn(),
    getLatestSync: vi.fn(),
    getSyncStatus: vi.fn(),
    searchMemories: vi.fn(),
    addMemory: vi.fn(async () => ({
      ok: true as const,
      value: undefined,
    })),
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
  autoRecall: false,
  autoCapture: true,
  additionalPaths: [],
};

const logger = { info: vi.fn(), warn: vi.fn() };

describe('AutoCaptureHook', () => {
  it('registers agent_end hook', () => {
    const client = mockClient();
    const api = mockApi();
    const register = createAutoCaptureHook(client, config, logger);
    register(api);

    expect(api._hooks['agent_end']).toBeDefined();
  });

  it('captures exchange from userMessage + agentResponse', async () => {
    const client = mockClient();
    const api = mockApi();
    const register = createAutoCaptureHook(client, config, logger);
    register(api);

    api._hooks['agent_end'][0]({
      userMessage: 'What is TypeScript?',
      agentResponse: 'TypeScript is a typed superset of JavaScript.',
    });

    // Fire-and-forget, wait for microtask
    await new Promise((r) => setTimeout(r, 10));

    expect(client.addMemory).toHaveBeenCalledWith(
      'char-1',
      expect.stringContaining('What is TypeScript?'),
      'openclaw-auto-capture',
    );
  });

  it('extracts from string argument', async () => {
    const client = mockClient();
    const api = mockApi();
    const register = createAutoCaptureHook(client, config, logger);
    register(api);

    api._hooks['agent_end'][0]('raw exchange text');

    await new Promise((r) => setTimeout(r, 10));

    expect(client.addMemory).toHaveBeenCalledWith(
      'char-1',
      'raw exchange text',
      'openclaw-auto-capture',
    );
  });

  it('handles addMemory failure gracefully', async () => {
    const client = mockClient();
    client.addMemory = vi.fn(async () => ({
      ok: false as const,
      error: { status: 500, message: 'Server error', retryable: true },
    }));

    const api = mockApi();
    const register = createAutoCaptureHook(client, config, logger);
    register(api);

    api._hooks['agent_end'][0]({ content: 'some exchange' });

    await new Promise((r) => setTimeout(r, 10));

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('capture failed'),
    );
  });
});
