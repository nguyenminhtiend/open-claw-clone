# Phase 2: Agent Loop & LLM Integration

> Build the core agent executor with the Think → Plan → Act → Observe → Iterate cycle and integrate with LLM providers.

## Learning Goals

- LLM API integration (Anthropic, OpenAI, Ollama)
- Streaming response handling (SSE / token-by-token)
- Context window management and token counting
- The agentic loop pattern (ReAct-style)
- Provider abstraction for hot-swapping models

## Why This Matters

The agent loop is what makes OpenClaw an *agent* rather than a chatbot. Instead of just sending a prompt and returning a response, the agent can reason about what tools to use, execute them, observe results, and iterate — all autonomously. This is the brain.

---

## Architecture

```
Agent Executor
├── Context Assembler
│   ├── System prompt (from AGENTS.md + SOUL.md)
│   ├── Memory context (from MEMORY.md)
│   ├── Session history (message array)
│   └── Tool definitions (available tools schema)
├── LLM Provider
│   ├── Anthropic adapter
│   ├── OpenAI adapter
│   ├── Ollama adapter (local models)
│   └── Provider interface (shared contract)
├── Response Parser
│   ├── Text block handler
│   ├── Tool call extractor
│   └── Stream assembler
└── Loop Controller
    ├── Iteration limiter (max turns)
    ├── Token budget tracker
    └── Stop condition evaluator
```

---

## Step-by-Step Implementation

### 2.1 — LLM Provider Abstraction

The provider abstraction lets us swap between Anthropic, OpenAI, and Ollama without changing agent logic.

**Files:**

```
packages/agent/
  ├── package.json
  ├── tsconfig.json
  └── src/
      ├── index.ts
      ├── providers/
      │   ├── types.ts         # Provider interface
      │   ├── registry.ts      # Provider registry
      │   ├── anthropic.ts     # Anthropic Claude adapter
      │   ├── openai.ts        # OpenAI adapter
      │   └── ollama.ts        # Ollama local model adapter
      ├── executor/
      │   ├── agent-loop.ts    # Core agentic loop
      │   ├── context.ts       # Context assembly
      │   ├── parser.ts        # Response parsing
      │   └── controller.ts    # Loop control & limits
      ├── tokens/
      │   ├── counter.ts       # Token estimation
      │   └── budget.ts        # Token budget management
      └── streaming/
          ├── stream.ts        # Streaming response handler
          └── blocks.ts        # Content block types
```

**Provider interface:**

```typescript
interface LlmProvider {
  id: string;
  name: string;

  chat(request: ChatRequest): Promise<ChatResponse>;
  chatStream(request: ChatRequest): AsyncIterable<StreamChunk>;
  countTokens(messages: Message[]): Promise<number>;
}

interface ChatRequest {
  model: string;
  messages: ProviderMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
}

interface ChatResponse {
  id: string;
  content: ContentBlock[];
  stopReason: "end" | "tool_use" | "max_tokens";
  usage: { inputTokens: number; outputTokens: number };
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

interface StreamChunk {
  type: "text_delta" | "tool_use_start" | "tool_input_delta" | "message_stop";
  data: unknown;
}
```

**Anthropic adapter (simplified core):**

```typescript
class AnthropicProvider implements LlmProvider {
  private client: Anthropic;

  async *chatStream(request: ChatRequest): AsyncIterable<StreamChunk> {
    const stream = this.client.messages.stream({
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      messages: this.mapMessages(request.messages),
      tools: request.tools?.map(this.mapTool),
    });

    for await (const event of stream) {
      yield this.mapStreamEvent(event);
    }
  }
}
```

**Ollama adapter (for local models):**

```typescript
class OllamaProvider implements LlmProvider {
  private baseUrl: string; // default: http://localhost:11434

  async *chatStream(request: ChatRequest): AsyncIterable<StreamChunk> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      body: JSON.stringify({
        model: request.model,
        messages: this.mapMessages(request.messages),
        stream: true,
        options: { temperature: request.temperature },
      }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split("\n").filter(Boolean);
      for (const line of lines) {
        const data = JSON.parse(line);
        yield { type: "text_delta", data: { text: data.message?.content ?? "" } };
      }
    }
  }
}
```

