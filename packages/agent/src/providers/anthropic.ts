import Anthropic from '@anthropic-ai/sdk'
import type {
	AssistantContentBlock,
	ChatRequest,
	ChatResponse,
	LlmProvider,
	ProviderMessage,
	StreamChunk,
	ToolDefinition,
} from './types.js'

export class AnthropicProvider implements LlmProvider {
	readonly id = 'anthropic'
	readonly name = 'Anthropic'

	private client: Anthropic

	constructor(apiKey?: string, baseUrl?: string) {
		this.client = new Anthropic({
			apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
			...(baseUrl ? { baseURL: baseUrl } : {}),
		})
	}

	async chat(request: ChatRequest): Promise<ChatResponse> {
		const response = await this.client.messages.create({
			model: request.model,
			max_tokens: request.maxTokens ?? 4096,
			system: request.system,
			messages: this.mapMessages(request.messages),
			tools: request.tools?.map(this.mapTool),
			temperature: request.temperature,
			stop_sequences: request.stopSequences,
		})

		return {
			id: response.id,
			content: response.content.flatMap((b) => {
				const mapped = this.mapContentBlock(b)
				return mapped ? [mapped] : []
			}),
			stopReason: this.mapStopReason(response.stop_reason),
			usage: {
				inputTokens: response.usage.input_tokens,
				outputTokens: response.usage.output_tokens,
			},
		}
	}

	async *chatStream(request: ChatRequest): AsyncIterable<StreamChunk> {
		const stream = this.client.messages.stream({
			model: request.model,
			max_tokens: request.maxTokens ?? 4096,
			system: request.system,
			messages: this.mapMessages(request.messages),
			tools: request.tools?.map(this.mapTool),
			temperature: request.temperature,
		})

		for await (const event of stream) {
			switch (event.type) {
				case 'content_block_delta':
					if (event.delta.type === 'text_delta') {
						yield { type: 'text_delta', data: { text: event.delta.text } }
					} else if (event.delta.type === 'input_json_delta') {
						yield {
							type: 'tool_input_delta',
							data: { index: event.index, partial: event.delta.partial_json },
						}
					}
					break
				case 'content_block_start':
					if (event.content_block.type === 'tool_use') {
						yield {
							type: 'tool_use_start',
							data: { id: event.content_block.id, name: event.content_block.name },
						}
					}
					break
				case 'message_stop': {
					const msg = await stream.finalMessage()
					yield {
						type: 'message_stop',
						data: {
							stopReason: this.mapStopReason(msg.stop_reason),
							usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
						},
					}
					break
				}
			}
		}
	}

	async countTokens(request: Pick<ChatRequest, 'messages' | 'system' | 'tools'>): Promise<number> {
		const response = await this.client.messages.countTokens({
			model: 'claude-3-5-haiku-20241022',
			system: request.system,
			messages: this.mapMessages(request.messages),
			tools: request.tools?.map(this.mapTool),
		})
		return response.input_tokens
	}

	private mapMessages(messages: ProviderMessage[]): Anthropic.MessageParam[] {
		const result: Anthropic.MessageParam[] = []

		for (const msg of messages) {
			if (msg.role === 'system') continue

			if (msg.role === 'user') {
				if (typeof msg.content === 'string') {
					result.push({ role: 'user', content: msg.content })
				} else {
					result.push({
						role: 'user',
						content: msg.content.map((block) => {
							if (block.type === 'text') {
								return { type: 'text' as const, text: block.text }
							}
							return {
								type: 'tool_result' as const,
								tool_use_id: block.toolUseId,
								content: block.content,
							}
						}),
					})
				}
			} else if (msg.role === 'assistant') {
				if (typeof msg.content === 'string') {
					result.push({ role: 'assistant', content: msg.content })
				} else {
					result.push({
						role: 'assistant',
						content: msg.content.map((block) => {
							if (block.type === 'text') {
								return { type: 'text' as const, text: block.text }
							}
							return {
								type: 'tool_use' as const,
								id: block.id,
								name: block.name,
								input: block.input,
							}
						}),
					})
				}
			}
		}

		return result
	}

	private mapTool(tool: ToolDefinition): Anthropic.Tool {
		return {
			name: tool.name,
			description: tool.description,
			input_schema: tool.inputSchema as Anthropic.Tool['input_schema'],
		}
	}

	private mapContentBlock(block: Anthropic.ContentBlock): AssistantContentBlock | null {
		if (block.type === 'text') {
			return { type: 'text', text: block.text }
		}
		if (block.type === 'tool_use') {
			return {
				type: 'tool_use',
				id: block.id,
				name: block.name,
				input: block.input as Record<string, unknown>,
			}
		}
		return null
	}

	private mapStopReason(reason: string | null | undefined): ChatResponse['stopReason'] {
		if (reason === 'tool_use') return 'tool_use'
		if (reason === 'max_tokens') return 'max_tokens'
		return 'end_turn'
	}
}
