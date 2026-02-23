# Phase 7: Plugin System

> Build the runtime plugin loader, lifecycle hooks, extension points, and a few example plugins.

## Learning Goals

- Dynamic module loading in Node.js (jiti / dynamic import)
- Plugin manifest and discovery patterns
- Lifecycle hooks (event-driven extension points)
- Plugin isolation and API surface design
- Writing practical plugins (cron scheduler, RSS reader, personal CRM)

## Why This Matters

Plugins are how OpenClaw stays lean while being extensible. The core handles messaging, agents, and tools — but everything else (Telegram channel adapter, cron jobs, custom skills, web scrapers) ships as a plugin. Understanding this pattern is essential for building any extensible system.

---

## Architecture

```
Plugin System
├── Plugin Loader
│   ├── Discovery (config paths → workspace → global → bundled)
│   ├── Manifest validation (openclaw.plugin.json)
│   ├── Dynamic import (jiti for TS, import() for JS)
│   └── Dependency resolution
├── Plugin Registry
│   ├── Lifecycle management (load → init → start → stop → unload)
│   ├── Capability registration
│   └── Plugin status tracking
├── Hook System
│   ├── Event bus (typed events)
│   ├── Hook registration & dispatch
│   └── Hook ordering (priority)
├── Plugin API
│   ├── Core helpers (runtime object)
│   ├── Registration methods (tools, commands, routes, hooks)
│   └── Scoped config access
└── Extension Points
    ├── Agent tools
    ├── CLI commands
    ├── Auto-reply commands
    ├── Gateway HTTP routes
    ├── Gateway RPC methods
    ├── Background services
    └── Pipeline stages
```

---

## Step-by-Step Implementation

### 7.1 — Plugin Manifest & Types

**Files:**

```
packages/plugins/
  ├── package.json
  ├── tsconfig.json
  └── src/
      ├── index.ts
      ├── types.ts              # Plugin interfaces
      ├── loader.ts             # Plugin discovery & loading
      ├── registry.ts           # Plugin lifecycle management
      ├── hooks.ts              # Event hook system
      ├── api.ts                # Plugin API surface
      └── manifest.ts           # Manifest schema & validation
```

**Plugin manifest schema:**

```typescript
import { z } from "zod";

export const pluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  author: z.string().optional(),
  main: z.string().default("index.ts"),        // Entry point
  configSchema: z.record(z.unknown()).optional(), // JSON Schema for plugin config
  capabilities: z.array(z.enum([
    "tools", "commands", "routes", "rpc", "hooks", "services", "pipeline",
  ])).default([]),
  dependencies: z.array(z.string()).default([]),  // Other plugin IDs
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;
```

**Plugin interface:**

```typescript
interface Plugin {
  manifest: PluginManifest;
  status: "loaded" | "initialized" | "running" | "stopped" | "error";
  error?: Error;

  // Lifecycle methods (implemented by plugin author)
  init?(api: PluginApi): Promise<void>;
  start?(api: PluginApi): Promise<void>;
  stop?(): Promise<void>;
}

interface PluginApi {
  // Registration
  registerTool(handler: ToolHandler): void;
  registerCommand(handler: CommandHandler): void;
  registerRoute(method: string, path: string, handler: RouteHandler): void;
  registerRpcMethod(name: string, handler: RpcHandler): void;
  registerHook(event: string, handler: HookHandler): void;
  registerService(name: string, service: BackgroundService): void;
  registerPipelineStage(stage: PipelineStage, position?: "before" | "after", relativeTo?: string): void;

  // Runtime helpers
  runtime: {
    config: Config;
    logger: Logger;
    sessions: SessionManager;
    memory: MemoryFileStore;
    channels: ChannelManager;
  };

  // Plugin config access
  getConfig<T>(): T;
}

interface BackgroundService {
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): "running" | "stopped" | "error";
}
```

### 7.2 — Plugin Loader

