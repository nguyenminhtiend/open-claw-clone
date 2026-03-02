import { Bot, type Context } from 'grammy';
import { markdownToTelegramHtml } from '../formatter.js';
import type { ChannelAdapter, ChannelConfig, ChannelMessage, OutboundMessage } from '../types.js';

export interface TelegramAdapterConfig {
  token: string;
  channelConfig: ChannelConfig;
}

export class TelegramAdapter implements ChannelAdapter {
  id: string;
  type = 'telegram' as const;
  status: ChannelAdapter['status'] = 'disconnected';
  onMessage!: (message: ChannelMessage) => void;
  onError!: (error: Error) => void;

  private bot: Bot;

  constructor(private config: TelegramAdapterConfig) {
    this.id = `telegram-${config.token.split(':')[0]}`;
    this.bot = new Bot(config.token);
  }

  async connect(): Promise<void> {
    this.status = 'connecting';

    this.bot.on('message:text', (ctx) => {
      this.onMessage(this.normalizeInbound(ctx));
    });

    this.bot.on('message:photo', (ctx) => {
      this.onMessage(this.normalizeInbound(ctx, 'image'));
    });

    this.bot.on('message:document', (ctx) => {
      this.onMessage(this.normalizeInbound(ctx, 'file'));
    });

    this.bot.on('message:voice', (ctx) => {
      this.onMessage(this.normalizeInbound(ctx, 'voice'));
    });

    this.bot.catch((err) => {
      this.onError(err.error as Error);
    });

    // Start long-polling (switch to webhooks for production)
    void this.bot.start();
    this.status = 'connected';
  }

  async disconnect(): Promise<void> {
    await this.bot.stop();
    this.status = 'disconnected';
  }

  async sendMessage(conversationId: string, content: OutboundMessage): Promise<string> {
    const chatId = Number(conversationId);
    const text = content.format === 'html' ? content.text : markdownToTelegramHtml(content.text);

    const result = await this.bot.api.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      ...(content.replyTo ? { reply_parameters: { message_id: Number(content.replyTo) } } : {}),
    });

    return String(result.message_id);
  }

  async editMessage(
    conversationId: string,
    messageId: string,
    content: OutboundMessage
  ): Promise<void> {
    const text = content.format === 'html' ? content.text : markdownToTelegramHtml(content.text);
    await this.bot.api.editMessageText(Number(conversationId), Number(messageId), text, {
      parse_mode: 'HTML',
    });
  }

  async deleteMessage(conversationId: string, messageId: string): Promise<void> {
    await this.bot.api.deleteMessage(Number(conversationId), Number(messageId));
  }

  private normalizeInbound(
    ctx: Context,
    attachmentType?: 'image' | 'file' | 'voice'
  ): ChannelMessage {
    const msg = ctx.message;
    const from = msg?.from;

    const message: ChannelMessage = {
      id: String(msg?.message_id ?? 0),
      channelId: this.id,
      channelType: 'telegram',
      conversationId: String(msg?.chat.id ?? 0),
      senderId: String(from?.id ?? 'unknown'),
      senderName: (from?.first_name ?? '') + (from?.last_name ? ` ${from.last_name}` : ''),
      content: msg?.text ?? msg?.caption ?? '',
      replyTo: msg?.reply_to_message ? String(msg.reply_to_message.message_id) : undefined,
      timestamp: new Date((msg?.date ?? 0) * 1000),
      raw: msg,
    };

    if (attachmentType === 'image' && msg?.photo) {
      const largest = msg.photo[msg.photo.length - 1];
      message.attachments = [{ type: 'image', filename: largest?.file_id }];
    } else if (attachmentType === 'file' && msg?.document) {
      message.attachments = [
        {
          type: 'file',
          filename: msg.document.file_name,
          mimeType: msg.document.mime_type,
        },
      ];
    } else if (attachmentType === 'voice' && msg?.voice) {
      message.attachments = [{ type: 'voice', mimeType: msg.voice.mime_type }];
    }

    return message;
  }
}
