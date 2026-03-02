import type { CommandHandler, CommandResult, PipelineContext } from '../types.js';

export class HelpCommand implements CommandHandler {
  name = 'help';
  description = 'List available commands';

  async execute(_args: string, _ctx: PipelineContext): Promise<CommandResult> {
    return {
      response: [
        '**Available Commands**',
        '/reset — Reset current session',
        '/model [name] — Switch LLM model',
        '/status — Show gateway status',
        '/memory [query] — Search memories',
        '/help — Show this help',
        '/stop — Abort current agent run',
      ].join('\n'),
    };
  }
}
