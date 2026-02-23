---
name: phase-05-channels-messaging
description: Builds the unified channel abstraction layer and Telegram, Discord, and WebChat adapters for the OpenClaw project. Use when implementing messaging channels, access control, message normalization, or platform-specific formatting after Phase 4 is complete.
---

# Phase 5: Channels & Messaging

Build the unified channel abstraction layer and implement Telegram, Discord, and WebChat adapters.

## Prerequisites

- Phase 4 completed (Memory & sessions persistent)
- Telegram Bot Token (from @BotFather) for Telegram adapter
- Discord Bot Token (from Discord Developer Portal) for Discord adapter

## Steps

Copy this checklist and mark off items as you complete them:

```
Progress:
- [ ] 1. Create packages/channels
- [ ] 2. Define Channel Interfaces
- [ ] 3. Build Channel Manager
- [ ] 4. Build Message Normalizer & Formatter
- [ ] 5. Build Access Control
- [ ] 6. Build Telegram Adapter
- [ ] 7. Build Discord Adapter
- [ ] 8. Build WebChat Adapter
- [ ] 9. Wire to Gateway
- [ ] 10. Install Dependencies
- [ ] 11. Write Tests ✅ all passing
```

### 1. Create `packages/channels`

// turbo

```bash
mkdir -p packages/channels/src/{adapters,util}
```

### 2. Define Channel Interfaces

`src/types.ts` — See [reference/channel-interfaces.md](reference/channel-interfaces.md) for complete TypeScript definitions of all channel types (`ChannelMessage`, `ChannelAdapter`, `OutboundMessage`, `ChannelConfig`, `Attachment`).

### 3. Build Channel Manager

`src/manager.ts`:

- Register/unregister channel adapters
- Start/stop channels based on config
- Access control checks (DM policy, group policy)
- Message routing: channel → pipeline/agent
- `getStatus()` — per-channel connected/disconnected/error

### 4. Build Message Normalizer & Formatter

`src/normalizer.ts` — Inbound: platform message → `ChannelMessage`
`src/formatter.ts` — Outbound: markdown → platform-specific format:

- Telegram: Markdown → HTML (`<b>`, `<i>`, `<code>`, `<pre>`)
- Discord: Markdown pass-through (native support)
- WebChat: Markdown pass-through

### 5. Build Access Control

`src/access-control.ts`:

- DM policy: `open` (anyone), `allowlist` (listed user IDs), `pairing` (explicit pairing)
- Group policy: mention-required mode, allowed groups
- Rate limiting: messages per minute per user

### 6. Build Telegram Adapter

`src/adapters/telegram.ts` using **grammY**:

- Long polling for messages
- Normalize inbound: Telegram message → `ChannelMessage`
- Format outbound: Markdown → Telegram HTML
- Split messages > 4096 chars
- Handle photo/file attachments
- Reply threading support

### 7. Build Discord Adapter

`src/adapters/discord.ts` using **discord.js**:

- Gateway events for messages
- Normalize inbound: Discord message → `ChannelMessage`
- Discord markdown pass-through
- Split messages > 2000 chars
- Message editing support

### 8. Build WebChat Adapter

`src/adapters/webchat.ts`:

- Operates over Gateway WebSocket (JSON-RPC)
- Real-time streaming (token-by-token)
- Used by CLI and Web UI

### 9. Wire to Gateway

Update Gateway boot sequence to:

1. Create `ChannelManager`
2. Register WebChat adapter (always on)
3. Register Telegram/Discord if configured
4. Route messages through auto-reply pipeline (Phase 6) or directly to agent

### 10. Install Dependencies

// turbo

```bash
pnpm --filter @oclaw/channels add grammy@^1 discord.js@^14
```

### 11. Write Tests

Key tests:

- Channel manager starts/stops adapters based on config
- Message normalization produces unified format
- Access control blocks unauthorized users
- Outbound formatting converts correctly per platform
- Long messages split at appropriate boundaries
- Multiple channels run simultaneously
- Connection errors handled with reconnection

**Feedback loop**: After implementing each adapter (Steps 6–8), send a real test message through that channel and verify the normalized `ChannelMessage` is correct before moving to the next adapter. If access control or formatting is wrong, fix it immediately — do not wire to the Gateway until the adapter's own tests pass.

---

## Checkpoint — You're Done When

- [ ] Telegram bot receives/responds via the agent
- [ ] Discord bot receives/responds via the agent
- [ ] WebChat works through the Gateway WS connection
- [ ] Access control blocks unauthorized users
- [ ] Messages normalized to unified format
- [ ] Responses formatted correctly per platform
- [ ] Multiple channels run simultaneously
- [ ] Channel status visible via `gateway.status` RPC

## Dependencies

| Package          | Purpose                    |
| ---------------- | -------------------------- |
| grammy `^1`      | Telegram Bot API framework |
| discord.js `^14` | Discord Bot API            |
