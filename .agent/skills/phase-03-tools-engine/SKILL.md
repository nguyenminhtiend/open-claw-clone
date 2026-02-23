---
name: phase-03-tools-engine
description: Builds the tool registry, execution pipeline, built-in tools (exec, file I/O, HTTP), and the 3-layer security policy engine. Use when implementing tool calling, adding built-in tools, or configuring exec/sandbox policies after Phase 2 is complete.
---

# Phase 3: Tools Engine

Build the tool registry, execution pipeline, built-in tools (exec, file I/O, HTTP), and the 3-layer security policy engine.

## Prerequisites

- Phase 2 completed (Agent loop working with LLM)
- `minimatch`, `glob`, `zod-to-json-schema` installed

## Steps

Copy this checklist and mark off items as you complete them:

```
Progress:
- [ ] 1. Create packages/tools
- [ ] 2. Define Tool Interfaces
- [ ] 3. Build Tool Registry
- [ ] 4. Build Tool Execution Pipeline
- [ ] 5. Build 3-Layer Policy Engine
- [ ] 6. Build Built-in Tools
- [ ] 7. Security Hardening
- [ ] 8. Build Schema Generator
- [ ] 9. Install Dependencies
- [ ] 10. Write Tests ✅ all passing
```

### 1. Create `packages/tools`

See [creating-package](../creating-package/SKILL.md) for the standard package scaffold.

```bash
# turbo
mkdir -p packages/tools/src/{policy,built-in,schema}
```

### 2. Define Tool Interfaces

`src/types.ts`:

- `ToolDefinition` — name, description, Zod parameters schema, group, dangerous flag
- `ToolHandler` — definition + execute function
- `ToolContext` — session, workdir, env, sandbox config, abort signal
- `ToolResult` — output, exitCode, artifacts, error, durationMs
- `ToolGroup` — "runtime" | "fs" | "browser" | "memory" | "net" | "system"

### 3. Build Tool Registry

`src/registry.ts`:

- Register/get/list tools
- Filter by group
- `toFunctionSchemas()` — convert Zod schemas → JSON Schema for LLM function calling

### 4. Build Tool Execution Pipeline

`src/executor.ts` — Pipeline for every tool call:

1. **Find** tool in registry
2. **Validate** input against Zod schema
3. **Policy check** (allow/deny/approval)
4. **Execute** with configurable timeout (default 5 min)
5. **Capture** output (truncated to max length)

### 5. Build 3-Layer Policy Engine

`src/policy/engine.ts`:

**Layer 1: Tool Policy** (`tool-policy.ts`)

- Allow/deny lists per agent (tool names and groups)
- Deny always wins over allow

**Layer 2: Exec Approvals** (`exec-approvals.ts`)

- 3 modes: `full` (allow all), `allowlist` (pattern match), `deny` (block all)
- Uses `minimatch` glob patterns for command matching

**Layer 3: Sandbox** (`sandbox.ts`)

- Modes: `off`, `docker`, `nsjail`
- Config for bind mounts, network, memory/CPU limits

### 6. Build Built-in Tools

| Tool            | File                        | Group   | Description                                        |
| --------------- | --------------------------- | ------- | -------------------------------------------------- |
| `exec`          | `built-in/exec.ts`          | runtime | Shell command execution with foreground/background |
| `file_read`     | `built-in/file-read.ts`     | fs      | Read files with optional line range                |
| `file_write`    | `built-in/file-write.ts`    | fs      | Create/overwrite files, auto-create dirs           |
| `file_search`   | `built-in/file-search.ts`   | fs      | Glob patterns and ripgrep content search           |
| `http_fetch`    | `built-in/http-fetch.ts`    | net     | HTTP requests (GET/POST/PUT/DELETE)                |
| `memory_get`    | `built-in/memory-get.ts`    | memory  | Read MEMORY.md, SOUL.md, daily logs                |
| `memory_search` | `built-in/memory-search.ts` | memory  | Semantic search over memory                        |

### 7. Security Hardening

- **Path traversal protection**: All file tools verify resolved path is within workspace
- **Exec env protection**: Reject `PATH`, `LD_PRELOAD`, `DYLD_*` overrides
- **Output truncation**: Default 20KB max per tool result, configurable per tool
- **URL allowlist**: `http_fetch` only allows configured domains by default

### 8. Build Schema Generator

`src/schema/generator.ts` — Convert Zod schemas to JSON Schema using `zod-to-json-schema` for LLM `tools` parameter.

### 9. Install Dependencies

```bash
# turbo
pnpm --filter @oclaw/tools add minimatch@^10 glob@^11 zod-to-json-schema@^3
pnpm --filter @oclaw/tools add -D playwright@^1
```

### 10. Write Tests

```bash
# turbo
pnpm --filter @oclaw/tools test
```

See [testing-patterns](../testing-patterns/SKILL.md) for mock strategies.

Key tests:

- Registry returns correct schemas for LLM
- Policy engine blocks denied tools
- Exec approvals match glob patterns correctly
- Path traversal attempts are caught and blocked
- Shell execution returns stdout/stderr/exitCode
- File operations respect workspace boundaries
- Tool timeout fires correctly

**Feedback loop**: Run tests after implementing each built-in tool (Step 6) and after each security hardening item (Step 7). Security tests for path traversal and exec policy **must pass** before wiring tools to the agent loop. If a test fails, fix it immediately — do not continue to the next tool.

---

## Checkpoint — You're Done When

- [ ] Tool registry holds 6+ built-in tools
- [ ] `exec` tool runs shell commands and captures output
- [ ] File tools read/write/search files within workspace
- [ ] Policy engine correctly allows/denies tool calls
- [ ] Exec approvals work in all 3 modes (full/allowlist/deny)
- [ ] LLM can call tools during the agent loop and get results
- [ ] Path traversal attacks are blocked
- [ ] All tools have Zod-validated inputs

## Dependencies

| Package                 | Purpose                           |
| ----------------------- | --------------------------------- |
| minimatch `^10`         | Glob matching for exec approvals  |
| glob `^11`              | File search                       |
| zod-to-json-schema `^3` | Zod → JSON Schema conversion      |
| playwright `^1`         | Browser automation (optional, P2) |
