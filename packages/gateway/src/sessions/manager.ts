import { type Message, type Session, SessionNotFoundError, nanoid } from '@oclaw/shared'
import { SessionStore } from './store.js'

export interface CreateSessionParams {
	channelId?: string
	agentId?: string
	metadata?: Record<string, unknown>
}

export class SessionManager {
	private store = new SessionStore()

	create(params: CreateSessionParams = {}): Session {
		const now = new Date()
		const session: Session = {
			id: nanoid(),
			createdAt: now,
			lastActiveAt: now,
			channelId: params.channelId ?? 'default',
			agentId: params.agentId ?? 'default',
			messages: [],
			metadata: params.metadata ?? {},
		}
		this.store.set(session)
		return session
	}

	get(id: string): Session {
		const session = this.store.get(id)
		if (!session) throw new SessionNotFoundError(id)
		return session
	}

	list(): Session[] {
		return this.store.list()
	}

	delete(id: string): void {
		const session = this.store.get(id)
		if (!session) throw new SessionNotFoundError(id)
		this.store.delete(id)
	}

	addMessage(sessionId: string, role: Message['role'], content: string): Message {
		const session = this.get(sessionId)
		const message: Message = {
			id: nanoid(),
			role,
			content,
			timestamp: new Date(),
		}
		session.messages.push(message)
		session.lastActiveAt = new Date()
		this.store.set(session)
		return message
	}

	size(): number {
		return this.store.size()
	}

	clear(): void {
		this.store.clear()
	}
}
