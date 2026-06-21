import { createLogger } from '@storyforge/shared';
import type { ImageStyle } from '@storyforge/shared';
import type { Scene, Character, Prompt } from '@storyforge/database';
import { buildImagePrompt, generateSeed } from './builders/prompt.builder.js';

const logger = createLogger('prompt-agent');

export interface GeneratePromptsInput {
  episodeId: string;
  storyId: string;
  style: ImageStyle;
  genre: string;
  scenes: Scene[];
  characters: Character[];
  locationVisuals: Record<string, string>; // locationName → visualDescription
}

export interface GeneratedPromptData {
  sceneId: string;
  sceneNumber: number;
  positivePrompt: string;
  negativePrompt: string;
  seed: number;
  style: string;
  characters: string[];
  location: string | null;
}

export class PromptAgentService {
  private readonly logger = logger;

  generatePromptsForEpisode(input: GeneratePromptsInput): GeneratedPromptData[] {
    this.logger.info('Generating image prompts for episode', {
      episodeId: input.episodeId,
      sceneCount: input.scenes.length,
      style: input.style,
    });

    // Build character visual lookup
    const characterVisuals: Record<string, string> = {};
    for (const char of input.characters) {
      characterVisuals[char.name] = char.visualDescription;
    }

    const prompts: GeneratedPromptData[] = [];

    for (const scene of input.scenes) {
      const sceneCharacters = Array.isArray(scene.characters)
        ? (scene.characters as string[])
        : [];

      const locationVisual = scene.location
        ? input.locationVisuals[scene.location]
        : undefined;

      const built = buildImagePrompt({
        sceneNumber: scene.sceneNumber,
        description: scene.description,
        mood: scene.mood,
        characters: sceneCharacters,
        location: scene.location,
        characterVisuals,
        locationVisual,
        style: input.style,
        storyGenre: input.genre,
        seed: generateSeed(input.episodeId, scene.sceneNumber),
      });

      prompts.push({
        sceneId: scene.id,
        sceneNumber: scene.sceneNumber,
        positivePrompt: built.positive,
        negativePrompt: built.negative,
        seed: built.seed,
        style: input.style,
        characters: sceneCharacters,
        location: scene.location,
      });

      this.logger.debug('Prompt generated', {
        sceneNumber: scene.sceneNumber,
        mood: scene.mood,
        characters: sceneCharacters,
        promptLength: built.positive.length,
      });
    }

    this.logger.info('All prompts generated', {
      episodeId: input.episodeId,
      count: prompts.length,
    });

    return prompts;
  }
}
