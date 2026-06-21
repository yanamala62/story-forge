import { createLogger, withRetry, withTimeout, ExternalServiceError } from '@storyforge/shared';
import type { ILLMClient, LLMMessage, LLMChatOptions } from './llm.interface.js';

const logger = createLogger('openrouter-client');

const BASE_URL = 'https://openrouter.ai/api/v1';

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stop?: string[];
  response_format?: { type: 'json_object' | 'text' };
}

interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: { message: string; code: number };
}

export class OpenRouterClient implements ILLMClient {
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(config: { apiKey: string; timeoutMs: number; maxRetries: number }) {
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs;
    this.maxRetries = config.maxRetries;
  }

  async chat(model: string, messages: LLMMessage[], options: LLMChatOptions = {}): Promise<string> {
    logger.debug('Sending request to OpenRouter', {
      model,
      messageCount: messages.length,
      jsonMode: options.jsonMode,
    });

    const result = await withRetry(
      () =>
        withTimeout(
          this.sendRequest(model, messages, options),
          this.timeoutMs,
          `OpenRouter request timed out after ${this.timeoutMs}ms`,
        ),
      {
        maxAttempts: this.maxRetries,
        initialDelayMs: 5000,
        maxDelayMs: 60000,
        retryIf: (err) => {
          // Don't retry on rate limits — they need a full minute to reset
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('Rate limit') || msg.includes('rate limit')) {
            logger.warn('Rate limit hit — waiting 65 seconds before retry', { model });
            return true; // still retry but the delay below handles the wait
          }
          return true;
        },
        onRetry: (err, attempt) => {
          const msg = err instanceof Error ? err.message : String(err);
          const isRateLimit = msg.includes('Rate limit') || msg.includes('rate limit');
          logger.warn('Retrying OpenRouter request', {
            attempt,
            isRateLimit,
            error: msg.slice(0, 120),
          });
        },
      },
    );

    const text = result.trim();
    logger.debug('OpenRouter response received', { model, outputLength: text.length });
    return text;
  }

  async chatJSON<T>(
    model: string,
    messages: LLMMessage[],
    options: LLMChatOptions = {},
  ): Promise<T> {
    const raw = await this.chat(model, messages, { ...options, jsonMode: true });

    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    try {
      return JSON.parse(cleaned) as T;
    } catch {
      logger.error('Failed to parse OpenRouter JSON response', { raw: raw.slice(0, 500) });
      throw new ExternalServiceError(
        'OpenRouter',
        'Model returned invalid JSON',
        { raw: raw.slice(0, 500) },
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { data: Array<{ id: string }> };
      return data.data.map((m) => m.id);
    } catch {
      return [];
    }
  }

  private async sendRequest(
    model: string,
    messages: LLMMessage[],
    options: LLMChatOptions,
  ): Promise<string> {
    const body: OpenRouterRequest = {
      model,
      messages,
      temperature: options.temperature ?? 0.8,
      top_p: options.topP ?? 0.9,
      max_tokens: options.maxTokens ?? 4096,
      ...(options.stop && { stop: options.stop }),
      ...(options.jsonMode && { response_format: { type: 'json_object' } }),
    };

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://storyforge.ai',
          'X-Title': 'StoryForge AI',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new ExternalServiceError(
        'OpenRouter',
        `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const json = (await response.json()) as OpenRouterResponse;

    if (!response.ok || json.error) {
      throw new ExternalServiceError(
        'OpenRouter',
        json.error?.message ?? `HTTP ${response.status}`,
        { status: response.status, model },
      );
    }

    const content = json.choices[0]?.message?.content;
    if (!content) {
      throw new ExternalServiceError('OpenRouter', 'Empty response from model', { model });
    }

    logger.debug('OpenRouter usage', {
      model,
      promptTokens: json.usage?.prompt_tokens,
      completionTokens: json.usage?.completion_tokens,
    });

    return content;
  }
}
