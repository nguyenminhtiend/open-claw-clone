import type { ChatRequest, ChatResponse, LlmProvider, StreamChunk } from './types.js';

interface OllamaMessage {
  role: string;
  content: string;
}

interface OllamaStreamEvent {
  model: string;
  done: boolean;
  message?: { role: string; content: string };
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaProvider implements LlmProvider {
  readonly id = 'ollama';
  readonly name = 'Ollama';

  private baseUrl: string;

  constructor(baseUrl = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        messages: this.mapMessages(request),
        stream: false,
        options: {
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
          ...(request.maxTokens !== undefined ? { num_predict: request.maxTokens } : {}),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as OllamaStreamEvent;
    const text = data.message?.content ?? '';

    return {
      id: `ollama-${Date.now()}`,
      content: [{ type: 'text', text }],
      stopReason: 'end_turn',
      usage: {
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
      },
    };
  }

  async *chatStream(request: ChatRequest): AsyncIterable<StreamChunk> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        messages: this.mapMessages(request),
        stream: true,
        options: {
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
          ...(request.maxTokens !== undefined ? { num_predict: request.maxTokens } : {}),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      yield {
        type: 'message_stop',
        data: { stopReason: 'end_turn' as const, usage: { inputTokens: 0, outputTokens: 0 } },
      };
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let inputTokens = 0;
    let outputTokens = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const lines = decoder.decode(value, { stream: true }).split('\n').filter(Boolean);
      for (const line of lines) {
        let event: OllamaStreamEvent;
        try {
          event = JSON.parse(line) as OllamaStreamEvent;
        } catch {
          continue;
        }

        if (event.message?.content) {
          yield { type: 'text_delta', data: { text: event.message.content } };
        }

        if (event.done) {
          inputTokens = event.prompt_eval_count ?? 0;
          outputTokens = event.eval_count ?? 0;
        }
      }
    }

    yield {
      type: 'message_stop',
      data: {
        stopReason: 'end_turn',
        usage: { inputTokens, outputTokens },
      },
    };
  }

  async countTokens(request: Pick<ChatRequest, 'messages' | 'system'>): Promise<number> {
    const text = [
      request.system ?? '',
      ...request.messages.map((m) =>
        typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      ),
    ].join('\n');
    return Math.ceil(text.length / 4);
  }

  private mapMessages(request: ChatRequest): OllamaMessage[] {
    const result: OllamaMessage[] = [];

    if (request.system) {
      result.push({ role: 'system', content: request.system });
    }

    for (const msg of request.messages) {
      result.push({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      });
    }

    return result;
  }
}

export function isOllamaRunning(baseUrl = 'http://localhost:11434'): Promise<boolean> {
  return fetch(`${baseUrl}/api/tags`)
    .then((r) => r.ok)
    .catch(() => false);
}
