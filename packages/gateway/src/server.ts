import type { FSWatcher } from 'node:fs'
import { createServer } from 'node:http'
import { getRequestListener } from '@hono/node-server'
import { ProviderRegistry, StreamingAgentLoop } from '@oclaw/agent'
import { loadConfig } from '@oclaw/config'
import type { Config } from '@oclaw/config'
import { UnauthorizedError, createLogger } from '@oclaw/shared'
import { createHttpApp } from './http/app.js'
import { startConfigWatcher } from './services/config-watcher.js'
import { SessionManager } from './sessions/manager.js'
import { ConnectionManager } from './ws/connection.js'
import { RpcRouter } from './ws/rpc-router.js'
import { createWsServer } from './ws/ws-server.js'

const logger = createLogger('gateway')

export class Gateway {
	private config!: Config
	private sessions!: SessionManager
	private connections!: ConnectionManager
	private router!: RpcRouter
	private nodeServer?: ReturnType<typeof createServer>
	private configWatcher?: FSWatcher | null
	private workspaceDir: string

	constructor(workspaceDir = process.cwd()) {
		this.workspaceDir = workspaceDir
	}

	async boot(): Promise<void> {
		// 1. Load & validate config
		this.config = loadConfig(this.workspaceDir)

		// 2. Initialize managers
		this.sessions = new SessionManager()
		this.connections = new ConnectionManager()
		this.router = new RpcRouter()

		this.registerRpcMethods()

		// 3. Create HTTP app (Hono)
		const httpApp = createHttpApp(() => this.config, this.connections, this.sessions)

		// 4. Create Node HTTP server with Hono request listener
		this.nodeServer = createServer(getRequestListener(httpApp.fetch))

		// 5. Start WebSocket server (upgrade from HTTP)
		createWsServer({
			server: this.nodeServer,
			connections: this.connections,
			router: this.router,
			sessions: this.sessions,
			logger,
			getConfig: () => this.config,
		})

		// 6. Start config file watcher
		this.configWatcher = startConfigWatcher({
			workspaceDir: this.workspaceDir,
			logger,
			onChange: (newConfig) => {
				this.config = newConfig
				this.connections.broadcast('gateway.configChanged', {})
			},
		})

		// 7. Listen
		await new Promise<void>((resolve) => {
			this.nodeServer?.listen(this.config.gateway.port, this.config.gateway.host, () => {
				logger.info(`Gateway listening on ${this.config.gateway.host}:${this.config.gateway.port}`)
				resolve()
			})
		})
	}

	private registerRpcMethods(): void {
		this.router.register('session.create', (params, ctx) => {
			return ctx.sessions.create({
				channelId: params?.channelId as string | undefined,
				agentId: params?.agentId as string | undefined,
				metadata: params?.metadata as Record<string, unknown> | undefined,
			})
		})

		this.router.register('session.list', (_params, ctx) => {
			return ctx.sessions.list()
		})

		this.router.register('session.get', (params, ctx) => {
			const id = params?.id as string
			return ctx.sessions.get(id)
		})

		this.router.register('session.send', async (params, ctx) => {
			const sessionId = params?.sessionId as string
			const content = params?.content as string

			const provider = ProviderRegistry.fromConfig(ctx.config.agents.defaults.provider)
			const agent = new StreamingAgentLoop(provider, ctx.config.agents.defaults)

			agent.on('stream:text', (text) => {
				ctx.conn.socket.send(
					JSON.stringify({
						jsonrpc: '2.0',
						method: 'session.stream',
						params: { sessionId, type: 'text', data: text },
					}),
				)
			})

			agent.on('stream:tool_start', (data) => {
				ctx.conn.socket.send(
					JSON.stringify({
						jsonrpc: '2.0',
						method: 'session.stream',
						params: { sessionId, type: 'tool_start', data },
					}),
				)
			})

			agent.on('stream:tool_result', (data) => {
				ctx.conn.socket.send(
					JSON.stringify({
						jsonrpc: '2.0',
						method: 'session.stream',
						params: { sessionId, type: 'tool_result', data },
					}),
				)
			})

			agent.on('stream:error', (err) => {
				ctx.conn.socket.send(
					JSON.stringify({
						jsonrpc: '2.0',
						method: 'session.stream',
						params: { sessionId, type: 'error', data: { message: err.message } },
					}),
				)
			})

			agent.on('stream:end', () => {
				ctx.conn.socket.send(
					JSON.stringify({
						jsonrpc: '2.0',
						method: 'session.stream',
						params: { sessionId, type: 'end' },
					}),
				)
			})

			await agent.runStreaming(ctx.sessions, sessionId, content)
			return { ok: true }
		})

		this.router.register('gateway.status', (_params, ctx) => {
			return {
				status: 'ok',
				uptime: process.uptime(),
				connections: this.connections.size(),
				sessions: ctx.sessions.size(),
				version: '0.1.0',
			}
		})

		this.router.register('gateway.config', (_params, ctx) => {
			const c = ctx.config
			return {
				...c,
				agents: {
					...c.agents,
					defaults: {
						...c.agents.defaults,
						provider: {
							...c.agents.defaults.provider,
							apiKey: c.agents.defaults.provider.apiKey ? '[REDACTED]' : undefined,
						},
					},
				},
			}
		})

		this.router.register('auth.login', (params, ctx) => {
			if (!ctx.config.gateway.auth.enabled) {
				return { authenticated: true }
			}
			const token = params?.token as string | undefined
			if (!token || token !== ctx.config.gateway.auth.token) {
				throw new UnauthorizedError('Invalid token')
			}
			this.connections.authenticate(ctx.conn.id)
			return { authenticated: true }
		})
	}

	async shutdown(): Promise<void> {
		this.configWatcher?.close()
		for (const conn of this.connections.list()) {
			conn.socket.close()
		}
		await new Promise<void>((resolve, reject) => {
			if (!this.nodeServer) return resolve()
			this.nodeServer.close((err) => (err ? reject(err) : resolve()))
		})
		logger.info('Gateway shut down')
	}

	getConfig(): Config {
		return this.config
	}

	getSessions(): SessionManager {
		return this.sessions
	}

	getConnections(): ConnectionManager {
		return this.connections
	}

	getPort(): number {
		return this.config.gateway.port
	}

	getAddress(): { host: string; port: number } | null {
		const addr = this.nodeServer?.address()
		if (!addr || typeof addr === 'string') return null
		return { host: addr.address, port: addr.port }
	}
}
