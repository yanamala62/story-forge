import type { Upload, UploadStatus, Platform } from '@prisma/client';
import { BaseRepository } from './base.repository.js';

export interface CreateUploadInput {
  videoId: string;
  platform: Platform;
  platformVideoId?: string;
  platformUrl?: string;
  status?: UploadStatus;
  error?: string;
}

export class UploadRepository extends BaseRepository {
  constructor() {
    super('upload-repository');
  }

  async create(input: CreateUploadInput): Promise<Upload> {
    return this.db.upload.create({
      data: {
        videoId: input.videoId,
        platform: input.platform,
        platformVideoId: input.platformVideoId ?? null,
        platformUrl: input.platformUrl ?? null,
        status: input.status ?? 'PENDING',
        error: input.error ?? null,
      },
    });
  }

  async markCompleted(
    id: string,
    platformVideoId: string,
    platformUrl: string,
  ): Promise<Upload> {
    return this.db.upload.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        platformVideoId,
        platformUrl,
        publishedAt: new Date(),
      },
    });
  }

  async markFailed(id: string, error: string): Promise<Upload> {
    return this.db.upload.update({
      where: { id },
      data: { status: 'FAILED', error },
    });
  }

  async findByVideoId(videoId: string): Promise<Upload[]> {
    return this.db.upload.findMany({
      where: { videoId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByEpisodeAndPlatform(
    videoId: string,
    platform: Platform,
  ): Promise<Upload | null> {
    return this.db.upload.findFirst({
      where: { videoId, platform, status: 'PUBLISHED' },
    });
  }

  async findAllPublished(): Promise<Upload[]> {
    return this.db.upload.findMany({
      where: { status: 'PUBLISHED', platformVideoId: { not: null } },
      orderBy: { publishedAt: 'desc' },
    });
  }
}
