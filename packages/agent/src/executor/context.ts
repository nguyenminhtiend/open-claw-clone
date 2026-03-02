import type { AgentConfig } from '@oclaw/config';
import type { Message, Session } from '@oclaw/shared';
import type {
  ChatRequest,
  ProviderMessage,
  ToolDefinition,
  UserContentBlock,
} from '../providers/types.js';

export interface ContextOptions {
  tools?: ToolDefinition[];
  extraSystemParts?: string[];
}

export class ContextAssembler {
  assemble(session: Session, config: AgentConfig, opts: ContextOptions = {}): ChatRequest {
    const systemParts: string[] = [];

    if (config.systemPrompt) {
      systemParts.push(config.systemPrompt);
    }

    if (opts.extraSystemParts) {
      systemParts.push(...opts.extraSystemParts);
    }

    return {
      model: config.provider.model,
      system: systemParts.length > 0 ? systemParts.join('\n\n---\n\n') : undefined,
      messages: this.buildMessages(session.messages),
      tools: opts.tools && opts.tools.length > 0 ? opts.tools : undefined,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
    };
  }

  private buildMessages(messages: Message[]): ProviderMessage[] {
    const result: ProviderMessage[] = [];

    let i = 0;
    while (i < messages.length) {
      const msg = messages[i];

      if (msg.role === 'system') {
        i++;
        continue;
      }

      if (msg.role === 'assistant') {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          // Assistant message with tool calls — emit full content block array
          const content = [];
          if (msg.content) {
            content.push({ type: 'text' as const, text: msg.content });
          }
          for (const tc of msg.toolCalls) {
            content.push({ type: 'tool_use' as const, id: tc.id, name: tc.name, input: tc.input });
          }
          result.push({ role: 'assistant', content });

          // Collect immediately-following tool result messages for these calls
          const toolResultIds = new Set(msg.toolCalls.map((tc) => tc.id));
          const toolResults: UserContentBlock[] = [];

          let j = i + 1;
          while (j < messages.length && messages[j].role === 'tool') {
            const resultMsg = messages[j];
            if (resultMsg.toolCallId && toolResultIds.has(resultMsg.toolCallId)) {
              toolResults.push({
                type: 'tool_result',
                toolUseId: resultMsg.toolCallId,
                content: resultMsg.content,
              });
            }
            j++;
          }

          if (toolResults.length > 0) {
            result.push({ role: 'user', content: toolResults });
          }

          i = j;
          continue;
        }

        // Plain assistant text
        result.push({ role: 'assistant', content: msg.content });
        i++;
        continue;
      }

      if (msg.role === 'tool') {
        // Standalone tool result not already consumed above — skip
        i++;
        continue;
      }

      // user message
      result.push({ role: 'user', content: msg.content });
      i++;
    }

    return result;
  }
}
