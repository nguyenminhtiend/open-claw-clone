import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '@oclaw/config';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('loadConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oclaw-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads defaults when no config file exists', () => {
    const config = loadConfig(tmpDir);
    expect(config.gateway.port).toBe(18789);
    expect(config.gateway.host).toBe('127.0.0.1');
    expect(config.gateway.auth.enabled).toBe(false);
  });

  it('merges workspace config over defaults', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'config.json5'),
      JSON.stringify({ gateway: { port: 9999 } })
    );
    const config = loadConfig(tmpDir);
    expect(config.gateway.port).toBe(9999);
    expect(config.gateway.host).toBe('127.0.0.1');
  });

  it('applies env var overrides', () => {
    process.env.OCLAW_PORT = '7777';
    try {
      const config = loadConfig(tmpDir);
      expect(config.gateway.port).toBe(7777);
    } finally {
      // biome-ignore lint/performance/noDelete: required to fully remove env var
      delete process.env.OCLAW_PORT;
    }
  });

  it('throws ConfigError for invalid config', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'config.json5'),
      JSON.stringify({ gateway: { port: 'not-a-number' } })
    );
    expect(() => loadConfig(tmpDir)).toThrow();
  });

  it('loads valid JSON5 with comments', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'config.json5'),
      `{
        // Gateway config
        gateway: {
          port: 12345
        }
      }`
    );
    const config = loadConfig(tmpDir);
    expect(config.gateway.port).toBe(12345);
  });
});
