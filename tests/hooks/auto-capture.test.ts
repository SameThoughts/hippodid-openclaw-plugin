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
  it('registers hippodid:remember tool via api.registerTool', () => {
    const client = mockClient();
    const api = { registerTool: vi.fn() };
    const register = createAutoCaptureHook(client, config, logger);
    register(api);

    expect(api.registerTool).toHaveBeenCalledWith(
      'hippodid:remember',
      expect.objectContaining({ description: expect.any(String) }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('hippodid:remember'),
    );
  });

  it('remember tool handler stores content', async () => {
    const client = mockClient();
    const api = { registerTool: vi.fn() };
    const register = createAutoCaptureHook(client, config, logger);
    register(api);

    const toolDef = api.registerTool.mock.calls[0][1];
    const result = await toolDef.handler({ content: 'User likes TypeScript' });

    expect(client.addMemory).toHaveBeenCalledWith('char-1', 'User likes TypeScript');
    expect(result).toBe('Remembered.');
  });

  it('remember tool handler returns error on failure', async () => {
    const client = mockClient();
    client.addMemory = vi.fn(async () => ({
      ok: false as const,
      error: { status: 500, message: 'Server error', retryable: true },
    }));

    const api = { registerTool: vi.fn() };
    const register = createAutoCaptureHook(client, config, logger);
    register(api);

    const toolDef = api.registerTool.mock.calls[0][1];
    const result = await toolDef.handler({ content: 'test' });

    expect(result).toContain('Failed to remember');
  });

  it('remember tool handler rejects empty content', async () => {
    const client = mockClient();
    const api = { registerTool: vi.fn() };
    const register = createAutoCaptureHook(client, config, logger);
    register(api);

    const toolDef = api.registerTool.mock.calls[0][1];
    const result = await toolDef.handler({ content: '' });

    expect(result).toBe('Nothing to remember.');
    expect(client.addMemory).not.toHaveBeenCalled();
  });
});
