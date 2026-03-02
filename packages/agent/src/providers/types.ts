export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  toolUseId: string;
  content: string;
}

export type AssistantContentBlock = TextBlock | ToolUseBlock;
export type UserContentBlock = TextBlock | ToolResultBlock;

export type ProviderMessage =
  | { role: 'user'; content: string | UserContentBlock[] }
  | { role: 'assistant'; content: string | AssistantContentBlock[] }
  | { role: 'system'; content: string };

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ChatRequest {
  model: string;
  system?: string;
  messages: ProviderMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
}

export interface ChatResponse {
  id: string;
  content: AssistantContentBlock[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens';
  usage: { inputTokens: number; outputTokens: number };
}

export type StreamChunk =
  | { type: 'text_delta'; data: { text: string } }
  | { type: 'tool_use_start'; data: { id: string; name: string } }
  | { type: 'tool_input_delta'; data: { index: number; partial: string } }
  | {
      type: 'message_stop';
      data: { stopReason: ChatResponse['stopReason']; usage: ChatResponse['usage'] };
    };

export interface LlmProvider {
  readonly id: string;
  readonly name: string;
  chat(request: ChatRequest): Promise<ChatResponse>;
  chatStream(request: ChatRequest): AsyncIterable<StreamChunk>;
  countTokens(request: Pick<ChatRequest, 'messages' | 'system' | 'tools'>): Promise<number>;
}
