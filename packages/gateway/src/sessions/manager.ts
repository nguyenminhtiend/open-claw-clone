import {
  type Message,
  type Session,
  SessionNotFoundError,
  type ToolCallBlock,
  nanoid,
} from '@oclaw/shared';
import { SessionStore } from './store.js';

export interface CreateSessionParams {
  channelId?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
}

export class SessionManager {
  private store = new SessionStore();

  create(params: CreateSessionParams = {}): Session {
    const now = new Date();
    const session: Session = {
      id: nanoid(),
      createdAt: now,
      lastActiveAt: now,
      channelId: params.channelId ?? 'default',
      agentId: params.agentId ?? 'default',
      messages: [],
      metadata: params.metadata ?? {},
    };
    this.store.set(session);
    return session;
  }

  get(id: string): Session {
    const session = this.store.get(id);
    if (!session) {
      throw new SessionNotFoundError(id);
    }
    return session;
  }

  list(): Session[] {
    return this.store.list();
  }

  delete(id: string): void {
    const session = this.store.get(id);
    if (!session) {
      throw new SessionNotFoundError(id);
    }
    this.store.delete(id);
  }

  addMessage(sessionId: string, role: Message['role'], content: string): Message {
    return this.addRichMessage(sessionId, { role, content });
  }

  addRichMessage(
    sessionId: string,
    msg: Omit<Message, 'id' | 'timestamp'> & { toolCalls?: ToolCallBlock[]; toolCallId?: string }
  ): Message {
    const session = this.get(sessionId);
    const message: Message = {
      id: nanoid(),
      timestamp: new Date(),
      ...msg,
    };
    session.messages.push(message);
    session.lastActiveAt = new Date();
    this.store.set(session);
    return message;
  }

  /**
   * Find an existing session by channelId+conversationId, or create a new one.
   * conversationId is stored in metadata.conversationId for lookup.
   */
  getOrCreate(conversationId: string, channelId: string): Session {
    const existing = this.store
      .list()
      .find(
        (s) =>
          s.channelId === channelId &&
          (s.metadata as Record<string, unknown>).conversationId === conversationId
      );
    if (existing) {
      return existing;
    }
    return this.create({
      channelId,
      metadata: { conversationId },
    });
  }

  size(): number {
    return this.store.size();
  }

  clear(): void {
    this.store.clear();
  }
}
