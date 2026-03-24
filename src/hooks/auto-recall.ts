import type { HippoDidClient } from '../hippodid-client.js';
import type { PluginConfig } from '../types.js';

export function createAutoRecallHook(
  client: HippoDidClient,
  config: PluginConfig,
  logger: { info(msg: string): void; warn(msg: string): void },
): (api: any) => void {
  return (api: any) => {
    api.on('before_agent_start', async (ctx: any) => {
      try {
        const query = ctx?.prompt ?? ctx?.message ?? ctx?.input ?? '';
        if (!query || query.length < 5) {
          return;
        }

        const result = await client.searchMemories(config.characterId, query);
        if (result.ok && result.value?.length > 0) {
          const memories = result.value
            .map((m: any) => m.content ?? m.text ?? m.body ?? '')
            .filter(Boolean)
            .join('\n---\n');

          logger.info(`hippodid: recalled ${result.value.length} memories`);
          return {
            prependContext: `## HippoDid Memories\n${memories}\n`,
          };
        }
      } catch (e) {
        logger.warn(
          `hippodid: recall error: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    });

    api.registerTool({
      name: 'hippodid:recall',
      description:
        'Search HippoDid character memory and return relevant context. Call this at the start of a task to recall relevant memories.',
      args: [
        {
          name: 'query',
          description: 'What to search for in memory',
          required: true,
        },
      ],
      execute: async (args: Record<string, string>) => {
        const query = args['query'] ?? '';
        const result = await client.searchMemories(config.characterId, query);
        if (result.ok && result.value.length > 0) {
          logger.info(
            `hippodid: recalled ${result.value.length} memories for query: ${query}`,
          );
          return result.value.map((m) => m.content).join('\n\n');
        }
        return 'No memories found.';
      },
    });

    logger.info('hippodid: auto-recall hook + hippodid:recall tool registered');
  };
}
