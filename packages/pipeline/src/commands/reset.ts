import type { CommandHandler, CommandResult, PipelineContext } from '../types.js';

export class ResetCommand implements CommandHandler {
  name = 'reset';
  aliases = ['new', 'clear'];
  description = 'Reset the current session';

  async execute(_args: string, ctx: PipelineContext): Promise<CommandResult> {
    if (ctx.session) {
      ctx.session.messages = [];
      ctx.session.lastActiveAt = new Date();
    }
    return { response: 'Session reset. Starting fresh.' };
  }
}
