import type { Video, VideoStatus } from '@prisma/client';
import { BaseRepository } from './base.repository.js';

export interface CreateVideoInput {
  episodeId: string;
  filename: string;
  localPath: string;
  duration: number;
  fileSize: number;
  width?: number;
  height?: number;
  fps?: number;
  thumbnailPath?: string | null;
}

export class VideoRepository extends BaseRepository {
  constructor() {
    super('video-repository');
  }

  async upsert(input: CreateVideoInput): Promise<Video> {
    const record = await this.db.video.upsert({
      where: { episodeId: input.episodeId },
      update: {
        filename: input.filename,
        localPath: input.localPath,
        duration: input.duration,
        fileSize: BigInt(input.fileSize),
        thumbnailPath: input.thumbnailPath ?? null,
        status: 'COMPLETED',
      },
      create: {
        episodeId: input.episodeId,
        filename: input.filename,
        localPath: input.localPath,
        duration: input.duration,
        fileSize: BigInt(input.fileSize),
        width: input.width ?? 1080,
        height: input.height ?? 1920,
        fps: input.fps ?? 30,
        codec: 'h264',
        thumbnailPath: input.thumbnailPath ?? null,
        status: 'COMPLETED',
      },
    });

    this.logger.info('Video saved', { episodeId: input.episodeId, duration: input.duration });
    return record;
  }

  async findByEpisodeId(episodeId: string): Promise<Video | null> {
    return this.db.video.findUnique({ where: { episodeId } });
  }

  async updateStatus(episodeId: string, status: VideoStatus): Promise<void> {
    await this.db.video.update({ where: { episodeId }, data: { status } });
  }
}
