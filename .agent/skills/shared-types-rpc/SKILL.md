---
name: shared-types-rpc
description: Reference for @oclaw/shared exports — JSON-RPC 2.0 types, Session, Message, AppError codes, and pino logger usage. Use when implementing RPC methods, consuming shared types across packages, or setting up structured logging.
---

# Shared Types & RPC Protocol

`packages/shared/src/` exports used by every other package.

## JSON-RPC Types (`src/types.ts`)

```typescript
interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: unknown
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0'
  id: string | number
  result?: T
  error?: JsonRpcError
}

interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}

// Notification (no id — fire-and-forget from server to client)
interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}
```

## Error Codes (`src/errors.ts`)

Standard JSON-RPC codes + project-specific:

| Code    | Constant               | Meaning                     |
| ------- | ---------------------- | --------------------------- |
| -32700  | `PARSE_ERROR`          | Invalid JSON                |
| -32600  | `INVALID_REQUEST`      | Not a valid RPC request      |
| -32601  | `METHOD_NOT_FOUND`     | Method doesn't exist        |
| -32602  | `INVALID_PARAMS`       | Wrong/missing params        |
| -32603  | `INTERNAL_ERROR`       | Server error                |
| -32000  | `AUTH_REQUIRED`        | Not authenticated           |
| -32001  | `SESSION_NOT_FOUND`    | Session ID unknown          |
| -32002  | `TOOL_DENIED`          | Tool blocked by policy      |
| -32003  | `TOOL_TIMEOUT`         | Tool execution timed out    |

```typescript
class AppError extends Error {
  constructor(
    message: string,
    public code: number,
    public data?: unknown
  ) { super(message) }

  toRpcError(): JsonRpcError {
    return { code: this.code, message: this.message, data: this.data }
  }
}
```

## Session & Message (`src/types.ts`)

```typescript
interface Session {
  id: string
  createdAt: Date
  updatedAt: Date
  messages: Message[]
  metadata: Record<string, unknown>
}

interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string | ContentBlock[]
  timestamp: Date
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
```

## Logger (`src/logger.ts`)

Pino-based structured logger. Always use this — never `console.log`.

```typescript
import { createLogger } from '@oclaw/shared'

const logger = createLogger('gateway') // label appears in every log line

logger.info({ sessionId }, 'Session created')
logger.error({ err, method }, 'RPC handler failed')
logger.debug({ tokens }, 'Token budget updated')
```

Log levels: `trace` | `debug` | `info` | `warn` | `error` | `fatal`

## ID Generation (`src/utils.ts`)

```typescript
import { generateId } from '@oclaw/shared'

const sessionId = generateId() // nanoid, 21 chars
```

## RPC Method Naming Conventions

```
<resource>.<action>

session.create     session.list     session.get
session.send       session.reset    session.delete
gateway.status     gateway.config
agent.abort
plugins.list
memory.search      memory.get
```

Streaming notifications from server → client use the same namespace:

```
session.stream     { type: 'text' | 'tool_start' | 'tool_result' | 'end', ... }
channel.message    { channelId, message }
config.updated     { config }
```
