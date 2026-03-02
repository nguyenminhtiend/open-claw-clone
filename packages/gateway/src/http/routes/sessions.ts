import { Hono } from 'hono'
import type { SessionManager } from '../../sessions/manager.js'

export function sessionRoutes(sessions: SessionManager) {
	const app = new Hono()

	app.get('/', (c) => {
		return c.json(sessions.list())
	})

	app.get('/:id', (c) => {
		try {
			const session = sessions.get(c.req.param('id'))
			return c.json(session)
		} catch {
			return c.json({ error: 'Session not found' }, 404)
		}
	})

	return app
}
