# OpenClaw: Drawbacks of the Original & Proposed Enhancements for the Clone

> This document identifies known drawbacks and criticisms of the original OpenClaw (Clawdbot/Moltbot) and proposes concrete enhancements for the **open-claw-clone** project so we can learn from its mistakes and build a safer, leaner, and more maintainable system.

---

## Table of Contents

- [1. Security Drawbacks](#1-security-drawbacks)
- [2. Architectural & Design Drawbacks](#2-architectural--design-drawbacks)
- [3. Complexity & Maintainability Drawbacks](#3-complexity--maintainability-drawbacks)
- [4. Cost & Token Efficiency Drawbacks](#4-cost--token-efficiency-drawbacks)
- [5. Supply Chain & Ecosystem Drawbacks](#5-supply-chain--ecosystem-drawbacks)
- [6. UX & Operator Experience Drawbacks](#6-ux--operator-experience-drawbacks)
- [7. Summary: Enhancement Priorities for the Clone](#7-summary-enhancement-priorities-for-the-clone)

---

## 1. Security Drawbacks

### 1.1 Authentication Disabled by Default

**Original behavior:** Every OpenClaw deployment ships with authentication **off**. Most deployers never enable it, leaving the gateway and all sessions exposed to anyone who can reach the port.

**Impact:** Tens of thousands of instances are exposed to the public internet. Attackers can list sessions, read conversation history, send messages as the agent, and trigger tool execution.

**Enhancement for the clone:**

| Enhancement | Description |
|-------------|-------------|
| **Auth required by default** | `gateway.auth.enabled` defaults to `true`. First-run wizard (`oclaw onboard`) generates a strong random token and instructs the user to store it. |
| **No “open” mode in production** | If `NODE_ENV=production` and `auth.enabled=false`, gateway refuses to bind to a non-localhost address and logs a warning. |
| **Explicit “insecure” override** | Allowing unauthenticated access requires an explicit config flag, e.g. `gateway.auth.allowInsecureLocalOnly: true`, and only when binding to `127.0.0.1`. |

---

### 1.2 Remote Code Execution via Malicious Content

**Original behavior:** CVE-2026-25253 (CVSS 8.8): when the agent visits or processes a malicious URL (e.g. in a message or via a tool), an attacker can achieve one-click remote code execution and full control of the instance.

**Impact:** Structural risk: the agent has broad system access and processes untrusted external content. Security researchers (e.g. Kaspersky) have stated that some issues are architectural and cannot be fully patched without redesign.

**Enhancement for the clone:**

| Enhancement | Description |
|-------------|-------------|
| **Strict URL allowlist for HTTP/browser tools** | `http_fetch` and browser tools only allow requests to user-configured domains (e.g. `allowedDomains: ["api.github.com"]`). No “fetch arbitrary URL” by default. |
| **Content sanitization** | All content from external sources (URLs, attachments, channel messages) is treated as untrusted: no execution of inline scripts, no `file://` or `data:` URLs in browser context. |
| **Tool output size and type limits** | Cap HTTP response body size (e.g. 500KB); strip or refuse HTML/JS in fetched content before feeding to the LLM. |
| **Optional “read-only” tool mode** | Config flag to disable any tool that can write to disk or execute code (e.g. `exec`, `file_write`), leaving only read-only tools for high-risk deployments. |

---

### 1.3 Opt-Out Security Model

**Original behavior:** Security is largely **opt-out**: “block known-bad” patterns. Researchers have shown that this can be bypassed (e.g. through obfuscation, alternative invocations). The default posture is permissive.

**Enhancement for the clone:**

| Enhancement | Description |
|-------------|-------------|
| **Opt-in tool policy by default** | Default policy: `allow: []` (no tools) until the user explicitly allows tools or groups. First-run wizard asks “Which capabilities do you want?” and sets an allowlist. |
| **Exec approvals: allowlist-only default** | `exec` tool defaults to `execApprovals.mode: "allowlist"` with an empty list. User must add patterns (e.g. `ls *`, `git *`) before any shell command runs. |
| **Sandbox-by-default** | Where possible, tools run in a sandbox (e.g. restricted filesystem, no network) unless the user opts into “host” or “gateway” execution. |
| **Security level presets** | Config presets: `minimal` (no exec, read-only file), `personal` (allowlist exec + file read/write in workspace), `full` (current OpenClaw-style). User chooses one explicitly. |

---

### 1.4 Plaintext Credential Storage

**Original behavior:** API keys and tokens are stored in plaintext under `~/.clawdbot` (or similar), sometimes with `.bak` copies. No encryption at rest.

**Enhancement for the clone:**

| Enhancement | Description |
|-------------|-------------|
| **Env vars preferred** | Documentation and wizard push `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` in environment; config file stores only `provider.name` and `provider.model`. Keys in config are optional and deprecated. |
| **Optional encryption at rest** | Support `config.encryptionKey` or integration with OS secret store (e.g. macOS Keychain, Linux secret-service). If set, API keys in config are encrypted. |
| **No backup of secrets** | Never write `.bak` or backup files that contain API keys. |
| **File permissions** | On first write, set config file mode to `0600`; warn if the file is world-readable. |

---

### 1.5 Hardening Burden on the Operator

**Original behavior:** Secure deployment is not default. Operators need to perform many manual steps (reverse proxy, TLS, firewall, credential handling, audit logging, egress filtering). Guides cite 2–4 hours and 23+ configuration steps.

**Enhancement for the clone:**

| Enhancement | Description |
|-------------|-------------|
| **Secure-by-default checklist** | Single command or script: `oclaw harden` that runs checks (binding, auth, exec policy, file perms) and suggests fixes. |
| **Bundled “safe” defaults** | One config preset that is suitable for “exposed” deployment: auth on, allowlist exec, bind to localhost-only unless behind proxy, no open DM policy. |
| **Docs: “Secure deployment in 15 minutes”** | One linear guide that gets from install to “safe to put behind Caddy with TLS + auth” with minimal steps. |

---

## 2. Architectural & Design Drawbacks

### 2.1 Single Gateway as Bottleneck and Single Point of Failure

**Original behavior:** One long-lived gateway process owns sessions, channels, agent runtime, tools, plugins, and config. Everything flows through it. Scaling means scaling that one process.

**Impact:** No horizontal scaling of agent workers; a gateway crash loses in-memory state (unless persisted); heavy tool runs can block the event loop.

**Enhancement for the clone:**

| Enhancement | Description |
|-------------|-------------|
| **Clear separation of “control” vs “worker”** | Keep gateway as control plane (sessions, routing, config). Agent loop and tool execution can be moved to a separate worker process or queue so that one slow run does not block others. (Phase 2+ evolution.) |
| **Stateless gateway where possible** | Session and memory state in SQLite from day one; gateway can restart without losing sessions. No “in-memory only” session store as the main path. |
| **Health and readiness endpoints** | `/health` (liveness) and `/ready` (readiness: DB connected, config loaded, critical plugins loaded) so orchestrators can manage the process correctly. |

---

### 2.2 Context and Token Management Not First-Class

**Original behavior:** Large system prompts (SOUL.md, AGENTS.md, tool definitions, workspace files) are sent on every request. There is no built-in “index-rank-compact” or semantic trimming; context grows until it hits limits, then compaction is a late add-on.

**Impact:** Wasted tokens, higher cost, and issues raised in the community (e.g. GitHub issue #17078) that index-rank-compact should be core, not an external workaround.

**Enhancement for the clone:**

| Enhancement | Description |
|-------------|-------------|
| **Token budget and compaction as core** | From Phase 2, token counting and a token budget are built in. Compaction (summarize old messages) and memory flush (durable facts to MEMORY.md) are part of the agent loop, not a plugin. |
| **Ranked context injection** | Memory/search results and “relevant” parts of AGENTS.md/SOUL.md are selected by relevance (e.g. embedding similarity) up to a token cap, instead of “dump entire file.” |
| **Configurable system prompt size cap** | `agents.defaults.maxSystemPromptTokens` with a safe default (e.g. 4000). Refuse to start a turn if system prompt would exceed it; force trimming or splitting. |
| **Tool output truncation by default** | Every tool result has a max length (e.g. 8KB); excess is replaced with “… (truncated).” Configurable per tool. |

---

### 2.3 Monolithic and Heavy Core

**Original behavior:** The repo is huge (~6.8M tokens, 4,885 files). Core plus 34 extensions and native apps live in one monorepo. Even “minimal” installs pull in a large dependency surface.

**Enhancement for the clone:**

| Enhancement | Description |
|-------------|-------------|
| **Lean core, plugins for the rest** | Core = gateway + agent loop + minimal tools (exec, file_read, file_write, memory_get, memory_search) + one channel (WebChat). Telegram, Discord, cron, etc. are plugins. |
| **Bounded dependency set** | Target &lt; 30 direct production dependencies; no heavy frameworks in core. Document and enforce a dependency policy. |
| **Optional native apps** | No Swift/Kotlin in the main repo. Document how to build a thin client (CLI + Web UI) that talks to the gateway; mobile apps can be separate repos or community. |

---

## 3. Complexity & Maintainability Drawbacks

### 3.1 Steep Learning Curve and Churning Conventions

**Original behavior:** Multiple rebrands (ClawdBot → MoltBot → OpenClaw), frequent releases, and changing defaults make older tutorials and docs unreliable. New users face many concepts at once (gateway, sessions, channels, tools, skills, plugins, SOUL, AGENTS, MEMORY).

**Enhancement for the clone:**

| Enhancement | Description |
|-------------|-------------|
| **Stable, minimal mental model** | One doc: “How it works in 5 minutes” — Gateway, Session, Agent Loop, Tools, Memory. No mention of skills/plugins until “Extending.” |
| **Stable config schema** | Config schema is versioned; we support at least one previous version with auto-migration or clear errors. No silent breaking changes in defaults. |
| **Single “happy path”** | One path: install → `oclaw onboard` → `oclaw chat`. All other flows (Telegram, Docker, daemon) are “next steps” in the same doc. |

---

### 3.2 High Maintenance Burden for Contributors

**Original behavior:** Large codebase, many integrations, and constant security/feature churn make it hard to contribute and to keep forks in sync.

**Enhancement for the clone:**

| Enhancement | Description |
|-------------|-------------|
| **Small, focused packages** | Clear boundaries: gateway, agent, tools, memory, channels, pipeline, plugins, cli, web. Each package has a single responsibility and its own tests. |
| **Strict TypeScript and lint** | `strict: true`, no `any` in public APIs. Biome (or similar) with zero warnings in CI. |
| **Contributing doc** | “How to add a tool,” “How to add a channel,” “How to add a plugin” in a few steps each, with links to the right packages. |

---

## 4. Cost & Token Efficiency Drawbacks

### 4.1 Unbounded Context Growth

**Original behavior:** Full conversation history is re-sent every turn. Long sessions cause cost to grow quickly; 40–50% of token waste is attributed to context accumulation.

**Enhancement for the clone:**

| Enhancement | Description |
|-------------|-------------|
| **Rolling window + summarization** | Default: keep last N messages (e.g. 20) in full; older messages are summarized into a single system message. Configurable N and “summarize when over X tokens.” |
| **Per-session token cap** | `session.maxContextTokens`. When exceeded, compaction runs before the next turn. |
| **Usage visibility** | `oclaw usage` or RPC `usage.summary` returns tokens used (input/output) per session and total; optional daily rollup. |

---

### 4.2 Heavy System Prompt and Tool Definitions

**Original behavior:** System prompt (SOUL, AGENTS, memory, tool schemas) can reach 5–10K tokens per call and is sent every time. Tool outputs (e.g. large file reads, HTTP bodies) are stored in full in context.

**Enhancement for the clone:**

| Enhancement | Description |
|-------------|-------------|
| **Trimmed system prompt** | System prompt built from: (1) fixed short “core” instructions, (2) ranked snippets from AGENTS/SOUL/MEMORY up to a token limit. No “entire MEMORY.md” in every request. |
| **Tool output caps** | Default max length per tool result (e.g. 8KB). Configurable per tool. |
| **Lazy tool definitions** | For providers that support it, send only the tools the agent has used in the last K turns plus a small “discovery” set, instead of all 60+ tools every time. (Future enhancement once we have many tools.) |

---

### 4.3 Background Jobs and Heartbeats

**Original behavior:** Cron jobs and heartbeats reload full system prompt every 15–30 minutes even when there’s nothing to do, contributing to token burn (e.g. ~$200/month in one analysis).

**Enhancement for the clone:**

| Enhancement | Description |
|-------------|-------------|
| **Lightweight heartbeat** | Heartbeat/cron logic uses a minimal prompt (“Is there anything scheduled or due? Reply with one line or NONE.”) and a cheap/small model when possible. |
| **Cron opt-in** | No cron or heartbeat unless the user enables a plugin or config. No background LLM calls by default. |
| **Budget alerts** | Optional `usage.dailyCap` or `usage.monthlyCap`; when exceeded, gateway refuses new agent turns and notifies (log + optional webhook). |

---

## 5. Supply Chain & Ecosystem Drawbacks

### 5.1 Untrusted Third-Party Skills

**Original behavior:** ClawHub and similar marketplaces host community skills. A significant number have been found to contain keyloggers, credential stealers, or prompt-injection payloads. Detection is difficult because skills are code that runs with high privilege.

**Enhancement for the clone:**

| Enhancement | Description |
|-------------|-------------|
| **No central skill marketplace in core** | We do not run or depend on a central marketplace. “Skills” are either built-in or loaded from user-specified paths (local or private). |
| **Plugins are explicit and auditable** | Plugin list is explicit in config (`plugins.enabled`, `plugins.paths`). User must add each plugin path or name. No “install from URL” without a clear warning and optional checksum. |
| **Plugin sandbox** | Plugins run with a restricted API only (no direct `require("fs")` or `child_process` unless we explicitly expose a capability). Document a “plugin security model” and stick to it. |
| **Optional integrity checks** | For plugins loaded from a path, support an optional `checksum` or `integrity` field in manifest; gateway verifies before load. |

---

### 5.2 Dependency Bloat and Supply Chain Risk

**Original behavior:** Large dependency tree increases attack surface and upgrade churn.

**Enhancement for the clone:**

| Enhancement | Description |
|-------------|-------------|
| **Minimal deps and lockfile** | pnpm-lock.yaml committed; CI runs with `pnpm install --frozen-lockfile`. |
| **No runtime eval of user code from network** | No loading of arbitrary JS/TS from URLs at runtime. Plugins are from local paths or explicitly vetted sources. |
| **Vulnerability scanning in CI** | `pnpm audit` (or similar) in CI; failing on high/critical. Document how to update deps and re-run. |

---

## 6. UX & Operator Experience Drawbacks

### 6.1 First-Run Friction

**Original behavior:** Users must discover config location, create files, set API keys, and often enable auth and hardening themselves. No single “safe default” path.

**Enhancement for the clone:**

| Enhancement | Description |
|-------------|-------------|
| **One-command onboarding** | `oclaw onboard` generates config, creates MEMORY/SOUL/AGENTS, sets auth token, and optionally installs daemon. After that, `oclaw chat` works. |
| **Local-first default** | Wizard suggests “Use Ollama (no API key)” first. Cloud providers are “or add an API key for Claude/GPT.” |
| **Safe defaults** | Default config has auth on, bind to 127.0.0.1, allowlist exec (empty), and one channel (WebChat). |

---

### 6.2 Poor Visibility into Cost and Behavior

**Original behavior:** Token usage and cost are not obvious; users discover high bills after the fact. Hard to see which sessions or tools consumed the most.

**Enhancement for the clone:**

| Enhancement | Description |
|-------------|-------------|
| **Usage in CLI and RPC** | `oclaw usage` and `usage.summary` RPC return input/output tokens and optional cost estimate per session and globally. |
| **Optional caps and alerts** | Configurable daily/monthly token or cost caps; gateway can refuse new agent runs and log/notify when exceeded. |
| **Structured logs for agent actions** | Each tool call and each LLM request logged with session id, token count, duration. Enables simple analytics or export to a dashboard. |

---

### 6.3 Unclear Failure Modes and Recovery

**Original behavior:** When something breaks (channel disconnect, LLM timeout, plugin error), messages can be generic or missing. Recovery steps are scattered.

**Enhancement for the clone:**

| Enhancement | Description |
|-------------|-------------|
| **Structured errors and codes** | Every user-facing error has a code (e.g. `AUTH_REQUIRED`, `TOOL_POLICY_DENIED`, `LLM_TIMEOUT`) and a short doc link. |
| **Recovery hints in logs** | Log messages include “what to do” when possible (e.g. “TOOL_POLICY_DENIED: add ‘git *’ to exec approvals or set mode to allowlist”). |
| **Health and readiness** | `/health` and `/ready` so operators can automate restarts and routing. |

---

## 7. Summary: Enhancement Priorities for the Clone

Prioritized list of enhancements to implement in the clone, aligned with the phase plan.

### P0 — Must Have (Security & Correctness)

| # | Enhancement | Where in plan |
|---|--------------|----------------|
| 1 | Auth on by default; no unauthenticated production bind | Phase 1 (Gateway) |
| 2 | Exec approvals allowlist-only default; opt-in tool policy | Phase 3 (Tools) |
| 3 | Path traversal and exec env hardening (no PATH/LD_PRELOAD) | Phase 3 (Tools) |
| 4 | API keys from env preferred; config file `0600`; no .bak of secrets | Phase 1 (Config) |
| 5 | Session and memory persistence in SQLite from the start | Phase 1 + 4 |
| 6 | URL allowlist for http_fetch/browser; no “fetch any URL” default | Phase 3 (Tools) |

### P1 — Should Have (Efficiency & Operability)

| # | Enhancement | Where in plan |
|---|--------------|----------------|
| 7 | Token budget + compaction + memory flush in core agent loop | Phase 2 + 4 |
| 8 | System prompt and tool output size caps | Phase 2 + 3 |
| 9 | `oclaw onboard` + safe defaults (auth, bind, exec policy) | Phase 8 (CLI) |
| 10 | `oclaw usage` / usage summary RPC | Phase 2 + 8 |
| 11 | Security preset (minimal / personal / full) in config | Phase 3 (Tools) |
| 12 | `oclaw harden` or hardening checklist script | Phase 8 (CLI) |
| 13 | Structured errors with codes and recovery hints | All phases |

### P2 — Nice to Have (Ecosystem & Scale)

| # | Enhancement | Where in plan |
|---|--------------|----------------|
| 14 | Ranked context injection (semantic selection for system prompt) | Phase 4 (Memory) |
| 15 | No central marketplace; plugins from paths only; optional checksum | Phase 7 (Plugins) |
| 16 | Optional daily/monthly token or cost cap with alert | Phase 2 + 8 |
| 17 | Liveness and readiness endpoints | Phase 1 (Gateway) |
| 18 | Dependency policy and CI audit | Repo/CI |
| 19 | Single “How it works in 5 minutes” and one happy-path doc | Docs |

---

## References (Original OpenClaw Context)

- OpenClaw security criticism and CVE-2026-25253 (Prime Rogue Inc, Barrack.ai, LikeClaw, Elephas, Northeastern).
- Karpathy and Kaspersky assessments on structural/architectural security issues.
- ClawHub malicious skills (e.g. 341/2857 skills with keyloggers/stealers; Elephas, LikeClaw).
- Token cost and context waste (OpenClaw Pulse, Medium, OpenClaw docs).
- Architecture and index-rank-compact as core (Global Builders Club, GitHub issue #17078).
- Secure deployment and hardening (Clawctl, OpenClaw Setup, install requirements).

This document should be updated as the original project evolves and as we implement each enhancement in the clone.
