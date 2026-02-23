---
name: phase-01-foundation-gateway
description: Scaffolds the pnpm monorepo, Zod/JSON5 config system, and WebSocket/HTTP gateway server. Use when starting the project from scratch or when setting up the gateway, session manager, config loader, or shared packages.
---

# Phase 1: Foundation & Gateway

Build the project scaffold, config system, and the central WebSocket/HTTP gateway server.

## Prerequisites

- Node.js >= 22.0.0
- pnpm >= 9.0.0
- TypeScript >= 5.5

## Steps

Copy this checklist and mark off items as you complete them:

```
Progress:
- [ ] 1. Initialize Monorepo
- [ ] 2. Create Base TypeScript Config
- [ ] 3. Create Biome Config
- [ ] 4. Install Root Dev Dependencies
- [ ] 5. Create packages/shared
- [ ] 6. Create packages/config
- [ ] 7. Create packages/gateway
- [ ] 8. Implement Initial RPC Methods
- [ ] 9. Implement Connection & Auth
- [ ] 10. Implement Config Hot-Reload
- [ ] 11. Write Tests ✅ all passing
```

### 1. Initialize Monorepo

```bash
# turbo
pnpm init
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
```

Create package directories:

```bash
# turbo
mkdir -p packages/{gateway,config,shared}/src
```

### 2. Create Base TypeScript Config

Copy [configs/tsconfig.base.json](configs/tsconfig.base.json) to `tsconfig.json` at the repo root.

### 3. Create Biome Config

Copy [configs/biome.base.json](configs/biome.base.json) to `biome.json` at the repo root.

### 4. Install Root Dev Dependencies

```bash
# turbo
pnpm add -D typescript@^5.5 vitest@^2 @biomejs/biome@^1 tsup@^8 tsx@^4
```

### 5. Create `packages/shared`

See [creating-package](../creating-package/SKILL.md) for the standard package scaffold. For the full type contracts (`JsonRpcRequest`, `Session`, `Message`, error codes, logger), see [shared-types-rpc](../shared-types-rpc/SKILL.md).

Package for shared types, errors, and JSON-RPC protocol.

Key files:

- `src/types.ts` — `JsonRpcRequest`, `JsonRpcResponse`, `Session`, `Message` interfaces
- `src/errors.ts` — Custom error classes with error codes
- `src/logger.ts` — Structured logger using pino
- `src/utils.ts` — Common utilities (nanoid re-export, etc.)

### 6. Create `packages/config`

Config system using JSON5 + Zod.

Key files:

- `src/schema.ts` — Zod schemas for gateway, agent, channel, plugin config
- `src/loader.ts` — JSON5 file loader, merge logic (defaults → global → workspace → env)
- `src/defaults.ts` — Default configuration values

Config loads from:

1. Built-in defaults
2. `~/.openclaw-clone/config.json5` (global)
3. `./config.json5` (workspace)
4. Environment variables override

Install config dependencies:

```bash
# turbo
pnpm --filter @oclaw/config add zod@^3 json5@^2
```

### 7. Create `packages/gateway`

The central WebSocket/HTTP server.

Key files:

- `src/server.ts` — Gateway class orchestrating everything
- `src/ws/ws-server.ts` — WebSocket server setup using `ws`
- `src/ws/connection.ts` — Connection lifecycle management
- `src/ws/rpc-router.ts` — JSON-RPC method dispatch
- `src/http/app.ts` — Hono HTTP app
- `src/http/routes/health.ts` — `GET /health` endpoint
- `src/sessions/manager.ts` — Session CRUD + lifecycle
- `src/sessions/store.ts` — In-memory session store

Gateway boot sequence:

1. Load & validate config (Zod)
2. Initialize session manager
3. Start HTTP server (Hono)
4. Start WebSocket server (upgrade from HTTP)
5. Start config file watcher
6. Listen on port (default 18789)

Install gateway dependencies:

```bash
# turbo
pnpm --filter @oclaw/gateway add hono@^4 ws@^8 nanoid@^5 pino@^9
pnpm --filter @oclaw/gateway add -D @types/ws
```

### 8. Implement Initial RPC Methods

| Method           | Description                                    |
| ---------------- | ---------------------------------------------- |
| `session.create` | Create a new chat session                      |
| `session.list`   | List active sessions                           |
| `session.get`    | Get session by ID with messages                |
| `session.send`   | Send a message to a session (stub for Phase 2) |
| `gateway.status` | Return gateway health & stats                  |
| `gateway.config` | Return sanitized config (API keys redacted)    |

### 9. Implement Connection & Auth

Simple token-based auth: client sends `auth.login` with a token matching config.
Skip if `auth.enabled` is false.

Connection interface: id, socket, role (cli/channel/web/node), auth state, capabilities.

### 10. Implement Config Hot-Reload

- Watch config file with `fs.watch`
- Re-validate with Zod on change
- Emit new config to connected clients
- Log config changes

### 11. Write Tests

```bash
# turbo
pnpm --filter @oclaw/gateway test
```

See [testing-patterns](../testing-patterns/SKILL.md) for mock strategies (WS connections, integration boot).

Test files:

- `test/rpc-router.test.ts` — Method dispatch, error handling
- `test/session-manager.test.ts` — Session CRUD
- `test/config-loader.test.ts` — Config validation & defaults
- `test/integration/gateway.test.ts` — Full boot → WS connect → RPC round-trip

**Feedback loop**: If any tests fail, fix the issue and re-run before proceeding. Only move on when all tests pass.

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

## Dependencies

| Package     | Purpose                    |
| ----------- | -------------------------- |
| hono `^4`   | Lightweight HTTP framework |
| ws `^8`     | WebSocket server           |
| zod `^3`    | Runtime config validation  |
| json5 `^2`  | Config file format         |
| nanoid `^5` | ID generation              |
| pino `^9`   | Structured logging         |
| vitest `^2` | Testing                    |
| biome `^1`  | Linter + formatter         |
| tsup `^8`   | TS bundler                 |
| tsx `^4`    | TS execution               |
