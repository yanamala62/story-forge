import type { ImageStyle } from '@storyforge/shared';

export interface StyleTemplate {
  qualityTags: string;
  styleTags: string;
  negativePrompt: string;
  compositionTags: string;
}

export const MOOD_LIGHTING: Record<string, string> = {
  tense: 'tense atmosphere, sharp dramatic shadows, high contrast harsh lighting, dark undertones',
  dramatic: 'dramatic cinematic lighting, god rays, volumetric light, powerful shadows',
  mysterious: 'mysterious foggy atmosphere, soft ethereal moonlight, ambient glow, mist',
  action: 'dynamic motion, intense lighting, action energy, kinetic atmosphere',
  warm: 'warm golden hour lighting, soft diffused light, gentle shadows, cozy atmosphere',
  sad: 'melancholic blue-grey tones, overcast soft light, desaturated, somber mood',
  exciting: 'vibrant saturated colors, energetic composition, bright dynamic lighting',
  eerie: 'eerie cold moonlight, unsettling shadows, pale green tones, fog, uncanny atmosphere',
};

export const STYLE_TEMPLATES: Record<ImageStyle, StyleTemplate> = {
  ANIME: {
    qualityTags:
      'masterpiece, best quality, ultra-detailed, 8k uhd, high resolution, sharp focus',
    styleTags:
      'anime style, anime screencap, detailed anime art, vibrant colors, clean linework, cel shading, Japanese animation style',
    negativePrompt:
      'nsfw, nude, explicit content, lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry, deformed, ugly, disfigured, mutation, extra limbs, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers, long neck, cross-eyed, out of frame, poorly drawn face, cloned face, gross proportions',
    compositionTags:
      'vertical composition, portrait orientation, 9:16 aspect ratio, cinematic framing',
  },
  CARTOON: {
    qualityTags: 'masterpiece, best quality, ultra-detailed, high resolution, vivid colors',
    styleTags:
      'cartoon style, western animation, bold outlines, flat colors, expressive characters, stylized art',
    negativePrompt:
      'nsfw, nude, realistic, photorealistic, lowres, bad anatomy, text, watermark, blurry, deformed, ugly',
    compositionTags:
      'vertical composition, portrait orientation, 9:16 aspect ratio, dynamic framing',
  },
  CINEMATIC: {
    qualityTags:
      'cinematic, film photography, 8k, ultra-detailed, RAW photo, professional photography',
    styleTags:
      'cinematic style, movie scene, film grain, anamorphic lens, depth of field, bokeh, dramatic composition',
    negativePrompt:
      'nsfw, nude, cartoon, anime, lowres, bad anatomy, text, watermark, blurry, deformed, ugly, painting, drawing, illustration',
    compositionTags:
      'vertical composition, portrait orientation, 9:16 aspect ratio, cinematic letterbox, rule of thirds',
  },
  REALISTIC: {
    qualityTags:
      'photorealistic, hyperrealistic, 8k uhd, ultra-detailed, RAW photo, sharp focus, professional',
    styleTags:
      'photorealistic, realistic rendering, lifelike, natural lighting, photographic quality',
    negativePrompt:
      'nsfw, nude, cartoon, anime, painting, illustration, lowres, bad anatomy, text, watermark, blurry, deformed, ugly, artificial',
    compositionTags:
      'vertical composition, portrait orientation, 9:16 aspect ratio, professional framing',
  },
};
