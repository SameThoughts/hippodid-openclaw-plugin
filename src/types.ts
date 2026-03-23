// --- Result type (discriminated union, zero deps) ---

export type Result<T, E = ApiError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// --- API error ---

export interface ApiError {
  status: number;
  message: string;
  retryable: boolean;
}

// --- Plugin config (matches openclaw.plugin.json configSchema) ---

export interface PluginConfig {
  apiKey: string;
  characterId: string;
  baseUrl: string;
  syncIntervalSeconds: number;
  autoRecall: boolean;
  autoCapture: boolean;
  additionalPaths: WatchPathConfig[];
}

export interface WatchPathConfig {
  path: string;
  label?: string;
}

// --- Watch path (resolved) ---

export interface WatchPath {
  path: string;
  label: string;
  source: 'auto-detected' | 'user-specified';
}

// --- Tier info ---

export interface TierInfo {
  tier: string;
  features: {
    autoRecallAvailable: boolean;
    autoCaptureAvailable: boolean;
    minSyncIntervalSeconds: number;
  };
}

export interface TierApiResponse {
  tier: string;
  features: {
    auto_recall_available: boolean;
    auto_capture_available: boolean;
    min_sync_interval_seconds: number;
  };
}

// --- Sync responses ---

export interface SyncResponse {
  status: string;
  snapshotId: string;
  changed: boolean;
}

export interface SyncApiResponse {
  status: string;
  snapshot_id: string;
  changed: boolean;
}

export interface SyncLatestResponse {
  sourcePath: string;
  fileContent: string;
  snapshotId: string;
  syncedAt: string;
}

export interface SyncLatestApiResponse {
  source_path: string;
  file_content: string;
  snapshot_id: string;
  synced_at: string;
}

export interface SyncStatusEntry {
  sourcePath: string;
  label: string;
  lastSyncedAt: string;
  snapshotId: string;
}

export interface SyncStatusResponse {
  entries: SyncStatusEntry[];
}

// --- Search ---

export interface SearchResult {
  content: string;
  category: string;
  score: number;
  createdAt: string;
}

export interface SearchResultApiResponse {
  content: string;
  category: string;
  score: number;
  created_at: string;
}

// --- File tracking ---

export interface FileTrackingEntry {
  hash: string;
  lastSyncedAt: Date;
}

// --- OpenClaw Plugin API (local type, matches openclaw/plugin-sdk/core) ---

export interface OpenClawPluginAPI {
  config: PluginConfig;
  logger: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
  on(event: string, handler: (...args: any[]) => void | Promise<void>): void;
  context: {
    prepend(content: string): void;
  };
  commands: {
    register(name: string, options: CommandOptions): void;
  };
}

export interface CommandOptions {
  description: string;
  args?: CommandArg[];
  handler: (args: Record<string, string>) => void | Promise<void>;
}

export interface CommandArg {
  name: string;
  description: string;
  required?: boolean;
}
