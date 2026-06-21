import type { ImageStyle } from '@storyforge/shared';
import { MOOD_LIGHTING, STYLE_TEMPLATES } from '../templates/style.templates.js';

export interface ScenePromptInput {
  sceneNumber: number;
  description: string;
  mood: string;
  characters: string[];
  location: string | null;
  characterVisuals: Record<string, string>; // name → visualDescription
  locationVisual?: string | undefined;
  style: ImageStyle;
  storyGenre: string;
  seed: number;
}

export interface BuiltPrompt {
  positive: string;
  negative: string;
  seed: number;
  style: ImageStyle;
}

export function buildImagePrompt(input: ScenePromptInput): BuiltPrompt {
  const template = STYLE_TEMPLATES[input.style];
  const moodLighting = MOOD_LIGHTING[input.mood] ?? 'cinematic lighting';

  // Collect character visual descriptions for characters in this scene
  const characterDetails = input.characters
    .map((name) => input.characterVisuals[name])
    .filter(Boolean)
    .join(', ');

  // Build prompt sections
  const parts: string[] = [
    template.qualityTags,
    template.styleTags,
    input.description,
  ];

  if (characterDetails) {
    parts.push(`characters: ${characterDetails}`);
  }

  if (input.locationVisual) {
    parts.push(`setting: ${input.locationVisual}`);
  }

  parts.push(moodLighting);
  parts.push(template.compositionTags);
  parts.push('no text overlay, no watermark, no subtitles, no UI elements');

  const positive = parts
    .filter(Boolean)
    .join(', ')
    // Prevent duplicate anime/style mentions
    .replace(/anime style,\s*anime style,?/gi, 'anime style,')
    // Remove any text/logo instructions that leaked from scene description
    .replace(/no text (visible|on screen|in image)/gi, '')
    .trim();

  return {
    positive,
    negative: template.negativePrompt,
    seed: input.seed,
    style: input.style,
  };
}

export function generateSeed(episodeId: string, sceneNumber: number): number {
  // Deterministic seed from episodeId + sceneNumber for reproducibility
  let hash = 0;
  const str = `${episodeId}-scene-${sceneNumber}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash) % 2_147_483_647;
}
