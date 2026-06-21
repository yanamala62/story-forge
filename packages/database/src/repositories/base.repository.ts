import type { PrismaClient } from '@prisma/client';
import { createLogger } from '@storyforge/shared';
import { prisma } from '../client.js';

export interface FindManyOptions {
  page?: number;
  limit?: number;
  orderBy?: Record<string, 'asc' | 'desc'>;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export abstract class BaseRepository {
  protected readonly db: PrismaClient;
  protected readonly logger;

  constructor(loggerName: string) {
    this.db = prisma;
    this.logger = createLogger(loggerName);
  }

  protected buildPagination(options: FindManyOptions): { skip: number; take: number } {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    return {
      skip: (page - 1) * limit,
      take: limit,
    };
  }

  protected buildPaginatedResult<T>(
    data: T[],
    total: number,
    options: FindManyOptions,
  ): PaginatedResult<T> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }
}
