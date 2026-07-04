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
  private readonly fallbackModels: string[];

  constructor(config: {
    apiKey: string;
    timeoutMs: number;
    maxRetries: number;
    fallbackModels?: string[];
  }) {
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs;
    this.maxRetries = config.maxRetries;
    this.fallbackModels = config.fallbackModels ?? [];
  }

  async chat(model: string, messages: LLMMessage[], options: LLMChatOptions = {}): Promise<string> {
    // Try the requested model first, then each fallback in priority order.
    const candidates = [model, ...this.fallbackModels.filter((m) => m !== model)];
    let lastError: unknown;

    for (let i = 0; i < candidates.length; i++) {
      const currentModel = candidates[i]!;
      const isLastCandidate = i === candidates.length - 1;

      logger.debug('Sending request to OpenRouter', {
        model: currentModel,
        messageCount: messages.length,
        jsonMode: options.jsonMode,
        fallbackAttempt: i > 0,
      });

      try {
        const text = await this.tryModel(currentModel, messages, options, isLastCandidate);
        if (i > 0) {
          logger.info('Fallback model succeeded', { model: currentModel, requestedModel: model });
        }
        return text;
      } catch (error) {
        lastError = error;
        const isRateLimit = this.isRateLimitError(error);
        logger.warn(isRateLimit ? 'Model rate-limited' : 'Model request failed', {
          failedModel: currentModel,
          nextModel: isLastCandidate ? null : candidates[i + 1],
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw lastError;
  }

  /**
   * Rate limits don't improve by retrying the SAME model — only retry for
   * transient/network errors. Each model gets up to 2 quick attempts before
   * falling through to the next fallback model (or failing on the last one).
   */
  private async tryModel(
    model: string,
    messages: LLMMessage[],
    options: LLMChatOptions,
    isLastCandidate: boolean,
  ): Promise<string> {
    const result = await withRetry(
      () =>
        withTimeout(
          this.sendRequest(model, messages, options),
          this.timeoutMs,
          `OpenRouter request timed out after ${this.timeoutMs}ms (model: ${model})`,
        ),
      {
        maxAttempts: isLastCandidate ? this.maxRetries : 2,
        initialDelayMs: 3000,
        maxDelayMs: 10_000,
        backoffMultiplier: 2,
        // Don't waste time retrying a rate-limited model — move to the next one instead,
        // unless this is the only/last model left, in which case retry with backoff.
        retryIf: (err) => isLastCandidate || !this.isRateLimitError(err),
        onRetry: (err, attempt) => {
          logger.warn('Retrying same model', {
            model,
            attempt,
            error: err instanceof Error ? err.message : String(err),
          });
        },
      },
    );

    return result.trim();
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

  private isRateLimitError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      msg.toLowerCase().includes('rate limit') ||
      msg.includes('429') ||
      (err instanceof ExternalServiceError &&
        typeof (err.details as Record<string, unknown>)?.['status'] === 'number' &&
        ((err.details as Record<string, unknown>)['status'] as number) === 429)
    );
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

    // Detect 429 from HTTP status OR from provider error body (OpenRouter wraps
    // upstream 429s as HTTP 200 with error.code = 429 in some configurations).
    const errorCode = json.error?.code ?? response.status;
    const isRateLimit = response.status === 429 || errorCode === 429;

    if (!response.ok || json.error) {
      const msg = isRateLimit
        ? `Rate limit (429): ${json.error?.message ?? 'too many requests'}`
        : (json.error?.message ?? `HTTP ${response.status}`);
      throw new ExternalServiceError('OpenRouter', msg, { status: errorCode, model });
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
