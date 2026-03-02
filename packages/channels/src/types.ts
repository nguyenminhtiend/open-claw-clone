export interface Attachment {
  type: 'image' | 'file' | 'audio' | 'video' | 'voice';
  url?: string;
  data?: Buffer;
  mimeType?: string;
  filename?: string;
}

export interface ChannelMessage {
  id: string;
  channelId: string;
  channelType: 'telegram' | 'discord' | 'webchat' | string;
  conversationId: string;
  senderId: string;
  senderName: string;
  content: string;
  replyTo?: string;
  attachments?: Attachment[];
  timestamp: Date;
  raw: unknown;
}

export interface OutboundMessage {
  text: string;
  format?: 'markdown' | 'html' | 'plain';
  replyTo?: string;
  attachments?: Attachment[];
}

export interface ChannelConfig {
  enabled: boolean;
  dmPolicy: 'pairing' | 'allowlist' | 'open';
  allowedUsers?: string[];
  groupPolicy?: {
    allowedGroups?: string[];
    mentionRequired?: boolean;
  };
  rateLimit?: {
    messagesPerMinute: number;
  };
}

export interface ChannelAdapter {
  id: string;
  type: string;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  sendMessage(conversationId: string, content: OutboundMessage): Promise<string>;
  editMessage(conversationId: string, messageId: string, content: OutboundMessage): Promise<void>;
  deleteMessage(conversationId: string, messageId: string): Promise<void>;

  onMessage: (message: ChannelMessage) => void;
  onError: (error: Error) => void;
}
