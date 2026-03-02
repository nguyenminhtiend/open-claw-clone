import type { ProviderConfig } from '@oclaw/config';
import { AnthropicProvider } from './anthropic.js';
import { OllamaProvider } from './ollama.js';
import { OpenAIProvider } from './openai.js';
import type { LlmProvider } from './types.js';

export class ProviderRegistry {
  private providers = new Map<string, LlmProvider>();

  register(provider: LlmProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): LlmProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`Unknown provider: "${id}"`);
    }
    return provider;
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }

  list(): LlmProvider[] {
    return Array.from(this.providers.values());
  }

  static fromConfig(config: ProviderConfig): LlmProvider {
    switch (config.name) {
      case 'anthropic':
        return new AnthropicProvider(config.apiKey, config.baseUrl);
      case 'openai':
      case 'openrouter':
      case 'deepseek':
        return new OpenAIProvider(config.apiKey, config.baseUrl);
      case 'ollama':
        return new OllamaProvider(config.baseUrl);
      default:
        throw new Error(`Unsupported provider: "${(config as { name: string }).name}"`);
    }
  }
}

export function createDefaultRegistry(config: ProviderConfig): ProviderRegistry {
  const registry = new ProviderRegistry();
  const provider = ProviderRegistry.fromConfig(config);
  registry.register(provider);
  return registry;
}
