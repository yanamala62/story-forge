import { createLogger, withRetry, withTimeout, OllamaError } from '@storyforge/shared';
import type { ILLMClient, LLMMessage, LLMChatOptions } from './llm.interface.js';

const logger = createLogger('ollama-client');

export class OllamaClient implements ILLMClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(config: { baseUrl: string; timeoutMs: number; maxRetries: number }) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeoutMs = config.timeoutMs;
    this.maxRetries = config.maxRetries;
  }

  async chat(model: string, messages: LLMMessage[], options: LLMChatOptions = {}): Promise<string> {
    const payload = {
      model,
      messages,
      stream: false,
      ...(options.jsonMode && { format: 'json' }),
      options: {
        temperature: options.temperature ?? 0.8,
        top_p: options.topP ?? 0.9,
        num_predict: options.maxTokens ?? 4096,
        ...(options.stop && { stop: options.stop }),
      },
    };

    logger.debug('Sending chat request to Ollama', { model, messageCount: messages.length });

    const response = await withRetry(
      () => withTimeout(this.sendRequest(payload), this.timeoutMs),
      {
        maxAttempts: this.maxRetries,
        initialDelayMs: 2000,
        maxDelayMs: 15000,
        onRetry: (err, attempt) => {
          logger.warn('Retrying Ollama request', {
            attempt,
            error: err instanceof Error ? err.message : String(err),
          });
        },
      },
    );

    return (response as { message: { content: string } }).message.content.trim();
  }

  async chatJSON<T>(model: string, messages: LLMMessage[], options: LLMChatOptions = {}): Promise<T> {
    const raw = await this.chat(model, messages, { ...options, jsonMode: true });
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      logger.error('Failed to parse Ollama JSON response', { raw: raw.slice(0, 500) });
      throw new OllamaError('Model returned invalid JSON', { raw: raw.slice(0, 500) });
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return [];
      const data = (await res.json()) as { models: Array<{ name: string }> };
      return data.models.map((m) => m.name);
    } catch {
      return [];
    }
  }

  private async sendRequest(payload: object): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new OllamaError(`Connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new OllamaError(`HTTP ${response.status}: ${body}`, { status: response.status });
    }

    return response.json();
  }
}
