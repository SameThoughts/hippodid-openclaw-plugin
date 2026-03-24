import type { HippoDidClient } from '../hippodid-client.js';
import type { PluginConfig } from '../types.js';

export function createAutoRecallHook(
  client: HippoDidClient,
  config: PluginConfig,
  logger: { info(msg: string): void; warn(msg: string): void },
): (api: any) => void {
  return (api: any) => {
    api.registerHook(
      'before_agent_start',
      async (ctx: any) => {
        try {
          const query = ctx?.prompt ?? ctx?.message ?? ctx?.input ?? '';
          if (!query) return;

          const result = await client.searchMemories(config.characterId, query);
          if (result.ok && result.value?.length > 0) {
            const memories = result.value
              .map((m: any) => m.content ?? m.text ?? m.body ?? '')
              .filter(Boolean)
              .join('\n---\n');
            ctx.prependContext?.(`## HippoDid Memories\n${memories}\n`);
            logger.info(`hippodid: recalled ${result.value.length} memories`);
          }
        } catch (e) {
          logger.warn(`hippodid: recall error: ${e instanceof Error ? e.message : String(e)}`);
        }
      },
      { name: 'hippodid.before-agent-start', description: 'Inject HippoDid memories before agent responds' },
    );
    logger.info('hippodid: auto-recall hook registered (before_agent_start)');
  };
}
