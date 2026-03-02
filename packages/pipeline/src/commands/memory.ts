import type { CommandHandler, CommandResult, PipelineContext } from '../types.js';

export class MemoryCommand implements CommandHandler {
  name = 'memory';
  description = 'Search memories';

  async execute(args: string, ctx: PipelineContext): Promise<CommandResult> {
    if (!ctx.services.memory) {
      return { response: 'Memory service is not configured.' };
    }

    const query = args.trim();

    if (!query) {
      const content = await ctx.services.memory.readMemory();
      if (!content) {
        return { response: 'No memories stored yet.' };
      }
      const preview = content.slice(0, 500);
      return {
        response: `**Memory Preview**\n\`\`\`\n${preview}${content.length > 500 ? '\n...' : ''}\n\`\`\``,
      };
    }

    try {
      const content = await ctx.services.memory.readMemory();
      if (!content) {
        return { response: 'No memories stored yet.' };
      }

      const lines = content.split('\n');
      const matches = lines
        .filter((line) => line.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 10);

      if (matches.length === 0) {
        return { response: `No memories found matching: "${query}"` };
      }

      return {
        response: [`**Memory Search: "${query}"**`, ...matches.map((l) => `  ${l}`)].join('\n'),
      };
    } catch {
      return { response: 'Failed to search memories.' };
    }
  }
}
