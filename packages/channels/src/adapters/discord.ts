import {
  Client,
  Events,
  GatewayIntentBits,
  type Message,
  type SendableChannels,
  type TextBasedChannel,
} from 'discord.js';
import type { ChannelAdapter, ChannelConfig, ChannelMessage, OutboundMessage } from '../types.js';

export interface DiscordAdapterConfig {
  token: string;
  channelConfig: ChannelConfig;
}

export class DiscordAdapter implements ChannelAdapter {
  id = 'discord-bot';
  type = 'discord' as const;
  status: ChannelAdapter['status'] = 'disconnected';
  onMessage!: (message: ChannelMessage) => void;
  onError!: (error: Error) => void;

  private client: Client;

  constructor(private config: DiscordAdapterConfig) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });
  }

  async connect(): Promise<void> {
    this.status = 'connecting';

    this.client.on(Events.MessageCreate, (msg) => {
      if (msg.author.bot) {
        return;
      }
      this.onMessage(this.normalizeInbound(msg));
    });

    this.client.on(Events.Error, (err) => this.onError(err));

    await this.client.login(this.config.token);
    this.status = 'connected';
  }

  async disconnect(): Promise<void> {
    this.client.destroy();
    this.status = 'disconnected';
  }

  async sendMessage(conversationId: string, content: OutboundMessage): Promise<string> {
    const channel = await this.client.channels.fetch(conversationId);
    if (!channel?.isTextBased()) {
      throw new Error(`Not a text channel: ${conversationId}`);
    }

    const result = await (channel as SendableChannels).send({
      content: content.text,
      ...(content.replyTo ? { reply: { messageReference: content.replyTo } } : {}),
    });

    return result.id;
  }

  async editMessage(
    conversationId: string,
    messageId: string,
    content: OutboundMessage
  ): Promise<void> {
    const channel = await this.client.channels.fetch(conversationId);
    if (!channel?.isTextBased()) {
      return;
    }
    const msg = await (channel as TextBasedChannel).messages.fetch(messageId);
    await msg.edit(content.text);
  }

  async deleteMessage(conversationId: string, messageId: string): Promise<void> {
    const channel = await this.client.channels.fetch(conversationId);
    if (!channel?.isTextBased()) {
      return;
    }
    const msg = await (channel as TextBasedChannel).messages.fetch(messageId);
    await msg.delete();
  }

  private normalizeInbound(msg: Message): ChannelMessage {
    return {
      id: msg.id,
      channelId: this.id,
      channelType: 'discord',
      conversationId: msg.channelId,
      senderId: msg.author.id,
      senderName: msg.author.username,
      content: msg.content,
      replyTo: msg.reference?.messageId ?? undefined,
      attachments: msg.attachments.map((a) => ({
        type: (a.contentType?.startsWith('image') ? 'image' : 'file') as 'image' | 'file',
        url: a.url,
        filename: a.name ?? undefined,
        mimeType: a.contentType ?? undefined,
      })),
      timestamp: msg.createdAt,
      raw: msg,
    };
  }
}
