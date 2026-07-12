import { createLogger, getEnv, AgentError } from '@storyforge/shared';
import { SettingRepository } from '@storyforge/database';
import { YouTubeProvider } from './providers/youtube.provider.js';

const logger = createLogger('upload-agent');

// Key under which the live (reconnect-flow-updated) refresh token is stored
// in the `settings` table. Takes priority over YOUTUBE_REFRESH_TOKEN in .env.
const YOUTUBE_REFRESH_TOKEN_SETTING_KEY = 'youtube_refresh_token';

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
  private readonly settings = new SettingRepository();

  constructor() {
    const env = getEnv();

    // Only initialise if the OAuth client itself is configured — the refresh
    // token is resolved lazily per-call (DB first, then .env), so it's fine
    // for YOUTUBE_REFRESH_TOKEN to be unset here as long as reconnect has run.
    if (env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET) {
      this.youtube = new YouTubeProvider({
        clientId: env.YOUTUBE_CLIENT_ID,
        clientSecret: env.YOUTUBE_CLIENT_SECRET,
        getRefreshToken: () => this.getRefreshToken(),
      });
      logger.info('UploadAgentService initialized with YouTube OAuth client');
    } else {
      this.youtube = null;
      logger.warn('YouTube OAuth client not configured — upload will fail if called');
    }
  }

  /** DB value (kept fresh by the reconnect flow) wins; falls back to the .env seed value. */
  private async getRefreshToken(): Promise<string | null> {
    const stored = await this.settings.get(YOUTUBE_REFRESH_TOKEN_SETTING_KEY);
    if (stored) return stored;
    return getEnv().YOUTUBE_REFRESH_TOKEN ?? null;
  }

  async uploadToYouTube(input: UploadToYouTubeInput): Promise<UploadToYouTubeResult> {
    if (!this.youtube) {
      throw new AgentError(
        'upload-agent',
        'YouTube OAuth client not configured. Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in .env, ' +
          'then connect a channel from Settings.',
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
      return { configured: false, ok: false, message: 'YouTube OAuth client not configured' };
    }
    try {
      await this.youtube.checkHealth();
      return { configured: true, ok: true };
    } catch (err) {
      return { configured: true, ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Builds the Google consent-screen URL that kicks off "Reconnect YouTube". Google shows the code on-screen (oob flow) — no callback route needed. */
  buildYouTubeAuthUrl(): string {
    if (!this.youtube) {
      throw new AgentError(
        'upload-agent',
        'YouTube OAuth client not configured. Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in .env.',
      );
    }
    return this.youtube.buildAuthUrl();
  }

  /** Exchanges the code the user pasted from Google's consent page and persists the new refresh token. */
  async completeYouTubeReconnect(code: string): Promise<void> {
    if (!this.youtube) {
      throw new AgentError(
        'upload-agent',
        'YouTube OAuth client not configured. Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in .env.',
      );
    }
    const refreshToken = await this.youtube.exchangeCode(code);
    await this.settings.set(YOUTUBE_REFRESH_TOKEN_SETTING_KEY, refreshToken);
    logger.info('YouTube reconnected — refresh token saved to settings');
  }
}
