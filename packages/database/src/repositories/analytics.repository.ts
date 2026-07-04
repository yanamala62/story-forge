import type { Analytics } from '@prisma/client';
import { BaseRepository } from './base.repository.js';

export interface CreateAnalyticsInput {
  uploadId: string;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  watchTime?: number;
  avgRetention?: number;
  ctr?: number;
  impressions?: number;
}

export class AnalyticsRepository extends BaseRepository {
  constructor() {
    super('analytics-repository');
  }

  async create(input: CreateAnalyticsInput): Promise<Analytics> {
    return this.db.analytics.create({
      data: {
        uploadId: input.uploadId,
        views: input.views ?? 0,
        likes: input.likes ?? 0,
        comments: input.comments ?? 0,
        shares: input.shares ?? 0,
        saves: input.saves ?? 0,
        watchTime: input.watchTime ?? 0,
        avgRetention: input.avgRetention ?? 0,
        ctr: input.ctr ?? 0,
        impressions: input.impressions ?? 0,
      },
    });
  }

  async findByUploadId(uploadId: string): Promise<Analytics[]> {
    return this.db.analytics.findMany({
      where: { uploadId },
      orderBy: { collectedAt: 'desc' },
    });
  }

  async findLatestByUploadId(uploadId: string): Promise<Analytics | null> {
    return this.db.analytics.findFirst({
      where: { uploadId },
      orderBy: { collectedAt: 'desc' },
    });
  }

  /** Get latest snapshot for all uploads related to a given video. */
  async findLatestByVideoId(videoId: string): Promise<Analytics | null> {
    return this.db.analytics.findFirst({
      where: { upload: { videoId } },
      orderBy: { collectedAt: 'desc' },
    });
  }

  /** Total aggregate stats across all analytics rows. */
  async aggregate(): Promise<{
    totalViews: number;
    totalLikes: number;
    totalComments: number;
    snapshotCount: number;
  }> {
    const agg = await this.db.analytics.aggregate({
      _sum: { views: true, likes: true, comments: true },
      _count: { id: true },
    });
    return {
      totalViews: agg._sum.views ?? 0,
      totalLikes: agg._sum.likes ?? 0,
      totalComments: agg._sum.comments ?? 0,
      snapshotCount: agg._count.id,
    };
  }
}
