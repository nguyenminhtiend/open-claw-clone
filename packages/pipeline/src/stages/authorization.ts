import type { PipelineContext, PipelineStage } from '../types.js';

export class AuthorizationStage implements PipelineStage {
  name = 'authorization';

  private rateCounts = new Map<string, { count: number; resetAt: number }>();

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    const channelType = ctx.message.channelType as 'telegram' | 'discord' | 'webchat';
    const channelConfig = ctx.services.config.channels[channelType];

    if (!channelConfig) {
      ctx.authorized = true;
      return ctx;
    }

    if (channelConfig.dmPolicy === 'allowlist') {
      const allowed = channelConfig.allowedUsers?.includes(ctx.message.senderId);
      if (!allowed) {
        ctx.aborted = true;
        ctx.abortReason = 'User not in allowlist';
        return ctx;
      }
    }

    if (channelConfig.rateLimit) {
      const exceeded = this.checkRateLimit(
        ctx.message.senderId,
        channelConfig.rateLimit.messagesPerMinute
      );
      if (exceeded) {
        ctx.aborted = true;
        ctx.abortReason = 'Rate limit exceeded';
        return ctx;
      }
    }

    ctx.authorized = true;
    return ctx;
  }

  private checkRateLimit(userId: string, limit: number): boolean {
    const now = Date.now();
    const entry = this.rateCounts.get(userId);

    if (!entry || entry.resetAt < now) {
      this.rateCounts.set(userId, { count: 1, resetAt: now + 60_000 });
      return false;
    }

    entry.count++;
    return entry.count > limit;
  }
}
