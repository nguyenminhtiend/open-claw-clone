# Phase 3: Tools Engine

> Build the tool registry, execution pipeline, built-in tools, and the security policy engine.

## Learning Goals

- Tool definition schemas (JSON Schema for LLM function calling)
- Registry pattern with dynamic tool discovery
- Sandboxed execution (child processes, Docker containers)
- Multi-layer security policy engine
- Building practical tools: shell exec, file I/O, browser, HTTP

## Why This Matters

Tools are what transform a chatbot into an *agent*. The LLM can reason about which tools to use, but the tools engine is what actually executes those actions on the real system — running commands, reading files, browsing the web. The policy engine is what prevents the agent from `rm -rf /`.

---

## Architecture

```
Tools Engine
├── Registry
│   ├── Built-in tools (shell, file, http, browser)
│   ├── Plugin-provided tools (loaded at runtime)
│   └── Tool schema generator (for LLM function calling)
├── Executor
│   ├── Input validation (Zod)
│   ├── Policy check (allow/deny/approval)
│   ├── Sandbox resolver (host/docker/node)
│   ├── Execution dispatcher
│   └── Output capture & formatting
└── Policy Engine (3 layers)
    ├── Layer 1: Tool Policy (which tools exist for this agent)
    ├── Layer 2: Exec Approvals (command allowlists)
    └── Layer 3: Sandbox (where code runs)
```

---

## Step-by-Step Implementation

### 3.1 — Tool Definition & Registry

**Files:**

```
packages/tools/
  ├── package.json
  ├── tsconfig.json
  └── src/
      ├── index.ts
      ├── types.ts              # Tool interfaces
      ├── registry.ts           # Tool registry
      ├── executor.ts           # Tool execution pipeline
      ├── policy/
      │   ├── engine.ts         # Policy evaluation
      │   ├── tool-policy.ts    # Allow/deny lists
      │   ├── exec-approvals.ts # Command-level approvals
      │   └── sandbox.ts        # Sandbox configuration
      ├── built-in/
      │   ├── exec.ts           # Shell command execution
      │   ├── file-read.ts      # Read files
      │   ├── file-write.ts     # Write/edit files
      │   ├── file-search.ts    # Search/glob files
      │   ├── http-fetch.ts     # HTTP requests
      │   ├── browser.ts        # Browser automation (Playwright)
      │   ├── memory-get.ts     # Read memory files
      │   └── memory-search.ts  # Semantic memory search
      └── schema/
          └── generator.ts      # Convert tool defs → LLM function schemas
```

**Tool interface:**

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: ZodSchema;        // Zod schema for input validation
  returns?: ZodSchema;          // Zod schema for output typing
  group: ToolGroup;             // "runtime" | "fs" | "browser" | "memory" | "net"
  requiresApproval?: boolean;   // Needs user confirmation
  dangerous?: boolean;          // Flagged for extra policy checks
}

interface ToolHandler {
  definition: ToolDefinition;
  execute(input: unknown, context: ToolContext): Promise<ToolResult>;
}

interface ToolContext {
  session: Session;
  workdir: string;
  env: Record<string, string>;
  sandbox: SandboxConfig;
  signal: AbortSignal;
}

interface ToolResult {
  output: string;
  exitCode?: number;
  artifacts?: Artifact[];       // Files, screenshots, etc.
  error?: string;
  durationMs: number;
}

type ToolGroup = "runtime" | "fs" | "browser" | "memory" | "net" | "system";
```

**Registry:**

```typescript
class ToolRegistry {
  private tools = new Map<string, ToolHandler>();

  register(handler: ToolHandler): void {
    this.tools.set(handler.definition.name, handler);
  }

  get(name: string): ToolHandler | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolHandler[] {
    return Array.from(this.tools.values());
  }

  getByGroup(group: ToolGroup): ToolHandler[] {
    return this.getAll().filter(t => t.definition.group === group);
  }

  // Generate LLM-compatible tool definitions
  toFunctionSchemas(): LlmToolSchema[] {
    return this.getAll().map(t => ({
      name: t.definition.name,
      description: t.definition.description,
      input_schema: zodToJsonSchema(t.definition.parameters),
    }));
  }
}
```

### 3.2 — Tool Execution Pipeline

Every tool call goes through a pipeline: validate → policy check → sandbox resolve → execute → capture output.

```typescript
class ToolExecutor {
  constructor(
    private registry: ToolRegistry,
    private policy: PolicyEngine,
  ) {}

