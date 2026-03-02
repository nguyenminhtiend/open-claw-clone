import type { PipelineStage } from '@oclaw/pipeline';
import { createLogger } from '@oclaw/shared';
import type { ToolHandler } from '@oclaw/tools';
import type { Config } from '@oclaw/config';
import type { HookSystem } from './hooks.js';
import type { HookHandler } from './types.js';
import type {
  BackgroundService,
  Plugin,
  PluginApi,
  PluginCommandHandler,
  PluginRuntime,
  RegisteredCommand,
  RegisteredPipelineStage,
  RegisteredRpcMethod,
  RegisteredRoute,
  RegisteredService,
  RegisteredTool,
  RouteHandler,
  RpcHandler,
} from './types.js';

export interface PluginRegistrations {
  tools: RegisteredTool[];
  commands: RegisteredCommand[];
  routes: RegisteredRoute[];
  rpcMethods: RegisteredRpcMethod[];
  services: RegisteredService[];
  pipelineStages: RegisteredPipelineStage[];
}

export class PluginApiFactory {
  private registrations: PluginRegistrations = {
    tools: [],
    commands: [],
    routes: [],
    rpcMethods: [],
    services: [],
    pipelineStages: [],
  };

  constructor(
    private hookSystem: HookSystem,
    private baseRuntime: PluginRuntime
  ) {}

  create(plugin: Plugin): PluginApi {
    const pluginId = plugin.manifest.id;
    const scopedLogger = createLogger(`plugin:${pluginId}`);
    const runtime: PluginRuntime = { ...this.baseRuntime, logger: scopedLogger };
    const { registrations, hookSystem } = this;

    const getConfig = <T>(): T => {
      const pluginConfigs = (runtime.config as Config & { pluginConfigs?: Record<string, unknown> })
        .pluginConfigs;
      return (pluginConfigs?.[pluginId] ?? {}) as T;
    };

    const registerTool = (handler: ToolHandler): void => {
      registrations.tools.push({ pluginId, handler });
      scopedLogger.debug({ tool: handler.definition.name }, 'Tool registered');
    };

    const registerCommand = (handler: PluginCommandHandler): void => {
      registrations.commands.push({ pluginId, handler });
      scopedLogger.debug({ command: handler.name }, 'Command registered');
    };

    const registerRoute = (method: string, path: string, handler: RouteHandler): void => {
      registrations.routes.push({ pluginId, method, path, handler });
      scopedLogger.debug({ method, path }, 'Route registered');
    };

    const registerRpcMethod = (name: string, handler: RpcHandler): void => {
      registrations.rpcMethods.push({ pluginId, name, handler });
      scopedLogger.debug({ rpcMethod: name }, 'RPC method registered');
    };

    const registerHook = (event: string, handler: HookHandler, priority = 0): void => {
      hookSystem.register(event, pluginId, handler, priority);
      scopedLogger.debug({ hookEvent: event, priority }, 'Hook registered');
    };

    const registerService = (name: string, service: BackgroundService): void => {
      registrations.services.push({ pluginId, name, service });
      scopedLogger.debug({ service: name }, 'Service registered');
    };

    const registerPipelineStage = (
      stage: PipelineStage,
      position?: 'before' | 'after',
      relativeTo?: string
    ): void => {
      registrations.pipelineStages.push({ pluginId, stage, position, relativeTo });
      scopedLogger.debug({ stage: stage.name }, 'Pipeline stage registered');
    };

    return {
      runtime,
      getConfig,
      registerTool,
      registerCommand,
      registerRoute,
      registerRpcMethod,
      registerHook,
      registerService,
      registerPipelineStage,
    };
  }

  getRegistrations(): PluginRegistrations {
    return this.registrations;
  }
}
