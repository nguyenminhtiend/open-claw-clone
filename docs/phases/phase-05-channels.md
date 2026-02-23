# Phase 5: Channels & Messaging

> Build the unified channel abstraction layer and implement Telegram and Discord adapters.

## Learning Goals

- Adapter design pattern for platform abstraction
- Telegram Bot API (grammY SDK, long polling, webhooks)
- Discord Bot API (discord.js, gateway events)
- Message normalization across platforms
- DM policies and access control
- Platform-specific formatting (Markdown → Telegram HTML, Discord markdown)

## Why This Matters

Channels are how the agent reaches the outside world. Instead of building separate bots for each platform, OpenClaw normalizes all messaging platforms into a single interface. One agent logic, many surfaces. We'll implement the two most practical channels for personal use: Telegram and Discord.

---

## Architecture

```
Channel System
├── Channel Manager
│   ├── Channel lifecycle (start/stop/restart)
│   ├── Channel registry
│   └── Health monitoring
├── Channel Interface (abstract)
│   ├── connect()
│   ├── disconnect()
│   ├── sendMessage()
│   ├── editMessage()
│   ├── deleteMessage()
│   └── onMessage callback
├── Message Normalizer
│   ├── Inbound: Platform → Unified format
│   └── Outbound: Unified format → Platform
├── Access Control
│   ├── DM policy (pairing / allowlist / open)
│   ├── Group policy (mention-required / allowlist)
│   └── Rate limiting
└── Adapters
    ├── Telegram (grammY)
    ├── Discord (discord.js)
    └── WebChat (built-in, WS-based)
```

---

## Step-by-Step Implementation

### 5.1 — Channel Abstraction

**Files:**

```
packages/channels/
  ├── package.json
  ├── tsconfig.json
  └── src/
      ├── index.ts
      ├── types.ts              # Channel interfaces & message types
      ├── manager.ts            # Channel lifecycle manager
      ├── normalizer.ts         # Message normalization
      ├── access-control.ts     # DM/group policies
      ├── formatter.ts          # Outbound format conversion
      ├── adapters/
      │   ├── telegram.ts       # Telegram adapter
      │   ├── discord.ts        # Discord adapter
      │   └── webchat.ts        # Built-in WebSocket chat
      └── util/
          └── rate-limiter.ts   # Per-channel rate limiting
```

**Core interfaces:**

```typescript
// Unified message format (platform-agnostic)
interface ChannelMessage {
  id: string;
  channelId: string;
  channelType: "telegram" | "discord" | "webchat" | string;
  conversationId: string;  // Chat/DM/Channel ID on the platform
  senderId: string;
  senderName: string;
  content: string;         // Normalized text
  replyTo?: string;        // Message ID being replied to
  attachments?: Attachment[];
  timestamp: Date;
  raw: unknown;            // Original platform payload
}

interface Attachment {
  type: "image" | "file" | "audio" | "video" | "voice";
  url?: string;
  data?: Buffer;
  mimeType?: string;
  filename?: string;
}

// Channel adapter contract
interface ChannelAdapter {
  id: string;
  type: string;
  status: "connected" | "disconnected" | "connecting" | "error";

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  sendMessage(conversationId: string, content: OutboundMessage): Promise<string>;
  editMessage(conversationId: string, messageId: string, content: OutboundMessage): Promise<void>;
  deleteMessage(conversationId: string, messageId: string): Promise<void>;

  onMessage: (message: ChannelMessage) => void;
  onError: (error: Error) => void;
}

interface OutboundMessage {
  text: string;
  format?: "markdown" | "html" | "plain";
  replyTo?: string;
  attachments?: Attachment[];
}

// Channel config (per adapter)
interface ChannelConfig {
  enabled: boolean;
  dmPolicy: "pairing" | "allowlist" | "open";
  allowedUsers?: string[];
  groupPolicy?: {
    allowedGroups?: string[];
    mentionRequired?: boolean;
  };
  rateLimit?: {
    messagesPerMinute: number;
  };
}
```

