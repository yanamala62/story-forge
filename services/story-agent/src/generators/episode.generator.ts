import { createLogger, AgentError } from '@storyforge/shared';
import type { StoryMemory, StoryCharacter } from '@storyforge/shared';
import type { StoryGenre, ImageStyle } from '@storyforge/shared';
import type { ILLMClient } from '../clients/llm.interface.js';
import {
  buildFirstEpisodePrompt,
  buildContinuationEpisodePrompt,
} from '../prompts/episode.prompts.js';
import {
  validateGeneratedEpisode,
  normalizeDurations,
  type ValidatedGeneratedEpisode,
} from '../validators/episode.validator.js';

const logger = createLogger('episode-generator');

export interface EpisodeGenerationInput {
  storyTitle: string;
  genre: StoryGenre;
  style: ImageStyle;
  synopsis: string;
  episodeNumber: number;
  characters: StoryCharacter[];
  memory: StoryMemory;
  model: string;
  maxScenes: number;
  targetDurationSeconds: number;
}

export class EpisodeGenerator {
  constructor(private readonly llm: ILLMClient) {}

  async generate(input: EpisodeGenerationInput): Promise<ValidatedGeneratedEpisode> {
    const isFirstEpisode = input.episodeNumber === 1;

    logger.info('Generating episode', {
      storyTitle: input.storyTitle,
      episodeNumber: input.episodeNumber,
      isFirstEpisode,
      model: input.model,
    });

    const promptFn = isFirstEpisode ? buildFirstEpisodePrompt : buildContinuationEpisodePrompt;

    const systemPrompt = promptFn({
      storyTitle: input.storyTitle,
      genre: input.genre,
      style: input.style,
      synopsis: input.synopsis,
      episodeNumber: input.episodeNumber,
      characters: input.characters,
      memory: input.memory,
      targetDurationSeconds: input.targetDurationSeconds,
      maxScenes: input.maxScenes,
    });

    let raw: unknown;
    let lastError: unknown;

    // Up to 2 attempts to get valid JSON from the model
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        raw = await this.llm.chatJSON(
          input.model,
          [
            {
              role: 'system',
              content:
                'You are a professional anime story writer. You always return valid JSON. Never add markdown formatting or explanation text.',
            },
            { role: 'user', content: systemPrompt },
          ],
          {
            temperature: attempt === 1 ? 0.8 : 0.6,
            maxTokens: 4096,
            jsonMode: true,
          },
        );

        const validated = validateGeneratedEpisode(raw);
        const withNormalizedDurations = {
          ...validated,
          scenes: normalizeDurations(validated.scenes, input.targetDurationSeconds),
        };

        logger.info('Episode generated successfully', {
          title: withNormalizedDurations.title,
          sceneCount: withNormalizedDurations.scenes.length,
          newCharacters: withNormalizedDurations.newCharacters.length,
          attempt,
        });

        return withNormalizedDurations;
      } catch (error) {
        lastError = error;
        logger.warn('Episode generation attempt failed', {
          attempt,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw new AgentError(
      'story-agent',
      `Failed to generate valid episode after 3 attempts`,
      lastError,
    );
  }
}
