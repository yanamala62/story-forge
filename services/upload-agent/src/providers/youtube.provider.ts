import { createLogger } from '@storyforge/shared';
import { google } from 'googleapis';
import { createReadStream, statSync } from 'fs';
import { basename } from 'path';

const logger = createLogger('youtube-provider');

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

export class YouTubeProvider {
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

    const auth = this.getOAuth2Client();
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
    const auth = this.getOAuth2Client();
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
