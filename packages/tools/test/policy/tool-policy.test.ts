import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PolicyEngine } from '../../src/policy/engine.js';
import type { ToolDefinition } from '../../src/types.js';
import { makeCtx } from '../helpers.js';

const def = (name: string, group: ToolDefinition['group'] = 'fs'): ToolDefinition => ({
  name,
  description: name,
  parameters: z.object({}),
  group,
});

describe('PolicyEngine — tool policy', () => {
  it('permits by default', async () => {
    const engine = new PolicyEngine();
    const result = await engine.check(def('any'), {}, makeCtx());
    expect(result.permitted).toBe(true);
  });

  it('blocks tools in deny list', async () => {
    const engine = new PolicyEngine({ deny: ['bad_tool'] });
    const result = await engine.check(def('bad_tool'), {}, makeCtx());
    expect(result.permitted).toBe(false);
    expect(result.reason).toMatch(/deny list/);
  });

  it('blocks tools not in allow list', async () => {
    const engine = new PolicyEngine({ allow: ['good_tool'] });
    const result = await engine.check(def('other_tool'), {}, makeCtx());
    expect(result.permitted).toBe(false);
    expect(result.reason).toMatch(/allow list/);
  });

  it('permits tools in allow list', async () => {
    const engine = new PolicyEngine({ allow: ['good_tool'] });
    const result = await engine.check(def('good_tool'), {}, makeCtx());
    expect(result.permitted).toBe(true);
  });

  it('blocks denied groups', async () => {
    const engine = new PolicyEngine({ groups: { deny: ['runtime'] } });
    const result = await engine.check(def('exec', 'runtime'), {}, makeCtx());
    expect(result.permitted).toBe(false);
  });

  it('deny beats allow for same tool name', async () => {
    const engine = new PolicyEngine({ allow: ['exec'], deny: ['exec'] });
    const result = await engine.check(def('exec', 'runtime'), {}, makeCtx());
    expect(result.permitted).toBe(false);
  });
});
