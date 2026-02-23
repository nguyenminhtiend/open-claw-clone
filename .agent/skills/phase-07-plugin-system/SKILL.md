---
name: phase-07-plugin-system
description: Builds the runtime plugin loader, lifecycle hooks, extension points, and example plugins (cron scheduler, daily digest). Use when implementing the plugin system, adding extension points, or creating new plugins after Phase 6 is complete.
---

# Phase 7: Plugin System

Build the runtime plugin loader, lifecycle hooks, extension points, and a few example plugins (cron scheduler, daily digest).

## Prerequisites

- Phase 6 completed (Pipeline working)
- `jiti` for TypeScript plugin loading

## Steps

Copy this checklist and mark off items as you complete them:

```
Progress:
- [ ] 1. Create packages/plugins
- [ ] 2. Define Plugin Manifest Schema
- [ ] 3. Define Plugin Interface
- [ ] 4. Build Plugin Loader
- [ ] 5. Build Plugin Registry & Lifecycle
- [ ] 6. Build Hook System
- [ ] 7. Build Plugin API
- [ ] 8. Create Example Plugins
- [ ] 9. Install Dependencies
- [ ] 10. Write Tests ✅ all passing
```

### 1. Create `packages/plugins`

See [creating-package](../creating-package/SKILL.md) for the standard package scaffold.

```bash
# turbo
mkdir -p packages/plugins/src
```

### 2. Define Plugin Manifest Schema

`src/manifest.ts` — Validate `openclaw.plugin.json`:

- `id` — unique kebab-case identifier
- `name`, `version`, `description`, `author`
- `main` — entry point (default `index.ts`)
- `capabilities` — array of: tools, commands, routes, rpc, hooks, services, pipeline
- `dependencies` — other plugin IDs this depends on
- `configSchema` — optional JSON Schema for plugin config

### 3. Define Plugin Interface

`src/types.ts`:

- `Plugin` — manifest, status (loaded/initialized/running/stopped/error), lifecycle methods
- `PluginApi` — Registration methods + runtime helpers
  - `registerTool()`, `registerCommand()`, `registerRoute()`, `registerRpcMethod()`
  - `registerHook()`, `registerService()`, `registerPipelineStage()`
  - `runtime` — config, logger, sessions, memory, channels

### 4. Build Plugin Loader

`src/loader.ts` using **jiti**:

- Discovery: config paths → workspace `extensions/` → global `~/.openclaw-clone/extensions/`
- Read and validate `openclaw.plugin.json` manifests
- Dynamic import entry point (supports `.ts` without pre-compilation)

### 5. Build Plugin Registry & Lifecycle

`src/registry.ts`:

- Load all enabled plugins
- Topological sort by dependencies
- Lifecycle: load → init → start → (running) → stop → unload
- Stop in reverse order
- Catch and log errors (never crash gateway)

### 6. Build Hook System

`src/hooks.ts`:

- Typed event bus with priority ordering
- Higher priority hooks fire first
- Hooks can modify mutable data (e.g., messages array)

Standard events:

- `gateway:startup`, `gateway:shutdown`
- `session:created`, `session:reset`, `session:message`
- `agent:before_run`, `agent:after_run`, `agent:tool_call`
- `plugins:loaded`, `memory:flush`

### 7. Build Plugin API

`src/api.ts` — Scoped `PluginApi` created per plugin:

- Scoped logger (includes pluginId)
- Access to runtime services
- Plugin-specific config access via `getConfig<T>()`

### 8. Create Example Plugins

Create `extensions/` directory at repo root:

**Cron Scheduler** (`extensions/cron-scheduler/`):

- `openclaw.plugin.json` manifest
- `index.ts` — Registers `schedule_task` tool + background service

**Daily Digest** (`extensions/daily-digest/`):

- Hooks into `session:created` to inject today's daily log

### 9. Install Dependencies

```bash
# turbo
pnpm --filter @oclaw/plugins add jiti@^2 json5@^2
```

### 10. Write Tests

Key tests:

- Plugin discovery finds manifests in all search paths
- Manifest validation rejects malformed manifests
- Plugins load in dependency order
- Lifecycle methods called in order
- Registered tools appear in tool registry
- Hooks fire in priority order
- Plugin errors don't crash gateway
- Enable/disable via config works

**Feedback loop**: After building the Plugin Registry & Lifecycle (Step 5), load the example `cron-scheduler` plugin and verify the full lifecycle sequence (`load → init → start → stop`) fires correctly. If lifecycle order is wrong, fix it before building the Hook System — hooks depend on correct lifecycle ordering. Re-run tests after each step.

---

## Checkpoint — You're Done When

- [ ] Plugins discovered from workspace and global extension dirs
- [ ] Plugin manifests validated against schema
- [ ] Plugins load in dependency order
- [ ] Plugins can register tools, commands, hooks, and routes
- [ ] Hook system fires events to all registered handlers
- [ ] Cron scheduler plugin works
- [ ] Daily digest plugin works
- [ ] Plugin errors caught and logged (don't crash gateway)
- [ ] `plugins list` RPC method returns installed plugins

## Dependencies

| Package    | Purpose                           |
| ---------- | --------------------------------- |
| jiti `^2`  | Dynamic TypeScript module loading |
| json5 `^2` | Plugin manifest parsing           |
