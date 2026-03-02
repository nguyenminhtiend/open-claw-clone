import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from '../src/registry.js';
import type { ToolHandler } from '../src/types.js';

const makeHandler = (name: string, group: 'fs' | 'net' | 'runtime' = 'fs'): ToolHandler => ({
  definition: {
    name,
    description: `${name} tool`,
    parameters: z.object({ value: z.string() }),
    group,
  },
  execute: async () => ({ output: 'ok', durationMs: 0 }),
});

describe('ToolRegistry', () => {
  it('registers and retrieves a tool by name', () => {
    const registry = new ToolRegistry();
    const handler = makeHandler('my_tool');
    registry.register(handler);
    expect(registry.get('my_tool')).toBe(handler);
  });

  it('returns undefined for unknown tools', () => {
    const registry = new ToolRegistry();
    expect(registry.get('nope')).toBeUndefined();
  });

  it('getAll returns all registered tools', () => {
    const registry = new ToolRegistry();
    registry.register(makeHandler('a'));
    registry.register(makeHandler('b'));
    expect(registry.getAll()).toHaveLength(2);
  });

  it('getByGroup filters by group', () => {
    const registry = new ToolRegistry();
    registry.register(makeHandler('a', 'fs'));
    registry.register(makeHandler('b', 'net'));
    registry.register(makeHandler('c', 'fs'));
    expect(registry.getByGroup('fs')).toHaveLength(2);
    expect(registry.getByGroup('net')).toHaveLength(1);
  });

  it('toFunctionSchemas produces LLM-compatible schemas', () => {
    const registry = new ToolRegistry();
    registry.register(makeHandler('tool_x'));
    const [schema] = registry.toFunctionSchemas();
    expect(schema.name).toBe('tool_x');
    expect(schema.description).toBe('tool_x tool');
    expect(schema.input_schema).toHaveProperty('properties');
  });

  it('toAgentToolDefinitions has inputSchema with type object', () => {
    const registry = new ToolRegistry();
    registry.register(makeHandler('tool_y'));
    const [def] = registry.toAgentToolDefinitions();
    expect(def.inputSchema.type).toBe('object');
  });
});
