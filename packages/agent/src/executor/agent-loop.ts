import { EventEmitter } from 'node:events';
import type { AgentConfig } from '@oclaw/config';
import type { Session } from '@oclaw/shared';
import type { ToolCallBlock } from '@oclaw/shared';
import type { LlmProvider } from '../providers/types.js';
import type { ToolDefinition } from '../providers/types.js';
import { TokenBudget } from '../tokens/budget.js';
import { ContextAssembler } from './context.js';
import { LoopController } from './controller.js';

export interface ToolResult {
  output: string;
  isError?: boolean;
}

export interface ToolEngine {
  execute(name: string, input: Record<string, unknown>, session: Session): Promise<ToolResult>;
  getDefinitions(): ToolDefinition[];
}

export interface AgentLoopOptions {
  maxIterations?: number;
  maxContextTokens?: number;
}

export type AgentLoopEvents = {
  'stream:text': [text: string];
  'stream:tool_start': [data: { id: string; name: string; input?: Record<string, unknown> }];
  'stream:tool_result': [data: { id: string; name: string; output: string; isError: boolean }];
  'stream:end': [];
  'stream:error': [err: Error];
  'context:compact': [sessionId: string];
};

export class AgentLoop extends EventEmitter<AgentLoopEvents> {
  protected provider: LlmProvider;
  protected config: AgentConfig;
  protected toolEngine: ToolEngine | null;
  protected context: ContextAssembler;
  protected controller: LoopController;
  protected tokenBudget: TokenBudget;

  constructor(
    provider: LlmProvider,
    config: AgentConfig,
    toolEngine: ToolEngine | null = null,
    opts: AgentLoopOptions = {}
  ) {
    super();
    this.provider = provider;
    this.config = config;
    this.toolEngine = toolEngine;
    this.context = new ContextAssembler();
    this.controller = new LoopController({ maxIterations: opts.maxIterations });
    this.tokenBudget = new TokenBudget(opts.maxContextTokens ?? 100_000);
  }

  async run(
    sessions: {
      get(id: string): Session;
      addMessage: unknown;
      addRichMessage(id: string, msg: unknown): unknown;
    },
    sessionId: string,
    userMessage: string
  ): Promise<void> {
    const session = (sessions as { get(id: string): Session }).get(sessionId);
    (sessions as { addMessage(id: string, role: string, content: string): unknown }).addMessage(
      sessionId,
      'user',
      userMessage
    );

    const tools = this.toolEngine?.getDefinitions();

    while (!this.controller.limitReached()) {
      this.controller.tick();

      const request = this.context.assemble(session, this.config, { tools });
      let response: Awaited<ReturnType<LlmProvider['chat']>>;

      try {
        response = await this.provider.chat(request);
      } catch (err) {
        this.emit('stream:error', err instanceof Error ? err : new Error(String(err)));
        break;
      }

      this.tokenBudget.update(response.usage);

      const toolCalls: ToolCallBlock[] = [];
      let textContent = '';

      for (const block of response.content) {
        if (block.type === 'text') {
          textContent += block.text;
          this.emit('stream:text', block.text);
        } else if (block.type === 'tool_use') {
          toolCalls.push({ id: block.id, name: block.name, input: block.input });
        }
      }

      if (toolCalls.length > 0) {
        (sessions as { addRichMessage(id: string, msg: unknown): unknown }).addRichMessage(
          sessionId,
          {
            role: 'assistant',
            content: textContent,
            toolCalls,
          }
        );

        for (const tc of toolCalls) {
          this.emit('stream:tool_start', { id: tc.id, name: tc.name, input: tc.input });

          let result: ToolResult;
          if (this.toolEngine) {
            result = await this.toolEngine.execute(tc.name, tc.input, session);
          } else {
            result = { output: `Tool "${tc.name}" not available`, isError: true };
          }
          (sessions as { addRichMessage(id: string, msg: unknown): unknown }).addRichMessage(
            sessionId,
            {
              role: 'tool',
              content: result.output,
              toolCallId: tc.id,
            }
          );

          this.emit('stream:tool_result', {
            id: tc.id,
            name: tc.name,
            output: result.output,
            isError: result.isError ?? false,
          });
        }
      } else {
        if (textContent) {
          (sessions as { addRichMessage(id: string, msg: unknown): unknown }).addRichMessage(
            sessionId,
            {
              role: 'assistant',
              content: textContent,
            }
          );
        }
      }

      if (response.stopReason === 'end_turn') {
        break;
      }
      if (response.stopReason === 'max_tokens') {
        break;
      }

      if (this.tokenBudget.nearLimit()) {
        await this.compactContext(
          sessions as {
            get(id: string): Session;
            addRichMessage(id: string, msg: unknown): unknown;
          },
          sessionId
        );
        this.emit('context:compact', sessionId);
      }
    }

    this.emit('stream:end');
  }

