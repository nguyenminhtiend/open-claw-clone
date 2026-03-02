import type { Config } from '@oclaw/config';
import { PluginApiFactory } from './api.js';
import { HookSystem } from './hooks.js';
import { PluginLoader } from './loader.js';
import { PluginRegistry } from './registry.js';
import type { PluginRegistrations } from './api.js';
import type { Plugin } from './types.js';
import type { PluginRuntime } from './types.js';

export interface PluginSystem {
  registry: PluginRegistry;
  hooks: HookSystem;
  getRegistrations(): PluginRegistrations;
  getPlugin(id: string): Plugin | undefined;
  listPlugins(): Plugin[];
  loadAll(config: Config): Promise<void>;
  stopAll(): Promise<void>;
}

export function createPluginSystem(runtime: PluginRuntime): PluginSystem {
  const hooks = new HookSystem();
  const loader = new PluginLoader();
  const apiFactory = new PluginApiFactory(hooks, runtime);
  const registry = new PluginRegistry(loader, hooks, apiFactory);

  return {
    registry,
    hooks,
    getRegistrations: () => apiFactory.getRegistrations(),
    getPlugin: (id) => registry.get(id),
    listPlugins: () => registry.list(),
    loadAll: (config) => registry.loadAll(config),
    stopAll: () => registry.stopAll(),
  };
}