### 2.2 — Context Assembly

The context assembler builds the full prompt sent to the LLM by combining system instructions, memory, history, and tool definitions.

```typescript
class ContextAssembler {
  async assemble(session: Session, config: AgentConfig): Promise<ChatRequest> {
    const systemParts: string[] = [];

    // 1. Load AGENTS.md (behavioral instructions)
    const agentsMd = await this.loadMarkdownFile("AGENTS.md");
    if (agentsMd) systemParts.push(agentsMd);

    // 2. Load SOUL.md (personality & values)
    const soulMd = await this.loadMarkdownFile("SOUL.md");
    if (soulMd) systemParts.push(soulMd);

    // 3. Load relevant memory (MEMORY.md + today's daily log)
    if (config.memoryEnabled) {
      const memoryContext = await this.loadMemoryContext(session);
      if (memoryContext) systemParts.push(memoryContext);
    }

    // 4. Build messages array from session history
    const messages = this.buildMessages(session.messages);

    // 5. Get available tools definitions
    const tools = await this.getToolDefinitions(session);

    return {
      model: config.provider.model,
      messages: [
        { role: "system", content: systemParts.join("\n\n---\n\n") },
        ...messages,
      ],
      tools,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
    };
  }
}
```

### 2.3 — The Agentic Loop

This is the core. The agent loop runs until it produces a final text response or hits iteration/token limits.

```typescript
class AgentLoop {
  private maxIterations = 25;
  private tokenBudget: TokenBudget;

  async run(session: Session, userMessage: string): Promise<void> {
    // Add user message to session
    session.addMessage({ role: "user", content: userMessage });

    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration++;

      // 1. THINK + PLAN: Assemble context and call LLM
      const request = await this.context.assemble(session, this.config);
      const response = await this.provider.chat(request);

      // 2. Process response content blocks
      for (const block of response.content) {
        if (block.type === "text") {
          // Final text response — emit to client
          session.addMessage({ role: "assistant", content: block.text });
          this.emit("text", block.text);
        }

        if (block.type === "tool_use") {
          // 3. ACT: Execute the tool
          session.addMessage({
            role: "assistant",
            content: `[Tool call: ${block.name}]`,
            toolCalls: [block],
          });

          const toolResult = await this.toolEngine.execute(
            block.name,
            block.input,
            session,
          );

          // 4. OBSERVE: Feed result back into context
          session.addMessage({
            role: "tool",
            content: toolResult.output,
            toolCallId: block.id,
          });
        }
      }

      // 5. Check stop conditions
      if (response.stopReason === "end") break;
      if (this.tokenBudget.exhausted()) {
        await this.compactContext(session);
      }
    }
  }
}
```

### 2.4 — Streaming Support

Stream responses token-by-token back to the WebSocket client.

```typescript
class StreamingAgentLoop extends AgentLoop {
  async runStreaming(session: Session, userMessage: string): Promise<void> {
    session.addMessage({ role: "user", content: userMessage });
    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration++;
      const request = await this.context.assemble(session, this.config);

      // Stream from LLM
      let currentText = "";
      let currentToolCalls: ToolCall[] = [];

      for await (const chunk of this.provider.chatStream(request)) {
        switch (chunk.type) {
          case "text_delta":
            currentText += chunk.data.text;
            // Stream to client in real-time
            this.emit("stream:text", chunk.data.text);
            break;

          case "tool_use_start":
            currentToolCalls.push({ id: chunk.data.id, name: chunk.data.name, input: {} });
            this.emit("stream:tool_start", chunk.data);
            break;

          case "tool_input_delta":
            // Accumulate tool input JSON
            break;

          case "message_stop":
            // Process accumulated tool calls
            for (const tc of currentToolCalls) {
              const result = await this.toolEngine.execute(tc.name, tc.input, session);
              session.addMessage({ role: "tool", content: result.output, toolCallId: tc.id });
              this.emit("stream:tool_result", { id: tc.id, output: result.output });
            }
            break;
        }
      }

      if (currentText && currentToolCalls.length === 0) break;
    }

    this.emit("stream:end");
  }
}
```

