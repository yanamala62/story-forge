import { createLogger, NotFoundError } from '@storyforge/shared';
import {
  EpisodeRepository,
  StoryRepository,
  VideoRepository,
  SeoRepository,
} from '@storyforge/database';
import { SeoAgentService } from '@storyforge/seo-agent';

const logger = createLogger('seo-pipeline');

const episodeRepo = new EpisodeRepository();
const storyRepo = new StoryRepository();
const videoRepo = new VideoRepository();
const seoRepo = new SeoRepository();
const seoAgent = new SeoAgentService();

export interface SeoPipelineResult {
  episodeId: string;
  videoId: string;
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  category: string;
  thumbnailText: string;
  language: string;
}

export const SeoPipelineService = {
  async generateSeoForEpisode(episodeId: string): Promise<SeoPipelineResult> {
    logger.info('Starting SEO pipeline', { episodeId });

    // Load episode + story context
    const episode = await episodeRepo.findById(episodeId);
    if (!episode) throw new NotFoundError('Episode', episodeId);

    const story = await storyRepo.findById(episode.storyId);
    if (!story) throw new NotFoundError('Story', episode.storyId);

    // Video must exist before generating SEO
    const video = await videoRepo.findByEpisodeId(episodeId);
    if (!video) {
      throw new Error('No video found — compose the video first (M5) before generating SEO');
    }

    const language = String((story as unknown as { language?: string }).language ?? 'EN');

    // Load audio duration from the video record for context
    const durationSeconds = video.duration;

    await episodeRepo.updateStatus(episodeId, 'GENERATING_SEO');

    const result = await seoAgent.generateSeo({
      storyTitle: story.title,
      genre: story.genre,
      episodeNumber: episode.episodeNumber,
      episodeTitle: episode.title,
      hook: episode.hook,
      cliffhanger: episode.cliffhanger,
      synopsis: story.synopsis,
      targetAudience: story.targetAudience,
      language,
      durationSeconds,
    });

    // SeoMetadata is linked to video.id (not episode.id) per the schema
    await seoRepo.upsert({
      videoId: video.id,
      title: result.title,
      description: result.description,
      tags: result.tags,
      hashtags: result.hashtags,
      category: result.category,
      language: language.toLowerCase(),
    });

    logger.info('SEO pipeline complete', {
      episodeId,
      title: result.title,
      tagCount: result.tags.length,
    });

    return {
      episodeId,
      videoId: video.id,
      title: result.title,
      description: result.description,
      tags: result.tags,
      hashtags: result.hashtags,
      category: result.category,
      thumbnailText: result.thumbnailText,
      language: language.toLowerCase(),
    };
  },

  async getEpisodeSeo(episodeId: string) {
    const video = await videoRepo.findByEpisodeId(episodeId);
    if (!video) return null;
    return seoRepo.findByVideoId(video.id);
  },
};
