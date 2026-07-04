export interface SeoPromptContext {
  storyTitle: string;
  genre: string;
  episodeNumber: number;
  episodeTitle: string;
  hook: string;
  cliffhanger: string;
  synopsis: string;
  targetAudience: string;
  language: string; // EN | HI | TE
  durationSeconds: number;
}

const LANG_LABEL: Record<string, string> = {
  EN: 'English',
  HI: 'Hindi',
  TE: 'Telugu',
};

const LANG_HASHTAG_SUFFIX: Record<string, string[]> = {
  EN: ['#AnimeStory', '#StoryTime', '#ShortFilm', '#AnimeSeries'],
  HI: ['#HindiStory', '#HindiShorts', '#AnimeHindi', '#HindiKahani'],
  TE: ['#TeluguStory', '#TeluguShorts', '#AnimeTeluguLo', '#TeluguKathalu'],
};

export function buildSeoPrompt(ctx: SeoPromptContext): string {
  const lang = ctx.language.toUpperCase() || 'EN';
  const langLabel = LANG_LABEL[lang] ?? 'English';
  const extraHashtags = LANG_HASHTAG_SUFFIX[lang] ?? LANG_HASHTAG_SUFFIX['EN']!;

  return `You are a professional social media SEO specialist optimizing video content for YouTube, Instagram, and TikTok.

EPISODE DETAILS:
Story: "${ctx.storyTitle}"
Genre: ${ctx.genre}
Episode: ${ctx.episodeNumber} — "${ctx.episodeTitle}"
Synopsis: ${ctx.synopsis}
Opening hook: "${ctx.hook}"
Cliffhanger ending: "${ctx.cliffhanger}"
Target Audience: ${ctx.targetAudience}
Language: ${langLabel}
Duration: ~${Math.round(ctx.durationSeconds)}s

YOUR TASK:
Generate platform-optimized SEO metadata for this ${langLabel}-language anime story episode video.

RULES:
- Title: max 70 chars, emotionally gripping, includes episode number, in ${langLabel}
- Description: 3 short paragraphs (total 400-600 chars), builds curiosity, ends with CTA "Subscribe for next episode!", in ${langLabel}
- Tags: exactly 15 relevant search keywords (mix of broad + niche), in ${langLabel} where applicable
- Hashtags: exactly 10 trending hashtags starting with #, include platform-specific ones: ${extraHashtags.join(' ')}
- Category: always "Entertainment"
- ThumbnailText: 4-6 words of dramatic, eye-catching text for the video thumbnail (can stay in English for visibility)

Return ONLY valid JSON, no markdown:
{
  "title": "string",
  "description": "string",
  "tags": ["string", ...],
  "hashtags": ["#string", ...],
  "category": "Entertainment",
  "thumbnailText": "string"
}`;
}
