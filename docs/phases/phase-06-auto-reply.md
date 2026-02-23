# Phase 6: Auto-Reply Pipeline

> Build the 7-stage message processing pipeline that routes messages from ingestion to agent dispatch.

## Learning Goals

- Pipeline / middleware architecture pattern
- Message debouncing (batch rapid messages)
- Command routing (slash commands vs. natural language)
- Session resolution (mapping conversations to sessions)
- Streaming block responses back to channels

## Why This Matters

Not every message needs the full LLM agent loop. The auto-reply pipeline is the smart router that sits between incoming messages and the agent. It handles auth, debouncing (so rapid messages get batched), slash commands (`/reset`, `/model`, `/status`), and only dispatches to the expensive LLM when truly needed. This is how OpenClaw stays fast and efficient.

---

## Architecture

```
Incoming Message (from any channel)
        │
        ▼
┌─── Stage 1: INGESTION ────────────┐
│  Normalize, validate, timestamp    │
└───────────────┬────────────────────┘
                ▼
┌─── Stage 2: AUTHORIZATION ─────────┐
│  Check DM/group policy, rate limit │
└───────────────┬────────────────────┘
                ▼
┌─── Stage 3: DEBOUNCING ────────────┐
│  Batch rapid messages (300ms wait) │
└───────────────┬────────────────────┘
                ▼
┌─── Stage 4: SESSION RESOLUTION ────┐
│  Find or create session for convo  │
└───────────────┬────────────────────┘
                ▼
┌─── Stage 5: COMMAND DETECTION ─────┐
│  Check for /slash commands         │
│  Route to command handler if found │
└───────────────┬────────────────────┘
                ▼
┌─── Stage 6: AGENT DISPATCH ────────┐
│  Assemble context, run agent loop  │
└───────────────┬────────────────────┘
                ▼
┌─── Stage 7: BLOCK STREAMING ───────┐
│  Stream response blocks to channel │
└────────────────────────────────────┘
```

---

## Step-by-Step Implementation

### 6.1 — Pipeline Framework

**Files:**

```
packages/pipeline/
  ├── package.json
  ├── tsconfig.json
  └── src/
      ├── index.ts
      ├── pipeline.ts           # Pipeline runner
      ├── types.ts              # Pipeline context types
      ├── stages/
      │   ├── ingestion.ts      # Stage 1
      │   ├── authorization.ts  # Stage 2
      │   ├── debouncing.ts     # Stage 3
      │   ├── session.ts        # Stage 4
      │   ├── commands.ts       # Stage 5
      │   ├── agent.ts          # Stage 6
      │   └── streaming.ts      # Stage 7
      ├── commands/
      │   ├── registry.ts       # Command registry
      │   ├── reset.ts          # /reset — clear session
      │   ├── model.ts          # /model — switch model
      │   ├── status.ts         # /status — show gateway info
      │   ├── memory.ts         # /memory — search memories
      │   ├── help.ts           # /help — list commands
      │   └── stop.ts           # /stop — abort current agent run
      └── debouncer.ts          # Message batching logic
```

**Pipeline types:**

```typescript
interface PipelineContext {
  // Input
  message: ChannelMessage;
  channel: ChannelAdapter;

  // Resolved during pipeline
  session?: Session;
  authorized?: boolean;
  isCommand?: boolean;
  commandName?: string;
  commandArgs?: string;
  batchedMessages?: ChannelMessage[];

  // Output control
  responded?: boolean;          // Stage already sent a response
  aborted?: boolean;            // Stop pipeline processing
  abortReason?: string;

  // Services (injected)
  services: {
    sessions: SessionManager;
    channels: ChannelManager;
    agent: AgentLoop;
    memory: MemoryFileStore;
    config: Config;
  };
}

type PipelineStage = {
  name: string;
  execute(ctx: PipelineContext): Promise<PipelineContext>;
};
```

**Pipeline runner:**

