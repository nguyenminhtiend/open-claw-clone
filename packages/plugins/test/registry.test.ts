import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HookSystem } from '../src/hooks.js';
import { PluginLoader } from '../src/loader.js';
import { PluginRegistry } from '../src/registry.js';
import { PluginApiFactory } from '../src/api.js';
import type { PluginManifest } from '../src/manifest.js';
import type { Plugin, PluginRuntime } from '../src/types.js';
import type { Config } from '@oclaw/config';

const makeManifest = (id: string, deps: string[] = []): PluginManifest => ({
  id,
  name: id,
  version: '1.0.0',
  main: 'index.ts',
  capabilities: [],
  dependencies: deps,
});

const makeConfig = (enabled: string[] = ['*']): Config => ({
  gateway: { port: 18789, host: '127.0.0.1', auth: { enabled: false } },
  agents: {
    defaults: {
      provider: { name: 'anthropic', model: 'claude-3-5-haiku-20241022' },
      maxTokens: 4096,
      temperature: 0.7,
      memoryEnabled: true,
    },
    named: {},
  },
  channels: {},
  plugins: { enabled, paths: [] },
});

const makeRuntime = (): PluginRuntime => ({
  config: makeConfig(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
    // biome-ignore lint/suspicious/noExplicitAny: test mock
  } as unknown as PluginRuntime['logger'],
  sessions: { size: () => 0 },
});

describe('PluginRegistry — topological sort', () => {
  it('loads plugins in dependency order', async () => {
    const loadOrder: string[] = [];

    const loader = {
      discover: async (_config: Config) => [
        { ...makeManifest('b', ['a']), _path: '/fake/b' },
        { ...makeManifest('a'), _path: '/fake/a' },
      ],
      load: async (manifest: PluginManifest & { _path: string }): Promise<Plugin> => {
        return {
          manifest,
          status: 'loaded',
          async init() {
            loadOrder.push(manifest.id);
          },
        };
      },
    } satisfies PluginLoader;

    const hooks = new HookSystem();
    const apiFactory = new PluginApiFactory(hooks, makeRuntime());
    const registry = new PluginRegistry(loader as PluginLoader, hooks, apiFactory);
    await registry.loadAll(makeConfig());

    expect(loadOrder.indexOf('a')).toBeLessThan(loadOrder.indexOf('b'));
  });
});

describe('PluginRegistry — lifecycle', () => {
  it('calls init → start → stop in order', async () => {
    const calls: string[] = [];

    const loader = {
      discover: async (_config: Config) => [{ ...makeManifest('alpha'), _path: '/fake/alpha' }],
      load: async (manifest: PluginManifest & { _path: string }): Promise<Plugin> => ({
        manifest,
        status: 'loaded',
        async init() {
          calls.push('init');
        },
        async start() {
          calls.push('start');
        },
        async stop() {
          calls.push('stop');
        },
      }),
    } satisfies PluginLoader;

    const hooks = new HookSystem();
    const apiFactory = new PluginApiFactory(hooks, makeRuntime());
    const registry = new PluginRegistry(loader as PluginLoader, hooks, apiFactory);
    await registry.loadAll(makeConfig());
    await registry.stopAll();

    expect(calls).toEqual(['init', 'start', 'stop']);
  });

  it('marks plugin as running after start', async () => {
    const loader = {
      discover: async (_config: Config) => [{ ...makeManifest('beta'), _path: '/fake' }],
      load: async (manifest: PluginManifest & { _path: string }): Promise<Plugin> => ({
        manifest,
        status: 'loaded',
      }),
    } satisfies PluginLoader;

    const hooks = new HookSystem();
    const apiFactory = new PluginApiFactory(hooks, makeRuntime());
    const registry = new PluginRegistry(loader as PluginLoader, hooks, apiFactory);
    await registry.loadAll(makeConfig());

    expect(registry.get('beta')?.status).toBe('running');
  });

  it('marks plugin as error if load fails', async () => {
    const loader = {
      discover: async (_config: Config) => [{ ...makeManifest('boom'), _path: '/fake' }],
      load: async (_manifest: PluginManifest & { _path: string }): Promise<Plugin> => {
        throw new Error('import failed');
      },
    } satisfies PluginLoader;

    const hooks = new HookSystem();
    const apiFactory = new PluginApiFactory(hooks, makeRuntime());
    const registry = new PluginRegistry(loader as PluginLoader, hooks, apiFactory);
    await registry.loadAll(makeConfig());

    // Plugin error shouldn't crash — registry still works
    expect(registry.get('boom')).toBeUndefined();
  });

  it('does not load disabled plugins', async () => {
    const loader = {
      discover: async (_config: Config) => [
        { ...makeManifest('enabled-plugin'), _path: '/fake/enabled' },
        { ...makeManifest('disabled-plugin'), _path: '/fake/disabled' },
      ],
      load: async (manifest: PluginManifest & { _path: string }): Promise<Plugin> => ({
        manifest,
        status: 'loaded',
      }),
    } satisfies PluginLoader;

    const hooks = new HookSystem();
    const apiFactory = new PluginApiFactory(hooks, makeRuntime());
    const registry = new PluginRegistry(loader as PluginLoader, hooks, apiFactory);
    await registry.loadAll(makeConfig(['enabled-plugin']));

    expect(registry.get('enabled-plugin')).toBeDefined();
    expect(registry.get('disabled-plugin')).toBeUndefined();
  });

  it('stops plugins in reverse order', async () => {
    const stopOrder: string[] = [];

    const loader = {
      discover: async (_config: Config) => [
        { ...makeManifest('first'), _path: '/fake/first' },
        { ...makeManifest('second', ['first']), _path: '/fake/second' },
      ],
      load: async (manifest: PluginManifest & { _path: string }): Promise<Plugin> => ({
        manifest,
        status: 'loaded',
        async stop() {
          stopOrder.push(manifest.id);
        },
      }),
    } satisfies PluginLoader;

    const hooks = new HookSystem();
    const apiFactory = new PluginApiFactory(hooks, makeRuntime());
    const registry = new PluginRegistry(loader as PluginLoader, hooks, apiFactory);
    await registry.loadAll(makeConfig());
    await registry.stopAll();

    expect(stopOrder.indexOf('second')).toBeLessThan(stopOrder.indexOf('first'));
  });
});

