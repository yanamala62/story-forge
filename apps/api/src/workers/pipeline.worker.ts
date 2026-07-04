import { type Worker } from 'bullmq';
import { createLogger, getEnv } from '@storyforge/shared';
import type { EpisodePipelineJobData } from '@storyforge/shared';
import { createWorker } from '../infrastructure/bullmq.js';
import { PipelineOrchestratorService } from '../services/pipeline-orchestrator.service.js';
import { UploadPipelineService } from '../services/upload-pipeline.service.js';

const logger = createLogger('pipeline-worker');

let worker: Worker<EpisodePipelineJobData> | null = null;

export function startPipelineWorker(): Worker<EpisodePipelineJobData> {
  const env = getEnv();

  worker = createWorker<EpisodePipelineJobData>(
    'episode-pipeline',
    async (job) => {
      const { episodeId, storyId, episodeNumber, triggeredBy, uploadToYoutube } = job.data;

      logger.info('Pipeline job started', {
        jobId: job.id,
        episodeId,
        storyId,
        episodeNumber,
        triggeredBy,
        uploadToYoutube,
      });

      // Decide whether to upload: job data takes precedence; fall back to runtime check
      const shouldUpload = uploadToYoutube ?? UploadPipelineService.isYouTubeConfigured();

      const result = await PipelineOrchestratorService.run(episodeId, {
        uploadToYoutube: shouldUpload,
      });

      if (!result.success) {
        const failedStep = result.steps.find((s) => s.status === 'failed');
        throw new Error(
          `Pipeline failed at "${failedStep?.name ?? 'unknown'}" — ${failedStep?.error ?? ''}`,
        );
      }

      logger.info('Pipeline job completed', {
        jobId: job.id,
        episodeId,
        finalStatus: result.finalStatus,
        completed: result.steps.filter((s) => s.status === 'completed').length,
        skipped: result.steps.filter((s) => s.status === 'skipped').length,
      });
    },
    env.QUEUE_CONCURRENCY,
  );

  return worker;
}

export async function stopPipelineWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    logger.info('Pipeline worker stopped');
  }
}
