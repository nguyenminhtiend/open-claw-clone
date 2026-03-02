import type { ToolContext, ToolHandler, ToolResult } from '@oclaw/tools';
import { z } from 'zod';
import type { DailyLog } from '../daily-log.js';
import type { MemoryFileStore } from '../file-store.js';

const schema = z.object({
  file: z
    .enum(['MEMORY.md', 'SOUL.md', 'AGENTS.md', 'USER.md', 'daily'])
    .describe('Which memory file to read'),
  date: z
    .string()
    .optional()
    .describe('Date for daily log in YYYY-MM-DD format (defaults to today)'),
  startLine: z.number().int().positive().optional().describe('First line to read (1-indexed)'),
  endLine: z.number().int().positive().optional().describe('Last line to read (inclusive)'),
});

export function createMemoryGetTool(fileStore: MemoryFileStore, dailyLog: DailyLog): ToolHandler {
  return {
    definition: {
      name: 'memory_get',
      description:
        'Read specific memory files (MEMORY.md, SOUL.md, AGENTS.md, USER.md, or a daily log)',
      parameters: schema,
      group: 'memory',
    },

    async execute(input: unknown, _context: ToolContext): Promise<ToolResult> {
      const { file, date, startLine, endLine } = schema.parse(input);

      let content: string | null;

      if (file === 'daily') {
        const d = date ? new Date(date) : undefined;
        content = await dailyLog.get(d);
      } else {
        content = await fileStore.readFile(file);
      }

      if (content === null) {
        return {
          output: `File not found: ${file === 'daily' ? `memory/${date ?? 'today'}.md` : file}`,
          durationMs: 0,
        };
      }

      if (startLine !== undefined || endLine !== undefined) {
        const lines = content.split('\n');
        const start = (startLine ?? 1) - 1;
        const end = endLine ?? lines.length;
        content = lines.slice(start, end).join('\n');
      }

      return { output: content, durationMs: 0 };
    },
  };
}
