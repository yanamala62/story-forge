import type { Request, Response, NextFunction } from 'express';
import { createLogger } from '@storyforge/shared';

const logger = createLogger('http');

// High-frequency polling routes — log at debug to keep terminal clean
const SILENT_POLL_PATTERN = /\/(scheduler\/status|pipeline\/status|analytics\/summary|health)$/;

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    const meta = {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: duration,
    };
    const msg = `${req.method} ${req.path}`;

    if (res.statusCode >= 500) {
      logger.error(msg, meta);
    } else if (res.statusCode >= 400) {
      logger.warn(msg, meta);
    } else if (req.method === 'GET' && SILENT_POLL_PATTERN.test(req.path)) {
      // Suppress repetitive polling from cluttering the pipeline flow logs
      logger.debug(msg, meta);
    } else {
      logger.info(msg, meta);
    }
  });

  next();
}
