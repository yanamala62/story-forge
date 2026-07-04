import { Queue, Worker, type Job, type ConnectionOptions } from 'bullmq';
import { createLogger, getEnv } from '@storyforge/shared';

const logger = createLogger('bullmq');

function getConnectionOptions(): ConnectionOptions {
  const env = getEnv();
  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    db: env.REDIS_DB,
    // Required for BullMQ workers (blocking commands need unlimited retries)
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

export function createQueue<T>(name: string): Queue<T> {
  return new Queue<T>(name, {
    connection: getConnectionOptions(),
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    },
  });
}

export function createWorker<T>(
  queueName: string,
  processor: (job: Job<T>) => Promise<void>,
  concurrency = 2,
): Worker<T> {
  const worker = new Worker<T>(queueName, processor, {
    connection: getConnectionOptions(),
    concurrency,
    // Pipeline jobs can run 3–10 min; lock must outlast the entire run
    lockDuration: 30 * 60 * 1000,
    lockRenewTime: 5 * 60 * 1000,
  });

  worker.on('completed', (job) => {
    logger.info('Job completed', { queue: queueName, jobId: job.id, name: job.name });
  });

  worker.on('failed', (job, err) => {
    logger.error('Job failed', {
      queue: queueName,
      jobId: job?.id,
      name: job?.name,
      error: err.message,
    });
  });

  worker.on('error', (err) => {
    logger.error('Worker error', { queue: queueName, error: err.message });
  });

  worker.on('stalled', (jobId) => {
    logger.warn('Job stalled — will be retried', { queue: queueName, jobId });
  });

  logger.info('Worker started', { queue: queueName, concurrency });
  return worker;
}
