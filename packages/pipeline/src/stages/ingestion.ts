import type { PipelineContext, PipelineStage } from '../types.js';

export class IngestionStage implements PipelineStage {
  name = 'ingestion';

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    if (!ctx.message.content?.trim() && !ctx.message.attachments?.length) {
      ctx.aborted = true;
      ctx.abortReason = 'Empty message';
      return ctx;
    }

    ctx.message.content = ctx.message.content.trim();
    ctx.message.timestamp ??= new Date();

    return ctx;
  }
}
