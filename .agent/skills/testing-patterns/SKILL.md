---
name: testing-patterns
description: Vitest setup, mock strategies for WebSocket/SQLite/LLM providers, and test file conventions for all @oclaw/* packages. Use when writing or debugging tests in any phase.
---

# Testing Patterns

Vitest is used across all packages. Each package has its own `vitest.config.ts` (see [creating-package](../creating-package/SKILL.md)).

## Running Tests

```bash
# Single package
pnpm --filter @oclaw/<name> test

# All packages
pnpm test

# Watch mode
pnpm --filter @oclaw/<name> test:watch
```

## Test File Layout

```
packages/<name>/
├── src/
└── test/
    ├── unit/          # Pure logic, no I/O
    ├── integration/   # Multiple units wired together
    └── <module>.test.ts
```

Co-locate fast unit tests next to source when preferred: `src/foo.test.ts`.

## Mocking WebSocket Connections

```typescript
import { vi } from 'vitest'

function makeMockWs() {
  return {
    send: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
    readyState: 1, // OPEN
  }
}
```

For RPC router tests, create a mock connection and assert `send` was called with the correct JSON-RPC response:

```typescript
const ws = makeMockWs()
await router.handle(ws, { jsonrpc: '2.0', id: 1, method: 'session.list', params: {} })
expect(ws.send).toHaveBeenCalledWith(
  expect.stringContaining('"result"')
)
```

## Mocking SQLite (`better-sqlite3`)

```typescript
vi.mock('better-sqlite3', () => {
  const rows: unknown[] = []
  const stmt = {
    run: vi.fn(),
    get: vi.fn(() => rows[0]),
    all: vi.fn(() => rows),
  }
  return {
    default: vi.fn(() => ({
      prepare: vi.fn(() => stmt),
      exec: vi.fn(),
    })),
    __rows: rows,
  }
})
```

## Mocking LLM Providers

```typescript
import type { LlmProvider } from '@oclaw/agent'

function makeMockProvider(response: string): LlmProvider {
  return {
    id: 'mock',
    name: 'Mock',
    chat: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: response }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 20 },
    }),
    chatStream: vi.fn(),
    countTokens: vi.fn().mockResolvedValue(10),
  }
}
```

For tool-call loops, return alternating `tool_use` then `end_turn` responses:

```typescript
let call = 0
chat: vi.fn().mockImplementation(() => {
  call++
  return call === 1
    ? { content: [{ type: 'tool_use', id: 't1', name: 'exec', input: { cmd: 'ls' } }], stop_reason: 'tool_use' }
    : { content: [{ type: 'text', text: 'done' }], stop_reason: 'end_turn' }
})
```

## Mocking File System

Prefer real temp dirs over mocking `fs`:

```typescript
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let tmpDir: string
beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'oclaw-test-')) })
afterEach(() => rmSync(tmpDir, { recursive: true }))
```

## Integration Test Pattern (Gateway)

Boot a real gateway on a random port, connect a real WS client:

```typescript
import { createGateway } from '@oclaw/gateway'
import WebSocket from 'ws'

let gw: Awaited<ReturnType<typeof createGateway>>
let ws: WebSocket

beforeAll(async () => {
  gw = await createGateway({ port: 0 }) // port 0 = OS assigns free port
  const { port } = gw.address()
  ws = new WebSocket(`ws://localhost:${port}`)
  await new Promise<void>((res) => ws.once('open', res))
})

afterAll(async () => {
  ws.close()
  await gw.stop()
})
```

## Common Assertions

```typescript
// RPC response
expect(JSON.parse(sent)).toMatchObject({ jsonrpc: '2.0', result: expect.any(Object) })

// Error response
expect(JSON.parse(sent)).toMatchObject({ error: { code: -32601 } })

// Approximate timing (debouncer, timeouts)
vi.useFakeTimers()
vi.advanceTimersByTime(350)
vi.useRealTimers()
```
