# OpenClaw Clone — Requirements & Local Testing Guide

> Functional requirements, non-functional requirements, and a complete guide to testing everything locally for personal use.

---

## Table of Contents

- [1. Functional Requirements (FR)](#1-functional-requirements)
  - [1.1 Gateway & Core Infrastructure](#11-gateway--core-infrastructure)
  - [1.2 Agent Loop & LLM Integration](#12-agent-loop--llm-integration)
  - [1.3 Tools Engine](#13-tools-engine)
  - [1.4 Memory & Persistence](#14-memory--persistence)
  - [1.5 Channels & Messaging](#15-channels--messaging)
  - [1.6 Auto-Reply Pipeline](#16-auto-reply-pipeline)
  - [1.7 Plugin System](#17-plugin-system)
  - [1.8 CLI](#18-cli)
  - [1.9 Web Control UI](#19-web-control-ui)
  - [1.10 Deployment & Daemon](#110-deployment--daemon)
- [2. Non-Functional Requirements (NFR)](#2-non-functional-requirements)
  - [2.1 Performance](#21-performance)
  - [2.2 Security](#22-security)
  - [2.3 Reliability & Availability](#23-reliability--availability)
  - [2.4 Scalability](#24-scalability)
  - [2.5 Maintainability](#25-maintainability)
  - [2.6 Portability](#26-portability)
  - [2.7 Observability](#27-observability)
  - [2.8 Data & Privacy](#28-data--privacy)
  - [2.9 Usability](#29-usability)
  - [2.10 Compatibility](#210-compatibility)
- [3. Local Testing Guide](#3-local-testing-guide)
  - [3.1 Prerequisites](#31-prerequisites)
  - [3.2 Unit Testing](#32-unit-testing)
  - [3.3 Integration Testing](#33-integration-testing)
  - [3.4 End-to-End Testing](#34-end-to-end-testing)
  - [3.5 Manual Testing Playbook](#35-manual-testing-playbook)
  - [3.6 Testing with Local LLMs (Free)](#36-testing-with-local-llms-free)
  - [3.7 Testing Channels Locally](#37-testing-channels-locally)
  - [3.8 Load & Stress Testing](#38-load--stress-testing)
  - [3.9 Security Testing](#39-security-testing)
  - [3.10 CI Pipeline (Local)](#310-ci-pipeline-local)

---

# 1. Functional Requirements

## 1.1 Gateway & Core Infrastructure

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-GW-01 | Gateway boots as a single long-lived process on a configurable port (default 18789) | P0 | Process starts, logs port, accepts connections |
| FR-GW-02 | Gateway exposes a WebSocket server supporting JSON-RPC 2.0 protocol | P0 | Client connects via WS, sends JSON-RPC request, receives valid response |
| FR-GW-03 | Gateway exposes an HTTP server (Hono) with RESTful endpoints | P0 | `GET /health` returns `200 OK` with uptime and version |
| FR-GW-04 | WebSocket connections have lifecycle management (connect, authenticate, disconnect) | P0 | Connections tracked in-memory; disconnects clean up resources |
| FR-GW-05 | Gateway supports broadcasting JSON-RPC notifications to connected clients | P1 | All connected WS clients receive notification when broadcast is called |
| FR-GW-06 | Gateway performs graceful shutdown (drain connections, flush state) | P1 | SIGTERM/SIGINT triggers orderly shutdown; no data loss |
| FR-GW-07 | Gateway validates all inbound JSON-RPC requests against schema | P1 | Malformed requests return JSON-RPC error code -32600 (Invalid Request) |
| FR-GW-08 | Config loads from JSON5 file(s) at `~/.openclaw-clone/config.json5` and `./config.json5` | P0 | Config merges: defaults → global → workspace → env vars |
| FR-GW-09 | Config is validated at load time using Zod schemas | P0 | Invalid config halts boot with descriptive error message |
| FR-GW-10 | Config file changes are detected and hot-reloaded without restart | P1 | File change triggers re-validation and config swap; connected clients notified |
| FR-GW-11 | Gateway supports optional token-based authentication | P1 | When `auth.enabled = true`, unauthenticated RPC calls are rejected |

### Session Management

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-SS-01 | Sessions can be created via `session.create` RPC | P0 | Returns session ID and metadata |
| FR-SS-02 | Sessions can be listed via `session.list` RPC | P0 | Returns array of session summaries with pagination |
| FR-SS-03 | Sessions can be retrieved by ID via `session.get` RPC | P0 | Returns full session including message history |
| FR-SS-04 | Messages can be sent to a session via `session.send` RPC | P0 | Message is appended to session; agent loop triggered |
| FR-SS-05 | Sessions can be reset/cleared via `session.reset` RPC or `/reset` command | P1 | Session messages are cleared; new system prompt loaded |
| FR-SS-06 | Sessions can be deleted via `session.delete` RPC | P2 | Session and messages removed from store |
| FR-SS-07 | Sessions are mapped to channel conversations (one session per conversation) | P0 | Same Telegram chat always resolves to the same session |
| FR-SS-08 | Inactive sessions are auto-archived after configurable timeout | P2 | Sessions idle > N hours moved to archive; recoverable |

---

## 1.2 Agent Loop & LLM Integration

### LLM Providers

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-LLM-01 | System supports Anthropic Claude as an LLM provider | P0 | Agent can chat with Claude; tool calling works |
| FR-LLM-02 | System supports OpenAI (GPT-4o, etc.) as an LLM provider | P0 | Agent can chat with GPT models; tool calling works |
| FR-LLM-03 | System supports Ollama for local model inference | P0 | Agent works with locally running Ollama models |
| FR-LLM-04 | System supports OpenRouter as a provider gateway | P1 | Any OpenRouter-supported model can be used |
| FR-LLM-05 | System supports DeepSeek as an LLM provider | P2 | Agent can use DeepSeek models |
| FR-LLM-06 | Provider can be switched at runtime via config change or `/model` command | P1 | No restart needed; next agent turn uses new provider |
| FR-LLM-07 | Provider abstraction uses a common interface; new providers are addable without modifying core | P0 | Adding a provider = implementing `LlmProvider` interface + registering |
| FR-LLM-08 | API keys are loaded from config or environment variables | P0 | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc. respected |

### Agent Loop

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-AG-01 | Agent executes Think → Plan → Act → Observe → Iterate cycle | P0 | Agent reasons, calls tools, reads results, continues until done |
| FR-AG-02 | Agent loop terminates on final text response (stop_reason = "end") | P0 | Text response is emitted to client; loop exits |
| FR-AG-03 | Agent loop terminates when max iteration limit is reached (default: 25) | P0 | After 25 tool-use rounds, loop stops with a message |
| FR-AG-04 | Agent loop terminates when token budget is exhausted | P0 | Budget exceeded triggers compaction or graceful stop |
| FR-AG-05 | Agent loop can be aborted mid-execution via `/stop` command | P1 | Running agent loop receives abort signal; stops cleanly |
| FR-AG-06 | Responses are streamed token-by-token to the client via WS notifications | P0 | Client receives `session.stream` events with text deltas in real-time |
| FR-AG-07 | Tool call events are streamed to the client (tool start, tool result) | P1 | Client sees which tools are being called and their results |
| FR-AG-08 | Context is assembled from: system prompt (AGENTS.md + SOUL.md) + memory + session history + tool definitions | P0 | All context sources are merged in correct order |
| FR-AG-09 | Token usage is tracked per-turn and accumulated per-session | P1 | Usage stats available via `session.get` response |
| FR-AG-10 | Context compaction triggers when token count exceeds soft threshold (80% of max) | P1 | Older messages are summarized; context shrinks below threshold |
| FR-AG-11 | Memory flush runs before context compaction (extract durable facts to MEMORY.md) | P1 | Important context is preserved in MEMORY.md before being compacted |

---

## 1.3 Tools Engine

### Tool Registry & Execution

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-TL-01 | Tools are defined with name, description, Zod input schema, and group | P0 | Tool definitions are type-safe and self-documenting |
| FR-TL-02 | Tool registry converts Zod schemas to JSON Schema for LLM function calling | P0 | Generated schemas are accepted by Anthropic/OpenAI APIs |
| FR-TL-03 | Tool inputs are validated against their Zod schema before execution | P0 | Invalid inputs return validation error without executing tool |
| FR-TL-04 | Tool execution is wrapped with configurable timeout (default: 5 min) | P0 | Long-running tools are killed after timeout |
| FR-TL-05 | Tool output is captured (stdout + stderr for shell tools; return value for others) | P0 | Output is truncated to max length (default: 20KB) and returned to agent |
| FR-TL-06 | Tool execution duration is tracked and returned with results | P2 | `durationMs` field present in every tool result |

### Built-in Tools

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-TL-10 | `exec` tool runs shell commands in the workspace | P0 | `exec({ command: "ls -la" })` returns directory listing |
| FR-TL-11 | `exec` tool supports foreground (blocking) and background execution | P1 | Background commands return immediately with a process ID |
| FR-TL-12 | `exec` tool respects working directory configuration | P0 | Commands run in specified `workdir`, not gateway CWD |
| FR-TL-13 | `file_read` tool reads file contents with optional line range | P0 | Returns file content; supports `startLine`/`endLine` params |
| FR-TL-14 | `file_write` tool creates/overwrites files | P0 | Creates parent directories if needed; writes content |
| FR-TL-15 | `file_search` tool finds files by glob pattern or content grep | P1 | `glob("**/*.ts")` and `grep("TODO")` both work |
| FR-TL-16 | `http_fetch` tool makes HTTP requests (GET, POST, PUT, DELETE) | P1 | Returns status code + response body (truncated) |
| FR-TL-17 | `memory_get` tool reads specific memory files (MEMORY.md, SOUL.md, daily logs) | P0 | Agent can read its own memory files |
| FR-TL-18 | `memory_search` tool performs semantic search over memory | P1 | Returns top-K relevant memory chunks with similarity scores |
| FR-TL-19 | `browser` tool performs basic web automation via Playwright | P2 | Navigate to URL, screenshot, extract text |

### Security & Policy Engine

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-TL-30 | Tool policy supports allow/deny lists per agent | P0 | Agent with `deny: ["exec"]` cannot run shell commands |
| FR-TL-31 | Tool policy supports group-level allow/deny (`group:runtime`, `group:fs`) | P1 | Denying group:runtime blocks exec + all runtime tools |
| FR-TL-32 | Deny rules always override allow rules | P0 | If tool is in both allow and deny, it's denied |
| FR-TL-33 | Exec approvals support 3 modes: `full`, `allowlist`, `deny` | P0 | `allowlist` mode only permits commands matching glob patterns |
| FR-TL-34 | Exec approvals use glob pattern matching for commands | P1 | Pattern `git *` allows `git status` but blocks `rm -rf` |
| FR-TL-35 | File tools block path traversal outside workspace | P0 | `file_read({ path: "../../etc/passwd" })` returns error |
| FR-TL-36 | Exec tool rejects `env.PATH` overrides and loader hijacking | P1 | Commands trying to modify PATH are blocked |

---

## 1.4 Memory & Persistence

### Memory File Store

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-MEM-01 | MEMORY.md stores long-lived curated memories (facts, preferences, decisions) | P0 | Agent can read/append to MEMORY.md |
| FR-MEM-02 | Daily logs are written to `memory/YYYY-MM-DD.md` with append-only semantics | P0 | Each day gets its own file; entries have timestamps |
| FR-MEM-03 | SOUL.md defines agent personality, voice, and values | P0 | Content injected into system prompt at every agent turn |
| FR-MEM-04 | AGENTS.md defines behavioral instructions and workflow rules | P0 | Content injected into system prompt at every agent turn |
| FR-MEM-05 | USER.md stores user preferences and profile info | P1 | Agent can reference user preferences from this file |
| FR-MEM-06 | Memory files are watched for external changes and re-indexed | P1 | Editing MEMORY.md in vim triggers re-indexing within 1s |

### Vector Search

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-MEM-10 | Memory files are chunked by markdown sections (## headings) | P0 | Each section becomes a searchable chunk |
| FR-MEM-11 | Chunks are embedded using a configurable embedding provider | P0 | Supports Ollama (local), Voyage AI, or TF-IDF fallback |
| FR-MEM-12 | Embeddings are stored in SQLite with source tracking | P0 | Chunks are queryable; re-indexing replaces old embeddings per-source |
| FR-MEM-13 | Semantic search returns top-K results ranked by cosine similarity | P0 | `memory_search("user's preferred language")` returns relevant chunks |
| FR-MEM-14 | Search results include source file, line range, and similarity score | P1 | Agent knows where the memory came from |

### Session Persistence

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-MEM-20 | Sessions are persisted to SQLite | P0 | Gateway restart recovers all previous sessions |
| FR-MEM-21 | Session messages are stored with full metadata (role, timestamp, tool calls) | P0 | Restored sessions have complete history |
| FR-MEM-22 | Session listing supports pagination and sorting by last active | P1 | `session.list({ limit: 20, offset: 0 })` works |

### Compaction

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-MEM-30 | Context compaction triggers at configurable token threshold (default: 80% of max) | P1 | When context hits ~3200/4096 tokens, compaction runs |
| FR-MEM-31 | Compaction summarizes older messages while keeping the last N recent | P1 | Older messages replaced with summary; recent messages intact |
| FR-MEM-32 | Memory flush extracts durable facts to MEMORY.md before compaction | P1 | Important context survives compaction via durable memory |

---

## 1.5 Channels & Messaging

### Channel Abstraction

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-CH-01 | All channels implement a unified `ChannelAdapter` interface | P0 | `connect()`, `disconnect()`, `sendMessage()`, `editMessage()`, `deleteMessage()`, `onMessage` |
| FR-CH-02 | Inbound messages are normalized to a platform-agnostic `ChannelMessage` format | P0 | Telegram and Discord messages have identical structure after normalization |
| FR-CH-03 | Outbound messages are formatted for target platform (Markdown → Telegram HTML, Discord MD) | P0 | Bold, italic, code blocks render correctly on each platform |
| FR-CH-04 | Multiple channels can run simultaneously | P0 | Telegram + Discord + WebChat all active at the same time |
| FR-CH-05 | Channel status is queryable via `gateway.status` RPC | P1 | Returns per-channel connected/disconnected/error status |
| FR-CH-06 | Channels reconnect automatically on transient failures | P1 | Network blip triggers reconnect with exponential backoff |

### Telegram Adapter

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-CH-10 | Telegram bot receives text messages via long polling | P0 | Message from Telegram user triggers agent response |
| FR-CH-11 | Telegram bot sends formatted responses (HTML parse mode) | P0 | Bold, italic, code blocks render in Telegram |
| FR-CH-12 | Telegram bot supports reply threading | P1 | Bot responds as a reply to the user's message |
| FR-CH-13 | Telegram bot handles photo/file attachments (pass metadata to agent) | P2 | Agent sees attachment info; can describe or process it |
| FR-CH-14 | Telegram bot splits messages exceeding 4096 char limit | P0 | Long responses are sent as multiple messages |

### Discord Adapter

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-CH-20 | Discord bot receives DM and guild text messages | P0 | Messages from Discord users trigger agent response |
| FR-CH-21 | Discord bot sends markdown-formatted responses | P0 | Code blocks, bold, italic render in Discord |
| FR-CH-22 | Discord bot supports message editing (update response) | P2 | Bot can edit its previous message |
| FR-CH-23 | Discord bot splits messages exceeding 2000 char limit | P0 | Long responses are split at paragraph boundaries |

### WebChat Adapter

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-CH-30 | Built-in WebChat channel operates over Gateway WebSocket | P0 | CLI and Web UI use this channel |
| FR-CH-31 | WebChat supports real-time streaming (token-by-token) | P0 | Text appears incrementally as LLM generates it |

### Access Control

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-CH-40 | DM policy supports 3 modes: `open`, `allowlist`, `pairing` | P0 | `allowlist` mode only accepts messages from listed user IDs |
| FR-CH-41 | Group policy supports mention-required mode | P1 | Bot only responds in groups when @mentioned |
| FR-CH-42 | Per-channel rate limiting (messages per minute per user) | P1 | Excessive messages are silently dropped |

---

## 1.6 Auto-Reply Pipeline

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-PL-01 | Pipeline processes messages through 7 stages in order: ingestion → auth → debounce → session → command → agent → streaming | P0 | Each stage runs sequentially; context is passed through |
| FR-PL-02 | Stage 1 (Ingestion): rejects empty messages, normalizes whitespace | P0 | Empty messages never reach the agent |
| FR-PL-03 | Stage 2 (Authorization): checks DM/group policy and rate limits | P0 | Unauthorized users are blocked; rate-limited users are throttled |
| FR-PL-04 | Stage 3 (Debouncing): batches messages sent within 300ms window | P1 | 3 rapid messages are combined into one agent request |
| FR-PL-05 | Stage 4 (Session Resolution): finds or creates session for the conversation | P0 | Same conversation ID always maps to same session |
| FR-PL-06 | Stage 5 (Command Detection): detects `/slash` commands and routes to handler | P0 | `/help` returns command list; `/reset` clears session |
| FR-PL-07 | Stage 6 (Agent Dispatch): runs the agent loop for non-command messages | P0 | Natural language messages trigger full agent loop |
| FR-PL-08 | Stage 7 (Block Streaming): sends response back to source channel | P0 | Response appears in Telegram/Discord/WebChat |
| FR-PL-09 | Pipeline aborts early if any stage sets `aborted = true` | P0 | Auth failure stops processing; no agent invocation |
| FR-PL-10 | Pipeline is extensible — plugins can add stages | P1 | Custom stage can be inserted before/after existing stages |

### Built-in Slash Commands

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-CMD-01 | `/help` lists all available commands | P0 | Returns formatted list of commands with descriptions |
| FR-CMD-02 | `/reset` (aliases: `/new`, `/clear`) resets the current session | P0 | Session messages cleared; fresh start |
| FR-CMD-03 | `/status` shows gateway info (uptime, channels, sessions) | P1 | Returns formatted status report |
| FR-CMD-04 | `/model [name]` switches the LLM model | P1 | Next agent turn uses specified model |
| FR-CMD-05 | `/memory [query]` searches memory semantically | P1 | Returns top matching memory chunks |
| FR-CMD-06 | `/stop` aborts the currently running agent loop | P1 | Running agent receives abort signal; responds with cancellation notice |

---

## 1.7 Plugin System

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-PG-01 | Plugins are TypeScript modules loaded dynamically at runtime (via jiti) | P0 | `.ts` plugin files are loaded without pre-compilation |
| FR-PG-02 | Plugins require an `openclaw.plugin.json` manifest | P0 | Manifest declares id, name, version, capabilities, configSchema |
| FR-PG-03 | Plugin discovery searches: config paths → workspace extensions → global extensions | P0 | Plugins found in `~/.openclaw-clone/extensions/` are loaded |
| FR-PG-04 | Plugins load in dependency order (topological sort) | P1 | Plugin A depending on Plugin B loads after B |
| FR-PG-05 | Plugin lifecycle: load → init → start → stop → unload | P0 | Each method called in order; errors don't crash gateway |
| FR-PG-06 | Plugins can register: tools, commands, HTTP routes, RPC methods, hooks, services, pipeline stages | P0 | All extension points are accessible via `PluginApi` |
| FR-PG-07 | Plugins receive a scoped `PluginApi` with access to runtime helpers | P0 | `api.runtime.config`, `api.runtime.sessions`, etc. available |
| FR-PG-08 | Plugins can be enabled/disabled via config without uninstalling | P1 | `plugins.enabled: ["cron-scheduler"]` controls which are active |
| FR-PG-09 | Plugin errors are caught and logged; they never crash the gateway | P0 | Bad plugin = error log + plugin status "error"; gateway keeps running |
| FR-PG-10 | Hook system supports typed events with priority ordering | P0 | Higher priority hooks fire first; hooks can modify mutable data |
| FR-PG-11 | Standard hook events include: `gateway:startup`, `session:created`, `session:reset`, `agent:before_run`, `agent:after_run`, `memory:flush` | P1 | Plugins can listen to any of these lifecycle events |

---

## 1.8 CLI

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-CLI-01 | CLI binary named `oclaw` with subcommand structure | P0 | `oclaw --help` shows available commands |
| FR-CLI-02 | `oclaw onboard` runs first-time setup wizard (provider, API key, model selection) | P0 | Wizard creates config.json5 + memory files + optional daemon install |
| FR-CLI-03 | `oclaw chat` starts interactive REPL with streaming responses | P0 | User types messages; agent responses stream token-by-token |
| FR-CLI-04 | `oclaw chat --session <id>` resumes an existing session | P1 | Previous conversation context is preserved |
| FR-CLI-05 | `oclaw config show` displays current configuration (API keys redacted) | P1 | Sensitive values shown as `***` |
| FR-CLI-06 | `oclaw config set <key> <value>` updates config | P2 | Writes to config.json5; triggers hot reload |
| FR-CLI-07 | `oclaw sessions list` shows active sessions | P1 | Tabular output with ID, channel, last active, message count |
| FR-CLI-08 | `oclaw memory search "<query>"` performs semantic search | P1 | Returns matching memory chunks with scores |
| FR-CLI-09 | `oclaw memory status` shows memory index health | P2 | Reports file count, chunk count, last indexed time |
| FR-CLI-10 | `oclaw channels status` shows connected channels | P1 | Per-channel status (connected/disconnected/error) |
| FR-CLI-11 | `oclaw plugins list` shows installed plugins and status | P1 | Plugin ID, version, status (running/stopped/error) |
| FR-CLI-12 | `oclaw daemon start/stop/status` manages background service | P0 | Start/stop the gateway as a background process |
| FR-CLI-13 | `oclaw daemon install` installs as launchd (macOS) or systemd (Linux) service | P1 | Daemon auto-starts on boot |
| FR-CLI-14 | CLI connects to Gateway via WebSocket client | P0 | All CLI commands work by sending JSON-RPC to the running Gateway |

---

## 1.9 Web Control UI

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-WEB-01 | Web UI served by Gateway at `http://localhost:18789` | P1 | Browser loads SPA from gateway HTTP server |
| FR-WEB-02 | Chat interface with message input and streaming response display | P1 | User can chat with agent; responses appear token-by-token |
| FR-WEB-03 | Session browser (list, select, delete sessions) | P2 | Click a session to view/resume its conversation |
| FR-WEB-04 | Gateway status dashboard (uptime, channels, plugins, sessions) | P2 | Real-time status via WebSocket subscription |
| FR-WEB-05 | Config viewer (read-only display of current config, keys redacted) | P2 | Shows current config in formatted view |
| FR-WEB-06 | Built with Lit web components (<50KB bundle) | P1 | Fast load; no heavy framework overhead |
| FR-WEB-07 | Dark mode by default with system-UI fonts | P2 | Looks native; minimal visual overhead |

---

## 1.10 Deployment & Daemon

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-DEP-01 | Docker image builds from Dockerfile with multi-stage build | P1 | `docker build -t oclaw .` succeeds; image < 300MB |
| FR-DEP-02 | docker-compose.yml provides one-command deployment | P1 | `docker compose up -d` starts the full system |
| FR-DEP-03 | Docker container runs as non-root user | P0 | Container user is not `root` |
| FR-DEP-04 | Docker supports persistent volumes for config and memory | P0 | Data survives `docker compose down && docker compose up` |
| FR-DEP-05 | Health check endpoint works in Docker | P1 | `HEALTHCHECK` in Dockerfile; container shows "healthy" |
| FR-DEP-06 | Caddy reverse proxy config provided for HTTPS + auth | P2 | Remote access via `https://your-domain.com` with basic auth |
| FR-DEP-07 | launchd plist installs on macOS for auto-start | P1 | `oclaw daemon install` creates and loads LaunchAgent |
| FR-DEP-08 | systemd unit installs on Linux for auto-start | P1 | `oclaw daemon install` creates and enables user service |
| FR-DEP-09 | Log output goes to file (rotatable) and stdout | P1 | Logs at `~/.openclaw-clone/logs/` with date rotation |

---

# 2. Non-Functional Requirements

## 2.1 Performance

| ID | Requirement | Target | Rationale |
|----|-------------|--------|-----------|
| NFR-PERF-01 | Gateway boot time | < 2 seconds | Fast iteration during development |
| NFR-PERF-02 | First token latency (time from user message to first streamed token) | < 500ms + LLM latency | Gateway overhead should be negligible vs. LLM round-trip |
| NFR-PERF-03 | JSON-RPC request round-trip (non-agent, e.g., `session.list`) | < 50ms | Config/session queries should be instant |
| NFR-PERF-04 | Memory semantic search latency | < 200ms for 10K chunks | Local vector search must be fast |
| NFR-PERF-05 | Config hot-reload time | < 500ms from file save to applied | Changes should feel instant |
| NFR-PERF-06 | Gateway idle memory usage | < 100MB RSS | Lightweight enough for a Raspberry Pi or $5 VPS |
| NFR-PERF-07 | Gateway memory under load (10 active sessions) | < 250MB RSS | Stays comfortable on 512MB–1GB VMs |
| NFR-PERF-08 | Tool execution overhead (excluding tool's own work) | < 10ms | Registry lookup + validation + policy check should be trivial |
| NFR-PERF-09 | Plugin loading time (per plugin) | < 200ms | jiti compilation should be fast for small plugins |
| NFR-PERF-10 | WebSocket message throughput | > 1000 msg/sec per connection | Streaming tokens at max LLM speed should never bottleneck |

## 2.2 Security

| ID | Requirement | Target | Rationale |
|----|-------------|--------|-----------|
| NFR-SEC-01 | Gateway binds to `127.0.0.1` by default | Config-enforced | Never accidentally exposed to the internet |
| NFR-SEC-02 | API keys never appear in logs, error messages, or RPC responses | Zero leakage | Keys are redacted in all output |
| NFR-SEC-03 | File tools cannot read/write outside workspace directory | Path traversal blocked | `../../etc/passwd` always rejected |
| NFR-SEC-04 | Exec tool rejects PATH/LD_PRELOAD manipulation | Env hijack blocked | Commands cannot override loader or PATH |
| NFR-SEC-05 | All user input is sanitized before shell execution | Injection mitigated | No raw string interpolation into shell commands |
| NFR-SEC-06 | Docker container runs as non-root user with minimal capabilities | Principle of least privilege | Container compromise limits blast radius |
| NFR-SEC-07 | Auth tokens are constant-time compared | Timing attack resistant | Use `crypto.timingSafeEqual` for token comparison |
| NFR-SEC-08 | Config files with API keys have restricted file permissions | `0600` on sensitive files | Other users on the system cannot read keys |
| NFR-SEC-09 | Tool policy deny list is immutable at runtime (only config changes it) | No policy bypass | Agent cannot modify its own policy |
| NFR-SEC-10 | WebSocket connections have max message size limit | 1MB default | Prevents memory exhaustion from malicious payloads |

## 2.3 Reliability & Availability

| ID | Requirement | Target | Rationale |
|----|-------------|--------|-----------|
| NFR-REL-01 | Gateway survives individual agent loop failures | Process stays up | One bad LLM response doesn't crash the gateway |
| NFR-REL-02 | Gateway survives individual plugin failures | Process stays up | Bad plugin = error log + disabled; gateway continues |
| NFR-REL-03 | Gateway survives channel disconnections | Automatic reconnect | Telegram API blip triggers reconnect with backoff |
| NFR-REL-04 | Session data survives gateway restart | SQLite persistence | All sessions and messages are recovered |
| NFR-REL-05 | Memory index survives restart | SQLite persistence | Vector store is persisted; re-indexing only on file changes |
| NFR-REL-06 | Daemon auto-restarts on crash | launchd/systemd restart policy | `KeepAlive: true` / `Restart: always` |
| NFR-REL-07 | Graceful shutdown completes within 10 seconds | Drain timeout | Active agent loops are aborted; connections closed cleanly |
| NFR-REL-08 | LLM provider failover on 5xx errors | Retry with backoff | 3 retries with exponential backoff before failing |

## 2.4 Scalability

| ID | Requirement | Target | Rationale |
|----|-------------|--------|-----------|
| NFR-SCL-01 | Concurrent active sessions | 10–50 | Personal use; not multi-tenant |
| NFR-SCL-02 | Simultaneous channels | 5+ | Telegram + Discord + WebChat + Slack + CLI |
| NFR-SCL-03 | Memory file size for vector search | Up to 50MB total (across all .md files) | 1-2 years of daily notes + MEMORY.md |
| NFR-SCL-04 | Installed plugins | 20+ | Don't degrade boot time significantly |
| NFR-SCL-05 | Session message history | 10,000+ messages per session (with compaction) | Long-running projects with lots of back-and-forth |

## 2.5 Maintainability

| ID | Requirement | Target | Rationale |
|----|-------------|--------|-----------|
| NFR-MNT-01 | Monorepo with clear package boundaries | Each package has single responsibility | Easy to navigate, test, and modify independently |
| NFR-MNT-02 | TypeScript strict mode across all packages | `strict: true` in all tsconfigs | Catch bugs at compile time |
| NFR-MNT-03 | Minimum 70% unit test coverage on core packages (agent, tools, memory, pipeline) | Vitest coverage reports | Confidence in refactoring |
| NFR-MNT-04 | Consistent code style enforced by Biome | Zero lint warnings in CI | No style debates |
| NFR-MNT-05 | All public APIs have TSDoc comments | Documented interfaces | IDE auto-complete shows descriptions |
| NFR-MNT-06 | Dependency count minimized | < 30 direct production deps total | Reduce supply chain risk and audit burden |

## 2.6 Portability

| ID | Requirement | Target | Rationale |
|----|-------------|--------|-----------|
| NFR-PRT-01 | Runs on macOS (ARM64 + x64) | Primary dev target | Developer's machine |
| NFR-PRT-02 | Runs on Linux (x64 + ARM64) | VM/VPS/Raspberry Pi | Cheap deployment targets |
| NFR-PRT-03 | Runs on Windows via WSL2 | WSL2 Ubuntu | Windows devs can use it |
| NFR-PRT-04 | Docker image is multi-arch (amd64 + arm64) | `docker buildx` | Run on any cloud VM or Raspberry Pi |
| NFR-PRT-05 | No native binary dependencies except better-sqlite3 | Pre-built binaries available | `pnpm install` just works on all platforms |

## 2.7 Observability

| ID | Requirement | Target | Rationale |
|----|-------------|--------|-----------|
| NFR-OBS-01 | Structured JSON logging via pino | Every log has timestamp, level, context | Parseable by log tools |
| NFR-OBS-02 | Log levels: trace, debug, info, warn, error, fatal | Configurable at runtime | Adjust verbosity without restart |
| NFR-OBS-03 | Agent loop logs: iteration count, tool calls, token usage, duration | Per-turn metrics | Debug agent behavior |
| NFR-OBS-04 | Health endpoint returns: uptime, version, active sessions, channel statuses, memory stats | `GET /health` | Quick system check |
| NFR-OBS-05 | Error logs include stack traces and context (session ID, channel, tool name) | Structured error objects | Fast debugging |

## 2.8 Data & Privacy

| ID | Requirement | Target | Rationale |
|----|-------------|--------|-----------|
| NFR-DAT-01 | All data stored locally (no cloud telemetry, no phone-home) | Zero external data transmission | Personal use; data sovereignty |
| NFR-DAT-02 | Session history is stored in local SQLite only | `~/.openclaw-clone/data/sessions.db` | You own your data |
| NFR-DAT-03 | Memory files are plain Markdown (human-readable, editable, git-trackable) | No proprietary formats | You can read/edit/backup with any text editor |
| NFR-DAT-04 | API keys are the only data sent externally (to LLM providers) | By design | LLM calls are the only network traffic |
| NFR-DAT-05 | Data deletion: `oclaw sessions delete --all` removes all session data | Complete wipeability | User can nuke history at any time |

## 2.9 Usability

| ID | Requirement | Target | Rationale |
|----|-------------|--------|-----------|
| NFR-USE-01 | First-time setup completes in < 3 minutes via `oclaw onboard` | Interactive wizard | Low barrier to entry |
| NFR-USE-02 | System works with zero config if Ollama is running locally | Auto-detect local Ollama | Free, no API keys needed |
| NFR-USE-03 | CLI provides helpful error messages with suggested fixes | Human-readable errors | Don't just crash with stack traces |
| NFR-USE-04 | Config file is JSON5 with comments explaining each field | Self-documenting config | No need to read docs for basic config |
| NFR-USE-05 | All CLI commands support `--help` with examples | Consistent help output | `oclaw chat --help` shows usage |

## 2.10 Compatibility

| ID | Requirement | Target | Rationale |
|----|-------------|--------|-----------|
| NFR-CMP-01 | Node.js >= 22.0.0 | Required | Native fetch, WebSocket, top-level await |
| NFR-CMP-02 | pnpm >= 9.0.0 | Required | Workspace protocol support |
| NFR-CMP-03 | TypeScript >= 5.5 | Required | `isolatedDeclarations`, improved inference |
| NFR-CMP-04 | Ollama >= 0.3.0 for local model support | Recommended | Tool calling support in Ollama |
| NFR-CMP-05 | Docker Engine >= 24.0 for containerized deployment | Optional | Multi-stage builds, health checks |
| NFR-CMP-06 | SQLite >= 3.35 (via better-sqlite3) | Bundled | RETURNING clause, math functions |

---

# 3. Local Testing Guide

How to test everything locally for personal use — from unit tests to full end-to-end runs.

## 3.1 Prerequisites

### Required Software

```bash
# Node.js 22+
node --version  # Must be >= 22.0.0
# Install via nvm if needed:
# nvm install 22 && nvm use 22

# pnpm
corepack enable pnpm
pnpm --version  # Must be >= 9.0

# Git (for version control)
git --version
```

### Optional (but recommended)

```bash
# Ollama — free local LLM inference (no API key needed)
# macOS:
brew install ollama
ollama serve &
ollama pull llama3.2        # 2GB, fast on Apple Silicon
ollama pull nomic-embed-text # Embedding model for memory search

# Docker (for containerized testing)
docker --version  # >= 24.0

# ripgrep (used by file_search tool)
brew install ripgrep  # macOS
# apt install ripgrep  # Ubuntu/Debian
```

### LLM Provider Setup

You need **at least one** of these:

| Provider | Cost | Setup |
|----------|------|-------|
| **Ollama (local)** | Free | `ollama serve` + `ollama pull llama3.2` |
| **Anthropic** | Paid | Get key at `console.anthropic.com` → set `ANTHROPIC_API_KEY` |
| **OpenAI** | Paid | Get key at `platform.openai.com` → set `OPENAI_API_KEY` |
| **OpenRouter** | Varies | Get key at `openrouter.ai` → set `OPENROUTER_API_KEY` |

For **learning/testing**, Ollama is ideal — completely free, runs locally, no API keys.

---

## 3.2 Unit Testing

Unit tests validate individual functions and classes in isolation with mocked dependencies.

### Running Tests

```bash
# All unit tests
pnpm test

# Specific package
pnpm --filter @oclaw/gateway test
pnpm --filter @oclaw/agent test
pnpm --filter @oclaw/tools test
pnpm --filter @oclaw/memory test
pnpm --filter @oclaw/pipeline test
pnpm --filter @oclaw/plugins test

# Watch mode (re-run on file changes)
pnpm test -- --watch

# With coverage report
pnpm test -- --coverage
```

### What to Unit Test

| Package | Key Unit Tests | What They Validate |
|---------|---------------|-------------------|
| `config` | Schema validation, defaults, merge logic | Invalid configs rejected; defaults applied correctly |
| `shared` | JSON-RPC serialization, error classes, utilities | Protocol types correct; errors have right codes |
| `gateway` | RPC router dispatch, session manager CRUD | Methods route correctly; sessions have correct lifecycle |
| `agent` | Context assembly, token budget, loop controller | Context includes all sources; budget tracks correctly |
| `tools` | Input validation, policy evaluation, path traversal checks | Invalid inputs rejected; policy engine blocks correctly |
| `memory` | Chunking, cosine similarity math, file store read/write | Chunks have correct boundaries; similarity ranking correct |
| `pipeline` | Each stage in isolation, command parsing | Debouncing batches correctly; commands detected properly |
| `plugins` | Manifest validation, dependency sorting | Invalid manifests rejected; topological sort correct |

### Example: Testing the Policy Engine

```typescript
// packages/tools/test/policy/tool-policy.test.ts
import { describe, it, expect } from "vitest";
import { PolicyEngine } from "../../src/policy/engine";

describe("PolicyEngine", () => {
  it("blocks tools in the deny list", async () => {
    const engine = new PolicyEngine({
      toolPolicy: { deny: ["exec"] },
      execApprovals: { mode: "full", approvals: [] },
    });

    const result = await engine.check(
      { name: "exec", group: "runtime" },
      { command: "ls" },
      mockContext(),
    );

    expect(result.permitted).toBe(false);
    expect(result.reason).toContain("deny list");
  });

  it("allows tools when no policy is set", async () => {
    const engine = new PolicyEngine({
      toolPolicy: {},
      execApprovals: { mode: "full", approvals: [] },
    });

    const result = await engine.check(
      { name: "exec", group: "runtime" },
      { command: "ls" },
      mockContext(),
    );

    expect(result.permitted).toBe(true);
  });
});
```

### Example: Testing Context Assembly (with mocked memory)

```typescript
// packages/agent/test/executor/context.test.ts
import { describe, it, expect, vi } from "vitest";
import { ContextAssembler } from "../../src/executor/context";

describe("ContextAssembler", () => {
  it("includes SOUL.md and AGENTS.md in system prompt", async () => {
    const assembler = new ContextAssembler({
      loadMarkdownFile: vi.fn()
        .mockResolvedValueOnce("Be helpful.")  // AGENTS.md
        .mockResolvedValueOnce("You are kind."), // SOUL.md
      loadMemoryContext: vi.fn().mockResolvedValue(null),
      getToolDefinitions: vi.fn().mockResolvedValue([]),
    });

    const request = await assembler.assemble(mockSession(), mockConfig());

    expect(request.messages[0].content).toContain("Be helpful.");
    expect(request.messages[0].content).toContain("You are kind.");
  });
});
```

---

## 3.3 Integration Testing

Integration tests validate that packages work together correctly.

### Running Integration Tests

```bash
# All integration tests
pnpm test:integration

# Or run specific integration suites
pnpm --filter @oclaw/gateway test -- --grep "integration"
```

### Key Integration Tests

| Test | What It Validates | Dependencies |
|------|-------------------|-------------|
| **Gateway boot → WS connect → RPC round-trip** | Full gateway lifecycle works | None (in-process) |
| **WS → session.send → agent loop → stream events** | Message flow end-to-end | Mocked LLM provider |
| **Agent loop → tool call → tool exec → result → next turn** | Agent-tool integration | Mocked LLM + real tool registry |
| **Memory index → search → results** | Vector pipeline works | SQLite + mocked embeddings |
| **Pipeline stages → full message processing** | All 7 stages work together | Mocked channel + agent |
| **Plugin load → init → register tool → tool available** | Plugin system integration | File-based test plugin |

### Example: Full Gateway Integration Test

```typescript
// packages/gateway/test/integration/gateway.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Gateway } from "../../src/server";
import WebSocket from "ws";

describe("Gateway Integration", () => {
  let gateway: Gateway;
  let ws: WebSocket;

  beforeAll(async () => {
    gateway = new Gateway({ port: 0 }); // Random port
    await gateway.boot();
  });

  afterAll(async () => {
    await gateway.shutdown();
  });

  it("accepts WebSocket connections and responds to RPC", async () => {
    ws = new WebSocket(`ws://localhost:${gateway.port}`);
    await new Promise((resolve) => ws.on("open", resolve));

    const response = await rpcCall(ws, "gateway.status", {});
    expect(response.result).toHaveProperty("uptime");
    expect(response.result).toHaveProperty("sessions");

    ws.close();
  });

  it("creates a session and sends a message", async () => {
    ws = new WebSocket(`ws://localhost:${gateway.port}`);
    await new Promise((resolve) => ws.on("open", resolve));

    const createResult = await rpcCall(ws, "session.create", {});
    expect(createResult.result).toHaveProperty("id");

    const sessionId = createResult.result.id;
    const listResult = await rpcCall(ws, "session.list", {});
    expect(listResult.result).toContainEqual(
      expect.objectContaining({ id: sessionId })
    );

    ws.close();
  });
});

function rpcCall(ws: WebSocket, method: string, params: unknown): Promise<any> {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2);
    ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    ws.on("message", function handler(data) {
      const msg = JSON.parse(data.toString());
      if (msg.id === id) {
        ws.off("message", handler);
        resolve(msg);
      }
    });
  });
}
```

---

## 3.4 End-to-End Testing

E2E tests run the full system as a user would experience it.

### E2E with Ollama (free, no API keys)

```bash
# 1. Start Ollama (if not running)
ollama serve &

# 2. Start the gateway
pnpm dev

# 3. In another terminal, run E2E tests
pnpm test:e2e
```

### E2E Test Scenarios

```typescript
// test/e2e/chat-flow.test.ts
import { describe, it, expect } from "vitest";

describe("E2E: Chat Flow", () => {
  it("sends a message and receives a streamed response", async () => {
    const ws = new WebSocket("ws://localhost:18789");
    await waitForOpen(ws);

    // Create session
    const session = await rpcCall(ws, "session.create", {});

    // Send message and collect stream events
    const events: any[] = [];
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      if (msg.method === "session.stream") events.push(msg.params);
    });

    await rpcCall(ws, "session.send", {
      sessionId: session.result.id,
      message: "What is 2 + 2?",
    });

    // Wait for stream:end event
    await waitFor(() => events.some(e => e.type === "end"), 30_000);

    // Verify we got text events
    const textEvents = events.filter(e => e.type === "text");
    expect(textEvents.length).toBeGreaterThan(0);

    // Verify the full response mentions "4"
    const fullText = textEvents.map(e => e.data).join("");
    expect(fullText).toContain("4");

    ws.close();
  });

  it("executes a tool call (file read)", async () => {
    const ws = new WebSocket("ws://localhost:18789");
    await waitForOpen(ws);

    const session = await rpcCall(ws, "session.create", {});
    const events: any[] = [];
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      if (msg.method === "session.stream") events.push(msg.params);
    });

    await rpcCall(ws, "session.send", {
      sessionId: session.result.id,
      message: "Read the file package.json and tell me the project name.",
    });

    await waitFor(() => events.some(e => e.type === "end"), 60_000);

    // Should have tool_start events (file_read was called)
    const toolEvents = events.filter(e => e.type === "tool_start");
    expect(toolEvents.length).toBeGreaterThan(0);

    ws.close();
  });
});
```

---

## 3.5 Manual Testing Playbook

Step-by-step manual tests for personal validation.

### Test 1: Basic Chat (5 minutes)

```bash
# Terminal 1: Start gateway
pnpm dev

# Terminal 2: Chat via CLI
oclaw chat

# Type these messages and verify responses:
you> Hello, who are you?
# ✓ Agent introduces itself using SOUL.md personality

you> What is the capital of France?
# ✓ Agent responds with "Paris"

you> /help
# ✓ Lists available commands

you> /status
# ✓ Shows gateway info (uptime, channels, sessions)

you> /reset
# ✓ Session cleared; fresh start confirmed

you> /quit
```

### Test 2: Tool Usage (5 minutes)

```bash
oclaw chat

you> List all files in the current directory
# ✓ Agent calls exec tool with "ls -la" (or similar)
# ✓ File listing appears in response

you> Read the contents of package.json
# ✓ Agent calls file_read tool
# ✓ File contents appear in response

you> Create a file called test-output.txt with the text "hello world"
# ✓ Agent calls file_write tool
# ✓ File is created; agent confirms

you> Search for all TypeScript files in the project
# ✓ Agent calls file_search with glob pattern
# ✓ .ts files listed
```

### Test 3: Memory Persistence (5 minutes)

```bash
oclaw chat

you> Remember that my favorite programming language is TypeScript
# ✓ Agent acknowledges and writes to memory

you> /reset
you> What is my favorite programming language?
# ✓ Agent recalls "TypeScript" from memory (via memory_search or MEMORY.md)

# Restart the gateway (Ctrl+C terminal 1, then pnpm dev)
oclaw chat --session <previous-session-id>
# ✓ Previous conversation history is intact (SQLite persistence)
```

### Test 4: Telegram Channel (10 minutes)

```bash
# 1. Create a bot via @BotFather on Telegram → get token
# 2. Add to config.json5:
#    channels: { telegram: { token: "YOUR_TOKEN", enabled: true, dmPolicy: "allowlist", allowedUsers: ["YOUR_USER_ID"] } }
# 3. Restart gateway

# 4. Open Telegram, message your bot:
#    "Hello!"
# ✓ Bot responds via the agent

#    "/status"
# ✓ Bot shows gateway status

#    "What time is it?"
# ✓ Bot responds (may use exec tool to check system time)
```

### Test 5: Concurrent Channels (5 minutes)

```bash
# With Telegram AND Discord both configured:
# 1. Send "Hello" via Telegram
# ✓ Response in Telegram

# 2. Send "Hello" via Discord
# ✓ Response in Discord

# 3. Send "Hello" via CLI
# ✓ Response in CLI

# All three should work simultaneously without interference
```

### Test 6: Security Boundaries (5 minutes)

```bash
oclaw chat

you> Read the file /etc/passwd
# ✓ Agent's file_read tool rejects with "Path traversal denied"

you> Run the command: export PATH=/tmp:$PATH && ls
# ✓ Exec tool blocks PATH manipulation

# With exec approvals set to "deny" mode:
you> Run: ls -la
# ✓ Exec tool blocked by policy
```

---

## 3.6 Testing with Local LLMs (Free)

Complete guide to testing without spending any money.

### Ollama Setup

```bash
# Install
brew install ollama      # macOS
# curl -fsSL https://ollama.com/install.sh | sh  # Linux

# Start server
ollama serve

# Pull models
ollama pull llama3.2              # 2GB — good for chat
ollama pull qwen2.5-coder:7b     # 4.4GB — better for tool calling
ollama pull nomic-embed-text      # 274MB — for memory vector search
```

### Config for Ollama

```json5
// ~/.openclaw-clone/config.json5
{
  gateway: { port: 18789, host: "127.0.0.1" },
  agents: {
    defaults: {
      provider: {
        name: "ollama",
        baseUrl: "http://localhost:11434",
        model: "llama3.2",
      },
      maxTokens: 4096,
      temperature: 0.7,
      memoryEnabled: true,
    },
  },
  channels: {},
  plugins: { enabled: ["*"], paths: [] },
}
```

### Verifying Ollama Works

```bash
# Quick check — does Ollama respond?
curl http://localhost:11434/api/chat -d '{
  "model": "llama3.2",
  "messages": [{"role": "user", "content": "Say hello"}],
  "stream": false
}'
# ✓ Should return JSON with a "message" field

# Check embeddings work
curl http://localhost:11434/api/embeddings -d '{
  "model": "nomic-embed-text",
  "prompt": "test embedding"
}'
# ✓ Should return JSON with an "embedding" array
```

### Model Recommendations by Hardware

| Hardware | Model | RAM Needed | Quality |
|----------|-------|-----------|---------|
| 8GB RAM Mac/PC | `llama3.2` (3B) | ~2GB | Good for basic chat, okay for tools |
| 16GB RAM | `qwen2.5-coder:7b` | ~5GB | Good tool calling, code generation |
| 32GB+ RAM | `qwen2.5-coder:32b` | ~20GB | Excellent quality, near cloud-API level |
| 64GB+ RAM | `llama3.1:70b` | ~40GB | Top tier local inference |

---

## 3.7 Testing Channels Locally

### Telegram (real bot, easy)

```bash
# 1. Message @BotFather on Telegram
#    /newbot → name it → get token like 1234567890:ABCdefGhIjKlMnOpQrStUvWxYz

# 2. Get your Telegram user ID:
#    Message @userinfobot → it replies with your numeric ID

# 3. Add to config:
#    channels.telegram = { token: "...", enabled: true, dmPolicy: "allowlist", allowedUsers: ["YOUR_ID"] }

# 4. Restart gateway and message your bot
```

### Discord (real bot, slightly more setup)

```bash
# 1. Go to https://discord.com/developers/applications
#    → New Application → Bot tab → Reset Token → copy token
#    → OAuth2 → URL Generator → Select "bot" scope + "Send Messages" + "Read Message History"
#    → Copy URL → open in browser → add bot to your test server

# 2. Enable "Message Content Intent" in Bot settings

# 3. Add to config:
#    channels.discord = { token: "...", enabled: true, dmPolicy: "allowlist", allowedUsers: ["YOUR_DISCORD_USER_ID"] }

# 4. Restart gateway and message the bot in Discord
```

### WebChat (no setup needed)

```bash
# WebChat works out of the box via the Gateway WebSocket
# Option A: Use the CLI
oclaw chat

# Option B: Open the Web UI
open http://localhost:18789

# Option C: Use wscat for raw testing
npx wscat -c ws://localhost:18789
> {"jsonrpc":"2.0","id":1,"method":"session.create","params":{}}
# ✓ Returns session ID
> {"jsonrpc":"2.0","id":2,"method":"session.send","params":{"sessionId":"...","message":"Hello"}}
# ✓ Returns OK + stream notifications follow
```

---

## 3.8 Load & Stress Testing

Validate the system handles your personal usage patterns.

### Simulated Multi-Session Load

```typescript
// test/load/concurrent-sessions.test.ts
import { describe, it, expect } from "vitest";

describe("Load: Concurrent Sessions", () => {
  it("handles 10 concurrent sessions without degradation", async () => {
    const sessions = await Promise.all(
      Array.from({ length: 10 }, () => createSessionAndChat("Hello"))
    );

    for (const session of sessions) {
      expect(session.response).toBeTruthy();
      expect(session.latencyMs).toBeLessThan(30_000);
    }
  });
});
```

### Memory Under Sustained Use

```bash
# Start gateway, note initial memory
ps aux | grep oclaw | awk '{print $6}'  # RSS in KB

# Send 100 messages across 5 sessions
node test/load/sustained-use.js

# Check memory again — should be < 250MB
ps aux | grep oclaw | awk '{print $6}'
```

### Large Memory File Indexing

```bash
# Generate a large MEMORY.md (simulate 1 year of daily notes)
node scripts/generate-test-memory.js --days 365

# Time the indexing
time oclaw memory index --verbose
# ✓ Should complete in < 30 seconds for 365 daily log files

# Test search speed
time oclaw memory search "user preferences for TypeScript"
# ✓ Should return results in < 200ms
```

---

## 3.9 Security Testing

### Path Traversal Attacks

```bash
oclaw chat

you> Read the file ../../../../etc/passwd
# ✓ MUST return "Path traversal denied"

you> Read the file /etc/shadow
# ✓ MUST return error (absolute path outside workspace)

you> Write to file ../../../tmp/evil.sh with content "#!/bin/sh\nrm -rf /"
# ✓ MUST return "Path traversal denied"
```

### Command Injection

```bash
# With exec approvals in "allowlist" mode:
you> Run this command: ls; rm -rf /
# ✓ Full command string is matched against allowlist
#   If "ls; rm -rf /" doesn't match any pattern, it's blocked

# With exec approvals in "deny" mode:
you> Run: echo hello
# ✓ ALL exec calls blocked
```

### Auth Testing

```bash
# With auth enabled in config:
# Connect without token:
echo '{"jsonrpc":"2.0","id":1,"method":"session.list","params":{}}' | npx wscat -c ws://localhost:18789
# ✓ Returns auth error

# Connect with wrong token:
# ✓ Returns auth error

# Connect with correct token:
# ✓ Returns session list
```

---

## 3.10 CI Pipeline (Local)

Run this before every commit or PR. Create a script for it:

```bash
#!/bin/bash
# scripts/ci.sh — Local CI pipeline
set -euo pipefail

echo "=== 1. Lint ==="
pnpm biome check .

echo "=== 2. Type Check ==="
pnpm tsc --noEmit

echo "=== 3. Unit Tests ==="
pnpm test -- --run

echo "=== 4. Integration Tests ==="
pnpm test:integration -- --run

echo "=== 5. Build ==="
pnpm build

echo "=== 6. E2E (requires Ollama) ==="
if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
  pnpm test:e2e -- --run
else
  echo "⚠ Ollama not running, skipping E2E tests"
fi

echo "=== All checks passed ==="
```

### Expected Test Count Targets

| Category | Minimum Test Files | Focus Areas |
|----------|-------------------|-------------|
| Unit | 40+ | Config validation, policy engine, context assembly, chunking, pipeline stages, command parsing |
| Integration | 15+ | Gateway lifecycle, agent-tool flow, memory pipeline, plugin loading, channel routing |
| E2E | 5+ | Full chat flow, tool usage, memory recall, slash commands, streaming |
| **Total** | **60+** | |

### Coverage Targets

| Package | Min Coverage | Critical Paths |
|---------|-------------|----------------|
| `config` | 90% | Schema validation, merge logic |
| `tools` (policy) | 90% | Allow/deny evaluation, path traversal |
| `agent` (loop) | 80% | Iteration control, stop conditions |
| `memory` (vector) | 80% | Chunking, cosine similarity |
| `pipeline` | 80% | Stage order, abort handling |
| `gateway` | 70% | RPC routing, session CRUD |
| `plugins` | 70% | Manifest validation, lifecycle |
| **Overall** | **75%** | |