### 5.2 — Channel Manager

```typescript
class ChannelManager {
  private channels = new Map<string, ChannelAdapter>();
  private configs = new Map<string, ChannelConfig>();

  constructor(
    private gateway: Gateway,
    private onMessage: (msg: ChannelMessage) => Promise<void>,
  ) {}

  async registerChannel(adapter: ChannelAdapter, config: ChannelConfig): Promise<void> {
    this.channels.set(adapter.id, adapter);
    this.configs.set(adapter.id, config);

    adapter.onMessage = async (msg) => {
      // Access control check
      const allowed = this.checkAccess(adapter.id, msg);
      if (!allowed) return;

      // Normalize and forward to gateway
      await this.onMessage(msg);
    };

    adapter.onError = (err) => {
      logger.error({ channelId: adapter.id, error: err }, "Channel error");
    };

    if (config.enabled) {
      await adapter.connect();
      logger.info({ channelId: adapter.id }, "Channel connected");
    }
  }

  private checkAccess(channelId: string, msg: ChannelMessage): boolean {
    const config = this.configs.get(channelId);
    if (!config) return false;

    if (config.dmPolicy === "allowlist" && config.allowedUsers?.length) {
      return config.allowedUsers.includes(msg.senderId);
    }

    if (config.dmPolicy === "open") return true;

    // "pairing" mode — requires explicit pairing (implement later)
    return false;
  }

  async sendToChannel(channelId: string, conversationId: string, message: OutboundMessage): Promise<string> {
    const channel = this.channels.get(channelId);
    if (!channel) throw new Error(`Channel not found: ${channelId}`);

    // Format message for target platform
    const formatted = this.formatForChannel(channel.type, message);
    return channel.sendMessage(conversationId, formatted);
  }

  getStatus(): Record<string, { type: string; status: string }> {
    const result: Record<string, { type: string; status: string }> = {};
    for (const [id, ch] of this.channels) {
      result[id] = { type: ch.type, status: ch.status };
    }
    return result;
  }
}
```

### 5.3 — Telegram Adapter

Using **grammY** — a modern, TypeScript-first Telegram bot framework.

```typescript
import { Bot, Context } from "grammy";

class TelegramAdapter implements ChannelAdapter {
  id: string;
  type = "telegram";
  status: ChannelAdapter["status"] = "disconnected";
  onMessage!: (message: ChannelMessage) => void;
  onError!: (error: Error) => void;

  private bot: Bot;

  constructor(private config: { token: string; channelConfig: ChannelConfig }) {
    this.id = `telegram-${config.token.split(":")[0]}`;
    this.bot = new Bot(config.token);
  }

  async connect(): Promise<void> {
    this.status = "connecting";

    this.bot.on("message:text", (ctx) => {
      const msg = this.normalizeInbound(ctx);
      this.onMessage(msg);
    });

    this.bot.on("message:photo", (ctx) => {
      const msg = this.normalizeInbound(ctx, "image");
      this.onMessage(msg);
    });

    this.bot.catch((err) => {
      this.onError(err.error as Error);
    });

    // Start long polling (use webhooks in production)
    this.bot.start();
    this.status = "connected";
  }

  async disconnect(): Promise<void> {
    await this.bot.stop();
    this.status = "disconnected";
  }

  async sendMessage(conversationId: string, content: OutboundMessage): Promise<string> {
    const chatId = Number(conversationId);
    const opts: any = {};

    if (content.replyTo) {
      opts.reply_to_message_id = Number(content.replyTo);
    }

    // Telegram uses HTML or MarkdownV2
    const text = this.formatOutbound(content);
    const result = await this.bot.api.sendMessage(chatId, text, {
      parse_mode: "HTML",
      ...opts,
    });

    return String(result.message_id);
  }

  async editMessage(conversationId: string, messageId: string, content: OutboundMessage): Promise<void> {
    const text = this.formatOutbound(content);
    await this.bot.api.editMessageText(Number(conversationId), Number(messageId), text, {
      parse_mode: "HTML",
    });
  }

  async deleteMessage(conversationId: string, messageId: string): Promise<void> {
    await this.bot.api.deleteMessage(Number(conversationId), Number(messageId));
  }

  private normalizeInbound(ctx: Context, attachmentType?: string): ChannelMessage {
    const msg = ctx.message!;
    return {
      id: String(msg.message_id),
      channelId: this.id,
      channelType: "telegram",
      conversationId: String(msg.chat.id),
      senderId: String(msg.from!.id),
      senderName: msg.from!.first_name + (msg.from!.last_name ? ` ${msg.from!.last_name}` : ""),
      content: msg.text ?? msg.caption ?? "",
      replyTo: msg.reply_to_message ? String(msg.reply_to_message.message_id) : undefined,
      timestamp: new Date(msg.date * 1000),
      raw: msg,
    };
  }

  private formatOutbound(content: OutboundMessage): string {
    // Convert markdown to Telegram HTML
    return content.text
      .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
      .replace(/\*(.*?)\*/g, "<i>$1</i>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/```(\w+)?\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>");
  }
}
```

### 5.4 — Discord Adapter

```typescript
import { Client, GatewayIntentBits, Events } from "discord.js";

