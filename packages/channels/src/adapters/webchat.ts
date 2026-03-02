import { nanoid } from 'nanoid';
import type { ChannelAdapter, ChannelMessage, OutboundMessage } from '../types.js';

/**
 * Minimal interface the WebChatAdapter needs from the gateway.
 * The gateway implements this — no circular dependency.
 */
export interface WebChatGateway {
  registerRpc(
    method: string,
    handler: (params: Record<string, unknown>, ctx: { connId: string }) => Promise<unknown>
  ): void;
  sendToConnection(connId: string, method: string, params: Record<string, unknown>): void;
}

export class WebChatAdapter implements ChannelAdapter {
  id = 'webchat';
  type = 'webchat' as const;
  status: ChannelAdapter['status'] = 'disconnected';
  onMessage!: (message: ChannelMessage) => void;
  onError!: (error: Error) => void;

  constructor(private gateway: WebChatGateway) {}

  async connect(): Promise<void> {
    this.gateway.registerRpc('webchat.send', async (params, ctx) => {
      const msg: ChannelMessage = {
        id: nanoid(),
        channelId: 'webchat',
        channelType: 'webchat',
        conversationId: ctx.connId,
        senderId: ctx.connId,
        senderName: 'user',
        content: params.message as string,
        timestamp: new Date(),
        raw: params,
      };
      this.onMessage(msg);
      return { ok: true };
    });

    this.status = 'connected';
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected';
  }

  async sendMessage(conversationId: string, content: OutboundMessage): Promise<string> {
    this.gateway.sendToConnection(conversationId, 'webchat.message', { text: content.text });
    return nanoid();
  }

  async editMessage(
    _conversationId: string,
    _messageId: string,
    _content: OutboundMessage
  ): Promise<void> {
    // no-op for webchat
  }

  async deleteMessage(_conversationId: string, _messageId: string): Promise<void> {
    // no-op for webchat
  }
}
