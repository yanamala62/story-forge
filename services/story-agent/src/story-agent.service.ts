import { createLogger, getEnv, AgentError } from '@storyforge/shared';
import type { StoryGenre, ImageStyle } from '@storyforge/shared';
import type { StoryWithDetails } from '@storyforge/database';
import { createLLMClient } from './clients/llm.factory.js';
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
  private readonly provider: string;

  constructor() {
    this.env = getEnv();
    this.provider = this.env.LLM_PROVIDER;

    this.llm = createLLMClient({
      provider: this.env.LLM_PROVIDER,
      ollama: {
        baseUrl: this.env.OLLAMA_BASE_URL,
        timeoutMs: this.env.OLLAMA_TIMEOUT_MS,
        maxRetries: this.env.OLLAMA_MAX_RETRIES,
      },
      openrouter: {
        apiKey: this.env.OPENROUTER_API_KEY ?? '',
        timeoutMs: this.env.OPENROUTER_TIMEOUT_MS,
        maxRetries: this.env.OPENROUTER_MAX_RETRIES,
      },
    });

    // Pick model based on provider
    this.storyModel =
      this.env.LLM_PROVIDER === 'openrouter'
        ? this.env.OPENROUTER_STORY_MODEL
        : this.env.OLLAMA_STORY_MODEL;

    this.generator = new EpisodeGenerator(this.llm);

    logger.info('StoryAgentService initialized', {
      provider: this.provider,
      model: this.storyModel,
    });
  }

  async generateEpisode(options: GenerateEpisodeOptions): Promise<GenerateEpisodeResult> {
    const { story, episodeNumber } = options;

    logger.info('Story agent starting episode generation', {
      storyId: story.id,
      storyTitle: story.title,
      episodeNumber,
      provider: this.provider,
      model: this.storyModel,
    });

    const available = await this.llm.isAvailable();
    if (!available) {
      throw new AgentError(
        'story-agent',
        `LLM provider "${this.provider}" is not available. Check your API key or connection.`,
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
      provider: this.provider,
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
      provider: this.provider,
      model: this.storyModel,
      available,
    };
  }
}
