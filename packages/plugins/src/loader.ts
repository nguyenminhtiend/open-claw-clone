import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { createJiti } from 'jiti';
import JSON5 from 'json5';
import { createLogger } from '@oclaw/shared';
import type { Config } from '@oclaw/config';
import { pluginManifestSchema } from './manifest.js';
import type { Plugin, PluginFactory } from './types.js';
import type { PluginManifest } from './manifest.js';

const logger = createLogger('plugins:loader');

export type LoadedManifest = PluginManifest & { _path: string };

export class PluginLoader {
  private jiti = createJiti(import.meta.url);

  async discover(config: Config): Promise<LoadedManifest[]> {
    const manifests: LoadedManifest[] = [];
    const searchPaths = [
      ...config.plugins.paths,
      resolve(process.cwd(), '.openclaw-clone', 'extensions'),
      resolve(homedir(), '.openclaw-clone', 'extensions'),
    ];

    for (const searchPath of searchPaths) {
      if (!existsSync(searchPath)) {
        continue;
      }

      let entries: string[];
      try {
        entries = await readdir(searchPath);
      } catch (err) {
        logger.warn({ searchPath, err }, 'Failed to read plugin search path');
        continue;
      }

      for (const entryName of entries) {
        const manifestPath = resolve(searchPath, entryName, 'openclaw.plugin.json');
        if (!existsSync(manifestPath)) {
          continue;
        }

        try {
          const raw = JSON5.parse(await readFile(manifestPath, 'utf-8')) as unknown;
          const parsed = pluginManifestSchema.safeParse(raw);

          if (parsed.success) {
            manifests.push({
              ...parsed.data,
              _path: resolve(searchPath, entryName),
            });
          } else {
            logger.warn({ manifestPath, errors: parsed.error.issues }, 'Invalid plugin manifest');
          }
        } catch (err) {
          logger.warn({ manifestPath, err }, 'Failed to parse plugin manifest');
        }
      }
    }

    return manifests;
  }

  async load(manifest: LoadedManifest): Promise<Plugin> {
    const entryPath = resolve(manifest._path, manifest.main);

    let mod: unknown;
    try {
      mod = await this.jiti.import(entryPath, { default: true });
    } catch (err) {
      throw new Error(
        `Plugin ${manifest.id}: failed to import ${entryPath}: ${(err as Error).message}`
      );
    }

    const pluginFactory = (mod as { default?: unknown })?.default ?? mod;

    if (typeof pluginFactory !== 'function') {
      throw new Error(`Plugin ${manifest.id}: default export must be a factory function`);
    }

    const factory = pluginFactory as PluginFactory;
    const impl = factory();

    const plugin: Plugin = {
      manifest,
      status: 'loaded',
      ...impl,
    };

    return plugin;
  }
}