  protected async compactContext(
    sessions: { get(id: string): Session; addRichMessage(id: string, msg: unknown): unknown },
    sessionId: string
  ): Promise<void> {
    const session = sessions.get(sessionId);
    const keepRecent = 10;
    const older = session.messages.slice(0, -keepRecent);
    if (older.length === 0) {
      return;
    }

    try {
      const summary = await this.provider.chat({
        model: this.config.provider.model,
        system:
          'Summarize this conversation history concisely, preserving key decisions and context.',
        messages: [
          {
            role: 'user',
            content: older.map((m) => `${m.role}: ${m.content}`).join('\n'),
          },
        ],
        maxTokens: 1000,
      });

      const summaryText = summary.content.find((b) => b.type === 'text')?.text ?? '';
      session.messages = [
        {
          id: 'compact-summary',
          role: 'system',
          content: `[Previous context summary]\n${summaryText}`,
          timestamp: new Date(),
        },
        ...session.messages.slice(-keepRecent),
      ];
    } catch {
      // Compaction failed — continue without compacting
    }
  }
}

export class StreamingAgentLoop extends AgentLoop {
  async runStreaming(
    sessions: {
      get(id: string): Session;
      addMessage(id: string, role: string, content: string): unknown;
      addRichMessage(id: string, msg: unknown): unknown;
    },
    sessionId: string,
    userMessage: string
  ): Promise<void> {
    const session = sessions.get(sessionId);
    sessions.addMessage(sessionId, 'user', userMessage);

    const tools = this.toolEngine?.getDefinitions();

    while (!this.controller.limitReached()) {
      this.controller.tick();

      const request = this.context.assemble(session, this.config, { tools });

      let currentText = '';
      const currentToolCalls: Array<{ id: string; name: string; inputParts: string[] }> = [];
      let stopReason: 'end_turn' | 'tool_use' | 'max_tokens' = 'end_turn';
      let usage = { inputTokens: 0, outputTokens: 0 };

      try {
        for await (const chunk of this.provider.chatStream(request)) {
          switch (chunk.type) {
            case 'text_delta':
              currentText += chunk.data.text;
              this.emit('stream:text', chunk.data.text);
              break;

            case 'tool_use_start':
              currentToolCalls.push({
                id: chunk.data.id,
                name: chunk.data.name,
                inputParts: [],
              });
              this.emit('stream:tool_start', { id: chunk.data.id, name: chunk.data.name });
              break;

            case 'tool_input_delta': {
              const tc = currentToolCalls[chunk.data.index];
              if (tc) {
                tc.inputParts.push(chunk.data.partial);
              }
              break;
            }

            case 'message_stop':
              stopReason = chunk.data.stopReason;
              usage = chunk.data.usage;
              break;
          }
        }
      } catch (err) {
        this.emit('stream:error', err instanceof Error ? err : new Error(String(err)));
        break;
      }

      this.tokenBudget.update(usage);

      if (currentToolCalls.length > 0) {
        const toolCallBlocks: ToolCallBlock[] = currentToolCalls.map((tc) => {
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(tc.inputParts.join('')) as Record<string, unknown>;
          } catch {}
          return { id: tc.id, name: tc.name, input };
        });

        sessions.addRichMessage(sessionId, {
          role: 'assistant',
          content: currentText,
          toolCalls: toolCallBlocks,
        });

        for (const tc of toolCallBlocks) {
          let result: ToolResult;
          if (this.toolEngine) {
            result = await this.toolEngine.execute(tc.name, tc.input, session);
          } else {
            result = { output: `Tool "${tc.name}" not available`, isError: true };
          }

          sessions.addRichMessage(sessionId, {
            role: 'tool',
            content: result.output,
            toolCallId: tc.id,
          });

          this.emit('stream:tool_result', {
            id: tc.id,
            name: tc.name,
            output: result.output,
            isError: result.isError ?? false,
          });
        }
      } else {
        if (currentText) {
          sessions.addRichMessage(sessionId, { role: 'assistant', content: currentText });
        }
        if (stopReason === 'end_turn' || stopReason === 'max_tokens') {
          break;
        }
      }

      if (this.tokenBudget.nearLimit()) {
        await this.compactContext(sessions, sessionId);
        this.emit('context:compact', sessionId);
      }
    }

    this.emit('stream:end');
  }
}