### 2.5 — Token Budget & Context Compaction

When the context grows too large, compact it by summarizing older messages.

```typescript
class TokenBudget {
  private maxContextTokens: number;
  private softThreshold: number; // e.g., maxContextTokens * 0.8
  private currentUsage = 0;

  update(usage: { inputTokens: number; outputTokens: number }) {
    this.currentUsage = usage.inputTokens;
  }

  exhausted(): boolean {
    return this.currentUsage >= this.softThreshold;
  }
}

async function compactContext(session: Session, provider: LlmProvider): Promise<void> {
  // Take older messages (keep last N)
  const keepRecent = 10;
  const olderMessages = session.messages.slice(0, -keepRecent);

  if (olderMessages.length === 0) return;

  // Ask LLM to summarize older context
  const summary = await provider.chat({
    model: "fast-model",
    messages: [
      { role: "system", content: "Summarize this conversation history concisely, preserving key decisions and context." },
      { role: "user", content: olderMessages.map(m => `${m.role}: ${m.content}`).join("\n") },
    ],
    maxTokens: 1000,
  });

  // Replace older messages with summary
  session.messages = [
    { role: "system", content: `[Previous context summary]\n${summary.content[0].text}` },
    ...session.messages.slice(-keepRecent),
  ];
}
```

---

## Wire It to the Gateway

Update the Gateway's `session.send` RPC method to trigger the agent loop:

```typescript
rpcRouter.register("session.send", async (params, ctx) => {
  const { sessionId, message } = params;
  const session = ctx.sessions.get(sessionId);

  // Run agent loop (streaming)
  const agent = new StreamingAgentLoop(config, provider, toolEngine);

  agent.on("stream:text", (text) => {
    ctx.conn.send(jsonRpcNotify("session.stream", { sessionId, type: "text", data: text }));
  });

  agent.on("stream:tool_start", (data) => {
    ctx.conn.send(jsonRpcNotify("session.stream", { sessionId, type: "tool_start", data }));
  });

  agent.on("stream:end", () => {
    ctx.conn.send(jsonRpcNotify("session.stream", { sessionId, type: "end" }));
  });

  await agent.runStreaming(session, message);

  return { ok: true };
});
```

---

## Testing Strategy

```
packages/agent/test/
  ├── providers/
  │   ├── anthropic.test.ts     # API integration (can mock)
  │   ├── openai.test.ts
  │   └── ollama.test.ts
  ├── executor/
  │   ├── agent-loop.test.ts    # Loop logic with mocked provider
  │   ├── context.test.ts       # Context assembly
  │   └── controller.test.ts    # Iteration limits, stop conditions
  ├── tokens/
  │   └── budget.test.ts        # Token tracking
  └── integration/
      └── agent-gateway.test.ts # Full flow: WS → session → agent → stream
```

Key test scenarios:
- Provider returns text → loop ends, text emitted
- Provider returns tool_use → tool executed, result fed back, loop continues
- Max iterations reached → loop stops with error
- Token budget exceeded → context compaction triggered
- Streaming chunks arrive in correct order
- Multiple providers can be swapped at runtime

---

## Checkpoint — You're Done When

- [ ] Can send a message via WS and get a streamed LLM response
- [ ] Agent correctly makes tool calls when the LLM requests them (using a simple echo tool)
- [ ] Anthropic, OpenAI, and Ollama providers all work
- [ ] Token counting tracks usage correctly
- [ ] Context compaction fires when budget is exceeded
- [ ] Streaming events arrive at the WS client in real-time
- [ ] Provider can be changed via config without restart

---

## Dependencies (additional)

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.x",
    "openai": "^4.x",
    "tiktoken": "^1.x"
  }
}
```

---

## Next Phase

→ **[Phase 3: Tools Engine](phase-03-tools-engine.md)**
