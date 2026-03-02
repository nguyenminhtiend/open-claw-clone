import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileReadTool } from '../../src/built-in/file-read.js';
import { makeCtx } from '../helpers.js';

const workdir = join(tmpdir(), 'oclaw-test-file-read');
const testFile = join(workdir, 'test.txt');

beforeAll(async () => {
  await mkdir(workdir, { recursive: true });
  await writeFile(testFile, 'line1\nline2\nline3\nline4\nline5\n', 'utf-8');
});

afterAll(async () => {
  await rm(workdir, { recursive: true, force: true });
});

describe('fileReadTool', () => {
  it('reads full file', async () => {
    const result = await fileReadTool.execute({ path: 'test.txt' }, makeCtx({ workdir }));
    expect(result.output).toContain('line1');
    expect(result.output).toContain('line5');
  });

  it('reads a line range', async () => {
    const result = await fileReadTool.execute(
      { path: 'test.txt', startLine: 2, endLine: 3 },
      makeCtx({ workdir })
    );
    expect(result.output).toContain('2|line2');
    expect(result.output).toContain('3|line3');
    expect(result.output).not.toContain('line1');
    expect(result.output).not.toContain('line4');
  });

  it('blocks path traversal', async () => {
    const result = await fileReadTool.execute({ path: '../../etc/passwd' }, makeCtx({ workdir }));
    expect(result.error).toBe('security');
  });

  it('returns error for missing file', async () => {
    const result = await fileReadTool.execute({ path: 'nope.txt' }, makeCtx({ workdir }));
    expect(result.error).toBe('read_error');
  });
});
