import type { Server } from 'node:http'
import { WebSocketServer } from 'ws'
import type WebSocket from 'ws'
import { type Logger, RpcErrorCode, isJsonRpcRequest } from '@oclaw/shared'
import type { Config } from '@oclaw/config'
import { UnauthorizedError } from '@oclaw/shared'
import type { ConnectionManager, } from './connection.js'
import type { RpcRouter } from './rpc-router.js'
import type { SessionManager } from '../sessions/manager.js'

export interface WsServerOptions {
	server: Server
	connections: ConnectionManager
	router: RpcRouter
	sessions: SessionManager
	logger: Logger
	getConfig: () => Config
}

export function createWsServer(opts: WsServerOptions): WebSocketServer {
	const { server, connections, router, sessions, logger, getConfig } = opts

	const wss = new WebSocketServer({ server })

	wss.on('connection', (socket: WebSocket) => {
		const conn = connections.add(socket)
		logger.info({ connId: conn.id, role: conn.role }, 'WS connected')

		socket.on('message', async (raw) => {
			let parsed: unknown
			try {
				parsed = JSON.parse(raw.toString())
			} catch {
				socket.send(
					JSON.stringify({
						jsonrpc: '2.0',
						id: null,
						error: { code: RpcErrorCode.ParseError, message: 'Parse error' },
					}),
				)
				return
			}

			if (!isJsonRpcRequest(parsed)) {
				socket.send(
					JSON.stringify({
						jsonrpc: '2.0',
						id: null,
						error: { code: RpcErrorCode.InvalidRequest, message: 'Invalid Request' },
					}),
				)
				return
			}

			const request = parsed as {
				jsonrpc: string
				id: string | number
				method: string
				params?: Record<string, unknown>
			}

			const config = getConfig()

			if (config.gateway.auth.enabled && !connections.isAuthenticated(conn.id)) {
				if (request.method !== 'auth.login') {
					const err = new UnauthorizedError()
					socket.send(
						JSON.stringify({ jsonrpc: '2.0', id: request.id, error: err.toJSON() }),
					)
					return
				}
			}

			const response = await router.dispatch(
				conn,
				{ jsonrpc: '2.0', id: request.id, method: request.method, params: request.params },
				sessions,
				config,
			)

			socket.send(JSON.stringify(response))
		})

		socket.on('close', () => {
			logger.info({ connId: conn.id }, 'WS disconnected')
			connections.remove(conn.id)
		})

		socket.on('error', (err) => {
			logger.error({ connId: conn.id, err }, 'WS error')
		})
	})

	return wss
}
