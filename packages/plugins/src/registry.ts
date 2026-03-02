import { createLogger } from '@oclaw/shared';
import type { Config } from '@oclaw/config';
import type { PluginApiFactory } from './api.js';
import type { HookSystem } from './hooks.js';
import type { LoadedManifest, PluginLoader } from './loader.js';
import type { Plugin } from './types.js';

const logger = createLogger('plugins:registry');

export class PluginRegistry {
  private plugins = new Map<string, Plugin>();
  private loadOrder: string[] = [];

  constructor(
    private loader: PluginLoader,
    private hookSystem: HookSystem,
    private apiFactory: PluginApiFactory
  ) {}

  async loadAll(config: Config): Promise<void> {
    const manifests = await this.loader.discover(config);

    const enabled = manifests.filter(
      (m) => config.plugins.enabled.includes(m.id) || config.plugins.enabled.includes('*')
    );

    const sorted = this.topologicalSort(enabled as LoadedManifest[]);

    for (const manifest of sorted) {
      try {
        const plugin = await this.loader.load(manifest);
        this.plugins.set(manifest.id, plugin);
        this.loadOrder.push(manifest.id);

        const api = this.apiFactory.create(plugin);

        if (plugin.init) {
          await plugin.init(api);
        }
        plugin.status = 'initialized';

        if (plugin.start) {
          await plugin.start(api);
        }
        plugin.status = 'running';

        logger.info({ pluginId: manifest.id }, 'Plugin loaded and started');
      } catch (err) {
        logger.error({ pluginId: manifest.id, err }, 'Failed to load plugin');
        const failed = this.plugins.get(manifest.id);
        if (failed) {
          failed.status = 'error';
          failed.error = err instanceof Error ? err : new Error(String(err));
        }
      }
    }

    await this.hookSystem.emit('plugins:loaded', {
      plugins: Array.from(this.plugins.keys()),
    });
  }

  async stopAll(): Promise<void> {
    for (const id of [...this.loadOrder].reverse()) {
      const plugin = this.plugins.get(id);
      if (plugin?.stop) {
        try {
          await plugin.stop();
          plugin.status = 'stopped';
        } catch (err) {
          logger.error({ pluginId: id, err }, 'Error stopping plugin');
        }
      }
    }
  }

  get(id: string): Plugin | undefined {
    return this.plugins.get(id);
  }

  list(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  private topologicalSort(manifests: LoadedManifest[]): LoadedManifest[] {
    const sorted: LoadedManifest[] = [];
    const visited = new Set<string>();
    const byId = new Map(manifests.map((m) => [m.id, m]));

    const visit = (m: LoadedManifest): void => {
      if (visited.has(m.id)) {
        return;
      }
      visited.add(m.id);
      for (const dep of m.dependencies) {
        const depManifest = byId.get(dep);
        if (depManifest) {
          visit(depManifest);
        }
      }
      sorted.push(m);
    };

    for (const m of manifests) {
      visit(m);
    }

    return sorted;
  }
}
