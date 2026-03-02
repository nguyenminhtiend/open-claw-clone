import { z } from 'zod';

export const channelConfigSchema = z.object({
  enabled: z.boolean().default(false),
  token: z.string().optional(),
  dmPolicy: z.enum(['pairing', 'allowlist', 'open']).default('open'),
  allowedUsers: z.array(z.string()).optional(),
  groupPolicy: z
    .object({
      allowedGroups: z.array(z.string()).optional(),
      mentionRequired: z.boolean().optional(),
    })
    .optional(),
  rateLimit: z
    .object({
      messagesPerMinute: z.number().positive(),
    })
    .optional(),
});

export const channelsSchema = z.object({
  telegram: channelConfigSchema.optional(),
  discord: channelConfigSchema.optional(),
  webchat: channelConfigSchema.extend({ enabled: z.boolean().default(true) }).optional(),
});

export const providerSchema = z.object({
  name: z.enum(['anthropic', 'openai', 'ollama', 'openrouter', 'deepseek']),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  model: z.string(),
});

export const gatewaySchema = z.object({
  port: z.number().default(18789),
  host: z.string().default('127.0.0.1'),
  auth: z.object({
    token: z.string().optional(),
    enabled: z.boolean().default(false),
  }),
});

export const agentSchema = z.object({
  provider: providerSchema,
  maxTokens: z.number().default(4096),
  temperature: z.number().default(0.7),
  systemPrompt: z.string().optional(),
  memoryEnabled: z.boolean().default(true),
});

export const configSchema = z.object({
  gateway: gatewaySchema,
  agents: z.object({
    defaults: agentSchema,
    named: z.record(z.string(), agentSchema.partial()).default({}),
  }),
  channels: channelsSchema.default({}),
  plugins: z.object({
    enabled: z.array(z.string()).default([]),
    paths: z.array(z.string()).default([]),
  }),
});

export type Config = z.infer<typeof configSchema>;
export type GatewayConfig = z.infer<typeof gatewaySchema>;
export type AgentConfig = z.infer<typeof agentSchema>;
export type ProviderConfig = z.infer<typeof providerSchema>;
export type ChannelConfig = z.infer<typeof channelConfigSchema>;
export type ChannelsConfig = z.infer<typeof channelsSchema>;
