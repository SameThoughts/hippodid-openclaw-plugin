import type { HippoDidClient } from '../hippodid-client.js';
import type { PluginConfig } from '../types.js';

export function createAutoCaptureHook(
  client: HippoDidClient,
  config: PluginConfig,
  logger: { info(msg: string): void; warn(msg: string): void },
): (api: any) => void {
  return (api: any) => {
    // OpenClaw 2026 does not support api.on() for post-response hooks.
    // Register a capture tool that agents invoke to store important information.
    api.registerTool('hippodid:remember', {
      description: 'Save important information to HippoDid character memory. Call this to store facts, decisions, preferences, or context that should persist across sessions.',
      args: [
        {
          name: 'content',
          description: 'The information to remember',
          required: true,
        },
      ],
      handler: async (args: Record<string, string>) => {
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
    logger.info('hippodid: auto-capture tool registered as hippodid:remember');
  };
}
