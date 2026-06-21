import type { PrismaClient } from '@prisma/client';
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
export declare abstract class BaseRepository {
    protected readonly db: PrismaClient;
    protected readonly logger: import("winston").Logger;
    constructor(loggerName: string);
    protected buildPagination(options: FindManyOptions): {
        skip: number;
        take: number;
    };
    protected buildPaginatedResult<T>(data: T[], total: number, options: FindManyOptions): PaginatedResult<T>;
}
//# sourceMappingURL=base.repository.d.ts.map