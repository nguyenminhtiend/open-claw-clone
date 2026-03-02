import { Hono } from 'hono'
import type { Config } from '@oclaw/config'
import type { ConnectionManager } from '../ws/connection.js'
import type { SessionManager } from '../sessions/manager.js'
import { healthRoutes } from './routes/health.js'
import { sessionRoutes } from './routes/sessions.js'

export function createHttpApp(
	getConfig: () => Config,
	connections: ConnectionManager,
	sessions: SessionManager,
) {
	const app = new Hono()

	app.route('/health', healthRoutes(connections, sessions))
	app.route('/sessions', sessionRoutes(sessions))

	app.get('/config', (c) => {
		const config = getConfig()
		const sanitized = {
			...config,
			agents: {
				...config.agents,
				defaults: {
					...config.agents.defaults,
					provider: {
						...config.agents.defaults.provider,
						apiKey: config.agents.defaults.provider.apiKey ? '[REDACTED]' : undefined,
					},
				},
			},
		}
		return c.json(sanitized)
	})

	return app
}
