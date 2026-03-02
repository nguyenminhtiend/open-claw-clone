import { z } from 'zod'

export const providerSchema = z.object({
	name: z.enum(['anthropic', 'openai', 'ollama', 'openrouter', 'deepseek']),
	apiKey: z.string().optional(),
	baseUrl: z.string().url().optional(),
	model: z.string(),
})

export const gatewaySchema = z.object({
	port: z.number().default(18789),
	host: z.string().default('127.0.0.1'),
	auth: z.object({
		token: z.string().optional(),
		enabled: z.boolean().default(false),
	}),
})

export const agentSchema = z.object({
	provider: providerSchema,
	maxTokens: z.number().default(4096),
	temperature: z.number().default(0.7),
	systemPrompt: z.string().optional(),
	memoryEnabled: z.boolean().default(true),
})

export const configSchema = z.object({
	gateway: gatewaySchema,
	agents: z.object({
		defaults: agentSchema,
		named: z.record(z.string(), agentSchema.partial()).default({}),
	}),
	channels: z.record(z.string(), z.unknown()).default({}),
	plugins: z.object({
		enabled: z.array(z.string()).default([]),
		paths: z.array(z.string()).default([]),
	}),
})

export type Config = z.infer<typeof configSchema>
export type GatewayConfig = z.infer<typeof gatewaySchema>
export type AgentConfig = z.infer<typeof agentSchema>
export type ProviderConfig = z.infer<typeof providerSchema>
