export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: ApiError;
    meta?: ApiMeta;
    timestamp: string;
    requestId: string;
}
export interface ApiError {
    code: string;
    message: string;
    details?: unknown;
    stack?: string;
}
export interface ApiMeta {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
    hasNext?: boolean;
    hasPrev?: boolean;
}
export interface PaginationQuery {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}
export interface HealthCheckResponse {
    status: 'healthy' | 'degraded' | 'unhealthy';
    version: string;
    uptime: number;
    timestamp: string;
    services: Record<string, ServiceHealth>;
}
export interface ServiceHealth {
    status: 'up' | 'down' | 'unknown';
    latencyMs?: number;
    error?: string;
}
export interface CreateStoryRequest {
    title: string;
    genre: string;
    style?: string;
    synopsis: string;
    targetAudience?: string;
    initialCharacters?: Array<{
        name: string;
        description: string;
        visualDescription: string;
        personality: string;
        role: string;
    }>;
}
export interface CreateEpisodeRequest {
    storyId: string;
    triggeredBy?: 'manual' | 'api';
}
//# sourceMappingURL=api.types.d.ts.map