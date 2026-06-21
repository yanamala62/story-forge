import { createLogger, NotFoundError } from '@storyforge/shared';
import {
  EpisodeRepository,
  AudioRepository,
  SubtitleRepository,
  VideoRepository,
  ImageRepository,
} from '@storyforge/database';
import { VideoAgentService } from '@storyforge/video-agent';

const logger = createLogger('video-pipeline');

const episodeRepo = new EpisodeRepository();
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

    const result = await videoAgent.composeVideo({
      episodeId,
      imagePaths: images.map((img) => img.localPath),
      audioPath: audioFile.localPath,
      subtitlePath: subtitleFile.localPath,
    });

    await videoRepo.upsert({
      episodeId,
      filename: result.filename,
      localPath: result.localPath,
      duration: result.duration,
      fileSize: result.fileSize,
      width: result.width,
      height: result.height,
      fps: result.fps,
      thumbnailPath: result.thumbnailPath,
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
