import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ToolExecutor } from '../src/executor.js';
import { PolicyEngine } from '../src/policy/engine.js';
import { ToolRegistry } from '../src/registry.js';
import type { ToolHandler } from '../src/types.js';
import { makeCtx } from './helpers.js';

const echoHandler: ToolHandler = {
  definition: {
    name: 'echo',
    description: 'echo',
    parameters: z.object({ msg: z.string() }),
    group: 'system',
  },
  execute: async (input) => ({
    output: (input as { msg: string }).msg,
    durationMs: 0,
  }),
};

describe('ToolExecutor', () => {
  it('executes a valid tool call', async () => {
    const registry = new ToolRegistry();
    registry.register(echoHandler);
    const executor = new ToolExecutor(registry, new PolicyEngine());
    const result = await executor.execute('echo', { msg: 'hello' }, makeCtx());
    expect(result.output).toBe('hello');
    expect(result.error).toBeUndefined();
  });

  it('returns not_found for unknown tool', async () => {
    const executor = new ToolExecutor(new ToolRegistry(), new PolicyEngine());
    const result = await executor.execute('nope', {}, makeCtx());
    expect(result.error).toBe('not_found');
  });

  it('returns validation_error for bad input', async () => {
    const registry = new ToolRegistry();
    registry.register(echoHandler);
    const executor = new ToolExecutor(registry, new PolicyEngine());
    const result = await executor.execute('echo', { msg: 123 }, makeCtx());
    expect(result.error).toBe('validation_error');
  });

  it('returns policy_denied when tool is blocked', async () => {
    const registry = new ToolRegistry();
    registry.register(echoHandler);
    const policy = new PolicyEngine({ deny: ['echo'] });
    const executor = new ToolExecutor(registry, policy);
    const result = await executor.execute('echo', { msg: 'hi' }, makeCtx());
    expect(result.error).toBe('policy_denied');
  });

  it('sets durationMs on success', async () => {
    const registry = new ToolRegistry();
    registry.register(echoHandler);
    const executor = new ToolExecutor(registry, new PolicyEngine());
    const result = await executor.execute('echo', { msg: 'x' }, makeCtx());
    expect(typeof result.durationMs).toBe('number');
  });
});
