import type { SeoMetadata } from '@prisma/client';
import { BaseRepository } from './base.repository.js';

export interface CreateSeoMetadataInput {
  videoId: string;
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  category?: string;
  language?: string;
}

export class SeoRepository extends BaseRepository {
  constructor() {
    super('seo-repository');
  }

  async upsert(input: CreateSeoMetadataInput): Promise<SeoMetadata> {
    const record = await this.db.seoMetadata.upsert({
      where: { videoId: input.videoId },
      update: {
        title: input.title,
        description: input.description,
        tags: input.tags,
        hashtags: input.hashtags,
        category: input.category ?? 'Entertainment',
        language: input.language ?? 'en',
      },
      create: {
        videoId: input.videoId,
        title: input.title,
        description: input.description,
        tags: input.tags,
        hashtags: input.hashtags,
        category: input.category ?? 'Entertainment',
        language: input.language ?? 'en',
      },
    });

    this.logger.info('SEO metadata saved', { videoId: input.videoId });
    return record;
  }

  async findByVideoId(videoId: string): Promise<SeoMetadata | null> {
    return this.db.seoMetadata.findUnique({ where: { videoId } });
  }
}
