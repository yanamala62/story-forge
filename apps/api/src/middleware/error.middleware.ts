import type { Request, Response, NextFunction } from 'express';
import { isAppError, toAppError, createLogger } from '@storyforge/shared';
import type { ApiResponse } from '@storyforge/shared';

const logger = createLogger('error-middleware');

export function errorMiddleware(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const appError = toAppError(error);

  if (appError.statusCode >= 500) {
    logger.error('Unhandled error', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: appError.statusCode,
      code: appError.code,
      message: appError.message,
      stack: appError.stack,
    });
  } else {
    logger.warn('Client error', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: appError.statusCode,
      code: appError.code,
      message: appError.message,
    });
  }

  const response: ApiResponse = {
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(process.env['NODE_ENV'] !== 'production' && {
        details: appError.details,
        stack: appError.stack,
      }),
    },
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  };

  res.status(appError.statusCode).json(response);
}

export function notFoundMiddleware(req: Request, res: Response): void {
  const response: ApiResponse = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  };

  res.status(404).json(response);
}
