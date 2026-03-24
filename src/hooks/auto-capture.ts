import type { HippoDidClient } from '../hippodid-client.js';
import type { PluginConfig } from '../types.js';

export function createAutoCaptureHook(
  client: HippoDidClient,
  config: PluginConfig,
  logger: { info(msg: string): void; warn(msg: string): void },
): (api: any) => void {
  return (api: any) => {
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
    logger.info('hippodid: auto-capture hook registered (agent_end)');
  };
}
