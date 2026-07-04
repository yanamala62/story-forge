import { createLogger } from '@storyforge/shared';
import type { ILLMClient } from './llm.interface.js';
import { OllamaClient } from './ollama.client.js';
import { OpenRouterClient } from './openrouter.client.js';

const logger = createLogger('llm-factory');

export type LLMProvider = 'ollama' | 'openrouter';

export interface LLMFactoryConfig {
  provider: LLMProvider;
  ollama: { baseUrl: string; timeoutMs: number; maxRetries: number };
  openrouter: { apiKey: string; timeoutMs: number; maxRetries: number; fallbackModels?: string[] };
}

export function createLLMClient(config: LLMFactoryConfig): ILLMClient {
  logger.info(`LLM provider: ${config.provider}`);

  switch (config.provider) {
    case 'openrouter':
      if (!config.openrouter.apiKey) {
        throw new Error('OPENROUTER_API_KEY is required when LLM_PROVIDER=openrouter');
      }
      return new OpenRouterClient(config.openrouter);

    case 'ollama':
      return new OllamaClient(config.ollama);

    default:
      throw new Error(`Unknown LLM provider: ${String(config.provider)}`);
  }
}
