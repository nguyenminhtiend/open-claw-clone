import { z } from 'zod';

export const pluginManifestSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'Plugin id must be kebab-case (lowercase alphanumeric + dashes)'),
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  author: z.string().optional(),
  main: z.string().default('index.ts'),
  configSchema: z.record(z.unknown()).optional(),
  capabilities: z
    .array(z.enum(['tools', 'commands', 'routes', 'rpc', 'hooks', 'services', 'pipeline']))
    .default([]),
  dependencies: z.array(z.string()).default([]),
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;

export type PluginCapability = PluginManifest['capabilities'][number];
