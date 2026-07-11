import { createLogger, NotFoundError } from '@storyforge/shared';
import type { ImageStyle } from '@storyforge/shared';
import {
  EpisodeRepository,
  CharacterRepository,
  PromptRepository,
  ImageRepository,
  StoryRepository,
} from '@storyforge/database';
import { PromptAgentService } from '@storyforge/prompt-agent';
import { ImageAgentService } from '@storyforge/image-agent';
import { PipelineLogBus } from './pipeline-log-bus.js';
import { PipelineProgress } from './pipeline-progress.js';

const logger = createLogger('image-pipeline');

const episodeRepo = new EpisodeRepository();
const storyRepo = new StoryRepository();
const characterRepo = new CharacterRepository();
const promptRepo = new PromptRepository();
const imageRepo = new ImageRepository();
const promptAgent = new PromptAgentService();
const imageAgent = new ImageAgentService();

export interface ImagePipelineResult {
  episodeId: string;
  totalScenes: number;
  generatedImages: Array<{
    sceneNumber: number;
    localPath: string;
    promptId: string;
    imageId: string;
  }>;
  duration: number;
}

export const ImagePipelineService = {
  async generateImagesForEpisode(episodeId: string): Promise<ImagePipelineResult> {
    const startedAt = Date.now();

    logger.info('Starting image pipeline for episode', { episodeId });

    // Load episode with scenes
    const episode = await episodeRepo.findById(episodeId);
    if (!episode) throw new NotFoundError('Episode', episodeId);
    if (!episode.scenes.length) throw new Error('Episode has no scenes — generate story first');

    // Load story for style/genre
    const story = await storyRepo.findById(episode.storyId);
    if (!story) throw new NotFoundError('Story', episode.storyId);

    // Load characters for visual descriptions
    const characters = await characterRepo.findByStoryId(episode.storyId);

    // Build location visuals from story memory
    const locationVisuals: Record<string, string> = {};
    if (story.memory) {
      const locations = story.memory as unknown as {
        locations?: Array<{ name: string; visualDescription: string }>;
      };
      if (Array.isArray(locations.locations)) {
        for (const loc of locations.locations) {
          if (loc.name && loc.visualDescription) {
            locationVisuals[loc.name] = loc.visualDescription;
          }
        }
      }
    }

    // Update episode status
    await episodeRepo.updateStatus(episodeId, 'GENERATING_PROMPTS');

    // Step 1: Generate prompts for all scenes
    const promptData = promptAgent.generatePromptsForEpisode({
      episodeId,
      storyId: episode.storyId,
      style: story.style as ImageStyle,
      genre: story.genre,
      scenes: episode.scenes,
      characters,
      locationVisuals,
    });

    // Step 2: Save prompts to database
    const savedPrompts = await promptRepo.createMany(
      promptData.map((p) => ({
        episodeId,
        sceneId: p.sceneId,
        positivePrompt: p.positivePrompt,
        negativePrompt: p.negativePrompt,
        style: p.style,
        characters: p.characters,
        location: p.location,
      })),
    );

    // Step 3: Generate images
    await episodeRepo.updateStatus(episodeId, 'GENERATING_IMAGES');

    const results: ImagePipelineResult['generatedImages'] = [];

    const storyLanguage = String(story.language ?? 'EN');
    const imageInputs = promptData.map((p, i) => ({
      episodeId,
      sceneNumber: p.sceneNumber,
      positivePrompt: p.positivePrompt,
      negativePrompt: p.negativePrompt,
      seed: p.seed,
      language: storyLanguage,
    }));

    const imageResults = await imageAgent.generateImagesForEpisode(
      imageInputs,
      (done, total) => {
        logger.info(`Image progress: ${done}/${total}`, { episodeId });
        PipelineProgress.set(episodeId, done, total);
        PipelineLogBus.emit(episodeId, 'info', `Image ${done}/${total} generated`);
      },
      (sceneNumber, attempt, maxAttempts, error) => {
        PipelineLogBus.emit(
          episodeId,
          'warn',
          `Scene ${sceneNumber}: retrying (${attempt}/${maxAttempts}) — ${error}`,
        );
      },
    );

    // Step 4: Save image records to database
    for (let i = 0; i < imageResults.length; i++) {
      const imgResult = imageResults[i]!;
      const prompt = savedPrompts[i]!;
      const scene = episode.scenes[i]!;

      const saved = await imageRepo.create({
        promptId: prompt.id,
        sceneId: scene.id,
        filename: imgResult.filename,
        localPath: imgResult.localPath,
        s3Key: imgResult.s3Key,
        s3Url: imgResult.s3Url,
        width: imgResult.width,
        height: imgResult.height,
        seed: imgResult.seed,
        model: 'pollinations-flux',
      });

      results.push({
        sceneNumber: scene.sceneNumber,
        localPath: imgResult.localPath,
        promptId: prompt.id,
        imageId: saved.id,
      });
    }

    const duration = Date.now() - startedAt;
    logger.info('Image pipeline complete', { episodeId, count: results.length, durationMs: duration });

    return {
      episodeId,
      totalScenes: episode.scenes.length,
      generatedImages: results,
      duration,
    };
  },

  async getEpisodeImages(episodeId: string) {
    const images = await imageRepo.findByEpisodeScenes(episodeId);
    return images;
  },
};
