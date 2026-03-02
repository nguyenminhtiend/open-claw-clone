import type { Session } from '@oclaw/shared';
import { execTool } from './built-in/exec.js';
import { fileReadTool } from './built-in/file-read.js';
import { fileSearchTool } from './built-in/file-search.js';
import { fileWriteTool } from './built-in/file-write.js';
import { httpFetchTool } from './built-in/http-fetch.js';
import { ToolExecutor } from './executor.js';
import { PolicyEngine } from './policy/engine.js';
import { defaultExecApprovalConfig } from './policy/exec-approvals.js';
import type { ExecApprovalConfig } from './policy/exec-approvals.js';
import { defaultSandbox } from './policy/sandbox.js';
import type { SandboxConfig } from './policy/sandbox.js';
import type { ToolPolicy } from './policy/tool-policy.js';
import { ToolRegistry } from './registry.js';
import type { ToolHandler } from './types.js';

export interface ToolEngineOptions {
  workdir?: string;
  env?: Record<string, string>;
  toolPolicy?: ToolPolicy;
  execApprovals?: ExecApprovalConfig;
  sandbox?: SandboxConfig;
  extraTools?: ToolHandler[];
}

/**
 * ToolsEngine wires together the registry, policy, and executor.
 * It implements the same duck-type interface as ToolEngine in @oclaw/agent
 * so it can be passed directly to AgentLoop / StreamingAgentLoop.
 */
export class ToolsEngine {
  private registry: ToolRegistry;
  private executor: ToolExecutor;
  private policy: PolicyEngine;
  private workdir: string;
  private env: Record<string, string>;
  private sandbox: SandboxConfig;

  constructor(opts: ToolEngineOptions = {}) {
    this.workdir = opts.workdir ?? process.cwd();
    this.env = opts.env ?? {};
    this.sandbox = opts.sandbox ?? defaultSandbox;
    this.policy = new PolicyEngine(
      opts.toolPolicy ?? {},
      opts.execApprovals ?? defaultExecApprovalConfig
    );
    this.registry = new ToolRegistry();
    this.executor = new ToolExecutor(this.registry, this.policy);

    // Register built-ins
    for (const tool of [execTool, fileReadTool, fileWriteTool, fileSearchTool, httpFetchTool]) {
      this.registry.register(tool);
    }

    // Register extra tools supplied by caller
    for (const tool of opts.extraTools ?? []) {
      this.registry.register(tool);
    }
  }

  /** Compatible with @oclaw/agent ToolEngine interface */
  async execute(
    name: string,
    input: Record<string, unknown>,
    session: Session
  ): Promise<{ output: string; isError?: boolean }> {
    const controller = new AbortController();
    const context = {
      session,
      workdir: this.workdir,
      env: this.env,
      sandbox: this.sandbox,
      signal: controller.signal,
    };

    const result = await this.executor.execute(name, input, context);
    return {
      output: result.output,
      isError: result.error !== undefined,
    };
  }

  /** Compatible with @oclaw/agent ToolEngine interface */
  getDefinitions() {
    return this.registry.toAgentToolDefinitions();
  }

  /** Access the underlying registry for advanced use */
  getRegistry(): ToolRegistry {
    return this.registry;
  }

  /** Access the policy engine for runtime updates */
  getPolicyEngine(): PolicyEngine {
    return this.policy;
  }
}
