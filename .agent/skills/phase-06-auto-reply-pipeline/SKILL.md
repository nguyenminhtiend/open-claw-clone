---
name: phase-06-auto-reply-pipeline
description: Builds the 7-stage message processing pipeline (ingestion → authorization → debouncing → session resolution → command detection → agent dispatch → block streaming). Use when implementing end-to-end message routing, slash commands, debouncing, or the pipeline runner after Phase 5 is complete.
---

# Phase 6: Auto-Reply Pipeline

Build the 7-stage message processing pipeline that routes messages from ingestion through authorization, debouncing, session resolution, command detection, agent dispatch, and block streaming.

## Prerequisites

- Phase 5 completed (Channels working)
- All services available: sessions, channels, agent, memory

## Steps

Copy this checklist and mark off items as you complete them:

```
Progress:
- [ ] 1. Create packages/pipeline
- [ ] 2. Define Pipeline Types
- [ ] 3. Build Pipeline Runner
- [ ] 4. Implement 7 Stages
- [ ] 5. Build Debouncer
- [ ] 6. Build Slash Commands
- [ ] 7. Build Message Splitting
- [ ] 8. Wire Pipeline to Gateway
- [ ] 9. Write Tests ✅ all passing
```

### 1. Create `packages/pipeline`

See [creating-package](../creating-package/SKILL.md) for the standard package scaffold.

```bash
# turbo
mkdir -p packages/pipeline/src/{stages,commands}
```

### 2. Define Pipeline Types

`src/types.ts`:

- `PipelineContext` — message, channel, session, services, control flags (aborted, responded)
- `PipelineStage` — name + `execute(ctx) → ctx`

### 3. Build Pipeline Runner

`src/pipeline.ts`:

- Accepts ordered list of stages
- Runs each stage sequentially, passing context through
- Aborts early if `ctx.aborted = true` or `ctx.responded = true`
- Logs stage timing and errors

### 4. Implement 7 Stages

| Stage                 | File                      | Purpose                                                       |
| --------------------- | ------------------------- | ------------------------------------------------------------- |
| 1. Ingestion          | `stages/ingestion.ts`     | Reject empty messages, normalize whitespace, ensure timestamp |
| 2. Authorization      | `stages/authorization.ts` | Check DM/group policy, enforce rate limits                    |
| 3. Debouncing         | `stages/debouncing.ts`    | Batch rapid messages within 300ms window                      |
| 4. Session Resolution | `stages/session.ts`       | Find or create session for the conversation                   |
| 5. Command Detection  | `stages/commands.ts`      | Detect `/slash` commands, route to handler                    |
| 6. Agent Dispatch     | `stages/agent.ts`         | Run the full agent loop for natural language messages         |
| 7. Block Streaming    | `stages/streaming.ts`     | Send response back to source channel, split long messages     |

### 5. Build Debouncer

`src/debouncer.ts`:

- Key: `channelId:conversationId`
- Batch messages within configurable window (default 300ms)
- Combine batched messages with newline separator

### 6. Build Slash Commands

Register built-in commands:

| Command                     | File                 | Description                                    |
| --------------------------- | -------------------- | ---------------------------------------------- |
| `/help`                     | `commands/help.ts`   | List available commands                        |
| `/reset` (`/new`, `/clear`) | `commands/reset.ts`  | Reset current session                          |
| `/status`                   | `commands/status.ts` | Show gateway info (uptime, channels, sessions) |
| `/model [name]`             | `commands/model.ts`  | Switch LLM model                               |
| `/memory [query]`           | `commands/memory.ts` | Search memories semantically                   |
| `/stop`                     | `commands/stop.ts`   | Abort current agent run                        |

### 7. Build Message Splitting

In Block Streaming stage:

- Telegram: split at 4096 chars
- Discord: split at 2000 chars
- Split at paragraph/sentence boundaries when possible

### 8. Wire Pipeline to Gateway

Replace direct channel → agent routing with pipeline:

```typescript
const pipeline = createAutoReplyPipeline(services);
channelManager.onMessage = (msg) => pipeline.run({ message: msg, services });
```

### 9. Write Tests

Key tests:

- Pipeline processes all 7 stages in order
- Empty messages rejected at ingestion
- Unauthorized users blocked at authorization
- Rapid messages batched by debouncer
- Sessions created/found correctly
- Slash commands detected and executed
- Non-command messages reach the agent
- Long responses split correctly per platform
- Pipeline aborts early on `aborted = true`

**Feedback loop**: After implementing each stage (Step 4), write and run the test for that stage before implementing the next one. If a stage test fails, fix it before moving on — an incorrect earlier stage will corrupt all downstream stages. Only wire to the Gateway (Step 8) after all 7 stage tests pass.

```bash
# turbo
pnpm --filter @oclaw/pipeline test
```

---

## Checkpoint — You're Done When

- [ ] Pipeline processes a message end-to-end through all 7 stages
- [ ] `/reset`, `/status`, `/help` commands work
- [ ] Debouncer batches rapid messages correctly
- [ ] Rate limiting blocks excessive messages
- [ ] Long responses split for platform limits
- [ ] Sessions resolved from conversation IDs
- [ ] Agent dispatch runs full agent loop
- [ ] Pipeline extensible with custom stages

## Dependencies

No new external packages — pipeline uses services from prior phases (`@oclaw/agent`, `@oclaw/channels`, `@oclaw/memory`).
