import OpenAI from 'openai';
import type {
  AssistantContentBlock,
  ChatRequest,
  ChatResponse,
  LlmProvider,
  StreamChunk,
  ToolDefinition,
} from './types.js';

export class OpenAIProvider implements LlmProvider {
  readonly id = 'openai';
  readonly name = 'OpenAI';

  private client: OpenAI;

  constructor(apiKey?: string, baseUrl?: string) {
    this.client = new OpenAI({
      apiKey: apiKey ?? process.env.OPENAI_API_KEY,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await this.client.chat.completions.create({
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      messages: this.mapMessages(request),
      tools: request.tools?.map(this.mapTool),
      temperature: request.temperature,
      stop: request.stopSequences,
    });

    const choice = response.choices[0];
    const content = this.extractContent(choice.message);

    return {
      id: response.id,
      content,
      stopReason: this.mapStopReason(choice.finish_reason),
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  async *chatStream(request: ChatRequest): AsyncIterable<StreamChunk> {
    const stream = await this.client.chat.completions.create({
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      messages: this.mapMessages(request),
      tools: request.tools?.map(this.mapTool),
      temperature: request.temperature,
      stream: true,
      stream_options: { include_usage: true },
    });

    const toolCallAccumulators = new Map<number, { id: string; name: string; args: string }>();
    let inputTokens = 0;
    let outputTokens = 0;
    let lastFinishReason: string | null = null;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? 0;
        outputTokens = chunk.usage.completion_tokens ?? 0;
      }

      if (chunk.choices[0]?.finish_reason) {
        lastFinishReason = chunk.choices[0].finish_reason;
      }

      if (!delta) {
        continue;
      }

      if (delta.content) {
        yield { type: 'text_delta', data: { text: delta.content } };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!toolCallAccumulators.has(tc.index)) {
            toolCallAccumulators.set(tc.index, {
              id: tc.id ?? '',
              name: tc.function?.name ?? '',
              args: '',
            });
            if (tc.id && tc.function?.name) {
              yield { type: 'tool_use_start', data: { id: tc.id, name: tc.function.name } };
            }
          }
          const acc = toolCallAccumulators.get(tc.index);
          if (acc && tc.function?.arguments) {
            acc.args += tc.function.arguments;
            yield {
              type: 'tool_input_delta',
              data: { index: tc.index, partial: tc.function.arguments },
            };
          }
        }
      }
    }

    yield {
      type: 'message_stop',
      data: {
        stopReason: this.mapStopReason(lastFinishReason),
        usage: { inputTokens, outputTokens },
      },
    };
  }

  async countTokens(request: Pick<ChatRequest, 'messages' | 'system' | 'tools'>): Promise<number> {
    // OpenAI doesn't have a separate token counting endpoint; estimate via tiktoken
    const text = request.messages
      .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
      .join('\n');
    return Math.ceil(text.length / 4);
  }

  private mapMessages(request: ChatRequest): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = [];

    if (request.system) {
      result.push({ role: 'system', content: request.system });
    }

    for (const msg of request.messages) {
      if (msg.role === 'system') {
        result.push({
          role: 'system',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        });
        continue;
      }

      if (msg.role === 'user') {
        if (typeof msg.content === 'string') {
          result.push({ role: 'user', content: msg.content });
        } else {
          // Extract tool results as separate tool messages
          for (const block of msg.content) {
            if (block.type === 'tool_result') {
              result.push({
                role: 'tool',
                tool_call_id: block.toolUseId,
                content: block.content,
              });
            }
          }
          // Any text blocks go as a user message
          const textBlocks = msg.content.filter((b) => b.type === 'text');
          if (textBlocks.length > 0) {
            result.push({
              role: 'user',
              content: textBlocks.map((b) => (b.type === 'text' ? b.text : '')).join('\n'),
            });
          }
        }
        continue;
      }

      if (msg.role === 'assistant') {
        if (typeof msg.content === 'string') {
          result.push({ role: 'assistant', content: msg.content });
        } else {
          const textContent = msg.content
            .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
            .map((b) => b.text)
            .join('');

          const toolCalls = msg.content
            .filter(
              (
                b
              ): b is {
                type: 'tool_use';
                id: string;
                name: string;
                input: Record<string, unknown>;
              } => b.type === 'tool_use'
            )
            .map((b) => ({
              id: b.id,
              type: 'function' as const,
              function: { name: b.name, arguments: JSON.stringify(b.input) },
            }));

          result.push({
            role: 'assistant',
            content: textContent || null,
            ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
          });
        }
      }
    }

    return result;
  }

  private mapTool(tool: ToolDefinition): OpenAI.ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    };
  }

  private extractContent(message: OpenAI.ChatCompletionMessage): AssistantContentBlock[] {
    const content: AssistantContentBlock[] = [];

    if (message.content) {
      content.push({ type: 'text', text: message.content });
    }

    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        } catch {}
        content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
      }
    }

    return content;
  }

  private mapStopReason(reason: string | null | undefined): ChatResponse['stopReason'] {
    if (reason === 'tool_calls') {
      return 'tool_use';
    }
    if (reason === 'length') {
      return 'max_tokens';
    }
    return 'end_turn';
  }
}
