import { describe, it, expect, vi } from 'vitest';
import { createAutoCaptureHook } from '../../src/hooks/auto-capture.js';
import type { HippoDidClient } from '../../src/hippodid-client.js';
import type { PluginConfig } from '../../src/types.js';

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
  it('registers agent_end hook via api.registerHook', () => {
    const client = mockClient();
    const api = { registerHook: vi.fn(), registerTool: vi.fn() };
    const register = createAutoCaptureHook(client, config, logger);
    register(api);

    expect(api.registerHook).toHaveBeenCalledWith(
      'agent_end',
      expect.any(Function),
      expect.objectContaining({ name: 'hippodid.agent-end' }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('agent_end'),
    );
  });

  it('hook handler captures user + assistant exchange', async () => {
    const client = mockClient();
    const api = { registerHook: vi.fn(), registerTool: vi.fn() };
    const register = createAutoCaptureHook(client, config, logger);
    register(api);

    const hookFn = api.registerHook.mock.calls[0][1];
    await hookFn({
      userMessage: 'What is TypeScript?',
      assistantMessage: 'A typed superset of JavaScript.',
    });

    expect(client.addMemory).toHaveBeenCalledWith(
      'char-1',
      expect.stringContaining('What is TypeScript?'),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('captured conversation turn'),
    );
  });

  it('hook handler skips when no messages', async () => {
    const client = mockClient();
    const api = { registerHook: vi.fn(), registerTool: vi.fn() };
    const register = createAutoCaptureHook(client, config, logger);
    register(api);

    const hookFn = api.registerHook.mock.calls[0][1];
    await hookFn({});

    expect(client.addMemory).not.toHaveBeenCalled();
  });

  it('hook handler handles addMemory failure gracefully', async () => {
    const client = mockClient();
    client.addMemory = vi.fn(async () => ({
      ok: false as const,
      error: { status: 500, message: 'Server error', retryable: true },
    }));

    const api = { registerHook: vi.fn(), registerTool: vi.fn() };
    const register = createAutoCaptureHook(client, config, logger);
    register(api);

    const hookFn = api.registerHook.mock.calls[0][1];
    await hookFn({ userMessage: 'test', assistantMessage: 'response' });

    // Should not throw — graceful degradation
    expect(client.addMemory).toHaveBeenCalled();
  });
});
