import http from 'http';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { connectDatabase, disconnectDatabase, EpisodeRepository, ClipForgeProjectRepository } from '@storyforge/database';
import { runBootTimeRetentionSweep } from './services/episode-retention.service.js';
import { createLogger } from '@storyforge/shared';

const logger = createLogger('server');

async function bootstrap(): Promise<void> {
  logger.info('Starting StoryForge AI API...', {
    version: config.APP_VERSION,
    environment: config.NODE_ENV,
  });

  await connectDatabase();

  // Any episode still in a non-terminal status at boot was orphaned by the previous
  // process dying mid-pipeline (crash, restart, deploy) — mark it FAILED so it's
  // resumable instead of silently blocking that story's future triggers forever.
  const orphanedCount = await new EpisodeRepository().reconcileOrphanedEpisodes();
  if (orphanedCount > 0) {
    logger.warn(`Reconciled ${orphanedCount} orphaned episode(s) from a previous run`);
  }

  // Same reconciliation for Clip Forge projects orphaned mid-run — otherwise
  // the UI spins on SOURCE_VALIDATING/PROCESSING forever after a restart.
  const orphanedProjects = await new ClipForgeProjectRepository().reconcileOrphanedProjects();
  if (orphanedProjects > 0) {
    logger.warn(`Reconciled ${orphanedProjects} orphaned Clip Forge project(s) from a previous run`);
  }

  // Boot-time retention sweep: runs asynchronously so it never delays server startup.
  // Catches stories whose cleanup was skipped because a previous container crashed
  // before the pipeline's finally block could fire retention cleanup.
  void runBootTimeRetentionSweep();

  const app = createApp();
  const server = http.createServer(app);

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn(`Port ${config.APP_PORT} in use — waiting 2s for old process to release...`);
      setTimeout(() => { server.close(); server.listen(config.APP_PORT, config.APP_HOST); }, 2000);
    } else {
      logger.error('Server listen error', { error: err.message });
      process.exit(1);
    }
  });

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
