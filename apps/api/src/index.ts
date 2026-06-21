import http from 'http';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { connectDatabase, disconnectDatabase } from '@storyforge/database';
import { disconnectRedis } from './infrastructure/redis.js';
import { createLogger } from '@storyforge/shared';

const logger = createLogger('server');

async function bootstrap(): Promise<void> {
  logger.info('Starting StoryForge AI API...', {
    version: config.APP_VERSION,
    environment: config.NODE_ENV,
  });

  await connectDatabase();

  const app = createApp();
  const server = http.createServer(app);

  server.listen(config.APP_PORT, config.APP_HOST, () => {
    logger.info(`API server running`, {
      host: config.APP_HOST,
      port: config.APP_PORT,
      docs: `http://${config.APP_HOST}:${config.APP_PORT}/docs`,
      health: `http://${config.APP_HOST}:${config.APP_PORT}/health`,
    });
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    server.close(async () => {
      try {
        await disconnectDatabase();
        await disconnectRedis();
        logger.info('Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
    process.exit(1);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
