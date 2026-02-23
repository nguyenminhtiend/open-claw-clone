# Channel Interface Reference

## Contents

- [ChannelMessage](#channelmessage)
- [ChannelAdapter](#channeladapter)
- [OutboundMessage](#outboundmessage)
- [ChannelConfig](#channelconfig)
- [Attachment](#attachment)

---

## ChannelMessage

Unified platform-agnostic inbound message format.

```typescript
interface ChannelMessage {
  id: string; // platform message ID
  channelId: string; // adapter instance ID
  channelType: 'telegram' | 'discord' | 'webchat';
  conversationId: string; // chat/thread/DM ID
  senderId: string; // platform user ID
  senderName?: string;
  content: string; // normalized plain text
  attachments: Attachment[];
  timestamp: Date;
  raw: unknown; // original platform payload
}
```

---

## ChannelAdapter

Interface every adapter must implement.

```typescript
interface ChannelAdapter {
  readonly channelType: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendMessage(conversationId: string, message: OutboundMessage): Promise<void>;
  editMessage(conversationId: string, messageId: string, message: OutboundMessage): Promise<void>;
  deleteMessage(conversationId: string, messageId: string): Promise<void>;
  onMessage: (message: ChannelMessage) => void;
  onError: (error: Error) => void;
}
```

---

## OutboundMessage

```typescript
interface OutboundMessage {
  text: string;
  format: 'markdown' | 'plain';
  replyTo?: string; // message ID to reply to
  attachments?: Attachment[];
}
```

---

## ChannelConfig

Per-channel configuration (from config.json5).

```typescript
interface ChannelConfig {
  enabled: boolean;
  dmPolicy: 'open' | 'allowlist' | 'pairing';
  allowedUsers?: string[]; // platform user IDs (for allowlist mode)
  groupPolicy: 'mention-required' | 'open';
  allowedGroups?: string[]; // group/channel IDs
  rateLimit: {
    messagesPerMinute: number; // default: 20
  };
}
```

---

## Attachment

```typescript
interface Attachment {
  type: 'image' | 'file' | 'audio' | 'video';
  url?: string;
  data?: Buffer;
  mimeType: string;
  filename?: string;
  size?: number; // bytes
}
```
