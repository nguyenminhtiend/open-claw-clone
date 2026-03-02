import { createLogger } from '@oclaw/shared';
import { AccessController } from './access-control.js';
import { formatForPlatform } from './formatter.js';
import type { ChannelAdapter, ChannelConfig, ChannelMessage, OutboundMessage } from './types.js';

const logger = createLogger('channels');

export class ChannelManager {
  private channels = new Map<string, ChannelAdapter>();
  private configs = new Map<string, ChannelConfig>();
  private access = new AccessController();

  constructor(private onMessage: (msg: ChannelMessage) => Promise<void>) {}

  async registerChannel(adapter: ChannelAdapter, config: ChannelConfig): Promise<void> {
    this.channels.set(adapter.id, adapter);
    this.configs.set(adapter.id, config);

    adapter.onMessage = async (msg) => {
      const allowed = this.access.check(adapter.id, config, msg);
      if (!allowed) {
        logger.debug(
          { channelId: adapter.id, senderId: msg.senderId },
          'Message blocked by access control'
        );
        return;
      }
      await this.onMessage(msg);
    };

    adapter.onError = (err) => {
      logger.error({ channelId: adapter.id, err }, 'Channel error');
    };

    if (config.enabled) {
      await adapter.connect();
      logger.info({ channelId: adapter.id, type: adapter.type }, 'Channel connected');
    }
  }

  async unregisterChannel(channelId: string): Promise<void> {
    const adapter = this.channels.get(channelId);
    if (!adapter) {
      return;
    }
    await adapter.disconnect();
    this.channels.delete(channelId);
    this.configs.delete(channelId);
    logger.info({ channelId }, 'Channel disconnected');
  }

  async sendToChannel(
    channelId: string,
    conversationId: string,
    message: OutboundMessage
  ): Promise<string> {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error(`Channel not found: ${channelId}`);
    }
    const formatted = formatForPlatform(channel.type, message);
    return channel.sendMessage(conversationId, formatted);
  }

  async shutdown(): Promise<void> {
    await Promise.all(Array.from(this.channels.keys()).map((id) => this.unregisterChannel(id)));
  }

  getStatus(): Record<string, { type: string; status: string }> {
    const result: Record<string, { type: string; status: string }> = {};
    for (const [id, ch] of this.channels) {
      result[id] = { type: ch.type, status: ch.status };
    }
    return result;
  }

  getChannel(channelId: string): ChannelAdapter | undefined {
    return this.channels.get(channelId);
  }
}
