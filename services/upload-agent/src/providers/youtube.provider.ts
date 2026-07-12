import { createLogger } from '@storyforge/shared';
import { google } from 'googleapis';
import { createReadStream, statSync } from 'fs';
import { basename } from 'path';

const logger = createLogger('youtube-provider');

// "Out-of-band" redirect target — Google shows the auth code directly on its
// own consent-screen page instead of redirecting to a server we control. No
// redirect_uri needs to be registered in Google Cloud Console for this to
// work with the existing Desktop-type OAuth client (same as scripts/youtube-auth.mjs).
const OOB_REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';


export interface YouTubeUploadInput {
  videoPath: string;
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  category?: string;
  privacyStatus?: 'public' | 'private' | 'unlisted';
  madeForKids?: boolean;
}

export interface YouTubeUploadResult {
  videoId: string;
  url: string;
  title: string;
}

/**
 * getRefreshToken is called fresh on every auth-client build (not cached at
 * construction) so a token saved by the "Reconnect YouTube" flow takes effect
 * on the very next request — no restart required.
 */
export class YouTubeProvider {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly getRefreshToken: () => Promise<string | null>;

  constructor(config: {
    clientId: string;
    clientSecret: string;
    getRefreshToken: () => Promise<string | null>;
  }) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.getRefreshToken = config.getRefreshToken;
  }

  private async getOAuth2Client() {
    const refreshToken = await this.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No YouTube refresh token available — reconnect YouTube in Settings');
    }
    const auth = new google.auth.OAuth2(this.clientId, this.clientSecret);
    auth.setCredentials({ refresh_token: refreshToken });
    return auth;
  }

  /** Builds the Google consent-screen URL for the "Reconnect YouTube" flow. */
  buildAuthUrl(): string {
    const auth = new google.auth.OAuth2(this.clientId, this.clientSecret, OOB_REDIRECT_URI);
    return auth.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // forces a fresh refresh_token every time, even on re-auth
      scope: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube'],
    });
  }

  /** Exchanges the code the user pasted from Google's consent page for tokens and returns the refresh token. */
  async exchangeCode(code: string): Promise<string> {
    const auth = new google.auth.OAuth2(this.clientId, this.clientSecret, OOB_REDIRECT_URI);
    const { tokens } = await auth.getToken(code.trim());
    if (!tokens.refresh_token) {
      throw new Error(
        'Google did not return a refresh token. Revoke access at ' +
          'https://myaccount.google.com/permissions and try reconnecting again.',
      );
    }
    return tokens.refresh_token;
  }


  /** Confirms the refresh token can still mint an access token — no quota-heavy call. */
  async checkHealth(): Promise<void> {
    const auth = await this.getOAuth2Client();
    await auth.getAccessToken();
  }

  async upload(input: YouTubeUploadInput): Promise<YouTubeUploadResult> {
    const {
      videoPath,
      title,
      description,
      tags,
      hashtags,
      category = '24', // 24 = Entertainment
      privacyStatus = 'private', // default private — set to 'public' in production
      madeForKids = false,
    } = input;

    const auth = await this.getOAuth2Client();
    const youtube = google.youtube({ version: 'v3', auth });

    // Append #Shorts hashtag to make YouTube recognise it as a Short
    const allHashtags = [...new Set([...hashtags, '#Shorts'])];
    const fullDescription =
      `${description}\n\n${allHashtags.join(' ')}`;

    // Title must be ≤100 chars; YouTube Shorts show best with ≤60
    const safeTitle = title.length > 100 ? title.slice(0, 97) + '...' : title;

    const fileSize = statSync(videoPath).size;

    logger.info('Starting YouTube upload', {
      videoPath,
      title: safeTitle,
      fileSize,
      privacyStatus,
    });

    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: safeTitle,
          description: fullDescription,
          tags: [...tags, 'Shorts', 'YouTubeShorts', 'anime', 'animestory'],
          categoryId: category,
          defaultLanguage: 'en',
        },
        status: {
          privacyStatus,
          madeForKids,
          selfDeclaredMadeForKids: madeForKids,
        },
      },
      media: {
        mimeType: 'video/mp4',
        body: createReadStream(videoPath),
      },
    });

    const videoId = response.data.id;
    if (!videoId) {
      throw new Error('YouTube API returned no video ID after upload');
    }

    const url = `https://www.youtube.com/shorts/${videoId}`;

    logger.info('YouTube upload complete', { videoId, url });

    return { videoId, url, title: safeTitle };
  }

  async getVideoStatus(videoId: string): Promise<'uploaded' | 'processed' | 'failed'> {
    const auth = await this.getOAuth2Client();
    const youtube = google.youtube({ version: 'v3', auth });

    const response = await youtube.videos.list({
      part: ['status', 'processingDetails'],
      id: [videoId],
    });

    const video = response.data.items?.[0];
    if (!video) return 'failed';

    const uploadStatus = video.status?.uploadStatus;
    if (uploadStatus === 'processed') return 'processed';
    if (uploadStatus === 'uploaded') return 'uploaded';
    return 'failed';
  }
}
