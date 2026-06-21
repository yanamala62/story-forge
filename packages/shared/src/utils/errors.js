"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentError = exports.StorageError = exports.QueueError = exports.FFmpegError = exports.ComfyUIError = exports.OllamaError = exports.ExternalServiceError = exports.ConflictError = exports.ForbiddenError = exports.UnauthorizedError = exports.ValidationError = exports.NotFoundError = exports.AppError = void 0;
exports.isAppError = isAppError;
exports.isOperationalError = isOperationalError;
exports.toAppError = toAppError;
class AppError extends Error {
    code;
    statusCode;
    isOperational;
    details;
    constructor(message, code, statusCode = 500, isOperational = true, details) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.AppError = AppError;
class NotFoundError extends AppError {
    constructor(resource, id) {
        super(id ? `${resource} with id "${id}" not found` : `${resource} not found`, 'NOT_FOUND', 404);
    }
}
exports.NotFoundError = NotFoundError;
class ValidationError extends AppError {
    constructor(message, details) {
        super(message, 'VALIDATION_ERROR', 422, true, details);
    }
}
exports.ValidationError = ValidationError;
class UnauthorizedError extends AppError {
    constructor(message = 'Unauthorized') {
        super(message, 'UNAUTHORIZED', 401);
    }
}
exports.UnauthorizedError = UnauthorizedError;
class ForbiddenError extends AppError {
    constructor(message = 'Forbidden') {
        super(message, 'FORBIDDEN', 403);
    }
}
exports.ForbiddenError = ForbiddenError;
class ConflictError extends AppError {
    constructor(message) {
        super(message, 'CONFLICT', 409);
    }
}
exports.ConflictError = ConflictError;
class ExternalServiceError extends AppError {
    service;
    constructor(service, message, details) {
        super(`${service} error: ${message}`, 'EXTERNAL_SERVICE_ERROR', 502, true, details);
        this.service = service;
    }
}
exports.ExternalServiceError = ExternalServiceError;
class OllamaError extends ExternalServiceError {
    constructor(message, details) {
        super('Ollama', message, details);
    }
}
exports.OllamaError = OllamaError;
class ComfyUIError extends ExternalServiceError {
    constructor(message, details) {
        super('ComfyUI', message, details);
    }
}
exports.ComfyUIError = ComfyUIError;
class FFmpegError extends AppError {
    constructor(message, details) {
        super(`FFmpeg error: ${message}`, 'FFMPEG_ERROR', 500, true, details);
    }
}
exports.FFmpegError = FFmpegError;
class QueueError extends AppError {
    constructor(message, details) {
        super(`Queue error: ${message}`, 'QUEUE_ERROR', 500, true, details);
    }
}
exports.QueueError = QueueError;
class StorageError extends AppError {
    constructor(message, details) {
        super(`Storage error: ${message}`, 'STORAGE_ERROR', 500, true, details);
    }
}
exports.StorageError = StorageError;
class AgentError extends AppError {
    agentName;
    constructor(agentName, message, details) {
        super(`Agent [${agentName}] error: ${message}`, 'AGENT_ERROR', 500, true, details);
        this.agentName = agentName;
    }
}
exports.AgentError = AgentError;
function isAppError(error) {
    return error instanceof AppError;
}
function isOperationalError(error) {
    return isAppError(error) && error.isOperational;
}
function toAppError(error) {
    if (isAppError(error))
        return error;
    if (error instanceof Error) {
        return new AppError(error.message, 'INTERNAL_ERROR', 500, false);
    }
    return new AppError('An unexpected error occurred', 'INTERNAL_ERROR', 500, false);
}
//# sourceMappingURL=errors.js.map