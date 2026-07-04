import { createLogger } from '@storyforge/shared';
import {
  VideoRepository,
  UploadRepository,
  AnalyticsRepository,
} from '@storyforge/database';
import { AnalyticsAgentService } from '@storyforge/analytics-agent';

const logger = createLogger('analytics-pipeline');

const videoRepo = new VideoRepository();
const uploadRepo = new UploadRepository();
const analyticsRepo = new AnalyticsRepository();
const analyticsAgent = new AnalyticsAgentService();

export interface EpisodeAnalyticsResult {
  episodeId: string;
  platformVideoId: string;
  platform: string;
  latest: {
    views: number;
    likes: number;
    comments: number;
    saves: number;
    collectedAt: string;
  } | null;
  history: Array<{
    views: number;
    likes: number;
    comments: number;
    collectedAt: string;
  }>;
}

export interface CollectionResult {
  episodeId: string;
  platformVideoId: string;
  views: number;
  likes: number;
  comments: number;
  saves: number;
  collectedAt: string;
}

export const AnalyticsPipelineService = {
  isConfigured(): boolean {
    return analyticsAgent.isYouTubeConfigured();
  },

  /** Collect fresh analytics for a single episode's YouTube upload. */
  async collectForEpisode(episodeId: string): Promise<CollectionResult> {
    const video = await videoRepo.findByEpisodeId(episodeId);
    if (!video) throw new Error('No video found for episode — compose video first (M5)');

    const upload = await uploadRepo.findByEpisodeAndPlatform(video.id, 'YOUTUBE');
    if (!upload) throw new Error('No published YouTube upload found for this episode');
    if (!upload.platformVideoId) throw new Error('Upload has no platformVideoId');

    logger.info('Collecting analytics for episode', { episodeId, platformVideoId: upload.platformVideoId });

    const snapshot = await analyticsAgent.collectAnalytics({
      uploadId: upload.id,
      platform: 'YOUTUBE',
      platformVideoId: upload.platformVideoId,
    });

    await analyticsRepo.create({
      uploadId: upload.id,
      views:    snapshot.views,
      likes:    snapshot.likes,
      comments: snapshot.comments,
      saves:    snapshot.saves,
      shares:   snapshot.shares,
      watchTime:    snapshot.watchTime,
      avgRetention: snapshot.avgRetention,
      ctr:          snapshot.ctr,
      impressions:  snapshot.impressions,
    });

    logger.info('Analytics collected', {
      episodeId,
      views: snapshot.views,
      likes: snapshot.likes,
    });

    return {
      episodeId,
      platformVideoId: upload.platformVideoId,
      views:    snapshot.views,
      likes:    snapshot.likes,
      comments: snapshot.comments,
      saves:    snapshot.saves,
      collectedAt: snapshot.collectedAt.toISOString(),
    };
  },

  /** Collect analytics for ALL published episodes in one batch call. */
  async collectForAllPublished(): Promise<{
    collected: number;
    skipped: number;
    errors: Array<{ episodeId: string; error: string }>;
  }> {
    logger.info('Collecting analytics for all published episodes');

    const allPublishedUploads = await uploadRepo.findAllPublished();

    const inputs = allPublishedUploads
      .filter((u) => u.platform === 'YOUTUBE' && u.platformVideoId)
      .map((u) => ({
        uploadId: u.id,
        platform: 'YOUTUBE' as const,
        platformVideoId: u.platformVideoId!,
      }));

    if (inputs.length === 0) {
      logger.info('No published YouTube uploads found — skipping analytics collection');
      return { collected: 0, skipped: 0, errors: [] };
    }

    const snapshots = await analyticsAgent.collectBatchAnalytics(inputs);

    let collected = 0;
    const errors: Array<{ episodeId: string; error: string }> = [];

    for (const snapshot of snapshots) {
      try {
        await analyticsRepo.create({
          uploadId:     snapshot.uploadId,
          views:        snapshot.views,
          likes:        snapshot.likes,
          comments:     snapshot.comments,
          saves:        snapshot.saves,
          shares:       snapshot.shares,
          watchTime:    snapshot.watchTime,
          avgRetention: snapshot.avgRetention,
          ctr:          snapshot.ctr,
          impressions:  snapshot.impressions,
        });
        collected++;
      } catch (err) {
        errors.push({
          episodeId: snapshot.uploadId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info('Batch analytics collection complete', {
      total: inputs.length,
      collected,
      errors: errors.length,
    });

    return { collected, skipped: inputs.length - collected - errors.length, errors };
  },

  async getEpisodeAnalytics(episodeId: string): Promise<EpisodeAnalyticsResult | null> {
    const video = await videoRepo.findByEpisodeId(episodeId);
    if (!video) return null;

    const upload = await uploadRepo.findByEpisodeAndPlatform(video.id, 'YOUTUBE');
    if (!upload?.platformVideoId) return null;

    const history = await analyticsRepo.findByUploadId(upload.id);
    const latest = history[0] ?? null;

    return {
      episodeId,
      platformVideoId: upload.platformVideoId,
      platform: 'YOUTUBE',
      latest: latest
        ? {
            views:       latest.views,
            likes:       latest.likes,
            comments:    latest.comments,
            saves:       latest.saves,
            collectedAt: latest.collectedAt.toISOString(),
          }
        : null,
      history: history.map((a) => ({
        views:       a.views,
        likes:       a.likes,
        comments:    a.comments,
        collectedAt: a.collectedAt.toISOString(),
      })),
    };
  },

  async getAggregateSummary() {
    return analyticsRepo.aggregate();
  },
};
