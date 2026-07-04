import { createLogger, NotFoundError } from '@storyforge/shared';
import {
  EpisodeRepository,
  VideoRepository,
  SeoRepository,
  UploadRepository,
} from '@storyforge/database';
import { UploadAgentService } from '@storyforge/upload-agent';

const logger = createLogger('upload-pipeline');

const episodeRepo = new EpisodeRepository();
const videoRepo = new VideoRepository();
const seoRepo = new SeoRepository();
const uploadRepo = new UploadRepository();
const uploadAgent = new UploadAgentService();

export interface UploadPipelineResult {
  episodeId: string;
  uploadId: string;
  platform: string;
  platformVideoId: string;
  platformUrl: string;
  title: string;
}

export const UploadPipelineService = {
  isYouTubeConfigured(): boolean {
    return uploadAgent.isYouTubeConfigured();
  },

  async uploadToYouTube(
    episodeId: string,
    options?: { privacyStatus?: 'public' | 'private' | 'unlisted' },
  ): Promise<UploadPipelineResult> {
    logger.info('Starting upload pipeline', { episodeId, platform: 'YOUTUBE' });

    const episode = await episodeRepo.findById(episodeId);
    if (!episode) throw new NotFoundError('Episode', episodeId);

    const video = await videoRepo.findByEpisodeId(episodeId);
    if (!video) {
      throw new Error('No video found — compose the video first (M5)');
    }

    const seo = await seoRepo.findByVideoId(video.id);
    if (!seo) {
      throw new Error('No SEO metadata found — generate SEO first (M6)');
    }

    // Check if already uploaded to YouTube
    const existing = await uploadRepo.findByEpisodeAndPlatform(video.id, 'YOUTUBE');

    if (existing) {
      logger.info('Already uploaded to YouTube', {
        episodeId,
        platformVideoId: existing.platformVideoId,
      });
      return {
        episodeId,
        uploadId: existing.id,
        platform: 'YOUTUBE',
        platformVideoId: existing.platformVideoId ?? '',
        platformUrl: existing.platformUrl ?? '',
        title: seo.title,
      };
    }

    // Create upload record (PENDING → tracks progress)
    const uploadRecord = await uploadRepo.create({
      videoId: video.id,
      platform: 'YOUTUBE',
      status: 'UPLOADING',
    });

    try {
      const result = await uploadAgent.uploadToYouTube({
        videoPath: video.localPath,
        title: seo.title,
        description: seo.description,
        tags: seo.tags,
        hashtags: seo.hashtags,
        category: '24',
        privacyStatus: options?.privacyStatus ?? 'private',
      });

      // Mark completed
      const completed = await uploadRepo.markCompleted(
        uploadRecord.id,
        result.platformVideoId,
        result.platformUrl,
      );

      await episodeRepo.updateStatus(episodeId, 'PUBLISHED');

      logger.info('Upload pipeline complete', {
        episodeId,
        platformVideoId: result.platformVideoId,
        platformUrl: result.platformUrl,
      });

      return {
        episodeId,
        uploadId: completed.id,
        platform: 'YOUTUBE',
        platformVideoId: result.platformVideoId,
        platformUrl: result.platformUrl,
        title: result.title,
      };
    } catch (error) {
      // Mark upload as failed
      await uploadRepo.markFailed(
        uploadRecord.id,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  },

  async getEpisodeUploads(episodeId: string) {
    const video = await videoRepo.findByEpisodeId(episodeId);
    if (!video) return [];
    return uploadRepo.findByVideoId(video.id);
  },
};