  async execute(name: string, input: unknown, context: ToolContext): Promise<ToolResult> {
    const startTime = Date.now();

    // 1. Find tool
    const tool = this.registry.get(name);
    if (!tool) {
      return { output: `Unknown tool: ${name}`, error: "not_found", durationMs: 0 };
    }

    // 2. Validate input
    const parsed = tool.definition.parameters.safeParse(input);
    if (!parsed.success) {
      return {
        output: `Invalid input: ${parsed.error.message}`,
        error: "validation_error",
        durationMs: 0,
      };
    }

    // 3. Check policy
    const allowed = await this.policy.check(tool.definition, parsed.data, context);
    if (!allowed.permitted) {
      return {
        output: `Tool "${name}" blocked by policy: ${allowed.reason}`,
        error: "policy_denied",
        durationMs: 0,
      };
    }

    // 4. Execute with timeout
    try {
      const result = await Promise.race([
        tool.execute(parsed.data, context),
        this.timeout(context.signal, 300_000), // 5 min default
      ]);
      result.durationMs = Date.now() - startTime;
      return result;
    } catch (err) {
      return {
        output: `Tool execution failed: ${err.message}`,
        error: "execution_error",
        durationMs: Date.now() - startTime,
      };
    }
  }
}
```

### 3.3 — Policy Engine (3 Layers)

**Layer 1: Tool Policy — which tools exist for this agent**

```typescript
interface ToolPolicy {
  allow?: string[];    // If non-empty, only these tools are available
  deny?: string[];     // Always blocked (deny wins over allow)
  groups?: {
    allow?: ToolGroup[];
    deny?: ToolGroup[];
  };
}

// Examples:
// { allow: ["exec", "file_read"] }           → only these 2 tools
// { deny: ["browser"] }                       → everything except browser
// { groups: { deny: ["runtime"] } }           → no shell execution
```

**Layer 2: Exec Approvals — command-level gatekeeping**

```typescript
interface ExecApproval {
  pattern: string;      // Glob pattern for allowed commands
  lastUsed?: Date;
  addedBy: "user" | "auto";
}

interface ExecApprovalConfig {
  mode: "full" | "allowlist" | "deny";
  approvals: ExecApproval[];
}

