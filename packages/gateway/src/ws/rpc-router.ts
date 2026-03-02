import type { JsonRpcRequest, JsonRpcResponse } from '@oclaw/shared'
import { RpcError, RpcErrorCode } from '@oclaw/shared'
import type { WsConnection } from './connection.js'
import type { SessionManager } from '../sessions/manager.js'
import type { Config } from '@oclaw/config'

export interface RpcContext {
	conn: WsConnection
	sessions: SessionManager
	config: Config
}

export type RpcHandler = (
	params: Record<string, unknown> | undefined,
	ctx: RpcContext,
) => Promise<unknown> | unknown

export class RpcRouter {
	private methods = new Map<string, RpcHandler>()

	register(method: string, handler: RpcHandler): void {
		this.methods.set(method, handler)
	}

	async dispatch(
		conn: WsConnection,
		request: JsonRpcRequest,
		sessions: SessionManager,
		config: Config,
	): Promise<JsonRpcResponse> {
		const handler = this.methods.get(request.method)
		if (!handler) {
			return {
				jsonrpc: '2.0',
				id: request.id,
				error: { code: RpcErrorCode.MethodNotFound, message: 'Method not found' },
			}
		}
		try {
			const result = await handler(request.params, { conn, sessions, config })
			return { jsonrpc: '2.0', id: request.id, result }
		} catch (err) {
			if (err instanceof RpcError) {
				return { jsonrpc: '2.0', id: request.id, error: err.toJSON() }
			}
			const msg = err instanceof Error ? err.message : 'Internal error'
			return {
				jsonrpc: '2.0',
				id: request.id,
				error: { code: RpcErrorCode.InternalError, message: msg },
			}
		}
	}

	has(method: string): boolean {
		return this.methods.has(method)
	}

	methods_(): string[] {
		return Array.from(this.methods.keys())
	}
}
