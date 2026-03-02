import type { Session } from '@oclaw/shared';
import type { z } from 'zod';
import type { SandboxConfig } from './policy/sandbox.js';

export type ToolGroup = 'runtime' | 'fs' | 'browser' | 'memory' | 'net' | 'system';

export interface Artifact {
  name: string;
  mimeType: string;
  data: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodTypeAny;
  returns?: z.ZodTypeAny;
  group: ToolGroup;
  requiresApproval?: boolean;
  dangerous?: boolean;
}

export interface ToolContext {
  session: Session;
  workdir: string;
  env: Record<string, string>;
  sandbox: SandboxConfig;
  signal: AbortSignal;
}

export interface ToolResult {
  output: string;
  exitCode?: number;
  artifacts?: Artifact[];
  error?: string;
  durationMs: number;
}

export interface ToolHandler {
  definition: ToolDefinition;
  execute(input: unknown, context: ToolContext): Promise<ToolResult>;
}
