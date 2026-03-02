import type { CommandHandler, CommandResult, PipelineContext } from '../types.js';

export class StopCommand implements CommandHandler {
  name = 'stop';
  description = 'Abort the current agent run';

  async execute(_args: string, _ctx: PipelineContext): Promise<CommandResult> {
    return { response: 'No active agent run to stop.' };
  }
}
