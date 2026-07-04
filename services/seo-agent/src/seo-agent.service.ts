import { createLogger, getEnv, AgentError, ExternalServiceError } from '@storyforge/shared';
import { createLLMClient } from '@storyforge/story-agent';
import type { ILLMClient } from '@storyforge/story-agent';
import { buildSeoPrompt, type SeoPromptContext } from './prompts/seo.prompts.js';

const logger = createLogger('seo-agent');

export interface GenerateSeoInput {
  storyTitle: string;
  genre: string;
  episodeNumber: number;
  episodeTitle: string;
  hook: string;
  cliffhanger: string;
  synopsis: string;
  targetAudience?: string;
  language?: string;
  durationSeconds?: number;
}

export interface GenerateSeoResult {
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  category: string;
  thumbnailText: string;
}

interface RawSeoResponse {
  title?: unknown;
  description?: unknown;
  tags?: unknown;
  hashtags?: unknown;
  category?: unknown;
  thumbnailText?: unknown;
}

export class SeoAgentService {
  private readonly llm: ILLMClient;
  private readonly model: string;

  constructor() {
    const env = getEnv();

    this.llm = createLLMClient({
      provider: env.LLM_PROVIDER,
      ollama: {
        baseUrl: env.OLLAMA_BASE_URL,
        timeoutMs: env.OLLAMA_TIMEOUT_MS,
        maxRetries: env.OLLAMA_MAX_RETRIES,
      },
      openrouter: {
        apiKey: env.OPENROUTER_API_KEY ?? '',
        timeoutMs: env.OPENROUTER_TIMEOUT_MS,
        maxRetries: env.OPENROUTER_MAX_RETRIES,
        fallbackModels: env.OPENROUTER_FALLBACK_MODELS.split(',')
          .map((m) => m.trim())
          .filter(Boolean),
      },
    });

    this.model =
      env.LLM_PROVIDER === 'openrouter' ? env.OPENROUTER_SEO_MODEL : env.OLLAMA_SEO_MODEL;

    logger.info('SeoAgentService initialized', { model: this.model, provider: env.LLM_PROVIDER });
  }

  async generateSeo(input: GenerateSeoInput): Promise<GenerateSeoResult> {
    logger.info('Generating SEO metadata', {
      storyTitle: input.storyTitle,
      episodeNumber: input.episodeNumber,
      language: input.language ?? 'EN',
    });

    const ctx: SeoPromptContext = {
      storyTitle: input.storyTitle,
      genre: input.genre,
      episodeNumber: input.episodeNumber,
      episodeTitle: input.episodeTitle,
      hook: input.hook,
      cliffhanger: input.cliffhanger,
      synopsis: input.synopsis,
      targetAudience: input.targetAudience ?? '13-35',
      language: input.language ?? 'EN',
      durationSeconds: input.durationSeconds ?? 40,
    };

    const prompt = buildSeoPrompt(ctx);

    let raw: RawSeoResponse;
    try {
      raw = await this.llm.chatJSON<RawSeoResponse>(
        this.model,
        [
          {
            role: 'system',
            content:
              'You are a professional social media SEO specialist. Always return valid JSON only, no markdown or explanation.',
          },
          { role: 'user', content: prompt },
        ],
        { temperature: 0.7, maxTokens: 1500, jsonMode: true },
      );
    } catch (error) {
      throw new AgentError(
        'seo-agent',
        `LLM call failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }

    const result = this.parseAndValidate(raw);

    logger.info('SEO metadata generated', {
      title: result.title,
      tagCount: result.tags.length,
      hashtagCount: result.hashtags.length,
    });

    return result;
  }

  private parseAndValidate(raw: RawSeoResponse): GenerateSeoResult {
    const title =
      typeof raw.title === 'string' && raw.title.trim()
        ? raw.title.trim().slice(0, 100)
        : 'Untitled Episode';

    const description =
      typeof raw.description === 'string' && raw.description.trim()
        ? raw.description.trim()
        : 'A captivating anime story episode.';

    const tags = Array.isArray(raw.tags)
      ? (raw.tags as unknown[])
          .filter((t): t is string => typeof t === 'string')
          .slice(0, 20)
      : [];

    const hashtags = Array.isArray(raw.hashtags)
      ? (raw.hashtags as unknown[])
          .filter((h): h is string => typeof h === 'string')
          .map((h) => (h.startsWith('#') ? h : `#${h}`))
          .slice(0, 15)
      : [];

    const category =
      typeof raw.category === 'string' ? raw.category : 'Entertainment';

    const thumbnailText =
      typeof raw.thumbnailText === 'string' && raw.thumbnailText.trim()
        ? raw.thumbnailText.trim().slice(0, 50)
        : title.slice(0, 50);

    if (!tags.length || !hashtags.length) {
      throw new ExternalServiceError('seo-agent', 'LLM returned incomplete SEO data', { raw });
    }

    return { title, description, tags, hashtags, category, thumbnailText };
  }
}
