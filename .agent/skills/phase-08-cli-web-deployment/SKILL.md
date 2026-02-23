---
name: phase-08-cli-web-deployment
description: Builds the CLI (onboard/chat/daemon commands), Lit-based web control panel, daemon service management, and Docker deployment. Use when implementing the CLI entry point, web UI, daemon management, or packaging the system for deployment after all prior phases are complete.
---

# Phase 8: CLI, Web UI & Deployment

Build the CLI entry point, web control panel, daemon service management, and Docker deployment.

## Prerequisites

- Phases 1-7 completed (full system working)
- `citty` for CLI framework, `lit` for web UI

## Steps

Copy this checklist and mark off items as you complete them:

```
Progress:
- [ ] 1. Create packages/cli
- [ ] 2. Build CLI Framework
- [ ] 3. Build Core CLI Commands
- [ ] 4. Build WebSocket Client
- [ ] 5. Build Onboard Wizard
- [ ] 6. Build Chat REPL
- [ ] 7. Create packages/web
- [ ] 8. Build Web UI with Lit
- [ ] 9. Serve Web UI from Gateway
- [ ] 10. Build Daemon Management
- [ ] 11. Build Docker Deployment
- [ ] 12. Install Dependencies
- [ ] 13. Write Tests ✅ all passing
```

### 1. Create `packages/cli`

See [creating-package](../creating-package/SKILL.md) for the standard package scaffold.

```bash
# turbo
mkdir -p packages/cli/src/{commands/{config,sessions,memory,channels,plugins,daemon},util}
```

### 2. Build CLI Framework

`src/cli.ts` using **citty**:

- Binary: `oclaw` with subcommand structure
- All commands communicate with Gateway via WebSocket JSON-RPC

### 3. Build Core CLI Commands

Implement all commands listed in [reference/cli-commands.md](reference/cli-commands.md). All commands communicate with the Gateway via WebSocket JSON-RPC.

### 4. Build WebSocket Client

`src/ws-client.ts`:

- Connect to Gateway at `ws://localhost:18789`
- JSON-RPC request/response helper
- Event listener for notifications

### 5. Build Onboard Wizard

Interactive prompts:

1. Choose LLM provider (Anthropic/OpenAI/Ollama/OpenRouter)
2. Enter API key (skip for Ollama)
3. Choose default model
4. Generate `config.json5` at `~/.openclaw-clone/`
5. Create initial memory files (MEMORY.md, SOUL.md, AGENTS.md)
6. Optionally install daemon

### 6. Build Chat REPL

- Create/resume sessions
- Stream responses token-by-token to stdout
- Display tool calls inline
- Support `/slash` commands
- `readline` interface with prompt

### 7. Create `packages/web`

See [creating-package](../creating-package/SKILL.md) for the standard package scaffold.

```bash
# turbo
mkdir -p packages/web/src/{components,services,styles}
```

### 8. Build Web UI with Lit

Lightweight web components (< 50KB bundle). Build all components listed in [reference/web-components.md](reference/web-components.md). Dark mode by default with system-UI fonts.

### 9. Serve Web UI from Gateway

Add HTTP routes:

- `GET /` → serve `index.html`
- `GET /assets/*` → serve static files from web package dist

### 10. Build Daemon Management

**macOS**: `launchd` plist at `~/Library/LaunchAgents/com.openclaw-clone.daemon.plist`

- `RunAtLoad: true`, `KeepAlive: true`
- Logs to `~/.openclaw-clone/logs/`

**Linux**: `systemd` user service at `~/.config/systemd/user/openclaw-clone.service`

- `Restart=always`, `RestartSec=10`

### 11. Build Docker Deployment

**Dockerfile** — Multi-stage build:

- Stage 1: Install deps with pnpm
- Stage 2: Runtime with Node.js 22, git, curl, ripgrep
- Non-root user, HEALTHCHECK, volume for data

**docker-compose.yml**:

- Gateway service on port 18789
- Optional Caddy reverse proxy for HTTPS
- Persistent volumes for config and memory

### 12. Install Dependencies

```bash
# turbo
pnpm --filter @oclaw/cli add citty @inquirer/prompts
pnpm --filter @oclaw/web add lit
```

### 13. Write Tests

Key tests:

- CLI commands connect to Gateway
- Onboard wizard creates valid config
- Chat REPL sends/receives via WebSocket
- Docker image builds successfully
- Web UI loads and connects

**Feedback loop**: After `oclaw onboard` (Step 5), verify the generated `config.json5` loads cleanly by running `oclaw config show`. If the config is invalid, fix the wizard before building the Chat REPL. After building Docker (Step 11), run `docker build .` and verify the container starts and `GET /health` returns 200. Only finalize if the full end-to-end test passes: `oclaw chat` → Gateway → Agent → LLM → response.

---

## Checkpoint — You're Done When

- [ ] `oclaw onboard` creates config, memory files, optional daemon
- [ ] `oclaw chat` provides interactive REPL with streaming
- [ ] `oclaw config show` displays current config
- [ ] `oclaw sessions list` shows active sessions
- [ ] `oclaw daemon start/stop/status` manages background service
- [ ] Web UI at `http://localhost:18789` provides chat + dashboard
- [ ] Docker build succeeds and container runs properly
- [ ] Full end-to-end: CLI chat → Gateway → Agent → LLM → Response

## Dependencies

| Package                | Purpose                         |
| ---------------------- | ------------------------------- |
| citty                  | CLI framework                   |
| @inquirer/prompts `^7` | Interactive prompts             |
| lit `^3`               | Web components                  |
| ink `^5`               | Terminal UI (optional TUI mode) |
