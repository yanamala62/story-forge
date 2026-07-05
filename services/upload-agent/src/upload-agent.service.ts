import { createLogger, getEnv, AgentError } from '@storyforge/shared';
import { YouTubeProvider } from './providers/youtube.provider.js';

const logger = createLogger('upload-agent');

export interface UploadToYouTubeInput {
  videoPath: string;
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  category?: string;
  privacyStatus?: 'public' | 'private' | 'unlisted';
}

export interface UploadToYouTubeResult {
  platform: 'YOUTUBE';
  platformVideoId: string;
  platformUrl: string;
  title: string;
}

export class UploadAgentService {
  private readonly youtube: YouTubeProvider | null;

  constructor() {
    const env = getEnv();

    // Only initialise if credentials are configured
    if (env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET && env.YOUTUBE_REFRESH_TOKEN) {
      this.youtube = new YouTubeProvider({
        clientId: env.YOUTUBE_CLIENT_ID,
        clientSecret: env.YOUTUBE_CLIENT_SECRET,
        refreshToken: env.YOUTUBE_REFRESH_TOKEN,
      });
      logger.info('UploadAgentService initialized with YouTube credentials');
    } else {
      this.youtube = null;
      logger.warn('YouTube credentials not configured — upload will fail if called');
    }
  }

  async uploadToYouTube(input: UploadToYouTubeInput): Promise<UploadToYouTubeResult> {
    if (!this.youtube) {
      throw new AgentError(
        'upload-agent',
        'YouTube credentials not configured. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REFRESH_TOKEN in .env',
      );
    }

    logger.info('Starting YouTube upload', { title: input.title });

    try {
      const result = await this.youtube.upload({
        videoPath: input.videoPath,
        title: input.title,
        description: input.description,
        tags: input.tags,
        hashtags: input.hashtags,
        category: input.category ?? '24',
        privacyStatus: input.privacyStatus ?? 'private',
      });

      return {
        platform: 'YOUTUBE',
        platformVideoId: result.videoId,
        platformUrl: result.url,
        title: result.title,
      };
    } catch (error) {
      throw new AgentError(
        'upload-agent',
        `YouTube upload failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }

  isYouTubeConfigured(): boolean {
    return this.youtube !== null;
  }

  /** Confirms the configured refresh token is still valid — used by the health check. */
  async checkYouTubeHealth(): Promise<{ configured: boolean; ok: boolean; message?: string }> {
    if (!this.youtube) {
      return { configured: false, ok: false, message: 'YouTube credentials not configured' };
    }
    try {
      await this.youtube.checkHealth();
      return { configured: true, ok: true };
    } catch (err) {
      return { configured: true, ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }
}
