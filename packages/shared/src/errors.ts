export const RpcErrorCode = {
	ParseError: -32700,
	InvalidRequest: -32600,
	MethodNotFound: -32601,
	InvalidParams: -32602,
	InternalError: -32603,
	Unauthorized: -32001,
	SessionNotFound: -32002,
	ConfigError: -32003,
} as const

export type RpcErrorCode = (typeof RpcErrorCode)[keyof typeof RpcErrorCode]

export class RpcError extends Error {
	constructor(
		public readonly code: RpcErrorCode,
		message: string,
		public readonly data?: unknown,
	) {
		super(message)
		this.name = 'RpcError'
	}

	toJSON() {
		return { code: this.code, message: this.message, data: this.data }
	}
}

export class SessionNotFoundError extends RpcError {
	constructor(sessionId: string) {
		super(RpcErrorCode.SessionNotFound, `Session not found: ${sessionId}`)
		this.name = 'SessionNotFoundError'
	}
}

export class UnauthorizedError extends RpcError {
	constructor(message = 'Unauthorized') {
		super(RpcErrorCode.Unauthorized, message)
		this.name = 'UnauthorizedError'
	}
}

export class ConfigError extends Error {
	constructor(
		message: string,
		public readonly cause?: unknown,
	) {
		super(message)
		this.name = 'ConfigError'
	}
}
