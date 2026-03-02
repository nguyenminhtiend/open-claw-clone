import type { Session } from '@oclaw/shared'

export class SessionStore {
	private sessions = new Map<string, Session>()

	set(session: Session): void {
		this.sessions.set(session.id, session)
	}

	get(id: string): Session | undefined {
		return this.sessions.get(id)
	}

	delete(id: string): boolean {
		return this.sessions.delete(id)
	}

	list(): Session[] {
		return Array.from(this.sessions.values())
	}

	size(): number {
		return this.sessions.size
	}

	clear(): void {
		this.sessions.clear()
	}
}
