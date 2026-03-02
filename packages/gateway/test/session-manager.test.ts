import { describe, it, expect, beforeEach } from 'vitest'
import { SessionManager } from '../src/sessions/manager.js'
import { SessionNotFoundError } from '@oclaw/shared'

describe('SessionManager', () => {
	let manager: SessionManager

	beforeEach(() => {
		manager = new SessionManager()
	})

	it('creates a session with defaults', () => {
		const session = manager.create()
		expect(session.id).toBeTruthy()
		expect(session.channelId).toBe('default')
		expect(session.agentId).toBe('default')
		expect(session.messages).toHaveLength(0)
	})

	it('creates a session with custom params', () => {
		const session = manager.create({ channelId: 'discord', agentId: 'gpt4', metadata: { foo: 1 } })
		expect(session.channelId).toBe('discord')
		expect(session.agentId).toBe('gpt4')
		expect(session.metadata).toEqual({ foo: 1 })
	})

	it('gets a session by id', () => {
		const created = manager.create()
		const fetched = manager.get(created.id)
		expect(fetched.id).toBe(created.id)
	})

	it('throws SessionNotFoundError for unknown id', () => {
		expect(() => manager.get('nonexistent')).toThrow(SessionNotFoundError)
	})

	it('lists all sessions', () => {
		manager.create()
		manager.create()
		expect(manager.list()).toHaveLength(2)
	})

	it('deletes a session', () => {
		const s = manager.create()
		manager.delete(s.id)
		expect(manager.list()).toHaveLength(0)
	})

	it('throws on delete of unknown session', () => {
		expect(() => manager.delete('nope')).toThrow(SessionNotFoundError)
	})

	it('adds a message to a session', () => {
		const s = manager.create()
		const msg = manager.addMessage(s.id, 'user', 'hello')
		expect(msg.role).toBe('user')
		expect(msg.content).toBe('hello')
		expect(manager.get(s.id).messages).toHaveLength(1)
	})

	it('updates lastActiveAt when adding a message', async () => {
		const s = manager.create()
		const before = s.lastActiveAt
		await new Promise((r) => setTimeout(r, 5))
		manager.addMessage(s.id, 'user', 'hi')
		expect(manager.get(s.id).lastActiveAt.getTime()).toBeGreaterThan(before.getTime())
	})
})
