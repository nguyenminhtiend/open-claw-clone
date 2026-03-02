import type { PipelineContext, PipelineStage } from '../types.js';

export class SessionResolutionStage implements PipelineStage {
  name = 'session';

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    const session = ctx.services.sessions.getOrCreate(
      ctx.message.conversationId,
      ctx.message.channelId
    );

    session.lastActiveAt = new Date();
    ctx.session = session;

    return ctx;
  }
}
