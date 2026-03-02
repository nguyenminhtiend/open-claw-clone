import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { ToolContext, ToolHandler, ToolResult } from '../types.js';

const fileReadSchema = z.object({
  path: z.string().describe('File path (relative to workspace or absolute)'),
  startLine: z.number().int().positive().optional().describe('First line to read (1-indexed)'),
  endLine: z.number().int().positive().optional().describe('Last line to read (inclusive)'),
});

export const fileReadTool: ToolHandler = {
  definition: {
    name: 'file_read',
    description: 'Read a file contents, optionally with a line range',
    parameters: fileReadSchema,
    group: 'fs',
  },

  async execute(input, context: ToolContext): Promise<ToolResult> {
    const { path: filePath, startLine, endLine } = fileReadSchema.parse(input);
    const fullPath = resolve(context.workdir, filePath);

    if (!fullPath.startsWith(context.workdir)) {
      return { output: 'Path traversal denied', error: 'security', durationMs: 0 };
    }

    let content: string;
    try {
      content = await readFile(fullPath, 'utf-8');
    } catch (err) {
      return {
        output: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
        error: 'read_error',
        durationMs: 0,
      };
    }

    const lines = content.split('\n');

    if (startLine !== undefined || endLine !== undefined) {
      const start = (startLine ?? 1) - 1;
      const end = endLine ?? lines.length;
      const slice = lines.slice(start, end);
      return {
        output: slice.map((l, i) => `${start + i + 1}|${l}`).join('\n'),
        durationMs: 0,
      };
    }

    return { output: content, durationMs: 0 };
  },
};
