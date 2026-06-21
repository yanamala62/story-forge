export declare class AppError extends Error {
    readonly code: string;
    readonly statusCode: number;
    readonly isOperational: boolean;
    readonly details?: unknown;
    constructor(message: string, code: string, statusCode?: number, isOperational?: boolean, details?: unknown);
}
export declare class NotFoundError extends AppError {
    constructor(resource: string, id?: string);
}
export declare class ValidationError extends AppError {
    constructor(message: string, details?: unknown);
}
export declare class UnauthorizedError extends AppError {
    constructor(message?: string);
}
export declare class ForbiddenError extends AppError {
    constructor(message?: string);
}
export declare class ConflictError extends AppError {
    constructor(message: string);
}
export declare class ExternalServiceError extends AppError {
    readonly service: string;
    constructor(service: string, message: string, details?: unknown);
}
export declare class OllamaError extends ExternalServiceError {
    constructor(message: string, details?: unknown);
}
export declare class ComfyUIError extends ExternalServiceError {
    constructor(message: string, details?: unknown);
}
export declare class FFmpegError extends AppError {
    constructor(message: string, details?: unknown);
}
export declare class QueueError extends AppError {
    constructor(message: string, details?: unknown);
}
export declare class StorageError extends AppError {
    constructor(message: string, details?: unknown);
}
export declare class AgentError extends AppError {
    readonly agentName: string;
    constructor(agentName: string, message: string, details?: unknown);
}
export declare function isAppError(error: unknown): error is AppError;
export declare function isOperationalError(error: unknown): boolean;
export declare function toAppError(error: unknown): AppError;
//# sourceMappingURL=errors.d.ts.map