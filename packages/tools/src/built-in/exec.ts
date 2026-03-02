import { spawn } from 'node:child_process';
import { z } from 'zod';
import type { ToolContext, ToolHandler, ToolResult } from '../types.js';

const execSchema = z.object({
  command: z.string().describe('The shell command to execute'),
  workdir: z.string().optional().describe('Working directory (relative to workspace or absolute)'),
  timeout: z.number().optional().default(180).describe('Timeout in seconds'),
  background: z.boolean().optional().default(false),
});

export const execTool: ToolHandler = {
  definition: {
    name: 'exec',
    description: 'Execute a shell command in the workspace',
    parameters: execSchema,
    group: 'runtime',
    dangerous: true,
  },

  async execute(input, context: ToolContext): Promise<ToolResult> {
    const { command, workdir, timeout } = execSchema.parse(input);
    const cwd = workdir ?? context.workdir;
    const timeoutMs = (timeout ?? 180) * 1000;

    return new Promise((resolve) => {
      const proc = spawn('sh', ['-c', command], {
        cwd,
        env: { ...process.env, ...context.env },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      const timer = setTimeout(() => {
        proc.kill('SIGTERM');
        resolve({
          output: `Command timed out after ${timeout}s\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
          exitCode: -1,
          error: 'timeout',
          durationMs: 0,
        });
      }, timeoutMs);

      context.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        proc.kill('SIGTERM');
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          output: stdout + (stderr ? `\nSTDERR:\n${stderr}` : ''),
          exitCode: code ?? 0,
          durationMs: 0,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          output: `Failed to start process: ${err.message}`,
          exitCode: -1,
          error: 'spawn_error',
          durationMs: 0,
        });
      });
    });
  },
};
