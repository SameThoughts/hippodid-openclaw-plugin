import type { HippoDidClient } from '../hippodid-client.js';
import type { PluginConfig, OpenClawPluginAPI } from '../types.js';

export function createAutoCaptureHook(
  client: HippoDidClient,
  config: PluginConfig,
  logger: { info(msg: string): void; warn(msg: string): void },
): (api: OpenClawPluginAPI) => void {
  return (api: OpenClawPluginAPI) => {
    api.on('agent_end', (...args: unknown[]) => {
      try {
        const exchange = extractExchange(args);
        if (!exchange) return;

        client
          .addMemory(config.characterId, exchange, 'openclaw-auto-capture')
          .then((result) => {
            if (result.ok) {
              logger.info('hippodid: captured exchange for memory extraction');
            } else {
              logger.warn(
                `hippodid: capture failed: ${result.error.message}`,
              );
            }
          })
          .catch((e) => {
            logger.warn(
              `hippodid: capture error: ${e instanceof Error ? e.message : 'unknown'}`,
            );
          });
      } catch (e) {
        logger.warn(
          `hippodid: capture hook error: ${e instanceof Error ? e.message : 'unknown'}`,
        );
      }
    });
  };
}

function extractExchange(args: unknown[]): string | null {
  if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
    const event = args[0] as Record<string, unknown>;

    const userMsg =
      typeof event['userMessage'] === 'string' ? event['userMessage'] : '';
    const agentResp =
      typeof event['agentResponse'] === 'string' ? event['agentResponse'] : '';

    if (userMsg || agentResp) {
      return `User: ${userMsg}\n\nAgent: ${agentResp}`;
    }

    if (typeof event['content'] === 'string') return event['content'];
    if (typeof event['text'] === 'string') return event['text'];
  }
  if (typeof args[0] === 'string') return args[0];
  return null;
}
