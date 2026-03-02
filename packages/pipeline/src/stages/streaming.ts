import type { PipelineContext, PipelineStage } from '../types.js';

export class BlockStreamingStage implements PipelineStage {
  name = 'streaming';

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    if (!ctx.session) {
      return ctx;
    }

    const meta = ctx.session.metadata as Record<string, unknown>;
    const response = meta._lastAgentResponse;
    if (typeof response !== 'string' || !response) {
      return ctx;
    }

    if (ctx.message.channelType !== 'webchat') {
      const maxLength = this.getMaxLength(ctx.message.channelType);
      const chunks = this.splitMessage(response, maxLength);

      for (const chunk of chunks) {
        await ctx.services.channels.sendToChannel(
          ctx.message.channelId,
          ctx.message.conversationId,
          { text: chunk, format: 'markdown' }
        );
      }
    }

    ctx.responded = true;
    return ctx;
  }

  private getMaxLength(channelType: string): number {
    switch (channelType) {
      case 'telegram':
        return 4096;
      case 'discord':
        return 2000;
      default:
        return 10_000;
    }
  }

  private splitMessage(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) {
      return [text];
    }

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      let splitAt = remaining.lastIndexOf('\n\n', maxLength);
      if (splitAt === -1) {
        splitAt = remaining.lastIndexOf('\n', maxLength);
      }
      if (splitAt === -1) {
        splitAt = remaining.lastIndexOf('. ', maxLength);
      }
      if (splitAt === -1) {
        splitAt = maxLength;
      }

      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
    }

    return chunks;
  }
}
