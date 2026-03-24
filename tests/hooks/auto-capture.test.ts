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
  it('registers both an event handler and a registerTool', () => {
    const client = mockClient();
    const api = { on: vi.fn(), registerTool: vi.fn() };
    const register = createAutoCaptureHook(client, config, logger);
    register(api);

    expect(api.on).toHaveBeenCalledWith(
      'agent_end',
      expect.any(Function),
    );
    expect(api.registerTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'hippodid:remember' }),
    );
  });

  it('lifecycle hook captures user + assistant exchange', async () => {
    const client = mockClient();
    const api = { on: vi.fn(), registerTool: vi.fn() };
    const register = createAutoCaptureHook(client, config, logger);
    register(api);

    const hookFn = api.on.mock.calls[0][1];
    await hookFn({
      userMessage: 'What is TypeScript?',
      assistantMessage: 'A typed superset of JavaScript.',
    });

    expect(client.addMemory).toHaveBeenCalledWith(
      'char-1',
      expect.stringContaining('What is TypeScript?'),
    );
  });

  it('remember tool stores content', async () => {
    const client = mockClient();
    const api = { on: vi.fn(), registerTool: vi.fn() };
    const register = createAutoCaptureHook(client, config, logger);
    register(api);

    const toolDef = api.registerTool.mock.calls[0][0];
    const result = await toolDef.execute({ content: 'User likes TypeScript' });

    expect(client.addMemory).toHaveBeenCalledWith('char-1', 'User likes TypeScript');
    expect(result).toBe('Remembered.');
  });

  it('remember tool rejects empty content', async () => {
    const client = mockClient();
    const api = { on: vi.fn(), registerTool: vi.fn() };
    const register = createAutoCaptureHook(client, config, logger);
    register(api);

    const toolDef = api.registerTool.mock.calls[0][0];
    const result = await toolDef.execute({ content: '' });

    expect(result).toBe('Nothing to remember.');
    expect(client.addMemory).not.toHaveBeenCalled();
  });
});
