import { createLogger, getEnv, AgentError, ExternalServiceError, persistFile } from '@storyforge/shared';
import { createHash } from 'crypto';
import { stat } from 'fs/promises';
import { join } from 'path';
import ffprobeStatic from 'ffprobe-static';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ytDlpConstants = require('yt-dlp-exec/src/constants.js') as { YOUTUBE_DL_PATH: string };

import { validateYouTubeUrl, extractVideoId } from './validators/youtube-url.validator.js';
import { getVideoInfo, downloadVideo } from './providers/ytdlp.provider.js';
import { probeVideoMetadata } from './providers/ffprobe.provider.js';

const logger = createLogger('video-source-agent');

// NOTE — authorization gate: this service intentionally does NOT ask the
// caller to prove ownership of the source video. Per product spec, the
// create-project API endpoint (apps/api/src/routes/clip-forge.route.ts)
// requires an explicit `ownershipConfirmed: true` flag from the frontend
// consent checkbox before this service is ever invoked. Do not remove that
// check thinking it's redundant with anything here — it is the ONLY
// authorization gate in the pipeline.

export interface IngestSourceInput {
  youtubeUrl: string;
  userId: string;
  projectId: string;
}

export interface VideoSourceResult {
  sourceType: 'YOUTUBE';
  sourceVideoId: string;
  sourceUrl: string;
  title: string;
  /** Actual local-file duration from ffprobe — the source of truth for splitting. */
  duration: number;
  width: number;
  height: number;
  fps: number;
  audioDetected: boolean;
  fingerprint: string;
  /** Local path to the downloaded original — NOTE: persistFile() below deletes
   *  this file once uploaded to remote storage (if configured). Callers that
   *  need the local file again (e.g. rendering parts) must re-materialize it
   *  via ensureLocalFile(localPath, s3Key) from '@storyforge/shared'. */
  localPath: string;
  s3Key: string | null;
  s3Url: string | null;
}

export class VideoSourceAgentService {
  private readonly storageBasePath: string;
  private readonly ffprobePath: string;
  private readonly ytdlpPath: string;
  private readonly ytdlpCookiesPath: string | undefined;

  constructor() {
    const env = getEnv();
    this.storageBasePath = env.STORAGE_LOCAL_PATH;

    this.ffprobePath =
      env.FFPROBE_BINARY_PATH !== 'ffprobe' ? env.FFPROBE_BINARY_PATH : ffprobeStatic.path;

    // Fall back to the binary yt-dlp-exec already bundled/downloaded at
    // node_modules/yt-dlp-exec/bin — same override-vs-bundled-binary pattern
    // as FFMPEG_BINARY_PATH/FFPROBE_BINARY_PATH in video-agent.
    this.ytdlpPath = env.YTDLP_BINARY_PATH !== 'yt-dlp' ? env.YTDLP_BINARY_PATH : ytDlpConstants.YOUTUBE_DL_PATH;
    this.ytdlpCookiesPath = env.YTDLP_COOKIES_PATH;

    logger.debug('Binary paths resolved', { ffprobe: this.ffprobePath, ytdlp: this.ytdlpPath });
  }

  async ingestSource(input: IngestSourceInput): Promise<VideoSourceResult> {
    const { youtubeUrl, userId, projectId } = input;

    const { videoId } = validateYouTubeUrl(youtubeUrl);

    logger.info('Ingesting Clip Forge source video', { projectId, videoId });

    try {
      // yt-dlp's own metadata is a hint only (title is reliable; duration is not).
      const info = await getVideoInfo(this.ytdlpPath, youtubeUrl, this.ytdlpCookiesPath);

      const outputDir = join(process.cwd(), this.storageBasePath, 'clip-forge', userId, projectId, 'source');
      const localPath = join(outputDir, 'original.mp4');

      await downloadVideo(this.ytdlpPath, youtubeUrl, localPath, this.ytdlpCookiesPath);

      // The local file is the source of truth for splitting — never trust
      // yt-dlp's self-reported duration for continuity math.
      const metadata = await probeVideoMetadata(this.ffprobePath, localPath);

      const fileStat = await stat(localPath);
      const fingerprint = createHash('sha256')
        .update(`${videoId}:${fileStat.size}:${metadata.durationSeconds}`)
        .digest('hex');

      const persisted = await persistFile(localPath, 'video/mp4');

      logger.info('Source video ingested', {
        projectId,
        videoId,
        duration: metadata.durationSeconds,
        width: metadata.width,
        height: metadata.height,
        audioDetected: metadata.hasAudio,
      });

      return {
        sourceType: 'YOUTUBE',
        sourceVideoId: videoId,
        sourceUrl: youtubeUrl,
        title: info.title,
        duration: metadata.durationSeconds,
        width: metadata.width,
        height: metadata.height,
        fps: metadata.fps,
        audioDetected: metadata.hasAudio,
        fingerprint,
        localPath,
        s3Key: persisted.s3Key,
        s3Url: persisted.s3Url,
      };
    } catch (error) {
      if (error instanceof AgentError || error instanceof ExternalServiceError) throw error;
      throw new AgentError(
        'video-source-agent',
        `Failed to ingest source video: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }
}

export { validateYouTubeUrl, extractVideoId };