```typescript
import { createJiti } from "jiti";

class PluginLoader {
  private jiti = createJiti(import.meta.url);

  async discover(config: Config): Promise<PluginManifest[]> {
    const manifests: PluginManifest[] = [];
    const searchPaths = [
      ...config.plugins.paths,                             // Config-specified paths
      resolve(process.cwd(), ".openclaw-clone/extensions"), // Workspace extensions
      resolve(homedir(), ".openclaw-clone/extensions"),     // Global extensions
    ];

    for (const searchPath of searchPaths) {
      if (!existsSync(searchPath)) continue;

      const entries = await readdir(searchPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const manifestPath = resolve(searchPath, entry.name, "openclaw.plugin.json");
        if (!existsSync(manifestPath)) continue;

        const raw = JSON5.parse(await readFile(manifestPath, "utf-8"));
        const parsed = pluginManifestSchema.safeParse(raw);

        if (parsed.success) {
          manifests.push({ ...parsed.data, _path: resolve(searchPath, entry.name) } as any);
        } else {
          logger.warn({ path: manifestPath, errors: parsed.error }, "Invalid plugin manifest");
        }
      }
    }

    return manifests;
  }

  async load(manifest: PluginManifest & { _path: string }): Promise<Plugin> {
    const entryPath = resolve(manifest._path, manifest.main);

    // Use jiti for TypeScript support
    const module = await this.jiti.import(entryPath);
    const pluginFactory = (module as any).default ?? module;

    if (typeof pluginFactory !== "function") {
      throw new Error(`Plugin ${manifest.id}: default export must be a function`);
    }

    const plugin: Plugin = {
      manifest,
      status: "loaded",
      ...pluginFactory(),
    };

    return plugin;
  }
}
```

### 7.3 — Plugin Registry & Lifecycle

```typescript
class PluginRegistry {
  private plugins = new Map<string, Plugin>();
  private loadOrder: string[] = [];

  constructor(
    private loader: PluginLoader,
    private hookSystem: HookSystem,
    private createApi: (pluginId: string) => PluginApi,
  ) {}

  async loadAll(config: Config): Promise<void> {
    const manifests = await this.loader.discover(config);

    // Filter to enabled plugins
    const enabled = manifests.filter(m =>
      config.plugins.enabled.includes(m.id) || config.plugins.enabled.includes("*")
    );

    // Topological sort by dependencies
    const sorted = this.topologicalSort(enabled);

    for (const manifest of sorted) {
      try {
        const plugin = await this.loader.load(manifest as any);
        this.plugins.set(manifest.id, plugin);
        this.loadOrder.push(manifest.id);

        const api = this.createApi(manifest.id);

        if (plugin.init) await plugin.init(api);
        plugin.status = "initialized";

        if (plugin.start) await plugin.start(api);
        plugin.status = "running";

        logger.info({ pluginId: manifest.id }, "Plugin loaded and started");
      } catch (err) {
        logger.error({ pluginId: manifest.id, error: err }, "Failed to load plugin");
      }
    }

    await this.hookSystem.emit("plugins:loaded", { plugins: Array.from(this.plugins.keys()) });
  }

  async stopAll(): Promise<void> {
    // Stop in reverse order
    for (const id of [...this.loadOrder].reverse()) {
      const plugin = this.plugins.get(id);
      if (plugin?.stop) {
        try {
          await plugin.stop();
          plugin.status = "stopped";
        } catch (err) {
          logger.error({ pluginId: id, error: err }, "Error stopping plugin");
        }
      }
    }
  }

  private topologicalSort(manifests: PluginManifest[]): PluginManifest[] {
    const sorted: PluginManifest[] = [];
    const visited = new Set<string>();
    const byId = new Map(manifests.map(m => [m.id, m]));

    const visit = (m: PluginManifest) => {
      if (visited.has(m.id)) return;
      visited.add(m.id);
      for (const dep of m.dependencies) {
        const depManifest = byId.get(dep);
        if (depManifest) visit(depManifest);
      }
      sorted.push(m);
    };

    for (const m of manifests) visit(m);
    return sorted;
  }
}
```

### 7.4 — Hook System

```typescript
type HookHandler = (event: HookEvent) => Promise<void>;

interface HookEvent {
  name: string;
  data: unknown;
  session?: Session;
  messages?: Message[];   // Mutable — hooks can modify messages
  timestamp: Date;
}

class HookSystem {
  private hooks = new Map<string, Array<{ pluginId: string; handler: HookHandler; priority: number }>>();

  register(event: string, pluginId: string, handler: HookHandler, priority = 0): void {
    const existing = this.hooks.get(event) ?? [];
    existing.push({ pluginId, handler, priority });
    existing.sort((a, b) => b.priority - a.priority); // Higher priority first
    this.hooks.set(event, existing);
  }

  async emit(event: string, data: unknown, ctx?: { session?: Session; messages?: Message[] }): Promise<void> {
    const handlers = this.hooks.get(event) ?? [];

    const hookEvent: HookEvent = {
      name: event,
      data,
      session: ctx?.session,
      messages: ctx?.messages,
      timestamp: new Date(),
    };

    for (const { pluginId, handler } of handlers) {
      try {
        await handler(hookEvent);
      } catch (err) {
        logger.error({ event, pluginId, error: err }, "Hook handler failed");
      }
    }
  }
}

// Standard hook events:
// "gateway:startup"     — Gateway booted
// "gateway:shutdown"    — Gateway shutting down
// "session:created"     — New session started
// "session:reset"       — Session cleared (/reset or /new)
// "session:message"     — New message in session
// "agent:before_run"    — Before agent loop starts
// "agent:after_run"     — After agent loop completes
// "agent:tool_call"     — Agent called a tool
// "plugins:loaded"      — All plugins loaded
// "memory:flush"        — Memory flush triggered
```

