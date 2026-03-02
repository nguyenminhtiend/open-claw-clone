import type { PolicyEngine } from './policy/engine.js';
import type { ToolRegistry } from './registry.js';
import type { ToolContext, ToolResult } from './types.js';

export class ToolExecutor {
  constructor(
    private registry: ToolRegistry,
    private policy: PolicyEngine
  ) {}

  async execute(name: string, input: unknown, context: ToolContext): Promise<ToolResult> {
    const startTime = Date.now();

    // 1. Find tool
    const tool = this.registry.get(name);
    if (!tool) {
      return { output: `Unknown tool: ${name}`, error: 'not_found', durationMs: 0 };
    }

    // 2. Validate input
    const parsed = tool.definition.parameters.safeParse(input);
    if (!parsed.success) {
      return {
        output: `Invalid input: ${parsed.error.message}`,
        error: 'validation_error',
        durationMs: 0,
      };
    }

    // 3. Check policy
    const allowed = await this.policy.check(tool.definition, parsed.data, context);
    if (!allowed.permitted) {
      return {
        output: `Tool "${name}" blocked by policy: ${allowed.reason}`,
        error: 'policy_denied',
        durationMs: 0,
      };
    }

    // 4. Execute
    try {
      const result = await tool.execute(parsed.data, context);
      result.durationMs = Date.now() - startTime;
      return result;
    } catch (err) {
      return {
        output: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
        error: 'execution_error',
        durationMs: Date.now() - startTime,
      };
    }
  }
}