// mode: "full"      → allow all commands (development only!)
// mode: "allowlist" → only matching patterns run
// mode: "deny"      → block all exec calls
```

**Layer 3: Sandbox — where tools run**

```typescript
interface SandboxConfig {
  mode: "off" | "docker" | "nsjail";
  image?: string;           // Docker image to use
  bindMounts?: string[];    // Allowed host paths
  networkAccess?: boolean;
  maxMemoryMb?: number;
  maxCpuPercent?: number;
}
```

**Combined policy check:**

```typescript
class PolicyEngine {
  async check(
    tool: ToolDefinition,
    input: unknown,
    context: ToolContext,
  ): Promise<{ permitted: boolean; reason?: string }> {
    // Layer 1: Tool policy
    if (this.toolPolicy.deny?.includes(tool.name)) {
      return { permitted: false, reason: "Tool is in deny list" };
    }
    if (this.toolPolicy.allow?.length && !this.toolPolicy.allow.includes(tool.name)) {
      return { permitted: false, reason: "Tool not in allow list" };
    }

    // Layer 2: Exec approvals (only for exec-type tools)
    if (tool.name === "exec" && this.execApprovals.mode === "allowlist") {
      const command = (input as { command: string }).command;
      const approved = this.execApprovals.approvals.some(a =>
        minimatch(command, a.pattern)
      );
      if (!approved) {
        return { permitted: false, reason: `Command not in approved list: ${command}` };
      }
    }

    if (tool.name === "exec" && this.execApprovals.mode === "deny") {
      return { permitted: false, reason: "All exec calls are blocked" };
    }

    return { permitted: true };
  }
}
```

### 3.4 — Built-in Tools

#### `exec` — Shell Command Execution

```typescript
const execTool: ToolHandler = {
  definition: {
    name: "exec",
    description: "Execute a shell command in the workspace",
    parameters: z.object({
      command: z.string().describe("The shell command to execute"),
      workdir: z.string().optional().describe("Working directory"),
      timeout: z.number().optional().default(180).describe("Timeout in seconds"),
      background: z.boolean().optional().default(false),
    }),
    group: "runtime",
    dangerous: true,
  },

  async execute(input, context): Promise<ToolResult> {
    const { command, workdir, timeout } = input;
    const cwd = workdir ?? context.workdir;

    const proc = Bun.spawn(["sh", "-c", command], {
      cwd,
      env: { ...process.env, ...context.env },
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    const exitCode = await proc.exited;

    return {
      output: stdout + (stderr ? `\nSTDERR:\n${stderr}` : ""),
      exitCode,
      durationMs: 0,
    };
  },
};
```

#### `file_read` — Read Files

```typescript
const fileReadTool: ToolHandler = {
  definition: {
    name: "file_read",
    description: "Read a file's contents, optionally with line range",
    parameters: z.object({
      path: z.string().describe("File path (relative to workspace)"),
      startLine: z.number().optional(),
      endLine: z.number().optional(),
    }),
    group: "fs",
  },

  async execute(input, context): Promise<ToolResult> {
    const fullPath = resolve(context.workdir, input.path);
    // Security: ensure path is within workspace
    if (!fullPath.startsWith(context.workdir)) {
      return { output: "Path traversal denied", error: "security", durationMs: 0 };
    }

    const content = await readFile(fullPath, "utf-8");
    const lines = content.split("\n");

    if (input.startLine || input.endLine) {
      const start = (input.startLine ?? 1) - 1;
      const end = input.endLine ?? lines.length;
      const slice = lines.slice(start, end);
      return {
        output: slice.map((l, i) => `${start + i + 1}|${l}`).join("\n"),
        durationMs: 0,
      };
    }

    return { output: content, durationMs: 0 };
  },
};
```

#### `file_write` — Write/Edit Files

```typescript
const fileWriteTool: ToolHandler = {
  definition: {
    name: "file_write",
    description: "Write content to a file (creates or overwrites)",
    parameters: z.object({
      path: z.string(),
      content: z.string(),
    }),
    group: "fs",
  },

  async execute(input, context): Promise<ToolResult> {
    const fullPath = resolve(context.workdir, input.path);
    if (!fullPath.startsWith(context.workdir)) {
      return { output: "Path traversal denied", error: "security", durationMs: 0 };
    }
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, input.content, "utf-8");
    return { output: `Written ${input.content.length} bytes to ${input.path}`, durationMs: 0 };
  },
};
```

#### `http_fetch` — HTTP Requests

```typescript
const httpFetchTool: ToolHandler = {
  definition: {
    name: "http_fetch",
    description: "Make an HTTP request",
    parameters: z.object({
      url: z.string().url(),
      method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("GET"),
      headers: z.record(z.string()).optional(),
      body: z.string().optional(),
    }),
    group: "net",
  },

  async execute(input): Promise<ToolResult> {
    const response = await fetch(input.url, {
      method: input.method,
      headers: input.headers,
      body: input.body,
    });
    const text = await response.text();
    return {
      output: `HTTP ${response.status}\n${text.slice(0, 10_000)}`,
      durationMs: 0,
    };
  },
};
```

#### `file_search` — Search/Glob Files

```typescript
const fileSearchTool: ToolHandler = {
  definition: {
    name: "file_search",
    description: "Search for files using glob patterns or content grep",
    parameters: z.object({
      pattern: z.string().describe("Glob pattern or search string"),
      type: z.enum(["glob", "grep"]).default("glob"),
      path: z.string().optional().describe("Directory to search in"),
    }),
    group: "fs",
  },

  async execute(input, context): Promise<ToolResult> {
    const cwd = resolve(context.workdir, input.path ?? ".");
    if (input.type === "glob") {
      const files = await glob(input.pattern, { cwd });
      return { output: files.join("\n"), durationMs: 0 };
    }
    // grep via ripgrep
    const proc = Bun.spawn(["rg", "--no-heading", input.pattern, cwd], { stdout: "pipe" });
    const output = await new Response(proc.stdout).text();
    return { output: output.slice(0, 20_000), durationMs: 0 };
  },
};
```

### 3.5 — Schema Generator (Tool Defs → LLM Format)

Convert Zod schemas to JSON Schema for the LLM's `tools` parameter:

```typescript
import { zodToJsonSchema } from "zod-to-json-schema";

function toolToLlmSchema(tool: ToolHandler): LlmToolSchema {
  return {
    name: tool.definition.name,
    description: tool.definition.description,
    input_schema: zodToJsonSchema(tool.definition.parameters, {
      target: "openApi3",
    }),
  };
}
```

---

## Testing Strategy

```
packages/tools/test/
  ├── registry.test.ts           # Registration, lookup, schema gen
  ├── executor.test.ts           # Full pipeline with mocked tools
  ├── policy/
  │   ├── tool-policy.test.ts    # Allow/deny evaluation
  │   ├── exec-approvals.test.ts # Command matching
  │   └── sandbox.test.ts        # Sandbox config resolution
  ├── built-in/
  │   ├── exec.test.ts           # Shell execution (sandboxed test)
  │   ├── file-read.test.ts      # File reading + path traversal block
  │   ├── file-write.test.ts     # File writing + directory creation
  │   └── http-fetch.test.ts     # HTTP mocked with msw
  └── integration/
      └── agent-tools.test.ts    # LLM calls tool → tool executes → result returns
```

Key test scenarios:
- Tool registry returns correct schemas for LLM
- Policy engine blocks denied tools
- Exec approvals correctly match glob patterns
- Path traversal attempts are caught and blocked
- Shell execution returns stdout/stderr/exitCode
- File operations respect workspace boundaries
- Tool timeout fires correctly

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

---

## Dependencies (additional)

```json
{
  "dependencies": {
    "minimatch": "^10.x",
    "glob": "^11.x",
    "zod-to-json-schema": "^3.x",
    "playwright": "^1.x"
  }
}
```

---

## Next Phase

→ **[Phase 4: Memory & Persistence](phase-04-memory.md)**
