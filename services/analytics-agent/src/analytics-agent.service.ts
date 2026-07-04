import { createLogger, getEnv } from '@storyforge/shared';
import { YouTubeAnalyticsProvider, type VideoStats } from './providers/youtube-analytics.provider.js';

const logger = createLogger('analytics-agent');

export interface CollectAnalyticsInput {
  uploadId: string;
  platform: string;
  platformVideoId: string;
}

export interface AnalyticsSnapshot {
  uploadId: string;
  platform: string;
  platformVideoId: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  watchTime: number;
  avgRetention: number;
  ctr: number;
  impressions: number;
  collectedAt: Date;
}

export class AnalyticsAgentService {
  isYouTubeConfigured(): boolean {
    const env = getEnv();
    return !!(env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET && env.YOUTUBE_REFRESH_TOKEN);
  }

  private getYouTubeProvider(): YouTubeAnalyticsProvider {
    const env = getEnv();
    if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET || !env.YOUTUBE_REFRESH_TOKEN) {
      throw new Error('YouTube credentials not configured');
    }
    return new YouTubeAnalyticsProvider({
      clientId: env.YOUTUBE_CLIENT_ID,
      clientSecret: env.YOUTUBE_CLIENT_SECRET,
      refreshToken: env.YOUTUBE_REFRESH_TOKEN,
    });
  }

  async collectAnalytics(input: CollectAnalyticsInput): Promise<AnalyticsSnapshot> {
    logger.info('Collecting analytics', {
      uploadId: input.uploadId,
      platform: input.platform,
      platformVideoId: input.platformVideoId,
    });

    if (input.platform !== 'YOUTUBE') {
      throw new Error(`Platform ${input.platform} is not supported yet — only YOUTUBE`);
    }

    const provider = this.getYouTubeProvider();
    const stats: VideoStats = await provider.fetchVideoStats(input.platformVideoId);

    return {
      uploadId: input.uploadId,
      platform: input.platform,
      platformVideoId: input.platformVideoId,
      views:        stats.views,
      likes:        stats.likes,
      comments:     stats.comments,
      shares:       0,          // not available via Data API v3
      saves:        stats.favorites,
      // watchTime, avgRetention, ctr, impressions require YouTube Analytics API
      // (scope: yt-analytics.readonly) — set to 0 until that scope is added
      watchTime:    0,
      avgRetention: 0,
      ctr:          0,
      impressions:  0,
      collectedAt:  stats.collectedAt,
    };
  }

  async collectBatchAnalytics(
    uploads: CollectAnalyticsInput[],
  ): Promise<AnalyticsSnapshot[]> {
    const youtubeUploads = uploads.filter((u) => u.platform === 'YOUTUBE');

    if (youtubeUploads.length === 0) return [];

    const provider = this.getYouTubeProvider();
    const batchStats = await provider.fetchBatchStats(
      youtubeUploads.map((u) => u.platformVideoId),
    );

    const statsById = new Map(batchStats.map((s) => [s.platformVideoId, s]));

    return youtubeUploads.map((u) => {
      const stats = statsById.get(u.platformVideoId);
      return {
        uploadId:     u.uploadId,
        platform:     u.platform,
        platformVideoId: u.platformVideoId,
        views:        stats?.views    ?? 0,
        likes:        stats?.likes    ?? 0,
        comments:     stats?.comments ?? 0,
        shares:       0,
        saves:        stats?.favorites ?? 0,
        watchTime:    0,
        avgRetention: 0,
        ctr:          0,
        impressions:  0,
        collectedAt:  stats?.collectedAt ?? new Date(),
      };
    });
  }
}
