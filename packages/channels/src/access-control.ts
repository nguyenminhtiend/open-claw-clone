import type { ChannelConfig, ChannelMessage } from './types.js';
import { RateLimiter } from './util/rate-limiter.js';

export class AccessController {
  private rateLimiters = new Map<string, RateLimiter>();

  check(channelId: string, config: ChannelConfig, msg: ChannelMessage): boolean {
    if (!this.checkPolicy(config, msg)) {
      return false;
    }
    if (config.rateLimit) {
      if (!this.checkRateLimit(channelId, config, msg)) {
        return false;
      }
    }
    return true;
  }

  private checkPolicy(config: ChannelConfig, msg: ChannelMessage): boolean {
    switch (config.dmPolicy) {
      case 'open':
        return true;

      case 'allowlist':
        if (!config.allowedUsers?.length) {
          return false;
        }
        return config.allowedUsers.includes(msg.senderId);

      case 'pairing':
        return false;

      default:
        return false;
    }
  }

  private checkRateLimit(channelId: string, config: ChannelConfig, msg: ChannelMessage): boolean {
    const key = `${channelId}:${msg.senderId}`;
    if (!this.rateLimiters.has(channelId)) {
      const mpm = config.rateLimit?.messagesPerMinute ?? 60;
      this.rateLimiters.set(channelId, new RateLimiter(mpm));
    }
    const limiter = this.rateLimiters.get(channelId);
    return limiter?.check(key) ?? true;
  }
}
