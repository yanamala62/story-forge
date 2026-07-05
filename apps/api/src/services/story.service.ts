import { createLogger, NotFoundError, ConflictError, ValidationError } from '@storyforge/shared';
import type { StoryGenre, ImageStyle } from '@storyforge/database';
import {
  StoryRepository,
  EpisodeRepository,
  CharacterRepository,
  MemoryRepository,
  type StoryWithDetails,
} from '@storyforge/database';
import { StoryAgentService } from '@storyforge/story-agent';

const logger = createLogger('story-service');

const storyRepo = new StoryRepository();
const episodeRepo = new EpisodeRepository();
const characterRepo = new CharacterRepository();
const memoryRepo = new MemoryRepository();
const storyAgent = new StoryAgentService();

export interface CreateStoryDto {
  userId: string;
  title: string;
  genre: string;
  style?: string;
  language?: string;
  synopsis: string;
  targetAudience?: string;
  initialCharacters?: Array<{
    name: string;
    description: string;
    visualDescription: string;
    personality: string;
    role: string;
  }>;
}

export const StoryService = {
  async createStory(dto: CreateStoryDto) {
    const validGenres: StoryGenre[] = [
      'ACTION', 'ADVENTURE', 'ROMANCE', 'HORROR', 'MYSTERY',
      'FANTASY', 'SCI_FI', 'DRAMA', 'COMEDY', 'THRILLER',
    ];

    const genre = dto.genre.toUpperCase() as StoryGenre;
    if (!validGenres.includes(genre)) {
      throw new ValidationError(`Invalid genre. Must be one of: ${validGenres.join(', ')}`);
    }

    const validLanguages = ['EN', 'HI', 'TE'];
    const lang = dto.language?.toUpperCase() ?? 'EN';

    const story = await storyRepo.create({
      userId: dto.userId,
      title: dto.title,
      genre,
      style: (dto.style?.toUpperCase() ?? 'ANIME') as ImageStyle,
      language: (validLanguages.includes(lang) ? lang : 'EN') as 'EN' | 'HI' | 'TE',
      synopsis: dto.synopsis,
      targetAudience: dto.targetAudience ?? '13-35',
    });

    // Seed initial characters if provided
    if (dto.initialCharacters && dto.initialCharacters.length > 0) {
      await characterRepo.createMany(
        dto.initialCharacters.map((c) => ({ ...c, storyId: story.id })),
      );
    }

    logger.info('Story created via service', { storyId: story.id, title: story.title });
    return story;
  },

  async getStory(storyId: string) {
    const story = await storyRepo.findById(storyId);
    if (!story) throw new NotFoundError('Story', storyId);
    return story;
  },

  async listStories(userId: string, page = 1, limit = 20) {
    return storyRepo.findByUserId(userId, { page, limit });
  },

  async listAllStories(page = 1, limit = 20) {
    return storyRepo.findAllActive({ page, limit });
  },

  async generateEpisode(storyId: string) {
    const story = await storyRepo.findById(storyId);
    if (!story) throw new NotFoundError('Story', storyId);
    if (!story.isActive) throw new ConflictError('Story is not active');

    const episodeNumber = await episodeRepo.getNextEpisodeNumber(storyId);

    // Create episode record immediately with GENERATING_STORY status
    const episode = await episodeRepo.create({
      storyId,
      episodeNumber,
      title: `Episode ${episodeNumber}`,
      content: '',
      hook: '',
      cliffhanger: '',
      duration: 40,
    });

    await episodeRepo.updateStatus(episode.id, 'GENERATING_STORY');

    try {
      // Call Story Agent
      const { episode: generated, updatedMemory } = await storyAgent.generateEpisode({
        story,
        episodeNumber,
      });

      // Persist episode content
      await episodeRepo.update(episode.id, {
        title: generated.title,
        content: generated.content,
        hook: generated.hook,
        cliffhanger: generated.cliffhanger,
      });

      // Persist scenes
      await episodeRepo.createScenes(
        generated.scenes.map((s) => ({
          episodeId: episode.id,
          sceneNumber: s.sceneNumber,
          description: s.description,
          narration: s.narration,
          mood: s.mood,
          duration: s.duration,
          characters: s.characters,
          location: s.location,
        })),
      );

      // Persist new characters
      if (generated.newCharacters.length > 0) {
        await characterRepo.createMany(
          generated.newCharacters.map((c) => ({ ...c, storyId })),
        );
      }

      // Update character appearances
      const allCharacterNames = generated.scenes.flatMap((s) => s.characters);
      if (allCharacterNames.length > 0) {
        await characterRepo.incrementAppearances(storyId, allCharacterNames);
      }

      // Update story memory
      await memoryRepo.upsert(storyId, updatedMemory);

      // Update story episode count
      await storyRepo.incrementEpisodeCount(storyId);

      // Mark episode as scenes generated (next agent will pick up)
      await episodeRepo.updateStatus(episode.id, 'GENERATING_SCENES');

      logger.info('Episode story generation complete', {
        episodeId: episode.id,
        title: generated.title,
        sceneCount: generated.scenes.length,
      });

      return { episodeId: episode.id, ...generated };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await episodeRepo.updateStatus(episode.id, 'FAILED', message);
      logger.error('Episode generation failed', { episodeId: episode.id, error: message });
      throw error;
    }
  },

  async getEpisode(episodeId: string) {
    const episode = await episodeRepo.findById(episodeId);
    if (!episode) throw new NotFoundError('Episode', episodeId);
    return episode;
  },

  async listEpisodes(storyId: string, page = 1, limit = 20) {
    const story = await storyRepo.findById(storyId);
    if (!story) throw new NotFoundError('Story', storyId);
    return episodeRepo.findByStoryId(storyId, { page, limit });
  },

  /** Returns the episode currently mid-pipeline for a story, if any — used to resume UI tracking. */
  async getInFlightEpisode(storyId: string) {
    return episodeRepo.findInFlightEpisode(storyId);
  },

  async getAgentHealth() {
    return storyAgent.checkHealth();
  },
};

