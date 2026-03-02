import type { Session } from '@oclaw/shared'
import type { ToolEngine, ToolResult } from '../executor/agent-loop.js'
import type { ToolDefinition } from '../providers/types.js'

export class EchoToolEngine implements ToolEngine {
	async execute(
		name: string,
		input: Record<string, unknown>,
		_session: Session,
	): Promise<ToolResult> {
		if (name === 'echo') {
			return { output: String(input.message ?? JSON.stringify(input)) }
		}
		return { output: `Unknown tool: ${name}`, isError: true }
	}

	getDefinitions(): ToolDefinition[] {
		return [
			{
				name: 'echo',
				description: 'Echoes back the provided message. Useful for testing tool calling.',
				inputSchema: {
					type: 'object',
					properties: {
						message: { type: 'string', description: 'The message to echo back' },
					},
					required: ['message'],
				},
			},
		]
	}
}
