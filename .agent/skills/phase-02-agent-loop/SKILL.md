---
name: phase-02-agent-loop
description: Builds the core agentic executor (Think→Plan→Act→Observe loop) and LLM provider abstractions for Anthropic, OpenAI, and Ollama. Use when implementing the agent loop, integrating LLM providers, or wiring streaming responses to the gateway after Phase 1 is complete.
---

# Phase 2: Agent Loop & LLM Integration

Build the core agent executor with the Think → Plan → Act → Observe → Iterate cycle and integrate with LLM providers (Anthropic, OpenAI, Ollama).

## Prerequisites

- Phase 1 completed (Gateway running, sessions working)
- At least one LLM provider available (Ollama recommended for free local testing)

## Steps

Copy this checklist and mark off items as you complete them:

```
Progress:
- [ ] 1. Create packages/agent
- [ ] 2. Build LLM Provider Abstraction
- [ ] 3. Build Context Assembler
- [ ] 4. Build the Agentic Loop
- [ ] 5. Build Streaming Support
- [ ] 6. Build Token Budget & Compaction
- [ ] 7. Wire to Gateway
- [ ] 8. Install Dependencies
- [ ] 9. Write Tests ✅ all passing
```

### 1. Create `packages/agent`

// turbo

```bash
mkdir -p packages/agent/src/{providers,executor,tokens,streaming}
```

### 2. Build LLM Provider Abstraction

Define the `LlmProvider` interface in `src/providers/types.ts`:

```typescript
interface LlmProvider {
  id: string;
  name: string;
  chat(request: ChatRequest): Promise<ChatResponse>;
  chatStream(request: ChatRequest): AsyncIterable<StreamChunk>;
  countTokens(messages: Message[]): Promise<number>;
}
```

Key types: `ChatRequest`, `ChatResponse`, `ContentBlock` (text | tool_use), `StreamChunk`.

Implement adapters:

- `src/providers/anthropic.ts` — Uses `@anthropic-ai/sdk`
- `src/providers/openai.ts` — Uses `openai` SDK
- `src/providers/ollama.ts` — Uses native `fetch` to `localhost:11434`
- `src/providers/registry.ts` — Provider registry for runtime switching

### 3. Build Context Assembler

`src/executor/context.ts` — Assembles the full LLM prompt from:

1. System prompt (AGENTS.md + SOUL.md)
2. Memory context (MEMORY.md, daily logs)
3. Session history (message array)
4. Tool definitions (JSON Schema from tool registry)

### 4. Build the Agentic Loop

`src/executor/agent-loop.ts` — Core loop:

```
while (iteration < maxIterations):
  1. Assemble context → ChatRequest
  2. Call LLM provider
  3. Process response blocks:
     - text block → emit to client, break if stop_reason=end
     - tool_use block → execute tool, feed result back
  4. Check stop conditions (max iterations, token budget)
```

### 5. Build Streaming Support

`src/streaming/stream.ts` — Stream responses token-by-token via WS notifications:

- `session.stream` event with types: `text`, `tool_start`, `tool_result`, `end`

### 6. Build Token Budget & Compaction

`src/tokens/counter.ts` — Token estimation (use tiktoken for OpenAI, approximate for others)
`src/tokens/budget.ts` — Track usage, trigger compaction at 80% of max context

### 7. Wire to Gateway

Update `session.send` RPC to trigger the agent loop:

- Create `StreamingAgentLoop` instance
- Forward stream events as JSON-RPC notifications to WS client
- Return `{ ok: true }` when agent loop completes

### 8. Install Dependencies

// turbo

```bash
pnpm --filter @oclaw/agent add @anthropic-ai/sdk openai tiktoken
```

### 9. Write Tests

// turbo

```bash
pnpm --filter @oclaw/agent test
```

Key tests:

- Provider returns text → loop ends, text emitted
- Provider returns tool_use → tool executed, result fed back
- Max iterations reached → loop stops
- Token budget exceeded → compaction triggered
- Streaming chunks arrive in correct order
- Multiple providers can be swapped at runtime

**Feedback loop**: Run tests after each provider implementation. If a test fails, fix it before implementing the next provider. Only proceed to Step 7 (Wire to Gateway) when all tests pass.

---

## Checkpoint — You're Done When

- [ ] Can send a message via WS and get a streamed LLM response
- [ ] Agent correctly makes tool calls when the LLM requests them
- [ ] Anthropic, OpenAI, and Ollama providers all work
- [ ] Token counting tracks usage correctly
- [ ] Context compaction fires when budget is exceeded
- [ ] Streaming events arrive at the WS client in real-time
- [ ] Provider can be changed via config without restart

## Dependencies

| Package           | Purpose              |
| ----------------- | -------------------- |
| @anthropic-ai/sdk | Anthropic Claude API |
| openai `^4`       | OpenAI API           |
| tiktoken `^1`     | Token counting       |
