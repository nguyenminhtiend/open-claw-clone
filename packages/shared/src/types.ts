export interface JsonRpcRequest {
	jsonrpc: '2.0'
	id: string | number
	method: string
	params?: Record<string, unknown>
}

export interface JsonRpcResponse {
	jsonrpc: '2.0'
	id: string | number
	result?: unknown
	error?: { code: number; message: string; data?: unknown }
}

export interface JsonRpcNotification {
	jsonrpc: '2.0'
	method: string
	params?: Record<string, unknown>
}

export interface Session {
	id: string
	createdAt: Date
	lastActiveAt: Date
	channelId: string
	agentId: string
	messages: Message[]
	metadata: Record<string, unknown>
}

export interface Message {
	id: string
	role: 'user' | 'assistant' | 'system' | 'tool'
	content: string
	timestamp: Date
	channelMeta?: Record<string, unknown>
}

export interface Connection {
	id: string
	role: 'cli' | 'channel' | 'web' | 'node'
	authenticatedAt?: Date
	capabilities: string[]
	metadata: Record<string, unknown>
}
