import { generateToolSchema } from './schema/generator.js';
import type { LlmToolSchema } from './schema/generator.js';
import type { ToolGroup, ToolHandler } from './types.js';

export type { LlmToolSchema };

export class ToolRegistry {
  private tools = new Map<string, ToolHandler>();

  register(handler: ToolHandler): void {
    this.tools.set(handler.definition.name, handler);
  }

  get(name: string): ToolHandler | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolHandler[] {
    return Array.from(this.tools.values());
  }

  getByGroup(group: ToolGroup): ToolHandler[] {
    return this.getAll().filter((t) => t.definition.group === group);
  }

  toFunctionSchemas(): LlmToolSchema[] {
    return this.getAll().map((t) => generateToolSchema(t));
  }

  /** Returns definitions in the format expected by @oclaw/agent providers */
  toAgentToolDefinitions(): Array<{
    name: string;
    description: string;
    inputSchema: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  }> {
    return this.getAll().map((t) => {
      const schema = generateToolSchema(t);
      return {
        name: schema.name,
        description: schema.description,
        inputSchema: schema.input_schema as {
          type: 'object';
          properties: Record<string, unknown>;
          required?: string[];
        },
      };
    });
  }
}