class DiscordAdapter implements ChannelAdapter {
  id: string;
  type = "discord";
  status: ChannelAdapter["status"] = "disconnected";
  onMessage!: (message: ChannelMessage) => void;
  onError!: (error: Error) => void;

  private client: Client;

  constructor(private config: { token: string; channelConfig: ChannelConfig }) {
    this.id = "discord-bot";
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
    this.status = "connecting";

    this.client.on(Events.MessageCreate, (msg) => {
      if (msg.author.bot) return;
      this.onMessage(this.normalizeInbound(msg));
    });

    this.client.on(Events.Error, (err) => this.onError(err));

    await this.client.login(this.config.token);
    this.status = "connected";
  }

  async disconnect(): Promise<void> {
    await this.client.destroy();
    this.status = "disconnected";
  }

  async sendMessage(conversationId: string, content: OutboundMessage): Promise<string> {
    const channel = await this.client.channels.fetch(conversationId);
    if (!channel?.isTextBased()) throw new Error("Not a text channel");

    // Discord supports markdown natively
    const result = await (channel as any).send({
      content: content.text,
      ...(content.replyTo ? { reply: { messageReference: content.replyTo } } : {}),
    });

    return result.id;
  }

  async editMessage(conversationId: string, messageId: string, content: OutboundMessage): Promise<void> {
    const channel = await this.client.channels.fetch(conversationId);
    if (!channel?.isTextBased()) return;
    const msg = await (channel as any).messages.fetch(messageId);
    await msg.edit(content.text);
  }

  async deleteMessage(conversationId: string, messageId: string): Promise<void> {
    const channel = await this.client.channels.fetch(conversationId);
    if (!channel?.isTextBased()) return;
    const msg = await (channel as any).messages.fetch(messageId);
    await msg.delete();
  }

  private normalizeInbound(msg: any): ChannelMessage {
    return {
      id: msg.id,
      channelId: this.id,
      channelType: "discord",
      conversationId: msg.channelId,
      senderId: msg.author.id,
      senderName: msg.author.username,
      content: msg.content,
      replyTo: msg.reference?.messageId,
      attachments: msg.attachments.map((a: any) => ({
        type: a.contentType?.startsWith("image") ? "image" : "file",
        url: a.url,
        filename: a.name,
        mimeType: a.contentType,
      })),
      timestamp: msg.createdAt,
      raw: msg,
    };
  }
}
```

### 5.5 — WebChat Adapter (Built-in)

A simple WebSocket-based chat channel for the control UI and CLI:

```typescript
class WebChatAdapter implements ChannelAdapter {
  id = "webchat";
  type = "webchat";
  status: ChannelAdapter["status"] = "disconnected";
  onMessage!: (message: ChannelMessage) => void;
  onError!: (error: Error) => void;

