import { createLogger, getEnv, AgentError } from '@storyforge/shared';
import type { StoryGenre, ImageStyle } from '@storyforge/shared';
import type { StoryWithDetails } from '@storyforge/database';
import { OpenRouterClient } from './clients/openrouter.client.js';
import type { ILLMClient } from './clients/llm.interface.js';
import { EpisodeGenerator } from './generators/episode.generator.js';
import { buildInitialMemory, applyEpisodeToMemory } from './memory/memory.builder.js';
import type { ValidatedGeneratedEpisode } from './validators/episode.validator.js';

const logger = createLogger('story-agent');

export interface GenerateEpisodeOptions {
  story: StoryWithDetails;
  episodeNumber: number;
}

export interface GenerateEpisodeResult {
  episode: ValidatedGeneratedEpisode;
  updatedMemory: ReturnType<typeof applyEpisodeToMemory>;
}

export class StoryAgentService {
  private readonly llm: ILLMClient;
  private readonly generator: EpisodeGenerator;
  private readonly env: ReturnType<typeof getEnv>;
  private readonly storyModel: string;

  constructor() {
    this.env = getEnv();

    this.llm = new OpenRouterClient({
      apiKey: this.env.OPENROUTER_API_KEY,
      timeoutMs: this.env.OPENROUTER_TIMEOUT_MS,
      maxRetries: this.env.OPENROUTER_MAX_RETRIES,
      fallbackModels: this.env.OPENROUTER_FALLBACK_MODELS.split(',')
        .map((m) => m.trim())
        .filter(Boolean),
    });

    this.storyModel = this.env.OPENROUTER_STORY_MODEL;

    this.generator = new EpisodeGenerator(this.llm);

    logger.info('StoryAgentService initialized', {
      provider: 'openrouter',
      model: this.storyModel,
    });
  }

  async generateEpisode(options: GenerateEpisodeOptions): Promise<GenerateEpisodeResult> {
    const { story, episodeNumber } = options;

    logger.info('Story agent starting episode generation', {
      storyId: story.id,
      storyTitle: story.title,
      episodeNumber,
      provider: 'openrouter',
      model: this.storyModel,
    });

    const available = await this.llm.isAvailable();
    if (!available) {
      throw new AgentError(
        'story-agent',
        `OpenRouter is not available. Check your API key or connection.`,
      );
    }

    // Build memory from stored JSON fields
    const initial = buildInitialMemory();
    const existingMemory = story.memory
      ? {
          ...initial,
          timeline: Array.isArray(story.memory.timeline)
            ? (story.memory.timeline as unknown as typeof initial.timeline)
            : [],
          worldState:
            typeof story.memory.worldState === 'object' && story.memory.worldState !== null
              ? (story.memory.worldState as unknown as typeof initial.worldState)
              : initial.worldState,
          plotPoints: Array.isArray(story.memory.plotPoints)
            ? (story.memory.plotPoints as string[])
            : [],
          characters: story.characters.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description,
            visualDescription: c.visualDescription,
            personality: c.personality,
            role: c.role,
            isAlive: c.isAlive,
          })),
        }
      : buildInitialMemory();

    const generatedEpisode = await this.generator.generate({
      storyTitle: story.title,
      genre: story.genre as StoryGenre,
      style: story.style as ImageStyle,
      language: String(story.language ?? 'EN'),
      synopsis: story.synopsis,
      episodeNumber,
      characters: existingMemory.characters,
      memory: existingMemory,
      model: this.storyModel,
      maxScenes: this.env.STORY_MAX_SCENES,
      targetDurationSeconds: this.env.STORY_EPISODE_DURATION_SECONDS,
    });

    const updatedMemory = applyEpisodeToMemory(existingMemory, generatedEpisode, episodeNumber);

    logger.info('Story agent completed episode generation', {
      storyId: story.id,
      episodeNumber,
      title: generatedEpisode.title,
      sceneCount: generatedEpisode.scenes.length,
      provider: 'openrouter',
    });

    return { episode: generatedEpisode, updatedMemory };
  }

  async checkHealth(): Promise<{
    provider: string;
    model: string;
    available: boolean;
  }> {
    const available = await this.llm.isAvailable();
    return {
      provider: 'openrouter',
      model: this.storyModel,
      available,
    };
  }
}