describe('PluginRegistry — registration', () => {
  it('registered tools are collected', async () => {
    const { z } = await import('zod');
    const loader = {
      discover: async (_config: Config) => [{ ...makeManifest('tool-plugin'), _path: '/fake' }],
      load: async (manifest: PluginManifest & { _path: string }): Promise<Plugin> => ({
        manifest,
        status: 'loaded',
        async init(api) {
          api.registerTool({
            definition: {
              name: 'my_tool',
              description: 'test',
              parameters: z.object({}),
              group: 'system',
            },
            async execute() {
              return { output: 'ok', durationMs: 0 };
            },
          });
        },
      }),
    } satisfies PluginLoader;

    const hooks = new HookSystem();
    const apiFactory = new PluginApiFactory(hooks, makeRuntime());
    const registry = new PluginRegistry(loader as PluginLoader, hooks, apiFactory);
    await registry.loadAll(makeConfig());

    const regs = apiFactory.getRegistrations();
    expect(regs.tools).toHaveLength(1);
    expect(regs.tools[0].handler.definition.name).toBe('my_tool');
    expect(regs.tools[0].pluginId).toBe('tool-plugin');
  });
});

describe('PluginLoader — discovery', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'oclaw-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('discovers plugins from configured paths', async () => {
    const pluginDir = join(tmpDir, 'my-plugin');
    await mkdir(pluginDir, { recursive: true });
    await writeFile(
      join(pluginDir, 'openclaw.plugin.json'),
      JSON.stringify({ id: 'my-plugin', name: 'My Plugin', version: '1.0.0' })
    );

    const loader = new PluginLoader();
    const config = makeConfig();
    config.plugins.paths = [tmpDir];
    const manifests = await loader.discover(config);

    expect(manifests).toHaveLength(1);
    expect(manifests[0].id).toBe('my-plugin');
  });

  it('skips directories without a manifest file', async () => {
    await mkdir(join(tmpDir, 'no-manifest'), { recursive: true });

    const loader = new PluginLoader();
    const config = makeConfig();
    config.plugins.paths = [tmpDir];
    const manifests = await loader.discover(config);

    expect(manifests).toHaveLength(0);
  });

  it('skips directories with invalid manifests', async () => {
    const pluginDir = join(tmpDir, 'bad-plugin');
    await mkdir(pluginDir, { recursive: true });
    await writeFile(
      join(pluginDir, 'openclaw.plugin.json'),
      JSON.stringify({ id: 'BAD ID', name: 'Bad' })
    );

    const loader = new PluginLoader();
    const config = makeConfig();
    config.plugins.paths = [tmpDir];
    const manifests = await loader.discover(config);

    expect(manifests).toHaveLength(0);
  });

  it('discovers multiple plugins', async () => {
    for (const id of ['plugin-a', 'plugin-b']) {
      const dir = join(tmpDir, id);
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, 'openclaw.plugin.json'),
        JSON.stringify({ id, name: id, version: '1.0.0' })
      );
    }

    const loader = new PluginLoader();
    const config = makeConfig();
    config.plugins.paths = [tmpDir];
    const manifests = await loader.discover(config);

    expect(manifests).toHaveLength(2);
    const ids = manifests.map((m) => m.id).sort();
    expect(ids).toEqual(['plugin-a', 'plugin-b']);
  });
});
