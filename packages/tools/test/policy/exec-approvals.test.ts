import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PolicyEngine } from '../../src/policy/engine.js';
import { makeCtx } from '../helpers.js';

const execDef = {
  name: 'exec',
  description: 'exec',
  parameters: z.object({ command: z.string() }),
  group: 'runtime' as const,
  dangerous: true,
};

describe('PolicyEngine — exec approvals', () => {
  it('mode=full allows any command', async () => {
    const engine = new PolicyEngine({}, { mode: 'full', approvals: [] });
    const result = await engine.check(execDef, { command: 'rm -rf /' }, makeCtx());
    expect(result.permitted).toBe(true);
  });

  it('mode=deny blocks all exec', async () => {
    const engine = new PolicyEngine({}, { mode: 'deny', approvals: [] });
    const result = await engine.check(execDef, { command: 'ls' }, makeCtx());
    expect(result.permitted).toBe(false);
    expect(result.reason).toMatch(/blocked/);
  });

  it('mode=allowlist permits matching pattern', async () => {
    const engine = new PolicyEngine(
      {},
      // minimatch * matches any char except /; ls* matches commands starting with 'ls'
      { mode: 'allowlist', approvals: [{ pattern: 'ls*', addedBy: 'user' }] }
    );
    const result = await engine.check(execDef, { command: 'ls -la' }, makeCtx());
    expect(result.permitted).toBe(true);
  });

  it('mode=allowlist blocks non-matching command', async () => {
    const engine = new PolicyEngine(
      {},
      { mode: 'allowlist', approvals: [{ pattern: 'ls*', addedBy: 'user' }] }
    );
    const result = await engine.check(execDef, { command: 'rm -rf /' }, makeCtx());
    expect(result.permitted).toBe(false);
    expect(result.reason).toMatch(/not in approved/);
  });
});
