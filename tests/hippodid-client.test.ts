import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClient } from '../src/hippodid-client.js';

const BASE_URL = 'https://api.hippodid.com';
const API_KEY = 'hd_sk_test123';

function mockFetch(responses: Array<{ status: number; body?: unknown; delay?: number }>) {
  let callIndex = 0;
  return vi.fn(async (_url: string, _init?: RequestInit) => {
    const resp = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;

    if (resp.delay) {
      await new Promise((r) => setTimeout(r, resp.delay));
    }

    return {
      ok: resp.status >= 200 && resp.status < 300,
      status: resp.status,
      json: async () => resp.body,
      text: async () => JSON.stringify(resp.body ?? 'Error'),
    } as Response;
  });
}

describe('HippoDidClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('getTier', () => {
    it('returns tier info and maps snake_case to camelCase', async () => {
      globalThis.fetch = mockFetch([
        {
          status: 200,
          body: {
            tier: 'developer',
            features: {
              auto_recall_available: true,
              auto_capture_available: false,
              min_sync_interval_seconds: 30,
            },
          },
        },
      ]);

      const client = createClient(API_KEY, BASE_URL);
      const result = await client.getTier('char-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.tier).toBe('developer');
        expect(result.value.features.autoRecallAvailable).toBe(true);
        expect(result.value.features.autoCaptureAvailable).toBe(false);
        expect(result.value.features.minSyncIntervalSeconds).toBe(30);
      }
    });

    it('caches result on second call within TTL', async () => {
      const fetchMock = mockFetch([
        {
          status: 200,
          body: {
            tier: 'free',
            features: {
              auto_recall_available: false,
              auto_capture_available: false,
              min_sync_interval_seconds: 60,
            },
          },
        },
      ]);
      globalThis.fetch = fetchMock;

      const client = createClient(API_KEY, BASE_URL);
      await client.getTier('char-1');
      await client.getTier('char-1');

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('sends correct headers', async () => {
      const fetchMock = mockFetch([
        {
          status: 200,
          body: {
            tier: 'free',
            features: {
              auto_recall_available: false,
              auto_capture_available: false,
              min_sync_interval_seconds: 60,
            },
          },
        },
      ]);
      globalThis.fetch = fetchMock;

      const client = createClient(API_KEY, BASE_URL);
      await client.getTier('char-1');

      const callArgs = fetchMock.mock.calls[0];
      expect(callArgs[0]).toContain('/v1/tier?characterId=char-1');
      expect(callArgs[1].headers['Authorization']).toBe(`Bearer ${API_KEY}`);
    });
  });

  describe('syncFile', () => {
    it('sends correct body and maps response', async () => {
      const fetchMock = mockFetch([
        {
          status: 200,
          body: { status: 'ok', snapshot_id: 'snap-1', changed: true },
        },
      ]);
      globalThis.fetch = fetchMock;

      const client = createClient(API_KEY, BASE_URL);
      const result = await client.syncFile(
        'char-1',
        '/path/to/MEMORY.md',
        'MEMORY.md',
        'base64content',
        'sha256hash',
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.snapshotId).toBe('snap-1');
        expect(result.value.changed).toBe(true);
      }

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.source_path).toBe('/path/to/MEMORY.md');
      expect(body.file_content).toBe('base64content');
      expect(body.checksum).toBe('sha256hash');
    });
  });

  describe('getLatestSync', () => {
    it('returns null on 404', async () => {
      globalThis.fetch = mockFetch([{ status: 404, body: { error: 'not found' } }]);

      const client = createClient(API_KEY, BASE_URL);
      const result = await client.getLatestSync('char-1', '/path/MEMORY.md');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it('returns mapped response on success', async () => {
      globalThis.fetch = mockFetch([
        {
          status: 200,
          body: {
            source_path: '/path/MEMORY.md',
            file_content: 'dGVzdA==',
            snapshot_id: 'snap-2',
            synced_at: '2026-03-22T00:00:00Z',
          },
        },
      ]);

      const client = createClient(API_KEY, BASE_URL);
      const result = await client.getLatestSync('char-1', '/path/MEMORY.md');

      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.sourcePath).toBe('/path/MEMORY.md');
        expect(result.value.snapshotId).toBe('snap-2');
      }
    });
  });

  describe('retry behavior', () => {
    it('retries on 429 with backoff', async () => {
      const fetchMock = mockFetch([
        { status: 429, body: 'Rate limited' },
        { status: 429, body: 'Rate limited' },
        {
          status: 200,
          body: {
            tier: 'free',
            features: {
              auto_recall_available: false,
              auto_capture_available: false,
              min_sync_interval_seconds: 60,
            },
          },
        },
      ]);
      globalThis.fetch = fetchMock;

      const client = createClient(API_KEY, BASE_URL);
      const result = await client.getTier('char-1');

      expect(result.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('retries on 500', async () => {
      const fetchMock = mockFetch([
        { status: 500, body: 'Server error' },
        {
          status: 200,
          body: {
            tier: 'free',
            features: {
              auto_recall_available: false,
              auto_capture_available: false,
              min_sync_interval_seconds: 60,
            },
          },
        },
      ]);
      globalThis.fetch = fetchMock;

      const client = createClient(API_KEY, BASE_URL);
      const result = await client.getTier('char-1');

      expect(result.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not retry on 400', async () => {
      const fetchMock = mockFetch([{ status: 400, body: 'Bad request' }]);
      globalThis.fetch = fetchMock;

      const client = createClient(API_KEY, BASE_URL);
      const result = await client.getTier('char-1');

      expect(result.ok).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('searchMemories', () => {
    it('sends query and returns results', async () => {
      const fetchMock = mockFetch([
        {
          status: 200,
          body: [
            { content: 'Prefers dark mode', category: 'Preferences', score: 0.9, created_at: '2026-03-01' },
          ],
        },
      ]);
      globalThis.fetch = fetchMock;

      const client = createClient(API_KEY, BASE_URL);
      const result = await client.searchMemories('char-1', 'user preferences');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].content).toBe('Prefers dark mode');
        expect(result.value[0].createdAt).toBe('2026-03-01');
      }

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.query).toBe('user preferences');
      expect(body.top_k).toBe(5);
    });
  });

  describe('addMemory', () => {
    it('sends content with default source', async () => {
      const fetchMock = mockFetch([{ status: 204 }]);
      globalThis.fetch = fetchMock;

      const client = createClient(API_KEY, BASE_URL);
      const result = await client.addMemory('char-1', 'User likes TypeScript');

      expect(result.ok).toBe(true);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.content).toBe('User likes TypeScript');
      expect(body.source).toBe('openclaw-plugin');
    });
  });
});
