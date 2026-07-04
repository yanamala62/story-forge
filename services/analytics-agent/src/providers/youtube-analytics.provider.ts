import { createLogger } from '@storyforge/shared';
import { google } from 'googleapis';

const logger = createLogger('youtube-analytics-provider');

export interface VideoStats {
  platformVideoId: string;
  views: number;
  likes: number;
  comments: number;
  favorites: number;
  collectedAt: Date;
}

export class YouTubeAnalyticsProvider {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly refreshToken: string;

  constructor(config: { clientId: string; clientSecret: string; refreshToken: string }) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.refreshToken = config.refreshToken;
  }

  private getOAuth2Client() {
    const auth = new google.auth.OAuth2(this.clientId, this.clientSecret);
    auth.setCredentials({ refresh_token: this.refreshToken });
    return auth;
  }

  async fetchVideoStats(platformVideoId: string): Promise<VideoStats> {
    logger.info('Fetching YouTube video stats', { platformVideoId });

    const auth = this.getOAuth2Client();
    const youtube = google.youtube({ version: 'v3', auth });

    const response = await youtube.videos.list({
      part: ['statistics'],
      id: [platformVideoId],
    });

    const video = response.data.items?.[0];
    if (!video) {
      throw new Error(`Video ${platformVideoId} not found on YouTube`);
    }

    const stats = video.statistics ?? {};

    const result: VideoStats = {
      platformVideoId,
      views:     parseInt(stats.viewCount     ?? '0', 10),
      likes:     parseInt(stats.likeCount     ?? '0', 10),
      comments:  parseInt(stats.commentCount  ?? '0', 10),
      favorites: parseInt(stats.favoriteCount ?? '0', 10),
      collectedAt: new Date(),
    };

    logger.info('YouTube stats fetched', {
      platformVideoId,
      views: result.views,
      likes: result.likes,
      comments: result.comments,
    });

    return result;
  }

  /** Batch-fetch stats for multiple videos in one API call (max 50 per request). */
  async fetchBatchStats(platformVideoIds: string[]): Promise<VideoStats[]> {
    if (platformVideoIds.length === 0) return [];

    // YouTube allows up to 50 IDs per request
    const batches: string[][] = [];
    for (let i = 0; i < platformVideoIds.length; i += 50) {
      batches.push(platformVideoIds.slice(i, i + 50));
    }

    const results: VideoStats[] = [];
    const auth = this.getOAuth2Client();
    const youtube = google.youtube({ version: 'v3', auth });

    for (const batch of batches) {
      const response = await youtube.videos.list({
        part: ['statistics'],
        id: batch,
      });

      for (const video of response.data.items ?? []) {
        const stats = video.statistics ?? {};
        results.push({
          platformVideoId: video.id ?? '',
          views:     parseInt(stats.viewCount     ?? '0', 10),
          likes:     parseInt(stats.likeCount     ?? '0', 10),
          comments:  parseInt(stats.commentCount  ?? '0', 10),
          favorites: parseInt(stats.favoriteCount ?? '0', 10),
          collectedAt: new Date(),
        });
      }
    }

    return results;
  }
}
