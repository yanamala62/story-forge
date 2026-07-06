import { Router, type Request, type Response } from 'express';
import { checkDatabaseHealth } from '@storyforge/database';
import { createLogger, getEnv, checkStorageHealth } from '@storyforge/shared';
import type { HealthCheckResponse, ServiceHealth, ApiResponse } from '@storyforge/shared';
import { UploadAgentService } from '@storyforge/upload-agent';

const router = Router();
const logger = createLogger('health');
const uploadAgent = new UploadAgentService();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     description: Returns the health status of the API and all connected services
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: Service is healthy
 *       503:
 *         description: Service is unhealthy
 */
router.get('/', async (_req: Request, res: Response) => {
  const startTime = Date.now();

  const [dbHealthy, openrouterHealthy, storageHealthy, youtubeHealthy] = await Promise.allSettled([
    checkDatabase(),
    checkOpenRouter(),
    checkSupabaseStorage(),
    checkYouTube(),
  ]);

  const services: Record<string, ServiceHealth> = {
    database: resolveServiceHealth(dbHealthy),
    openrouter: resolveServiceHealth(openrouterHealthy),
    storage: resolveServiceHealth(storageHealthy),
    youtube: resolveServiceHealth(youtubeHealthy),
  };

  // Only the database is critical to overall health
  const criticalDown = services['database']?.status === 'down';
  const allCriticalUp = services['database']?.status === 'up';

  const overallStatus: HealthCheckResponse['status'] = allCriticalUp ? 'healthy' : 'degraded';

  const payload: ApiResponse<HealthCheckResponse> = {
    success: true,
    data: {
      status: overallStatus,
      version: process.env['APP_VERSION'] ?? '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      services,
    },
    timestamp: new Date().toISOString(),
    requestId: _req.requestId,
  };

  const statusCode = criticalDown ? 503 : 200;
  res.status(statusCode).json(payload);

  logger.debug('Health check completed', {
    durationMs: Date.now() - startTime,
    status: overallStatus,
  });
});

/**
 * @swagger
 * /health/ready:
 *   get:
 *     summary: Readiness check
 *     description: Returns 200 only when all critical services are ready
 *     tags: [Health]
 *     security: []
 */
router.get('/ready', async (_req: Request, res: Response) => {
  const dbOk = await checkDatabase().then(() => true).catch(() => false);

  if (dbOk) {
    res.status(200).json({ ready: true });
  } else {
    res.status(503).json({ ready: false, database: dbOk });
  }
});

/**
 * @swagger
 * /health/live:
 *   get:
 *     summary: Liveness check
 *     description: Returns 200 if the process is alive
 *     tags: [Health]
 *     security: []
 */
router.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({ alive: true, pid: process.pid });
});

async function checkDatabase(): Promise<ServiceHealth> {
  const start = Date.now();
  const healthy = await checkDatabaseHealth();
  return {
    status: healthy ? 'up' : 'down',
    latencyMs: Date.now() - start,
  };
}

function serviceHealth(
  status: ServiceHealth['status'],
  opts: { latencyMs?: number; error?: string } = {},
): ServiceHealth {
  const result: ServiceHealth = { status };
  if (opts.latencyMs !== undefined) result.latencyMs = opts.latencyMs;
  if (opts.error !== undefined) result.error = opts.error;
  return result;
}

async function checkOpenRouter(): Promise<ServiceHealth> {
  const start = Date.now();
  const env = getEnv();

  try {
    const response = await fetch('https://openrouter.ai/api/v1/key', {
      headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    const latencyMs = Date.now() - start;
    return response.ok
      ? serviceHealth('up', { latencyMs })
      : serviceHealth('down', { latencyMs, error: `HTTP ${response.status}` });
  } catch (error) {
    return serviceHealth('down', { latencyMs: Date.now() - start, error: String(error) });
  }
}

async function checkSupabaseStorage(): Promise<ServiceHealth> {
  const start = Date.now();
  const result = await checkStorageHealth();

  if (!result.ok && result.message?.startsWith('Supabase Storage not configured')) {
    return serviceHealth('unknown', { error: result.message });
  }

  const latencyMs = Date.now() - start;
  return result.ok
    ? serviceHealth('up', { latencyMs })
    : serviceHealth('down', { latencyMs, ...(result.message ? { error: result.message } : {}) });
}

async function checkYouTube(): Promise<ServiceHealth> {
  const start = Date.now();
  const result = await uploadAgent.checkYouTubeHealth();

  if (!result.configured) {
    return serviceHealth('unknown', result.message ? { error: result.message } : {});
  }

  const latencyMs = Date.now() - start;
  return result.ok
    ? serviceHealth('up', { latencyMs })
    : serviceHealth('down', { latencyMs, ...(result.message ? { error: result.message } : {}) });
}

function resolveServiceHealth(result: PromiseSettledResult<ServiceHealth>): ServiceHealth {
  if (result.status === 'fulfilled') return result.value;
  return { status: 'down', error: String(result.reason) };
}

export { router as healthRouter };
