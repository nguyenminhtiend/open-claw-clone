import type { ToolContext, ToolHandler, ToolResult } from '@oclaw/tools';
import { z } from 'zod';
import type { VectorStore } from '../vector/store.js';

const schema = z.object({
  query: z.string().describe('What to search for in memory'),
  topK: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(5)
    .describe('Number of results to return'),
});

export function createMemorySearchTool(vectorStore: VectorStore): ToolHandler {
  return {
    definition: {
      name: 'memory_search',
      description: 'Semantically search through memory for relevant past context',
      parameters: schema,
      group: 'memory',
    },

    async execute(input: unknown, _context: ToolContext): Promise<ToolResult> {
      const start = Date.now();
      const { query, topK } = schema.parse(input);

      const results = await vectorStore.search(query, topK);

      if (results.length === 0) {
        return { output: 'No relevant memories found.', durationMs: Date.now() - start };
      }

      const output = results
        .map(
          (r) =>
            `[${r.source}:${r.metadata.lineStart}-${r.metadata.lineEnd}] (score: ${r.score.toFixed(3)})\n${r.content}`
        )
        .join('\n\n---\n\n');

      return { output, durationMs: Date.now() - start };
    },
  };
}
