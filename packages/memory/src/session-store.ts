import { createLogger } from '@oclaw/shared';
import type { Message, Session } from '@oclaw/shared';
import Database from 'better-sqlite3';

const logger = createLogger('memory:session-store');

interface SessionRow {
  id: string;
  channel_id: string;
  agent_id: string;
  created_at: string;
  last_active_at: string;
  metadata: string;
}

interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  timestamp: string;
  tool_calls: string | null;
  tool_call_id: string | null;
  channel_meta: string | null;
}

export interface SessionSummary {
  id: string;
  channelId: string;
  agentId: string;
  createdAt: Date;
  lastActiveAt: Date;
  messageCount: number;
}

export class SessionStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_active_at TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        tool_calls TEXT,
        tool_call_id TEXT,
        channel_meta TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_session_messages ON messages(session_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_session_last_active ON sessions(last_active_at);
    `);
    logger.debug({ dbPath }, 'Session store initialized');
  }

  saveSession(session: Session): void {
    const upsertSession = this.db.prepare(`
      INSERT INTO sessions (id, channel_id, agent_id, created_at, last_active_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        last_active_at = excluded.last_active_at,
        metadata = excluded.metadata
    `);

    const upsertMessage = this.db.prepare(`
      INSERT INTO messages (id, session_id, role, content, timestamp, tool_calls, tool_call_id, channel_meta)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        tool_calls = excluded.tool_calls
    `);

    const save = this.db.transaction(() => {
      upsertSession.run(
        session.id,
        session.channelId,
        session.agentId,
        session.createdAt.toISOString(),
        session.lastActiveAt.toISOString(),
        JSON.stringify(session.metadata)
      );

      for (const msg of session.messages) {
        upsertMessage.run(
          msg.id,
          session.id,
          msg.role,
          msg.content,
          msg.timestamp.toISOString(),
          msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
          msg.toolCallId ?? null,
          msg.channelMeta ? JSON.stringify(msg.channelMeta) : null
        );
      }
    });

    save();
    logger.debug({ sessionId: session.id }, 'Session saved');
  }

  loadSession(id: string): Session | null {
    const sessionRow = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
      | SessionRow
      | undefined;

    if (!sessionRow) {
      return null;
    }

    const messageRows = this.db
      .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC')
      .all(id) as MessageRow[];

    return {
      id: sessionRow.id,
      channelId: sessionRow.channel_id,
      agentId: sessionRow.agent_id,
      createdAt: new Date(sessionRow.created_at),
      lastActiveAt: new Date(sessionRow.last_active_at),
      metadata: JSON.parse(sessionRow.metadata) as Record<string, unknown>,
      messages: messageRows.map(rowToMessage),
    };
  }

  listSessions(limit = 50): SessionSummary[] {
    const rows = this.db
      .prepare(`
        SELECT s.*, COUNT(m.id) as message_count
        FROM sessions s
        LEFT JOIN messages m ON m.session_id = s.id
        GROUP BY s.id
        ORDER BY s.last_active_at DESC
        LIMIT ?
      `)
      .all(limit) as Array<SessionRow & { message_count: number }>;

    return rows.map((r) => ({
      id: r.id,
      channelId: r.channel_id,
      agentId: r.agent_id,
      createdAt: new Date(r.created_at),
      lastActiveAt: new Date(r.last_active_at),
      messageCount: r.message_count,
    }));
  }

  deleteSession(id: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    logger.debug({ sessionId: id }, 'Session deleted');
  }

  close(): void {
    this.db.close();
  }
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    role: row.role as Message['role'],
    content: row.content,
    timestamp: new Date(row.timestamp),
    toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
    toolCallId: row.tool_call_id ?? undefined,
    channelMeta: row.channel_meta ? JSON.parse(row.channel_meta) : undefined,
  };
}
