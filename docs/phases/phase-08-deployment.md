# Phase 8: CLI, Web UI & Deployment

> Build the CLI, web control panel, daemon service, and Docker deployment.

## Learning Goals

- CLI framework design (subcommands, interactive prompts)
- Lit web components for a lightweight control UI
- Daemon process management (launchd on macOS, systemd on Linux)
- Docker containerization for reproducible deployment
- Reverse proxy setup for secure remote access

## Why This Matters

This is the user-facing shell that wraps everything we've built. The CLI is the primary interface for power users — onboarding, config management, session interaction. The web UI provides a visual dashboard. The daemon ensures the gateway runs persistently. Docker makes it deployable on any lightweight VM.

---

## Architecture

```
User Interfaces
├── CLI (packages/cli/)
│   ├── Main entry (openclaw-clone)
│   ├── Subcommands (50+)
│   │   ├── onboard — First-time setup wizard
│   │   ├── chat — Interactive REPL
│   │   ├── config — View/edit configuration
│   │   ├── sessions — Manage sessions
│   │   ├── memory — Memory management
│   │   ├── channels — Channel status
│   │   ├── plugins — Plugin management
│   │   └── daemon — Start/stop/status
│   └── TUI mode (Ink-based terminal UI)
├── Web UI (packages/web/)
│   ├── Lit web components
│   ├── WebSocket connection to Gateway
│   ├── Chat interface
│   ├── Session browser
│   ├── Config editor
│   └── Status dashboard
└── Deployment
    ├── Daemon (launchd / systemd)
    ├── Docker (Dockerfile + compose)
    └── Reverse proxy (Caddy)
```

---

## Step-by-Step Implementation

### 8.1 — CLI Framework

**Files:**

```
packages/cli/
  ├── package.json
  ├── tsconfig.json
  └── src/
      ├── index.ts              # Entry point (bin)
      ├── cli.ts                # CLI setup
      ├── ws-client.ts          # WebSocket client to Gateway
      ├── commands/
      │   ├── onboard.ts        # First-time setup wizard
      │   ├── chat.ts           # Interactive chat REPL
      │   ├── config/
      │   │   ├── show.ts
      │   │   ├── set.ts
      │   │   └── edit.ts
      │   ├── sessions/
      │   │   ├── list.ts
      │   │   ├── show.ts
      │   │   └── delete.ts
      │   ├── memory/
      │   │   ├── status.ts
      │   │   ├── search.ts
      │   │   └── index.ts
      │   ├── channels/
      │   │   ├── status.ts
      │   │   └── test.ts
      │   ├── plugins/
      │   │   ├── list.ts
      │   │   ├── install.ts
      │   │   └── enable.ts
      │   └── daemon/
      │       ├── start.ts
      │       ├── stop.ts
      │       ├── status.ts
      │       └── install.ts    # Install as system service
      └── util/
          ├── prompts.ts        # Interactive prompts
          ├── spinner.ts        # Progress spinners
          └── format.ts         # Output formatting
```

**CLI entry point:**

```typescript
import { defineCommand, runMain } from "citty";

const main = defineCommand({
  meta: { name: "oclaw", description: "OpenClaw Clone — Personal AI Agent", version: "0.1.0" },
  subCommands: {
    onboard: () => import("./commands/onboard").then(m => m.default),
    chat:    () => import("./commands/chat").then(m => m.default),
    config:  () => import("./commands/config/show").then(m => m.default),
    sessions:() => import("./commands/sessions/list").then(m => m.default),
    memory:  () => import("./commands/memory/status").then(m => m.default),
    channels:() => import("./commands/channels/status").then(m => m.default),
    plugins: () => import("./commands/plugins/list").then(m => m.default),
    daemon:  () => import("./commands/daemon/status").then(m => m.default),
  },
});

runMain(main);
```

**Onboard command (first-time setup wizard):**

