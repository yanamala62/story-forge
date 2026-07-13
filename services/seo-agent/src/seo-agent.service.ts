import { createLogger, getEnv, AgentError, ExternalServiceError } from '@storyforge/shared';
import { OpenRouterClient } from '@storyforge/story-agent';
import type { ILLMClient } from '@storyforge/story-agent';
import { buildSeoPrompt, type SeoPromptContext } from './prompts/seo.prompts.js';
import { buildClipForgeTitlePrompt, type ClipForgeTitlePromptContext } from './prompts/clip-forge-title.prompts.js';
import { buildFallbackClipForgeTitle, validateClipForgeTitle, formatPartLabel } from './clip-forge-title.utils.js';

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

export interface GenerateClipForgeTitleInput {
  originalVideoTitle: string;
  partNumber: number;
  totalParts: number;
  startTime: number;
  endTime: number;
}

export interface GenerateClipForgeTitleResult {
  title: string;
  usedFallback: boolean;
}

export class SeoAgentService {
  private readonly llm: ILLMClient;
  private readonly model: string;

  constructor() {
    const env = getEnv();

    this.llm = new OpenRouterClient({
      apiKey: env.OPENROUTER_API_KEY,
      timeoutMs: env.OPENROUTER_TIMEOUT_MS,
      maxRetries: env.OPENROUTER_MAX_RETRIES,
      fallbackModels: env.OPENROUTER_FALLBACK_MODELS.split(',')
        .map((m) => m.trim())
        .filter(Boolean),
    });

    this.model = env.OPENROUTER_SEO_MODEL;

    logger.info('SeoAgentService initialized', { model: this.model, provider: 'openrouter' });
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

  /**
   * Generates an SEO-friendly title for a single Clip Forge Short. Reuses the
   * SAME OpenRouterClient / model as generateSeo() above — no duplicate LLM
   * client. NEVER throws: any failure (LLM error, timeout, invalid JSON,
   * failed validation) falls back to a deterministic, always-valid title, per
   * the product spec's "DO NOT fail the complete pipeline" rule for SEO
   * generation. The Part number is appended deterministically by this method
   * (never left to the model), so it is always present and always correct.
   */
  async generateClipForgeTitle(input: GenerateClipForgeTitleInput): Promise<GenerateClipForgeTitleResult> {
    const fallback = buildFallbackClipForgeTitle(input.originalVideoTitle, input.partNumber, input.totalParts);

    try {
      const ctx: ClipForgeTitlePromptContext = {
        originalVideoTitle: input.originalVideoTitle,
        partNumber: input.partNumber,
        totalParts: input.totalParts,
        startTime: input.startTime,
        endTime: input.endTime,
      };

      const raw = await this.llm.chatJSON<{ phrase?: unknown }>(
        this.model,
        [
          {
            role: 'system',
            content: 'You are a YouTube Shorts SEO specialist. Always return valid JSON only, no markdown or explanation.',
          },
          { role: 'user', content: buildClipForgeTitlePrompt(ctx) },
        ],
        { temperature: 0.6, maxTokens: 200, jsonMode: true },
      );

      const phrase = typeof raw.phrase === 'string' ? raw.phrase.trim() : '';
      if (!phrase) {
        logger.warn('Clip Forge title generation returned an empty phrase — using fallback', {
          partNumber: input.partNumber,
        });
        return { title: fallback, usedFallback: true };
      }

      // NOTE: partLabel must be computed directly (not parsed back out of the
      // fallback string) — the original video title frequently contains its
      // own " | " separators (e.g. "Title | Artist | Album"), which broke a
      // previous version of this code that tried to extract the label via
      // fallback.split(' | ')[1].
      const partLabel = formatPartLabel(input.partNumber, input.totalParts);
      const candidate = `${phrase} | ${partLabel} #Shorts`;

      const validation = validateClipForgeTitle(candidate, input.partNumber, input.totalParts);
      if (!validation.valid) {
        logger.warn('Generated Clip Forge title failed validation — using fallback', {
          partNumber: input.partNumber,
          reasons: validation.reasons,
        });
        return { title: fallback, usedFallback: true };
      }

      return { title: candidate, usedFallback: false };
    } catch (error) {
      logger.warn('Clip Forge title generation failed — using fallback', {
        partNumber: input.partNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      return { title: fallback, usedFallback: true };
    }
  }
}