### 7.5 — Example Plugins

#### Plugin: Cron Scheduler

```
extensions/cron-scheduler/
  ├── openclaw.plugin.json
  └── index.ts
```

```typescript
// openclaw.plugin.json
{
  "id": "cron-scheduler",
  "name": "Cron Scheduler",
  "version": "1.0.0",
  "description": "Schedule recurring tasks",
  "capabilities": ["tools", "services"],
  "configSchema": {
    "type": "object",
    "properties": {
      "jobs": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "name": { "type": "string" },
            "cron": { "type": "string" },
            "action": { "type": "string" }
          }
        }
      }
    }
  }
}
```

```typescript
// index.ts
export default function cronSchedulerPlugin() {
  let intervals: NodeJS.Timeout[] = [];

  return {
    async init(api: PluginApi) {
      // Register a tool for the agent to schedule tasks
      api.registerTool({
        definition: {
          name: "schedule_task",
          description: "Schedule a recurring task",
          parameters: z.object({
            name: z.string(),
            cronExpression: z.string(),
            prompt: z.string().describe("What to do when the cron fires"),
          }),
          group: "system",
        },
        async execute(input, context) {
          // Store scheduled task in config
          return { output: `Scheduled "${input.name}" with cron: ${input.cronExpression}`, durationMs: 0 };
        },
      });
    },

    async start(api: PluginApi) {
      const config = api.getConfig<{ jobs: Array<{ name: string; cron: string; action: string }> }>();

      for (const job of config.jobs ?? []) {
        // Simple interval-based scheduling (use node-cron for real cron expressions)
        const interval = setInterval(async () => {
          api.runtime.logger.info({ job: job.name }, "Cron job triggered");
          // Create a session and run the action as a message
        }, parseCronToMs(job.cron));

        intervals.push(interval);
      }
    },

    async stop() {
      intervals.forEach(clearInterval);
      intervals = [];
    },
  };
}
```

#### Plugin: Daily Digest

A hook that runs at session start to inject today's context:

```typescript
export default function dailyDigestPlugin() {
  return {
    async init(api: PluginApi) {
      api.registerHook("session:created", async (event) => {
        // Inject today's daily log into the session
        const today = new Date().toISOString().split("T")[0];
        const dailyLog = await api.runtime.memory.getDailyLog();

        if (dailyLog && event.messages) {
          event.messages.unshift({
            id: nanoid(),
            role: "system",
            content: `[Today's notes - ${today}]\n${dailyLog}`,
            timestamp: new Date(),
          });
        }
      });
    },
  };
}
```

---

## Testing Strategy

Key test scenarios:
- Plugin discovery finds manifests in all search paths
- Manifest validation rejects malformed manifests
- Plugins load in dependency order (topological sort)
- Plugin lifecycle methods are called in order (init → start → stop)
- Registered tools appear in the tool registry
- Registered commands appear in the command registry
- Hooks fire in priority order
- Hook handlers can modify mutable data (messages array)
- Plugin errors don't crash the gateway
- Plugins can be enabled/disabled via config

---

## Checkpoint — You're Done When

- [ ] Plugins are discovered from workspace and global extension dirs
- [ ] Plugin manifests are validated against schema
- [ ] Plugins load in dependency order
- [ ] Plugins can register tools, commands, hooks, and routes
- [ ] Hook system fires events to all registered handlers
- [ ] Cron scheduler plugin works (schedules and fires tasks)
- [ ] Daily digest plugin injects context into new sessions
- [ ] Plugins can be enabled/disabled via config
- [ ] Plugin errors are caught and logged (don't crash gateway)
- [ ] `plugins list` RPC method returns installed plugins

---

## Dependencies (additional)

```json
{
  "dependencies": {
    "jiti": "^2.x",
    "json5": "^2.x"
  }
}
```

---

## Next Phase

→ **[Phase 8: CLI, Web UI & Deployment](phase-08-deployment.md)**
