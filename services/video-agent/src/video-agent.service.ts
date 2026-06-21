import { createLogger, getEnv, AgentError } from '@storyforge/shared';
import { join } from 'path';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { composeVideo, generateThumbnail } from './providers/ffmpeg.provider.js';

const logger = createLogger('video-agent');

export interface ComposeEpisodeVideoInput {
  episodeId: string;
  imagePaths: string[];
  audioPath: string;
  subtitlePath: string;
}

export interface ComposeEpisodeVideoResult {
  localPath: string;
  thumbnailPath: string;
  filename: string;
  duration: number;
  fileSize: number;
  width: number;
  height: number;
  fps: number;
}

export class VideoAgentService {
  private readonly storageBasePath: string;
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;
  private readonly width: number;
  private readonly height: number;
  private readonly fps: number;
  private readonly crf: number;
  private readonly codec: string;

  constructor() {
    const env = getEnv();
    this.storageBasePath = env.STORAGE_LOCAL_PATH;

    // Prefer explicit env var; fall back to bundled npm binary
    this.ffmpegPath =
      env.FFMPEG_BINARY_PATH !== 'ffmpeg'
        ? env.FFMPEG_BINARY_PATH
        : (ffmpegStatic ?? 'ffmpeg');
    this.ffprobePath =
      env.FFPROBE_BINARY_PATH !== 'ffprobe'
        ? env.FFPROBE_BINARY_PATH
        : ffprobeStatic.path;

    this.width = env.VIDEO_WIDTH;
    this.height = env.VIDEO_HEIGHT;
    this.fps = env.VIDEO_FPS;
    this.crf = env.VIDEO_CRF;
    this.codec = env.VIDEO_CODEC;

    logger.debug('FFmpeg paths resolved', { ffmpeg: this.ffmpegPath, ffprobe: this.ffprobePath });
  }

  async composeVideo(input: ComposeEpisodeVideoInput): Promise<ComposeEpisodeVideoResult> {
    const { episodeId, imagePaths, audioPath, subtitlePath } = input;

    if (!imagePaths.length) {
      throw new AgentError('video-agent', 'No images provided');
    }

    logger.info('Starting video composition', { episodeId, imageCount: imagePaths.length });

    const filename = 'episode.mp4';
    const outputDir = join(process.cwd(), this.storageBasePath, 'video', episodeId);
    const outputPath = join(outputDir, filename);
    const thumbnailPath = join(outputDir, 'thumbnail.jpg');

    try {
      const result = await composeVideo(this.ffmpegPath, this.ffprobePath, {
        imagePaths,
        audioPath,
        subtitlePath,
        outputPath,
        width: this.width,
        height: this.height,
        fps: this.fps,
        crf: this.crf,
        codec: this.codec,
      });

      await generateThumbnail(this.ffmpegPath, outputPath, thumbnailPath);

      logger.info('Video composition complete', {
        episodeId,
        duration: result.duration,
        fileSize: result.fileSize,
        thumbnailPath,
      });

      return {
        localPath: result.outputPath,
        thumbnailPath,
        filename,
        duration: result.duration,
        fileSize: result.fileSize,
        width: this.width,
        height: this.height,
        fps: this.fps,
      };
    } catch (error) {
      throw new AgentError(
        'video-agent',
        `Video composition failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }
}
