export { pluginManifestSchema } from './manifest.js';
export type { PluginManifest, PluginCapability } from './manifest.js';

export type {
  Plugin,
  PluginApi,
  PluginFactory,
  PluginStatus,
  PluginRuntime,
  PluginCommandHandler,
  BackgroundService,
  HookEvent,
  HookHandler,
  RouteHandler,
  RpcHandler,
  RegisteredTool,
  RegisteredCommand,
  RegisteredRoute,
  RegisteredRpcMethod,
  RegisteredService,
  RegisteredPipelineStage,
} from './types.js';

export { HookSystem } from './hooks.js';
export { PluginLoader } from './loader.js';
export { PluginRegistry } from './registry.js';
export { PluginApiFactory } from './api.js';
export type { PluginRegistrations } from './api.js';

export { createPluginSystem } from './system.js';
export type { PluginSystem } from './system.js';
