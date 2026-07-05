import { config as dotenvConfig } from 'dotenv';
import { join } from 'path';

// __dirname = apps/api/src/config → 4 levels up = project root
// Works in both dev (tsx, source paths) and production (compiled dist/config/)
dotenvConfig({
  path: join(__dirname, '..', '..', '..', '..', '.env'),
  override: false,
});

import { getEnv } from '@storyforge/shared';

export const config = getEnv();

export const corsOptions = {
  origin: config.CORS_ORIGINS.split(',').map((o) => o.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID', 'X-Total-Count'],
};

export const rateLimitOptions = {
  windowMs: 15 * 60 * 1000,
  max: config.NODE_ENV === 'production' ? 100 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, please try again later' },
  },
};

export const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'StoryForge AI API',
      version: config.APP_VERSION,
      description: 'Autonomous multi-agent AI content generation platform API',
      contact: { name: 'StoryForge AI', email: 'api@storyforge.ai' },
    },
    servers: [
      { url: `http://localhost:${config.APP_PORT}`, description: 'Development' },
      { url: 'https://story-forge-ctc8.onrender.com', description: 'Production' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/**/*.ts', './src/docs/**/*.ts'],
};