```typescript
class Pipeline {
  private stages: PipelineStage[] = [];

  use(stage: PipelineStage): this {
    this.stages.push(stage);
    return this;
  }

  async run(ctx: PipelineContext): Promise<PipelineContext> {
    for (const stage of this.stages) {
      const start = Date.now();

      try {
        ctx = await stage.execute(ctx);
      } catch (err) {
        logger.error({ stage: stage.name, error: err }, "Pipeline stage failed");
        ctx.aborted = true;
        ctx.abortReason = `Stage "${stage.name}" failed: ${err.message}`;
      }

      const duration = Date.now() - start;
      logger.debug({ stage: stage.name, duration, aborted: ctx.aborted }, "Pipeline stage complete");

      if (ctx.aborted || ctx.responded) break;
    }

    return ctx;
  }
}

// Build the pipeline
function createAutoReplyPipeline(services: PipelineContext["services"]): Pipeline {
  return new Pipeline()
    .use(new IngestionStage())
    .use(new AuthorizationStage())
    .use(new DebouncingStage())
    .use(new SessionResolutionStage())
    .use(new CommandDetectionStage())
    .use(new AgentDispatchStage())
    .use(new BlockStreamingStage());
}
```

### 6.2 — Stage Implementations

#### Stage 1: Ingestion

```typescript
class IngestionStage implements PipelineStage {
  name = "ingestion";

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    // Validate message has required fields
    if (!ctx.message.content?.trim() && !ctx.message.attachments?.length) {
      ctx.aborted = true;
      ctx.abortReason = "Empty message";
      return ctx;
    }

    // Trim and normalize whitespace
    ctx.message.content = ctx.message.content.trim();

    // Ensure timestamp
    ctx.message.timestamp ??= new Date();

    return ctx;
  }
}
```

#### Stage 2: Authorization

```typescript
class AuthorizationStage implements PipelineStage {
  name = "authorization";

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    const channelConfig = ctx.services.config.channels[ctx.message.channelType];

    if (!channelConfig) {
      ctx.authorized = true; // No config = no restrictions (webchat)
      return ctx;
    }

    // Check DM policy
    if (channelConfig.dmPolicy === "allowlist") {
      const allowed = channelConfig.allowedUsers?.includes(ctx.message.senderId);
      if (!allowed) {
        ctx.aborted = true;
        ctx.abortReason = "User not in allowlist";
        return ctx;
      }
    }

    // Rate limiting
    if (channelConfig.rateLimit) {
      const exceeded = await this.checkRateLimit(
        ctx.message.senderId,
        channelConfig.rateLimit.messagesPerMinute,
      );
      if (exceeded) {
        ctx.aborted = true;
        ctx.abortReason = "Rate limit exceeded";
        return ctx;
      }
    }

    ctx.authorized = true;
    return ctx;
  }

  private rateCounts = new Map<string, { count: number; resetAt: number }>();

  private async checkRateLimit(userId: string, limit: number): Promise<boolean> {
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
```

#### Stage 3: Debouncing

Batch rapid messages (e.g., when someone sends 3 messages in quick succession):

```typescript
class DebouncingStage implements PipelineStage {
  name = "debouncing";
  private debounceMs = 300;
  private pending = new Map<string, { messages: ChannelMessage[]; timer: NodeJS.Timeout; resolve: (msgs: ChannelMessage[]) => void }>();

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    const key = `${ctx.message.channelId}:${ctx.message.conversationId}`;

    const batched = await new Promise<ChannelMessage[]>((resolve) => {
      const existing = this.pending.get(key);

      if (existing) {
        clearTimeout(existing.timer);
        existing.messages.push(ctx.message);
        existing.timer = setTimeout(() => {
          this.pending.delete(key);
          resolve(existing.messages);
        }, this.debounceMs);
        existing.resolve = resolve;
      } else {
        const entry = {
          messages: [ctx.message],
          timer: setTimeout(() => {
            this.pending.delete(key);
            resolve(entry.messages);
          }, this.debounceMs),
          resolve,
        };
        this.pending.set(key, entry);
      }
    });

    // Combine batched messages
    if (batched.length > 1) {
      ctx.message.content = batched.map(m => m.content).join("\n");
      ctx.batchedMessages = batched;
    }

    return ctx;
  }
}
```

