import type {
  ApiError,
  Result,
  TierInfo,
  TierApiResponse,
  SyncResponse,
  SyncApiResponse,
  SyncLatestResponse,
  SyncLatestApiResponse,
  SyncStatusEntry,
  SyncStatusResponse,
  SearchResult,
  SearchResultApiResponse,
} from './types.js';
import { ok, err } from './types.js';

const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 10_000;
const TIER_CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedTier {
  info: TierInfo;
  fetchedAt: number;
}

export interface HippoDidClient {
  getTier(characterId: string): Promise<Result<TierInfo>>;
  syncFile(
    characterId: string,
    sourcePath: string,
    label: string,
    fileContent: string,
    checksum: string,
  ): Promise<Result<SyncResponse>>;
  getLatestSync(
    characterId: string,
    sourcePath: string,
  ): Promise<Result<SyncLatestResponse | null>>;
  getSyncStatus(characterId: string): Promise<Result<SyncStatusResponse>>;
  searchMemories(
    characterId: string,
    query: string,
    topK?: number,
  ): Promise<Result<SearchResult[]>>;
  addMemory(
    characterId: string,
    content: string,
    source?: string,
  ): Promise<Result<void>>;
}

export function createClient(apiKey: string, baseUrl: string): HippoDidClient {
  let tierCache: CachedTier | null = null;

  function headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  function isRetryable(status: number): boolean {
    return status === 429 || status >= 500;
  }

  function toApiError(status: number, message: string): ApiError {
    return { status, message, retryable: isRetryable(status) };
  }

  async function fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Result<T>> {
    const url = `${baseUrl}${path}`;
    let lastError: ApiError | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        await new Promise((r) => setTimeout(r, delay));
      }

      try {
        const resp = await fetchWithTimeout(url, {
          method,
          headers: headers(),
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });

        if (!resp.ok) {
          const errorText = await resp.text().catch(() => 'Unknown error');
          lastError = toApiError(resp.status, errorText);

          if (!isRetryable(resp.status)) {
            return err(lastError);
          }
          continue;
        }

        if (resp.status === 204) {
          return ok(undefined as T);
        }

        const data = (await resp.json()) as T;
        return ok(data);
      } catch (e) {
        const message =
          e instanceof Error ? e.message : 'Unknown network error';
        lastError = toApiError(0, message);

        if (attempt < MAX_RETRIES) {
          continue;
        }
      }
    }

    return err(lastError ?? toApiError(0, 'Request failed after retries'));
  }

  function mapTierResponse(raw: TierApiResponse): TierInfo {
    return {
      tier: raw.tier,
      features: {
        autoRecallAvailable: raw.features.auto_recall_available,
        autoCaptureAvailable: raw.features.auto_capture_available,
        minSyncIntervalSeconds: raw.features.min_sync_interval_seconds,
      },
    };
  }

  function mapSyncResponse(raw: SyncApiResponse): SyncResponse {
    return {
      status: raw.status,
      snapshotId: raw.snapshot_id,
      changed: raw.changed,
    };
  }

  function mapSyncLatestResponse(
    raw: SyncLatestApiResponse,
  ): SyncLatestResponse {
    return {
      sourcePath: raw.source_path,
      fileContent: raw.file_content,
      snapshotId: raw.snapshot_id,
      syncedAt: raw.synced_at,
    };
  }

  return {
    async getTier(characterId: string): Promise<Result<TierInfo>> {
      const now = Date.now();
      if (tierCache && now - tierCache.fetchedAt < TIER_CACHE_TTL_MS) {
        return ok(tierCache.info);
      }

      const result = await request<TierApiResponse>(
        'GET',
        `/v1/tier?characterId=${encodeURIComponent(characterId)}`,
      );

      if (!result.ok) return result;

      const info = mapTierResponse(result.value);
      tierCache = { info, fetchedAt: now };
      return ok(info);
    },

    async syncFile(
      characterId: string,
      sourcePath: string,
      label: string,
      fileContent: string,
      checksum: string,
    ): Promise<Result<SyncResponse>> {
      const result = await request<SyncApiResponse>(
        'POST',
        `/v1/characters/${encodeURIComponent(characterId)}/sync`,
        {
          source_path: sourcePath,
          label,
          file_content: fileContent,
          checksum,
        },
      );

      if (!result.ok) return result;
      return ok(mapSyncResponse(result.value));
    },

    async getLatestSync(
      characterId: string,
      sourcePath: string,
    ): Promise<Result<SyncLatestResponse | null>> {
      const result = await request<SyncLatestApiResponse>(
        'GET',
        `/v1/characters/${encodeURIComponent(characterId)}/sync/latest?source_path=${encodeURIComponent(sourcePath)}`,
      );

      if (!result.ok) {
        if (result.error.status === 404) {
          return ok(null);
        }
        return result;
      }

      return ok(mapSyncLatestResponse(result.value));
    },

    async getSyncStatus(
      characterId: string,
    ): Promise<Result<SyncStatusResponse>> {
      const result = await request<{ entries: Array<{ source_path: string; label: string; last_synced_at: string; snapshot_id: string }> }>(
        'GET',
        `/v1/characters/${encodeURIComponent(characterId)}/sync/status`,
      );

      if (!result.ok) return result;

      return ok({
        entries: result.value.entries.map(
          (e): SyncStatusEntry => ({
            sourcePath: e.source_path,
            label: e.label,
            lastSyncedAt: e.last_synced_at,
            snapshotId: e.snapshot_id,
          }),
        ),
      });
    },

    async searchMemories(
      characterId: string,
      query: string,
      topK?: number,
    ): Promise<Result<SearchResult[]>> {
      const result = await request<SearchResultApiResponse[]>(
        'POST',
        `/v1/characters/${encodeURIComponent(characterId)}/search`,
        { query, top_k: topK ?? 5 },
      );

      if (!result.ok) return result;

      return ok(
        result.value.map(
          (r): SearchResult => ({
            content: r.content,
            category: r.category,
            score: r.score,
            createdAt: r.created_at,
          }),
        ),
      );
    },

    async addMemory(
      characterId: string,
      content: string,
      source?: string,
    ): Promise<Result<void>> {
      return request<void>(
        'POST',
        `/v1/characters/${encodeURIComponent(characterId)}/memories`,
        { content, source: source ?? 'openclaw-plugin' },
      );
    },
  };
}
