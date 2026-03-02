import type { ChannelManager } from '@oclaw/channels';
import type { Config } from '@oclaw/config';
import type { MemoryFileStore } from '@oclaw/memory';
import type { PipelineStage } from '@oclaw/pipeline';
import type { Logger, Message, Session } from '@oclaw/shared';
import type { ToolHandler } from '@oclaw/tools';
import type { PluginManifest } from './manifest.js';

export type { PluginManifest };

export interface HookEvent {
  name: string;
  data: unknown;
  session?: Session;
  messages?: Message[];
  timestamp: Date;
}

export type HookHandler = (event: HookEvent) => Promise<void>;

export type RouteHandler = (req: Request) => Promise<Response> | Response;

export type RpcHandler = (params: Record<string, unknown>) => Promise<unknown> | unknown;

export interface BackgroundService {
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): 'running' | 'stopped' | 'error';
}

export interface CommandResult {
  response?: string;
}

export interface PluginCommandHandler {
  name: string;
  aliases?: string[];
  description: string;
  execute(args: string): Promise<CommandResult>;
}

export interface PluginRuntime {
  config: Config;
  logger: Logger;
  sessions: IPluginSessionManager;
  memory?: MemoryFileStore;
  channels?: ChannelManager;
}

export interface IPluginSessionManager {
  size(): number;
}

export interface PluginApi {
  registerTool(handler: ToolHandler): void;
  registerCommand(handler: PluginCommandHandler): void;
  registerRoute(method: string, path: string, handler: RouteHandler): void;
  registerRpcMethod(name: string, handler: RpcHandler): void;
  registerHook(event: string, handler: HookHandler, priority?: number): void;
  registerService(name: string, service: BackgroundService): void;
  registerPipelineStage(
    stage: PipelineStage,
    position?: 'before' | 'after',
    relativeTo?: string
  ): void;

  runtime: PluginRuntime;
  getConfig<T>(): T;
}

export type PluginStatus = 'loaded' | 'initialized' | 'running' | 'stopped' | 'error';

export interface Plugin {
  manifest: PluginManifest;
  status: PluginStatus;
  error?: Error;

  init?(api: PluginApi): Promise<void>;
  start?(api: PluginApi): Promise<void>;
  stop?(): Promise<void>;
}

export type PluginFactory = () => Omit<Plugin, 'manifest' | 'status'>;

export interface PluginSystemConfig {
  config: Config;
  runtime: PluginRuntime;
}

export interface RegisteredTool {
  pluginId: string;
  handler: ToolHandler;
}

export interface RegisteredCommand {
  pluginId: string;
  handler: PluginCommandHandler;
}

export interface RegisteredRoute {
  pluginId: string;
  method: string;
  path: string;
  handler: RouteHandler;
}

export interface RegisteredRpcMethod {
  pluginId: string;
  name: string;
  handler: RpcHandler;
}

export interface RegisteredService {
  pluginId: string;
  name: string;
  service: BackgroundService;
}

export interface RegisteredPipelineStage {
  pluginId: string;
  stage: PipelineStage;
  position?: 'before' | 'after';
  relativeTo?: string;
}
