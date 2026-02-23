# Phase 1: Foundation & Gateway

> Build the project scaffold, config system, and the central WebSocket/HTTP gateway server.

## Learning Goals

- pnpm monorepo setup with TypeScript path aliases
- Zod-based runtime configuration validation
- JSON-RPC 2.0 protocol over WebSocket
- HTTP server with route handling (Hono)
- Session management fundamentals

## Why This Matters

In OpenClaw, the **Gateway** is the single process that everything connects to. It's the mission control. Every CLI command, every messaging channel, every web UI client — they all talk to the Gateway over WebSocket (JSON-RPC) or HTTP. Building this first gives us the backbone for everything else.

---

## Architecture

```
Gateway (port 18789)
├── WebSocket Server (JSON-RPC 2.0)
│   ├── Connection Manager
│   ├── Session Manager
│   └── RPC Method Router
├── HTTP Server (Hono)
│   ├── Health endpoint
│   ├── Config endpoint
│   └── Webhook receiver (future)
└── Config Watcher
    ├── JSON5 file loader
    └── Zod schema validation
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| WS library | `ws` | Most mature Node WS lib, minimal overhead |
| HTTP framework | `Hono` | 5x faster than Express, excellent TS types, <15KB |
| Config format | JSON5 + Zod | JSON5 allows comments; Zod gives runtime type safety |
| Protocol | JSON-RPC 2.0 | Simple, well-specified, bidirectional over WS |
| Session storage | In-memory Map | Simple start; persisted sessions come in Phase 4 |

---

## Step-by-Step Implementation

### 1.1 — Monorepo Scaffold

```bash
# Init workspace
pnpm init
mkdir -p packages/{gateway,config,shared}

# Create workspace config
# pnpm-workspace.yaml → packages/*
```

**Files to create:**

```
pnpm-workspace.yaml
tsconfig.json              # Base TS config with path aliases
biome.json                 # Linter + formatter config
packages/shared/
  ├── package.json
  ├── tsconfig.json
  └── src/
      ├── index.ts
      ├── types.ts          # Core shared types
      ├── errors.ts         # Custom error classes
      ├── logger.ts         # Structured logger (pino or custom)
      └── utils.ts          # Common utilities
```

**Key types to define in `shared/src/types.ts`:**

```typescript
// JSON-RPC 2.0 types
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// Session types
interface Session {
  id: string;
  createdAt: Date;
  lastActiveAt: Date;
  channelId: string;
  agentId: string;
  messages: Message[];
  metadata: Record<string, unknown>;
}

// Message types
interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: Date;
  channelMeta?: Record<string, unknown>;
}
```

### 1.2 — Config System

The config system uses JSON5 files validated at runtime with Zod schemas.

**Files:**

```
packages/config/
  ├── package.json
  ├── tsconfig.json
  └── src/
      ├── index.ts
      ├── schema.ts         # Zod schemas for all config
      ├── loader.ts         # JSON5 file loader + watcher
      └── defaults.ts       # Default configuration values
```

**Core config schema (simplified):**

```typescript
import { z } from "zod";

export const providerSchema = z.object({
  name: z.enum(["anthropic", "openai", "ollama", "openrouter", "deepseek"]),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  model: z.string(),
});

export const gatewaySchema = z.object({
  port: z.number().default(18789),
  host: z.string().default("127.0.0.1"),
  auth: z.object({
    token: z.string().optional(),
    enabled: z.boolean().default(false),
  }),
});

export const agentSchema = z.object({
  provider: providerSchema,
  maxTokens: z.number().default(4096),
  temperature: z.number().default(0.7),
  systemPrompt: z.string().optional(),
  memoryEnabled: z.boolean().default(true),
});

export const configSchema = z.object({
  gateway: gatewaySchema,
  agents: z.object({
    defaults: agentSchema,
    named: z.record(z.string(), agentSchema.partial()).default({}),
  }),
  channels: z.record(z.string(), z.unknown()).default({}),
  plugins: z.object({
    enabled: z.array(z.string()).default([]),
    paths: z.array(z.string()).default([]),
  }),
});

export type Config = z.infer<typeof configSchema>;
```

**Config watcher (`loader.ts`):**
- Load from `~/.openclaw-clone/config.json5` or workspace `./config.json5`
- Watch for file changes using `fs.watch`
- Emit validated config on change
- Merge: defaults → global → workspace → env vars

### 1.3 — Gateway Server

The gateway is the heart. It boots a WebSocket server and an HTTP server on the same port.

**Files:**

```
packages/gateway/
  ├── package.json
  ├── tsconfig.json
  └── src/
      ├── index.ts           # Entry point, boot sequence
      ├── server.ts          # Gateway class orchestrating everything
      ├── ws/
      │   ├── ws-server.ts   # WebSocket server setup
      │   ├── connection.ts  # Connection lifecycle management
      │   └── rpc-router.ts  # JSON-RPC method dispatch
      ├── http/
      │   ├── app.ts         # Hono app with routes
      │   └── routes/
      │       ├── health.ts
      │       ├── config.ts
      │       └── sessions.ts
      ├── sessions/
      │   ├── manager.ts     # Session CRUD + lifecycle
      │   └── store.ts       # In-memory session store
      └── services/
          ├── config-watcher.ts
          └── lifecycle.ts   # Graceful startup/shutdown
