import type { HippoDidClient } from '../hippodid-client.js';
import type { PluginConfig } from '../types.js';

export function createAutoRecallHook(
  client: HippoDidClient,
  config: PluginConfig,
  logger: { info(msg: string): void; warn(msg: string): void },
): (api: any) => void {
  return (api: any) => {
    // OpenClaw 2026 does not support api.on() for pre-response hooks.
    // Register a recall tool that agents invoke when they need memory context.
    api.registerTool('hippodid:recall', {
      description: 'Search HippoDid character memory and return relevant context. Call this at the start of a task to recall relevant memories.',
      args: [
        {
          name: 'query',
          description: 'What to search for in memory',
          required: true,
        },
      ],
      handler: async (args: Record<string, string>) => {
        const query = args['query'] ?? '';
        const result = await client.searchMemories(config.characterId, query);
        if (result.ok) {
          const memories = result.value;
          logger.info(`hippodid: recalled ${memories.length} memories for query: ${query}`);
          return memories.map((m) => m.content).join('\n\n');
        } else {
          logger.warn(`hippodid: recall failed: ${result.error.message}`);
          return 'No memories found.';
        }
      },
    });
    logger.info('hippodid: auto-recall tool registered as hippodid:recall');
  };
}
