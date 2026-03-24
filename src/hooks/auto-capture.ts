import type { HippoDidClient } from '../hippodid-client.js';
import type { PluginConfig } from '../types.js';

export function createAutoCaptureHook(
  client: HippoDidClient,
  config: PluginConfig,
  logger: { info(msg: string): void; warn(msg: string): void },
): (api: any) => void {
  return (api: any) => {
    // Lifecycle hook: capture conversation after agent responds
    api.registerHook(
      'agent_end',
      async (ctx: any) => {
        try {
          const user = ctx?.userMessage ?? ctx?.prompt ?? ctx?.input ?? '';
          const assistant = ctx?.assistantMessage ?? ctx?.response ?? ctx?.output ?? '';
          if (!user && !assistant) return;

          const content = [
            user ? `User: ${user}` : '',
            assistant ? `Assistant: ${assistant}` : '',
          ].filter(Boolean).join('\n');

          const result = await client.addMemory(config.characterId, content);
          if (result.ok) {
            logger.info('hippodid: captured conversation turn');
          }
        } catch (e) {
          logger.warn(`hippodid: capture error: ${e instanceof Error ? e.message : String(e)}`);
        }
      },
      { name: 'hippodid.agent-end', description: 'Capture conversation to HippoDid after agent responds' },
    );

    // Explicit tool: agents can call hippodid:remember directly
    api.registerTool({
      name: 'hippodid:remember',
      description: 'Save important information to HippoDid character memory. Call this to store facts, decisions, preferences, or context that should persist across sessions.',
      args: [
        {
          name: 'content',
          description: 'The information to remember',
          required: true,
        },
      ],
      execute: async (args: Record<string, string>) => {
        const content = args['content'] ?? '';
        if (!content) return 'Nothing to remember.';

        const result = await client.addMemory(config.characterId, content);
        if (result.ok) {
          logger.info(`hippodid: captured memory: ${content.slice(0, 80)}...`);
          return 'Remembered.';
        } else {
          logger.warn(`hippodid: capture failed: ${result.error.message}`);
          return `Failed to remember: ${result.error.message}`;
        }
      },
    });

    logger.info('hippodid: auto-capture hook + hippodid:remember tool registered');
  };
}
