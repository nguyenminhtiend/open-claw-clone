import { describe, expect, it } from 'vitest';
import { execTool } from '../../src/built-in/exec.js';
import { makeCtx } from '../helpers.js';

describe('execTool', () => {
  it('runs a command and captures stdout', async () => {
    const result = await execTool.execute(
      { command: 'echo hello' },
      makeCtx({ workdir: process.cwd() })
    );
    expect(result.output.trim()).toBe('hello');
    expect(result.exitCode).toBe(0);
  });

  it('captures stderr', async () => {
    const result = await execTool.execute(
      { command: 'echo err >&2' },
      makeCtx({ workdir: process.cwd() })
    );
    expect(result.output).toContain('err');
  });

  it('captures non-zero exit code', async () => {
    const result = await execTool.execute(
      { command: 'exit 42' },
      makeCtx({ workdir: process.cwd() })
    );
    expect(result.exitCode).toBe(42);
  });

  it('respects workdir', async () => {
    const result = await execTool.execute({ command: 'pwd', workdir: '/tmp' }, makeCtx());
    // /tmp resolves to /private/tmp on macOS
    expect(result.output.trim()).toMatch(/\/tmp$/);
  });
});