#### Stage 4: Session Resolution

```typescript
class SessionResolutionStage implements PipelineStage {
  name = "session";

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    const sessionKey = `${ctx.message.channelId}:${ctx.message.conversationId}`;

    // Try to find existing session
    let session = ctx.services.sessions.getByKey(sessionKey);

    if (!session) {
      // Create new session
      session = ctx.services.sessions.create({
        channelId: ctx.message.channelId,
        conversationId: ctx.message.conversationId,
        agentId: "default",
        metadata: {
          senderName: ctx.message.senderName,
          channelType: ctx.message.channelType,
        },
      });
    }

    session.lastActiveAt = new Date();
    ctx.session = session;

    return ctx;
  }
}
```

#### Stage 5: Command Detection

```typescript
class CommandDetectionStage implements PipelineStage {
  name = "commands";

  private commands = new Map<string, CommandHandler>();

  constructor() {
    this.register(new ResetCommand());
    this.register(new ModelCommand());
    this.register(new StatusCommand());
    this.register(new MemoryCommand());
    this.register(new HelpCommand());
    this.register(new StopCommand());
  }

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    const text = ctx.message.content;

    // Check for /command pattern
    if (!text.startsWith("/")) return ctx;

    const spaceIdx = text.indexOf(" ");
    const commandName = spaceIdx === -1 ? text.slice(1) : text.slice(1, spaceIdx);
    const commandArgs = spaceIdx === -1 ? "" : text.slice(spaceIdx + 1).trim();

    const handler = this.commands.get(commandName);
    if (!handler) return ctx; // Not a known command, continue to agent

    ctx.isCommand = true;
    ctx.commandName = commandName;
    ctx.commandArgs = commandArgs;

    // Execute command
    const result = await handler.execute(commandArgs, ctx);

    // Send command response
    if (result.response) {
      await ctx.services.channels.sendToChannel(
        ctx.message.channelId,
        ctx.message.conversationId,
        { text: result.response, format: "markdown" },
      );
      ctx.responded = true;
    }

    return ctx;
  }

  register(handler: CommandHandler) {
    this.commands.set(handler.name, handler);
    for (const alias of handler.aliases ?? []) {
      this.commands.set(alias, handler);
    }
  }
}

// Example commands:
interface CommandHandler {
  name: string;
  aliases?: string[];
  description: string;
  execute(args: string, ctx: PipelineContext): Promise<{ response?: string }>;
}

class ResetCommand implements CommandHandler {
  name = "reset";
  aliases = ["new", "clear"];
  description = "Reset the current session";

  async execute(args: string, ctx: PipelineContext): Promise<{ response?: string }> {
    if (ctx.session) {
      ctx.services.sessions.reset(ctx.session.id);
    }
    return { response: "Session reset. Starting fresh." };
  }
}

class StatusCommand implements CommandHandler {
  name = "status";
  description = "Show gateway and channel status";

  async execute(args: string, ctx: PipelineContext): Promise<{ response?: string }> {
    const channels = ctx.services.channels.getStatus();
    const sessions = ctx.services.sessions.count();
    return {
      response: [
        "**Gateway Status**",
        `Sessions: ${sessions}`,
        `Channels:`,
        ...Object.entries(channels).map(([id, ch]) => `  - ${id}: ${ch.status}`),
      ].join("\n"),
    };
  }
}

class HelpCommand implements CommandHandler {
  name = "help";
  description = "List available commands";

  async execute(args: string, ctx: PipelineContext): Promise<{ response?: string }> {
    return {
      response: [
        "**Available Commands**",
        "/reset — Reset current session",
        "/model [name] — Switch LLM model",
        "/status — Show gateway status",
        "/memory [query] — Search memories",
        "/help — Show this help",
        "/stop — Abort current agent run",
      ].join("\n"),
    };
  }
}
```

#### Stage 6: Agent Dispatch

