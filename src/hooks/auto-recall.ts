import type { HippoDidClient } from '../hippodid-client.js';
import type { PluginConfig, OpenClawPluginAPI } from '../types.js';

export function createAutoRecallHook(
  client: HippoDidClient,
  config: PluginConfig,
  logger: { info(msg: string): void; warn(msg: string): void },
): (api: OpenClawPluginAPI) => void {
  return (api: OpenClawPluginAPI) => {
    api.hooks.on('before_agent_start', async (...args: unknown[]) => {
      try {
        const userMessage = extractUserMessage(args);
        if (!userMessage) return;

        const result = await client.searchMemories(
          config.characterId,
          userMessage,
          5,
        );

        if (!result.ok) {
          logger.warn(
            `hippodid: recall search failed: ${result.error.message}`,
          );
          return;
        }

        const memories = result.value;
        if (memories.length === 0) {
          logger.info('hippodid: no relevant memories found');
          return;
        }

        const contextBlock = formatMemoriesBlock(memories);
        api.context.prepend(contextBlock);
        logger.info(`hippodid: recalled ${memories.length} memories for context`);
      } catch (e) {
        logger.warn(
          `hippodid: recall hook error: ${e instanceof Error ? e.message : 'unknown'}`,
        );
      }
    });
  };
}

function extractUserMessage(args: unknown[]): string | null {
  if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
    const event = args[0] as Record<string, unknown>;
    if (typeof event['message'] === 'string') return event['message'];
    if (typeof event['content'] === 'string') return event['content'];
    if (typeof event['text'] === 'string') return event['text'];
  }
  if (typeof args[0] === 'string') return args[0];
  return null;
}

interface MemoryEntry {
  content: string;
  category: string;
}

function formatMemoriesBlock(memories: MemoryEntry[]): string {
  const lines = memories.map(
    (m) => `- [Category: ${m.category}] ${m.content}`,
  );
  return `<hippodid-memories>\n${lines.join('\n')}\n</hippodid-memories>`;
}
