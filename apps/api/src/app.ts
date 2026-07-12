import 'express-async-errors';
import express, { type Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { corsOptions, rateLimitOptions, swaggerOptions } from './config/index.js';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';
import { requestLoggerMiddleware } from './middleware/request-logger.middleware.js';
import { errorMiddleware, notFoundMiddleware } from './middleware/error.middleware.js';
import { healthRouter } from './routes/health.route.js';
import { storiesRouter } from './routes/stories.route.js';
import { episodesRouter } from './routes/episodes.route.js';
import { imagesRouter } from './routes/images.route.js';
import { narrationRouter } from './routes/narration.route.js';
import { subtitlesRouter } from './routes/subtitles.route.js';
import { videoRouter } from './routes/video.route.js';
import { seoRouter } from './routes/seo.route.js';
import { uploadRouter } from './routes/upload.route.js';
import { pipelineRouter } from './routes/pipeline.route.js';
import { schedulerRouter } from './routes/scheduler.route.js';
import { analyticsRouter } from './routes/analytics.route.js';
import { settingsRouter } from './routes/settings.route.js';

export function createApp(): Application {
  const app = express();

  // Trust proxy (for rate limiting behind NGINX)
  app.set('trust proxy', 1);

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
    }),
  );

  // CORS
  app.use(cors(corsOptions));

  // Compression — skip SSE routes, which must stream uncompressed/unbuffered
  app.use(
    compression({
      filter: (req, res) => (req.path.includes('/pipeline/logs/stream') ? false : compression.filter(req, res)),
    }),
  );

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request ID + timing
  app.use(requestIdMiddleware);

  // Request logging
  app.use(requestLoggerMiddleware);

  // Rate limiting
  app.use('/api', rateLimit(rateLimitOptions));

  // API Documentation
  const swaggerSpec = swaggerJsdoc(swaggerOptions);
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
  app.get('/docs.json', (_req, res) => res.json(swaggerSpec));

  // Routes
  app.use('/health', healthRouter);
  app.use('/api/stories', storiesRouter);
  app.use('/api/episodes', episodesRouter);
  app.use('/api', imagesRouter);
  app.use('/api', narrationRouter);
  app.use('/api', subtitlesRouter);
  app.use('/api', videoRouter);
  app.use('/api', seoRouter);
  app.use('/api', uploadRouter);
  app.use('/api', pipelineRouter);
  app.use('/api', schedulerRouter);
  app.use('/api', analyticsRouter);
  app.use('/api', settingsRouter);

  // 404 handler
  app.use(notFoundMiddleware);

  // Error handler (must be last)
  app.use(errorMiddleware);

  return app;
}
