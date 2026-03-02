import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ConfigError } from '@oclaw/shared'
import JSON5 from 'json5'
import { type ZodError, z } from 'zod'
import { defaults } from './defaults.js'
import { type Config, configSchema } from './schema.js'

type DeepPartial<T> = {
	[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

function deepMerge<T extends object>(base: T, override: DeepPartial<T>): T {
	const result = { ...base } as T
	for (const key of Object.keys(override) as (keyof T)[]) {
		const val = override[key as keyof DeepPartial<T>]
		if (val !== undefined && val !== null) {
			if (
				typeof val === 'object' &&
				!Array.isArray(val) &&
				typeof base[key] === 'object' &&
				!Array.isArray(base[key])
			) {
				result[key] = deepMerge(base[key] as object, val as object) as T[keyof T]
			} else {
				result[key] = val as T[keyof T]
			}
		}
	}
	return result
}

function readJson5File(filePath: string): DeepPartial<Config> | null {
	try {
		const raw = fs.readFileSync(filePath, 'utf-8')
		return JSON5.parse(raw) as DeepPartial<Config>
	} catch {
		return null
	}
}

function applyEnvOverrides(config: Config): Config {
	const result = deepMerge(config, {})

	if (process.env.OCLAW_PORT) {
		result.gateway.port = Number(process.env.OCLAW_PORT)
	}
	if (process.env.OCLAW_HOST) {
		result.gateway.host = process.env.OCLAW_HOST
	}
	if (process.env.OCLAW_AUTH_TOKEN) {
		result.gateway.auth.token = process.env.OCLAW_AUTH_TOKEN
		result.gateway.auth.enabled = true
	}
	if (process.env.ANTHROPIC_API_KEY) {
		result.agents.defaults.provider.apiKey = process.env.ANTHROPIC_API_KEY
	}
	if (process.env.OPENAI_API_KEY) {
		if (result.agents.defaults.provider.name === 'openai') {
			result.agents.defaults.provider.apiKey = process.env.OPENAI_API_KEY
		}
	}

	return result
}

export function loadConfig(workspaceDir = process.cwd()): Config {
	let merged: Config = { ...defaults }

	const globalConfigPath = path.join(os.homedir(), '.openclaw-clone', 'config.json5')
	const globalConfig = readJson5File(globalConfigPath)
	if (globalConfig) {
		merged = deepMerge(merged, globalConfig)
	}

	const workspaceConfigPath = path.join(workspaceDir, 'config.json5')
	const workspaceConfig = readJson5File(workspaceConfigPath)
	if (workspaceConfig) {
		merged = deepMerge(merged, workspaceConfig)
	}

	merged = applyEnvOverrides(merged)

	const result = configSchema.safeParse(merged)
	if (!result.success) {
		throw new ConfigError('Invalid configuration', formatZodError(result.error))
	}

	return result.data
}

function formatZodError(err: ZodError): string {
	return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
}

export type ConfigChangeHandler = (config: Config) => void

export function watchConfig(
	workspaceDir: string,
	onChange: ConfigChangeHandler,
): fs.FSWatcher | null {
	const configPath = path.join(workspaceDir, 'config.json5')
	if (!fs.existsSync(configPath)) return null

	let debounceTimer: ReturnType<typeof setTimeout> | undefined

	const watcher = fs.watch(configPath, () => {
		clearTimeout(debounceTimer)
		debounceTimer = setTimeout(() => {
			try {
				const newConfig = loadConfig(workspaceDir)
				onChange(newConfig)
			} catch {
				// Invalid config — ignore until fixed
			}
		}, 100)
	})

	return watcher
}

export { z }
