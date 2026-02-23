# OpenClaw Clone — Full Build Plan (TypeScript)

> **Purpose:** Learn the architecture and internals of OpenClaw (formerly Clawdbot/Moltbot) by building a simplified clone from scratch in TypeScript. Designed to run on a local machine or lightweight VM for personal use.

## What Is OpenClaw?

OpenClaw is an open-source, local-first AI agent orchestration platform written primarily in TypeScript (~84%). It bridges LLMs (Claude, GPT, DeepSeek, Ollama, etc.) with operating system capabilities and 16+ messaging channels (Telegram, Discord, Slack, WhatsApp, etc.) through a single **Gateway** daemon.

### Core Concepts

| Concept | What It Does |
|---|---|
| **Gateway** | Central WebSocket/HTTP server (port 18789) that owns all sessions, routing, and tool dispatch |
| **Agent Loop** | Think → Plan → Act → Observe → Iterate cycle that drives autonomous task execution |
| **Channels** | Unified abstraction layer normalizing 16+ messaging platforms into a single interface |
| **Tools** | 60+ capabilities (shell exec, file I/O, browser automation, etc.) with a 9-layer policy engine |
| **Memory** | Markdown-based persistent memory with vector search (MEMORY.md, daily logs, SOUL.md) |
| **Plugins** | Runtime-loaded TypeScript modules that can register tools, commands, hooks, and services |
| **Auto-Reply Pipeline** | 7-stage message processing: ingestion → auth → debounce → session → command → agent → stream |

### Original Architecture (Simplified)

```
┌─────────────────────────────────────────────────────────────┐
│                        GATEWAY (port 18789)                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ Sessions │ │ Channels │ │  Router  │ │ Agent Runtime │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │  Tools   │ │  Memory  │ │ Plugins  │ │   Security    │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘  │
└─────────────────────────────────────────────────────────────┘
       ▲              ▲              ▲              ▲
       │ WebSocket    │ HTTP         │ Adapters     │ CLI
  ┌────┴────┐   ┌─────┴────┐  ┌─────┴─────┐  ┌────┴────┐
  │ Web UI  │   │ REST API │  │ Telegram   │  │  CLI    │
  │         │   │          │  │ Discord    │  │  TUI    │
  └─────────┘   └──────────┘  │ Slack ...  │  └─────────┘
                               └───────────┘
```

---

## Build Phases Overview

We break the project into **8 phases**, each building on the last. Each phase is self-contained and produces a working system at its completion.

| Phase | Name | What You Build | Key Learning |
|-------|------|----------------|--------------|
| [1](phases/phase-01-foundation.md) | **Foundation & Gateway** | Project scaffold, config system, WebSocket/HTTP gateway server | Monorepo setup, Zod schemas, JSON-RPC, WebSocket protocol |
| [2](phases/phase-02-agent-loop.md) | **Agent Loop & LLM Integration** | Core agent executor with Think→Plan→Act→Observe cycle | LLM API integration, streaming, context assembly, token management |
| [3](phases/phase-03-tools-engine.md) | **Tools Engine** | Tool registry, execution pipeline, policy engine, built-in tools | Tool abstraction, sandboxing, security layers, shell execution |
| [4](phases/phase-04-memory.md) | **Memory & Persistence** | Markdown-based memory, vector search, session history | Embeddings, vector similarity, file-based persistence, compaction |
| [5](phases/phase-05-channels.md) | **Channels & Messaging** | Channel abstraction + Telegram & Discord adapters | Adapter pattern, message normalization, platform APIs |
| [6](phases/phase-06-auto-reply.md) | **Auto-Reply Pipeline** | 7-stage message processing pipeline | Pipeline architecture, middleware pattern, command routing |
| [7](phases/phase-07-plugins.md) | **Plugin System** | Runtime plugin loader, hooks, extension points | Dynamic module loading, lifecycle hooks, plugin isolation |
| [8](phases/phase-08-deployment.md) | **CLI, Web UI & Deployment** | CLI commands, web control panel, daemon, Docker | CLI frameworks, Lit components, systemd/launchd, containerization |

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Runtime | Node.js ≥ 22 | Native fetch, WebSocket, top-level await |
| Language | TypeScript 5.5+ | Type safety, great DX |
| Package Manager | pnpm | Fast, disk-efficient monorepo support |
| Bundler | tsup / tsx | Simple TS bundling and execution |
| Config | Zod + JSON5 | Runtime validation with rich schemas |
| WebSocket | ws | Battle-tested WS library for Node |
| HTTP | Hono | Lightweight, fast, great TypeScript support |
| Testing | Vitest | Fast, ESM-native, great DX |
| Linting | Biome | Fast all-in-one linter + formatter |
| Database | SQLite (better-sqlite3) | Zero-config, file-based, perfect for local |
| Vector Search | vectra (or custom) | Lightweight local vector store |
| CLI | Citty or Commander | Clean CLI framework |
| Web UI | Lit | Lightweight web components |
| Deployment | Docker + systemd | Standard containerized deployment |

---

## Monorepo Structure (Target)

```
open-claw-clone/
├── packages/
│   ├── gateway/          # Core gateway server
│   ├── agent/            # Agent loop & LLM integration
│   ├── tools/            # Tool registry & built-in tools
│   ├── memory/           # Memory & vector search
│   ├── channels/         # Channel abstraction & adapters
│   ├── pipeline/         # Auto-reply message pipeline
│   ├── plugins/          # Plugin loader & runtime
│   ├── config/           # Shared config & schemas
│   ├── cli/              # CLI entry point
│   ├── web/              # Web control UI
│   └── shared/           # Shared types & utilities
├── extensions/           # Built-in plugin extensions
├── memory/               # Runtime memory files (MEMORY.md, daily logs)
├── docs/                 # This documentation
│   ├── PLAN.md           # ← You are here
│   └── phases/           # Per-phase detailed plans
├── docker/               # Docker configs
├── scripts/              # Dev & build scripts
├── AGENTS.md             # Agent behavior configuration
├── SOUL.md               # Agent personality & values
├── MEMORY.md             # Persistent memory store
├── pnpm-workspace.yaml
├── tsconfig.json
├── biome.json
└── package.json
```

---

## Guiding Principles

1. **Learn by building** — Every architectural decision is an opportunity to understand *why* OpenClaw made its choices
2. **Local-first** — Everything runs on your machine or a single lightweight VM; no cloud dependencies
3. **Incremental complexity** — Each phase produces something runnable; complexity grows gradually
4. **Security-conscious** — Build sandboxing and tool policies from the start, not as an afterthought
5. **Keep it lean** — We're not replicating 6.8M tokens; we're building the essential ~15% that teaches 85% of the architecture

---

## Getting Started

Start with **[Phase 1: Foundation & Gateway](phases/phase-01-foundation.md)**.

Each phase document contains:
- Detailed objectives and learning goals
- Architecture decisions and rationale
- Step-by-step implementation guide
- Key files to create
- Testing strategy
- Checkpoint criteria (how to know you're done)
