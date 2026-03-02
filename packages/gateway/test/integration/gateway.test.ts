import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import WebSocket from 'ws'
import { Gateway } from '../../src/server.js'

let gateway: Gateway
let port: number

describe('Gateway integration', () => {
	beforeEach(async () => {
		gateway = new Gateway()
		process.env['OCLAW_PORT'] = '0'
		await gateway.boot()
		delete process.env['OCLAW_PORT']
		port = gateway.getAddress()?.port ?? 18789
	})

	afterEach(async () => {
		await gateway.shutdown()
	})

	function connect(): Promise<WebSocket> {
		return new Promise((resolve, reject) => {
			const ws = new WebSocket(`ws://127.0.0.1:${port}`)
			ws.once('open', () => resolve(ws))
			ws.once('error', reject)
		})
	}

	function rpc(ws: WebSocket, method: string, params?: Record<string, unknown>): Promise<unknown> {
		return new Promise((resolve, reject) => {
			const id = Math.random().toString(36).slice(2)
			ws.once('message', (data) => {
				const res = JSON.parse(data.toString())
				if (res.error) reject(new Error(res.error.message))
				else resolve(res.result)
			})
			ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
		})
	}

	it('responds to gateway.status', async () => {
		const ws = await connect()
		const result = await rpc(ws, 'gateway.status') as { status: string }
		expect(result.status).toBe('ok')
		ws.close()
	})

	it('creates and lists sessions', async () => {
		const ws = await connect()
		await rpc(ws, 'session.create', { channelId: 'test' })
		const list = await rpc(ws, 'session.list') as unknown[]
		expect(list).toHaveLength(1)
		ws.close()
	})

	it('gets a session by id', async () => {
		const ws = await connect()
		const created = await rpc(ws, 'session.create') as { id: string }
		const fetched = await rpc(ws, 'session.get', { id: created.id }) as { id: string }
		expect(fetched.id).toBe(created.id)
		ws.close()
	})

	it('sends a message to a session', async () => {
		const ws = await connect()
		const session = await rpc(ws, 'session.create') as { id: string }
		const res = await rpc(ws, 'session.send', {
			sessionId: session.id,
			content: 'hello world',
		}) as { message: { content: string }; queued: boolean }
		expect(res.message.content).toBe('hello world')
		expect(res.queued).toBe(true)
		ws.close()
	})

	it('returns method not found for unknown methods', async () => {
		const ws = await connect()
		await expect(rpc(ws, 'nonexistent.method')).rejects.toThrow('Method not found')
		ws.close()
	})

	it('returns parse error for invalid JSON', async () => {
		const ws = await connect()
		const response = await new Promise<{ error: { code: number } }>((resolve) => {
			ws.once('message', (data) => resolve(JSON.parse(data.toString())))
			ws.send('not json at all')
		})
		expect(response.error.code).toBe(-32700)
		ws.close()
	})
})