```typescript
class AgentDispatchStage implements PipelineStage {
  name = "agent";

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    if (!ctx.session) {
      ctx.aborted = true;
      ctx.abortReason = "No session resolved";
      return ctx;
    }

    // Run agent loop
    const agent = new StreamingAgentLoop(
      ctx.services.config,
      ctx.services.agent.provider,
      ctx.services.agent.toolEngine,
    );

    // Collect streamed text
    let fullResponse = "";
    const streamedBlocks: StreamBlock[] = [];

    agent.on("stream:text", (text: string) => {
      fullResponse += text;
      streamedBlocks.push({ type: "text", data: text });
    });

    agent.on("stream:tool_start", (data: unknown) => {
      streamedBlocks.push({ type: "tool_start", data });
    });

    agent.on("stream:tool_result", (data: unknown) => {
      streamedBlocks.push({ type: "tool_result", data });
    });

    await agent.runStreaming(ctx.session, ctx.message.content);

    // Store the accumulated response for the streaming stage
    ctx.session.lastAgentResponse = fullResponse;
    ctx.session.streamBlocks = streamedBlocks;

    return ctx;
  }
}
```

#### Stage 7: Block Streaming

```typescript
class BlockStreamingStage implements PipelineStage {
  name = "streaming";

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    if (!ctx.session?.lastAgentResponse) return ctx;

    const response = ctx.session.lastAgentResponse;

    // For channels (Telegram, Discord) — send complete response
    // Streaming is handled differently per channel
    if (ctx.message.channelType !== "webchat") {
      // Split long messages if needed (Telegram has 4096 char limit)
      const chunks = this.splitMessage(response, this.getMaxLength(ctx.message.channelType));

      for (const chunk of chunks) {
        await ctx.services.channels.sendToChannel(
          ctx.message.channelId,
          ctx.message.conversationId,
          { text: chunk, format: "markdown" },
        );
      }
    }

    // For webchat — streaming was already handled via WS events in the agent stage

    ctx.responded = true;
    return ctx;
  }

  private getMaxLength(channelType: string): number {
    switch (channelType) {
      case "telegram": return 4096;
      case "discord": return 2000;
      default: return 10_000;
    }
  }

  private splitMessage(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Try to split at a paragraph or sentence boundary
      let splitAt = remaining.lastIndexOf("\n\n", maxLength);
      if (splitAt === -1) splitAt = remaining.lastIndexOf("\n", maxLength);
      if (splitAt === -1) splitAt = remaining.lastIndexOf(". ", maxLength);
      if (splitAt === -1) splitAt = maxLength;

      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
    }

    return chunks;
  }
}
```

---

## Wire Pipeline to Gateway

```typescript
// Replace direct channel→agent routing with pipeline:
const pipeline = createAutoReplyPipeline(services);

channelManager.onMessage = async (msg) => {
  const ctx: PipelineContext = {
    message: msg,
    channel: channelManager.getChannel(msg.channelId),
    services,
  };

  await pipeline.run(ctx);
};
```

---

## Testing Strategy

Key test scenarios:
- Pipeline processes messages through all 7 stages in order
- Empty messages are rejected at ingestion
- Unauthorized users are blocked at authorization
- Rapid messages are batched by debouncer
- Sessions are created/found correctly
- Slash commands are detected and executed
- Non-command messages reach the agent
- Long responses are split correctly per platform limits
- Pipeline aborts early when a stage sets `aborted = true`
- Rate limiting blocks excessive messages

---

## Checkpoint — You're Done When

- [ ] Pipeline processes a message end-to-end through all 7 stages
- [ ] `/reset`, `/status`, `/help` commands work
- [ ] Debouncer batches rapid messages correctly
- [ ] Rate limiting blocks excessive messages
- [ ] Long responses are split for Telegram's 4096 char limit
- [ ] Sessions are resolved from conversation IDs
- [ ] Agent dispatch runs the full agent loop
- [ ] Pipeline can be extended with custom stages

---

## Next Phase

→ **[Phase 7: Plugin System](phase-07-plugins.md)**