```

**Gateway boot sequence:**

```typescript
class Gateway {
  async boot() {
    // 1. Load & validate config
    const config = await loadConfig();

    // 2. Initialize session manager
    this.sessions = new SessionManager();

    // 3. Start HTTP server (Hono)
    this.http = createHttpApp(config);

    // 4. Start WebSocket server (upgrade from HTTP)
    this.ws = createWsServer(this.http, {
      onConnection: (conn) => this.handleConnection(conn),
      onMessage: (conn, msg) => this.rpcRouter.dispatch(conn, msg),
      onClose: (conn) => this.handleDisconnect(conn),
    });

    // 5. Start config file watcher
    this.configWatcher = watchConfig((newConfig) => {
      this.handleConfigChange(newConfig);
    });

    // 6. Listen on port
    this.server = serve({ fetch: this.http.fetch, port: config.gateway.port });

    logger.info(`Gateway listening on ${config.gateway.host}:${config.gateway.port}`);
  }
}
```

**JSON-RPC router:**

```typescript
class RpcRouter {
  private methods = new Map<string, RpcHandler>();

  register(method: string, handler: RpcHandler) {
    this.methods.set(method, handler);
  }

  async dispatch(conn: Connection, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const handler = this.methods.get(request.method);
    if (!handler) {
      return { jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not found" } };
    }
    try {
      const result = await handler(request.params, { conn, sessions: this.sessions });
      return { jsonrpc: "2.0", id: request.id, result };
    } catch (err) {
      return { jsonrpc: "2.0", id: request.id, error: { code: -32000, message: err.message } };
    }
  }
}
```

**Initial RPC methods to implement:**

| Method | Description |
|--------|-------------|
| `session.create` | Create a new chat session |
| `session.list` | List active sessions |
| `session.get` | Get session by ID with messages |
| `session.send` | Send a message to a session (triggers agent in Phase 2) |
| `gateway.status` | Return gateway health & stats |
| `gateway.config` | Return sanitized config |

### 1.4 — Connection & Auth

```typescript
interface Connection {
  id: string;
  socket: WebSocket;
  role: "cli" | "channel" | "web" | "node";
  authenticatedAt?: Date;
  capabilities: string[];
  metadata: Record<string, unknown>;
}

class ConnectionManager {
  private connections = new Map<string, Connection>();

  add(socket: WebSocket, role: string): Connection { /* ... */ }
  remove(id: string): void { /* ... */ }
  broadcast(method: string, params: unknown): void { /* ... */ }
  getByRole(role: string): Connection[] { /* ... */ }
}
```

Auth is simple token-based for now: client sends `auth.login` with a token that matches config. Skip if `auth.enabled` is false.

---

## Testing Strategy

```
packages/gateway/test/
  ├── ws-server.test.ts      # WebSocket connection lifecycle
  ├── rpc-router.test.ts     # Method dispatch, error handling
  ├── session-manager.test.ts # Session CRUD
  ├── config-loader.test.ts  # Config validation & defaults
  └── integration/
      └── gateway.test.ts    # Full boot → connect → RPC round-trip
```

Key test scenarios:
- Gateway boots and accepts WS connections
- JSON-RPC requests get correct responses
- Invalid methods return -32601
- Sessions are created, listed, retrieved
- Config changes are hot-reloaded
- Graceful shutdown closes all connections

---

## Checkpoint — You're Done When

- [ ] `pnpm install` works across the monorepo
- [ ] `pnpm dev` starts the gateway on port 18789
- [ ] WebSocket client can connect and send JSON-RPC requests
- [ ] `session.create` / `session.list` / `session.send` work
- [ ] HTTP health endpoint returns status at `GET /health`
- [ ] Config loads from JSON5 file and validates with Zod
- [ ] Config file changes trigger hot reload
- [ ] All tests pass with `pnpm test`

---

## Dependencies

```json
{
  "dependencies": {
    "hono": "^4.x",
    "ws": "^8.x",
    "zod": "^3.x",
    "json5": "^2.x",
    "nanoid": "^5.x",
    "pino": "^9.x"
  },
  "devDependencies": {
    "typescript": "^5.5",
    "vitest": "^2.x",
    "@biomejs/biome": "^1.x",
    "tsup": "^8.x",
    "tsx": "^4.x"
  }
}
```

---

## Next Phase

→ **[Phase 2: Agent Loop & LLM Integration](phase-02-agent-loop.md)**
