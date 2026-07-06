export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    code: string,
    statusCode = 500,
    isOperational = true,
    details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} with id "${id}" not found` : `${resource} not found`,
      'NOT_FOUND',
      404,
    );
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 422, true, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 'FORBIDDEN', 403);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
  }
}

export class ExternalServiceError extends AppError {
  public readonly service: string;

  constructor(service: string, message: string, details?: unknown) {
    super(`${service} error: ${message}`, 'EXTERNAL_SERVICE_ERROR', 502, true, details);
    this.service = service;
  }
}

export class LLMValidationError extends ExternalServiceError {
  constructor(message: string, details?: unknown) {
    super('LLM', message, details);
  }
}

export class FFmpegError extends AppError {
  constructor(message: string, details?: unknown) {
    super(`FFmpeg error: ${message}`, 'FFMPEG_ERROR', 500, true, details);
  }
}

export class StorageError extends AppError {
  constructor(message: string, details?: unknown) {
    super(`Storage error: ${message}`, 'STORAGE_ERROR', 500, true, details);
  }
}

export class AgentError extends AppError {
  public readonly agentName: string;

  constructor(agentName: string, message: string, details?: unknown) {
    super(`Agent [${agentName}] error: ${message}`, 'AGENT_ERROR', 500, true, details);
    this.agentName = agentName;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function isOperationalError(error: unknown): boolean {
  return isAppError(error) && error.isOperational;
}

export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  if (error instanceof Error) {
    return new AppError(error.message, 'INTERNAL_ERROR', 500, false);
  }
  return new AppError('An unexpected error occurred', 'INTERNAL_ERROR', 500, false);
}
