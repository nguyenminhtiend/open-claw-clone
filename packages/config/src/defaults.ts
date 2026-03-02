import type { Config } from './schema.js';

export const defaults: Config = {
  gateway: {
    port: 18789,
    host: '127.0.0.1',
    auth: {
      enabled: false,
    },
  },
  agents: {
    defaults: {
      provider: {
        name: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
      },
      maxTokens: 4096,
      temperature: 0.7,
      memoryEnabled: true,
    },
    named: {},
  },
  channels: {},
  plugins: {
    enabled: [],
    paths: [],
  },
};
