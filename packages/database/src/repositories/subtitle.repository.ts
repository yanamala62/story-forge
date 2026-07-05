import type { SubtitleFile, SubtitleStatus } from '@prisma/client';
import { BaseRepository } from './base.repository.js';

export interface CreateSubtitleFileInput {
  episodeId: string;
  filename: string;
  localPath: string;
  s3Key?: string | null;
  s3Url?: string | null;
  language?: string;
}

export class SubtitleRepository extends BaseRepository {
  constructor() {
    super('subtitle-repository');
  }

  async upsert(input: CreateSubtitleFileInput): Promise<SubtitleFile> {
    const record = await this.db.subtitleFile.upsert({
      where: { episodeId: input.episodeId },
      update: {
        filename: input.filename,
        localPath: input.localPath,
        s3Key: input.s3Key ?? null,
        s3Url: input.s3Url ?? null,
        language: input.language ?? 'en',
        status: 'COMPLETED',
      },
      create: {
        episodeId: input.episodeId,
        filename: input.filename,
        localPath: input.localPath,
        s3Key: input.s3Key ?? null,
        s3Url: input.s3Url ?? null,
        language: input.language ?? 'en',
        format: 'SRT',
        status: 'COMPLETED',
      },
    });

    this.logger.info('Subtitle file saved', { episodeId: input.episodeId });
    return record;
  }

  async findByEpisodeId(episodeId: string): Promise<SubtitleFile | null> {
    return this.db.subtitleFile.findUnique({ where: { episodeId } });
  }

  async updateStatus(episodeId: string, status: SubtitleStatus): Promise<void> {
    await this.db.subtitleFile.update({ where: { episodeId }, data: { status } });
  }
}