```typescript
export default defineCommand({
  meta: { name: "onboard", description: "First-time setup wizard" },
  args: {
    installDaemon: { type: "boolean", description: "Install as system daemon", default: false },
  },
  async run({ args }) {
    console.log("Welcome to OpenClaw Clone!\n");

    // 1. Choose LLM provider
    const provider = await select({
      message: "Choose your LLM provider:",
      options: [
        { label: "Anthropic (Claude)", value: "anthropic" },
        { label: "OpenAI", value: "openai" },
        { label: "Ollama (Local)", value: "ollama" },
        { label: "OpenRouter", value: "openrouter" },
      ],
    });

    // 2. API key (skip for Ollama)
    let apiKey: string | undefined;
    if (provider !== "ollama") {
      apiKey = await password({ message: `Enter your ${provider} API key:` });
    }

    // 3. Choose model
    const model = await text({
      message: "Default model:",
      default: provider === "anthropic" ? "claude-sonnet-4-20250514" :
               provider === "openai" ? "gpt-4o" :
               provider === "ollama" ? "llama3.2" : "anthropic/claude-sonnet-4-20250514",
    });

    // 4. Generate config
    const config = {
      gateway: { port: 18789, host: "127.0.0.1" },
      agents: {
        defaults: {
          provider: { name: provider, apiKey, model },
          maxTokens: 4096,
          temperature: 0.7,
          memoryEnabled: true,
        },
      },
      channels: {},
      plugins: { enabled: ["*"], paths: [] },
    };

    // 5. Write config
    const configDir = resolve(homedir(), ".openclaw-clone");
    await mkdir(configDir, { recursive: true });
    await writeFile(resolve(configDir, "config.json5"), JSON5.stringify(config, null, 2));

    // 6. Create initial memory files
    await writeFile(resolve(configDir, "MEMORY.md"), "# Memory\n\nNo memories yet.\n");
    await writeFile(resolve(configDir, "SOUL.md"), "# Soul\n\nYou are a helpful, thoughtful personal AI assistant.\n");
    await writeFile(resolve(configDir, "AGENTS.md"), "# Agent Instructions\n\nBe concise. Be helpful. Ask for clarification when needed.\n");
    await mkdir(resolve(configDir, "memory"), { recursive: true });

    console.log(`\nConfig written to ${configDir}/config.json5`);

    // 7. Optionally install daemon
    if (args.installDaemon) {
      await installDaemon();
    }

    console.log("\nSetup complete! Run `oclaw chat` to start chatting.");
  },
});
```

**Chat REPL:**

```typescript
export default defineCommand({
  meta: { name: "chat", description: "Interactive chat with your AI agent" },
  args: {
    session: { type: "string", description: "Session ID to resume" },
    model: { type: "string", description: "Override model" },
  },
  async run({ args }) {
    const ws = await connectToGateway();

    // Create or resume session
    const session = args.session
      ? await ws.rpc("session.get", { id: args.session })
      : await ws.rpc("session.create", {});

    console.log(`Session: ${session.id}\n`);

    // Listen for streaming responses
    ws.on("session.stream", (params) => {
      if (params.type === "text") {
        process.stdout.write(params.data);
      } else if (params.type === "tool_start") {
        process.stdout.write(`\n[Tool: ${params.data.name}]\n`);
      } else if (params.type === "end") {
        process.stdout.write("\n\n");
        showPrompt();
      }
    });

    // REPL loop
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    function showPrompt() {
      rl.question("you> ", async (input) => {
        if (!input.trim()) return showPrompt();
        if (input === "/quit" || input === "/exit") {
          ws.close();
          process.exit(0);
        }

        await ws.rpc("session.send", { sessionId: session.id, message: input });
      });
    }

    showPrompt();
  },
});
```

### 8.2 — Web Control UI

Lightweight web UI using **Lit** web components, served by the Gateway.

**Files:**

