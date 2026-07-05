import { createLogger, NotFoundError, ensureLocalFile, releaseLocalFile } from '@storyforge/shared';
import {
  EpisodeRepository,
  AudioRepository,
  SubtitleRepository,
  VideoRepository,
  ImageRepository,
  StoryRepository,
} from '@storyforge/database';
import { VideoAgentService } from '@storyforge/video-agent';

const logger = createLogger('video-pipeline');

const episodeRepo = new EpisodeRepository();
const storyRepo = new StoryRepository();
const audioRepo = new AudioRepository();
const subtitleRepo = new SubtitleRepository();
const imageRepo = new ImageRepository();
const videoRepo = new VideoRepository();
const videoAgent = new VideoAgentService();

export interface VideoPipelineResult {
  episodeId: string;
  videoPath: string;
  thumbnailPath: string;
  filename: string;
  duration: number;
  fileSizeBytes: number;
  width: number;
  height: number;
  fps: number;
}

export const VideoPipelineService = {
  async composeVideoForEpisode(episodeId: string): Promise<VideoPipelineResult> {
    logger.info('Starting video pipeline', { episodeId });

    const episode = await episodeRepo.findById(episodeId);
    if (!episode) throw new NotFoundError('Episode', episodeId);

    const story = await storyRepo.findById(episode.storyId);
    // Cast through unknown — IDE shows stale types until language server restarts,
    // but tsc and runtime both see the regenerated Prisma client correctly.
    const language = String((story as unknown as { language?: string })?.language ?? 'EN');

    // Get narration audio
    const audioFile = await audioRepo.findByEpisodeId(episodeId);
    if (!audioFile) {
      throw new Error('No narration audio found — run narration generation first (M3)');
    }

    // Get subtitles
    const subtitleFile = await subtitleRepo.findByEpisodeId(episodeId);
    if (!subtitleFile) {
      throw new Error('No subtitle file found — run subtitle generation first (M4)');
    }

    // Get generated images ordered by scene number
    const images = await imageRepo.findByEpisodeScenes(episodeId);
    if (!images.length) {
      throw new Error('No generated images found — run image generation first (M2)');
    }

    await episodeRepo.updateStatus(episodeId, 'COMPOSING_VIDEO');

    // Re-download any inputs that were already uploaded to remote storage and
    // cleaned up locally after M2/M3/M4 — ffmpeg needs real local files.
    const imageDownloaded = await Promise.all(
      images.map((img) => ensureLocalFile(img.localPath, img.s3Key)),
    );
    const audioDownloaded = await ensureLocalFile(audioFile.localPath, audioFile.s3Key);
    const subtitleDownloaded = await ensureLocalFile(subtitleFile.localPath, subtitleFile.s3Key);

    let result;
    try {
      result = await videoAgent.composeVideo({
        episodeId,
        imagePaths: images.map((img) => img.localPath),
        audioPath: audioFile.localPath,
        subtitlePath: subtitleFile.localPath,
        language,
      });
    } finally {
      await Promise.all([
        ...images.map((img, i) => releaseLocalFile(img.localPath, imageDownloaded[i]!)),
        releaseLocalFile(audioFile.localPath, audioDownloaded),
        releaseLocalFile(subtitleFile.localPath, subtitleDownloaded),
      ]);
    }

    await videoRepo.upsert({
      episodeId,
      filename: result.filename,
      localPath: result.localPath,
      s3Key: result.s3Key,
      s3Url: result.s3Url,
      duration: result.duration,
      fileSize: result.fileSize,
      width: result.width,
      height: result.height,
      fps: result.fps,
      thumbnailPath: result.thumbnailPath,
      thumbnailS3Key: result.thumbnailS3Key,
      thumbnailS3Url: result.thumbnailS3Url,
    });

    await episodeRepo.updateStatus(episodeId, 'GENERATING_SEO');

    logger.info('Video pipeline complete', {
      episodeId,
      duration: result.duration,
      fileSize: result.fileSize,
    });

    return {
      episodeId,
      videoPath: result.localPath,
      thumbnailPath: result.thumbnailPath,
      filename: result.filename,
      duration: result.duration,
      fileSizeBytes: result.fileSize,
      width: result.width,
      height: result.height,
      fps: result.fps,
    };
  },

  async getEpisodeVideo(episodeId: string) {
    const video = await videoRepo.findByEpisodeId(episodeId);
    if (!video) return null;
    // Serialize BigInt to Number for JSON response
    return { ...video, fileSize: Number(video.fileSize) };
  },
};
