import type { Request, Response, NextFunction } from 'express';
import { createLogger } from '@storyforge/shared';

const logger = createLogger('http');

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    const meta = {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: duration,
      userAgent: req.get('user-agent'),
      ip: req.ip,
    };
    const msg = `${req.method} ${req.path}`;

    if (res.statusCode >= 500) {
      logger.error(msg, meta);
    } else if (res.statusCode >= 400) {
      logger.warn(msg, meta);
    } else {
      logger.info(msg, meta);
    }
  });

  next();
}