  constructor(private gateway: Gateway) {}

  async connect(): Promise<void> {
    // WebChat messages come through the Gateway's WS JSON-RPC
    // Register RPC handler for webchat.send
    this.gateway.rpcRouter.register("webchat.send", async (params, ctx) => {
      const msg: ChannelMessage = {
        id: nanoid(),
        channelId: "webchat",
        channelType: "webchat",
        conversationId: ctx.conn.id,
        senderId: ctx.conn.id,
        senderName: "user",
        content: params.message,
        timestamp: new Date(),
        raw: params,
      };
      this.onMessage(msg);
      return { ok: true };
    });

    this.status = "connected";
  }

  async disconnect(): Promise<void> {
    this.status = "disconnected";
  }

  async sendMessage(conversationId: string, content: OutboundMessage): Promise<string> {
    const conn = this.gateway.connections.get(conversationId);
    if (conn) {
      conn.socket.send(JSON.stringify({
        jsonrpc: "2.0",
        method: "webchat.message",
        params: { text: content.text },
      }));
    }
    return nanoid();
  }

  async editMessage() { /* no-op for webchat */ }
  async deleteMessage() { /* no-op for webchat */ }
}
```

---

## Wire Channels to Gateway

```typescript
// In gateway boot sequence (server.ts):
async bootChannels(config: Config) {
  this.channelManager = new ChannelManager(this, async (msg) => {
    // Route channel message to auto-reply pipeline (Phase 6)
    // For now, route directly to agent
    const session = this.sessions.getOrCreate(msg.conversationId, msg.channelId);
    const agent = new StreamingAgentLoop(config, this.provider, this.toolEngine);

    agent.on("stream:end", async () => {
      const lastAssistantMsg = session.getLastAssistantMessage();
      if (lastAssistantMsg) {
        await this.channelManager.sendToChannel(
          msg.channelId,
          msg.conversationId,
          { text: lastAssistantMsg.content, format: "markdown" },
        );
      }
    });

    await agent.runStreaming(session, msg.content);
  });

  // Register WebChat (always on)
  await this.channelManager.registerChannel(
    new WebChatAdapter(this),
    { enabled: true, dmPolicy: "open" },
  );

  // Register Telegram if configured
  if (config.channels.telegram?.token) {
    await this.channelManager.registerChannel(
      new TelegramAdapter({ token: config.channels.telegram.token, channelConfig: config.channels.telegram }),
      config.channels.telegram,
    );
  }

  // Register Discord if configured
  if (config.channels.discord?.token) {
    await this.channelManager.registerChannel(
      new DiscordAdapter({ token: config.channels.discord.token, channelConfig: config.channels.discord }),
      config.channels.discord,
    );
  }
}
```

---

## Testing Strategy

Key test scenarios:
- Channel manager starts/stops adapters based on config
- Telegram adapter normalizes messages correctly
- Discord adapter normalizes messages correctly
- Access control blocks unauthorized users
- Messages route from channel → session → agent → channel response
- Outbound formatting converts markdown to platform-specific format
- Connection errors are handled gracefully with reconnection
- Multiple channels can run simultaneously

---

## Checkpoint — You're Done When

- [ ] Telegram bot receives messages and responds via the agent
- [ ] Discord bot receives messages and responds via the agent
- [ ] WebChat works through the Gateway WS connection
- [ ] Access control blocks unauthorized users
- [ ] Messages are normalized to a unified format
- [ ] Responses are formatted correctly per platform
- [ ] Multiple channels run simultaneously
- [ ] Channel status is visible via `gateway.status` RPC

---

## Dependencies (additional)

```json
{
  "dependencies": {
    "grammy": "^1.x",
    "discord.js": "^14.x"
  }
}
```

---

## Next Phase

→ **[Phase 6: Auto-Reply Pipeline](phase-06-auto-reply.md)**
