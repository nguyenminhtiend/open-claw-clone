export { loadConfig, watchConfig } from './loader.js';
export type { ConfigChangeHandler } from './loader.js';

export { defaults } from './defaults.js';

export {
  configSchema,
  gatewaySchema,
  agentSchema,
  providerSchema,
  channelConfigSchema,
  channelsSchema,
} from './schema.js';
export type {
  Config,
  GatewayConfig,
  AgentConfig,
  ProviderConfig,
  ChannelConfig,
  ChannelsConfig,
} from './schema.js';
