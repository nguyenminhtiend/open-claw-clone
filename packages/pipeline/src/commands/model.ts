import type { CommandHandler, CommandResult, PipelineContext } from '../types.js';

export class ModelCommand implements CommandHandler {
  name = 'model';
  description = 'Switch LLM model for this session';

  async execute(args: string, ctx: PipelineContext): Promise<CommandResult> {
    const requestedModel = args.trim();

    if (!requestedModel) {
      const current =
        (ctx.session?.metadata as Record<string, unknown> | undefined)?.model ??
        ctx.services.config.agents.defaults.provider.model;
      return { response: `Current model: \`${current}\`` };
    }

    if (ctx.session) {
      (ctx.session.metadata as Record<string, unknown>).model = requestedModel;
    }

    return { response: `Model switched to \`${requestedModel}\` for this session.` };
  }
}
