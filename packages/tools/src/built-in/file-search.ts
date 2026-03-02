import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { glob } from 'glob';
import { z } from 'zod';
import type { ToolContext, ToolHandler, ToolResult } from '../types.js';

const fileSearchSchema = z.object({
  pattern: z.string().describe('Glob pattern (for glob type) or search string (for grep type)'),
  type: z.enum(['glob', 'grep']).default('glob'),
  path: z.string().optional().describe('Directory to search in (relative to workspace)'),
});

export const fileSearchTool: ToolHandler = {
  definition: {
    name: 'file_search',
    description: 'Search for files using glob patterns or grep content search',
    parameters: fileSearchSchema,
    group: 'fs',
  },

  async execute(input, context: ToolContext): Promise<ToolResult> {
    const { pattern, type, path: searchPath } = fileSearchSchema.parse(input);
    const cwd = resolve(context.workdir, searchPath ?? '.');

    if (!cwd.startsWith(context.workdir)) {
      return { output: 'Path traversal denied', error: 'security', durationMs: 0 };
    }

    if (type === 'glob') {
      try {
        const files = await glob(pattern, { cwd });
        return { output: files.join('\n') || '(no matches)', durationMs: 0 };
      } catch (err) {
        return {
          output: `Glob error: ${err instanceof Error ? err.message : String(err)}`,
          error: 'glob_error',
          durationMs: 0,
        };
      }
    }

    // grep via ripgrep
    return new Promise((resolve_) => {
      const proc = spawn('rg', ['--no-heading', pattern, cwd]);
      let output = '';
      let stderr = '';

      proc.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0 && output === '') {
          if (stderr) {
            resolve_({ output: `rg error: ${stderr}`, error: 'grep_error', durationMs: 0 });
          } else {
            resolve_({ output: '(no matches)', durationMs: 0 });
          }
          return;
        }
        resolve_({ output: output.slice(0, 20_000), durationMs: 0 });
      });

      proc.on('error', () => {
        // rg not available — fall back to grep
        const fallback = spawn('grep', ['-r', pattern, cwd]);
        let fb = '';
        fallback.stdout.on('data', (c: Buffer) => {
          fb += c.toString();
        });
        fallback.on('close', () => {
          resolve_({ output: fb.slice(0, 20_000) || '(no matches)', durationMs: 0 });
        });
      });
    });
  },
};
