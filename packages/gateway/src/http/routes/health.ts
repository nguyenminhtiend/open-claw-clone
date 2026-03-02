import { Hono } from 'hono';
import type { SessionManager } from '../../sessions/manager.js';
import type { ConnectionManager } from '../../ws/connection.js';

export function healthRoutes(connections: ConnectionManager, sessions: SessionManager) {
  const app = new Hono();

  app.get('/', (c) => {
    return c.json({
      status: 'ok',
      uptime: process.uptime(),
      connections: connections.size(),
      sessions: sessions.size(),
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}
