import type { CommandHandler, CommandResult, PipelineContext } from '../types.js';

export class StatusCommand implements CommandHandler {
  name = 'status';
  description = 'Show gateway and channel status';

  async execute(_args: string, ctx: PipelineContext): Promise<CommandResult> {
    const channels = ctx.services.channels.getStatus();
    const sessions = ctx.services.sessions.size();

    const channelLines = Object.entries(channels).map(
      ([id, ch]) => `  - ${id} (${ch.type}): ${ch.status}`
    );

    return {
      response: ['**Gateway Status**', `Sessions: ${sessions}`, 'Channels:', ...channelLines].join(
        '\n'
      ),
    };
  }
}
