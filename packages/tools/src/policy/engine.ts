import { minimatch } from 'minimatch';
import type { ToolContext, ToolDefinition } from '../types.js';
import type { ExecApprovalConfig } from './exec-approvals.js';
import type { ToolPolicy } from './tool-policy.js';

export interface PolicyResult {
  permitted: boolean;
  reason?: string;
}

export class PolicyEngine {
  constructor(
    private toolPolicy: ToolPolicy = {},
    private execApprovals: ExecApprovalConfig = { mode: 'full', approvals: [] }
  ) {}

  async check(tool: ToolDefinition, input: unknown, _context: ToolContext): Promise<PolicyResult> {
    // Layer 1: Tool policy — name-level
    if (this.toolPolicy.deny?.includes(tool.name)) {
      return { permitted: false, reason: 'Tool is in deny list' };
    }
    if (this.toolPolicy.allow?.length && !this.toolPolicy.allow.includes(tool.name)) {
      return { permitted: false, reason: 'Tool not in allow list' };
    }

    // Layer 1: Tool policy — group-level
    if (this.toolPolicy.groups?.deny?.includes(tool.group)) {
      return { permitted: false, reason: `Tool group "${tool.group}" is denied` };
    }
    if (
      this.toolPolicy.groups?.allow?.length &&
      !this.toolPolicy.groups.allow.includes(tool.group)
    ) {
      return { permitted: false, reason: `Tool group "${tool.group}" not in allowed groups` };
    }

    // Layer 2: Exec approvals
    if (tool.name === 'exec') {
      if (this.execApprovals.mode === 'deny') {
        return { permitted: false, reason: 'All exec calls are blocked' };
      }
      if (this.execApprovals.mode === 'allowlist') {
        const command = (input as { command: string }).command;
        const approved = this.execApprovals.approvals.some((a) => minimatch(command, a.pattern));
        if (!approved) {
          return { permitted: false, reason: `Command not in approved list: ${command}` };
        }
      }
    }

    return { permitted: true };
  }

  updateToolPolicy(policy: ToolPolicy): void {
    this.toolPolicy = policy;
  }

  updateExecApprovals(config: ExecApprovalConfig): void {
    this.execApprovals = config;
  }
}
