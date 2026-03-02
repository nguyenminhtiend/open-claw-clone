import type { Connection } from '@oclaw/shared';
import { nanoid } from '@oclaw/shared';
import type WebSocket from 'ws';

export interface WsConnection extends Connection {
  socket: WebSocket;
}

export class ConnectionManager {
  private connections = new Map<string, WsConnection>();

  add(socket: WebSocket, role: Connection['role'] = 'cli'): WsConnection {
    const conn: WsConnection = {
      id: nanoid(),
      socket,
      role,
      capabilities: [],
      metadata: {},
    };
    this.connections.set(conn.id, conn);
    return conn;
  }

  get(id: string): WsConnection | undefined {
    return this.connections.get(id);
  }

  remove(id: string): void {
    this.connections.delete(id);
  }

  authenticate(id: string): void {
    const conn = this.connections.get(id);
    if (conn) {
      conn.authenticatedAt = new Date();
    }
  }

  isAuthenticated(id: string): boolean {
    const conn = this.connections.get(id);
    return !!conn?.authenticatedAt;
  }

  broadcast(method: string, params: unknown): void {
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params });
    for (const conn of this.connections.values()) {
      if (conn.socket.readyState === conn.socket.OPEN) {
        conn.socket.send(msg);
      }
    }
  }

  getByRole(role: Connection['role']): WsConnection[] {
    return Array.from(this.connections.values()).filter((c) => c.role === role);
  }

  size(): number {
    return this.connections.size;
  }

  list(): WsConnection[] {
    return Array.from(this.connections.values());
  }

  clear(): void {
    this.connections.clear();
  }
}
