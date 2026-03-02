import { describe, expect, it } from 'vitest';
import { pluginManifestSchema } from '../src/manifest.js';

describe('pluginManifestSchema', () => {
  it('parses a minimal valid manifest', () => {
    const result = pluginManifestSchema.safeParse({
      id: 'my-plugin',
      name: 'My Plugin',
      version: '1.0.0',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.main).toBe('index.ts');
      expect(result.data.capabilities).toEqual([]);
      expect(result.data.dependencies).toEqual([]);
    }
  });

  it('rejects an id with uppercase letters', () => {
    const result = pluginManifestSchema.safeParse({
      id: 'MyPlugin',
      name: 'Bad',
      version: '1.0.0',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an id with spaces', () => {
    const result = pluginManifestSchema.safeParse({
      id: 'my plugin',
      name: 'Bad',
      version: '1.0.0',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all capability values', () => {
    const result = pluginManifestSchema.safeParse({
      id: 'full-plugin',
      name: 'Full',
      version: '1.0.0',
      capabilities: ['tools', 'commands', 'routes', 'rpc', 'hooks', 'services', 'pipeline'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown capability', () => {
    const result = pluginManifestSchema.safeParse({
      id: 'bad-plugin',
      name: 'Bad',
      version: '1.0.0',
      capabilities: ['unknown-capability'],
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional fields', () => {
    const result = pluginManifestSchema.safeParse({
      id: 'full-plugin',
      name: 'Full',
      version: '1.0.0',
      description: 'A full plugin',
      author: 'Test Author',
      main: 'dist/index.js',
      dependencies: ['other-plugin'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.author).toBe('Test Author');
      expect(result.data.main).toBe('dist/index.js');
      expect(result.data.dependencies).toEqual(['other-plugin']);
    }
  });
});