```
packages/web/
  ├── package.json
  ├── tsconfig.json
  └── src/
      ├── index.html             # SPA entry
      ├── app.ts                 # Main app component
      ├── components/
      │   ├── chat-view.ts       # Chat interface
      │   ├── session-list.ts    # Session browser
      │   ├── status-bar.ts      # Gateway status
      │   ├── config-panel.ts    # Config viewer/editor
      │   └── message-bubble.ts  # Individual message
      ├── services/
      │   └── ws-client.ts       # WebSocket client
      └── styles/
          └── theme.css          # CSS custom properties
```

**Main app component:**

```typescript
import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";

@customElement("oc-app")
class App extends LitElement {
  @state() private view: "chat" | "sessions" | "config" | "status" = "chat";
  @state() private connected = false;

  static styles = css`
    :host {
      display: grid;
      grid-template-columns: 240px 1fr;
      grid-template-rows: 48px 1fr;
      height: 100vh;
      font-family: system-ui, -apple-system, sans-serif;
      --bg: #0d1117;
      --surface: #161b22;
      --border: #30363d;
      --text: #c9d1d9;
      --accent: #58a6ff;
      color: var(--text);
      background: var(--bg);
    }
    nav { grid-column: 1; grid-row: 1 / -1; background: var(--surface); border-right: 1px solid var(--border); padding: 1rem; }
    header { grid-column: 2; border-bottom: 1px solid var(--border); display: flex; align-items: center; padding: 0 1rem; }
    main { grid-column: 2; overflow: auto; }
  `;

  render() {
    return html`
      <nav>
        <h2>OpenClaw</h2>
        <ul>
          <li @click=${() => this.view = "chat"}>Chat</li>
          <li @click=${() => this.view = "sessions"}>Sessions</li>
          <li @click=${() => this.view = "config"}>Config</li>
          <li @click=${() => this.view = "status"}>Status</li>
        </ul>
      </nav>
      <header>
        <span>${this.connected ? "Connected" : "Disconnected"}</span>
      </header>
      <main>
        ${this.renderView()}
      </main>
    `;
  }

  private renderView() {
    switch (this.view) {
      case "chat": return html`<oc-chat-view></oc-chat-view>`;
      case "sessions": return html`<oc-session-list></oc-session-list>`;
      case "config": return html`<oc-config-panel></oc-config-panel>`;
      case "status": return html`<oc-status-bar></oc-status-bar>`;
    }
  }
}
```

**Serve the web UI from the Gateway:**

```typescript
// In gateway HTTP routes:
app.get("/", (c) => c.html(indexHtml));
app.get("/assets/*", serveStatic({ root: "./packages/web/dist" }));
```

### 8.3 — Daemon Management

**macOS (launchd):**

```typescript
async function installLaunchdDaemon(): Promise<void> {
  const plistPath = resolve(homedir(), "Library/LaunchAgents/com.openclaw-clone.daemon.plist");
  const nodePath = process.execPath;
  const scriptPath = resolve(__dirname, "../gateway/src/index.ts");

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.openclaw-clone.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>--import</string>
    <string>tsx</string>
    <string>${scriptPath}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${homedir()}/.openclaw-clone/logs/stdout.log</string>
  <key>StandardErrorPath</key>
  <string>${homedir()}/.openclaw-clone/logs/stderr.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
  </dict>
</dict>
</plist>`;

  await writeFile(plistPath, plist);
  execSync(`launchctl load ${plistPath}`);
}
```

**Linux (systemd):**

```typescript
async function installSystemdService(): Promise<void> {
  const servicePath = resolve(homedir(), ".config/systemd/user/openclaw-clone.service");

  const unit = `[Unit]
Description=OpenClaw Clone AI Agent Daemon
After=network.target

[Service]
Type=simple
ExecStart=${process.execPath} --import tsx ${resolve(__dirname, "../gateway/src/index.ts")}
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=default.target`;

  await mkdir(dirname(servicePath), { recursive: true });
  await writeFile(servicePath, unit);
  execSync("systemctl --user daemon-reload");
  execSync("systemctl --user enable openclaw-clone");
  execSync("systemctl --user start openclaw-clone");
}
```

### 8.4 — Docker Deployment

**Dockerfile:**

```dockerfile
FROM node:22-slim AS base
RUN corepack enable pnpm

WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/ ./packages/

RUN pnpm install --frozen-lockfile --prod

FROM node:22-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ripgrep \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=base /app /app

# Create non-root user
RUN useradd -m -s /bin/bash oclaw
USER oclaw

# Data volume
VOLUME ["/home/oclaw/.openclaw-clone"]

EXPOSE 18789

HEALTHCHECK --interval=30s --timeout=5s \
  CMD curl -f http://localhost:18789/health || exit 1

CMD ["node", "--import", "tsx", "packages/gateway/src/index.ts"]
```

**docker-compose.yml:**

```yaml
version: "3.8"
services:
  openclaw-clone:
    build: .
    ports:
      - "127.0.0.1:18789:18789"
    volumes:
      - ./data:/home/oclaw/.openclaw-clone
      - ./workspace:/home/oclaw/workspace
    environment:
      - NODE_ENV=production
    restart: unless-stopped
    mem_limit: 512m
    cpus: 1.0

  # Optional: Caddy reverse proxy for HTTPS
  caddy:
    image: caddy:2
    ports:
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
    depends_on:
      - openclaw-clone
```

**Caddyfile (for secure remote access):**

```
your-domain.com {
  reverse_proxy openclaw-clone:18789
  basicauth {
    admin $2a$14$... # bcrypt hash
  }
}
```

### 8.5 — Production Hardening Checklist

```markdown
## Security Checklist

- [ ] Gateway binds to 127.0.0.1 (not 0.0.0.0)
- [ ] Auth token enabled in config
- [ ] Exec approvals set to "allowlist" mode
- [ ] Non-root user in Docker
- [ ] TLS via reverse proxy (Caddy/nginx)
- [ ] API keys stored in environment variables, not config files
- [ ] Firewall rules (UFW) block all except 443
- [ ] Log rotation configured
- [ ] Memory limits set in Docker
```

---

## Testing Strategy

Key test scenarios:
- CLI commands connect to Gateway and return results
- Onboard wizard creates valid config and memory files
- Chat REPL sends/receives messages via WebSocket
- Daemon installs correctly on macOS (launchd) and Linux (systemd)
- Docker image builds and runs successfully
- Health check endpoint works
- Web UI loads and connects via WebSocket
- Web UI chat interface sends/receives messages

---

## Checkpoint — You're Done When

- [ ] `oclaw onboard` creates config, memory files, and optionally installs daemon
- [ ] `oclaw chat` provides interactive REPL with streaming responses
- [ ] `oclaw config show` displays current config
- [ ] `oclaw sessions list` shows active sessions
- [ ] `oclaw daemon start/stop/status` manages the background service
- [ ] Web UI at `http://localhost:18789` provides chat + dashboard
- [ ] Docker build succeeds and container runs properly
- [ ] Gateway survives restarts via daemon/Docker restart policy
- [ ] Whole system works end-to-end: CLI chat → Gateway → Agent → LLM → Response

---

## Dependencies (additional)

```json
{
  "dependencies": {
    "citty": "^0.x",
    "@inquirer/prompts": "^7.x",
    "lit": "^3.x",
    "ink": "^5.x",
    "ink-text-input": "^6.x"
  }
}
```

---

## What's Next?

After completing all 8 phases, you have a fully functional OpenClaw clone. Here are natural extensions:

- **More channels**: Signal, Slack, WhatsApp (via Baileys), Matrix
- **Skills system**: Portable, shareable agent behavior packages
- **Browser tool**: Full Playwright-based web automation
- **Voice**: WebRTC-based voice calling with TTS/STT
- **Multi-agent**: Agent-to-agent messaging across sessions
- **Mobile apps**: React Native or SwiftUI companion apps
- **MCP support**: Model Context Protocol server integration
- **Observability**: OpenTelemetry tracing, Prometheus metrics
