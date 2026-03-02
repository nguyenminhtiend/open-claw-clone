import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import type { ToolContext, ToolHandler, ToolResult } from '../types.js';

const fileWriteSchema = z.object({
  path: z.string().describe('File path (relative to workspace or absolute)'),
  content: z.string().describe('Content to write'),
});

export const fileWriteTool: ToolHandler = {
  definition: {
    name: 'file_write',
    description: 'Write content to a file (creates or overwrites)',
    parameters: fileWriteSchema,
    group: 'fs',
  },

  async execute(input, context: ToolContext): Promise<ToolResult> {
    const { path: filePath, content } = fileWriteSchema.parse(input);
    const fullPath = resolve(context.workdir, filePath);

    if (!fullPath.startsWith(context.workdir)) {
      return { output: 'Path traversal denied', error: 'security', durationMs: 0 };
    }

    try {
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, 'utf-8');
      return {
        output: `Written ${content.length} bytes to ${filePath}`,
        durationMs: 0,
      };
    } catch (err) {
      return {
        output: `Failed to write file: ${err instanceof Error ? err.message : String(err)}`,
        error: 'write_error',
        durationMs: 0,
      };
    }
  },
};
