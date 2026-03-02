import { mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileWriteTool } from '../../src/built-in/file-write.js';
import { makeCtx } from '../helpers.js';

const workdir = join(tmpdir(), 'oclaw-test-file-write');

beforeAll(async () => {
  await mkdir(workdir, { recursive: true });
});

afterAll(async () => {
  await rm(workdir, { recursive: true, force: true });
});

describe('fileWriteTool', () => {
  it('writes a file', async () => {
    const result = await fileWriteTool.execute(
      { path: 'out.txt', content: 'hello' },
      makeCtx({ workdir })
    );
    expect(result.error).toBeUndefined();
    const content = await readFile(join(workdir, 'out.txt'), 'utf-8');
    expect(content).toBe('hello');
  });

  it('creates intermediate directories', async () => {
    const result = await fileWriteTool.execute(
      { path: 'nested/deep/file.txt', content: 'data' },
      makeCtx({ workdir })
    );
    expect(result.error).toBeUndefined();
    const content = await readFile(join(workdir, 'nested/deep/file.txt'), 'utf-8');
    expect(content).toBe('data');
  });

  it('blocks path traversal', async () => {
    const result = await fileWriteTool.execute(
      { path: '../../etc/evil', content: 'bad' },
      makeCtx({ workdir })
    );
    expect(result.error).toBe('security');
  });
});
