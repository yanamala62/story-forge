import type { Video, VideoStatus } from '@prisma/client';
import { BaseRepository } from './base.repository.js';

export interface CreateVideoInput {
  episodeId: string;
  filename: string;
  localPath: string;
  s3Key?: string | null;
  s3Url?: string | null;
  duration: number;
  fileSize: number;
  width?: number;
  height?: number;
  fps?: number;
  thumbnailPath?: string | null;
  thumbnailS3Key?: string | null;
  thumbnailS3Url?: string | null;
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
        s3Key: input.s3Key ?? null,
        s3Url: input.s3Url ?? null,
        duration: input.duration,
        fileSize: BigInt(input.fileSize),
        thumbnailPath: input.thumbnailPath ?? null,
        thumbnailS3Key: input.thumbnailS3Key ?? null,
        thumbnailS3Url: input.thumbnailS3Url ?? null,
        status: 'COMPLETED',
      },
      create: {
        episodeId: input.episodeId,
        filename: input.filename,
        localPath: input.localPath,
        s3Key: input.s3Key ?? null,
        s3Url: input.s3Url ?? null,
        duration: input.duration,
        fileSize: BigInt(input.fileSize),
        width: input.width ?? 1080,
        height: input.height ?? 1920,
        fps: input.fps ?? 30,
        codec: 'h264',
        thumbnailPath: input.thumbnailPath ?? null,
        thumbnailS3Key: input.thumbnailS3Key ?? null,
        thumbnailS3Url: input.thumbnailS3Url ?? null,
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
