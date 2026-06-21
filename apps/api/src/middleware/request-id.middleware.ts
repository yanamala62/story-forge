import type { Request, Response, NextFunction } from 'express';
import { generateRequestId } from '@storyforge/shared';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.requestId = (req.headers['x-request-id'] as string | undefined) ?? generateRequestId();
  req.startTime = Date.now();
  res.setHeader('X-Request-ID', req.requestId);
  next();
}
