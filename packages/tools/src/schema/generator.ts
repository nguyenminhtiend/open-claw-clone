import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ToolHandler } from '../types.js';

export interface LlmToolSchema {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export function generateToolSchema(tool: ToolHandler): LlmToolSchema {
  const jsonSchema = zodToJsonSchema(tool.definition.parameters, {
    target: 'openApi3',
  }) as Record<string, unknown>;

  // Strip zod-to-json-schema wrapper keys
  const { $schema: _s, definitions: _d, ...cleanSchema } = jsonSchema;

  return {
    name: tool.definition.name,
    description: tool.definition.description,
    input_schema: cleanSchema,
  };
}
